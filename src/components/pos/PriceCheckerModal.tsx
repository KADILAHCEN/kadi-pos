import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserCodeReader, BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import {
  Barcode,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  Flashlight,
  ImagePlus,
  PackagePlus,
  RefreshCw,
  ScanLine,
  Search,
  ShoppingCart,
  Tag,
  X,
  AlertCircle
} from 'lucide-react';
import { usePos } from '../../context/PosContext';
import { Product } from '../../types';
import { bluetoothScanner } from '../../utils/bluetoothScanner';
import { playSound } from '../../utils/audio';

export const PriceCheckerModal: React.FC = () => {
  const { products, categories, addToCart, settings, currencySymbol, language } = usePos();
  const isAr = language === 'ar';

  const [isOpen, setIsOpen] = useState(false);
  const [foundProductId, setFoundProductId] = useState<string | null>(null);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);
  const [showAchat, setShowAchat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [addedToast, setAddedToast] = useState(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraRetryNonce, setCameraRetryNonce] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  const foundProduct: Product | undefined = useMemo(
    () => (foundProductId ? products.find((p) => p.id === foundProductId) : undefined),
    [foundProductId, products]
  );

  const stopCamera = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      // ignore
    }
    controlsRef.current = null;
    try {
      BrowserCodeReader.releaseAllStreams();
    } catch {
      // ignore
    }
    setCameraActive(false);
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const closeModal = useCallback(() => {
    stopCamera();
    bluetoothScanner.popScope('price_checker');
    setIsOpen(false);
  }, [stopCamera]);

  const lookupBarcode = useCallback(
    (rawCode: string, fromUserAction = false) => {
      const code = rawCode.trim();
      if (!code) return;

      const now = Date.now();
      if (
        !fromUserAction &&
        lastScanRef.current.code === code &&
        now - lastScanRef.current.time < 1300
      ) {
        return;
      }
      lastScanRef.current = { code, time: now };

      const matched = products.find(
        (p) =>
          p.barcode === code ||
          p.sku.toLowerCase() === code.toLowerCase() ||
          p.id === code
      );

      if (matched) {
        setFoundProductId(matched.id);
        setNotFoundCode(null);
        setShowAchat(false);
        setAddedToast(false);
        if (settings.enableSoundEffects) playSound('beep');
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(25);
        }
      } else {
        setFoundProductId(null);
        setNotFoundCode(code);
        setShowAchat(false);
        setAddedToast(false);
        if (settings.enableSoundEffects) playSound('error');
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate([25, 30, 25]);
        }
      }
    },
    [products, settings.enableSoundEffects]
  );

  const lookupRef = useRef(lookupBarcode);
  useEffect(() => {
    lookupRef.current = lookupBarcode;
  }, [lookupBarcode]);

  // Global open trigger: 'kadi:open-price-checker'
  useEffect(() => {
    const handleOpen = () => {
      setFoundProductId(null);
      setNotFoundCode(null);
      setShowAchat(false);
      setSearchQuery('');
      setAddedToast(false);
      setCameraError(null);
      lastScanRef.current = { code: '', time: 0 };
      setIsOpen(true);
      setCameraRetryNonce((n) => n + 1);
    };
    window.addEventListener('kadi:open-price-checker', handleOpen);
    return () => window.removeEventListener('kadi:open-price-checker', handleOpen);
  }, []);

  // Bluetooth scanner priority & QuickNewBarcodeProduct created feedback while open
  useEffect(() => {
    if (!isOpen) {
      bluetoothScanner.popScope('price_checker');
      return;
    }

    bluetoothScanner.pushScope('price_checker');

    const unsubScan = bluetoothScanner.onScan((payload) => {
      if (bluetoothScanner.getActiveScope() !== 'price_checker') return;
      lookupRef.current(payload.barcode, true);
    });

    const handleQuickCreated = (evt: Event) => {
      const detail = (evt as CustomEvent<{ product?: Product; sourceContext?: string }>).detail;
      if (detail?.sourceContext !== 'price_checker' || !detail.product) return;
      setFoundProductId(detail.product.id);
      setNotFoundCode(null);
      setShowAchat(false);
    };

    window.addEventListener('kadi:quick-barcode-product-created', handleQuickCreated);
    return () => {
      unsubScan();
      bluetoothScanner.popScope('price_checker');
      window.removeEventListener('kadi:quick-barcode-product-created', handleQuickCreated);
    };
  }, [isOpen]);

  // Live ZXing Camera loop while open
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    let mounted = true;

    async function startLiveCamera() {
      setCameraError(null);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (mounted) {
          setCameraError(
            isAr
              ? 'الكاميرا غير مدعومة هنا — استعمل خانة البحث أو صورة الباركود أو قارئ البلوتوث.'
              : 'Camera unavailable — use search, photo scan, or Bluetooth scanner.'
          );
        }
        return;
      }

      try {
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.QR_CODE
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 180,
          delayBetweenScanSuccess: 900
        });

        if (!videoRef.current) return;

        const controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          },
          videoRef.current,
          (result) => {
            if (!mounted || !result) return;
            const txt = result.getText();
            if (txt) lookupRef.current(txt);
          }
        );

        if (!mounted) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
        setCameraActive(true);

        try {
          const caps = controls.streamVideoCapabilitiesGet?.((track) => [track]);
          if (caps && 'torch' in caps && (caps as { torch?: boolean }).torch) {
            setTorchSupported(true);
          }
          const tracks = (videoRef.current?.srcObject as MediaStream | null)?.getVideoTracks?.() || [];
          if (tracks[0]) {
            tracks[0]
              .applyConstraints({
                advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet]
              })
              .catch(() => {});
          }
        } catch {
          // optional
        }
      } catch {
        if (mounted) {
          setCameraActive(false);
          setCameraError(
            isAr
              ? 'تعذر فتح الكاميرا — اضغط إعادة المحاولة أو اكتب الباركود / اسم السلعة.'
              : 'Could not open camera — retry or search manually.'
          );
        }
      }
    }

    void startLiveCamera();
    return () => {
      mounted = false;
      stopCamera();
    };
  }, [isOpen, cameraRetryNonce, isAr, stopCamera]);

  const handleToggleTorch = async () => {
    try {
      const next = !torchOn;
      await controlsRef.current?.streamVideoConstraintsApply?.({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet]
      });
      setTorchOn(next);
    } catch {
      // ignore
    }
  };

  const handleImageFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const url = URL.createObjectURL(file);
    try {
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(url);
      const txt = result?.getText()?.trim();
      if (txt) {
        lookupBarcode(txt, true);
      } else {
        setNotFoundCode('');
        setFoundProductId(null);
      }
    } catch {
      setCameraError(
        isAr ? 'ما بانش الباركود واضح فالتصويرة — جرب تصويرة أوضح.' : 'Barcode not found in image.'
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const manualMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.nameEn.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [products, searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    const byCode = products.find(
      (p) => p.barcode === q || p.sku.toLowerCase() === q.toLowerCase()
    );
    if (byCode) {
      lookupBarcode(byCode.barcode || byCode.sku, true);
      return;
    }
    if (manualMatches.length > 0) {
      const first = manualMatches[0];
      setFoundProductId(first.id);
      setNotFoundCode(null);
      setShowAchat(false);
      setAddedToast(false);
      if (settings.enableSoundEffects) playSound('beep');
      return;
    }
    lookupBarcode(q, true);
  };

  if (!isOpen) return null;

  const foundCategory = foundProduct
    ? categories.find((c) => c.id === foundProduct.categoryId)
    : undefined;
  const riyalPrice = foundProduct ? Math.round(foundProduct.price * 20) : 0;
  const unitProfit = foundProduct ? foundProduct.price - foundProduct.costPrice : 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="w-full max-w-xl max-h-[94vh] rounded-3xl bg-slate-950 border border-slate-800 text-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                {isAr ? 'شحال الثمن' : 'Price Checker'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {isAr
                  ? `فحص سريع من مخزون الحانوت (${products.length} منتج مسجل)`
                  : `Instant check from store inventory (${products.length} items)`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
            aria-label={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3.5">
          {/* Camera Scanner Viewport */}
          <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-800 min-h-[210px] flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-56 sm:h-64 object-cover"
            />

            {/* Aim Overlay Frame */}
            {cameraActive && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-56 h-28 rounded-2xl border-2 border-amber-400/90 shadow-[0_0_0_999px_rgba(0,0,0,0.35)] relative">
                  <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 h-0.5 bg-rose-500/80 animate-pulse" />
                </div>
              </div>
            )}

            {/* Top Camera Action Controls */}
            <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="px-2.5 py-1.5 rounded-xl bg-slate-900/85 hover:bg-slate-800 border border-slate-700 text-[11px] font-bold text-white flex items-center gap-1.5 backdrop-blur-xs"
              >
                <ImagePlus className="w-3.5 h-3.5 text-amber-400" />
                <span>{isAr ? 'من صورة' : 'Photo'}</span>
              </button>

              <div className="flex items-center gap-1.5">
                {torchSupported && (
                  <button
                    type="button"
                    onClick={() => void handleToggleTorch()}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1 backdrop-blur-xs ${
                      torchOn
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-900/85 text-white border border-slate-700'
                    }`}
                  >
                    <Flashlight className="w-3.5 h-3.5" />
                    <span>{isAr ? 'فلاش' : 'Flash'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setCameraRetryNonce((n) => n + 1)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-900/85 hover:bg-slate-800 border border-slate-700 text-[11px] font-bold text-white flex items-center gap-1 backdrop-blur-xs"
                  title={isAr ? 'إعادة تشغيل الكاميرا' : 'Restart camera'}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => void handleImageFileScan(e)}
              className="hidden"
            />
          </div>

          <div className="text-center text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5">
            <ScanLine className="w-4 h-4 text-amber-400" />
            <span>
              {isAr
                ? 'وجّه الكاميرا نحو الباركود لمسح المنتج'
                : 'Point the camera at a barcode to check price'}
            </span>
          </div>

          {cameraError && (
            <div className="px-3.5 py-2.5 rounded-xl bg-amber-950/50 border border-amber-800 text-amber-200 text-xs flex items-center justify-between gap-2">
              <span>{cameraError}</span>
              <button
                type="button"
                onClick={() => setCameraRetryNonce((n) => n + 1)}
                className="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 text-[11px] font-black shrink-0"
              >
                {isAr ? 'إعادة' : 'Retry'}
              </button>
            </div>
          )}

          {/* Quick Manual Search / Barcode Fallback */}
          <form onSubmit={handleSearchSubmit} className="space-y-1.5">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    isAr
                      ? 'أو اكتب الباركود / اسم السلعة يدوياً...'
                      : 'Or enter barcode / product name...'
                  }
                  className="w-full ps-9 pe-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white placeholder:text-slate-500 font-semibold focus:outline-none focus:border-amber-400"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-black shrink-0"
              >
                {isAr ? 'فحص' : 'Check'}
              </button>
            </div>

            {manualMatches.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {manualMatches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setFoundProductId(m.id);
                      setNotFoundCode(null);
                      setShowAchat(false);
                      setAddedToast(false);
                      setSearchQuery('');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-bold text-slate-200 flex items-center gap-1.5"
                  >
                    <span>{m.name}</span>
                    <span className="font-mono text-emerald-400">
                      {m.price.toFixed(2)} {currencySymbol}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </form>

          {/* RESULT AREA */}
          {foundProduct ? (
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 border-2 border-emerald-500/80 space-y-4 shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {foundProduct.image ? (
                    <img
                      src={foundProduct.image}
                      alt={foundProduct.name}
                      className="w-14 h-14 rounded-xl object-cover border border-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                      <Barcode className="w-6 h-6 text-emerald-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-base sm:text-lg font-black text-white truncate">
                      {isAr ? foundProduct.name : foundProduct.nameEn || foundProduct.name}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-400">
                      {foundProduct.barcode && (
                        <span className="px-2 py-0.5 rounded bg-slate-800 font-mono text-slate-300">
                          {foundProduct.barcode}
                        </span>
                      )}
                      {foundCategory && (
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {isAr ? foundCategory.name : foundCategory.nameEn}
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          foundProduct.stock <= foundProduct.lowStockThreshold
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        }`}
                      >
                        {isAr ? `المخزون: ${foundProduct.stock}` : `Stock: ${foundProduct.stock}`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* BIG PRICE DISPLAY */}
              <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-700/70 text-center space-y-1">
                <div className="text-[11px] font-bold text-emerald-300">
                  {isAr ? 'ثمن البيع' : 'Sell Price'}
                </div>
                <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-emerald-400">
                  {foundProduct.price.toFixed(2)}{' '}
                  <span className="text-xl sm:text-2xl">{currencySymbol}</span>
                </div>
                {isAr && (
                  <div className="text-sm font-black text-amber-300 font-mono">
                    ≈ {riyalPrice.toLocaleString('en-US')} ريال
                  </div>
                )}
              </div>

              {/* Privacy-First Cost Price Toggle (showAchat = false by default) */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowAchat((v) => !v)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700/90 border border-slate-700 text-xs font-bold text-slate-300 flex items-center justify-center gap-2 transition-colors"
                >
                  {showAchat ? (
                    <>
                      <EyeOff className="w-4 h-4 text-amber-400" />
                      <span>{isAr ? 'إخفاء ثمن الشراء (الأشا)' : 'Hide Cost Price'}</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 text-slate-400" />
                      <span>
                        {isAr ? 'إظهار ثمن الشراء (خاص بالتاجر فقط)' : 'Show Cost Price (Merchant Only)'}
                      </span>
                    </>
                  )}
                </button>

                {showAchat && (
                  <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                    <div>
                      <div className="text-slate-400 text-[11px]">
                        {isAr ? 'ثمن الشراء (Achat):' : 'Cost Price:'}
                      </div>
                      <div className="font-mono font-black text-amber-300 text-sm">
                        {foundProduct.costPrice.toFixed(2)} {currencySymbol}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[11px]">
                        {isAr ? 'الربح الصافي للوحدة:' : 'Unit Profit:'}
                      </div>
                      <div className="font-mono font-black text-emerald-400 text-sm">
                        +{unitProfit.toFixed(2)} {currencySymbol}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    addToCart(foundProduct);
                    setAddedToast(true);
                    if (settings.enableSoundEffects) playSound('beep');
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-2"
                >
                  {addedToast ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isAr ? 'تزادت للسلة!' : 'Added to Cart!'}</span>
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-4 h-4" />
                      <span>{isAr ? 'أضف للسلة' : 'Add to Cart'}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFoundProductId(null);
                    setNotFoundCode(null);
                    setShowAchat(false);
                    setAddedToast(false);
                  }}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5"
                >
                  <Camera className="w-4 h-4" />
                  <span>{isAr ? 'مسح منتج آخر' : 'Scan Next'}</span>
                </button>
              </div>
            </div>
          ) : notFoundCode !== null ? (
            <div className="p-4 sm:p-5 rounded-2xl bg-rose-950/40 border border-rose-700/80 text-center space-y-3">
              <div className="flex items-center justify-center gap-2 text-rose-300 text-sm font-black">
                <AlertCircle className="w-5 h-5" />
                <span>
                  {isAr
                    ? 'هذا المنتج غير مسجل في المخزون'
                    : 'This product is not registered in inventory'}
                </span>
              </div>
              {notFoundCode && (
                <div className="inline-block px-3 py-1 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-slate-300">
                  {notFoundCode}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {notFoundCode && (
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent('kadi:open-quick-new-barcode', {
                          detail: { barcode: notFoundCode, sourceContext: 'price_checker' }
                        })
                      );
                    }}
                    className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-black flex items-center gap-1.5"
                  >
                    <PackagePlus className="w-4 h-4" />
                    <span>{isAr ? 'سجّل السلعة دابا (مع بحث تلقائي)' : 'Register Item Now'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setNotFoundCode(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
                >
                  {isAr ? 'مسح مرة أخرى' : 'Scan Again'}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 text-center text-xs text-slate-400 space-y-1">
              <div className="font-bold text-slate-200">
                {isAr
                  ? 'في انتظار قراءة الباركود...'
                  : 'Waiting for barcode scan...'}
              </div>
              <div>
                {isAr
                  ? 'اسكان بالكاميرا، قارئ البلوتوث، أو اكتب الباركود/الاسم الفوق لمعرفة الثمن فوراً.'
                  : 'Use live camera, Bluetooth scanner, or search above.'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
