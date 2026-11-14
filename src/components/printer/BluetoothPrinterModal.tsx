import React, { useEffect, useState } from 'react';
import { usePos } from '../../context/PosContext';
import { bluetoothPrinter, BluetoothPrinterState } from '../../utils/bluetoothPrinter';
import { playSound } from '../../utils/audio';
import {
  Bluetooth,
  Printer,
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Unplug,
  FileCheck2,
  HelpCircle
} from 'lucide-react';

interface BluetoothPrinterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectedAndPrint?: () => Promise<void> | void;
}

export const BluetoothPrinterModal: React.FC<BluetoothPrinterModalProps> = ({
  isOpen,
  onClose,
  onConnectedAndPrint
}) => {
  const { settings, updateSettings, language } = usePos();
  const isAr = language === 'ar';

  const [printerState, setPrinterState] = useState<BluetoothPrinterState>(() =>
    bluetoothPrinter.getState()
  );
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  useEffect(() => {
    return bluetoothPrinter.subscribe(setPrinterState);
  }, []);

  if (!isOpen) return null;

  const isSupported = bluetoothPrinter.isWebBluetoothSupported();
  const isConnected = printerState.status === 'connected' || printerState.status === 'printing';
  const paperWidth = settings.receiptPaperWidth || '80mm';

  const handlePair = async () => {
    setFeedbackMsg(null);
    const res = await bluetoothPrinter.connect();
    if (res.success && res.deviceName) {
      playSound('success');
      updateSettings({
        printerName: res.deviceName,
        printerConnectionType: 'bluetooth'
      });
      setFeedbackMsg(
        isAr
          ? `تم الاتصال بنجاح بالطابعة: ${res.deviceName}`
          : `Connected successfully to: ${res.deviceName}`
      );
      if (onConnectedAndPrint) {
        await onConnectedAndPrint();
      }
    }
  };

  const handleTestPrint = async () => {
    setFeedbackMsg(null);
    const res = await bluetoothPrinter.printTestPage(
      settings.storeName,
      paperWidth,
      language
    );
    if (res.success) {
      playSound('success');
      setFeedbackMsg(
        isAr
          ? `✅ تم إرسال ورقة الاختبار (${paperWidth}) إلى الطابعة بنجاح!`
          : `✅ Test page (${paperWidth}) sent to printer!`
      );
    } else {
      playSound('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <Bluetooth className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white">
                {isAr ? 'إعداد وربط طابعة البلوتوث الحرارية' : 'Bluetooth Thermal Printer Setup'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isAr
                  ? 'طباعة مباشرة لفواتير 58mm و 80mm بالعربية ورمز QR'
                  : 'Direct ESC/POS printing for 58mm & 80mm BLE thermal printers'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto text-xs">
          {/* Connection Status Card */}
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
              isConnected
                ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isConnected
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300'
                }`}
              >
                <Printer className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="font-black text-slate-900 dark:text-white truncate">
                  {isConnected
                    ? printerState.deviceName || settings.printerName
                    : isAr
                    ? 'لا توجد طابعة بلوتوث متصلة حالياً'
                    : 'No Bluetooth printer connected'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {printerState.status === 'connecting'
                    ? isAr
                      ? 'جاري البحث والاتصال بالطابعة...'
                      : 'Connecting to printer...'
                    : printerState.status === 'printing'
                    ? isAr
                      ? 'جاري إرسال الفاتورة للطابعة...'
                      : 'Sending print job...'
                    : isConnected
                    ? isAr
                      ? `متصلة وجاهزة · مقاس الورق ${paperWidth}`
                      : `Connected & Ready · ${paperWidth}`
                    : isAr
                    ? 'اضغط على «ربط طابعة بلوتوث» لاختيار الطابعة القريبة'
                    : 'Click Pair Printer to select your nearby BLE printer'}
                </div>
              </div>
            </div>

            {isConnected && (
              <button
                type="button"
                onClick={() => bluetoothPrinter.disconnect()}
                className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 font-bold text-[11px] flex items-center gap-1 hover:bg-rose-100 transition-colors shrink-0"
              >
                <Unplug className="w-3.5 h-3.5" />
                <span>{isAr ? 'فصل' : 'Disconnect'}</span>
              </button>
            )}
          </div>

          {/* Compatibility Notice if Web Bluetooth unavailable */}
          {!isSupported && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <div className="font-bold">
                  {isAr ? 'المتصفح الحالي لا يدعم Web Bluetooth المباشر' : 'Web Bluetooth not supported in this browser'}
                </div>
                <div className="text-[11px] mt-0.5">
                  {isAr
                    ? 'للطباعة المباشرة بالبلوتوث افتح التطبيق على Google Chrome أو Edge (أندرويد أو كمبيوتر). كما يمكنك دائماً الطباعة عبر زر «طباعة الفاتورة» العادي في نظام التشغيل.'
                    : 'Use Chrome or Edge on Android/Desktop for direct BLE printing, or use your OS print dialog.'}
                </div>
              </div>
            </div>
          )}

          {/* Paper Size Quick Toggle */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? 'عرض رول الورق الحراري:' : 'Thermal Paper Roll Width:'}
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {(['80mm', '58mm'] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => updateSettings({ receiptPaperWidth: size })}
                  className={`p-3 rounded-2xl border text-start transition-all ${
                    paperWidth === size
                      ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="font-black font-mono text-sm">{size}</div>
                  <div className="text-[10px] opacity-80 mt-0.5">
                    {size === '80mm'
                      ? isAr
                        ? 'طابعات الكاشير المكتبية (576px)'
                        : 'Desktop Cash Printer (576px)'
                      : isAr
                      ? 'طابعات البلوتوث المحمولة الصغيرة (384px)'
                      : 'Portable Handheld Printer (384px)'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Feedback / Error Banners */}
          {printerState.error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{printerState.error}</span>
            </div>
          )}

          {feedbackMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{feedbackMsg}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handlePair}
              disabled={!isSupported || printerState.status === 'connecting' || printerState.status === 'printing'}
              className="py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95"
            >
              {printerState.status === 'connecting' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Bluetooth className="w-4 h-4" />
              )}
              <span>
                {isConnected
                  ? isAr
                    ? 'تغيير / ربط طابعة أخرى'
                    : 'Switch Printer'
                  : isAr
                  ? 'ربط طابعة بلوتوث'
                  : 'Pair Bluetooth Printer'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleTestPrint}
              disabled={!isConnected || printerState.status === 'printing'}
              className="py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-extrabold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95"
            >
              {printerState.status === 'printing' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileCheck2 className="w-4 h-4" />
              )}
              <span>{isAr ? 'طباعة ورقة اختبار' : 'Print Test Receipt'}</span>
            </button>
          </div>

          {/* Supported Models Help Note */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex items-start gap-2.5 text-[11px] text-slate-500 dark:text-slate-400">
            <HelpCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              {isAr
                ? 'يدعم طابعات Xprinter, Rongta, Zjiang, MPT-II, Sunmi, Goojprt وطابعات ESC/POS 58mm / 80mm مع دعم كامل للخط العربي المتصل ورمز QR بدون تعقيد.'
                : 'Supports Xprinter, Rongta, Zjiang, MPT-II, Sunmi, Goojprt & standard ESC/POS BLE printers with crisp Arabic RTL & QR raster rendering.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
