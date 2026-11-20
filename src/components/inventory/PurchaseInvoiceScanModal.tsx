import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePos } from '../../context/PosContext';
import { Product, SupplierInvoiceItemSnapshot, UnitType } from '../../types';
import { safeParseJsonResponse } from '../../utils/aiVoice';
import { getLocalTodayYMD } from '../../utils/expenses';
import { bluetoothScanner } from '../../utils/bluetoothScanner';
import { playSound } from '../../utils/audio';
import {
  Camera,
  Upload,
  X,
  FileCheck2,
  EyeOff,
  Loader2,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  PackagePlus,
  Building2,
  Hash,
  RotateCw,
  Edit3,
  ZoomIn,
  Search,
  Flashlight,
  Focus,
  ShieldAlert,
  Code2,
  Copy
} from 'lucide-react';

export type PurchaseInvoiceMode = 'official_ice' | 'informal_noir';

export interface VisionInvoiceItem {
  barcode?: string;
  nom: string;
  quantite: number;
  prix: number;
  total: number;
}

interface ScannedLineItem {
  id: string;
  include: boolean;
  barcode: string;
  rawName: string;
  matchedProductId: string; // '' means create new catalog product
  quantity: number;
  unitCost: number;
  lineTotal: number;
  sellPrice: number;
  suggestedMarginPct?: number;
  unitType: UnitType;
  source?: 'vision' | 'manual';
}

interface ScannedInvoiceResponse {
  items?: VisionInvoiceItem[];
  invoice?: {
    supplierName?: string;
    supplierIce?: string;
    supplierPhone?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    hasOfficialMarkers?: boolean;
    isHandwritten?: boolean;
    totalAmount?: number;
    items?: VisionInvoiceItem[];
  };
  error?: string;
  code?: string;
}

const normalizeUnitType = (nameOrUnit?: string): UnitType => {
  const s = (nameOrUnit || '').toLowerCase();
  if (/\b(kg|كيلو)\b/i.test(s)) return 'kg';
  if (/\b(l|ml|cl|liter|litre|لتر)\b/i.test(s)) return 'liter';
  if (/\b(box|ctn|carton|pack|crt|صندوق|كرتون)\b/i.test(s)) return 'box';
  return 'piece';
};

/**
 * Prepares any camera or gallery invoice photo for Gemini Vision:
 * - Respects EXIF orientation (`imageOrientation: 'from-image'`)
 * - Supports optional manual rotation (0/90/180/270)
 * - Compresses cleanly up to 2200px JPEG @ 0.90 with light contrast/brightness boost so faint thermal receipt digits stay crystal clear
 * - Gently brightens severely underexposed photos (e.g. dim room / dark carpet background)
 */
const prepareInvoiceImageForVision = async (
  fileOrBlob: Blob,
  maxDim = 2200,
  quality = 0.9,
  rotationDeg: 0 | 90 | 180 | 270 = 0
): Promise<{ base64: string; dataUrl: string }> => {
  let source: CanvasImageSource;
  let srcW = 1;
  let srcH = 1;
  let closeBitmap: (() => void) | null = null;
  let revokeUrl: (() => void) | null = null;

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(fileOrBlob, {
        imageOrientation: 'from-image'
      });
      source = bitmap;
      srcW = Math.max(1, bitmap.width);
      srcH = Math.max(1, bitmap.height);
      closeBitmap = () => bitmap.close();
    } catch {
      // Fallback to HTMLImageElement below
    }
  }

  if (!closeBitmap) {
    const objectUrl = URL.createObjectURL(fileOrBlob);
    revokeUrl = () => URL.revokeObjectURL(objectUrl);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('صيغة الصورة غير مدعومة'));
      el.src = objectUrl;
    });
    source = img;
    srcW = Math.max(1, img.naturalWidth || img.width || 1);
    srcH = Math.max(1, img.naturalHeight || img.height || 1);
  }

  try {
    const rotated = rotationDeg === 90 || rotationDeg === 270;
    const orientedW = rotated ? srcH : srcW;
    const orientedH = rotated ? srcW : srcH;
    const scale = Math.min(1, maxDim / Math.max(orientedW, orientedH));
    const outW = Math.max(1, Math.round(orientedW * scale));
    const outH = Math.max(1, Math.round(orientedH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas unavailable');
    }

    ctx.save();
    ctx.translate(outW / 2, outH / 2);
    if (rotationDeg !== 0) {
      ctx.rotate((rotationDeg * Math.PI) / 180);
    }
    if ('filter' in ctx) {
      ctx.filter = 'contrast(1.22) brightness(1.06)';
    }
    const drawW = Math.round(srcW * scale);
    const drawH = Math.round(srcH * scale);
    ctx.drawImage(source!, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    // Auto-brighten only dark scenes without altering crisp normal photos
    try {
      const sampleStep = 4;
      const imgData = ctx.getImageData(0, 0, outW, outH);
      const px = imgData.data;
      let lumSum = 0;
      let samples = 0;
      for (let i = 0; i < px.length; i += 4 * sampleStep) {
        lumSum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        samples++;
      }
      const meanLum = samples > 0 ? lumSum / samples : 128;
      if (meanLum < 88) {
        const gain = Math.min(1.55, 118 / Math.max(25, meanLum));
        for (let i = 0; i < px.length; i += 4) {
          px[i] = Math.min(255, Math.round((px[i] - 12) * gain + 18));
          px[i + 1] = Math.min(255, Math.round((px[i + 1] - 12) * gain + 18));
          px[i + 2] = Math.min(255, Math.round((px[i + 2] - 12) * gain + 18));
        }
        ctx.putImageData(imgData, 0, 0);
      }
    } catch {
      // Safe no-op if pixel read fails
    }

    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
    canvas.width = 0;
    canvas.height = 0;
    return { base64, dataUrl };
  } finally {
    closeBitmap?.();
    revokeUrl?.();
  }
};

/**
 * Smart Moroccan Hanout margin heuristic for newly scanned items:
 * - Basic staples (زيت، سكر، دقيق، أتاي، قهوة): +10%
 * - Dairy / الحليبة (حليب، دانون، سنطرال، جبال، كولينور، جودة، شرقي، رايب، جبن، زبدة): +15%
 * - Hygiene / cleaning / snacks / general: +20%
 */
const suggestMoroccanMarginPercent = (itemName: string): number => {
  const s = itemName.toLowerCase();
  if (
    /(زيت|سكر|دقيق|فرينة|فينو|سميد|سميدة|اتاي|أتاي|شاي|قهوة|huile|sucre|farine|semoule|the\b|thé|cafe|café|lesieur|cristal|alhor|ounous|oued|sultan)/i.test(
      s
    )
  ) {
    return 10;
  }
  if (
    /(حليب|دانون|ياغورت|جبن|زبدة|رايب|لبن|سنطرال|جبال|كولينور|جودة|شرقي|lait|danone|centrale|jibal|colainor|jaouda|chergui|copag|yaourt|fromage|beurre|kiri|vache)/i.test(
      s
    )
  ) {
    return 15;
  }
  return 20;
};

const findBestCatalogProduct = (
  rawName: string,
  products: Product[],
  rawBarcode?: string
): Product | undefined => {
  const cleanBarcode = (rawBarcode || '').replace(/[^0-9A-Za-z-]/g, '').trim();
  if (cleanBarcode.length >= 4) {
    const byBarcode = products.find((p) => {
      const pb = (p.barcode || '').replace(/[^0-9A-Za-z-]/g, '').trim();
      return pb.length > 0 && (pb === cleanBarcode || pb.endsWith(cleanBarcode) || cleanBarcode.endsWith(pb));
    });
    if (byBarcode) return byBarcode;
  }

  const clean = rawName.trim().toLowerCase();
  if (!clean) return undefined;

  const exact = products.find(
    (p) => p.name.trim().toLowerCase() === clean || p.nameEn.trim().toLowerCase() === clean
  );
  if (exact) return exact;

  const contains = products.find(
    (p) =>
      p.name.trim().toLowerCase().includes(clean) ||
      p.nameEn.trim().toLowerCase().includes(clean) ||
      clean.includes(p.name.trim().toLowerCase()) ||
      (p.nameEn.trim().length > 2 && clean.includes(p.nameEn.trim().toLowerCase()))
  );
  if (contains) return contains;

  const tokens = clean.split(/[\s\-_/.,*]+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return undefined;

  let bestProd: Product | undefined;
  let bestScore = 0;
  for (const p of products) {
    const hay = `${p.name} ${p.nameEn}`.toLowerCase();
    const hits = tokens.filter((t) => hay.includes(t)).length;
    if (hits > bestScore && hits >= Math.min(2, tokens.length)) {
      bestScore = hits;
      bestProd = p;
    }
  }
  return bestProd;
};

export const PurchaseInvoiceScanModal: React.FC = () => {
  const {
    products,
    categories,
    adjustStock,
    addProduct,
    updateProductPurchaseCostAndRecalculateProfit,
    addSupplierInvoice,
    settings,
    currencySymbol,
    language
  } = usePos();

  const isAr = language === 'ar';
  const todayStr = getLocalTodayYMD();

  const [isOpen, setIsOpen] = useState(false);
  const [invoiceMode, setInvoiceMode] = useState<PurchaseInvoiceMode>('official_ice');

  // Camera / upload states
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [showZoomPhoto, setShowZoomPhoto] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [rotationDeg, setRotationDeg] = useState<0 | 90 | 180 | 270>(0);
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState(false);
  const [cameraPermission, setCameraPermission] = useState<
    'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported'
  >('idle');
  const [torchSupported, setTorchSupported] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [autoFocusActive, setAutoFocusActive] = useState(true);
  const [focusReticle, setFocusReticle] = useState<{ x: number; y: number } | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [completedMessage, setCompletedMessage] = useState<string | null>(null);
  const [quickCatalogQuery, setQuickCatalogQuery] = useState('');

  // Invoice metadata fields
  const [supplierName, setSupplierName] = useState('');
  const [supplierIce, setSupplierIce] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayStr);
  const [paidAmount, setPaidAmount] = useState('');
  const [items, setItems] = useState<ScannedLineItem[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastCapturedBlobRef = useRef<Blob | null>(null);
  const phoneCameraInputRef = useRef<HTMLInputElement | null>(null);
  const itemsTableRef = useRef<HTMLDivElement | null>(null);
  const firstRowInputRef = useRef<HTMLInputElement | null>(null);
  const focusTimerRef = useRef<number | null>(null);
  const visionAbortRef = useRef<AbortController | null>(null);

  const stopCameraStream = () => {
    if (visionAbortRef.current) {
      visionAbortRef.current.abort();
      visionAbortRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.applyConstraints?.({ advanced: [{ torch: false } as MediaTrackConstraintSet] }).catch(
            () => {}
          );
        } catch {
          // ignore
        }
        t.stop();
      });
      streamRef.current = null;
    }
    setFlashOn(false);
    setTorchSupported(false);
    setIsLiveCameraOpen(false);
  };

  const resetFormState = (mode: PurchaseInvoiceMode = 'official_ice') => {
    stopCameraStream();
    lastCapturedBlobRef.current = null;
    setInvoiceMode(mode);
    setPreviewDataUrl(null);
    setShowZoomPhoto(false);
    setShowRawJson(false);
    setRotationDeg(0);
    setCameraPermission('idle');
    setIsScanning(false);
    setScanError(null);
    setScanNotice(null);
    setCompletedMessage(null);
    setQuickCatalogQuery('');
    setSupplierName('');
    setSupplierIce('');
    setSupplierPhone('');
    setInvoiceNumber('');
    setInvoiceDate(getLocalTodayYMD());
    setPaidAmount('');
    setItems([]);
  };

  useEffect(() => {
    const handleOpen = (evt: Event) => {
      const detail = (evt as CustomEvent<{ defaultMode?: PurchaseInvoiceMode }>).detail;
      resetFormState(detail?.defaultMode || 'official_ice');
      setIsOpen(true);
      // Immediately ask for Camera permission & open fast camera on first open
      window.setTimeout(() => {
        void startLiveCamera();
      }, 60);
    };
    window.addEventListener('kadi:open-purchase-invoice-scanner', handleOpen);
    return () => {
      window.removeEventListener('kadi:open-purchase-invoice-scanner', handleOpen);
      stopCameraStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeModal = () => {
    stopCameraStream();
    bluetoothScanner.popScope('purchase_invoice');
    setIsOpen(false);
  };

  // Priority Bluetooth HID scanner integration while Invoice Scan Modal is open
  useEffect(() => {
    if (!isOpen) {
      bluetoothScanner.popScope('purchase_invoice');
      return;
    }

    bluetoothScanner.pushScope('purchase_invoice');

    const unsubScan = bluetoothScanner.onScan((payload) => {
      if (bluetoothScanner.getActiveScope() !== 'purchase_invoice') return;
      const clean = payload.barcode.trim();
      const matched = products.find(
        (p) => p.barcode === clean || p.sku.toLowerCase() === clean.toLowerCase()
      );

      if (matched) {
        if (settings.bluetoothSoundFeedback !== false) playSound('beep');
        quickAddCatalogProduct(matched);
        setScanError(null);
        setScanNotice(
          isAr
            ? `🔊 بيب! تزادت للفاتورة بالقارئ: ${matched.name}`
            : `🔊 Scanned into invoice: ${matched.name}`
        );
        window.setTimeout(() => {
          itemsTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 60);
      } else {
        playSound('error');
        window.dispatchEvent(
          new CustomEvent('kadi:open-quick-new-barcode', {
            detail: { barcode: clean, sourceContext: 'invoice' }
          })
        );
      }
    });

    const handleQuickCreated = (evt: Event) => {
      const detail = (evt as CustomEvent<{
        product?: Product;
        sourceContext?: string;
      }>).detail;
      if (detail?.sourceContext !== 'invoice' || !detail.product) return;
      quickAddCatalogProduct(detail.product);
      setScanError(null);
      setScanNotice(
        isAr
          ? `✅ تسجلات "${detail.product.name}" وتحفظ الباركود + تزادت للفاتورة!`
          : `✅ Saved "${detail.product.name}" & added to invoice!`
      );
      window.setTimeout(() => {
        itemsTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
    };

    window.addEventListener('kadi:quick-barcode-product-created', handleQuickCreated);
    return () => {
      unsubScan();
      window.removeEventListener('kadi:quick-barcode-product-created', handleQuickCreated);
      bluetoothScanner.popScope('purchase_invoice');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, products, settings.bluetoothSoundFeedback, isAr]);

  const computedItemsTotal = useMemo(
    () =>
      Number(
        items
          .filter((it) => it.include && (it.rawName.trim() || it.matchedProductId))
          .reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitCost) || 0), 0)
          .toFixed(2)
      ),
    [items]
  );

  const activeItemsCount = useMemo(
    () =>
      items.filter(
        (it) => it.include && (it.rawName.trim() || it.matchedProductId) && Number(it.quantity) > 0
      ).length,
    [items]
  );

  const filteredQuickProducts = useMemo(() => {
    const q = quickCatalogQuery.trim().toLowerCase();
    const list = q
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.nameEn.toLowerCase().includes(q) ||
            p.barcode.includes(q)
        )
      : products;
    return list.slice(0, 12);
  }, [products, quickCatalogQuery]);

  const buildEmptyManualRow = (): ScannedLineItem => ({
    id: `man-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    include: true,
    barcode: '',
    rawName: '',
    matchedProductId: '',
    quantity: 1,
    unitCost: 0,
    lineTotal: 0,
    sellPrice: 0,
    suggestedMarginPct: 20,
    unitType: 'piece',
    source: 'manual'
  });

  const addManualLineAndFocus = () => {
    setItems((prev) => [...prev, buildEmptyManualRow()]);
    window.setTimeout(() => {
      itemsTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstRowInputRef.current?.focus();
    }, 80);
  };

  const quickAddCatalogProduct = (prod: Product) => {
    setItems((prev) => {
      const existingIdx = prev.findIndex((it) => it.matchedProductId === prod.id);
      if (existingIdx !== -1) {
        return prev.map((it, idx) =>
          idx === existingIdx
            ? { ...it, include: true, quantity: Number((it.quantity + 1).toFixed(2)) }
            : it
        );
      }
      // Replace blank unedited manual row if present
      const cleanPrev = prev.filter(
        (it) => it.rawName.trim() !== '' || it.matchedProductId !== '' || it.unitCost > 0
      );
      return [
        ...cleanPrev,
        {
          id: `cat-${prod.id}-${Date.now()}`,
          include: true,
          barcode: prod.barcode || '',
          rawName: prod.name,
          matchedProductId: prod.id,
          quantity: 1,
          unitCost: prod.costPrice,
          lineTotal: Number(prod.costPrice.toFixed(2)),
          sellPrice: prod.price,
          unitType: prod.unitType,
          source: 'manual'
        }
      ];
    });
  };

  /**
   * Meta AI-style Gemini Vision Pipeline:
   * - Accepts ANY Moroccan invoice (Atacadao, Marjane, Carrefour, Bim, Metro, wholesale, handwritten bons)
   * - No white table or straight paper required — reads full scene even if tilted, wrinkled, or on a carpet
   * - Extracts clean JSON: [{"nom": "...", "quantite": 0, "prix": 0, "total": 0}]
   */
  const analyzeImageBlob = async (
    blob: Blob,
    nextRotation: 0 | 90 | 180 | 270 = rotationDeg
  ) => {
    lastCapturedBlobRef.current = blob;
    setScanError(null);
    setScanNotice(null);
    setCompletedMessage(null);
    setIsScanning(true);

    if (visionAbortRef.current) {
      visionAbortRef.current.abort();
    }
    const controller = new AbortController();
    visionAbortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 45000);

    try {
      const { base64, dataUrl } = await prepareInvoiceImageForVision(blob, 2200, 0.9, nextRotation);
      setPreviewDataUrl(dataUrl);

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setScanError(
          isAr
            ? 'ما كاينش أنترنت دابا باش Gemini Vision يقرا التصويرة. شغّل الأنترنت واضغط "حاول مرة أخرى" أو دخّل يدوياً.'
            : 'No internet connection for Gemini Vision. Reconnect and retry, or enter manually.'
        );
        setIsScanning(false);
        return;
      }

      const res = await fetch('/api/ai/scan-purchase-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: 'image/jpeg'
        })
      });

      const parsed = await safeParseJsonResponse<ScannedInvoiceResponse | VisionInvoiceItem[]>(res);
      if (controller.signal.aborted) return;

      if (!res.ok || parsed.isNonJson || !parsed.data) {
        const errPayload = !Array.isArray(parsed.data) ? parsed.data?.error : undefined;
        setScanError(
          errPayload ||
            (isAr
              ? 'ما قراش مزيان. عاود صورها قريبة، من الفوق، فالضو — أو دخّل يدوياً.'
              : 'Could not read invoice — retake close-up in good light, or enter manually.')
        );
        setIsScanning(false);
        return;
      }

      const payload = parsed.data;
      const visionItems: VisionInvoiceItem[] = Array.isArray(payload)
        ? payload
        : payload.items || payload.invoice?.items || [];

      if (!Array.isArray(payload) && payload.invoice) {
        const inv = payload.invoice;
        const extractedIce = (inv.supplierIce || '').replace(/\s+/g, '').trim();
        if (inv.supplierName) setSupplierName(inv.supplierName.trim());
        if (inv.supplierPhone) setSupplierPhone(inv.supplierPhone.trim());
        if (extractedIce) setSupplierIce(extractedIce);
        if (inv.invoiceNumber) setInvoiceNumber(inv.invoiceNumber.trim());
        if (inv.invoiceDate && /^\d{4}-\d{2}-\d{2}$/.test(inv.invoiceDate)) {
          setInvoiceDate(inv.invoiceDate);
        }
        if (invoiceMode !== 'informal_noir' && (extractedIce || inv.hasOfficialMarkers)) {
          setInvoiceMode('official_ice');
        }
      }

      if (visionItems.length === 0) {
        setScanError(
          isAr
            ? 'ما قراش السلع واضحين. عاود صور الفاتورة قريبة، من الفوق، فالضو — ولا اضغط "دخل يدوياً".'
            : 'No invoice items detected — capture closer from above in good light, or enter manually.'
        );
        setIsScanning(false);
        return;
      }

      const extractedRows: ScannedLineItem[] = visionItems.map((raw, idx) => {
        const name = String(raw.nom || '').trim();
        const barcode = String(raw.barcode || '')
          .replace(/[^0-9A-Za-z-]/g, '')
          .trim();
        const qty = Math.max(0.01, Number(raw.quantite) || 1);
        const rawPrix = Number(raw.prix);
        const rawTotal = Number(raw.total);
        const matched = findBestCatalogProduct(name, products, barcode);

        const unitCost =
          Number.isFinite(rawPrix) && rawPrix > 0
            ? rawPrix
            : Number.isFinite(rawTotal) && rawTotal > 0
            ? rawTotal / qty
            : matched
            ? matched.costPrice
            : 0;

        const lineTotal =
          Number.isFinite(rawTotal) && rawTotal > 0
            ? rawTotal
            : Number((qty * unitCost).toFixed(2));

        const marginPct = suggestMoroccanMarginPercent(name);
        const suggestedSell = matched
          ? matched.price
          : unitCost > 0
          ? Number((unitCost * (1 + marginPct / 100)).toFixed(2))
          : 0;

        return {
          id: `vision-${Date.now()}-${idx}`,
          include: true,
          barcode: barcode || matched?.barcode || '',
          rawName: name,
          matchedProductId: matched?.id || '',
          quantity: Number(qty.toFixed(3)),
          unitCost: Number(Math.max(0, unitCost).toFixed(2)),
          lineTotal: Number(Math.max(0, lineTotal).toFixed(2)),
          sellPrice: suggestedSell,
          suggestedMarginPct: matched ? undefined : marginPct,
          unitType: matched ? matched.unitType : normalizeUnitType(name),
          source: 'vision'
        };
      });

      setItems(extractedRows);
      setScanNotice(
        isAr
          ? `✅ قرا Gemini Vision التصويرة كاملة وجبد ${extractedRows.length} سلع (الإسم + الكمية + ثمن الوحدة + المجموع).`
          : `✅ Gemini Vision extracted ${extractedRows.length} items from full invoice.`
      );
      if (settings.enableSoundEffects) playSound('success');
      setIsScanning(false);
    } catch (err) {
      if (controller.signal.aborted) {
        setScanError(
          isAr
            ? 'طالت عملية القراءة بزاف — حاول مرة أخرى أو دخّل يدوياً.'
            : 'Scan timed out — please retry or enter manually.'
        );
      } else {
        setScanError(
          err instanceof Error && err.message
            ? err.message
            : isAr
            ? 'وقع مشكل أثناء قراءة التصويرة — حاول مرة أخرى أو دخّل يدوياً.'
            : 'Error reading invoice — please retry or enter manually.'
        );
      }
      setIsScanning(false);
    } finally {
      window.clearTimeout(timeoutId);
      if (visionAbortRef.current === controller) {
        visionAbortRef.current = null;
      }
    }
  };

  const handleRetryScan = () => {
    if (!lastCapturedBlobRef.current) return;
    void analyzeImageBlob(lastCapturedBlobRef.current, rotationDeg);
  };

  const handleRotateAndRescan = () => {
    if (!lastCapturedBlobRef.current) return;
    const next = (((rotationDeg + 90) % 360) as 0 | 90 | 180 | 270);
    setRotationDeg(next);
    void analyzeImageBlob(lastCapturedBlobRef.current, next);
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCameraStream();
    setRotationDeg(0);
    void analyzeImageBlob(file, 0);
    e.target.value = '';
  };

  const applyCameraFocusAndTorch = async (
    track: MediaStreamTrack | undefined,
    opts: { focusPulse?: boolean; nextFlash?: boolean } = {}
  ) => {
    if (!track || !track.applyConstraints) return;
    const advanced: MediaTrackConstraintSet[] = [];
    if (opts.focusPulse) {
      advanced.push({ focusMode: 'single-shot' } as unknown as MediaTrackConstraintSet);
    } else if (autoFocusActive) {
      advanced.push({ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet);
    }
    if (typeof opts.nextFlash === 'boolean' && torchSupported) {
      advanced.push({ torch: opts.nextFlash } as unknown as MediaTrackConstraintSet);
    }
    if (advanced.length > 0) {
      try {
        await track.applyConstraints({ advanced });
      } catch {
        // Device does not support requested advanced constraint cleanly
      }
    }
    if (opts.focusPulse && autoFocusActive) {
      window.setTimeout(() => {
        track
          .applyConstraints?.({
            advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet]
          })
          .catch(() => {});
      }, 650);
    }
  };

  const startLiveCamera = async () => {
    setScanError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraPermission('unsupported');
      return;
    }

    stopCameraStream();
    setCameraPermission('requesting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      streamRef.current = stream;
      setCameraPermission('granted');
      setIsLiveCameraOpen(true);

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const caps = videoTrack.getCapabilities?.() as { torch?: boolean; focusMode?: string[] } | undefined;
          setTorchSupported(Boolean(caps?.torch));
        } catch {
          setTorchSupported(false);
        }
        void applyCameraFocusAndTorch(videoTrack);
      }

      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      }, 30);
    } catch {
      setCameraPermission('denied');
      setIsLiveCameraOpen(false);
    }
  };

  const handleToggleFlash = async () => {
    const next = !flashOn;
    setFlashOn(next);
    const track = streamRef.current?.getVideoTracks()[0];
    if (track && torchSupported) {
      await applyCameraFocusAndTorch(track, { nextFlash: next });
    }
  };

  const triggerManualAutoFocus = async (evt?: React.MouseEvent<HTMLDivElement>) => {
    if (evt) {
      const rect = evt.currentTarget.getBoundingClientRect();
      const x = Math.round(((evt.clientX - rect.left) / Math.max(1, rect.width)) * 100);
      const y = Math.round(((evt.clientY - rect.top) / Math.max(1, rect.height)) * 100);
      setFocusReticle({ x, y });
    } else {
      setFocusReticle({ x: 50, y: 50 });
    }
    setAutoFocusActive(true);
    if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current);
    focusTimerRef.current = window.setTimeout(() => setFocusReticle(null), 950);

    const track = streamRef.current?.getVideoTracks()[0];
    await applyCameraFocusAndTorch(track, { focusPulse: true });
  };

  const captureLiveFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    // Scale cleanly up to 2200px JPEG so small receipt numbers stay crystal clear for Gemini Vision
    const maxDim = 2200;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(1, Math.round(video.videoWidth * scale));
    const h = Math.max(1, Math.round(video.videoHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        canvas.width = 0;
        canvas.height = 0;
        stopCameraStream();
        setRotationDeg(0);
        if (blob) void analyzeImageBlob(blob, 0);
      },
      'image/jpeg',
      0.9
    );
  };

  const updateLine = (id: string, patch: Partial<ScannedLineItem>) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const merged = { ...it, ...patch };
        if (patch.lineTotal !== undefined && patch.unitCost === undefined) {
          const q = Math.max(0.01, Number(merged.quantity) || 1);
          merged.unitCost = Number((Math.max(0, Number(patch.lineTotal) || 0) / q).toFixed(2));
        } else if (patch.quantity !== undefined || patch.unitCost !== undefined) {
          merged.lineTotal = Number(
            ((Number(merged.quantity) || 0) * (Number(merged.unitCost) || 0)).toFixed(2)
          );
        }
        return merged;
      })
    );
  };

  const handleSelectCatalogMatch = (lineId: string, productId: string) => {
    const prod = products.find((p) => p.id === productId);
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== lineId) return it;
        if (!prod) {
          return { ...it, matchedProductId: '' };
        }
        const cost = it.unitCost > 0 ? it.unitCost : prod.costPrice;
        return {
          ...it,
          matchedProductId: prod.id,
          barcode: it.barcode || prod.barcode || '',
          rawName: prod.name,
          unitCost: cost,
          lineTotal: Number((it.quantity * cost).toFixed(2)),
          sellPrice: prod.price,
          suggestedMarginPct: undefined,
          unitType: prod.unitType
        };
      })
    );
  };

  const extractedJsonList: VisionInvoiceItem[] = useMemo(
    () =>
      items
        .filter((it) => it.include && (it.rawName.trim() || it.matchedProductId))
        .map((it) => ({
          ...(it.barcode.trim() ? { barcode: it.barcode.trim() } : {}),
          nom: it.rawName.trim(),
          quantite: Number(it.quantity) || 0,
          prix: Number(it.unitCost) || 0,
          total: Number((it.lineTotal ?? it.quantity * it.unitCost).toFixed(2))
        })),
    [items]
  );

  const handleConfirmRestock = (e: React.FormEvent) => {
    e.preventDefault();
    setScanError(null);

    const activeRows = items.filter(
      (it) => it.include && (it.rawName.trim() || it.matchedProductId) && Number(it.quantity) > 0
    );

    if (activeRows.length === 0) {
      setScanError(
        isAr
          ? 'زيد أو اختار سلعة واحدة على الأقل (واكتب إسمها ولا اختارها من المخزون) باش نزيدوها.'
          : 'Select or add at least one item to add to inventory.'
      );
      return;
    }

    if (invoiceMode === 'official_ice' && !supplierName.trim()) {
      setScanError(
        isAr
          ? 'للفاتورة الرسمية، كتب إسم المورد أو الشركة الفوق.'
          : 'Please enter supplier name for official invoice archiving.'
      );
      return;
    }

    if (invoiceMode !== 'informal_noir') {
      const missingSell = activeRows.find((r) => !r.matchedProductId && !(Number(r.sellPrice) > 0));
      if (missingSell) {
        setScanError(
          isAr
            ? `باقي ما عمرتي ثمن البيع ديال: ${missingSell.rawName || 'سلعة جديدة'}`
            : `Please fill in sell price for: ${missingSell.rawName || 'new item'}`
        );
        return;
      }
    }

    let updatedExistingCount = 0;
    let createdNewCount = 0;
    const summarySnapshot: SupplierInvoiceItemSnapshot[] = [];

    const cleanInvNum =
      invoiceMode === 'official_ice'
        ? invoiceNumber.trim() || `INV-${Date.now().toString().slice(-5)}`
        : '';

    const restockReason =
      invoiceMode === 'official_ice'
        ? isAr
          ? `فاتورة شراء رسمية #${cleanInvNum}${supplierIce.trim() ? ` (ICE: ${supplierIce.trim()})` : ''}`
          : `Official purchase invoice #${cleanInvNum}`
        : isAr
        ? 'توريد للمخزون (بوار / نوار - بدون أرقام)'
        : 'Stock intake (no archive)';

    activeRows.forEach((row, index) => {
      const qty = Math.max(0.01, Number(row.quantity) || 1);
      const unitCost = Math.max(0, Number(row.unitCost) || 0);
      const sellPrice = Math.max(unitCost, Number(row.sellPrice) || unitCost || 1);
      const existing = row.matchedProductId
        ? products.find((p) => p.id === row.matchedProductId)
        : undefined;

      if (existing) {
        adjustStock(existing.id, qty, restockReason, 'restock');
        if (unitCost > 0 && Math.abs(unitCost - existing.costPrice) > 0.001) {
          updateProductPurchaseCostAndRecalculateProfit(existing.id, unitCost);
        }
        updatedExistingCount += 1;
        summarySnapshot.push({
          productName: existing.name,
          quantity: qty,
          unitCost,
          unitType: existing.unitType
        });
      } else {
        const cleanName = row.rawName.trim() || `${isAr ? 'سلعة جديدة' : 'New Item'} #${index + 1}`;
        const cleanBarcode = row.barcode.trim();
        const skuCode = cleanBarcode || `SC-${Date.now().toString().slice(-5)}-${index + 1}`;
        addProduct({
          name: cleanName,
          nameEn: cleanName,
          sku: skuCode,
          barcode: cleanBarcode,
          categoryId: categories[0]?.id || 'cat-1',
          price: Number(sellPrice.toFixed(2)),
          costPrice: Number(unitCost.toFixed(2)),
          stock: qty,
          lowStockThreshold: Math.max(2, Math.round(qty * 0.2)),
          unitType: row.unitType
        });
        createdNewCount += 1;
        summarySnapshot.push({
          productName: cleanName,
          quantity: qty,
          unitCost,
          unitType: row.unitType
        });
      }
    });

    if (invoiceMode === 'official_ice') {
      const totalVal = computedItemsTotal > 0 ? computedItemsTotal : Math.max(0, Number(paidAmount) || 0);
      const paidVal =
        paidAmount.trim() === ''
          ? totalVal
          : Math.min(totalVal, Math.max(0, Number(paidAmount) || 0));

      addSupplierInvoice({
        supplierName: supplierName.trim(),
        supplierPhone: supplierPhone.trim() || undefined,
        supplierIce: supplierIce.trim() || undefined,
        invoiceType: 'official_ice',
        invoiceNumber: cleanInvNum,
        date: invoiceDate || todayStr,
        totalAmount: totalVal,
        paidAmount: paidVal,
        itemsCount: activeRows.length,
        itemsSummary: summarySnapshot,
        scannedViaCamera: true,
        notes: isAr
          ? `أرشيف رسمي (${activeRows.length} سلع)${
              supplierIce.trim() ? ` · ICE: ${supplierIce.trim()}` : ''
            }`
          : `Official ICE archive (${activeRows.length} items)`
      });
    }

    const doneText =
      invoiceMode === 'official_ice'
        ? isAr
          ? `✅ تزادو السلع للمخزون (${updatedExistingCount} محدثة، ${createdNewCount} جديدة) وتسجلات الفاتورة في أرشيف ICE!`
          : `✅ Stock updated (${updatedExistingCount + createdNewCount} items) & archived with ICE!`
        : isAr
        ? `✅ تزادت الكميات فـ المخزون (${updatedExistingCount} محدثة، ${createdNewCount} جديدة) فـ وضع نوار/بوار بلا تسجيل أرقام.`
        : `✅ Stock updated (${updatedExistingCount + createdNewCount} items) in Stock-Only mode (no archive).`;

    setCompletedMessage(doneText);
    window.dispatchEvent(
      new CustomEvent('kadi:purchase-invoice-completed', {
        detail: { message: doneText, mode: invoiceMode }
      })
    );

    window.setTimeout(() => {
      closeModal();
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                  {isAr
                    ? 'قراءة أي فاتورة بـ Gemini Vision (بحال Meta AI)'
                    : 'Scan Any Invoice with Gemini Vision'}
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-[10px] font-black">
                  <Sparkles className="w-3 h-3" />
                  <span>Gemini Vision</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {isAr
                  ? 'أتقداو (ATACADAO)، الحليبة (سنطرال، دانون، جبال، كولينور)، جملة، بون — باقتراح هامش الربح تلقائياً'
                  : 'Atacadao, Dairy (Centrale/Danone/Jibal/Colainor), wholesale, bons — with smart margin suggestions'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            title={isAr ? 'سد' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleConfirmRestock} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* 1. INVOICE TYPE SELECTOR */}
          <div className="space-y-2">
            <label className="block text-xs font-black text-slate-700 dark:text-slate-300">
              {isAr ? '1. اختار كيفاش بغيتي تدخل السلعة:' : '1. Choose Invoice Handling Mode:'}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setInvoiceMode('official_ice')}
                className={`p-3.5 rounded-2xl border text-start transition-colors flex items-start gap-3 ${
                  invoiceMode === 'official_ice'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 ring-2 ring-emerald-500/20'
                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    invoiceMode === 'official_ice'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-black text-slate-900 dark:text-white">
                    {isAr ? 'فاتورة رسمية (فيها ICE)' : 'Official Invoice (With ICE)'}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                    {isAr
                      ? 'كتسجل في أرشيف الموردين + كتزيد السلع للمخزون'
                      : 'Archived in official supplier ledger + adds items to stock'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setInvoiceMode('informal_noir')}
                className={`p-3.5 rounded-2xl border text-start transition-colors flex items-start gap-3 ${
                  invoiceMode === 'informal_noir'
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/20'
                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    invoiceMode === 'informal_noir'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <EyeOff className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-black text-slate-900 dark:text-white">
                    {isAr ? 'نوار / بوار (بدون أرقام)' : 'Stock-Only / Noir (No Numbers)'}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                    {isAr
                      ? 'غير الكميات نيشان للمخزون بلا ICE وبلا أرشيف (خدامة حتى بلا AI)'
                      : 'Inventory quantities only — works cleanly even without AI or prices'}
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* 2. CAPTURE OR UPLOAD INVOICE PHOTO */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>
                  {isAr
                    ? '2. صور أي فاتورة (أتقداو، مرجان، جملة، بون — واخا مايلة ولا فوق زربية):'
                    : '2. Snap or Upload Any Invoice Image:'}
                </span>
              </span>

              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-black flex items-center gap-2 transition-colors whitespace-nowrap">
                  <Camera className="w-4 h-4" />
                  <span>{isAr ? 'تصوير بالتيليفون' : 'Phone Camera'}</span>
                  <input
                    ref={phoneCameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileSelected}
                    className="hidden"
                  />
                </label>

                <label className="cursor-pointer px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isAr ? 'اختار تصويرة' : 'Upload Photo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelected}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => (isLiveCameraOpen ? stopCameraStream() : void startLiveCamera())}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>
                    {isLiveCameraOpen
                      ? isAr
                        ? 'حبّس الكاميرا'
                        : 'Stop Cam'
                      : isAr
                      ? 'كاميرا مباشرة'
                      : 'Live Camera'}
                  </span>
                </button>
              </div>
            </div>

            {/* Permission Request / Denied Card with prominent 'سمح للكاميرا' button */}
            {cameraPermission === 'requesting' && !isLiveCameraOpen && (
              <div className="p-4 rounded-xl bg-slate-900 text-white flex items-center justify-center gap-2.5 text-xs font-bold">
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span>
                  {isAr ? 'جاري طلب إذن الكاميرا وفتح العدسة...' : 'Requesting camera permission...'}
                </span>
              </div>
            )}

            {cameraPermission === 'denied' && !isLiveCameraOpen && (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200">
                  <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-black">
                      {isAr
                        ? 'إذن الكاميرا مرفوض أو مسدود دابا'
                        : 'Camera permission was denied'}
                    </div>
                    <div className="text-[11px] opacity-85 mt-0.5">
                      {isAr
                        ? 'اضغط على "سمح للكاميرا" باش تعاود تفتحها، ولا صور بتطبيق التيليفون.'
                        : 'Click "Allow Camera" to grant permission or use Phone Camera.'}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void startLiveCamera()}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{isAr ? 'سمح للكاميرا' : 'Allow Camera'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => phoneCameraInputRef.current?.click()}
                    className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-xs font-bold text-slate-800 dark:text-slate-200"
                  >
                    {isAr ? 'كاميرا التيليفون' : 'Phone Cam'}
                  </button>
                </div>
              </div>
            )}

            {isLiveCameraOpen && (
              <div
                onClick={(e) => void triggerManualAutoFocus(e)}
                className="rounded-xl overflow-hidden bg-black relative select-none cursor-crosshair border border-slate-700"
              >
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full max-h-72 object-cover"
                />

                {/* Screen Fill-Light Flash Assist overlay when hardware LED flash isn't present */}
                {flashOn && !torchSupported && (
                  <div className="absolute inset-0 bg-white/30 pointer-events-none mix-blend-screen" />
                )}

                {/* Subtle top hint: no white table or straight paper required */}
                <div className="absolute bottom-14 inset-x-3 flex justify-center pointer-events-none">
                  <span className="px-3 py-1 rounded-full bg-slate-950/75 text-amber-300 text-[11px] font-bold backdrop-blur-xs">
                    {isAr
                      ? 'صور أي فاتورة كيفما كانت — وخا مايلة، مكمشة، ولا فوق زربية'
                      : 'Snap any invoice — no straight paper or white table needed'}
                  </span>
                </div>

                {/* Tap-to-focus Reticle */}
                {focusReticle && (
                  <div
                    style={{ left: `${focusReticle.x}%`, top: `${focusReticle.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-xl border-2 border-emerald-400 shadow-[0_0_0_2px_rgba(0,0,0,0.4)] pointer-events-none transition-transform"
                  />
                )}

                {/* Top Camera Overlay: Flash & Auto-Focus */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-2.5 inset-x-2.5 flex flex-wrap items-center justify-between gap-2"
                >
                  <button
                    type="button"
                    onClick={() => void handleToggleFlash()}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1.5 backdrop-blur-xs transition-colors ${
                      flashOn
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-950/75 text-white hover:bg-slate-900'
                    }`}
                  >
                    <Flashlight className="w-3.5 h-3.5" />
                    <span>
                      {flashOn
                        ? isAr
                          ? 'فلاش شاعل'
                          : 'Flash ON'
                        : isAr
                        ? 'فلاش'
                        : 'Flash'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void triggerManualAutoFocus()}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1.5 backdrop-blur-xs transition-colors ${
                      autoFocusActive
                        ? 'bg-emerald-600/90 text-white hover:bg-emerald-600'
                        : 'bg-slate-950/75 text-white hover:bg-slate-900'
                    }`}
                  >
                    <Focus className="w-3.5 h-3.5" />
                    <span>{isAr ? 'تركيز تلقائي' : 'Auto-Focus'}</span>
                  </button>
                </div>

                {/* Bottom Shutter Bar */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="p-3 bg-slate-950/90 flex items-center justify-center gap-3"
                >
                  <button
                    type="button"
                    onClick={captureLiveFrame}
                    className="px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-black flex items-center gap-2 shadow-lg"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{isAr ? 'صور وقرا بـ Gemini Vision' : 'Capture & Read Invoice'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopCameraStream}
                    className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
                  >
                    {isAr ? 'سد' : 'Close'}
                  </button>
                </div>
              </div>
            )}

            {isScanning && (
              <div className="py-5 flex flex-col items-center justify-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>
                  {isAr
                    ? 'Gemini Vision كيقرا التصويرة كاملة (وخا مايلة ولا فوق زربية)...'
                    : 'Gemini Vision is analyzing the full invoice image...'}
                </span>
              </div>
            )}

            {previewDataUrl && !isLiveCameraOpen && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowZoomPhoto((v) => !v)}
                    className="relative group shrink-0"
                    title={isAr ? 'تكبير التصويرة لمراجعة الأرقام' : 'Zoom photo'}
                  >
                    <img
                      src={previewDataUrl}
                      alt={isAr ? 'تصويرة الفاتورة' : 'Invoice preview'}
                      className="w-16 h-16 rounded-xl object-cover border border-slate-300 dark:border-slate-700"
                    />
                    <span className="absolute bottom-1 end-1 w-5 h-5 rounded-md bg-slate-900/80 text-white flex items-center justify-center">
                      <ZoomIn className="w-3 h-3" />
                    </span>
                  </button>
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>{isAr ? 'التصويرة واجدة' : 'Photo Ready'}</span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-black">
                        Gemini Vision
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {isAr
                        ? 'كليكي على التصويرة باش تكبّرها أو دوّرها إلى بغيتي.'
                        : 'Click thumbnail to zoom or rotate.'}
                    </div>
                  </div>
                </div>

                {lastCapturedBlobRef.current && !isScanning && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void startLiveCamera()}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-[11px] font-black text-white flex items-center gap-1"
                    >
                      <Camera className="w-3 h-3" />
                      <span>{isAr ? 'عاود صور' : 'Retake'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRetryScan}
                      className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1"
                    >
                      <RotateCw className="w-3 h-3 text-amber-600" />
                      <span>{isAr ? 'حاول مرة أخرى' : 'Retry'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRotateAndRescan}
                      className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1"
                    >
                      <RotateCw className="w-3 h-3" />
                      <span>{isAr ? 'تدوير 90°' : 'Rotate 90°'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {showZoomPhoto && previewDataUrl && (
              <div className="rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-950 p-2 relative">
                <button
                  type="button"
                  onClick={() => setShowZoomPhoto(false)}
                  className="absolute top-3 end-3 px-2.5 py-1 rounded-lg bg-slate-900/90 text-white text-[11px] font-bold flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إغلاق التكبير' : 'Close Zoom'}</span>
                </button>
                <img
                  src={previewDataUrl}
                  alt="Zoomed invoice"
                  className="w-full max-h-80 object-contain rounded-xl mx-auto"
                />
              </div>
            )}
          </div>

          {scanError && (
            <div className="p-4 rounded-2xl border bg-rose-50 dark:bg-rose-950/45 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 space-y-2.5">
              <div className="flex items-start gap-2.5 text-xs font-black">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{scanError}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {lastCapturedBlobRef.current && (
                  <button
                    type="button"
                    onClick={handleRetryScan}
                    className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-black flex items-center gap-1.5"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>{isAr ? 'حاول مرة أخرى' : 'Try Again'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={addManualLineAndFocus}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-black flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isAr ? 'دخل يدوياً' : 'Enter Manually'}</span>
                </button>
              </div>
            </div>
          )}

          {scanNotice && (
            <div className="px-4 py-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-bold flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{scanNotice}</span>
              </div>
              {extractedJsonList.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowRawJson((v) => !v)}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-[11px] font-black text-emerald-700 dark:text-emerald-300 flex items-center gap-1"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>{showRawJson ? (isAr ? 'إخفاء JSON' : 'Hide JSON') : 'JSON'}</span>
                </button>
              )}
            </div>
          )}

          {showRawJson && extractedJsonList.length > 0 && (
            <div className="rounded-2xl bg-slate-950 text-emerald-300 border border-slate-800 p-3 space-y-2" dir="ltr">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-mono font-bold">
                  [{`{"nom": "...", "quantite": 0, "prix": 0, "total": 0}`}]
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(JSON.stringify(extractedJsonList, null, 2));
                  }}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-bold flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy JSON</span>
                </button>
              </div>
              <pre className="text-[11px] font-mono overflow-x-auto max-h-44 leading-relaxed">
                {JSON.stringify(extractedJsonList, null, 2)}
              </pre>
            </div>
          )}

          {completedMessage && (
            <div className="px-4 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-400 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 text-xs font-black flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{completedMessage}</span>
            </div>
          )}

          {/* 3. OFFICIAL ICE METADATA VS NOIR STOCK-ONLY BANNER */}
          {invoiceMode === 'official_ice' ? (
            <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/70 space-y-3">
              <div className="text-xs font-black text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <span>
                  {isAr
                    ? 'بيانات الأرشيف الرسمي (ICE والفاتورة)'
                    : 'Official Invoice Archive Details (ICE)'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                <div className="lg:col-span-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'إسم المورد / الشركة *' : 'Supplier Name *'}
                  </label>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder={isAr ? 'مثال: شركة التوزيع...' : 'Supplier company'}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'رقم ICE (15 رقم)' : 'ICE Number'}
                  </label>
                  <div className="relative">
                    <Hash className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={supplierIce}
                      onChange={(e) => setSupplierIce(e.target.value)}
                      placeholder="001234567000089"
                      className="w-full ps-8 pe-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'رقم الفاتورة' : 'Invoice #'}
                  </label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="FA-2026-001"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'التاريخ' : 'Date'}
                  </label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
                <div className="flex items-center gap-2">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? `الخلاص المؤدى (${currencySymbol}):` : `Paid (${currencySymbol}):`}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    placeholder={String(computedItemsTotal)}
                    className="w-28 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold text-slate-900 dark:text-white"
                  />
                  <span className="text-[11px] text-slate-500">
                    {isAr ? '(خليه خاوي إلا خلصتي كلشي)' : '(Blank = fully paid)'}
                  </span>
                </div>

                <div className="font-mono font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                  {isAr ? 'مجموع الفاتورة:' : 'Invoice Total:'} {computedItemsTotal.toFixed(2)}{' '}
                  {currencySymbol}
                </div>
              </div>
            </div>
          ) : (
            <div className="px-4 py-3 rounded-2xl bg-slate-900 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-2.5">
              <EyeOff className="w-4 h-4 shrink-0" />
              <span>
                {isAr
                  ? 'وضع نوار / بوار (بدون أرقام): دخّل غير الكميات نيشان للمخزون بلا ICE وبلا أرشيف، وحتى بلا أنترنت!'
                  : 'Stock-Only Mode: Enter quantities straight to stock without ICE or archive.'}
              </span>
            </div>
          )}

          {/* QUICK CATALOG TAP BAR — Super useful in بوار/نوار mode & offline fallback */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-black text-slate-700 dark:text-slate-200">
                {isAr
                  ? '⚡ إضافة سريعة من سلع الحانوت (كليكي على السلعة باش تزيد الكمية):'
                  : '⚡ Quick Catalog Tap (Click product to add/increment):'}
              </span>
              <div className="relative w-full sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={quickCatalogQuery}
                  onChange={(e) => setQuickCatalogQuery(e.target.value)}
                  placeholder={isAr ? 'قلّب على سلعة...' : 'Filter products...'}
                  className="w-full ps-8 pe-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {filteredQuickProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => quickAddCatalogProduct(p)}
                  className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-amber-400 text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3 h-3 text-emerald-600" />
                  <span>{p.name}</span>
                  <span className="text-[10px] font-mono text-slate-400">({p.stock})</span>
                </button>
              ))}
            </div>
          </div>

          {/* 4. EXTRACTED / EDITABLE LINE ITEMS TABLE */}
          <div ref={itemsTableRef} className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <PackagePlus className="w-4 h-4 text-emerald-600" />
                <span>
                  {isAr
                    ? `السلع اللي غادي تزاد للمخزون (${activeItemsCount})`
                    : `Items to Add to Inventory (${activeItemsCount})`}
                </span>
              </h3>
              <button
                type="button"
                onClick={addManualLineAndFocus}
                className="px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-xs font-black text-white flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'دخل يدوياً (+ سطر جديد)' : '+ Add Row Manually'}</span>
              </button>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-2.5 text-center">#</th>
                    <th className="py-2 px-2.5 text-start">{isAr ? 'إسم السلعة' : 'Item Name'}</th>
                    <th className="py-2 px-2.5 text-start">
                      {isAr ? 'الربط مع الحانوت' : 'Catalog Link'}
                    </th>
                    <th className="py-2 px-2.5 text-center">{isAr ? 'الكمية (+)' : 'Qty (+)'}</th>
                    <th className="py-2 px-2.5 text-end">
                      {invoiceMode === 'informal_noir'
                        ? isAr
                          ? 'الشراء (اختياري)'
                          : 'Buy Cost'
                        : isAr
                        ? 'الشراء'
                        : 'Buy Cost'}
                    </th>
                    <th className="py-2 px-2.5 text-end">
                      {isAr ? 'المجموع' : 'Total'}
                    </th>
                    <th className="py-2 px-2.5 text-end">
                      {invoiceMode === 'informal_noir'
                        ? isAr
                          ? 'البيع - نتا (اختياري)'
                          : 'Sell (Opt.)'
                        : isAr
                        ? 'البيع - نتا'
                        : 'Your Sell'}
                    </th>
                    <th className="py-2 px-2.5 text-center">{isAr ? 'حيد' : 'Del'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-7 px-4 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2"
                      >
                        <div>
                          {isAr
                            ? 'صور أي فاتورة الفوق (أتقداو، مرجان، جملة...)، ولا كليكي على "دخل يدوياً" ولا اختار من سلع الحانوت.'
                            : 'Snap any invoice above, click Add Row Manually, or tap quick catalog items.'}
                        </div>
                        <button
                          type="button"
                          onClick={addManualLineAndFocus}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>{isAr ? 'دخل يدوياً دابا' : 'Enter Manually Now'}</span>
                        </button>
                      </td>
                    </tr>
                  ) : (
                    items.map((it, idx) => (
                      <tr
                        key={it.id}
                        className={
                          !it.include ? 'opacity-45 bg-slate-50 dark:bg-slate-800/30' : ''
                        }
                      >
                        <td className="py-2 px-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={it.include}
                            onChange={(e) => updateLine(it.id, { include: e.target.checked })}
                            className="w-4 h-4 accent-emerald-600"
                          />
                        </td>
                        <td className="py-2 px-2.5 min-w-[175px] space-y-1">
                          <input
                            ref={idx === 0 ? firstRowInputRef : undefined}
                            type="text"
                            value={it.rawName}
                            onChange={(e) => {
                              const nextName = e.target.value;
                              const nextMargin = !it.matchedProductId
                                ? suggestMoroccanMarginPercent(nextName)
                                : it.suggestedMarginPct;
                              updateLine(it.id, {
                                rawName: nextName,
                                suggestedMarginPct: nextMargin
                              });
                            }}
                            placeholder={isAr ? 'كتب إسم السلعة...' : 'Product name'}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white"
                          />
                          <input
                            type="text"
                            value={it.barcode}
                            onChange={(e) =>
                              updateLine(it.id, {
                                barcode: e.target.value.replace(/[^0-9A-Za-z-]/g, '')
                              })
                            }
                            placeholder={isAr ? 'باركود (اختياري)...' : 'Barcode (optional)'}
                            className="w-full px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-[10px] text-slate-500 dark:text-slate-400"
                          />
                        </td>
                        <td className="py-2 px-2.5 min-w-[155px]">
                          <select
                            value={it.matchedProductId}
                            onChange={(e) => handleSelectCatalogMatch(it.id, e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-800 dark:text-slate-200"
                          >
                            <option value="">
                              {isAr ? '+ زيدها كسلعة جديدة' : '+ Create new item'}
                            </option>
                            {products.slice(0, 250).map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({isAr ? `كاين: ${p.stock}` : `cur: ${p.stock}`})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                updateLine(it.id, {
                                  quantity: Math.max(0.5, Number((it.quantity - 1).toFixed(2)))
                                })
                              }
                              className="w-6 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                              title="-1"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              step="any"
                              min="0.1"
                              value={it.quantity}
                              onChange={(e) =>
                                updateLine(it.id, {
                                  quantity: Math.max(0.1, Number(e.target.value) || 0)
                                })
                              }
                              className="w-16 px-1.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-center font-mono tabular-nums font-black text-emerald-700 dark:text-emerald-400"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateLine(it.id, {
                                  quantity: Number((it.quantity + 1).toFixed(2))
                                })
                              }
                              className="w-6 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                              title="+1"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="py-2 px-2.5 text-end">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={it.unitCost}
                            onChange={(e) =>
                              updateLine(it.id, {
                                unitCost: Math.max(0, Number(e.target.value) || 0)
                              })
                            }
                            className="w-18 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-end font-mono tabular-nums font-bold"
                          />
                        </td>
                        <td className="py-2 px-2.5 text-end">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={it.lineTotal}
                            onChange={(e) =>
                              updateLine(it.id, {
                                lineTotal: Math.max(0, Number(e.target.value) || 0)
                              })
                            }
                            className="w-20 px-2 py-1 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-end font-mono tabular-nums font-black text-emerald-800 dark:text-emerald-300"
                          />
                        </td>
                        <td className="py-2 px-2.5 text-end">
                          <div className="flex flex-col items-end gap-0.5">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={it.sellPrice}
                              onChange={(e) =>
                                updateLine(it.id, {
                                  sellPrice: Math.max(0, Number(e.target.value) || 0)
                                })
                              }
                              className="w-18 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-end font-mono tabular-nums"
                            />
                            {!it.matchedProductId && it.suggestedMarginPct ? (
                              <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                                {isAr ? `مقترح +${it.suggestedMarginPct}%` : `+${it.suggestedMarginPct}% est.`}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-2 px-2.5 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setItems((prev) => prev.filter((row) => row.id !== it.id))
                            }
                            className="p-1 text-slate-400 hover:text-rose-600"
                            title={isAr ? 'حذف' : 'Remove'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer Submit Bar */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>

            <button
              type="submit"
              disabled={isScanning || activeItemsCount === 0}
              className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition-colors disabled:opacity-50 ${
                invoiceMode === 'official_ice'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-amber-400 hover:bg-amber-500 text-slate-950'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {invoiceMode === 'official_ice'
                  ? isAr
                    ? `تأكيد: زيد للمخزون + أرشيف ICE (${activeItemsCount})`
                    : `Save Official ICE Archive & Stock (${activeItemsCount})`
                  : isAr
                  ? `تأكيد: زيد للمخزون فقط - نوار/بوار (${activeItemsCount})`
                  : `Add to Inventory Only - Noir (${activeItemsCount})`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
