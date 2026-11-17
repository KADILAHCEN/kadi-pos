import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePos } from '../../context/PosContext';
import { Product, SupplierInvoiceItemSnapshot, UnitType } from '../../types';
import { safeParseJsonResponse } from '../../utils/aiVoice';
import { getLocalTodayYMD } from '../../utils/expenses';
import {
  Camera,
  Upload,
  X,
  FileCheck2,
  EyeOff,
  Loader2,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  PackagePlus,
  Building2,
  Hash
} from 'lucide-react';

export type PurchaseInvoiceMode = 'official_ice' | 'informal_noir';

interface ScannedLineItem {
  id: string;
  include: boolean;
  rawName: string;
  matchedProductId: string; // '' means create new catalog product
  quantity: number;
  unitCost: number;
  sellPrice: number;
  unitType: UnitType;
}

interface ScannedInvoiceResponse {
  invoice?: {
    supplierName?: string;
    supplierIce?: string;
    supplierPhone?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    hasOfficialMarkers?: boolean;
    totalAmount?: number;
    items?: Array<{
      rawName?: string;
      matchedCatalogName?: string;
      quantity?: number;
      unitCost?: number;
      unitType?: string;
    }>;
  };
  error?: string;
}

const normalizeUnitType = (raw?: string): UnitType => {
  const s = (raw || '').toLowerCase();
  if (s === 'kg' || s.includes('كيلو')) return 'kg';
  if (s === 'liter' || s.includes('لتر')) return 'liter';
  if (s === 'box' || s.includes('كرتون') || s.includes('صندوق')) return 'box';
  return 'piece';
};

const compressImageFileToJpeg = (fileOrBlob: Blob): Promise<{ base64: string; dataUrl: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const src = String(reader.result || '');
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format'));
      img.onload = () => {
        const maxDim = 1600;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
        const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
        resolve({ base64, dataUrl });
      };
      img.src = src;
    };
    reader.readAsDataURL(fileOrBlob);
  });

const findBestCatalogProduct = (
  rawName: string,
  matchedCatalogName: string | undefined,
  products: Product[]
): Product | undefined => {
  const byAi = (matchedCatalogName || '').trim().toLowerCase();
  if (byAi) {
    const exactAi = products.find(
      (p) => p.name.trim().toLowerCase() === byAi || p.nameEn.trim().toLowerCase() === byAi
    );
    if (exactAi) return exactAi;
  }
  const clean = rawName.trim().toLowerCase();
  if (!clean) return undefined;
  return (
    products.find(
      (p) =>
        p.name.trim().toLowerCase() === clean || p.nameEn.trim().toLowerCase() === clean
    ) ||
    products.find(
      (p) =>
        p.name.trim().toLowerCase().includes(clean) ||
        clean.includes(p.name.trim().toLowerCase())
    )
  );
};

export const PurchaseInvoiceScanModal: React.FC = () => {
  const {
    products,
    categories,
    adjustStock,
    addProduct,
    updateProductPurchaseCostAndRecalculateProfit,
    addSupplierInvoice,
    currencySymbol,
    language
  } = usePos();

  const isAr = language === 'ar';
  const todayStr = getLocalTodayYMD();

  const [isOpen, setIsOpen] = useState(false);
  const [invoiceMode, setInvoiceMode] = useState<PurchaseInvoiceMode>('official_ice');

  // Camera / upload states
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [completedMessage, setCompletedMessage] = useState<string | null>(null);

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

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsLiveCameraOpen(false);
  };

  const resetFormState = (mode: PurchaseInvoiceMode = 'official_ice') => {
    stopCameraStream();
    setInvoiceMode(mode);
    setPreviewDataUrl(null);
    setIsScanning(false);
    setScanError(null);
    setScanNotice(null);
    setCompletedMessage(null);
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
    setIsOpen(false);
  };

  const computedItemsTotal = useMemo(
    () =>
      Number(
        items
          .filter((it) => it.include && it.rawName.trim())
          .reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitCost) || 0), 0)
          .toFixed(2)
      ),
    [items]
  );

  const activeItemsCount = useMemo(
    () => items.filter((it) => it.include && it.rawName.trim() && it.quantity > 0).length,
    [items]
  );

  const analyzeImageBlob = async (blob: Blob) => {
    setScanError(null);
    setScanNotice(null);
    setCompletedMessage(null);
    setIsScanning(true);

    try {
      const { base64, dataUrl } = await compressImageFileToJpeg(blob);
      setPreviewDataUrl(dataUrl);

      const res = await fetch('/api/ai/scan-purchase-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: 'image/jpeg',
          existingProducts: products.map((p) => p.name).slice(0, 400),
          language
        })
      });

      const parsed = await safeParseJsonResponse<ScannedInvoiceResponse>(res);
      if (parsed.isNonJson || !parsed.data) {
        throw new Error(
          isAr ? 'تعذر الاتصال بخدمة قراءة الفواتير.' : 'Invoice OCR service unavailable.'
        );
      }
      if (!res.ok) {
        throw new Error(parsed.data.error || 'Failed to read purchase invoice');
      }

      const inv = parsed.data.invoice || {};
      const extractedIce = (inv.supplierIce || '').replace(/\s+/g, '').trim();

      if (inv.supplierName) setSupplierName(inv.supplierName.trim());
      if (inv.supplierPhone) setSupplierPhone(inv.supplierPhone.trim());
      if (extractedIce) setSupplierIce(extractedIce);
      if (inv.invoiceNumber) setInvoiceNumber(inv.invoiceNumber.trim());
      if (inv.invoiceDate && /^\d{4}-\d{2}-\d{2}$/.test(inv.invoiceDate)) {
        setInvoiceDate(inv.invoiceDate);
      }

      // Suggest mode from extracted document markers
      if (extractedIce || inv.hasOfficialMarkers) {
        setInvoiceMode('official_ice');
        setScanNotice(
          isAr
            ? extractedIce
              ? `تم اكتشاف رقم ICE (${extractedIce}) — تم اختيار "فاتورة رسمية للأرشيف" تلقائياً.`
              : 'الفاتورة تبدو رسمية — تأكد من إدخال رقم ICE لحفظها في الأرشيف.'
            : 'Official invoice markers detected.'
        );
      } else {
        setScanNotice(
          isAr
            ? 'تمت قراءة السلع بنجاح! اختر نوع الفاتورة (رسمية ICE للأرشيف أو نوار بدون أرقام للمخزون فقط).'
            : 'Items extracted! Select Official (ICE) or Informal (Stock Only).'
        );
      }

      const extractedRows: ScannedLineItem[] = (inv.items || []).map((raw, idx) => {
        const name = (raw.rawName || raw.matchedCatalogName || '').trim();
        const matched = findBestCatalogProduct(name, raw.matchedCatalogName, products);
        const qty = Math.max(0.1, Number(raw.quantity) || 1);
        const unitCost = Math.max(
          0,
          Number(raw.unitCost) || (matched ? matched.costPrice : 0)
        );
        const suggestedSell = matched
          ? matched.price
          : unitCost > 0
          ? Number((unitCost * 1.25).toFixed(2))
          : 10;

        return {
          id: `scan-${Date.now()}-${idx}`,
          include: true,
          rawName: name,
          matchedProductId: matched?.id || '',
          quantity: qty,
          unitCost: Number(unitCost.toFixed(2)),
          sellPrice: suggestedSell,
          unitType: matched ? matched.unitType : normalizeUnitType(raw.unitType)
        };
      });

      if (extractedRows.length === 0) {
        setScanNotice(
          isAr
            ? 'لم نتمكن من استخراج أسطر واضحة من الصورة — يمكنك إعادة التصوير بوضوح أو إضافة السلع يدوياً أسفله.'
            : 'No clear line items detected — retake photo or add rows manually below.'
        );
      }
      setItems(extractedRows);
    } catch (err) {
      setScanError(
        err instanceof Error
          ? err.message
          : isAr
          ? 'حدث خطأ أثناء قراءة صورة الفاتورة.'
          : 'Error analyzing invoice photo'
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCameraStream();
    void analyzeImageBlob(file);
    e.target.value = '';
  };

  const startLiveCamera = async () => {
    setScanError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanError(
        isAr
          ? 'المتصفح لا يدعم الكاميرا المباشرة. استخدم زر "تصوير بالهاتف / رفع صورة".'
          : 'Live camera not supported; use Photo / Upload button.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      streamRef.current = stream;
      setIsLiveCameraOpen(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 60);
    } catch {
      setScanError(
        isAr
          ? 'تعذر فتح الكاميرا (تحقق من الإذن)، يمكنك التصوير بزر الهاتف مباشرة.'
          : 'Could not access camera; use native camera capture button.'
      );
    }
  };

  const captureLiveFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        stopCameraStream();
        if (blob) void analyzeImageBlob(blob);
      },
      'image/jpeg',
      0.9
    );
  };

  const addManualLine = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `man-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        include: true,
        rawName: '',
        matchedProductId: '',
        quantity: 1,
        unitCost: 0,
        sellPrice: 0,
        unitType: 'piece'
      }
    ]);
  };

  const updateLine = (id: string, patch: Partial<ScannedLineItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const handleSelectCatalogMatch = (lineId: string, productId: string) => {
    const prod = products.find((p) => p.id === productId);
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== lineId) return it;
        if (!prod) {
          return { ...it, matchedProductId: '' };
        }
        return {
          ...it,
          matchedProductId: prod.id,
          rawName: it.rawName || prod.name,
          unitCost: it.unitCost > 0 ? it.unitCost : prod.costPrice,
          sellPrice: prod.price,
          unitType: prod.unitType
        };
      })
    );
  };

  const handleConfirmRestock = (e: React.FormEvent) => {
    e.preventDefault();
    setScanError(null);

    const activeRows = items.filter(
      (it) => it.include && it.rawName.trim() && Number(it.quantity) > 0
    );

    if (activeRows.length === 0) {
      setScanError(
        isAr
          ? 'أضف أو حدد سلعة واحدة على الأقل لإضافتها إلى المخزون.'
          : 'Select or add at least one item to add to inventory.'
      );
      return;
    }

    if (invoiceMode === 'official_ice' && !supplierName.trim()) {
      setScanError(
        isAr
          ? 'للفاتورة الرسمية، المرجو إدخال اسم المورد أو الشركة.'
          : 'Please enter the supplier name for official invoice archiving.'
      );
      return;
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
        ? 'توريد للمخزون (نوار - بدون أرقام)'
        : 'Quick stock intake (no archive)';

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
        const cleanName = row.rawName.trim();
        const skuCode = `SC-${Date.now().toString().slice(-5)}-${index + 1}`;
        addProduct({
          name: cleanName,
          nameEn: cleanName,
          sku: skuCode,
          barcode: '',
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
          ? `✅ تمت زيادة المخزون (${updatedExistingCount} محدثة، ${createdNewCount} جديدة) وحفظ الفاتورة الرسمية في أرشيف ICE!`
          : `✅ Stock updated (${updatedExistingCount + createdNewCount} items) & archived with ICE!`
        : isAr
        ? `✅ تمت زيادة المخزون بنجاح (${updatedExistingCount} محدثة، ${createdNewCount} جديدة) في وضع النوار دون تسجيل أي أرقام بالأرشيف.`
        : `✅ Stock updated (${updatedExistingCount + createdNewCount} items) in Stock-Only mode (no archive).`;

    setCompletedMessage(doneText);
    window.dispatchEvent(
      new CustomEvent('kadi:purchase-invoice-completed', {
        detail: { message: doneText, mode: invoiceMode }
      })
    );

    window.setTimeout(() => {
      closeModal();
    }, 1600);
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
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                {isAr
                  ? 'تصوير وقراءة فاتورة الشراء (AI)'
                  : 'Scan Purchase Invoice to Inventory'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {isAr
                  ? 'صور الفاتورة بالهاتف ليتم قراءة السلع وزيادتها تلقائياً في المخزون'
                  : 'Snap invoice photo to extract items and add quantities directly to stock'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            title={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleConfirmRestock} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* 1. INVOICE TYPE SELECTOR: Official (ICE -> Archive) vs Noir (No numbers -> Stock Only) */}
          <div className="space-y-2">
            <label className="block text-xs font-black text-slate-700 dark:text-slate-300">
              {isAr ? '1. اختر نوع الفاتورة:' : '1. Choose Invoice Handling Mode:'}
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
                      ? 'تمشي للأرشيف الرسمي للموردين + كتزيد السلع للمخزون'
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
                    {isAr ? 'نوار (بدون أرقام)' : 'Informal / Noir (No Numbers)'}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                    {isAr
                      ? 'تدخل غير للمخزون فقط بلا ICE وبلا تسجيل في الأرشيف'
                      : 'Enters inventory stock only with zero tax or archive entry'}
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
                    ? '2. صور الفاتورة بالهاتف أو ارفع الصورة لقراءتها تلقائياً:'
                    : '2. Snap or Upload Invoice Image for AI Extraction:'}
                </span>
              </span>

              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-black flex items-center gap-2 transition-colors whitespace-nowrap">
                  <Camera className="w-4 h-4" />
                  <span>{isAr ? 'تصوير بالهاتف' : 'Phone Camera'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileSelected}
                    className="hidden"
                  />
                </label>

                <label className="cursor-pointer px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isAr ? 'اختيار صورة' : 'Upload File'}</span>
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
                        ? 'إيقاف الكاميرا'
                        : 'Stop Cam'
                      : isAr
                      ? 'كاميرا مباشرة'
                      : 'Live Camera'}
                  </span>
                </button>
              </div>
            </div>

            {isLiveCameraOpen && (
              <div className="rounded-xl overflow-hidden bg-black relative">
                <video ref={videoRef} playsInline muted className="w-full max-h-64 object-cover" />
                <div className="p-3 bg-slate-900/90 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={captureLiveFrame}
                    className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-black flex items-center gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{isAr ? 'التقاط وقراءة الفاتورة الآن' : 'Capture & Read Invoice'}</span>
                  </button>
                </div>
              </div>
            )}

            {isScanning && (
              <div className="py-6 flex flex-col items-center justify-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-300">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>
                  {isAr
                    ? 'جاري قراءة الفاتورة بالذكاء الاصطناعي واستخراج السلع والكميات...'
                    : 'Reading invoice photo and extracting products & quantities...'}
                </span>
              </div>
            )}

            {previewDataUrl && !isLiveCameraOpen && (
              <div className="flex items-center gap-3 pt-1">
                <img
                  src={previewDataUrl}
                  alt={isAr ? 'صورة الفاتورة' : 'Invoice preview'}
                  className="w-16 h-16 rounded-xl object-cover border border-slate-300 dark:border-slate-700 shrink-0"
                />
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  <div className="font-bold text-slate-900 dark:text-white">
                    {isAr ? 'تم التقاط صورة الفاتورة' : 'Invoice photo loaded'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {isAr
                      ? 'راجع تفاصيل السلع والكميات أسفله قبل تأكيد إضافتها للمخزون.'
                      : 'Review extracted rows below before confirming restock.'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {scanNotice && (
            <div className="px-4 py-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-bold">
              {scanNotice}
            </div>
          )}

          {scanError && (
            <div className="px-4 py-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{scanError}</span>
            </div>
          )}

          {completedMessage && (
            <div className="px-4 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-400 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 text-xs font-black flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{completedMessage}</span>
            </div>
          )}

          {/* 3. OFFICIAL ICE METADATA (ONLY SHOWN WHEN official_ice MODE SELECTED) */}
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
                    {isAr ? 'اسم المورد / الشركة *' : 'Supplier Name *'}
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
                    {isAr ? `المبلغ المؤدى (${currencySymbol}):` : `Paid (${currencySymbol}):`}
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
                    {isAr ? '(اتركه فارغاً إذا تم الأداء كلياً)' : '(Blank = fully paid)'}
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
                  ? 'وضع النوار (بدون أرقام): لن يتم تسجيل أي رقم فاتورة أو ICE أو أرشيف ضريبي — ستتم فقط زيادة كميات السلع في المخزون.'
                  : 'Stock-Only Mode: Zero ICE, zero invoice numbers, and no official archive record will be created.'}
              </span>
            </div>
          )}

          {/* 4. EXTRACTED / EDITABLE LINE ITEMS TABLE */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <PackagePlus className="w-4 h-4 text-emerald-600" />
                <span>
                  {isAr
                    ? `السلع المراد زيادتها للمخزون (${activeItemsCount})`
                    : `Items to Add to Inventory (${activeItemsCount})`}
                </span>
              </h3>
              <button
                type="button"
                onClick={addManualLine}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة سطر يدوياً' : 'Add Row'}</span>
              </button>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-2.5 text-center">#</th>
                    <th className="py-2 px-2.5 text-start">{isAr ? 'اسم السلعة' : 'Item Name'}</th>
                    <th className="py-2 px-2.5 text-start">
                      {isAr ? 'الربط مع المخزون' : 'Catalog Link'}
                    </th>
                    <th className="py-2 px-2.5 text-end">{isAr ? 'الكمية (+)' : 'Qty (+)'}</th>
                    <th className="py-2 px-2.5 text-end">{isAr ? 'الشراء' : 'Cost'}</th>
                    <th className="py-2 px-2.5 text-end">{isAr ? 'البيع' : 'Sell'}</th>
                    <th className="py-2 px-2.5 text-center">{isAr ? 'حذف' : 'Del'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-8 text-center text-xs text-slate-500 dark:text-slate-400"
                      >
                        {isAr
                          ? 'صور الفاتورة أعلاه لتقرأها الكاميرا تلقائياً، أو أضف السلع يدوياً بالزر أعلاه.'
                          : 'Snap or upload an invoice above, or click Add Row to enter manually.'}
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => (
                      <tr
                        key={it.id}
                        className={it.include ? '' : 'opacity-45 bg-slate-50 dark:bg-slate-800/30'}
                      >
                        <td className="py-2 px-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={it.include}
                            onChange={(e) => updateLine(it.id, { include: e.target.checked })}
                            className="w-4 h-4 accent-emerald-600"
                          />
                        </td>
                        <td className="py-2 px-2.5 min-w-[140px]">
                          <input
                            type="text"
                            value={it.rawName}
                            onChange={(e) => updateLine(it.id, { rawName: e.target.value })}
                            placeholder={isAr ? 'اسم السلعة...' : 'Product name'}
                            className="w-full px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white"
                          />
                        </td>
                        <td className="py-2 px-2.5 min-w-[160px]">
                          <select
                            value={it.matchedProductId}
                            onChange={(e) => handleSelectCatalogMatch(it.id, e.target.value)}
                            className="w-full px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-800 dark:text-slate-200"
                          >
                            <option value="">
                              {isAr ? '+ إنشاء كسلعة جديدة بالمخزون' : '+ Create new item'}
                            </option>
                            {products.slice(0, 250).map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({isAr ? `الحالي: ${p.stock}` : `cur: ${p.stock}`})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-2.5 text-end">
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
                            className="w-16 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-end font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400"
                          />
                        </td>
                        <td className="py-2 px-2.5 text-end">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={it.unitCost}
                            onChange={(e) =>
                              updateLine(it.id, {
                                unitCost: Math.max(0, Number(e.target.value) || 0)
                              })
                            }
                            className="w-16 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-end font-mono tabular-nums"
                          />
                        </td>
                        <td className="py-2 px-2.5 text-end">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={it.sellPrice}
                            onChange={(e) =>
                              updateLine(it.id, {
                                sellPrice: Math.max(0, Number(e.target.value) || 0)
                              })
                            }
                            className="w-16 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-end font-mono tabular-nums"
                          />
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
                    ? `تأكيد: زيادة المخزون + أرشيف ICE (${activeItemsCount})`
                    : `Save Official ICE Archive & Stock (${activeItemsCount})`
                  : isAr
                  ? `تأكيد: زيادة المخزون فقط - نوار (${activeItemsCount})`
                  : `Add to Inventory Only - Noir (${activeItemsCount})`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
