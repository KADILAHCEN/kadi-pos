import React, { useState, useEffect } from 'react';
import { usePos } from '../../context/PosContext';
import { getT } from '../../utils/translations';
import { bluetoothScanner, ScannedBarcodePayload } from '../../utils/bluetoothScanner';
import {
  Bluetooth,
  Wifi,
  Zap,
  CheckCircle2,
  AlertTriangle,
  X,
  Volume2,
  Settings2,
  HelpCircle,
  ShoppingBag,
  Plus,
  RefreshCw,
  Search,
  Check
} from 'lucide-react';
import { playSound } from '../../utils/audio';

interface BluetoothScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBarcodeMatched?: (barcode: string) => void;
}

export const BluetoothScannerModal: React.FC<BluetoothScannerModalProps> = ({
  isOpen,
  onClose,
  onBarcodeMatched
}) => {
  const { products, addToCart, settings, updateSettings, currencySymbol, language } = usePos();
  const t = getT(language);
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [activeTab, setActiveTab] = useState<'status' | 'test' | 'guide'>('status');
  const [lastScan, setLastScan] = useState<ScannedBarcodePayload | null>(null);
  const [testInput, setTestInput] = useState('');
  const [isWebBluetoothScanning, setIsWebBluetoothScanning] = useState(false);
  const [connectedBleDeviceName, setConnectedBleDeviceName] = useState<string | null>(null);
  const [bleError, setBleError] = useState<string | null>(null);

  // Listen for hardware Bluetooth scans while modal is open
  useEffect(() => {
    if (!isOpen) return;

    const unsubscribe = bluetoothScanner.onScan((payload) => {
      setLastScan(payload);
      setTestInput(payload.barcode);

      // Match product
      const matched = products.find(
        (p) => p.barcode === payload.barcode || p.sku.toLowerCase() === payload.barcode.toLowerCase()
      );

      if (matched) {
        playSound('beep');
        if (navigator.vibrate) navigator.vibrate([30, 20, 30]);
        if (settings.bluetoothAutoAddToCart && onBarcodeMatched) {
          onBarcodeMatched(payload.barcode);
        }
      } else {
        playSound('error');
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen, products, settings.bluetoothAutoAddToCart, onBarcodeMatched]);

  if (!isOpen) return null;

  // Find matched product from last scan
  const matchedProduct = lastScan
    ? products.find(
        (p) => p.barcode === lastScan.barcode || p.sku.toLowerCase() === lastScan.barcode.toLowerCase()
      )
    : null;

  // Web Bluetooth direct pairing API
  const handleConnectWebBluetooth = async () => {
    setBleError(null);
    const navBle = (navigator as unknown as { bluetooth?: { requestDevice: (opts: any) => Promise<{ name?: string }> } }).bluetooth;
    if (!navBle) {
      setBleError(
        isAr
          ? 'متصفحك يدعم وضع البلوتوث HID القياسي تلقائياً، بينما ميزة Web Bluetooth API تتطلب تفعيلها بالمتصفح.'
          : 'Your browser uses standard Bluetooth HID automatically. Web Bluetooth API is not active.'
      );
      return;
    }

    try {
      setIsWebBluetoothScanning(true);
      const device = await navBle.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['generic_access', 'battery_service']
      });

      setConnectedBleDeviceName(device.name || 'Bluetooth Barcode Scanner');
      playSound('success');
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        setBleError(err.message || 'فشل الاتصال بجهاز البلوتوث');
      }
    } finally {
      setIsWebBluetoothScanning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/90 dark:bg-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md">
              <Bluetooth className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                  {isAr ? 'تكامل ماسح الباركود عبر البلوتوث (HID Mode)' : 'Bluetooth Barcode Scanner (HID Mode)'}
                </h3>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAr ? 'دعم أجهزة المسح الليزرية واللاسلكية الخارجية لتسريع البيع' : 'Wireless & laser barcode scanner integration for rapid checkout'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 pt-2 bg-slate-50/50 dark:bg-slate-800/30 gap-2">
          <button
            onClick={() => setActiveTab('status')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'status'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>{isAr ? 'الحالة والإعدادات' : 'Status & Settings'}</span>
          </button>

          <button
            onClick={() => setActiveTab('test')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'test'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isAr ? 'اختبار المسح الحي' : 'Live Scan Test'}</span>
          </button>

          <button
            onClick={() => setActiveTab('guide')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'guide'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>{isAr ? 'طريقة الربط والاقتران' : 'Pairing Guide'}</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* TAB 1: Status & Configuration */}
          {activeTab === 'status' && (
            <div className="space-y-4">
              {/* Active HID Mode Banner */}
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  <Check className="w-5 h-5 stroke-[3]" />
                </div>
                <div>
                  <div className="font-bold text-emerald-900 dark:text-emerald-200 text-sm">
                    {isAr ? 'وضع البلوتوث HID نشط وجاهز للعمل' : 'Bluetooth HID Mode Active & Ready'}
                  </div>
                  <div className="text-emerald-800/90 dark:text-emerald-300/90 mt-0.5 leading-relaxed">
                    {isAr
                      ? 'يمكنك الآن مسح أي سلعة مباشرة بماسح الباركود الخارجي المقترن بجهازك دون الحاجة للنقر داخل أي حقل إدخال. النظام يتعرف فورياً على الباركود الليزري ويضيف الصنف للسلة.'
                      : 'You can now scan barcodes anywhere on the screen with your paired Bluetooth scanner without focusing any input. Products will be instantly added to the cart.'}
                  </div>
                </div>
              </div>

              {/* Connected Device / Pairing Info */}
              {connectedBleDeviceName && (
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-bold">
                    <Bluetooth className="w-4 h-4" />
                    <span>{connectedBleDeviceName}</span>
                  </div>
                  <span className="text-[10px] bg-blue-200 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full font-bold">
                    {isAr ? 'متصل' : 'Connected'}
                  </span>
                </div>
              )}

              {/* Toggles & Scanner Preferences */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-emerald-600" />
                  <span>{isAr ? 'خيارات ماسح البلوتوث المتقدمة' : 'Scanner Behavior Settings'}</span>
                </div>

                {/* Auto Add to Cart Toggle */}
                <div className="flex items-center justify-between py-1 border-b border-slate-200/60 dark:border-slate-700">
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      {isAr ? 'إضافة الصنف تلقائياً إلى السلة' : 'Auto-add item to cart'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {isAr ? 'إدراج السلعة وزيادة الكمية فور إتمام المسح' : 'Immediately increments quantity upon scan'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({
                        bluetoothAutoAddToCart: !(settings.bluetoothAutoAddToCart ?? true)
                      })
                    }
                    className={`w-11 h-6 rounded-full transition-colors relative ${
                      (settings.bluetoothAutoAddToCart ?? true)
                        ? 'bg-emerald-600'
                        : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                        (settings.bluetoothAutoAddToCart ?? true)
                          ? 'translate-x-5.5 rtl:-translate-x-5.5'
                          : 'translate-x-0.5 rtl:-translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Sound Beep Toggle */}
                <div className="flex items-center justify-between py-1 border-b border-slate-200/60 dark:border-slate-700">
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      {isAr ? 'نغمة تأكيد المسح الصوتي' : 'Audio Beep Confirmation'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {isAr ? 'إصدار صوت رنين تأكيدي مثل أجهزة الكاشير الكبرى' : 'Plays cash register confirmation chime'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({
                        bluetoothSoundFeedback: !(settings.bluetoothSoundFeedback ?? true)
                      })
                    }
                    className={`w-11 h-6 rounded-full transition-colors relative ${
                      (settings.bluetoothSoundFeedback ?? true)
                        ? 'bg-emerald-600'
                        : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                        (settings.bluetoothSoundFeedback ?? true)
                          ? 'translate-x-5.5 rtl:-translate-x-5.5'
                          : 'translate-x-0.5 rtl:-translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Inter-key delay */}
                <div className="pt-1 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      {isAr ? 'حساسية سرعة الماسح (Inter-key latency)' : 'Scanner Speed Latency'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {isAr ? 'افتراضي: 60ms (يميز سرعة الليزر عن الكتابة البشرية)' : 'Default: 60ms (differentiates laser from human typing)'}
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                    60ms
                  </span>
                </div>
              </div>

              {/* Direct Web Bluetooth Connect Button */}
              <div className="flex items-center justify-between p-3 rounded-2xl border border-dashed border-blue-400/80 bg-blue-50/50 dark:bg-blue-950/20">
                <div className="flex items-center gap-2">
                  <Bluetooth className="w-4 h-4 text-blue-600" />
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    {isAr ? 'اقتران مباشر عبر Web Bluetooth API' : 'Pair via Web Bluetooth API'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleConnectWebBluetooth}
                  disabled={isWebBluetoothScanning}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all disabled:opacity-50"
                >
                  {isWebBluetoothScanning
                    ? (isAr ? 'جارِ البحث...' : 'Scanning...')
                    : (isAr ? 'البحث عن أجهزة' : 'Search Devices')}
                </button>
              </div>

              {bleError && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-[11px]">
                  {bleError}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Live Test Area */}
          {activeTab === 'test' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="font-bold text-slate-900 dark:text-white">
                  {isAr ? 'منطقة اختبار استجابة ماسح الباركود' : 'Live Hardware Scan Testing Area'}
                </div>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  {isAr
                    ? 'وجّه ماسح الباركود المقترن عبر البلوتوث واضغط الزر لمسح أي سلعة أمامك لاختبار سرعة الاستجابة.'
                    : 'Scan any physical barcode with your Bluetooth scanner to test transmission speed.'}
                </p>

                <div className="relative">
                  <input
                    type="text"
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    placeholder={isAr ? 'المسح سيظهر هنا تلقائياً...' : 'Scanned code appears here...'}
                    className="w-full text-lg font-mono font-bold px-4 py-3 bg-white dark:bg-slate-800 border-2 border-blue-500 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
                  />
                  <span className="absolute end-3 top-1/2 -translate-y-1/2 text-blue-600">
                    <Zap className="w-5 h-5 animate-pulse" />
                  </span>
                </div>
              </div>

              {/* Last Scan Diagnostics */}
              {lastScan && (
                <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blue-900 dark:text-blue-200">
                      {isAr ? 'نتائج تشخيص المسح الأخير:' : 'Last Scan Diagnostics:'}
                    </span>
                    <span className="text-[10px] font-mono text-blue-600 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-full border border-blue-200">
                      {lastScan.timestamp}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-900">
                      <div className="text-slate-400 text-[10px]">{isAr ? 'الباركود' : 'Barcode'}</div>
                      <div className="font-mono font-bold text-slate-900 dark:text-white truncate">
                        {lastScan.barcode}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-900">
                      <div className="text-slate-400 text-[10px]">{isAr ? 'زمن النبضة' : 'Duration'}</div>
                      <div className="font-mono font-bold text-emerald-600 tabular-nums">
                        {lastScan.durationMs}ms
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-900">
                      <div className="text-slate-400 text-[10px]">{isAr ? 'السرعة لكل حرف' : 'Speed/Char'}</div>
                      <div className="font-mono font-bold text-blue-600 tabular-nums">
                        {lastScan.speedMsPerChar}ms
                      </div>
                    </div>
                  </div>

                  {/* Matched Product Preview */}
                  {matchedProduct ? (
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {matchedProduct.image && (
                          <img
                            src={matchedProduct.image}
                            alt=""
                            className="w-10 h-10 object-cover rounded-lg"
                          />
                        )}
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">
                            {isAr ? matchedProduct.name : matchedProduct.nameEn}
                          </div>
                          <div className="text-[11px] text-emerald-600 font-bold tabular-nums">
                            {matchedProduct.price.toFixed(2)} {currencySymbol} · {isAr ? 'متوفر بالمخزون' : 'In stock'}: {matchedProduct.stock}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          addToCart(matchedProduct);
                          playSound('beep');
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1 shadow-xs"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>{isAr ? 'إضافة للسلة' : 'Add to Cart'}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-amber-800 dark:text-amber-300 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>
                          {isAr
                            ? 'الباركود غير مسجل بدليل المنتجات الحالي'
                            : 'Barcode not found in catalog'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Pairing Guide */}
          {activeTab === 'guide' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="font-bold text-slate-900 dark:text-white text-sm">
                  {isAr ? 'دليل ربط أي ماسح باركود بلوتوث بمتجر kadi pos:' : 'How to Pair Any Bluetooth Scanner:'}
                </div>
                <ol className="space-y-2 list-decimal list-inside text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  <li>
                    {isAr
                      ? 'افتح إعدادات البلوتوث (Bluetooth Settings) في جهازك (iPad أو Android أو Windows أو Mac).'
                      : 'Open Bluetooth settings on your tablet, phone or computer.'}
                  </li>
                  <li>
                    {isAr
                      ? 'شغّل ماسح الباركود واضغط باستمرار على زر البلوتوث للدخول في وضع الاقتران (Pairing Mode).'
                      : 'Power on your barcode scanner and hold the Bluetooth button to enter pairing mode.'}
                  </li>
                  <li>
                    {isAr
                      ? 'اختر اسم الماسح (مثل: Eyoyo / Netum / Tera / Zebra) من قائمة الأجهزة واضغط اقتران.'
                      : 'Select your scanner brand name from the discovered devices list and pair.'}
                  </li>
                  <li>
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      {isAr ? 'خطوة هامة (HID Mode): ' : 'Crucial Step (HID Mode): '}
                    </strong>
                    {isAr
                      ? 'تأكد من ضبط الماسح على وضع «Bluetooth HID Keyboard» من خلال مسح باركود الـ HID الموجود في كتالوج الماسح. هذا يسمح له بالعمل فورياً مع النظام دون أي برامج إضافية.'
                      : 'Ensure scanner is set to Bluetooth HID Keyboard mode by scanning the HID configuration barcode in its manual.'}
                  </li>
                </ol>
              </div>

              {/* Supported brands badge list */}
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-center space-y-1.5">
                <div className="text-[11px] font-bold text-slate-500">
                  {isAr ? 'متوافق 100% مع كافة الماركات العالمية:' : '100% Compatible with All Major Brands:'}
                </div>
                <div className="flex flex-wrap justify-center gap-2 text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                  <span>Zebra</span> · <span>Honeywell</span> · <span>Eyoyo</span> · <span>Netum</span> · <span>Inateck</span> · <span>Tera</span> · <span>Datalogic</span> · <span>Socket Mobile</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Bluetooth className="w-3.5 h-3.5 text-blue-600" />
            <span>{isAr ? 'ماسح البلوتوث يعمل في الخلفية' : 'Bluetooth scanner runs globally'}</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md transition-all"
          >
            {isAr ? 'تم / إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
