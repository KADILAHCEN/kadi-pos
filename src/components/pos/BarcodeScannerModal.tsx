import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePos } from '../../context/PosContext';
import { getT } from '../../utils/translations';
import { playSound } from '../../utils/audio';
import { BrowserMultiFormatReader, BrowserCodeReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import {
  Barcode,
  QrCode,
  Camera,
  X,
  Check,
  RefreshCw,
  Zap,
  ImagePlus,
  Layers,
  AlertCircle,
  ScanLine
} from 'lucide-react';

type ScanFormatMode = 'all' | 'barcode' | 'qr';

interface BarcodeScannerModalProps {
  onClose: () => void;
  onScanned: (code: string) => void;
  mode?: 'pos' | 'field';
  title?: string;
  defaultScanFormat?: ScanFormatMode;
}

function resolveScannedPayload(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return '';

  // Support JSON product QR payloads: {"barcode":"...","sku":"...","code":"..."}
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const candidate = parsed.barcode ?? parsed.sku ?? parsed.code ?? parsed.id;
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
      if (typeof candidate === 'number') {
        return String(candidate);
      }
    } catch {
      // Not valid JSON; treat as literal code
    }
  }

  // Support URL product QR payloads containing barcode/sku/code/product query param
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const paramCode =
        url.searchParams.get('barcode') ||
        url.searchParams.get('sku') ||
        url.searchParams.get('code') ||
        url.searchParams.get('product');
      if (paramCode && paramCode.trim()) {
        return paramCode.trim();
      }
    } catch {
      // Invalid URL; keep literal string
    }
  }

  return trimmed;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  onClose,
  onScanned,
  mode = 'pos',
  title,
  defaultScanFormat = 'all'
}) => {
  const { products, language, settings } = usePos();
  const t = getT(language);
  const isAr = language === 'ar';

  const [scanFormatMode, setScanFormatMode] = useState<ScanFormatMode>(defaultScanFormat);
  const [manualCode, setManualCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [continuousMode, setContinuousMode] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<
    {
      id: string;
      code: string;
      productName?: string;
      found: boolean;
      scannedAt: string;
      count: number;
      isQr?: boolean;
    }[]
  >([]);
  const [lastScannedBanner, setLastScannedBanner] = useState<{
    code: string;
    productName?: string;
    found: boolean;
    isQr?: boolean;
  } | null>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [imageScanMsg, setImageScanMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const isClosingRef = useRef(false);

  // Build ZXing MultiFormatReader configured according to selected scan format mode
  const createReader = useCallback(() => {
    const linearFormats = [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_93,
      BarcodeFormat.ITF,
      BarcodeFormat.CODABAR
    ];
    const qrFormats = [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.AZTEC,
      BarcodeFormat.PDF_417
    ];

    const formats =
      scanFormatMode === 'barcode'
        ? linearFormats
        : scanFormatMode === 'qr'
        ? qrFormats
        : [...linearFormats, ...qrFormats];

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
    hints.set(DecodeHintType.TRY_HARDER, true);
    return new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 180,
      delayBetweenScanSuccess: 900
    });
  }, [scanFormatMode]);

  const stopScanner = useCallback(() => {
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

  const handleDetectedCode = useCallback(
    (rawCode: string, format?: BarcodeFormat) => {
      const literal = rawCode.trim();
      if (!literal || isClosingRef.current) return;

      const directMatch = products.find(
        (p) => p.barcode === literal || p.sku.toLowerCase() === literal.toLowerCase()
      );
      const code = directMatch ? literal : resolveScannedPayload(literal);
      if (!code) return;

      const now = Date.now();
      // Cooldown prevents scanning the exact same frame repeatedly
      const cooldownMs = continuousMode ? 1200 : 1800;
      if (lastScanRef.current.code === code && now - lastScanRef.current.time < cooldownMs) {
        return;
      }
      lastScanRef.current = { code, time: now };

      const matched =
        directMatch ||
        products.find(
          (p) =>
            p.barcode === code ||
            p.sku.toLowerCase() === code.toLowerCase() ||
            p.id === code
        );

      const isQr =
        format === BarcodeFormat.QR_CODE ||
        format === BarcodeFormat.DATA_MATRIX ||
        format === BarcodeFormat.AZTEC ||
        scanFormatMode === 'qr';

      // Distinct crisp audio chime + haptic pulse for every successful scan in Smart Reader Mode or when sounds enabled
      if (continuousMode || settings.enableSoundEffects) {
        playSound(matched || mode === 'field' ? 'beep' : 'error');
      }
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(matched ? 22 : [25, 30, 25]);
      }

      const productName = matched ? (isAr ? matched.name : matched.nameEn) : undefined;

      setLastScannedBanner({
        code,
        productName,
        found: !!matched,
        isQr
      });

      if (continuousMode) {
        setSessionHistory((prev) => {
          const existingIdx = prev.findIndex((item) => item.code === code);
          const timeLabel = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
          if (existingIdx >= 0) {
            const updated = [...prev];
            const current = updated[existingIdx];
            updated.splice(existingIdx, 1);
            return [
              { ...current, count: current.count + 1, scannedAt: timeLabel },
              ...updated
            ];
          }
          return [
            {
              id: `${code}-${now}`,
              code,
              productName,
              found: !!matched,
              scannedAt: timeLabel,
              count: 1,
              isQr
            },
            ...prev
          ];
        });
      }

      onScanned(matched ? matched.barcode || matched.sku || code : code);

      if (!continuousMode || mode === 'field') {
        isClosingRef.current = true;
        setTimeout(() => {
          stopScanner();
          onClose();
        }, 180);
      }
    },
    [continuousMode, mode, isAr, onClose, onScanned, products, scanFormatMode, settings.enableSoundEffects, stopScanner]
  );

  // Keep latest callback ref so ZXing continuous loop doesn't restart unnecessarily
  const detectedCallbackRef = useRef(handleDetectedCode);
  useEffect(() => {
    detectedCallbackRef.current = handleDetectedCode;
  }, [handleDetectedCode]);

  // Enumerate cameras and start live barcode scanner
  useEffect(() => {
    let mounted = true;
    isClosingRef.current = false;

    async function initAndStartCamera() {
      setCameraError(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (mounted) {
          setCameraError(
            isAr
              ? 'المتصفح لا يدعم الوصول المباشر للكاميرا. يمكنك مسح صورة باركود أو إدخال الرقم يدوياً.'
              : 'Camera API unavailable. Scan from image or enter barcode manually.'
          );
        }
        return;
      }

      try {
        const reader = createReader();
        readerRef.current = reader;

        if (!videoRef.current) return;

        const constraints: MediaStreamConstraints = selectedDeviceId
          ? {
              video: {
                deviceId: { exact: selectedDeviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 }
              }
            }
          : {
              video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 }
              }
            };

        const controls = await reader.decodeFromConstraints(
          constraints,
          videoRef.current,
          (result) => {
            if (!mounted || !result) return;
            const text = result.getText();
            if (text) {
              detectedCallbackRef.current(text, result.getBarcodeFormat?.());
            }
          }
        );

        if (!mounted) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
        setCameraActive(true);

        // Check if torch / flash is supported
        try {
          const caps = controls.streamVideoCapabilitiesGet?.((track) => [track]);
          if (caps && 'torch' in caps && (caps as { torch?: boolean }).torch) {
            setTorchSupported(true);
          }
        } catch {
          // Torch capability check not supported on this browser
        }

        // Populate camera list after permission is granted so labels are available
        try {
          const videoDevices = await BrowserCodeReader.listVideoInputDevices();
          if (mounted) {
            setDevices(videoDevices);
          }
        } catch {
          // ignore device enumeration errors
        }
      } catch (err) {
        if (mounted) {
          setCameraActive(false);
          setCameraError(
            isAr
              ? 'تعذر فتح الكاميرا (يرجى السماح بصلاحية الكاميرا)، أو استخدم خيار «مسح من صورة» / الإدخال اليدوي.'
              : 'Camera access denied or unavailable. Try scanning from an image or manual entry.'
          );
        }
      }
    }

    initAndStartCamera();

    return () => {
      mounted = false;
      stopScanner();
    };
  }, [selectedDeviceId, createReader, stopScanner, isAr]);

  const handleToggleTorch = async () => {
    if (!controlsRef.current?.switchTorch) return;
    try {
      const next = !torchOn;
      await controlsRef.current.switchTorch(next);
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  const handleSwitchCamera = () => {
    if (devices.length < 2) return;
    const currentIndex = devices.findIndex((d) => d.deviceId === selectedDeviceId);
    const nextIndex = (currentIndex + 1) % devices.length;
    stopScanner();
    setSelectedDeviceId(devices[nextIndex].deviceId);
  };

  const handleScanFromImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageScanMsg(null);

    const objectUrl = URL.createObjectURL(file);
    try {
      const reader = readerRef.current || createReader();
      const result = await reader.decodeFromImageUrl(objectUrl);
      const text = result.getText();
      if (text) {
        handleDetectedCode(text, result.getBarcodeFormat?.());
      } else {
        playSound('error');
        setImageScanMsg(
          isAr
            ? 'لم يتم العثور على باركود أو رمز QR واضح في الصورة.'
            : 'No barcode or QR code detected in image.'
        );
      }
    } catch {
      playSound('error');
      setImageScanMsg(
        isAr
          ? 'تعذر قراءة الباركود من هذه الصورة. تأكد من وضوح الخطوط والأرقام.'
          : 'Could not read barcode from image. Ensure clear focus.'
      );
    } finally {
      URL.revokeObjectURL(objectUrl);
      if (e.target) e.target.value = '';
    }
  };

  const handleSubmitManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      handleDetectedCode(manualCode.trim());
      if (continuousMode) {
        setManualCode('');
      }
    }
  };

  const totalSessionScans = sessionHistory.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <ScanLine className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 dark:text-white text-sm sm:text-base flex items-center gap-2">
                <span>
                  {title ||
                    (scanFormatMode === 'qr'
                      ? isAr
                        ? 'ماسح رموز QR للمنتجات'
                        : 'Product QR Code Scanner'
                      : isAr
                      ? 'الماسح الضوئي الذكي (باركود و QR)'
                      : t.scan_barcode)}
                </span>
                {continuousMode && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-white">
                    {isAr ? 'متتالي' : 'SMART'}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isAr
                  ? 'يدعم الباركود الخطي (EAN-13 / Code-128) ورموز QR للمنتجات'
                  : 'Supports linear barcodes (EAN-13, Code-128) & product QR codes'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Scan Format Mode Selector: All / Linear Barcode / Product QR Code */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setScanFormatMode('all')}
              className={`py-2 px-2 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 transition-all ${
                scanFormatMode === 'all'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ScanLine className="w-3.5 h-3.5 shrink-0" />
              <span>{isAr ? 'باركود + QR' : 'All Codes'}</span>
            </button>
            <button
              type="button"
              onClick={() => setScanFormatMode('barcode')}
              className={`py-2 px-2 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 transition-all ${
                scanFormatMode === 'barcode'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Barcode className="w-3.5 h-3.5 shrink-0" />
              <span>{isAr ? 'باركود خطي' : '1D Barcode'}</span>
            </button>
            <button
              type="button"
              onClick={() => setScanFormatMode('qr')}
              className={`py-2 px-2 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 transition-all ${
                scanFormatMode === 'qr'
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <QrCode className="w-3.5 h-3.5 shrink-0" />
              <span>{isAr ? 'رمز QR للمنتجات' : 'Product QR'}</span>
            </button>
          </div>

          {/* Smart Reader Continuous Mode Banner Pill (POS Mode) */}
          {mode === 'pos' && (
            <button
              type="button"
              onClick={() => setContinuousMode((prev) => !prev)}
              className={`w-full p-3 rounded-2xl border text-start flex items-center justify-between gap-3 transition-all active:scale-[0.99] ${
                continuousMode
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/20'
                  : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-emerald-400'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    continuousMode
                      ? 'bg-white/20 text-white'
                      : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  <Zap className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-black flex items-center gap-1.5">
                    <span>{isAr ? 'وضع القارئ الذكي (مسح متتالي)' : 'Smart Reader Mode (Continuous Scan)'}</span>
                  </div>
                  <div
                    className={`text-[11px] truncate ${
                      continuousMode ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {continuousMode
                      ? isAr
                        ? 'مفعّل — امسح عدة منتجات متتالية دون إغلاق الكاميرا'
                        : 'Active — Scan multiple items back-to-back without closing'
                      : isAr
                      ? 'اضغط لتفعيل المسح المستمر لعدة سلع مع صوت تنبيه مميز'
                      : 'Tap to scan multiple items continuously with chime'}
                  </div>
                </div>
              </div>
              <div
                className={`px-2.5 py-1 rounded-xl text-[11px] font-black shrink-0 ${
                  continuousMode
                    ? 'bg-white text-emerald-700'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {continuousMode ? (isAr ? 'مفعّل ✓' : 'ON ✓') : isAr ? 'تشغيل' : 'OFF'}
              </div>
            </button>
          )}

          {/* Live Camera Viewport */}
          <div className="relative aspect-16/10 w-full bg-slate-950 rounded-2xl overflow-hidden flex items-center justify-center border-2 border-slate-800 shadow-inner">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${cameraActive ? 'opacity-100' : 'opacity-0'}`}
            />

            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 text-xs text-center p-5 gap-2">
                <Camera className="w-9 h-9 text-emerald-400 opacity-80" />
                <span className="max-w-xs leading-relaxed">
                  {cameraError || (isAr ? 'جاري تشغيل الكاميرا وتهيئة الماسح...' : 'Starting camera & barcode engine...')}
                </span>
              </div>
            )}

            {/* Targeting Frame & Scanning Laser (adapts between wide Barcode and square QR reticle) */}
            {cameraActive && (
              <>
                {scanFormatMode === 'qr' ? (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="relative w-44 h-44 sm:w-48 sm:h-48 border-2 border-indigo-400/80 rounded-2xl shadow-[0_0_0_9999px_rgba(2,6,23,0.45)] flex items-center justify-center">
                      <QrCode className="w-10 h-10 text-indigo-300/40" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="absolute inset-6 sm:inset-8 border-2 border-emerald-400/70 rounded-2xl pointer-events-none shadow-[0_0_0_9999px_rgba(2,6,23,0.38)]" />
                    <div className="absolute inset-x-10 top-1/2 -translate-y-1/2 h-0.5 bg-rose-500 shadow-[0_0_12px_#f43f5e] animate-pulse pointer-events-none" />
                  </>
                )}

                {/* Top status & controls overlay */}
                <div className="absolute top-3 inset-x-3 flex items-center justify-between gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-full bg-slate-950/75 text-[10px] font-bold flex items-center gap-1.5 backdrop-blur-xs ${
                      scanFormatMode === 'qr' ? 'text-indigo-300' : 'text-emerald-300'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full animate-ping ${
                        scanFormatMode === 'qr' ? 'bg-indigo-400' : 'bg-emerald-400'
                      }`}
                    />
                    <span>
                      {continuousMode
                        ? isAr
                          ? `القارئ الذكي نشط (${totalSessionScans} ممسوح)`
                          : `Smart Scan (${totalSessionScans} scanned)`
                        : scanFormatMode === 'qr'
                        ? isAr
                          ? 'وجّه الكاميرا نحو رمز QR للمنتج'
                          : 'Point camera at product QR code'
                        : scanFormatMode === 'barcode'
                        ? isAr
                          ? 'وجّه الكاميرا نحو الباركود الخطي'
                          : 'Point camera at 1D barcode'
                        : isAr
                        ? 'وجّه الكاميرا نحو الباركود أو رمز QR'
                        : 'Point camera at barcode or QR code'}
                    </span>
                  </span>

                  <div className="flex items-center gap-1.5">
                    {torchSupported && (
                      <button
                        type="button"
                        onClick={handleToggleTorch}
                        className={`p-2 rounded-xl backdrop-blur-xs transition-colors ${
                          torchOn
                            ? 'bg-amber-400 text-slate-950'
                            : 'bg-slate-950/70 text-white hover:bg-slate-900'
                        }`}
                        title={isAr ? 'تشغيل/إيقاف الفلاش' : 'Toggle Flashlight'}
                      >
                        <Zap className="w-4 h-4" />
                      </button>
                    )}

                    {devices.length > 1 && (
                      <button
                        type="button"
                        onClick={handleSwitchCamera}
                        className="p-2 rounded-xl bg-slate-950/70 hover:bg-slate-900 text-white backdrop-blur-xs transition-colors flex items-center gap-1 text-[10px] font-bold"
                        title={isAr ? 'تبديل الكاميرا' : 'Switch Camera'}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{isAr ? 'تبديل' : 'Flip'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Scan Feedback Banner */}
          {lastScannedBanner && (
            <div
              className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 animate-in fade-in ${
                lastScannedBanner.found || mode === 'field'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {lastScannedBanner.found || mode === 'field' ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <div className="truncate">
                  {lastScannedBanner.productName
                    ? `${isAr ? 'تم مسح وإضافة:' : 'Scanned & added:'} ${lastScannedBanner.productName}`
                    : `${isAr ? 'تم التقاط الكود:' : 'Code read:'} ${lastScannedBanner.code}`}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="px-1.5 py-0.5 rounded bg-slate-900/10 dark:bg-white/10 text-[9px] font-black">
                  {lastScannedBanner.isQr ? 'QR' : '1D'}
                </span>
                <span className="font-mono text-[11px]">{lastScannedBanner.code}</span>
              </div>
            </div>
          )}

          {/* Continuous Multi-Scan Session History Queue */}
          {continuousMode && sessionHistory.length > 0 && (
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-black text-emerald-800 dark:text-emerald-300">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>
                    {isAr
                      ? `سجل الجلسة (${totalSessionScans} منتج ممسوح)`
                      : `Session Queue (${totalSessionScans} items)`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    stopScanner();
                    onClose();
                  }}
                  className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black transition-colors"
                >
                  {isAr ? `إتمام وإنهاء (${totalSessionScans})` : `Done (${totalSessionScans})`}
                </button>
              </div>
              <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                {sessionHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-100 dark:border-slate-800 text-[11px]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-mono font-black shrink-0">
                        ×{item.count}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white truncate">
                        {item.productName || item.code}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">{item.scannedAt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Row: Scan from Image */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <ImagePlus className="w-4 h-4 text-emerald-600" />
              <span>
                {scanFormatMode === 'qr'
                  ? isAr
                    ? 'مسح رمز QR من صورة / ملف'
                    : 'Scan QR from Photo / File'
                  : isAr
                  ? 'مسح باركود / QR من صورة'
                  : 'Scan Barcode / QR from Photo'}
              </span>
            </button>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleScanFromImageFile}
              className="hidden"
            />

            {continuousMode && (
              <button
                type="button"
                onClick={() => {
                  stopScanner();
                  onClose();
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-black flex items-center gap-1.5 hover:opacity-90 transition-opacity"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isAr ? 'إغلاق الماسح والعودة للسلة' : 'Done Scanning'}</span>
              </button>
            )}
          </div>

          {imageScanMsg && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
              {imageScanMsg}
            </div>
          )}

          {/* Manual input */}
          <form onSubmit={handleSubmitManual} className="flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder={
                scanFormatMode === 'qr'
                  ? isAr
                    ? 'أو الصق محتوى رمز QR للمنتج هنا...'
                    : 'Or paste product QR payload/code...'
                  : isAr
                  ? 'أو أدخل رقم الباركود أو QR يدوياً...'
                  : 'Or enter barcode / QR code manually...'
              }
              className="flex-1 px-3.5 py-2.5 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              className="px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shrink-0 flex items-center gap-1.5"
            >
              {scanFormatMode === 'qr' ? <QrCode className="w-4 h-4" /> : <Barcode className="w-4 h-4" />}
              <span>{isAr ? 'تطبيق' : 'Apply'}</span>
            </button>
          </form>

          {/* Quick Barcode presets for one-click testing in POS mode */}
          {mode === 'pos' && products.length > 0 && (
            <div>
              <div className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">
                {isAr ? 'سلع جاهزة للتجربة السريعة:' : 'Quick Barcode Presets:'}
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {products.slice(0, 5).map((prod) => (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => handleDetectedCode(prod.barcode)}
                    className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500 bg-white dark:bg-slate-800/60 text-left rtl:text-right flex items-center justify-between text-xs transition-colors"
                  >
                    <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                      {isAr ? prod.name : prod.nameEn}
                    </span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                      {prod.barcode}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
