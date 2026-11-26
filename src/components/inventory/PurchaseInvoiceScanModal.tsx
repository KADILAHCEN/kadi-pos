import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePos } from '../../context/PosContext';
import { Product, SupplierInvoiceItemSnapshot, UnitType } from '../../types';
import { safeParseJsonResponse } from '../../utils/aiVoice';
import { getLocalTodayYMD } from '../../utils/expenses';
import { bluetoothScanner } from '../../utils/bluetoothScanner';
import { playSound } from '../../utils/audio';
import { BarcodeScannerModal } from '../pos/BarcodeScannerModal';
import { parsePurchaseInvoiceXml } from '../../utils/xmlInvoiceParser';
import {
  assessImageSharpness,
  loadBlobToImage,
  runOfflineInvoiceNumberOcr,
  runTesseractInvoiceOcr
} from '../../utils/offlineInvoiceOcr';
import { safeLocalStorageSet, safeLocalStorageGet } from '../../utils/storage';
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
  Copy,
  Barcode,
  Smartphone,
  FileText,
  FileCode2,
  Languages
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
  linePreviewDataUrl?: string;
}

const INVOICE_SCAN_DRAFT_KEY = 'kadi_pos_invoice_scan_draft_v1';
const INVOICE_DEFAULT_SELL_KEY = 'kadi_pos_invoice_default_sell_v1';

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
    totalHt?: number;
    tvaAmount?: number;
    totalTtc?: number;
    totalAmount?: number;
    items?: VisionInvoiceItem[];
  };
  error?: string;
  code?: string;
}

const readFileAsBase64 = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('تعذر قراءة ملف PDF'));
    reader.readAsDataURL(file);
  });

const normalizeUnitType = (nameOrUnit?: string): UnitType => {
  const s = (nameOrUnit || '').toLowerCase();
  if (/\b(kg|كيلو)\b/i.test(s)) return 'kg';
  if (/\b(g|gr|gram|gramme|grams|غرام)\b/i.test(s)) return 'gram';
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
    updateProduct,
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
  const [uploadedPdfName, setUploadedPdfName] = useState<string | null>(null);
  const [uploadedDocKind, setUploadedDocKind] = useState<'pdf' | 'xml' | null>(null);
  const [extractedTaxInfo, setExtractedTaxInfo] = useState<{
    totalHt?: number;
    tvaAmount?: number;
    totalTtc?: number;
  } | null>(null);
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
  const [sharpnessNotice, setSharpnessNotice] = useState<{
    isBlurry: boolean;
    isTooDark: boolean;
    message: string;
  } | null>(null);
  const [allowMissingIce, setAllowMissingIce] = useState(false);
  const [hasSavedDraftBanner, setHasSavedDraftBanner] = useState(false);
  const [completedMessage, setCompletedMessage] = useState<string | null>(null);
  const [quickCatalogQuery, setQuickCatalogQuery] = useState('');
  const [showBarcodeCamScanner, setShowBarcodeCamScanner] = useState(false);

  // Invoice metadata fields
  const [entryMethod, setEntryMethod] = useState<'camera' | 'manual'>('camera');
  const [supplierName, setSupplierName] = useState('');
  const [supplierIce, setSupplierIce] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState('');
  const [manualTotalAmount, setManualTotalAmount] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [defaultSellPrice, setDefaultSellPrice] = useState<string>(() =>
    safeLocalStorageGet(INVOICE_DEFAULT_SELL_KEY, '')
  );
  const [scanEngineMode, setScanEngineMode] = useState<'auto' | 'tesseract'>('auto');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [items, setItems] = useState<ScannedLineItem[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastCapturedBlobRef = useRef<Blob | null>(null);
  const phoneCameraInputRef = useRef<HTMLInputElement | null>(null);
  const pdfFileInputRef = useRef<HTMLInputElement | null>(null);
  const xmlFileInputRef = useRef<HTMLInputElement | null>(null);
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

  const resetFormState = (
    mode: PurchaseInvoiceMode = 'official_ice',
    initialEntryMethod: 'camera' | 'manual' = 'camera'
  ) => {
    stopCameraStream();
    lastCapturedBlobRef.current = null;
    setInvoiceMode(mode);
    setEntryMethod(initialEntryMethod);
    setPreviewDataUrl(null);
    setUploadedPdfName(null);
    setUploadedDocKind(null);
    setExtractedTaxInfo(null);
    setShowZoomPhoto(false);
    setShowRawJson(false);
    setRotationDeg(0);
    setCameraPermission('idle');
    setIsScanning(false);
    setScanError(null);
    setScanNotice(null);
    setSharpnessNotice(null);
    setAllowMissingIce(false);
    setHasSavedDraftBanner(false);
    setCompletedMessage(null);
    setQuickCatalogQuery('');
    setShowBarcodeCamScanner(false);
    setSupplierName('');
    setSupplierIce('');
    setSupplierPhone('');
    setInvoiceNumber('');
    setInvoiceDate(getLocalTodayYMD());
    setDueDate('');
    setManualTotalAmount('');
    setPaidAmount('');
    setInvoiceNotes('');
    setItems(initialEntryMethod === 'manual' ? [buildEmptyManualRow()] : []);
  };

  const clearSavedDraft = () => {
    try {
      localStorage.removeItem(INVOICE_SCAN_DRAFT_KEY);
    } catch {
      // ignore
    }
    setHasSavedDraftBanner(false);
  };

  // Persist active draft locally so accidental modal closes or offline sessions never lose invoice items
  useEffect(() => {
    if (!isOpen || completedMessage) return;
    const hasMeaningfulContent =
      supplierName.trim().length > 0 ||
      supplierIce.trim().length > 0 ||
      invoiceNumber.trim().length > 0 ||
      manualTotalAmount.trim().length > 0 ||
      items.some((it) => it.rawName.trim() || it.matchedProductId || it.unitCost > 0);
    if (!hasMeaningfulContent) return;

    try {
      const compactItems = items.map(({ linePreviewDataUrl: _dropImg, ...rest }) => rest);
      safeLocalStorageSet(
        INVOICE_SCAN_DRAFT_KEY,
        JSON.stringify({
          invoiceMode,
          entryMethod,
          supplierName,
          supplierIce,
          supplierPhone,
          invoiceNumber,
          invoiceDate,
          dueDate,
          manualTotalAmount,
          paidAmount,
          invoiceNotes,
          items: compactItems,
          savedAt: new Date().toISOString()
        })
      );
    } catch {
      // ignore draft quota errors
    }
  }, [
    isOpen,
    completedMessage,
    invoiceMode,
    entryMethod,
    supplierName,
    supplierIce,
    supplierPhone,
    invoiceNumber,
    invoiceDate,
    dueDate,
    manualTotalAmount,
    paidAmount,
    invoiceNotes,
    items
  ]);

  useEffect(() => {
    const handleOpen = (evt: Event) => {
      const detail = (
        evt as CustomEvent<{ defaultMode?: PurchaseInvoiceMode; manualEntry?: boolean }>
      ).detail;
      const startManual = Boolean(detail?.manualEntry);
      resetFormState(detail?.defaultMode || 'official_ice', startManual ? 'manual' : 'camera');

      // Restore any unfinished local invoice draft automatically
      try {
        const rawDraft = localStorage.getItem(INVOICE_SCAN_DRAFT_KEY);
        if (rawDraft) {
          const parsedDraft = JSON.parse(rawDraft) as {
            invoiceMode?: PurchaseInvoiceMode;
            entryMethod?: 'camera' | 'manual';
            supplierName?: string;
            supplierIce?: string;
            supplierPhone?: string;
            invoiceNumber?: string;
            invoiceDate?: string;
            dueDate?: string;
            manualTotalAmount?: string;
            paidAmount?: string;
            invoiceNotes?: string;
            items?: ScannedLineItem[];
          };
          const hasItems = Array.isArray(parsedDraft.items) && parsedDraft.items.length > 0;
          if (hasItems || parsedDraft.supplierName || parsedDraft.manualTotalAmount) {
            if (parsedDraft.invoiceMode) setInvoiceMode(parsedDraft.invoiceMode);
            if (parsedDraft.supplierName) setSupplierName(parsedDraft.supplierName);
            if (parsedDraft.supplierIce) setSupplierIce(parsedDraft.supplierIce);
            if (parsedDraft.supplierPhone) setSupplierPhone(parsedDraft.supplierPhone);
            if (parsedDraft.invoiceNumber) setInvoiceNumber(parsedDraft.invoiceNumber);
            if (parsedDraft.invoiceDate) setInvoiceDate(parsedDraft.invoiceDate);
            if (parsedDraft.dueDate) setDueDate(parsedDraft.dueDate);
            if (parsedDraft.manualTotalAmount) setManualTotalAmount(parsedDraft.manualTotalAmount);
            if (parsedDraft.paidAmount) setPaidAmount(parsedDraft.paidAmount);
            if (parsedDraft.invoiceNotes) setInvoiceNotes(parsedDraft.invoiceNotes);
            if (hasItems && parsedDraft.items) setItems(parsedDraft.items);
            setHasSavedDraftBanner(true);
            setIsOpen(true);
            return;
          }
        }
      } catch {
        // ignore corrupt draft
      }

      setIsOpen(true);
      if (!startManual) {
        // Ask for Camera permission & open fast camera when opening in camera mode
        window.setTimeout(() => {
          void startLiveCamera();
        }, 60);
      }
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
    setShowBarcodeCamScanner(false);
    bluetoothScanner.popScope('purchase_invoice');
    setIsOpen(false);
  };

  const handleCameraBarcodeDetected = (rawCode: string) => {
    const clean = rawCode.trim();
    if (!clean) return;
    setShowBarcodeCamScanner(false);

    const matched = products.find(
      (p) => p.barcode === clean || p.sku.toLowerCase() === clean.toLowerCase()
    );

    if (matched) {
      if (settings.bluetoothSoundFeedback !== false) playSound('beep');
      quickAddCatalogProduct(matched);
      setScanError(null);
      setScanNotice(
        isAr
          ? `📷 تم مسح الباركود بكاميرا الهاتف وإضافة: ${matched.name}`
          : `📷 Scanned with camera & added: ${matched.name}`
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
      const maybeFileName = blob instanceof File ? blob.name : '';
      const isXmlFile =
        blob.type === 'text/xml' ||
        blob.type === 'application/xml' ||
        maybeFileName.toLowerCase().endsWith('.xml');
      const isPdfFile =
        !isXmlFile &&
        (blob.type === 'application/pdf' || maybeFileName.toLowerCase().endsWith('.pdf'));

      if (isXmlFile) {
        setPreviewDataUrl(null);
        setShowZoomPhoto(false);
        setUploadedPdfName(maybeFileName || 'facture.xml');
        setUploadedDocKind('xml');

        const xmlText = await blob.text();
        const xmlResult = parsePurchaseInvoiceXml(xmlText);

        if (xmlResult.supplierName) setSupplierName(xmlResult.supplierName);
        if (xmlResult.supplierPhone) setSupplierPhone(xmlResult.supplierPhone);
        if (xmlResult.supplierIce) setSupplierIce(xmlResult.supplierIce);
        if (xmlResult.invoiceNumber) setInvoiceNumber(xmlResult.invoiceNumber);
        if (xmlResult.invoiceDate) setInvoiceDate(xmlResult.invoiceDate);
        if (xmlResult.totalTtc > 0) {
          setManualTotalAmount(xmlResult.totalTtc.toFixed(2));
        }
        if (xmlResult.totalHt > 0 || xmlResult.tvaAmount > 0 || xmlResult.totalTtc > 0) {
          setExtractedTaxInfo({
            totalHt: xmlResult.totalHt > 0 ? xmlResult.totalHt : undefined,
            tvaAmount: xmlResult.tvaAmount > 0 ? xmlResult.tvaAmount : undefined,
            totalTtc: xmlResult.totalTtc > 0 ? xmlResult.totalTtc : undefined
          });
        } else {
          setExtractedTaxInfo(null);
        }
        if (
          invoiceMode !== 'informal_noir' &&
          (xmlResult.supplierIce || xmlResult.invoiceNumber || xmlResult.supplierName)
        ) {
          setInvoiceMode('official_ice');
        }

        if (xmlResult.items.length === 0) {
          setScanError(
            isAr
              ? 'تقراو معلومات الفاتورة من ملف XML ولكن ما تلقاوش سلع (<Item> / <InvoiceLine> / <Ligne>). تقدر تزيدهم يدوياً لتحت.'
              : 'Header info parsed from XML, but no line items were found. You can add rows manually below.'
          );
          setIsScanning(false);
          return;
        }

        const xmlRows: ScannedLineItem[] = xmlResult.items.map((raw, idx) => {
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
            id: `xml-${Date.now()}-${idx}`,
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

        setItems(xmlRows);
        setScanNotice(
          isAr
            ? `✅ تقرا ملف XML بنجاح وجبد ${xmlRows.length} سلع (الإسم + الكمية + الثمن${xmlResult.supplierIce ? ` · ICE: ${xmlResult.supplierIce}` : ''}).`
            : `✅ Parsed XML invoice cleanly (${xmlRows.length} items extracted offline).`
        );
        if (settings.enableSoundEffects) playSound('success');
        setIsScanning(false);
        return;
      }

      let base64 = '';
      let requestMimeType = 'image/jpeg';
      setSharpnessNotice(null);

      if (isPdfFile) {
        if (blob.size > 18 * 1024 * 1024) {
          setScanError(
            isAr
              ? 'ملف PDF كبير بزاف (الحد الأقصى 18MB).'
              : 'PDF file is too large (max 18MB).'
          );
          setIsScanning(false);
          return;
        }
        setPreviewDataUrl(null);
        setShowZoomPhoto(false);
        setUploadedPdfName(maybeFileName || 'facture.pdf');
        setUploadedDocKind('pdf');
        base64 = await readFileAsBase64(blob);
        requestMimeType = 'application/pdf';
      } else {
        setUploadedPdfName(null);
        setUploadedDocKind(null);
        const prepared = await prepareInvoiceImageForVision(blob, 2200, 0.9, nextRotation);
        base64 = prepared.base64;
        setPreviewDataUrl(prepared.dataUrl);

        // Quick client-side image sharpness & lighting audit (helps merchants retake blurry/dark shots)
        try {
          const checkImg = await loadBlobToImage(blob);
          const sharpness = assessImageSharpness(checkImg);
          const isTooDark = sharpness.reason === 'dark' || sharpness.meanLuminance < 65;
          if (sharpness.isBlurry || isTooDark) {
            setSharpnessNotice({
              isBlurry: sharpness.isBlurry,
              isTooDark,
              message: isTooDark
                ? isAr
                  ? 'الصورة مظلمة شوية — شغّل الفلاش باش تكون الأرقام أوضح.'
                  : 'Photo looks dark — turn on Flash for clearer invoice digits.'
                : isAr
                ? 'الصورة مهزوزة شوية — إلا كانت الأرقام ما واضحاش عاود صورها قريبة وثابتة.'
                : 'Photo looks slightly blurry — retake closer and steady if numbers look off.'
            });
          }
        } catch {
          // Sharpness check optional
        }
      }

      const resolveDefaultOrSuggestedSell = (
        matched: Product | undefined,
        rawName: string,
        unitCost: number
      ): { sellPrice: number; suggestedMarginPct?: number } => {
        if (matched) {
          return { sellPrice: matched.price, suggestedMarginPct: undefined };
        }
        const parsedDefSell = Number(defaultSellPrice);
        if (Number.isFinite(parsedDefSell) && parsedDefSell > 0) {
          return { sellPrice: Number(parsedDefSell.toFixed(2)), suggestedMarginPct: undefined };
        }
        const marginPct = suggestMoroccanMarginPercent(rawName);
        const suggested =
          unitCost > 0 ? Number((unitCost * (1 + marginPct / 100)).toFixed(2)) : 0;
        return { sellPrice: suggested, suggestedMarginPct: marginPct };
      };

      const runTesseractLocalScan = async (
        ocrSource: Blob | string,
        reasonPrefixAr: string,
        reasonPrefixEn: string
      ): Promise<boolean> => {
        if (isPdfFile) return false;
        try {
          const tesseractRes = await runTesseractInvoiceOcr(ocrSource);
          if (tesseractRes.supplierHint && !supplierName.trim()) {
            setSupplierName(tesseractRes.supplierHint);
          }
          if (tesseractRes.detectedTotal > 0 && !manualTotalAmount) {
            setManualTotalAmount(tesseractRes.detectedTotal.toFixed(2));
          }
          if (tesseractRes.items.length > 0) {
            const rows: ScannedLineItem[] = tesseractRes.items.map((raw, idx) => {
              const matched = findBestCatalogProduct(raw.name, products);
              const unitCost =
                raw.unitCost > 0
                  ? raw.unitCost
                  : matched
                  ? matched.costPrice
                  : 0;
              const lineTotal =
                raw.lineTotal > 0
                  ? raw.lineTotal
                  : Number((raw.quantity * unitCost).toFixed(2));
              const { sellPrice, suggestedMarginPct } = resolveDefaultOrSuggestedSell(
                matched,
                raw.name,
                unitCost
              );
              return {
                id: `tess-${Date.now()}-${idx}`,
                include: true,
                barcode: matched?.barcode || '',
                rawName: matched ? matched.name : raw.name,
                matchedProductId: matched?.id || '',
                quantity: Math.max(0.01, Number(raw.quantity) || 1),
                unitCost: Number(Math.max(0, unitCost).toFixed(2)),
                lineTotal: Number(Math.max(0, lineTotal).toFixed(2)),
                sellPrice,
                suggestedMarginPct,
                unitType: matched ? matched.unitType : normalizeUnitType(raw.name),
                source: 'vision'
              };
            });
            setItems(rows);
            setScanNotice(
              isAr
                ? `${reasonPrefixAr} — تقراو ${rows.length} سلع محلياً (عربي / فرنسي / إنجليزي) مع تذكّر ثمن البيع.`
                : `${reasonPrefixEn} — Extracted ${rows.length} items locally with Tesseract (ara+fra+eng).`
            );
            if (settings.enableSoundEffects) playSound('success');
            setIsScanning(false);
            return true;
          }
        } catch {
          // Fall through cleanly to bitmap numeric OCR
        }
        return false;
      };

      const tryOfflineOcrFallback = async (reasonPrefixAr: string, reasonPrefixEn: string): Promise<boolean> => {
        if (isPdfFile) return false;
        const tessOk = await runTesseractLocalScan(
          previewDataUrl || blob,
          '📖 قراءة Tesseract محلية (عربي/فرنسي)',
          '📖 Local Tesseract OCR'
        );
        if (tessOk) return true;
        try {
          const img = await loadBlobToImage(blob);
          const offlineResult = await runOfflineInvoiceNumberOcr(img);
          if (offlineResult.detectedTotal > 0 && !manualTotalAmount) {
            setManualTotalAmount(offlineResult.detectedTotal.toFixed(2));
          }
          if (offlineResult.rows.length > 0) {
            const parsedDefSell = Number(defaultSellPrice);
            const offlineRows: ScannedLineItem[] = offlineResult.rows.map((row, idx) => {
              const cost = row.unitCost > 0 ? row.unitCost : row.lineTotal / Math.max(1, row.quantity);
              const total = row.lineTotal > 0 ? row.lineTotal : Number((row.quantity * cost).toFixed(2));
              const suggestedSell =
                Number.isFinite(parsedDefSell) && parsedDefSell > 0
                  ? Number(parsedDefSell.toFixed(2))
                  : cost > 0
                  ? Number((cost * 1.2).toFixed(2))
                  : 0;
              return {
                id: `offline-ocr-${Date.now()}-${idx}`,
                include: true,
                barcode: '',
                rawName: '',
                matchedProductId: '',
                quantity: Math.max(1, Number(row.quantity) || 1),
                unitCost: Number(Math.max(0, cost).toFixed(2)),
                lineTotal: Number(Math.max(0, total).toFixed(2)),
                sellPrice: suggestedSell,
                suggestedMarginPct: Number.isFinite(parsedDefSell) && parsedDefSell > 0 ? undefined : 20,
                unitType: 'piece',
                source: 'vision',
                linePreviewDataUrl: row.linePreviewDataUrl
              };
            });
            setItems(offlineRows);
            setScanNotice(
              isAr
                ? `${reasonPrefixAr} — تقراو ${offlineRows.length} سطور بالأرقام محلياً (اختار سمية كل سلعة من القائمة بجانب الصورة).`
                : `${reasonPrefixEn} — Extracted ${offlineRows.length} numeric rows locally (pick each product name next to its snippet).`
            );
            if (settings.enableSoundEffects) playSound('success');
            setIsScanning(false);
            return true;
          }
        } catch {
          // ignore offline OCR fallback errors
        }
        return false;
      };

      if (scanEngineMode === 'tesseract' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        const ok = await tryOfflineOcrFallback(
          scanEngineMode === 'tesseract'
            ? '📖 قراءة Tesseract محلية'
            : '📴 وضع أوفلاين (بدون أنترنت)',
          scanEngineMode === 'tesseract' ? '📖 Local Tesseract OCR' : '📴 Offline Mode'
        );
        if (ok) return;
        setScanError(
          isAr
            ? 'ما تقدرناش نقراو سطور واضحين محلياً من هاد التصويرة. جرب تقرّب الكاميرا، شغّل Gemini Vision (بالأنترنت)، ولا دخّل يدوياً.'
            : 'No clear rows detected locally. Retake closer, try Gemini Vision online, or enter manually.'
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
          mimeType: requestMimeType
        })
      });

      const parsed = await safeParseJsonResponse<ScannedInvoiceResponse | VisionInvoiceItem[]>(res);
      if (controller.signal.aborted) return;

      if (!res.ok || parsed.isNonJson || !parsed.data) {
        const offlineRecovered = await tryOfflineOcrFallback(
          '⚡ قراءة محلية سريعة (تعذر خادم Vision)',
          '⚡ Local OCR Fallback'
        );
        if (offlineRecovered) return;
        const errPayload = !Array.isArray(parsed.data) ? parsed.data?.error : undefined;
        setScanError(
          errPayload ||
            (isAr
              ? 'ما قراش مزيان. عاود صورها قريبة أو جرب ملف أوضح — أو دخّل يدوياً.'
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
        const extractedIce = (inv.supplierIce || '').replace(/[^0-9]/g, '').slice(0, 15);
        if (inv.supplierName) setSupplierName(inv.supplierName.trim());
        if (inv.supplierPhone) setSupplierPhone(inv.supplierPhone.trim());
        if (extractedIce) setSupplierIce(extractedIce);
        if (inv.invoiceNumber) setInvoiceNumber(inv.invoiceNumber.trim());
        if (inv.invoiceDate && /^\d{4}-\d{2}-\d{2}$/.test(inv.invoiceDate)) {
          setInvoiceDate(inv.invoiceDate);
        }
        const resolvedTtc =
          Number(inv.totalTtc) > 0
            ? Number(inv.totalTtc)
            : Number(inv.totalAmount) > 0
            ? Number(inv.totalAmount)
            : 0;
        if (resolvedTtc > 0) {
          setManualTotalAmount(resolvedTtc.toFixed(2));
        }
        if ((Number(inv.totalHt) || 0) > 0 || (Number(inv.tvaAmount) || 0) > 0 || resolvedTtc > 0) {
          setExtractedTaxInfo({
            totalHt: Number(inv.totalHt) > 0 ? Number(inv.totalHt) : undefined,
            tvaAmount: Number(inv.tvaAmount) >= 0 && Number(inv.tvaAmount) > 0 ? Number(inv.tvaAmount) : undefined,
            totalTtc: resolvedTtc > 0 ? resolvedTtc : undefined
          });
        } else {
          setExtractedTaxInfo(null);
        }
        if (invoiceMode !== 'informal_noir' && (extractedIce || inv.hasOfficialMarkers)) {
          setInvoiceMode('official_ice');
        }
      }

      if (visionItems.length === 0) {
        const offlineRecovered = await tryOfflineOcrFallback(
          '⚡ قراءة الأرقام محلياً',
          '⚡ Local Numeric Fallback'
        );
        if (offlineRecovered) return;
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

  const handleRunTesseractOnLastPhoto = async () => {
    if (!lastCapturedBlobRef.current || isScanning) return;
    setScanError(null);
    setScanNotice(null);
    setIsScanning(true);
    try {
      const sourceInput = previewDataUrl || lastCapturedBlobRef.current;
      const res = await runTesseractInvoiceOcr(sourceInput);
      if (res.supplierHint && !supplierName.trim()) {
        setSupplierName(res.supplierHint);
      }
      if (res.detectedTotal > 0 && !manualTotalAmount) {
        setManualTotalAmount(res.detectedTotal.toFixed(2));
      }
      if (res.items.length === 0) {
        setScanError(
          isAr
            ? 'ما لقاوش سطور واضحين بقراءة Tesseract — عاود صور بوضوح أو استعمل Gemini Vision.'
            : 'No clear line items detected by Tesseract — try clearer lighting or Gemini Vision.'
        );
      } else {
        const parsedDefSell = Number(defaultSellPrice);
        const rows: ScannedLineItem[] = res.items.map((raw, idx) => {
          const matched = findBestCatalogProduct(raw.name, products);
          const unitCost = raw.unitCost > 0 ? raw.unitCost : matched ? matched.costPrice : 0;
          const lineTotal =
            raw.lineTotal > 0 ? raw.lineTotal : Number((raw.quantity * unitCost).toFixed(2));
          const marginPct = suggestMoroccanMarginPercent(raw.name);
          const sellPrice = matched
            ? matched.price
            : Number.isFinite(parsedDefSell) && parsedDefSell > 0
            ? Number(parsedDefSell.toFixed(2))
            : unitCost > 0
            ? Number((unitCost * (1 + marginPct / 100)).toFixed(2))
            : 0;
          return {
            id: `tess-manual-${Date.now()}-${idx}`,
            include: true,
            barcode: matched?.barcode || '',
            rawName: matched ? matched.name : raw.name,
            matchedProductId: matched?.id || '',
            quantity: Math.max(0.01, Number(raw.quantity) || 1),
            unitCost: Number(Math.max(0, unitCost).toFixed(2)),
            lineTotal: Number(Math.max(0, lineTotal).toFixed(2)),
            sellPrice,
            suggestedMarginPct:
              matched || (Number.isFinite(parsedDefSell) && parsedDefSell > 0)
                ? undefined
                : marginPct,
            unitType: matched ? matched.unitType : normalizeUnitType(raw.name),
            source: 'vision'
          };
        });
        setItems(rows);
        setScanNotice(
          isAr
            ? `✅ قراءة Tesseract (عربي + فرنسي + إنجليزي) جبدات ${rows.length} سلع محلياً!`
            : `✅ Local Tesseract OCR (ara+fra+eng) extracted ${rows.length} items!`
        );
        if (settings.enableSoundEffects) playSound('success');
      }
    } catch {
      setScanError(
        isAr
          ? 'وقع مشكل فتشغيل قراءة Tesseract — تأكد من وضوح التصويرة أو جرب مرة أخرى.'
          : 'Tesseract OCR error — please try again or enter manually.'
      );
    } finally {
      setIsScanning(false);
    }
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

    const manualTotalVal = Math.max(0, Number(manualTotalAmount) || 0);
    const canSaveHeaderOnlyInvoice =
      invoiceMode === 'official_ice' &&
      supplierName.trim().length > 0 &&
      manualTotalVal > 0 &&
      activeRows.length === 0;

    if (activeRows.length === 0 && !canSaveHeaderOnlyInvoice) {
      setScanError(
        invoiceMode === 'official_ice'
          ? isAr
            ? 'زيد سلعة واحدة على الأقل فالجدول، أو كتب اسم المورد والمبلغ الإجمالي لتسجيل الفاتورة.'
            : 'Add at least one item row, or enter Supplier Name & Total Amount to save this invoice.'
          : isAr
          ? 'زيد أو اختار سلعة واحدة على الأقل (واكتب إسمها ولا اختارها من المخزون) باش نزيدوها.'
          : 'Select or add at least one item to add to inventory.'
      );
      return;
    }

    if (invoiceMode === 'official_ice') {
      if (!supplierName.trim()) {
        setScanError(
          isAr
            ? 'للفاتورة الرسمية، كتب إسم المورد أو الشركة الفوق.'
            : 'Please enter supplier name for official invoice archiving.'
        );
        return;
      }
      const cleanIceDigits = supplierIce.replace(/[^0-9]/g, '');
      if (cleanIceDigits.length > 0 && cleanIceDigits.length !== 15 && !allowMissingIce) {
        setScanError(
          isAr
            ? 'رقم ICE غير مكتمل (خاصو 15 رقم أو امسحو إذا ما كاينش فالبون).'
            : 'ICE must be 15 digits or cleared if not printed on the slip.'
        );
        return;
      }
    }

    const parsedDefSellCheck = Number(defaultSellPrice);
    const hasValidDefaultSell = Number.isFinite(parsedDefSellCheck) && parsedDefSellCheck > 0;
    if (invoiceMode !== 'informal_noir' && activeRows.length > 0 && !hasValidDefaultSell) {
      const missingSell = activeRows.find(
        (r) =>
          !r.matchedProductId &&
          !findBestCatalogProduct(r.rawName, products, r.barcode) &&
          !(Number(r.sellPrice) > 0)
      );
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

    const normalizedSupplierIce = supplierIce.replace(/[^0-9]/g, '').slice(0, 15);

    const restockReason =
      invoiceMode === 'official_ice'
        ? isAr
          ? `فاتورة شراء رسمية #${cleanInvNum}${normalizedSupplierIce ? ` (ICE: ${normalizedSupplierIce})` : ''}`
          : `Official purchase invoice #${cleanInvNum}`
        : isAr
        ? 'توريد للمخزون (بوار / نوار - بدون أرقام)'
        : 'Stock intake (no archive)';

    // Merge duplicate rows pointing to the same catalog item or identical new product name
    const mergedRowsMap = new Map<string, ScannedLineItem>();
    activeRows.forEach((row, idx) => {
      const cleanName = row.rawName.trim();
      const autoMatched =
        row.matchedProductId
          ? products.find((p) => p.id === row.matchedProductId)
          : cleanName
          ? findBestCatalogProduct(cleanName, products, row.barcode)
          : undefined;
      const key = autoMatched
        ? `prod:${autoMatched.id}`
        : `new:${cleanName.toLowerCase() || idx}`;
      const existingMerged = mergedRowsMap.get(key);
      if (existingMerged) {
        existingMerged.quantity = Number(
          (existingMerged.quantity + (Number(row.quantity) || 1)).toFixed(3)
        );
        if (Number(row.unitCost) > 0) existingMerged.unitCost = Number(row.unitCost);
        if (Number(row.sellPrice) > 0) existingMerged.sellPrice = Number(row.sellPrice);
      } else {
        mergedRowsMap.set(key, {
          ...row,
          matchedProductId: autoMatched?.id || row.matchedProductId
        });
      }
    });

    const parsedDefSell = Number(defaultSellPrice);

    Array.from(mergedRowsMap.values()).forEach((row, index) => {
      const qty = Math.max(0.01, Number(row.quantity) || 1);
      const unitCost = Math.max(0, Number(row.unitCost) || 0);
      const resolvedRowSell =
        Number(row.sellPrice) > 0
          ? Number(row.sellPrice)
          : Number.isFinite(parsedDefSell) && parsedDefSell > 0
          ? parsedDefSell
          : unitCost || 1;
      const sellPrice = Math.max(unitCost, resolvedRowSell);
      const existing = row.matchedProductId
        ? products.find((p) => p.id === row.matchedProductId)
        : undefined;

      if (existing) {
        adjustStock(existing.id, qty, restockReason, 'restock');
        if (unitCost > 0 && Math.abs(unitCost - existing.costPrice) > 0.001) {
          updateProductPurchaseCostAndRecalculateProfit(existing.id, unitCost);
        }
        if (
          invoiceMode !== 'informal_noir' &&
          Number(row.sellPrice) > 0 &&
          Math.abs(Number(row.sellPrice) - existing.price) > 0.001
        ) {
          updateProduct(existing.id, { price: Number(Number(row.sellPrice).toFixed(2)) });
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
      const totalVal =
        manualTotalVal > 0
          ? manualTotalVal
          : computedItemsTotal > 0
          ? computedItemsTotal
          : Math.max(0, Number(paidAmount) || 0);
      const paidVal =
        paidAmount.trim() === ''
          ? totalVal
          : Math.min(totalVal, Math.max(0, Number(paidAmount) || 0));

      const taxBreakdownSuffix =
        extractedTaxInfo && (extractedTaxInfo.totalHt || extractedTaxInfo.tvaAmount)
          ? ` · HT: ${(extractedTaxInfo.totalHt || 0).toFixed(2)} | TVA: ${(extractedTaxInfo.tvaAmount || 0).toFixed(2)}`
          : '';

      const defaultNote =
        activeRows.length > 0
          ? isAr
            ? `أرشيف رسمي (${activeRows.length} سلع) · ICE: ${normalizedSupplierIce}${taxBreakdownSuffix}`
            : `Official ICE archive (${activeRows.length} items) · ICE: ${normalizedSupplierIce}`
          : isAr
          ? `فاتورة مسجلة (${totalVal.toFixed(2)} ${currencySymbol}) · ICE: ${normalizedSupplierIce}${taxBreakdownSuffix}`
          : `Recorded invoice (${totalVal.toFixed(2)} ${currencySymbol})`;

      addSupplierInvoice({
        supplierName: supplierName.trim(),
        supplierPhone: supplierPhone.trim() || undefined,
        supplierIce: normalizedSupplierIce || undefined,
        invoiceType: 'official_ice',
        invoiceNumber: cleanInvNum,
        date: invoiceDate || todayStr,
        dueDate: dueDate || undefined,
        totalAmount: Number(totalVal.toFixed(2)),
        paidAmount: Number(paidVal.toFixed(2)),
        itemsCount: activeRows.length || undefined,
        itemsSummary: summarySnapshot.length > 0 ? summarySnapshot : undefined,
        scannedViaCamera:
          entryMethod === 'camera' && (Boolean(previewDataUrl) || Boolean(uploadedPdfName)),
        notes: invoiceNotes.trim() || defaultNote
      });
    }

    const doneText =
      invoiceMode === 'official_ice'
        ? activeRows.length > 0
          ? isAr
            ? `✅ تزادو السلع للمخزون (${updatedExistingCount} محدثة، ${createdNewCount} جديدة) وتسجلات الفاتورة #${cleanInvNum}!`
            : `✅ Stock updated (${updatedExistingCount + createdNewCount} items) & invoice #${cleanInvNum} saved!`
          : isAr
          ? `✅ تسجلات فاتورة المورد (${supplierName.trim()}) رقم #${cleanInvNum} بنجاح في الأرشيف!`
          : `✅ Supplier invoice #${cleanInvNum} recorded cleanly!`
        : isAr
        ? `✅ تزادت الكميات فـ المخزون (${updatedExistingCount} محدثة، ${createdNewCount} جديدة) فـ وضع نوار/بوار بلا تسجيل أرقام.`
        : `✅ Stock updated (${updatedExistingCount + createdNewCount} items) in Stock-Only mode (no archive).`;

    clearSavedDraft();
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

  const applyBatchMarginToNewItems = (marginPct: number) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.unitCost <= 0) return it;
        if (it.matchedProductId) return it;
        const computedSell = Number((it.unitCost * (1 + marginPct / 100)).toFixed(2));
        return {
          ...it,
          sellPrice: computedSell,
          suggestedMarginPct: marginPct
        };
      })
    );
    if (settings.enableSoundEffects) playSound('click');
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
          {/* DRAFT RECOVERY BANNER */}
          {hasSavedDraftBanner && (
            <div className="px-3.5 py-2 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-indigo-900 dark:text-indigo-200">
                {isAr
                  ? '💾 تم استرجاع مسودة الفاتورة غير المكتملة تلقائياً.'
                  : '💾 Restored your unsaved invoice draft.'}
              </span>
              <button
                type="button"
                onClick={() => {
                  clearSavedDraft();
                  resetFormState(invoiceMode, entryMethod);
                }}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 text-[11px] font-black text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100"
              >
                {isAr ? 'مسح المسودة والبدء من جديد' : 'Clear Draft'}
              </button>
            </div>
          )}

          {/* ENTRY METHOD SWITCHER: Camera Scan vs Direct Manual Entry */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => {
                setEntryMethod('camera');
                void startLiveCamera();
              }}
              className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-colors ${
                entryMethod === 'camera'
                  ? 'bg-amber-400 text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700'
              }`}
            >
              <Camera className="w-4 h-4 shrink-0" />
              <span>{isAr ? '📸 قراءة بالكاميرا / صورة' : 'Camera / Photo Scan'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                stopCameraStream();
                setEntryMethod('manual');
                if (items.length === 0) {
                  setItems([buildEmptyManualRow()]);
                }
              }}
              className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-colors ${
                entryMethod === 'manual'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700'
              }`}
            >
              <Edit3 className="w-4 h-4 shrink-0" />
              <span>{isAr ? '⌨️ إدخال الفاتورة يدوياً وتسجيلها' : 'Enter & Save Manually'}</span>
            </button>
          </div>

          {/* 1. INVOICE TYPE SELECTOR */}
          <div className="space-y-2">
            <label className="block text-xs font-black text-slate-700 dark:text-slate-300">
              {isAr ? '1. اختار كيفاش بغيتي تدخل الفاتورة:' : '1. Choose Invoice Handling Mode:'}
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

          {/* 2. CAPTURE OR UPLOAD INVOICE PHOTO / PDF (Full panel in camera mode, compact phone bar in manual mode) */}
          {entryMethod === 'manual' && !previewDataUrl && !uploadedPdfName && (
            <div className="p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800/70 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-950 dark:text-amber-200">
                <Smartphone className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {isAr
                    ? 'بغيتي تعمّرها سريع بالكاميرا، الهاتف، أو PDF؟ صور الفاتورة، جيب PDF، أو اسكان باركود:'
                    : 'Prefer camera, phone, or PDF? Snap the invoice, upload PDF, or scan barcodes:'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => phoneCameraInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-[11px] font-black flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{isAr ? 'تصوير بكاميرا الهاتف' : 'Phone Camera'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => pdfFileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{isAr ? 'جيب PDF' : 'Upload PDF'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => xmlFileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-black flex items-center gap-1.5"
                >
                  <FileCode2 className="w-3.5 h-3.5" />
                  <span>{isAr ? 'جيب XML' : 'Upload XML'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEntryMethod('camera');
                    void startLiveCamera();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-[11px] font-bold flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{isAr ? 'كاميرا مباشرة' : 'Live Cam'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopCameraStream();
                    setShowBarcodeCamScanner(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black flex items-center gap-1.5"
                >
                  <Barcode className="w-3.5 h-3.5" />
                  <span>{isAr ? 'سكان باركود بالكاميرا' : 'Scan Barcode'}</span>
                </button>
              </div>
              <input
                ref={phoneCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelected}
                className="hidden"
              />
              <input
                ref={pdfFileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleFileSelected}
                className="hidden"
              />
              <input
                ref={xmlFileInputRef}
                type="file"
                accept=".xml,text/xml,application/xml"
                onChange={handleFileSelected}
                className="hidden"
              />
            </div>
          )}

          {(entryMethod === 'camera' || previewDataUrl || uploadedPdfName) && (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>
                  {isAr
                    ? '2. صور أي فاتورة أو جيب PDF / XML (أتقداو، مرجان، جملة، UBL):'
                    : '2. Snap Photo or Upload PDF / XML Invoice:'}
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

                <label className="cursor-pointer px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 transition-colors whitespace-nowrap">
                  <FileText className="w-3.5 h-3.5" />
                  <span>{isAr ? 'جيب PDF' : 'Upload PDF'}</span>
                  <input
                    ref={pdfFileInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handleFileSelected}
                    className="hidden"
                  />
                </label>

                <label className="cursor-pointer px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black flex items-center gap-1.5 transition-colors whitespace-nowrap">
                  <FileCode2 className="w-3.5 h-3.5" />
                  <span>{isAr ? 'جيب XML' : 'Upload XML'}</span>
                  <input
                    ref={xmlFileInputRef}
                    type="file"
                    accept=".xml,text/xml,application/xml"
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

                {/* Corner alignment frame for faster steady receipt capture */}
                <div className="absolute inset-4 pointer-events-none">
                  <div className="absolute top-0 start-0 w-5 h-5 border-t-2 border-s-2 border-amber-400/90 rounded-tl-md" />
                  <div className="absolute top-0 end-0 w-5 h-5 border-t-2 border-e-2 border-amber-400/90 rounded-tr-md" />
                  <div className="absolute bottom-10 start-0 w-5 h-5 border-b-2 border-s-2 border-amber-400/90 rounded-bl-md" />
                  <div className="absolute bottom-10 end-0 w-5 h-5 border-b-2 border-e-2 border-amber-400/90 rounded-br-md" />
                </div>

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

            {uploadedPdfName && !previewDataUrl && !isLiveCameraOpen && (
              <div
                className={`flex flex-wrap items-center justify-between gap-3 pt-1 px-3.5 py-3 rounded-xl border ${
                  uploadedDocKind === 'xml'
                    ? 'bg-teal-50 dark:bg-teal-950/35 border-teal-200 dark:border-teal-800'
                    : 'bg-indigo-50 dark:bg-indigo-950/35 border-indigo-200 dark:border-indigo-800'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-11 h-11 rounded-xl text-white flex items-center justify-center shrink-0 ${
                      uploadedDocKind === 'xml' ? 'bg-teal-600' : 'bg-indigo-600'
                    }`}
                  >
                    {uploadedDocKind === 'xml' ? (
                      <FileCode2 className="w-5 h-5" />
                    ) : (
                      <FileText className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0 text-xs">
                    <div className="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span className="truncate max-w-[220px] sm:max-w-xs" dir="ltr">
                        {uploadedPdfName}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-black shrink-0 ${
                          uploadedDocKind === 'xml'
                            ? 'bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-200'
                            : 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200'
                        }`}
                      >
                        {uploadedDocKind === 'xml' ? 'UBL / XML' : 'Gemini PDF'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                      {uploadedDocKind === 'xml'
                        ? isAr
                          ? 'ملف XML إلكتروني — تقراو منه المعطيات والسلع نيشان بلا أنترنت.'
                          : 'XML invoice parsed locally without internet.'
                        : isAr
                        ? 'ملف PDF جاهز — تقراو منه المعطيات والسلع تلقائياً.'
                        : 'PDF document ready for Gemini parsing.'}
                    </div>
                  </div>
                </div>
                {lastCapturedBlobRef.current && !isScanning && (
                  <button
                    type="button"
                    onClick={handleRetryScan}
                    className={`px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border text-[11px] font-black flex items-center gap-1 ${
                      uploadedDocKind === 'xml'
                        ? 'border-teal-300 dark:border-teal-700 hover:bg-teal-100 text-teal-800 dark:text-teal-200'
                        : 'border-indigo-300 dark:border-indigo-700 hover:bg-indigo-100 text-indigo-800 dark:text-indigo-200'
                    }`}
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>
                      {uploadedDocKind === 'xml'
                        ? isAr
                          ? 'عاود القراءة'
                          : 'Re-parse XML'
                        : isAr
                        ? 'عاود القراءة'
                        : 'Retry PDF'}
                    </span>
                  </button>
                )}
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
                      onClick={() => void handleRunTesseractOnLastPhoto()}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-[11px] font-bold flex items-center gap-1"
                      title={
                        isAr
                          ? 'قراءة محلية مجانية بالعربية والفرنسية والإنجليزية (Tesseract)'
                          : 'Run local Tesseract OCR (ara+fra+eng)'
                      }
                    >
                      <Languages className="w-3 h-3 text-amber-400" />
                      <span>{isAr ? 'قراءة محلية (Tesseract)' : 'Local OCR'}</span>
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
          )}

          {sharpnessNotice && !isLiveCameraOpen && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs font-bold flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{sharpnessNotice.message}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (sharpnessNotice.isTooDark) setFlashOn(true);
                  void startLiveCamera();
                }}
                className="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-500 text-slate-950 text-[11px] font-black shrink-0"
              >
                {sharpnessNotice.isTooDark
                  ? isAr
                    ? 'عاود بالفلاش'
                    : 'Retake + Flash'
                  : isAr
                  ? 'عاود التصوير'
                  : 'Retake Photo'}
              </button>
            </div>
          )}

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
                {supplierIce.replace(/[^0-9]/g, '').length > 0 &&
                  supplierIce.replace(/[^0-9]/g, '').length < 15 &&
                  !allowMissingIce && (
                    <button
                      type="button"
                      onClick={() => {
                        setSupplierIce('');
                        setAllowMissingIce(true);
                        setScanError(null);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 text-xs font-black"
                    >
                      {isAr ? 'حفظ بدون ICE' : 'Save Without ICE'}
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-black text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-emerald-600" />
                  <span>
                    {isAr
                      ? '2. إدخال معلومات الفاتورة والمورد (أرشيف ICE)'
                      : '2. Invoice & Supplier Details (ICE Archive)'}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  {isAr
                    ? 'يمكنك تسجيل الفاتورة بالمبلغ الإجمالي أو مع السلع فالجدول'
                    : 'Save with line items or summary total'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'إسم المورد / الشركة *' : 'Supplier Name *'}
                  </label>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder={isAr ? 'مثال: أتقداو / سنطرال / شركة التوزيع...' : 'Supplier company'}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-semibold"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <label className="block font-bold text-slate-700 dark:text-slate-300">
                      {isAr ? 'رقم ICE (اختياري / 15 رقم)' : 'ICE Number (Optional / 15 digits)'}
                    </label>
                    <span
                      className={`text-[10px] font-mono font-black tabular-nums ${
                        supplierIce.replace(/[^0-9]/g, '').length === 15
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {supplierIce.replace(/[^0-9]/g, '').length}/15
                    </span>
                  </div>
                  <div className="relative">
                    <Hash className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-2.5 pointer-events-none" />
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={15}
                      value={supplierIce}
                      onChange={(e) => {
                        setSupplierIce(e.target.value.replace(/[^0-9]/g, '').slice(0, 15));
                        if (scanError) setScanError(null);
                      }}
                      placeholder="001234567000089"
                      className={`w-full ps-8 pe-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border text-slate-900 dark:text-white font-mono text-xs ${
                        supplierIce.replace(/[^0-9]/g, '').length === 15
                          ? 'border-emerald-400 dark:border-emerald-700'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'هاتف المورد' : 'Supplier Phone'}
                  </label>
                  <input
                    type="tel"
                    value={supplierPhone}
                    onChange={(e) => setSupplierPhone(e.target.value)}
                    placeholder="06XXXXXXXX"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-xs"
                  />
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
                    {isAr ? 'تاريخ الفاتورة' : 'Invoice Date'}
                  </label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'تاريخ الاستحقاق (اختياري)' : 'Due Date (Opt.)'}
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr
                      ? `مجموع الفاتورة TTC (${currencySymbol})`
                      : `Invoice Total TTC (${currencySymbol})`}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={manualTotalAmount}
                    onChange={(e) => setManualTotalAmount(e.target.value)}
                    placeholder={
                      computedItemsTotal > 0 ? computedItemsTotal.toFixed(2) : '0.00'
                    }
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-emerald-400 dark:border-emerald-700 font-mono font-black text-emerald-700 dark:text-emerald-300"
                  />
                </div>
              </div>

              {extractedTaxInfo && (extractedTaxInfo.totalHt || extractedTaxInfo.tvaAmount) && (
                <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px]">
                  {extractedTaxInfo.totalHt !== undefined && (
                    <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                      Total HT: {extractedTaxInfo.totalHt.toFixed(2)} {currencySymbol}
                    </span>
                  )}
                  {extractedTaxInfo.tvaAmount !== undefined && (
                    <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                      TVA: {extractedTaxInfo.tvaAmount.toFixed(2)} {currencySymbol}
                    </span>
                  )}
                  {extractedTaxInfo.totalTtc !== undefined && (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-black tabular-nums">
                      Total TTC: {extractedTaxInfo.totalTtc.toFixed(2)} {currencySymbol}
                    </span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs items-center">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? `الخلاص المؤدى (${currencySymbol}):` : `Paid (${currencySymbol}):`}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    placeholder={
                      String(
                        (Number(manualTotalAmount) > 0
                          ? Number(manualTotalAmount)
                          : computedItemsTotal) || 0
                      )
                    }
                    className="w-28 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold text-slate-900 dark:text-white"
                  />
                  <span className="text-[11px] text-slate-500">
                    {isAr ? '(خليه خاوي = مخلّصة كاملة)' : '(Blank = fully paid)'}
                  </span>
                </div>

                <div>
                  <input
                    type="text"
                    value={invoiceNotes}
                    onChange={(e) => setInvoiceNotes(e.target.value)}
                    placeholder={isAr ? 'ملاحظات حول الفاتورة أو الدفع (اختياري)...' : 'Invoice notes (optional)...'}
                    className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                  />
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

          {/* OCR ENGINE MODE & REMEMBERED DEFAULT SELL PRICE */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-3 items-center text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <label className="font-black text-slate-700 dark:text-slate-200 whitespace-nowrap">
                {isAr
                  ? 'ثمن البيع الافتراضي (للسلع الجديدة):'
                  : 'Default Sell Price (New items):'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={defaultSellPrice}
                onChange={(e) => {
                  const val = e.target.value;
                  setDefaultSellPrice(val);
                  safeLocalStorageSet(INVOICE_DEFAULT_SELL_KEY, val);
                }}
                placeholder={isAr ? 'مثال: 10 (غادي يعقل عليه)' : 'e.g. 10 (remembered)'}
                className="w-36 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex flex-wrap items-center justify-start md:justify-end gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'محرك القراءة:' : 'OCR Engine:'}
              </span>
              <div className="inline-flex p-0.5 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setScanEngineMode('auto')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-colors ${
                    scanEngineMode === 'auto'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {isAr ? 'ذكي (Gemini + محلي)' : 'Smart Auto'}
                </button>
                <button
                  type="button"
                  onClick={() => setScanEngineMode('tesseract')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-colors flex items-center gap-1 ${
                    scanEngineMode === 'tesseract'
                      ? 'bg-amber-400 text-slate-950 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Languages className="w-3 h-3" />
                  <span>{isAr ? 'Tesseract محلي' : 'Tesseract Local'}</span>
                </button>
              </div>
            </div>
          </div>

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
              <div className="flex flex-wrap items-center gap-2">
                {items.some((it) => !it.matchedProductId && it.unitCost > 0) &&
                  invoiceMode !== 'informal_noir' && (
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                        {isAr ? 'هامش الجدد:' : 'New margin:'}
                      </span>
                      {[10, 15, 20, 30].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => applyBatchMarginToNewItems(pct)}
                          className="px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-emerald-950 border border-slate-200 dark:border-slate-700 text-[10px] font-black text-emerald-700 dark:text-emerald-400 tabular-nums"
                        >
                          +{pct}%
                        </button>
                      ))}
                    </div>
                  )}
                <button
                  type="button"
                  onClick={() => {
                    stopCameraStream();
                    setShowBarcodeCamScanner(true);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-black text-white flex items-center gap-1.5 shadow-2xs"
                >
                  <Barcode className="w-3.5 h-3.5" />
                  <span>{isAr ? '📷 سكان باركود بالكاميرا / الهاتف' : 'Scan Barcode (Camera)'}</span>
                </button>
                <button
                  type="button"
                  onClick={addManualLineAndFocus}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-xs font-black text-white flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAr ? 'دخل يدوياً (+ سطر جديد)' : '+ Add Row Manually'}</span>
                </button>
              </div>
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
                          {it.linePreviewDataUrl && (
                            <img
                              src={it.linePreviewDataUrl}
                              alt={isAr ? 'سطر من الفاتورة' : 'Receipt line snippet'}
                              className="w-full h-8 object-contain rounded bg-white border border-slate-200 dark:border-slate-700 mb-1"
                            />
                          )}
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
              disabled={
                isScanning ||
                (activeItemsCount === 0 &&
                  !(
                    invoiceMode === 'official_ice' &&
                    supplierName.trim().length > 0 &&
                    Number(manualTotalAmount) > 0
                  ))
              }
              className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition-colors disabled:opacity-50 ${
                invoiceMode === 'official_ice'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-amber-400 hover:bg-amber-500 text-slate-950'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {invoiceMode === 'official_ice'
                  ? activeItemsCount > 0
                    ? isAr
                      ? `تأكيد وتسجيل الفاتورة + المخزون (${activeItemsCount})`
                      : `Save Invoice & Stock (${activeItemsCount})`
                    : isAr
                    ? 'تسجيل الفاتورة في الأرشيف'
                    : 'Save Invoice to Archive'
                  : isAr
                  ? `تأكيد: زيد للمخزون فقط - نوار/بوار (${activeItemsCount})`
                  : `Add to Inventory Only - Noir (${activeItemsCount})`}
              </span>
            </button>
          </div>
        </form>
      </div>

      {showBarcodeCamScanner && (
        <BarcodeScannerModal
          mode="field"
          defaultScanFormat="barcode"
          title={
            isAr
              ? 'مسح باركود السلعة بكاميرا الهاتف لإضافتها للفاتورة'
              : 'Scan Item Barcode with Camera for Invoice'
          }
          onClose={() => setShowBarcodeCamScanner(false)}
          onScanned={handleCameraBarcodeDetected}
        />
      )}
    </div>
  );
};
