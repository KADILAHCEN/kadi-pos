import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePos } from '../../context/PosContext';
import { Product } from '../../types';
import { runTesseractInvoiceOcr, parseTesseractInvoiceText } from '../../utils/offlineInvoiceOcr';
import { playSound } from '../../utils/audio';
import { getLocalTodayYMD } from '../../utils/expenses';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../utils/storage';
import {
  Camera,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Minus,
  Trash2,
  PackagePlus,
  Search,
  FileText,
  Sparkles,
  RotateCcw,
  RotateCw,
  Eye,
  Smartphone,
  Video,
  Flashlight,
  X
} from 'lucide-react';

interface OcrDraftItem {
  id: string;
  name: string;
  quantity: number;
  buyPrice: number;
  sellPrice: string;
  matchedProductId: string;
}

const DEFAULT_SELL_STORAGE_KEY = 'kadi_invoice_ocr_default_sell_v1';
const DEFAULT_SUPPLIER_STORAGE_KEY = 'kadi_invoice_ocr_supplier_v1';
const PRODUCT_SUPPLIER_MAP_KEY = 'kadi_invoice_ocr_product_suppliers_v1';

const loadSavedSupplierMap = (): Record<string, string> => {
  try {
    const raw = safeLocalStorageGet(PRODUCT_SUPPLIER_MAP_KEY, '{}');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

/**
 * Normalizes any phone camera / gallery photo:
 * - Applies EXIF orientation (`imageOrientation: 'from-image'`)
 * - Applies optional manual 0/90/180/270 rotation
 * - Scales huge 12–50MP phone shots safely to max 2000px JPEG
 * - Boosts contrast/brightness slightly so thermal & paper invoices read accurately in Tesseract
 */
const preparePhoneInvoiceImage = async (
  fileOrBlob: Blob,
  rotationDeg: 0 | 90 | 180 | 270 = 0,
  maxDim = 2000
): Promise<string> => {
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
      el.onerror = () => reject(new Error('Unsupported image format'));
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
    if (!ctx) throw new Error('Canvas unavailable');

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

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  } finally {
    closeBitmap?.();
    revokeUrl?.();
  }
};

const matchProductByName = (rawName: string, catalog: Product[]): Product | undefined => {
  const clean = rawName.trim().toLowerCase();
  if (!clean) return undefined;

  const exact = catalog.find(
    (p) => p.name.trim().toLowerCase() === clean || p.nameEn.trim().toLowerCase() === clean
  );
  if (exact) return exact;

  const partial = catalog.find(
    (p) =>
      p.name.trim().toLowerCase().includes(clean) ||
      (p.nameEn.trim().length > 2 && p.nameEn.trim().toLowerCase().includes(clean)) ||
      (p.name.trim().length > 2 && clean.includes(p.name.trim().toLowerCase()))
  );
  if (partial) return partial;

  const tokens = clean.split(/[\s\-_/.,*]+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return undefined;

  let best: Product | undefined;
  let bestHits = 0;
  for (const p of catalog) {
    const hay = `${p.name} ${p.nameEn}`.toLowerCase();
    const hits = tokens.filter((t) => hay.includes(t)).length;
    if (hits > bestHits && hits >= Math.min(2, tokens.length)) {
      bestHits = hits;
      best = p;
    }
  }
  return best;
};

export const InvoiceOcrView: React.FC = () => {
  const {
    products,
    categories,
    addProduct,
    adjustStock,
    updateProduct,
    updateProductPurchaseCostAndRecalculateProfit,
    addSupplierInvoice,
    supplierInvoices,
    settings,
    currencySymbol,
    language
  } = usePos();

  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceBlobRef = useRef<Blob | null>(null);

  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [rotationDeg, setRotationDeg] = useState<0 | 90 | 180 | 270>(0);
  const [autoReadOnSelect, setAutoReadOnSelect] = useState<boolean>(true);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  // Live camera state (for direct rear camera capture inside browser/mobile)
  const [isLiveCamOpen, setIsLiveCamOpen] = useState<boolean>(false);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [flashOn, setFlashOn] = useState<boolean>(false);

  const [isReading, setIsReading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>(
    isAr
      ? 'صور الفاتورة بكاميرا الهاتف ولا اختارها من الألبوم'
      : isFr
      ? 'Prenez ou choisissez la photo de facture depuis votre téléphone'
      : 'Snap or choose an invoice photo from your phone'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [supplierName, setSupplierName] = useState<string>(() =>
    safeLocalStorageGet(DEFAULT_SUPPLIER_STORAGE_KEY, isAr ? 'مراكش' : 'Fournisseur')
  );
  const [defaultSell, setDefaultSell] = useState<string>(() =>
    safeLocalStorageGet(DEFAULT_SELL_STORAGE_KEY, '')
  );
  const [archiveToSupplierLedger, setArchiveToSupplierLedger] = useState<boolean>(false);

  const [rawOcrText, setRawOcrText] = useState<string>('');
  const [showRawText, setShowRawText] = useState<boolean>(false);
  const [parsedItems, setParsedItems] = useState<OcrDraftItem[]>([]);

  const [stockSearchQuery, setStockSearchQuery] = useState<string>('');
  const [stockShowLimit, setStockShowLimit] = useState<number>(40);
  const [productSuppliers, setProductSuppliers] = useState<Record<string, string>>(() =>
    loadSavedSupplierMap()
  );

  const ledgerSupplierByName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const inv of supplierInvoices) {
      const sup = inv.supplierName?.trim();
      if (!sup || !Array.isArray(inv.itemsSummary)) continue;
      for (const item of inv.itemsSummary) {
        const key = item.productName?.trim().toLowerCase();
        if (key && !map[key]) {
          map[key] = sup;
        }
      }
    }
    return map;
  }, [supplierInvoices]);

  const getProductSupplier = useCallback(
    (p: Product): string => {
      const nameKey = p.name.trim().toLowerCase();
      const enKey = p.nameEn.trim().toLowerCase();
      return (
        productSuppliers[p.id] ||
        productSuppliers[nameKey] ||
        (enKey ? productSuppliers[enKey] : '') ||
        ledgerSupplierByName[nameKey] ||
        (enKey ? ledgerSupplierByName[enKey] : '') ||
        '—'
      );
    },
    [ledgerSupplierByName, productSuppliers]
  );

  const stopLiveCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track
            .applyConstraints?.({ advanced: [{ torch: false } as MediaTrackConstraintSet] })
            .catch(() => {});
        } catch {
          // ignore
        }
        track.stop();
      });
      streamRef.current = null;
    }
    setFlashOn(false);
    setTorchSupported(false);
    setIsLiveCamOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      stopLiveCamera();
    };
  }, [stopLiveCamera]);

  const applyParsedText = useCallback(
    (text: string, supplierHint?: string) => {
      const parsed = parseTesseractInvoiceText(text);
      if (supplierHint && !supplierName.trim()) {
        setSupplierName(supplierHint);
        safeLocalStorageSet(DEFAULT_SUPPLIER_STORAGE_KEY, supplierHint);
      }

      const mapped: OcrDraftItem[] = parsed.items.map((it, idx) => {
        const matched = matchProductByName(it.name, products);
        return {
          id: `ocr-${Date.now()}-${idx}`,
          name: matched ? matched.name : it.name,
          quantity: Math.max(0.01, Number(it.quantity) || 1),
          buyPrice: Number(Math.max(0, it.unitCost).toFixed(2)),
          sellPrice: matched ? String(matched.price) : '',
          matchedProductId: matched?.id || ''
        };
      });

      setParsedItems(mapped);
      if (mapped.length === 0) {
        setStatusMessage(
          isAr
            ? 'ما لقيت والو — عاود صور بوضوح ولا دوّر التصويرة ولا زيد السلع يدوياً لتحت'
            : isFr
            ? 'Aucun article détecté — pivotez/reprenez la photo ou ajoutez manuellement'
            : 'No items detected — rotate/retake photo or add rows manually'
        );
      } else {
        setStatusMessage(
          isAr
            ? `ساليت (${mapped.length} سلع) — دابا عدل واش بغيتي ودخل للمخزون`
            : isFr
            ? `Lecture terminée (${mapped.length} articles) — modifiez avant d’importer`
            : `Done (${mapped.length} items) — edit anything before importing`
        );
        if (settings.enableSoundEffects) playSound('success');
      }
    },
    [isAr, isFr, products, settings.enableSoundEffects, supplierName]
  );

  const runOcrOnImageDataUrl = useCallback(
    async (imageDataUrl: string) => {
      setErrorMessage(null);
      setSuccessMessage(null);
      setIsReading(true);
      setStatusMessage(
        isAr
          ? '... كنقرا بالعربية والفرنسية والإنجليزية ...'
          : isFr
          ? '... Lecture OCR en cours (Arabe, Français, Anglais) ...'
          : '... Reading invoice with Tesseract OCR (Arabic, French, English) ...'
      );

      try {
        const res = await runTesseractInvoiceOcr(imageDataUrl);
        setRawOcrText(res.rawText || '');
        applyParsedText(res.rawText || '', res.supplierHint);
      } catch {
        setErrorMessage(
          isAr
            ? 'وقع خطأ أثناء قراءة الفاتورة بـ Tesseract — تأكد من وضوح الصورة أو تدويرها.'
            : isFr
            ? 'Erreur Tesseract OCR — vérifiez ou pivotez la photo.'
            : 'Tesseract OCR failed — check image clarity or rotation.'
        );
        setStatusMessage(isAr ? 'تعذرت القراءة' : 'Read failed');
      } finally {
        setIsReading(false);
      }
    },
    [applyParsedText, isAr, isFr]
  );

  const processIncomingBlob = useCallback(
    async (blob: Blob, rot: 0 | 90 | 180 | 270 = 0, shouldAutoRead = autoReadOnSelect) => {
      sourceBlobRef.current = blob;
      setRotationDeg(rot);
      setErrorMessage(null);
      setSuccessMessage(null);

      try {
        const preparedUrl = await preparePhoneInvoiceImage(blob, rot, 2000);
        setPreviewDataUrl(preparedUrl);
        if (shouldAutoRead) {
          await runOcrOnImageDataUrl(preparedUrl);
        } else {
          setStatusMessage(
            isAr
              ? 'التصويرة واجدة — اضغط على "قرا الفاتورة دابا"'
              : isFr
              ? 'Photo prête — cliquez sur Lire la facture'
              : 'Photo ready — click Read Invoice Now'
          );
        }
      } catch {
        setErrorMessage(
          isAr
            ? 'تعذر فتح هاد الصورة من الهاتف — جرب صورة JPG/PNG واضحة.'
            : 'Could not decode this phone image — try a clear JPG/PNG photo.'
        );
      }
    },
    [autoReadOnSelect, isAr, isFr, runOcrOnImageDataUrl]
  );

  const handlePhotoChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopLiveCamera();
    void processIncomingBlob(file, 0, autoReadOnSelect);
    e.target.value = '';
  };

  // Support pasting an invoice photo directly from clipboard (Ctrl+V / WhatsApp Web)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const blob = items[i].getAsFile();
          if (blob) {
            e.preventDefault();
            stopLiveCamera();
            void processIncomingBlob(blob, 0, autoReadOnSelect);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [autoReadOnSelect, processIncomingBlob, stopLiveCamera]);

  const startLiveCamera = async () => {
    setErrorMessage(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage(
        isAr
          ? 'الكاميرا المباشرة غير مدعومة فهاد المتصفح — استعمل زر "كاميرا الهاتف" لتصوير الفاتورة.'
          : 'Live browser camera not supported — use the Phone Camera button instead.'
      );
      return;
    }

    stopLiveCamera();
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
      setIsLiveCamOpen(true);

      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          const caps = track.getCapabilities?.() as { torch?: boolean } | undefined;
          setTorchSupported(Boolean(caps?.torch));
        } catch {
          setTorchSupported(false);
        }
      }

      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      }, 30);
    } catch {
      setErrorMessage(
        isAr
          ? 'تعذر فتح الكاميرا المباشرة (مرفوضة أو مستعملة) — استعمل زر "كاميرا الهاتف" أو "ألبوم الهاتف".'
          : 'Could not open live camera — please use Phone Camera or Phone Gallery instead.'
      );
      setIsLiveCamOpen(false);
    }
  };

  const handleToggleFlash = async () => {
    const next = !flashOn;
    setFlashOn(next);
    const track = streamRef.current?.getVideoTracks()[0];
    if (track && torchSupported && track.applyConstraints) {
      try {
        await track.applyConstraints({
          advanced: [{ torch: next } as MediaTrackConstraintSet]
        });
      } catch {
        // ignore
      }
    }
  };

  const captureLiveFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const maxDim = 2000;
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
        stopLiveCamera();
        if (blob) {
          void processIncomingBlob(blob, 0, true);
        }
      },
      'image/jpeg',
      0.92
    );
  };

  const handleRotatePreview = () => {
    if (!sourceBlobRef.current || isReading) return;
    const nextRot = (((rotationDeg + 90) % 360) as 0 | 90 | 180 | 270);
    void processIncomingBlob(sourceBlobRef.current, nextRot, autoReadOnSelect);
  };

  const handleReadInvoice = async () => {
    if (!previewDataUrl) {
      setErrorMessage(
        isAr
          ? 'صور الفاتورة بكاميرا الهاتف ولا اختار صورة من الهاتف الأول'
          : isFr
          ? 'Prenez ou importez une photo de facture d’abord'
          : 'Snap or choose an invoice photo from your phone first'
      );
      return;
    }
    await runOcrOnImageDataUrl(previewDataUrl);
  };

  const handleReparseEditedRawText = () => {
    if (!rawOcrText.trim()) return;
    applyParsedText(rawOcrText);
  };

  const updateDraftItem = (id: string, patch: Partial<OcrDraftItem>) => {
    setParsedItems((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const updated = { ...row, ...patch };
        if (patch.name !== undefined && patch.matchedProductId === undefined) {
          const matched = matchProductByName(patch.name, products);
          if (matched) {
            updated.matchedProductId = matched.id;
            if (!updated.sellPrice) updated.sellPrice = String(matched.price);
          } else {
            updated.matchedProductId = '';
          }
        }
        return updated;
      })
    );
  };

  const addEmptyRow = () => {
    setParsedItems((prev) => [
      ...prev,
      {
        id: `man-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: '',
        quantity: 1,
        buyPrice: 0,
        sellPrice: '',
        matchedProductId: ''
      }
    ]);
  };

  const handleBatchSaveToInventory = () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const validRows = parsedItems.filter(
      (it) => (it.name.trim().length > 0 || it.matchedProductId) && Number(it.quantity) > 0
    );

    if (validRows.length === 0) {
      setErrorMessage(
        isAr
          ? 'ما كاين حتى سلعة جاهزة للإدخال — قرا الفاتورة ولا زيد سطر يدوياً.'
          : 'No valid items to import — read an invoice or add a row first.'
      );
      return;
    }

    const cleanSupplier = supplierName.trim() || (isAr ? 'مراكش' : 'Supplier');
    const parsedDefSell = parseFloat(defaultSell);
    const reason = isAr
      ? `توريد فاتورة من الهاتف (${cleanSupplier})`
      : `Phone invoice OCR import (${cleanSupplier})`;

    // Merge duplicate rows by matched product ID or normalized name before importing
    const mergedMap = new Map<string, OcrDraftItem>();
    validRows.forEach((row, idx) => {
      const cleanName = row.name.trim();
      const matched =
        row.matchedProductId
          ? products.find((p) => p.id === row.matchedProductId)
          : matchProductByName(cleanName, products);
      const key = matched ? `id:${matched.id}` : `name:${cleanName.toLowerCase() || idx}`;
      const existing = mergedMap.get(key);
      if (existing) {
        existing.quantity = Number((existing.quantity + (Number(row.quantity) || 1)).toFixed(3));
        if (Number(row.buyPrice) > 0) existing.buyPrice = Number(row.buyPrice);
        if (row.sellPrice.trim() !== '') existing.sellPrice = row.sellPrice;
      } else {
        mergedMap.set(key, {
          ...row,
          matchedProductId: matched?.id || ''
        });
      }
    });

    let updatedCount = 0;
    let createdCount = 0;
    let totalBuyValue = 0;
    const snapshotItems: {
      productName: string;
      quantity: number;
      unitCost: number;
      unitType: 'piece';
    }[] = [];

    const updatedSupplierMap: Record<string, string> = { ...productSuppliers };

    Array.from(mergedMap.values()).forEach((row, idx) => {
      const qty = Math.max(0.01, Number(row.quantity) || 1);
      const buy = Math.max(0, Number(row.buyPrice) || 0);
      const explicitSell = parseFloat(row.sellPrice);
      const fallbackSell =
        Number.isFinite(parsedDefSell) && parsedDefSell > 0 ? parsedDefSell : buy;
      const finalSell =
        Number.isFinite(explicitSell) && explicitSell > 0
          ? explicitSell
          : fallbackSell > 0
          ? fallbackSell
          : 1;

      totalBuyValue += qty * buy;

      const existingProd = row.matchedProductId
        ? products.find((p) => p.id === row.matchedProductId)
        : undefined;

      if (existingProd) {
        adjustStock(existingProd.id, qty, reason, 'restock');
        if (buy > 0 && Math.abs(buy - existingProd.costPrice) > 0.001) {
          updateProductPurchaseCostAndRecalculateProfit(existingProd.id, buy);
        }
        if (
          Number.isFinite(explicitSell) &&
          explicitSell > 0 &&
          Math.abs(explicitSell - existingProd.price) > 0.001
        ) {
          updateProduct(existingProd.id, { price: Number(explicitSell.toFixed(2)) });
        }
        updatedSupplierMap[existingProd.id] = cleanSupplier;
        updatedSupplierMap[existingProd.name.trim().toLowerCase()] = cleanSupplier;
        updatedCount++;
        snapshotItems.push({
          productName: existingProd.name,
          quantity: qty,
          unitCost: buy,
          unitType: 'piece'
        });
      } else {
        const cleanName = row.name.trim() || `${isAr ? 'سلعة جديدة' : 'New Item'} #${idx + 1}`;
        addProduct({
          name: cleanName,
          nameEn: cleanName,
          sku: `OCR-${Date.now().toString().slice(-5)}-${idx + 1}`,
          barcode: '',
          categoryId: categories[0]?.id || 'cat-1',
          price: Number(Math.max(buy, finalSell).toFixed(2)),
          costPrice: Number(buy.toFixed(2)),
          stock: qty,
          lowStockThreshold: Math.max(2, Math.round(qty * 0.2)),
          unitType: 'piece'
        });
        updatedSupplierMap[cleanName.trim().toLowerCase()] = cleanSupplier;
        createdCount++;
        snapshotItems.push({
          productName: cleanName,
          quantity: qty,
          unitCost: buy,
          unitType: 'piece'
        });
      }
    });

    setProductSuppliers(updatedSupplierMap);
    safeLocalStorageSet(PRODUCT_SUPPLIER_MAP_KEY, JSON.stringify(updatedSupplierMap));

    if (archiveToSupplierLedger && totalBuyValue > 0) {
      addSupplierInvoice({
        supplierName: cleanSupplier,
        invoiceType: 'official_ice',
        invoiceNumber: `OCR-${Date.now().toString().slice(-5)}`,
        date: getLocalTodayYMD(),
        totalAmount: Number(totalBuyValue.toFixed(2)),
        paidAmount: Number(totalBuyValue.toFixed(2)),
        itemsCount: snapshotItems.length,
        itemsSummary: snapshotItems,
        scannedViaCamera: Boolean(previewDataUrl),
        notes: reason
      });
    }

    if (settings.enableSoundEffects) playSound('success');
    setSuccessMessage(
      isAr
        ? `دخلت للمخزون ✅ (${updatedCount} سلعة محدثة، ${createdCount} سلعة جديدة · المجموع: ${totalBuyValue.toFixed(2)} ${currencySymbol})`
        : isFr
        ? `Importé dans le stock ✅ (${updatedCount} mises à jour, ${createdCount} créées)`
        : `Imported to inventory ✅ (${updatedCount} updated, ${createdCount} created)`
    );
    setParsedItems([]);
  };

  const parsedBatchBuyTotal = useMemo(
    () =>
      parsedItems.reduce(
        (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.buyPrice) || 0),
        0
      ),
    [parsedItems]
  );

  const filteredInventory = useMemo(() => {
    const q = stockSearchQuery.trim().toLowerCase();
    return q
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.nameEn.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            p.barcode.toLowerCase().includes(q) ||
            getProductSupplier(p).toLowerCase().includes(q)
        )
      : products;
  }, [getProductSupplier, products, stockSearchQuery]);

  const displayedInventory = useMemo(
    () => filteredInventory.slice(0, stockShowLimit),
    [filteredInventory, stockShowLimit]
  );

  const totalInventoryCostValue = useMemo(
    () => products.reduce((sum, p) => sum + Math.max(0, p.stock) * Math.max(0, p.costPrice), 0),
    [products]
  );

  return (
    <div
      className="h-full overflow-y-auto px-3 sm:px-6 py-4 pb-24 lg:pb-6 space-y-5 max-w-[1400px] mx-auto"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              {isAr
                ? 'إدخال صورة الفاتورة من الهاتف للمخزون (OCR)'
                : isFr
                ? 'Importer Photo Facture Téléphone → Stock'
                : 'Phone Invoice Photo → Inventory (OCR)'}
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr
              ? 'صور الفاتورة بكاميرا الهاتف أو اختارها من الألبوم/WhatsApp للقراءة الفورية بالعربية والفرنسية والإنجليزية'
              : isFr
              ? 'Capture caméra téléphone ou galerie/WhatsApp avec lecture OCR arabe, français & anglais'
              : 'Snap with phone camera or pick from phone gallery/WhatsApp for instant Tesseract OCR'}
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
          <span>
            {isAr ? 'السلع المقروءة:' : 'Parsed:'}{' '}
            <strong className="text-slate-900 dark:text-white font-mono">
              {parsedItems.length}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {isAr ? 'إجمالي الشراء:' : 'Batch Buy:'}{' '}
            <strong className="text-emerald-700 dark:text-emerald-400 font-mono">
              {parsedBatchBuyTotal.toFixed(2)} {currencySymbol}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {isAr ? 'مخزون الحانوت:' : 'Catalog:'}{' '}
            <strong className="text-slate-900 dark:text-white font-mono">
              {products.length}
            </strong>
          </span>
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Phone Capture, Gallery & Supplier Settings */}
        <div className="lg:col-span-5 space-y-4">
          {/* Card 1: Phone Camera / Gallery / Live Stream */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file && file.type.startsWith('image/')) {
                stopLiveCamera();
                void processIncomingBlob(file, 0, autoReadOnSelect);
              }
            }}
            className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 sm:p-5 space-y-4 transition-colors ${
              isDraggingOver
                ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-black text-slate-900 dark:text-white">
                {isAr
                  ? '1. صورة الفاتورة من الهاتف'
                  : isFr
                  ? '1. Photo depuis le téléphone'
                  : '1. Phone Invoice Photo'}
              </h2>
              {previewDataUrl && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRotatePreview}
                    disabled={isReading}
                    className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-600 flex items-center gap-1"
                    title={isAr ? 'تدوير الصورة 90 درجة' : 'Rotate 90°'}
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>{isAr ? 'تدوير' : 'Rotate'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sourceBlobRef.current = null;
                      setPreviewDataUrl(null);
                      setRawOcrText('');
                      setStatusMessage(
                        isAr
                          ? 'صور الفاتورة بكاميرا الهاتف ولا اختارها من الألبوم'
                          : 'Snap or choose an invoice photo from your phone'
                      );
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{isAr ? 'مسح' : 'Clear'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Native label triggers for reliable Android & iPhone camera + gallery picking */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="cursor-pointer min-h-[46px] px-3 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-black flex items-center justify-center gap-2 transition-colors whitespace-nowrap active:scale-[0.98]">
                <Camera className="w-4 h-4 shrink-0" />
                <span>{isAr ? 'كاميرا الهاتف (تصوير مباشر)' : isFr ? 'Caméra téléphone' : 'Phone Camera'}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChosen}
                  className="hidden"
                />
              </label>

              <label className="cursor-pointer min-h-[46px] px-3 py-2.5 rounded-xl bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-black flex items-center justify-center gap-2 transition-colors whitespace-nowrap active:scale-[0.98]">
                <Upload className="w-4 h-4 shrink-0" />
                <span>
                  {isAr
                    ? 'ألبوم الهاتف / WhatsApp'
                    : isFr
                    ? 'Galerie / WhatsApp'
                    : 'Phone Gallery / Files'}
                </span>
                <input
                  type="file"
                  accept="image/*,.heic,.heif,.jpg,.jpeg,.png,.webp"
                  onChange={handlePhotoChosen}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => (isLiveCamOpen ? stopLiveCamera() : void startLiveCamera())}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5"
              >
                <Video className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  {isLiveCamOpen
                    ? isAr
                      ? 'إغلاق الكاميرا المباشرة'
                      : 'Stop Live Camera'
                    : isAr
                    ? 'فتح عدسة الكاميرا داخل التطبيق'
                    : 'Live Camera Inside App'}
                </span>
              </button>

              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoReadOnSelect}
                  onChange={(e) => setAutoReadOnSelect(e.target.checked)}
                  className="w-3.5 h-3.5 accent-emerald-600 rounded"
                />
                <span>{isAr ? 'قراءة تلقائية فور التصوير' : 'Auto-read photo'}</span>
              </label>
            </div>

            {/* Live Browser Rear Camera */}
            {isLiveCamOpen && (
              <div className="rounded-xl overflow-hidden bg-black relative border border-slate-700">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full max-h-72 object-cover"
                />
                <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between gap-2">
                  {torchSupported ? (
                    <button
                      type="button"
                      onClick={() => void handleToggleFlash()}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 ${
                        flashOn
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-slate-950/75 text-white'
                      }`}
                    >
                      <Flashlight className="w-3.5 h-3.5" />
                      <span>{flashOn ? (isAr ? 'فلاش شاعل' : 'Flash ON') : isAr ? 'فلاش' : 'Flash'}</span>
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={stopLiveCamera}
                    className="p-1.5 rounded-xl bg-slate-950/75 text-white"
                    aria-label={isAr ? 'إغلاق' : 'Close'}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-2.5 bg-slate-950/90 flex justify-center">
                  <button
                    type="button"
                    onClick={captureLiveFrame}
                    className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-black flex items-center gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{isAr ? 'التقاط وقراءة الفاتورة' : 'Capture & Read'}</span>
                  </button>
                </div>
              </div>
            )}

            {previewDataUrl && !isLiveCamOpen && (
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950">
                <img
                  src={previewDataUrl}
                  alt={isAr ? 'معاينة الفاتورة' : 'Invoice preview'}
                  className="w-full max-h-72 object-contain mx-auto"
                />
              </div>
            )}

            <div
              className={`px-3 py-2.5 rounded-xl text-xs font-bold text-center border ${
                isReading
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                  : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
              }`}
            >
              {isReading && <Loader2 className="w-4 h-4 animate-spin inline-block me-1.5" />}
              <span>{statusMessage}</span>
            </div>

            <button
              type="button"
              onClick={handleReadInvoice}
              disabled={isReading || !previewDataUrl}
              className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-slate-900 dark:bg-amber-400 hover:bg-slate-800 dark:hover:bg-amber-500 disabled:opacity-45 disabled:cursor-not-allowed text-white dark:text-slate-950 text-sm font-black flex items-center justify-center gap-2 transition-colors"
            >
              {isReading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>
                {isAr
                  ? 'قرا الفاتورة دابا'
                  : isFr
                  ? 'Lire la facture maintenant'
                  : 'Read Invoice Now'}
              </span>
            </button>

            {rawOcrText && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <button
                  type="button"
                  onClick={() => setShowRawText((v) => !v)}
                  className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>
                    {showRawText
                      ? isAr
                        ? 'إخفاء النص المقروء (OCR)'
                        : 'Hide Raw OCR Text'
                      : isAr
                      ? 'عرض وتعديل النص المقروء (OCR)'
                      : 'View / Edit Raw OCR Text'}
                  </span>
                </button>
                {showRawText && (
                  <div className="space-y-2">
                    <textarea
                      value={rawOcrText}
                      onChange={(e) => setRawOcrText(e.target.value)}
                      rows={5}
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-800 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={handleReparseEditedRawText}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold"
                    >
                      {isAr ? 'إعادة استخراج السلع من النص' : 'Re-parse Edited Text'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Card 2: Supplier & Remembered Default Sell Price */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5">
            <h2 className="text-sm font-black text-slate-900 dark:text-white">
              {isAr
                ? '2. معلومات المورد والتسعير'
                : isFr
                ? '2. Fournisseur & Prix par défaut'
                : '2. Supplier & Default Pricing'}
            </h2>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? 'اسم المورد:' : isFr ? 'Nom du fournisseur :' : 'Supplier Name:'}
              </label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => {
                  setSupplierName(e.target.value);
                  safeLocalStorageSet(DEFAULT_SUPPLIER_STORAGE_KEY, e.target.value);
                }}
                placeholder={isAr ? 'مثال: مراكش - فلان' : 'Supplier name'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr
                  ? 'ثمن البيع الافتراضي إلا ما كتبتيش (غادي يعقل عليه):'
                  : isFr
                  ? 'Prix de vente par défaut (mémorisé) :'
                  : 'Default sell price if blank (remembered):'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={defaultSell}
                onChange={(e) => {
                  setDefaultSell(e.target.value);
                  safeLocalStorageSet(DEFAULT_SELL_STORAGE_KEY, e.target.value);
                }}
                placeholder={isAr ? 'مثال: 10' : 'e.g. 10'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
              />
            </div>

            <label className="flex items-center gap-2 pt-1 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={archiveToSupplierLedger}
                onChange={(e) => setArchiveToSupplierLedger(e.target.checked)}
                className="w-4 h-4 accent-emerald-600 rounded"
              />
              <span>
                {isAr
                  ? 'تسجيل الفاتورة أيضاً في أرشيف الموردين'
                  : isFr
                  ? 'Archiver aussi dans le registre fournisseurs'
                  : 'Also record in Supplier Invoices ledger'}
              </span>
            </label>
          </div>
        </div>

        {/* Right Column: Parsed Invoice Table + Current Live Stock */}
        <div className="lg:col-span-7 space-y-5">
          {errorMessage && (
            <div className="px-4 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="px-4 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-black flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Card 3: Edit Parsed Items Before Importing */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                <span>
                  {isAr
                    ? '3. هنا تعدل قبل ما تدخل للمخزون'
                    : isFr
                    ? '3. Modifier avant d’importer dans le stock'
                    : '3. Edit Items Before Stock Import'}
                </span>
              </h2>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                {parsedItems.length > 0
                  ? isAr
                    ? `${parsedItems.length} سطر جاهز للتعديل`
                    : `${parsedItems.length} rows ready`
                  : isAr
                  ? 'قرا الفاتورة ولا زيد سطر بيدك'
                  : 'Read invoice or add manually'}
              </span>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-900 dark:bg-slate-800 text-white">
                  <tr>
                    <th className="py-2.5 px-3 text-start">
                      {isAr ? 'السمية - تعدلها' : isFr ? 'Article (modifiable)' : 'Item Name'}
                    </th>
                    <th className="py-2.5 px-2 text-center">{isAr ? 'العدد' : isFr ? 'Qté' : 'Qty'}</th>
                    <th className="py-2.5 px-2 text-end">{isAr ? 'شراء' : isFr ? 'Achat' : 'Buy'}</th>
                    <th className="py-2.5 px-2 text-end">{isAr ? 'بيع' : isFr ? 'Vente' : 'Sell'}</th>
                    <th className="py-2.5 px-2 text-center">{isAr ? 'حيد' : isFr ? 'Suppr' : 'Remove'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {parsedItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-8 px-4 text-center text-xs text-slate-500 dark:text-slate-400"
                      >
                        {isAr
                          ? 'ما لقيت والو دابا — صور الفاتورة من الهاتف أو زيد سطر بيدك لتحت'
                          : isFr
                          ? 'Aucun article en attente — scannez une facture ou ajoutez une ligne'
                          : 'No pending items — snap or pick an invoice photo or add a row below'}
                      </td>
                    </tr>
                  ) : (
                    parsedItems.map((it) => (
                      <tr key={it.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-2.5 min-w-[170px]">
                          <input
                            type="text"
                            value={it.name}
                            onChange={(e) => updateDraftItem(it.id, { name: e.target.value })}
                            placeholder={isAr ? 'سمية السلعة' : 'Product name'}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white"
                          />
                          <div className="text-[10px] mt-0.5 text-slate-500 dark:text-slate-400">
                            {it.matchedProductId
                              ? isAr
                                ? 'موجودة فالمخزون · غادي يتزاد العدد تلقائياً'
                                : 'In stock · will increment qty'
                              : isAr
                              ? 'سلعة جديدة'
                              : 'New catalog item'}
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                updateDraftItem(it.id, {
                                  quantity: Math.max(1, Number((it.quantity - 1).toFixed(2)))
                                })
                              }
                              className="w-6 h-7 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              step="0.1"
                              min="0.01"
                              value={it.quantity}
                              onChange={(e) =>
                                updateDraftItem(it.id, {
                                  quantity: Math.max(0.01, Number(e.target.value) || 0)
                                })
                              }
                              className="w-14 px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-center font-mono font-bold tabular-nums text-slate-900 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateDraftItem(it.id, {
                                  quantity: Number((it.quantity + 1).toFixed(2))
                                })
                              }
                              className="w-6 h-7 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-end">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={it.buyPrice}
                            onChange={(e) =>
                              updateDraftItem(it.id, {
                                buyPrice: Math.max(0, Number(e.target.value) || 0)
                              })
                            }
                            className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-end font-mono font-bold tabular-nums text-slate-900 dark:text-white"
                          />
                        </td>
                        <td className="py-2 px-2 text-end">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={it.sellPrice}
                            onChange={(e) => updateDraftItem(it.id, { sellPrice: e.target.value })}
                            placeholder={defaultSell || String(it.buyPrice || '')}
                            className="w-20 px-2 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/30 text-end font-mono font-bold tabular-nums text-emerald-800 dark:text-emerald-300"
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setParsedItems((prev) => prev.filter((row) => row.id !== it.id))
                            }
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            title={isAr ? 'حيد' : 'Remove'}
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

            {/* Live Batch Total Readout */}
            <div className="px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-center font-black text-sm text-slate-900 dark:text-white tabular-nums">
              {parsedItems.length > 0 ? (
                <span>
                  {isAr ? 'المجموع: ' : isFr ? 'Total : ' : 'Total: '}
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">
                    {parsedBatchBuyTotal.toFixed(2)} {currencySymbol}
                  </span>
                </span>
              ) : (
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {isAr
                    ? 'المجموع غادي يتحسب تلقائياً ملي تقرا الفاتورة أو تزيد سطر'
                    : 'Total updates live as you edit quantities and buy prices'}
                </span>
              )}
            </div>

            {/* Primary Save + Manual Row Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleBatchSaveToInventory}
                disabled={parsedItems.length === 0}
                className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 disabled:cursor-not-allowed text-white text-sm font-black flex items-center justify-center gap-2 transition-colors"
              >
                <PackagePlus className="w-4 h-4" />
                <span>
                  {isAr
                    ? 'دخل للمخزون ✅'
                    : isFr
                    ? 'Importer dans le stock ✅'
                    : 'Import to Stock ✅'}
                </span>
              </button>

              <button
                type="button"
                onClick={addEmptyRow}
                className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-sm font-black flex items-center justify-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>{isAr ? 'زيد سطر بيدك' : isFr ? 'Ajouter une ligne' : 'Add Row Manually'}</span>
              </button>
            </div>
          </div>

          {/* Card 4: Live Current Stock Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-black text-slate-900 dark:text-white">
                {isAr ? '4. المخزون' : isFr ? '4. Stock actuel' : '4. Current Inventory'}
              </h2>
              <div className="relative w-full sm:w-60">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                <input
                  type="text"
                  value={stockSearchQuery}
                  onChange={(e) => {
                    setStockSearchQuery(e.target.value);
                    setStockShowLimit(40);
                  }}
                  placeholder={isAr ? 'قلّب بالسمية ولا المورد...' : 'Search stock or supplier...'}
                  className="w-full ps-8 pe-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2 px-3 text-start">{isAr ? 'السمية' : 'Product'}</th>
                    <th className="py-2 px-2 text-center">{isAr ? 'العدد' : 'Qty'}</th>
                    <th className="py-2 px-2 text-end">{isAr ? 'شراء' : 'Buy'}</th>
                    <th className="py-2 px-2 text-end">{isAr ? 'بيع' : 'Sell'}</th>
                    <th className="py-2 px-3 text-start">{isAr ? 'مورد' : isFr ? 'Fournisseur' : 'Supplier'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {displayedInventory.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-6 px-4 text-center text-xs text-slate-500 dark:text-slate-400"
                      >
                        {isAr ? 'المخزون خاوي' : 'No matching stock items'}
                      </td>
                    </tr>
                  ) : (
                    displayedInventory.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-bold text-slate-900 dark:text-white">
                          {isAr ? p.name : p.nameEn || p.name}
                        </td>
                        <td className="py-2 px-2 text-center font-mono font-bold tabular-nums text-slate-800 dark:text-slate-200">
                          {p.stock}
                        </td>
                        <td className="py-2 px-2 text-end font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {p.costPrice.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-end font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {p.price.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-start font-semibold text-slate-600 dark:text-slate-300">
                          {getProductSupplier(p)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
              <span className="font-black text-slate-900 dark:text-white tabular-nums">
                {isAr
                  ? `مجموع قيمة الشراء: ${totalInventoryCostValue.toFixed(2)} ${currencySymbol}`
                  : `Total Stock Cost Value: ${totalInventoryCostValue.toFixed(2)} ${currencySymbol}`}
              </span>
              {filteredInventory.length > stockShowLimit && (
                <button
                  type="button"
                  onClick={() => setStockShowLimit((n) => n + 40)}
                  className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200"
                >
                  {isAr
                    ? `عرض المزيد (${filteredInventory.length - stockShowLimit})`
                    : `Show more (${filteredInventory.length - stockShowLimit})`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
