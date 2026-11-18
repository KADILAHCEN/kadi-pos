import React, { useState, useEffect } from 'react';
import { usePos } from '../../context/PosContext';
import {
  bluetoothScanner,
  BluetoothScannerStatus,
  ScannedBarcodePayload
} from '../../utils/bluetoothScanner';
import {
  Bluetooth,
  Zap,
  CheckCircle2,
  AlertTriangle,
  X,
  Volume2,
  Settings2,
  HelpCircle,
  ShoppingBag,
  Check,
  WifiOff,
  PackagePlus,
  Play,
  Unlink
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
  const isAr = language === 'ar';

  const [activeTab, setActiveTab] = useState<'status' | 'test' | 'guide'>('status');
  const [lastScan, setLastScan] = useState<ScannedBarcodePayload | null>(null);
  const [testInput, setTestInput] = useState('');
  const [hidLabelInput, setHidLabelInput] = useState('');
  const [isWebBluetoothScanning, setIsWebBluetoothScanning] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<BluetoothScannerStatus>(() =>
    bluetoothScanner.getStatus()
  );
  const [bleMessage, setBleMessage] = useState<{ text: string; type: 'info' | 'success' | 'warn' } | null>(null);

  // Sync status and push modal scope while open so background POS doesn't double-fire
  useEffect(() => {
    const unsubStatus = bluetoothScanner.subscribeStatus(setScannerStatus);
    if (!isOpen) {
      bluetoothScanner.popScope('bluetooth_modal');
      return () => {
        unsubStatus();
      };
    }

    bluetoothScanner.pushScope('bluetooth_modal');
    setBleMessage(null);

    const unsubscribe = bluetoothScanner.onScan((payload) => {
      if (bluetoothScanner.getActiveScope() !== 'bluetooth_modal') return;

      setLastScan(payload);
      setTestInput(payload.barcode);
      setActiveTab('test');

      const matched = products.find(
        (p) =>
          p.barcode === payload.barcode ||
          p.sku.toLowerCase() === payload.barcode.toLowerCase()
      );

      if (matched) {
        if (settings.bluetoothSoundFeedback !== false) {
          playSound('beep');
        }
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
      unsubStatus();
      bluetoothScanner.popScope('bluetooth_modal');
    };
  }, [isOpen, products, settings.bluetoothAutoAddToCart, settings.bluetoothSoundFeedback, onBarcodeMatched]);

  if (!isOpen) return null;

  const matchedProduct = lastScan
    ? products.find(
        (p) =>
          p.barcode === lastScan.barcode ||
          p.sku.toLowerCase() === lastScan.barcode.toLowerCase()
      )
    : null;

  const handleConnectWebBluetooth = async () => {
    setBleMessage(null);
    setIsWebBluetoothScanning(true);
    try {
      const res = await bluetoothScanner.pairWebBluetoothDevice();
      if (res.success) {
        if (settings.bluetoothSoundFeedback !== false) playSound('beep');
        updateSettings({ bluetoothScannerEnabled: true });
        setBleMessage({
          type: 'success',
          text: isAr
            ? `✅ تم ربط "${res.deviceName}" بنجاح! جرب تسكاني شي سلعة دابا.`
            : `✅ Paired with "${res.deviceName}"!`
        });
      } else if (res.errorCode === 'unsupported') {
        bluetoothScanner.pairHidScanner(hidLabelInput || 'قارئ بلوتوث HID');
        updateSettings({ bluetoothScannerEnabled: true });
        if (settings.bluetoothSoundFeedback !== false) playSound('beep');
        setBleMessage({
          type: 'info',
          text: isAr
            ? 'هاد المتصفح كيخدم بوضع HID القياسي أوتوماتيكياً! غير قرن القارئ من البلوتوث ديال التيليفون ولا البيسي وغيخدم نيشان بلا أنترنت.'
            : 'Browser uses standard OS Bluetooth HID mode automatically. Pair in device Bluetooth settings and scan right away.'
        });
      } else if (res.errorCode === 'failed') {
        setBleMessage({
          type: 'warn',
          text:
            res.errorMessage ||
            (isAr ? 'ما قدرناش نتصلو بالقارئ، جرب وضع HID العادي' : 'Could not pair BLE scanner')
        });
      }
    } finally {
      setIsWebBluetoothScanning(false);
    }
  };

  const handleConfirmHidPair = () => {
    const info = bluetoothScanner.pairHidScanner(
      hidLabelInput.trim() || (isAr ? 'قارئ باركود بلوتوث (HID)' : 'Bluetooth HID Scanner')
    );
    updateSettings({ bluetoothScannerEnabled: true });
    if (settings.bluetoothSoundFeedback !== false) playSound('beep');
    setBleMessage({
      type: 'success',
      text: isAr
        ? `✅ تسجّل الربط مع "${info.name}" فـ وضع HID — خدام بلا أنترنت!`
        : `✅ Paired with "${info.name}" in HID mode!`
    });
  };

  const handleSimulateTestScan = () => {
    const code = testInput.trim() || products.find((p) => p.barcode)?.barcode || '6111035000014';
    setTestInput(code);
    bluetoothScanner.simulateScan(code);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/90 dark:bg-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md">
              <Bluetooth className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-900 dark:text-white text-base">
                  {isAr ? 'ربط قارئ باركود بلوتوث (HID)' : 'Bluetooth Barcode Scanner (HID Mode)'}
                </h3>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <WifiOff className="w-3 h-3 text-emerald-600" />
                <span>
                  {isAr
                    ? 'خدام 100% بلا أنترنت — للبيع، المخزون، وفواتير الشراء'
                    : 'Works 100% offline across Sale, Stock & Invoice Scan'}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 pt-2 bg-slate-50/50 dark:bg-slate-800/30 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'status'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>{isAr ? 'الربط والإعدادات' : 'Pair & Settings'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('test')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'test'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isAr ? 'فحص وتجربة القارئ' : 'Live Scan Test'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'guide'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>{isAr ? 'كيفاش تربطو' : 'Pairing Guide'}</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {/* TAB 1: Status & Pairing */}
          {activeTab === 'status' && (
            <div className="space-y-4">
              {/* Active HID Mode Banner */}
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  <Check className="w-5 h-5 stroke-[3]" />
                </div>
                <div>
                  <div className="font-black text-emerald-900 dark:text-emerald-200 text-sm">
                    {scannerStatus.enabled
                      ? isAr
                        ? 'وضع البلوتوث HID مفعّل وجاهز بلا أنترنت'
                        : 'Bluetooth HID Mode Active & Ready Offline'
                      : isAr
                      ? 'قارئ البلوتوث موقف حالياً — فعّلو من التحت'
                      : 'Bluetooth Scanner Paused'}
                  </div>
                  <div className="text-emerald-800/90 dark:text-emerald-300/90 mt-0.5 leading-relaxed">
                    {isAr
                      ? 'غير تقرن القارئ بالبلوتوث فـ وضع HID، كيعمّر السلعة نيشان فـ شاشة البيع، المخزون، وفواتير الشراء بصوت "بيب" وبلا ما تضغط فـ حتى بلاصة.'
                      : 'Scan anywhere in Sale, Inventory, or Purchase Invoice screens with instant beep feedback — zero internet needed.'}
                  </div>
                </div>
              </div>

              {/* Paired Scanner Info */}
              {scannerStatus.pairedDevice && (
                <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200 font-black">
                    <Bluetooth className="w-4 h-4 text-blue-600" />
                    <span>{scannerStatus.pairedDevice.name}</span>
                    <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/70 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-black">
                      {isAr ? 'مربوط ✓' : 'Paired ✓'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => bluetoothScanner.unpairScanner()}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-1"
                  >
                    <Unlink className="w-3 h-3" />
                    <span>{isAr ? 'حيد الربط' : 'Unpair'}</span>
                  </button>
                </div>
              )}

              {/* Step 1: Search BLE or Confirm HID Pairing */}
              <div className="p-4 rounded-2xl border border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 space-y-3">
                <div className="font-black text-slate-900 dark:text-white flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Bluetooth className="w-4 h-4 text-blue-600" />
                    <span>{isAr ? 'إقران / البحث عن قارئ بلوتوث' : 'Scan & Pair Bluetooth Scanner'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      playSound('beep');
                      setBleMessage({
                        type: 'info',
                        text: isAr ? '🔊 بيب! الصوت ديال الماسح خدام مزيان بلا أنترنت.' : '🔊 Beep sound verified!'
                      });
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 hover:bg-slate-100"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{isAr ? 'جرب صوت "بيب"' : 'Test Beep'}</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleConnectWebBluetooth}
                    disabled={isWebBluetoothScanning}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-2xs"
                  >
                    <Bluetooth className="w-4 h-4" />
                    <span>
                      {isWebBluetoothScanning
                        ? isAr
                          ? 'كيقلّب على أجهزة بلوتوث...'
                          : 'Searching...'
                        : isAr
                        ? 'بحث وربط بالبلوتوث (BLE)'
                        : 'Search Bluetooth Devices'}
                    </span>
                  </button>

                  <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                    <input
                      type="text"
                      data-barcode-allow-input="true"
                      value={hidLabelInput}
                      onChange={(e) => setHidLabelInput(e.target.value)}
                      placeholder={isAr ? 'إسم القارئ (مثال: Eyoyo / Netum)' : 'Scanner name (e.g. Eyoyo)'}
                      className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={handleConfirmHidPair}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black whitespace-nowrap"
                    >
                      {isAr ? 'ربط HID' : 'Confirm HID'}
                    </button>
                  </div>
                </div>
              </div>

              {bleMessage && (
                <div
                  className={`p-3 rounded-xl border text-[11px] font-bold ${
                    bleMessage.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                      : bleMessage.type === 'warn'
                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                      : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200'
                  }`}
                >
                  {bleMessage.text}
                </div>
              )}

              {/* Toggles & Scanner Preferences */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-emerald-600" />
                  <span>{isAr ? 'إعدادات قارئ الباركود' : 'Scanner Behavior Settings'}</span>
                </div>

                {/* Enable Bluetooth Scanner */}
                <div className="flex items-center justify-between py-1 border-b border-slate-200/60 dark:border-slate-700">
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      {isAr ? 'تشغيل استقبال قارئ البلوتوث (HID)' : 'Enable Bluetooth Scanner (HID)'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {isAr ? 'كيستقبل الباركود فـ شاشة البيع والمخزون والفاتورة' : 'Active across Sale, Stock & Invoice Scan'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({
                        bluetoothScannerEnabled: !(settings.bluetoothScannerEnabled ?? true)
                      })
                    }
                    className={`w-11 h-6 rounded-full transition-colors relative ${
                      (settings.bluetoothScannerEnabled ?? true)
                        ? 'bg-emerald-600'
                        : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                        (settings.bluetoothScannerEnabled ?? true)
                          ? 'translate-x-5.5 rtl:-translate-x-5.5'
                          : 'translate-x-0.5 rtl:-translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Auto Add to Cart Toggle */}
                <div className="flex items-center justify-between py-1 border-b border-slate-200/60 dark:border-slate-700">
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      {isAr ? 'زيد السلعة نيشان للسلة فاش تسكاني' : 'Auto-add scanned item to cart'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {isAr ? 'غير يدوز الليزر، كتتزاد السلعة للسلة أوتوماتيك' : 'Immediately adds & increments quantity upon scan'}
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
                <div className="flex items-center justify-between py-1">
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      {isAr ? 'صوت "بيب" فاش ينجح السكان' : 'Audio "Beep" on Successful Scan'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {isAr ? 'صوت بحال لاكيس ديال السوبرمارشي (بلا أنترنت)' : 'Plays crisp scanner beep offline'}
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
              </div>
            </div>
          )}

          {/* TAB 2: Live Test Area */}
          {activeTab === 'test' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="font-black text-slate-900 dark:text-white">
                  {isAr ? 'جرب قارئ الباركود دابا' : 'Live Hardware Scan Testing Area'}
                </div>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  {isAr
                    ? 'وجّه قارئ البلوتوث لشي سلعة وضغط الزر، ولا كتب باركود هنا وضغط "تجربة السكان" باش تشوف السرعة وصوت بيب.'
                    : 'Point your paired Bluetooth scanner at any barcode, or type a code and click Test Scan.'}
                </p>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      data-barcode-allow-input="true"
                      value={testInput}
                      onChange={(e) => setTestInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSimulateTestScan();
                        }
                      }}
                      placeholder={isAr ? 'الباركود غادي يبان هنا...' : 'Scanned code appears here...'}
                      className="w-full text-base font-mono font-bold px-4 py-2.5 bg-white dark:bg-slate-800 border-2 border-blue-500 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
                    />
                    <span className="absolute end-3 top-1/2 -translate-y-1/2 text-blue-600">
                      <Zap className="w-4 h-4 animate-pulse" />
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSimulateTestScan}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black flex items-center gap-1.5 shrink-0"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{isAr ? 'تجربة السكان' : 'Test Scan'}</span>
                  </button>
                </div>
              </div>

              {/* Last Scan Diagnostics */}
              {lastScan && (
                <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-blue-900 dark:text-blue-200">
                      {isAr ? 'نتيجة آخر مسح:' : 'Last Scan Result:'}
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
                      <div className="text-slate-400 text-[10px]">{isAr ? 'المدة' : 'Duration'}</div>
                      <div className="font-mono font-bold text-emerald-600 tabular-nums">
                        {lastScan.durationMs}ms
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-900">
                      <div className="text-slate-400 text-[10px]">{isAr ? 'السرعة' : 'Speed'}</div>
                      <div className="font-mono font-bold text-blue-600 tabular-nums">
                        {lastScan.speedMsPerChar}ms/c
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
                            {matchedProduct.price.toFixed(2)} {currencySymbol} · {isAr ? 'فـ الستوك' : 'In stock'}: {matchedProduct.stock}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          addToCart(matchedProduct);
                          if (settings.bluetoothSoundFeedback !== false) playSound('beep');
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1 shadow-xs"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>{isAr ? 'زيد للسلة' : 'Add to Cart'}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-amber-800 dark:text-amber-300 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-bold">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>
                          {isAr
                            ? 'سلعة جديدة - هاد الباركود باقي ما تسجّل'
                            : 'Barcode not found in catalog'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          window.dispatchEvent(
                            new CustomEvent('kadi:open-quick-new-barcode', {
                              detail: { barcode: lastScan.barcode, sourceContext: 'global' }
                            })
                          );
                        }}
                        className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black flex items-center gap-1"
                      >
                        <PackagePlus className="w-3.5 h-3.5" />
                        <span>{isAr ? 'دخل اسمها و ثمنها' : 'Add Product'}</span>
                      </button>
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
                <div className="font-black text-slate-900 dark:text-white text-sm">
                  {isAr ? 'كيفاش تربط أي قارئ باركود بلوتوث مع Kadi POS:' : 'How to Pair Any Bluetooth Scanner:'}
                </div>
                <ol className="space-y-2 list-decimal list-inside text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  <li>
                    {isAr
                      ? 'شعل القارئ وضغط مطولاً على الزر ديالو ولا سكاني باركود "Bluetooth HID Mode" من الكتيب ديالو.'
                      : 'Power on scanner and put it into Bluetooth HID Keyboard pairing mode.'}
                  </li>
                  <li>
                    {isAr
                      ? 'حل البلوتوث فـ التيليفون / التابليت / البيسي وربط مع القارئ (بحال Eyoyo، Netum، Tera، Zebra).'
                      : 'Open Bluetooth settings on your phone/tablet/PC and pair with the scanner.'}
                  </li>
                  <li>
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      {isAr ? 'خدم نيشان بلا أنترنت: ' : 'Works Offline Everywhere: '}
                    </strong>
                    {isAr
                      ? 'ملي تكون فـ شاشة البيع، المخزون، ولا تصوير الفاتورة — غير سكاني السلعة! غادي دير "بيب" وتتعمر راسها، وإلا كانت سلعة جديدة غتطلع ليك نافذة "سلعة جديدة - دخل اسمها و ثمنها".'
                      : 'Scan directly in Sale, Inventory, or Invoice Scan screen with instant beep feedback.'}
                  </li>
                </ol>
              </div>

              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-center space-y-1.5">
                <div className="text-[11px] font-bold text-slate-500">
                  {isAr ? 'خدام مع جميع القارئات الليزرية والبلوتوث:' : 'Compatible with All HID & BLE Scanners:'}
                </div>
                <div className="flex flex-wrap justify-center gap-2 text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                  <span>Zebra</span> · <span>Honeywell</span> · <span>Eyoyo</span> · <span>Netum</span> · <span>Inateck</span> · <span>Tera</span> · <span>Datalogic</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-bold">
            <Bluetooth className="w-3.5 h-3.5 text-blue-600" />
            <span>
              {scannerStatus.pairedDevice
                ? isAr
                  ? `مربوط: ${scannerStatus.pairedDevice.name}`
                  : `Paired: ${scannerStatus.pairedDevice.name}`
                : isAr
                ? 'وضع HID شغال فـ الخلفية بلا أنترنت'
                : 'HID listener active offline'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-black bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md transition-all"
          >
            {isAr ? 'صافي / سد' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
};
