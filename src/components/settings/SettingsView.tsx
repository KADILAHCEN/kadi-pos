import React, { useEffect, useState } from 'react';
import { usePos } from '../../context/PosContext';
import { getT } from '../../utils/translations';
import { AppPalette, CurrencyCode, ThemeMode, TheftAlertSettings, UserRole } from '../../types';
import { DEFAULT_THEFT_ALERT_SETTINGS } from '../../data/initialData';
import {
  Settings,
  Store,
  FileText,
  Volume2,
  VolumeX,
  Globe,
  Download,
  Upload,
  RefreshCw,
  Check,
  AlertTriangle,
  Printer,
  Lock,
  Shield,
  Bluetooth,
  FileSpreadsheet,
  Sun,
  Moon,
  Users,
  Plus,
  Trash2,
  UserCheck,
  Sparkles,
  KeyRound,
  Scale,
  Coins,
  Edit3,
  Landmark,
  RotateCcw,
  ShieldCheck,
  Clock,
  Palette,
  Copy,
  ImagePlus,
  BellRing,
  ShieldAlert,
  Siren,
  QrCode,
  ExternalLink
} from 'lucide-react';
import { OFFICIAL_APP_URL, buildQrImageUrl, openExternalLinkSafely } from '../../utils/remoteCatalog';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { BluetoothScannerModal } from '../scanner/BluetoothScannerModal';
import { BluetoothPrinterModal } from '../printer/BluetoothPrinterModal';
import { bluetoothPrinter, BluetoothPrinterState } from '../../utils/bluetoothPrinter';
import { ImportProductsModal } from '../inventory/ImportProductsModal';
import { BranchManagementSection } from './BranchManagementSection';
import { ActivityLogSection } from './ActivityLogSection';
import { GoogleWorkspaceSyncSection } from './GoogleWorkspaceSyncSection';
import { TabCustomizationSection } from './TabCustomizationSection';

export const SettingsView: React.FC = () => {
  const {
    settings,
    updateSettings,
    resetToDemoData,
    exportDatabaseJson,
    importDatabaseJson,
    localSnapshotAt,
    saveLocalSnapshot,
    restoreLocalSnapshot,
    products,
    remoteOrders,
    language,
    users,
    addUser,
    updateUser,
    deleteUser,
    zakatSummary,
    cpuSettings,
    updateCpuSettings,
    allPalettes,
    activePalette,
    selectPalette,
    createCustomPalette,
    updateCustomPalette,
    deleteCustomPalette,
    notificationPermission,
    requestNotificationPermission,
    triggerTestStockAlert,
    triggerTestTheftAlert,
    unresolvedTheftAlerts
  } = usePos();

  const t = getT(language);
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [savedToast, setSavedToast] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [confirmRestoreSnapshot, setConfirmRestoreSnapshot] = useState(false);
  const [showBluetoothModal, setShowBluetoothModal] = useState(false);
  const [showBluetoothPrinterModal, setShowBluetoothPrinterModal] = useState(false);
  const [btPrinterState, setBtPrinterState] = useState<BluetoothPrinterState>(() =>
    bluetoothPrinter.getState()
  );
  const [printerToast, setPrinterToast] = useState<string | null>(null);
  const [showImportProductsModal, setShowImportProductsModal] = useState(false);

  useEffect(() => {
    return bluetoothPrinter.subscribe(setBtPrinterState);
  }, []);

  // Local form state
  const [storeName, setStoreName] = useState(settings.storeName);
  const [storeLogo, setStoreLogo] = useState<string | undefined>(settings.storeLogo);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [taxNumber, setTaxNumber] = useState(settings.taxNumber);
  const [commercialRegistration, setCommercialRegistration] = useState(settings.commercialRegistration);
  const [phone, setPhone] = useState(settings.phone);
  const [address, setAddress] = useState(settings.address);
  const [publicAppUrl, setPublicAppUrl] = useState(settings.publicAppUrl || OFFICIAL_APP_URL);
  const [copiedStoreQr, setCopiedStoreQr] = useState(false);
  const [currency, setCurrency] = useState<CurrencyCode>(settings.currency);
  const [currencySymbol, setCurrencySymbol] = useState(settings.currencySymbol);
  const [taxRate, setTaxRate] = useState(settings.taxRate);
  const [receiptHeaderMsg, setReceiptHeaderMsg] = useState(
    settings.receiptHeaderMsg ?? 'أهلاً وسهلاً بكم! نتمنى لكم تسوقاً سعيداً ومباركاً.'
  );
  const [showReceiptHeaderMsg, setShowReceiptHeaderMsg] = useState<boolean>(
    settings.showReceiptHeaderMsg ?? true
  );
  const [receiptFooterMsg, setReceiptFooterMsg] = useState(settings.receiptFooterMsg);
  const [showReceiptFooterMsg, setShowReceiptFooterMsg] = useState<boolean>(
    settings.showReceiptFooterMsg ?? true
  );
  const [enableSoundEffects, setEnableSoundEffects] = useState(settings.enableSoundEffects);
  const [enableLowStockPushNotifications, setEnableLowStockPushNotifications] = useState(
    settings.enableLowStockPushNotifications ?? true
  );
  const [enableLowStockVisualAlerts, setEnableLowStockVisualAlerts] = useState(
    settings.enableLowStockVisualAlerts ?? true
  );
  const [enableLowStockAudioAlert, setEnableLowStockAudioAlert] = useState(
    settings.enableLowStockAudioAlert ?? true
  );
  const [theftSettings, setTheftSettings] = useState<TheftAlertSettings>(() => ({
    ...DEFAULT_THEFT_ALERT_SETTINGS,
    ...(settings.theftAlertSettings || {})
  }));
  const [selectedLang, setSelectedLang] = useState(settings.language);

  // Theme & Auto Switching Settings
  const [themeMode, setThemeMode] = useState<ThemeMode>(settings.themeMode || 'auto_system');

  // RBAC & PIN Protection Settings
  const [protectInventoryWithPin, setProtectInventoryWithPin] = useState<boolean>(
    settings.protectInventoryWithPin ?? true
  );
  const [protectSettingsWithPin, setProtectSettingsWithPin] = useState<boolean>(
    settings.protectSettingsWithPin ?? true
  );

  // New User Form State
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('cashier');
  const [newUserPin, setNewUserPin] = useState('0000');
  const [newUserAvatar, setNewUserAvatar] = useState('🧑‍💻');

  // Edit Existing User Inline State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserRole, setEditUserRole] = useState<UserRole>('cashier');
  const [editUserPin, setEditUserPin] = useState('');
  const [editUserAvatar, setEditUserAvatar] = useState('👤');

  // Palette Studio State (إنشاء وتعديل لوحات الألوان)
  const [showPaletteCreator, setShowPaletteCreator] = useState(false);
  const [editingPaletteId, setEditingPaletteId] = useState<string | null>(null);
  const [palName, setPalName] = useState('');
  const [palPrimary, setPalPrimary] = useState('#2563eb');
  const [palAccent, setPalAccent] = useState('#38bdf8');
  const [palDarkBg, setPalDarkBg] = useState('#04070f');
  const [palDarkCard, setPalDarkCard] = useState('#0a1120');
  const [palPreferredMode, setPalPreferredMode] = useState<'keep' | 'dark' | 'light'>('keep');
  const [paletteToast, setPaletteToast] = useState<string | null>(null);

  const openNewPaletteCreator = (template?: AppPalette) => {
    setEditingPaletteId(null);
    setPalName(
      template
        ? `${isAr ? 'نسخة من' : 'Copy of'} ${isAr ? template.name : template.nameEn || template.name}`
        : isAr
        ? 'باليت متجري الخاصة'
        : 'My Store Palette'
    );
    setPalPrimary(template?.primaryColor || '#0ea5e9');
    setPalAccent(template?.accentColor || '#38bdf8');
    setPalDarkBg(template?.darkBgColor || '#04070f');
    setPalDarkCard(template?.darkCardColor || '#0a1120');
    setPalPreferredMode(template?.preferredMode || 'keep');
    setShowPaletteCreator(true);
  };

  const openEditPalette = (pal: AppPalette) => {
    setEditingPaletteId(pal.id);
    setPalName(pal.name);
    setPalPrimary(pal.primaryColor);
    setPalAccent(pal.accentColor);
    setPalDarkBg(pal.darkBgColor);
    setPalDarkCard(pal.darkCardColor);
    setPalPreferredMode(pal.preferredMode || 'keep');
    setShowPaletteCreator(true);
  };

  const handleSavePalette = () => {
    const cleanName = palName.trim();
    if (!cleanName) return;

    if (editingPaletteId) {
      updateCustomPalette(editingPaletteId, {
        name: cleanName,
        nameEn: cleanName,
        primaryColor: palPrimary,
        accentColor: palAccent,
        darkBgColor: palDarkBg,
        darkCardColor: palDarkCard,
        preferredMode: palPreferredMode
      });
      selectPalette(editingPaletteId);
      setPaletteToast(isAr ? `تم تحديث وتفعيل الباليت "${cleanName}" بنجاح` : `Updated & activated "${cleanName}"`);
    } else {
      createCustomPalette(
        {
          name: cleanName,
          nameEn: cleanName,
          primaryColor: palPrimary,
          accentColor: palAccent,
          darkBgColor: palDarkBg,
          darkCardColor: palDarkCard,
          preferredMode: palPreferredMode
        },
        true
      );
      setPaletteToast(isAr ? `تم إنشاء وتفعيل الباليت "${cleanName}" بنجاح` : `Created & activated "${cleanName}"`);
    }

    setShowPaletteCreator(false);
    setEditingPaletteId(null);
    setTimeout(() => setPaletteToast(null), 3500);
  };

  // CPU Tax & WhatsApp Store Phone Local State
  const [whatsappBusinessPhone, setWhatsappBusinessPhone] = useState(
    settings.whatsappBusinessPhone || settings.phone || ''
  );
  const [cpuTaxRatePct, setCpuTaxRatePct] = useState<number>(cpuSettings.taxRatePct);
  const [cpuProfCoeffPct, setCpuProfCoeffPct] = useState<number>(cpuSettings.professionCoeffPct);
  const [cpuRetCoeff, setCpuRetCoeff] = useState<number>(cpuSettings.retirementCoeff);
  const [cpuRetEnabled, setCpuRetEnabled] = useState<boolean>(cpuSettings.retirementEnabled);
  const [cpuAlertDays, setCpuAlertDays] = useState<number>(cpuSettings.alertDaysBeforeDue);
  const [cpuPriorDays, setCpuPriorDays] = useState<number>(cpuSettings.priorAccumulatedDays);
  const [cpuBracketsDraft, setCpuBracketsDraft] = useState(cpuSettings.cnssBrackets);

  // Thermal Printer & Paper Settings
  const [receiptPaperWidth, setReceiptPaperWidth] = useState<'80mm' | '58mm'>(settings.receiptPaperWidth || '80mm');
  const [printerName, setPrinterName] = useState(settings.printerName || 'طابعة إيصالات افتراضية (80mm / 58mm)');
  const [printerConnectionType, setPrinterConnectionType] = useState<'browser_dialog' | 'bluetooth' | 'network'>(settings.printerConnectionType || 'browser_dialog');
  const [autoPrintOnCheckout, setAutoPrintOnCheckout] = useState(settings.autoPrintOnCheckout || false);
  const [managerPin, setManagerPin] = useState(settings.managerPin || '1234');

  useEffect(() => {
    if (settings.printerName) setPrinterName(settings.printerName);
    if (settings.printerConnectionType) setPrinterConnectionType(settings.printerConnectionType);
  }, [settings.printerName, settings.printerConnectionType]);

  // Zakat al-Tijarah & 85g Gold Nisab Settings
  const [goldPricePerGram, setGoldPricePerGram] = useState<number>(settings.goldPricePerGram ?? 750);
  const [zakatCashOnHand, setZakatCashOnHand] = useState<number>(settings.zakatCashOnHand ?? 5000);
  const [zakatPayableDebts, setZakatPayableDebts] = useState<number>(settings.zakatPayableDebts ?? 0);

  const dynamicNisabValue = Math.max(0, (goldPricePerGram || 0) * 85);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      storeName,
      storeLogo,
      taxNumber,
      commercialRegistration,
      phone,
      address,
      currency,
      currencySymbol,
      taxRate: Number(taxRate),
      receiptHeaderMsg: receiptHeaderMsg.trim(),
      showReceiptHeaderMsg,
      receiptFooterMsg: receiptFooterMsg.trim(),
      showReceiptFooterMsg,
      enableSoundEffects,
      enableLowStockPushNotifications,
      enableLowStockVisualAlerts,
      enableLowStockAudioAlert,
      theftAlertSettings: theftSettings,
      language: selectedLang,
      themeMode,
      protectInventoryWithPin,
      protectSettingsWithPin,
      receiptPaperWidth,
      printerName,
      printerConnectionType,
      autoPrintOnCheckout,
      managerPin: managerPin.trim() || '1234',
      goldPricePerGram: Math.max(0, Number(goldPricePerGram) || 0),
      zakatCashOnHand: Math.max(0, Number(zakatCashOnHand) || 0),
      zakatPayableDebts: Math.max(0, Number(zakatPayableDebts) || 0),
      whatsappBusinessPhone: whatsappBusinessPhone.trim(),
      publicAppUrl: publicAppUrl.trim() || OFFICIAL_APP_URL
    });

    updateCpuSettings({
      taxRatePct: Math.max(0, Number(cpuTaxRatePct) || 0),
      professionCoeffPct: Math.max(0, Number(cpuProfCoeffPct) || 0),
      retirementCoeff: Math.max(0, Number(cpuRetCoeff) || 0),
      retirementEnabled: cpuRetEnabled,
      alertDaysBeforeDue: Math.max(1, Number(cpuAlertDays) || 7),
      priorAccumulatedDays: Math.max(0, Number(cpuPriorDays) || 0),
      cnssBrackets: cpuBracketsDraft
    });

    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  };

  const handleAddNewUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim()) return;
    addUser({
      name: newUserName.trim(),
      role: newUserRole,
      pin: newUserPin.trim() || '0000',
      avatar: newUserAvatar,
      active: true
    });
    setNewUserName('');
    setNewUserPin('0000');
    setShowAddUserModal(false);
  };

  const handleTestPrint = async () => {
    if (printerConnectionType === 'bluetooth') {
      if (!bluetoothPrinter.isConnected()) {
        setShowBluetoothPrinterModal(true);
        return;
      }
      const res = await bluetoothPrinter.printTestPage(storeName, receiptPaperWidth, language);
      if (res.success) {
        setPrinterToast(
          isAr
            ? `تمت الطباعة التجريبية عبر البلوتوث (${receiptPaperWidth})`
            : `Bluetooth test page sent (${receiptPaperWidth})`
        );
        setTimeout(() => setPrinterToast(null), 3000);
      } else if (res.error) {
        setPrinterToast(res.error);
        setTimeout(() => setPrinterToast(null), 4000);
      }
      return;
    }
    window.print();
  };

  const handleCurrencyChange = (curr: CurrencyCode) => {
    setCurrency(curr);
    if (curr === 'SAR') setCurrencySymbol('ر.س');
    else if (curr === 'MAD') setCurrencySymbol('د.م');
    else if (curr === 'AED') setCurrencySymbol('د.إ');
    else if (curr === 'KWD') setCurrencySymbol('د.ك');
    else if (curr === 'USD') setCurrencySymbol('$');
    else if (curr === 'EUR') setCurrencySymbol('€');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      const success = importDatabaseJson(content);
      if (success) {
        setImportError(null);
        setImportSuccess(isAr ? 'تم استيراد قاعدة البيانات بنجاح!' : 'Database restored successfully!');
        setTimeout(() => setImportSuccess(null), 4000);
      } else {
        setImportSuccess(null);
        setImportError(isAr ? 'ملف غير صالح أو تالف' : 'Invalid backup JSON file');
      }
    };
    reader.readAsText(file);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setLogoError(isAr ? 'الرجاء اختيار ملف صورة صالح (PNG, JPG, WEBP)' : 'Please choose a valid image file');
      return;
    }
    setLogoError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const maxDim = 320;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, targetW, targetH);
          ctx.drawImage(img, 0, 0, targetW, targetH);
          const compressed = canvas.toDataURL('image/png');
          setStoreLogo(compressed);
          updateSettings({ storeLogo: compressed });
        }
      };
      img.onerror = () => {
        setLogoError(isAr ? 'تعذر قراءة الصورة المختارة' : 'Could not decode selected image');
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveLogo = () => {
    setStoreLogo(undefined);
    setLogoError(null);
    updateSettings({ storeLogo: undefined });
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            {t.settings_title}
          </h2>
          <p className="text-xs text-slate-500">
            {isAr ? 'إدارة بيانات المتجر، الرقم الضريبي، العملة والنسخ الاحتياطي' : 'Store profile, tax number, currency, and data backup'}
          </p>
        </div>

        {savedToast && (
          <div className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md animate-in fade-in">
            <Check className="w-4 h-4" />
            <span>{isAr ? 'تم حفظ الإعدادات بنجاح' : 'Settings saved'}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
        {/* Store Profile Card */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Store className="w-4 h-4 text-emerald-600" />
            <span>{isAr ? 'معلومات المنشأة والمتجر' : 'Store Information'}</span>
          </h3>

          {/* Store Logo Upload & Preview */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                {storeLogo ? (
                  <img src={storeLogo} alt="Store Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <ImagePlus className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div>
                <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                  {isAr ? 'شعار المتجر (Logo)' : 'Store Brand Logo'}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isAr
                    ? 'يظهر في فواتير البيع، كناش الكريدي، وتقارير PDF (يتم ضغطه تلقائياً حتى 320px).'
                    : 'Printed on receipts, debt invoices, and PDF reports (auto-scaled to 320px).'}
                </p>
                {logoError && <p className="text-[11px] font-bold text-rose-600 mt-1">{logoError}</p>}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>{storeLogo ? (isAr ? 'تغيير الشعار' : 'Change Logo') : (isAr ? 'رفع شعار' : 'Upload Logo')}</span>
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
              {storeLogo && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-1.5 hover:bg-rose-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isAr ? 'حذف' : 'Remove'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {t.store_name}
              </label>
              <input
                type="text"
                required
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {t.tax_no} (ZATCA Fatoora)
              </label>
              <input
                type="text"
                required
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {t.cr_no}
              </label>
              <input
                type="text"
                value={commercialRegistration}
                onChange={(e) => setCommercialRegistration(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {t.phone}
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              {isAr ? 'العنوان' : 'Address'}
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>

          {/* Store Official App URL & Scannable QR Code */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <div className="md:col-span-8 space-y-2.5">
              <label className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-slate-200">
                <QrCode className="w-4 h-4 text-emerald-600" />
                <span>{isAr ? 'رابط التطبيق الرسمي ورمز QR المتجر' : 'Official Store App URL & QR Code'}</span>
              </label>
              <input
                type="url"
                dir="ltr"
                value={publicAppUrl}
                onChange={(e) => setPublicAppUrl(e.target.value)}
                placeholder={OFFICIAL_APP_URL}
                className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {isAr
                  ? 'يُستخدم هذا الرابط لتوليد رمز QR الحقيقي ومشاركة التطبيق وفتح الكتالوج على هواتف الزبائن.'
                  : 'Used to generate your scannable store QR code, phone install link, and shared customer catalog.'}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(buildQrImageUrl(publicAppUrl || OFFICIAL_APP_URL, 300));
                      setCopiedStoreQr(true);
                      setTimeout(() => setCopiedStoreQr(false), 2000);
                    } catch {
                      // ignore
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
                >
                  {copiedStoreQr ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedStoreQr ? (isAr ? 'تم نسخ رابط QR' : 'QR URL Copied') : (isAr ? 'نسخ رابط صورة QR' : 'Copy QR Image URL')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => openExternalLinkSafely(buildQrImageUrl(publicAppUrl || OFFICIAL_APP_URL, 300))}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{isAr ? 'فتح / تحميل QR' : 'Open / Download QR'}</span>
                </button>
              </div>
            </div>

            <div className="md:col-span-4 flex flex-col items-center justify-center">
              <div className="p-2.5 rounded-2xl bg-white border border-slate-200 shadow-xs">
                <img
                  src={buildQrImageUrl(publicAppUrl || OFFICIAL_APP_URL, 300)}
                  alt={isAr ? 'رمز QR المتجر' : 'Store QR Code'}
                  width={128}
                  height={128}
                  className="w-32 h-32 object-contain rounded-lg"
                />
              </div>
              <span className="mt-1.5 text-[10px] font-bold text-slate-500">300 × 300 QR</span>
            </div>
          </div>
        </div>

        {/* Thermal Printer & Paper Size Configuration Card */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Printer className="w-4 h-4 text-emerald-600" />
              <span>{isAr ? 'إعدادات الطابعة الحرارية وتخصيص حجم الورق' : 'Thermal Printer & Paper Size'}</span>
            </h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
              {receiptPaperWidth} {isAr ? 'محدد' : 'selected'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Paper Size Customization (80mm vs 58mm) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                {isAr ? 'حجم رول الورق الحراري (Paper Roll Width):' : 'Paper Roll Width:'}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setReceiptPaperWidth('80mm')}
                  className={`p-3.5 rounded-2xl border text-left rtl:text-right transition-all flex flex-col justify-between ${
                    receiptPaperWidth === '80mm'
                      ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-600/30'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-sm font-mono">80mm (قياسي)</span>
                    {receiptPaperWidth === '80mm' && <Check className="w-4 h-4 text-emerald-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                    {isAr ? 'لطابعات الكاشير والمطاعم القياسية (عرض الفاتورة 76-80 مم)' : 'Standard POS receipt printer (76-80mm print width)'}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setReceiptPaperWidth('58mm')}
                  className={`p-3.5 rounded-2xl border text-left rtl:text-right transition-all flex flex-col justify-between ${
                    receiptPaperWidth === '58mm'
                      ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-600/30'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-sm font-mono">58mm (مدمج)</span>
                    {receiptPaperWidth === '58mm' && <Check className="w-4 h-4 text-emerald-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                    {isAr ? 'للطابعات المحمولة والبلوتوث الصغير (عرض الفاتورة 48-58 مم)' : 'Compact & mobile Bluetooth printer (48-58mm print width)'}
                  </p>
                </button>
              </div>
            </div>

            {/* Printer Model / Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? 'اسم أو طراز الطابعة الحرارية:' : 'Thermal Printer Model:'}
              </label>
              <input
                type="text"
                value={printerName}
                onChange={(e) => setPrinterName(e.target.value)}
                placeholder="Xprinter, Epson TM-T20, Sunmi, Bixolon, Star..."
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl mb-3"
              />

              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? 'نوع التوصيل بالـ POS:' : 'Connection Method:'}
              </label>
              <select
                value={printerConnectionType}
                onChange={(e) => setPrinterConnectionType(e.target.value as 'browser_dialog' | 'bluetooth' | 'network')}
                className="w-full px-3.5 py-2.5 text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              >
                <option value="browser_dialog">{isAr ? 'طابعة النظام الافتراضية / حوار الطباعة (USB / Driver)' : 'System Default / Print Dialog (USB/Driver)'}</option>
                <option value="bluetooth">{isAr ? 'طابعة بلوتوث لاسلكية مدمجة (Bluetooth Thermal)' : 'Bluetooth Thermal Printer'}</option>
                <option value="network">{isAr ? 'طابعة شبكة محلية LAN / Wi-Fi (Network Thermal)' : 'Network Thermal Printer (LAN/Wi-Fi)'}</option>
              </select>
            </div>
          </div>

          {/* Bluetooth Thermal Printer Pairing & Status Bar */}
          <div className="p-3.5 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/60 dark:bg-indigo-950/30 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                btPrinterState.status === 'connected' || btPrinterState.status === 'printing'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 text-white'
              }`}>
                <Bluetooth className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>{isAr ? 'طابعة الإيصالات اللاسلكية بالبلوتوث (ESC/POS)' : 'Bluetooth ESC/POS Thermal Printer'}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    btPrinterState.status === 'connected' || btPrinterState.status === 'printing'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}>
                    {btPrinterState.status === 'connected' || btPrinterState.status === 'printing'
                      ? (isAr ? `متصلة: ${btPrinterState.deviceName || 'Printer'}` : `Connected: ${btPrinterState.deviceName || 'Printer'}`)
                      : (isAr ? 'غير مقترنة' : 'Not paired')}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {isAr
                    ? 'تدعم اللغة العربية ورموز QR مباشرة لطابعات 58mm و 80mm عبر Web Bluetooth.'
                    : 'Direct Arabic RTL & QR ESC/POS printing for 58mm and 80mm BLE thermal printers.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowBluetoothPrinterModal(true)}
              className="px-3.5 py-2 text-xs font-extrabold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center gap-1.5 shadow-2xs shrink-0"
            >
              <Bluetooth className="w-3.5 h-3.5" />
              <span>
                {btPrinterState.status === 'connected' || btPrinterState.status === 'printing'
                  ? (isAr ? 'إدارة الطابعة واختبارها' : 'Manage & Test Printer')
                  : (isAr ? 'ربط طابعة بلوتوث' : 'Pair Bluetooth Printer')}
              </span>
            </button>
          </div>

          {printerToast && (
            <div className="px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-800 dark:text-emerald-300">
              {printerToast}
            </div>
          )}

          {/* Additional Print Options & Test Print */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoPrintCheckbox"
                checked={autoPrintOnCheckout}
                onChange={(e) => setAutoPrintOnCheckout(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
              />
              <label htmlFor="autoPrintCheckbox" className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                {isAr ? 'طباعة الفاتورة تلقائياً بمجرد إتمام عملية البيع' : 'Auto-print receipt immediately upon checkout'}
              </label>
            </div>

            <button
              type="button"
              onClick={handleTestPrint}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                {printerConnectionType === 'bluetooth'
                  ? (isAr ? `طباعة تجريبية بالبلوتوث (${receiptPaperWidth})` : `Bluetooth Test Print (${receiptPaperWidth})`)
                  : (isAr ? `طباعة تجريبية لمعاينة مقاس (${receiptPaperWidth})` : `Test Print (${receiptPaperWidth})`)}
              </span>
            </button>
          </div>
        </div>

        {/* Currency & Tax & Regional */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-600" />
            <span>{isAr ? 'العملة واللغة والضريبة' : 'Currency, Tax & Language'}</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Currency selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {t.currency}
              </label>
              <select
                value={currency}
                onChange={(e) => handleCurrencyChange(e.target.value as CurrencyCode)}
                className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              >
                <option value="SAR">SAR (ر.س - ريال سعودي)</option>
                <option value="MAD">MAD (د.م - درهم مغربي)</option>
                <option value="AED">AED (د.إ - درهم إماراتي)</option>
                <option value="KWD">KWD (د.ك - دينار كويتي)</option>
                <option value="USD">USD ($ - US Dollar)</option>
                <option value="EUR">EUR (€ - Euro)</option>
              </select>
            </div>

            {/* Language Selector: Arabic, French, English */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {t.language_lbl}
              </label>
              <select
                value={selectedLang}
                onChange={(e) => setSelectedLang(e.target.value as 'ar' | 'fr' | 'en')}
                className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              >
                <option value="ar">العربية (Arabic - RTL)</option>
                <option value="fr">Français (French - LTR)</option>
                <option value="en">English (English - LTR)</option>
              </select>
            </div>

            {/* VAT Rate */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {t.vat_rate}
              </label>
              <input
                type="number"
                step="any"
                value={taxRate}
                onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
          </div>

          {/* Receipt Welcome Message & Footer Notes (رسالة ترحيبية وملاحظات أسفل الفاتورة) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-emerald-600" />
                <div>
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                    {isAr
                      ? 'رسالة ترحيبية وملاحظات أسفل الفاتورة (تظهر تلقائياً في الإيصالات)'
                      : 'Receipt Welcome Message & Footer Notes'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {isAr
                      ? 'تُطبع تلقائياً في الإيصالات الحرارية (80mm/58mm)، الفواتير المفصلة، وملفات PDF'
                      : 'Automatically included in thermal prints, detailed invoices, and PDFs'}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Inputs Column */}
              <div className="lg:col-span-2 space-y-3">
                {/* Welcome / Header Message */}
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {isAr ? 'رسالة ترحيبية (أعلى الفاتورة)' : 'Welcome Message (Receipt Header)'}
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showReceiptHeaderMsg}
                        onChange={(e) => setShowReceiptHeaderMsg(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-600"
                      />
                      <span>{isAr ? 'تفعيل في المطبوعات' : 'Show on receipts'}</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    value={receiptHeaderMsg}
                    onChange={(e) => setReceiptHeaderMsg(e.target.value)}
                    disabled={!showReceiptHeaderMsg}
                    placeholder={
                      isAr
                        ? 'مثال: أهلاً وسهلاً بكم! نتمنى لكم تسوقاً سعيداً...'
                        : 'e.g. Welcome to our store!'
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl disabled:opacity-50"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {(isAr
                      ? [
                          'أهلاً وسهلاً بكم! تسوقاً سعيداً ومباركاً',
                          'مرحباً بكم في متجرنا · الجودة والخدمة أولاً',
                          'تخفيضات وعروض جديدة في انتظاركم يومياً'
                        ]
                      : [
                          'Welcome! Thank you for shopping with us.',
                          'Fresh quality & best prices every day!'
                        ]
                    ).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        disabled={!showReceiptHeaderMsg}
                        onClick={() => setReceiptHeaderMsg(preset)}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40 transition-colors disabled:opacity-40"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Footer Message / Notes */}
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {isAr ? 'ملاحظات أسفل الفاتورة (تذييل الإيصال)' : 'Footer Notes (Bottom of Receipt)'}
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showReceiptFooterMsg}
                        onChange={(e) => setShowReceiptFooterMsg(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-600"
                      />
                      <span>{isAr ? 'تفعيل في المطبوعات' : 'Show on receipts'}</span>
                    </label>
                  </div>
                  <textarea
                    rows={2}
                    value={receiptFooterMsg}
                    onChange={(e) => setReceiptFooterMsg(e.target.value)}
                    disabled={!showReceiptFooterMsg}
                    placeholder={
                      isAr
                        ? 'مثال: شكراً لزيارتكم! السلعة المشتراة تُبدّل خلال 48 ساعة مع إحضار الوصل.'
                        : 'e.g. Thank you for your visit! Returns accepted within 48h with receipt.'
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl disabled:opacity-50"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {(isAr
                      ? [
                          'شكراً لزيارتكم! مرحباً بكم دائماً.',
                          'يمكن استبدال المنتجات خلال 48 ساعة بإحضار الوصل.',
                          'للطلب والتوصيل تواصلوا معنا عبر واتساب.'
                        ]
                      : [
                          'Thank you for visiting! See you again.',
                          'Exchanges accepted within 48 hours with receipt.'
                        ]
                    ).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        disabled={!showReceiptFooterMsg}
                        onClick={() =>
                          setReceiptFooterMsg((prev) =>
                            prev.trim() ? `${prev.trim()}\n${preset}` : preset
                          )
                        }
                        className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40 transition-colors disabled:opacity-40"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Live Mini Receipt Preview */}
              <div className="p-3 rounded-2xl bg-white text-slate-900 border border-slate-200 shadow-2xs flex flex-col justify-between text-center text-[10px] font-sans">
                <div>
                  <div className="text-[9px] font-black text-emerald-700 uppercase tracking-wider mb-1.5">
                    {isAr ? 'معاينة الإيصال المطبوع' : 'Live Receipt Preview'}
                  </div>
                  <div className="font-black text-xs text-slate-900 truncate">
                    {storeName || settings.storeName}
                  </div>
                  <div className="text-[9px] text-slate-500 font-mono">{phone || settings.phone}</div>

                  {showReceiptHeaderMsg && receiptHeaderMsg.trim() && (
                    <div className="mt-2 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold text-[10px] leading-snug">
                      {receiptHeaderMsg}
                    </div>
                  )}

                  <div className="my-2.5 border-y border-dashed border-slate-300 py-2 space-y-1 text-[9px] text-slate-500">
                    <div className="flex justify-between">
                      <span>{isAr ? 'حليب × 2' : 'Item × 2'}</span>
                      <span className="font-mono font-bold text-slate-800">
                        16.00 {currencySymbol}
                      </span>
                    </div>
                    <div className="flex justify-between font-black text-slate-900 pt-1 border-t border-slate-100">
                      <span>{isAr ? 'المجموع' : 'Total'}</span>
                      <span className="font-mono">16.00 {currencySymbol}</span>
                    </div>
                  </div>
                </div>

                {showReceiptFooterMsg && receiptFooterMsg.trim() ? (
                  <div className="text-[10px] text-slate-600 whitespace-pre-line leading-relaxed pt-1">
                    {receiptFooterMsg}
                  </div>
                ) : (
                  <div className="text-[9px] text-slate-400 italic pt-1">
                    {isAr ? '(لا توجد ملاحظات سفلية مفعّلة)' : '(Footer notes hidden)'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sound Effects Toggle */}
          <div className="pt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {enableSoundEffects ? (
                <Volume2 className="w-5 h-5 text-emerald-600" />
              ) : (
                <VolumeX className="w-5 h-5 text-slate-400 dark:text-slate-300" />
              )}
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  {t.sounds}
                </div>
                <div className="text-[11px] text-slate-400">
                  {isAr ? 'صوت مسح الباركود، رنين إتمام الدفع وفتح الدرج' : 'Tactile audio beeps and payment chimes'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEnableSoundEffects(!enableSoundEffects)}
              className={`w-12 h-6 rounded-full transition-colors relative ${
                enableSoundEffects ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                  enableSoundEffects ? 'translate-x-6.5 rtl:-translate-x-6.5' : 'translate-x-0.5 rtl:-translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Low-Stock Push & Visual Alerts Configuration */}
          <div className="pt-4 mt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BellRing className="w-5 h-5 text-amber-500" />
                <div>
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                    {isAr
                      ? 'تنبيهات نفاد المخزون (Push Notifications & إشعارات بصرية)'
                      : 'Low-Stock Push & Visual Notifications'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {isAr
                      ? 'تنبيهات فورية عند نزول أي منتج تحت الحد الأدنى حتى خارج شاشة المخزون'
                      : 'Instant alerts whenever any item drops below reorder threshold on any screen'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {notificationPermission !== 'unsupported' && notificationPermission !== 'granted' && (
                  <button
                    type="button"
                    onClick={() => void requestNotificationPermission()}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black transition-colors"
                  >
                    {notificationPermission === 'denied'
                      ? isAr
                        ? 'الإشعارات محظورة بالمتصفح'
                        : 'Blocked in Browser'
                      : isAr
                      ? 'تفعيل إشعارات المتصفح (Push)'
                      : 'Allow Browser Push'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void triggerTestStockAlert()}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-[11px] font-black transition-colors"
                >
                  {isAr ? 'إرسال تنبيه تجريبي الآن' : 'Test Stock Alert'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <label className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {isAr ? 'الإشعارات البصرية العائمة' : 'Floating Visual Alerts'}
                </span>
                <input
                  type="checkbox"
                  checked={enableLowStockVisualAlerts}
                  onChange={(e) => setEnableLowStockVisualAlerts(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded"
                />
              </label>

              <label className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {isAr ? 'إشعارات الدفع (Push)' : 'Browser Push Alerts'}
                </span>
                <input
                  type="checkbox"
                  checked={enableLowStockPushNotifications}
                  onChange={(e) => setEnableLowStockPushNotifications(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded"
                />
              </label>

              <label className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {isAr ? 'نغمة تنبيه عند النقص' : 'Audio Chime on Low Stock'}
                </span>
                <input
                  type="checkbox"
                  checked={enableLowStockAudioAlert}
                  onChange={(e) => setEnableLowStockAudioAlert(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded"
                />
              </label>
            </div>
          </div>

          {/* Anti-Theft & Loss Prevention Configuration */}
          <div className="pt-4 mt-2 border-t border-rose-200/80 dark:border-rose-900/50 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                <div>
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                    {isAr
                      ? 'نظام تنبيه السرقة وحماية الصندوق والمخزون (Anti-Theft)'
                      : 'Anti-Theft, Shrinkage & Cash Fraud Alert System'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {isAr
                      ? 'كشف تلقائي لعجز الصندوق، السحوبات النقدية الكبيرة، الخصومات المفرطة، الاسترجاعات المشبوهة وإفراغ الفاتورة'
                      : 'Auto-detects drawer shortage, large pay-outs, excessive discounts, refunds & cart voids'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void triggerTestTheftAlert()}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black flex items-center gap-1.5 transition-colors"
                >
                  <Siren className="w-3.5 h-3.5" />
                  <span>{isAr ? 'تجربة تنبيه السرقة والصافرة' : 'Test Theft Siren'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('kadi:open-theft-security'))}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-[11px] font-bold transition-colors"
                >
                  {isAr
                    ? `مركز الأمان (${unresolvedTheftAlerts.length})`
                    : `Security Center (${unresolvedTheftAlerts.length})`}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <label className="p-3 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  {isAr ? 'تفعيل مراقبة السرقة' : 'Enable Anti-Theft'}
                </span>
                <input
                  type="checkbox"
                  checked={theftSettings.enabled}
                  onChange={(e) =>
                    setTheftSettings((prev) => ({ ...prev, enabled: e.target.checked }))
                  }
                  className="w-4 h-4 text-rose-600 rounded"
                />
              </label>

              <label className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {isAr ? 'تشغيل صافرة الإنذار' : 'Enable Siren Sound'}
                </span>
                <input
                  type="checkbox"
                  checked={theftSettings.enableSirenSound}
                  onChange={(e) =>
                    setTheftSettings((prev) => ({ ...prev, enableSirenSound: e.target.checked }))
                  }
                  className="w-4 h-4 text-rose-600 rounded"
                />
              </label>

              <label className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {isAr ? 'إشعار دفع فوري (Push)' : 'Push Notification'}
                </span>
                <input
                  type="checkbox"
                  checked={theftSettings.enablePushNotification}
                  onChange={(e) =>
                    setTheftSettings((prev) => ({
                      ...prev,
                      enablePushNotification: e.target.checked
                    }))
                  }
                  className="w-4 h-4 text-rose-600 rounded"
                />
              </label>

              <label className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {isAr ? 'قفل الإغلاق برمز المدير' : 'Require Manager PIN'}
                </span>
                <input
                  type="checkbox"
                  checked={theftSettings.requireManagerPinToDismiss}
                  onChange={(e) =>
                    setTheftSettings((prev) => ({
                      ...prev,
                      requireManagerPinToDismiss: e.target.checked
                    }))
                  }
                  className="w-4 h-4 text-rose-600 rounded"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  {isAr
                    ? `حد عجز الصندوق (${currencySymbol})`
                    : `Cash Shortage Threshold (${currencySymbol})`}
                </label>
                <input
                  type="number"
                  min="1"
                  value={theftSettings.cashShortageThreshold}
                  onChange={(e) =>
                    setTheftSettings((prev) => ({
                      ...prev,
                      cashShortageThreshold: Math.max(1, Number(e.target.value) || 0)
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  {isAr
                    ? `حد السحب النقدي المشبوه (${currencySymbol})`
                    : `Large Cash Pay-Out (${currencySymbol})`}
                </label>
                <input
                  type="number"
                  min="1"
                  value={theftSettings.suspiciousPayoutThreshold}
                  onChange={(e) =>
                    setTheftSettings((prev) => ({
                      ...prev,
                      suspiciousPayoutThreshold: Math.max(1, Number(e.target.value) || 0)
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  {isAr
                    ? `حد تنبيه الاسترجاع (${currencySymbol})`
                    : `Suspicious Refund (${currencySymbol})`}
                </label>
                <input
                  type="number"
                  min="1"
                  value={theftSettings.suspiciousRefundThreshold}
                  onChange={(e) =>
                    setTheftSettings((prev) => ({
                      ...prev,
                      suspiciousRefundThreshold: Math.max(1, Number(e.target.value) || 0)
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  {isAr ? 'حد الخصم المفرط (%)' : 'Excessive Discount (%)'}
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={theftSettings.highDiscountPercentThreshold}
                  onChange={(e) =>
                    setTheftSettings((prev) => ({
                      ...prev,
                      highDiscountPercentThreshold: Math.min(100, Math.max(1, Number(e.target.value) || 0))
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  {isAr ? 'حد عجز المخزون (وحدات)' : 'Stock Shrinkage (Units)'}
                </label>
                <input
                  type="number"
                  min="1"
                  value={theftSettings.stockShrinkageUnitsThreshold}
                  onChange={(e) =>
                    setTheftSettings((prev) => ({
                      ...prev,
                      stockShrinkageUnitsThreshold: Math.max(1, Number(e.target.value) || 0)
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  {isAr
                    ? `حد إلغاء السلة الجارية (${currencySymbol})`
                    : `Cart Void Threshold (${currencySymbol})`}
                </label>
                <input
                  type="number"
                  min="1"
                  value={theftSettings.cartVoidAmountThreshold}
                  onChange={(e) =>
                    setTheftSettings((prev) => ({
                      ...prev,
                      cartVoidAmountThreshold: Math.max(1, Number(e.target.value) || 0)
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Zakat al-Tijarah & 85g Gold Nisab Settings (إعدادات زكاة التجارة وسعر جرام الذهب والنصاب) */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-amber-500" />
              <span>{isAr ? 'إعدادات زكاة التجارة ونصاب الذهب (85 جرام)' : 'Trade Zakat & 85g Gold Nisab Settings'}</span>
            </h3>
            <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300/70 dark:border-amber-800 tabular-nums">
              {isAr ? 'النصاب الحالي:' : 'Current Nisab:'} {dynamicNisabValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currencySymbol}
            </span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {isAr
              ? 'حدّث سعر جرام الذهب (عيار 24) وفق السعر الجاري في السوق ليتم احتساب قيمة النصاب الشرعي لزكاة عروض التجارة (85 جرام × سعر الجرام) تلقائياً في التقارير.'
              : 'Update the current price per gram of 24K gold so the 85g Nisab threshold for trade Zakat updates dynamically in Analytics.'}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Current Gold Price per Gram */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? `سعر جرام الذهب الحالي (${currencySymbol} / جم) *` : `Gold Price per Gram (${currencySymbol}/g) *`}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={goldPricePerGram === 0 ? '' : goldPricePerGram}
                  placeholder="750"
                  onChange={(e) => {
                    const val = e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0);
                    setGoldPricePerGram(val);
                    updateSettings({ goldPricePerGram: val });
                  }}
                  className="w-full px-3.5 py-2.5 text-sm font-mono font-black bg-amber-50/50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-amber-500 tabular-nums"
                />
                <span className="absolute end-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-amber-600">
                  {currencySymbol}/g
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                {isAr ? 'يتحدث النصاب (85 جم) مباشرة عند التعديل' : 'Updates 85g Nisab immediately'}
              </div>
            </div>

            {/* Cash Reserve on Hand / Bank for Zakat */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? `السيولة النقدية التجارية (${currencySymbol})` : `Business Cash Liquidity (${currencySymbol})`}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={zakatCashOnHand === 0 ? '' : zakatCashOnHand}
                placeholder="0.00"
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0);
                  setZakatCashOnHand(val);
                  updateSettings({ zakatCashOnHand: val });
                }}
                className="w-full px-3.5 py-2.5 text-sm font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl tabular-nums"
              />
              <div className="text-[10px] text-slate-400 mt-1">
                {isAr ? 'النقد في الصندوق والبنك المخصص للتجارة' : 'Cash in register/bank for trade'}
              </div>
            </div>

            {/* Deductible Supplier Debts */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? `ديون الموردين المستحقة عليك (${currencySymbol})` : `Supplier Payables to Deduct (${currencySymbol})`}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={zakatPayableDebts === 0 ? '' : zakatPayableDebts}
                placeholder="0.00"
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0);
                  setZakatPayableDebts(val);
                  updateSettings({ zakatPayableDebts: val });
                }}
                className="w-full px-3.5 py-2.5 text-sm font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl tabular-nums"
              />
              <div className="text-[10px] text-slate-400 mt-1">
                {isAr ? 'تُخصم من وعاء الزكاة قبل الحساب' : 'Subtracted from Zakatable base'}
              </div>
            </div>
          </div>

          {/* Live Dynamic Formula Banner */}
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-extrabold text-amber-950 dark:text-amber-200">
                  {isAr ? 'معادلة النصاب الشرعي لزكاة التجارة:' : 'Dynamic Trade Zakat Nisab Formula:'}
                </div>
                <div className="text-[11px] font-mono font-bold text-amber-800 dark:text-amber-300 mt-0.5 tabular-nums">
                  85 g × {Number(goldPricePerGram || 0).toFixed(2)} {currencySymbol} ={' '}
                  <span className="text-sm font-black underline">
                    {dynamicNisabValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currencySymbol}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-[11px] font-bold text-amber-900 dark:text-amber-200 bg-white/80 dark:bg-slate-900/80 px-3 py-1.5 rounded-xl border border-amber-200/80 dark:border-amber-800">
              {isAr ? 'نسبة الزكاة الواجبة: 2.5% (ربع العشر)' : 'Zakat Rate: 2.5% (1/40)'}
            </div>
          </div>

          {/* Live Automatic Zakat Calculation When Nisab Exceeded */}
          <div
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              zakatSummary.hasReachedNisab
                ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className="space-y-1">
              <div className="text-xs font-black text-slate-900 dark:text-white">
                {zakatSummary.hasReachedNisab
                  ? (isAr
                      ? '✅ الحساب الآلي: الوعاء الزكوي تجاوز النصاب — الزكاة المستحقة (2.5%)'
                      : '✅ Auto Calculation: Nisab Exceeded — Zakat Due (2.5%)')
                  : (isAr
                      ? '⏳ الحساب الآلي: الوعاء الزكوي لم يبلغ نصاب 85 جرام بعد'
                      : '⏳ Auto Calculation: Zakatable Base Below 85g Nisab')}
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400 font-medium flex flex-wrap gap-2">
                <span>
                  {isAr ? 'المخزون:' : 'Stock:'}{' '}
                  <strong className="font-mono">{zakatSummary.selectedInventoryValue.toFixed(2)}</strong>
                </span>
                <span>+</span>
                <span>
                  {isAr ? 'الكريدي:' : 'Credit:'}{' '}
                  <strong className="font-mono">{zakatSummary.receivablesTotal.toFixed(2)}</strong>
                </span>
                <span>+</span>
                <span>
                  {isAr ? 'السيولة:' : 'Cash:'}{' '}
                  <strong className="font-mono">{zakatSummary.cashOnHand.toFixed(2)}</strong>
                </span>
                <span>−</span>
                <span>
                  {isAr ? 'الديون:' : 'Debts:'}{' '}
                  <strong className="font-mono">{zakatSummary.payableDebts.toFixed(2)}</strong>
                </span>
                <span>=</span>
                <strong className="font-mono text-slate-900 dark:text-white">
                  {zakatSummary.zakatableBase.toFixed(2)} {currencySymbol}
                </strong>
              </div>
            </div>

            <div className="text-end shrink-0">
              <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'الزكاة الواجبة آلياً:' : 'Auto Zakat Due:'}
              </div>
              <div
                className={`text-xl font-black font-mono tabular-nums ${
                  zakatSummary.hasReachedNisab ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                }`}
              >
                {zakatSummary.zakatDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currencySymbol}
              </div>
              {zakatSummary.hasReachedNisab && (
                <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 font-mono">
                  +{zakatSummary.excessOverNisab.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {isAr ? 'فوق النصاب' : 'over Nisab'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Theme Mode & Auto Eye Comfort Switching (الوضع الليلي الحقيقي وراحة العين) */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Moon className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              <span>{isAr ? 'مظهر التطبيق — الوضع الليلي الحقيقي وراحة العين' : 'Theme & True Dark Eye Comfort'}</span>
            </h3>
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800/70 px-2.5 py-0.5 rounded-full">
              {themeMode === 'auto_system'
                ? (isAr ? 'تلقائي حسب الجهاز' : 'Auto System')
                : themeMode === 'auto_time'
                ? (isAr ? 'ليلي تلقائي (19:00 - 06:00)' : 'Auto Night Comfort')
                : themeMode === 'dark'
                ? (isAr ? 'وضع ليلي حقيقي (مفعل)' : 'True Dark Mode')
                : (isAr ? 'وضع فاتح دائم' : 'Light')}
            </span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {isAr
              ? 'الوضع الليلي الحقيقي (True Dark Mode) يوفر خلفية داكنة عميقة مع تباين محسّن للنصوص والأيقونات لتقليل إجهاد العين في بيئات العمل المظلمة، مع إمكانية التبديل في أي وقت.'
              : 'True Dark Mode provides deep OLED charcoal surfaces with high-contrast text and icons to reduce eye strain in dark work environments.'}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            {[
              {
                id: 'auto_system' as ThemeMode,
                title: isAr ? 'تلقائي حسب نظام الجهاز' : 'Device System',
                desc: isAr ? 'يتطابق مع مظهر الهاتف/الكمبيوتر' : 'Matches device dark/light setting',
                icon: Sparkles
              },
              {
                id: 'auto_time' as ThemeMode,
                title: isAr ? 'تلقائي ليلي لراحة العين' : 'Night Eye Comfort',
                desc: isAr ? 'مظلم ليلاً (19:00 - 06:00)' : 'Dark from 19:00 to 06:00',
                icon: Moon
              },
              {
                id: 'light' as ThemeMode,
                title: isAr ? 'وضع فاتح دائم' : 'Light Mode',
                desc: isAr ? 'مظهر ناصع ومشرق دائماً' : 'Always bright light theme',
                icon: Sun
              },
              {
                id: 'dark' as ThemeMode,
                title: isAr ? 'الوضع الليلي الحقيقي (موصى به)' : 'True Dark Mode',
                desc: isAr ? 'داكن عميق مع تباين عالٍ للنصوص والأيقونات' : 'Deep dark OLED + high-contrast text & icons',
                icon: Moon
              }
            ].map((mode) => {
              const isSelected = themeMode === mode.id;
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setThemeMode(mode.id)}
                  className={`p-3.5 rounded-2xl border text-start transition-all ${
                    isSelected
                      ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/50 shadow-xs ring-2 ring-emerald-500/25'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/70 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 flex items-center justify-center shadow-2xs">
                      <Icon className={`w-4 h-4 ${isSelected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-300'}`} />
                    </div>
                    {isSelected && (
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    )}
                  </div>
                  <div className="font-extrabold text-xs text-slate-900 dark:text-white">
                    {mode.title}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {mode.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* App Palettes Studio & Custom Color Switcher (إنشاء والتبديل بين لوحات الألوان) */}
        <div
          id="palette-studio"
          className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Palette className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>{isAr ? 'استوديو الباليت — إنشاء لوحات ألوان للتطبيق والتبديل بينها' : 'App Color Palettes & Custom Theme Studio'}</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isAr
                  ? 'بدّل بضغطة واحدة بين لوحات الألوان الجاهزة أو أنشئ باليت خاصة بك بألوانك المفضلة للأزرار والخلفيات الليلية.'
                  : 'Switch instantly between built-in palettes or create your own custom color palette.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => (showPaletteCreator ? setShowPaletteCreator(false) : openNewPaletteCreator())}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{showPaletteCreator ? (isAr ? 'إغلاق الاستوديو' : 'Close Studio') : (isAr ? 'إنشاء باليت جديدة' : 'New Palette')}</span>
            </button>
          </div>

          {paletteToast && (
            <div className="px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{paletteToast}</span>
            </div>
          )}

          {/* Create / Edit Palette Studio Form */}
          {showPaletteCreator && (
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-emerald-300/70 dark:border-emerald-700/70 space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    {editingPaletteId
                      ? (isAr ? 'تعديل الباليت المخصصة' : 'Edit Custom Palette')
                      : (isAr ? 'تصميم باليت ألوان جديدة للتطبيق' : 'Design New App Palette')}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Controls */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        {isAr ? 'اسم الباليت *' : 'Palette Name *'}
                      </label>
                      <input
                        type="text"
                        value={palName}
                        onChange={(e) => setPalName(e.target.value)}
                        placeholder={isAr ? 'مثال: باليت متجري الليلي' : 'e.g. Store Midnight'}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        {isAr ? 'وضع الإضاءة المفضل عند التفعيل' : 'Preferred Mode on Switch'}
                      </label>
                      <select
                        value={palPreferredMode}
                        onChange={(e) => setPalPreferredMode(e.target.value as 'keep' | 'dark' | 'light')}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white"
                      >
                        <option value="keep">{isAr ? 'الحفاظ على الوضع الحالي (ليلي/فاتح)' : 'Keep Current Light/Dark'}</option>
                        <option value="dark">{isAr ? 'تفعيل الوضع الليلي الحقيقي تلقائياً' : 'Force True Dark Mode'}</option>
                        <option value="light">{isAr ? 'تفعيل الوضع الفاتح تلقائياً' : 'Force Light Mode'}</option>
                      </select>
                    </div>
                  </div>

                  {/* Brand Quick Swatches */}
                  <div>
                    <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                      {isAr ? 'اختيار سريع للألوان الرئيسية:' : 'Quick Brand Swatches:'}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { p: '#059669', a: '#10b981', label: 'زمردي' },
                        { p: '#2563eb', a: '#38bdf8', label: 'أزرق' },
                        { p: '#7c3aed', a: '#c084fc', label: 'بنفسجي' },
                        { p: '#d97706', a: '#fbbf24', label: 'ذهبي' },
                        { p: '#e11d48', a: '#fb7185', label: 'ياقوتي' },
                        { p: '#0d9488', a: '#2dd4bf', label: 'تركواز' },
                        { p: '#ea580c', a: '#fb923c', label: 'برتقالي' },
                        { p: '#4f46e5', a: '#818cf8', label: 'نيلي' }
                      ].map((sw) => (
                        <button
                          key={sw.p}
                          type="button"
                          onClick={() => {
                            setPalPrimary(sw.p);
                            setPalAccent(sw.a);
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all ${
                            palPrimary.toLowerCase() === sw.p
                              ? 'border-emerald-500 bg-white dark:bg-slate-900 shadow-2xs ring-2 ring-emerald-500/20'
                              : 'border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 hover:border-slate-400'
                          }`}
                        >
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: sw.p }} />
                          <span className="text-slate-700 dark:text-slate-200">{sw.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 4 Fine Color Pickers */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <label className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer block">
                      <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">
                        {isAr ? 'اللون الرئيسي' : 'Primary Color'}
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={palPrimary}
                          onChange={(e) => setPalPrimary(e.target.value)}
                          className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                        />
                        <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase">
                          {palPrimary}
                        </span>
                      </div>
                    </label>

                    <label className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer block">
                      <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">
                        {isAr ? 'اللون المميز' : 'Accent Color'}
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={palAccent}
                          onChange={(e) => setPalAccent(e.target.value)}
                          className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                        />
                        <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase">
                          {palAccent}
                        </span>
                      </div>
                    </label>

                    <label className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer block">
                      <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">
                        {isAr ? 'الخلفية الليلية' : 'Dark Canvas'}
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={palDarkBg}
                          onChange={(e) => setPalDarkBg(e.target.value)}
                          className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                        />
                        <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase">
                          {palDarkBg}
                        </span>
                      </div>
                    </label>

                    <label className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer block">
                      <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">
                        {isAr ? 'لون البطاقات' : 'Dark Card'}
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={palDarkCard}
                          onChange={(e) => setPalDarkCard(e.target.value)}
                          className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                        />
                        <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase">
                          {palDarkCard}
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* Quick Dark Surface Presets */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      {isAr ? 'خلفيات ليلية جاهزة:' : 'Dark Surfaces:'}
                    </span>
                    {[
                      { bg: '#04060a', card: '#0a0f18', label: 'OLED أسود عميق' },
                      { bg: '#04070f', card: '#0a1120', label: 'كحلي ليلي' },
                      { bg: '#06050e', card: '#100c1f', label: 'ليلكي غامق' },
                      { bg: '#090704', card: '#14100a', label: 'إسبريسو دافئ' },
                      { bg: '#040907', card: '#091410', label: 'غابة داكنة' }
                    ].map((surf) => (
                      <button
                        key={surf.label}
                        type="button"
                        onClick={() => {
                          setPalDarkBg(surf.bg);
                          setPalDarkCard(surf.card);
                        }}
                        className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:border-emerald-500 flex items-center gap-1.5"
                      >
                        <span className="w-2.5 h-2.5 rounded-full border border-slate-500" style={{ backgroundColor: surf.card }} />
                        <span>{surf.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Mini Preview */}
                <div className="lg:col-span-5 flex flex-col justify-between gap-3">
                  <div
                    className="p-4 rounded-2xl border shadow-sm space-y-3"
                    style={{
                      backgroundColor: palDarkBg,
                      borderColor: `${palPrimary}44`
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-300">
                        {isAr ? 'معاينة فورية للباليت' : 'Live Palette Preview'}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-extrabold"
                        style={{ backgroundColor: `${palPrimary}26`, color: palAccent }}
                      >
                        {palName || (isAr ? 'باليت جديدة' : 'New Palette')}
                      </span>
                    </div>

                    <div
                      className="p-3 rounded-xl border space-y-2.5"
                      style={{
                        backgroundColor: palDarkCard,
                        borderColor: `${palAccent}33`
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-extrabold text-white">
                          {settings.storeName}
                        </div>
                        <div className="font-mono text-xs font-black" style={{ color: palAccent }}>
                          245.00 {currencySymbol}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="flex-1 py-1.5 rounded-lg text-center text-[11px] font-extrabold text-white"
                          style={{ backgroundColor: palPrimary }}
                        >
                          {isAr ? 'إتمام البيع' : 'Checkout'}
                        </span>
                        <span
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border"
                          style={{ borderColor: palAccent, color: palAccent }}
                        >
                          {isAr ? 'فاتورة' : 'Receipt'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowPaletteCreator(false);
                        setEditingPaletteId(null);
                      }}
                      className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {isAr ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSavePalette}
                      disabled={!palName.trim()}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs"
                    >
                      <Check className="w-4 h-4" />
                      <span>
                        {editingPaletteId
                          ? (isAr ? 'حفظ التعديلات وتفعيل' : 'Save & Apply')
                          : (isAr ? 'إنشاء وتفعيل الباليت الآن' : 'Create & Activate')}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Palette Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {allPalettes.map((pal) => {
              const isCurrent = pal.id === activePalette.id;
              return (
                <div
                  key={pal.id}
                  onClick={() => selectPalette(pal.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectPalette(pal.id);
                    }
                  }}
                  className={`p-3.5 rounded-2xl border text-start cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                    isCurrent
                      ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 ring-2 ring-emerald-500/25 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-extrabold text-xs text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                        <span>{isAr ? pal.name : pal.nameEn || pal.name}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {pal.isBuiltIn
                          ? isAr ? 'باليت أساسية' : 'Built-in Preset'
                          : isAr ? 'باليت مخصصة' : 'Custom Palette'}
                      </div>
                    </div>

                    {isCurrent ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black shrink-0 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        <span>{isAr ? 'مفعّلة' : 'Active'}</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold shrink-0">
                        {isAr ? 'تبديل' : 'Apply'}
                      </span>
                    )}
                  </div>

                  {/* Color Swatch Strip */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-6 h-6 rounded-lg border border-white/50 dark:border-slate-900 shadow-2xs"
                        style={{ backgroundColor: pal.primaryColor }}
                        title="Primary"
                      />
                      <span
                        className="w-6 h-6 rounded-lg border border-white/50 dark:border-slate-900 shadow-2xs"
                        style={{ backgroundColor: pal.accentColor }}
                        title="Accent"
                      />
                      <span
                        className="w-6 h-6 rounded-lg border border-slate-300 dark:border-slate-600 shadow-2xs"
                        style={{ backgroundColor: pal.darkCardColor }}
                        title="Dark Card"
                      />
                      <span
                        className="w-6 h-6 rounded-lg border border-slate-300 dark:border-slate-600 shadow-2xs"
                        style={{ backgroundColor: pal.darkBgColor }}
                        title="Dark Background"
                      />
                    </div>

                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => openNewPaletteCreator(pal)}
                        className="p-1.5 rounded-lg text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors"
                        title={isAr ? 'نسخ وتخصيص باليت جديدة' : 'Duplicate & customize'}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      {!pal.isBuiltIn && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditPalette(pal)}
                            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 transition-colors"
                            title={isAr ? 'تعديل الباليت' : 'Edit palette'}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteCustomPalette(pal.id)}
                            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors"
                            title={isAr ? 'حذف الباليت' : 'Delete palette'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* User Management & Security PIN Protection (إدارة المستخدمين والصلاحيات وحماية الأقسام) */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <span>{isAr ? 'إدارة المستخدمين والصلاحيات وحماية الأقسام' : 'User Management, Roles & PIN Protection'}</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr
                  ? 'إضافة مستخدمين بصلاحيات (مدير / كاشير)، وتفعيل حماية الدخول للمخزون والإعدادات برمز PIN.'
                  : 'Manage staff roles (Manager / Cashier) and protect Inventory & Settings with a PIN.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddUserModal(!showAddUserModal)}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAr ? '+ إضافة مستخدم جديد' : '+ Add User'}</span>
            </button>
          </div>

          {/* Section Protection Toggles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-500" />
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {isAr ? 'حماية المخزون برمز PIN' : 'Protect Inventory with PIN'}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {isAr ? 'طلب الرمز السري عند الدخول للمخزون' : 'Require PIN to view/adjust stock'}
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={protectInventoryWithPin}
                onChange={(e) => setProtectInventoryWithPin(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-500" />
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {isAr ? 'حماية الإعدادات برمز PIN' : 'Protect Settings with PIN'}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {isAr ? 'منع الكاشير من تغيير إعدادات المتجر' : 'Restrict settings to manager'}
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={protectSettingsWithPin}
                onChange={(e) => setProtectSettingsWithPin(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* Manager PIN Input */}
          <div className="max-w-xs">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {isAr ? 'رمز مرور المدير الرئيسي (Manager PIN)' : 'Primary Manager Security PIN'}
            </label>
            <div className="relative">
              <input
                type="password"
                maxLength={6}
                value={managerPin}
                onChange={(e) => setManagerPin(e.target.value)}
                placeholder="1234"
                className="w-full px-3.5 py-2.5 text-sm font-mono font-bold tracking-widest bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-emerald-500"
              />
              <span className="absolute end-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                {isAr ? 'الافتراضي: 1234' : 'Default: 1234'}
              </span>
            </div>
          </div>

          {/* Add New User Inline Form */}
          {showAddUserModal && (
            <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 space-y-3 animate-in fade-in">
              <div className="font-bold text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>{isAr ? 'بيانات المستخدم الجديد' : 'New User Credentials'}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    {isAr ? 'اسم المستخدم *' : 'Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder={isAr ? 'مثال: يوسف الإدريسي' : 'e.g. Youssef'}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    {isAr ? 'الصلاحية / الدور *' : 'Role *'}
                  </label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                  >
                    <option value="cashier">{isAr ? 'كاشير (مبيعات فقط)' : 'Cashier'}</option>
                    <option value="courier">{isAr ? 'موزّع / توصيل (Livreur)' : 'Courier (Delivery)'}</option>
                    <option value="manager">{isAr ? 'مدير (كامل الصلاحيات)' : 'Manager'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    {isAr ? 'رمز PIN السري (4 أرقام)' : 'PIN (4 digits)'}
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={newUserPin}
                    onChange={(e) => setNewUserPin(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500">{isAr ? 'الرمز التعبيري:' : 'Avatar:'}</span>
                  {['👨‍💼', '🧑‍💻', '🛵', '👩‍💼', '🧕', '🧔', '🧑'].map((av) => (
                    <button
                      key={av}
                      type="button"
                      onClick={() => setNewUserAvatar(av)}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm border transition-all ${
                        newUserAvatar === av
                          ? 'border-emerald-600 bg-white dark:bg-slate-800 scale-110 shadow-xs'
                          : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                    >
                      {av}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddUserModal(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300"
                  >
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={handleAddNewUser}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs shadow-xs"
                  >
                    {isAr ? 'حفظ المستخدم' : 'Save User'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Users Table / Cards with Inline Edit */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {users.map((u) => {
              const isEditingThis = editingUserId === u.id;
              return (
                <div
                  key={u.id}
                  className="p-3.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
                >
                  {isEditingThis ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            {isAr ? 'الاسم الجديد للمستخدم *' : 'User Name *'}
                          </label>
                          <input
                            type="text"
                            value={editUserName}
                            onChange={(e) => setEditUserName(e.target.value)}
                            className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-emerald-400 rounded-xl text-xs font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            {isAr ? 'الصلاحية' : 'Role'}
                          </label>
                          <select
                            value={editUserRole}
                            onChange={(e) => setEditUserRole(e.target.value as UserRole)}
                            className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                          >
                            <option value="cashier">{isAr ? 'كاشير' : 'Cashier'}</option>
                            <option value="courier">{isAr ? 'موزّع / توصيل (Livreur)' : 'Courier (Delivery)'}</option>
                            <option value="manager">{isAr ? 'مدير' : 'Manager'}</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            {isAr ? 'رمز PIN' : 'PIN'}
                          </label>
                          <input
                            type="text"
                            maxLength={4}
                            value={editUserPin}
                            onChange={(e) => setEditUserPin(e.target.value)}
                            className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          {['👨‍💼', '🧑‍💻', '🛵', '👩‍💼', '🧕', '🧔', '🧑'].map((av) => (
                            <button
                              key={av}
                              type="button"
                              onClick={() => setEditUserAvatar(av)}
                              className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm border ${
                                editUserAvatar === av
                                  ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950'
                                  : 'border-transparent opacity-65'
                              }`}
                            >
                              {av}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingUserId(null)}
                            className="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold"
                          >
                            {isAr ? 'إلغاء' : 'Cancel'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!editUserName.trim()) return;
                              updateUser(u.id, {
                                name: editUserName.trim(),
                                role: editUserRole,
                                pin: editUserPin.trim() || u.pin,
                                avatar: editUserAvatar
                              });
                              setEditingUserId(null);
                            }}
                            className="px-3.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{isAr ? 'حفظ التعديل' : 'Save'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl shadow-2xs">
                          {u.avatar || '👤'}
                        </div>
                        <div>
                          <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-2">
                            <span>{u.name}</span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                u.role === 'manager'
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                  : u.role === 'courier'
                                  ? 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300'
                                  : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                              }`}
                            >
                              {u.role === 'manager'
                                ? isAr ? 'مدير' : 'Manager'
                                : u.role === 'courier'
                                ? isAr ? 'موزّع (Livreur)' : 'Courier'
                                : isAr ? 'كاشير' : 'Cashier'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            PIN: {u.pin ? '••••' : 'لا يوجد'} · تاريخ الإضافة: {u.createdAt}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUserId(u.id);
                            setEditUserName(u.name);
                            setEditUserRole(u.role);
                            setEditUserPin(u.pin);
                            setEditUserAvatar(u.avatar || '👤');
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 transition-colors flex items-center gap-1"
                          title={isAr ? 'تعديل اسم وصلاحيات المستخدم' : 'Edit User'}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>{isAr ? 'تعديل' : 'Edit'}</span>
                        </button>

                        {users.length > 1 && (
                          <button
                            type="button"
                            onClick={() => deleteUser(u.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title={isAr ? 'حذف المستخدم' : 'Delete User'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Moroccan CPU Tax, CNSS AMO & Retirement Settings + WhatsApp Business Phone */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Landmark className="w-4 h-4 text-emerald-600" />
                <span>{isAr ? 'إعدادات ضرائبي CPU وجدول CNSS والبيع عن بعد' : 'CPU Tax, CNSS & Remote WhatsApp Settings'}</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr
                  ? 'كلشي قابل للتعديل: نسبة الضريبة 10%، معامل المهنة 6%، معامل التقاعد 1.57، جدول CNSS، ورقم واتساب الكتالوج.'
                  : 'Customize tax %, profession %, retirement multiplier, CNSS brackets & catalog WhatsApp phone.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'نسبة الضريبة CPU (%)' : 'CPU Tax Rate (%)'}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={cpuTaxRatePct}
                onChange={(e) => setCpuTaxRatePct(parseFloat(e.target.value) || 0)}
                className="w-full px-3.5 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'معامل المهنة (%)' : 'Profession Coeff (%)'}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={cpuProfCoeffPct}
                onChange={(e) => setCpuProfCoeffPct(parseFloat(e.target.value) || 0)}
                className="w-full px-3.5 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'معامل التقاعد (× AMO)' : 'Retirement Coeff (× AMO)'}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={cpuRetCoeff}
                onChange={(e) => setCpuRetCoeff(parseFloat(e.target.value) || 0)}
                className="w-full px-3.5 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'أيام CNSS المجمعة سابقاً' : 'Prior CNSS Days'}
              </label>
              <input
                type="number"
                min="0"
                value={cpuPriorDays}
                onChange={(e) => setCpuPriorDays(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3.5 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'التنبيه قبل موعد الدفع (أيام)' : 'Alert Before Due (days)'}
              </label>
              <input
                type="number"
                min="1"
                value={cpuAlertDays}
                onChange={(e) => setCpuAlertDays(parseInt(e.target.value, 10) || 7)}
                className="w-full px-3.5 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'رقم واتساب لاستقبال الطلبات' : 'WhatsApp Orders Phone'}
              </label>
              <input
                type="tel"
                value={whatsappBusinessPhone}
                onChange={(e) => setWhatsappBusinessPhone(e.target.value)}
                placeholder="06XXXXXXXX"
                className="w-full px-3.5 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                {isAr ? 'تفعيل بريم التقاعد CNSS افتراضياً' : 'Enable CNSS Retirement by Default'}
              </div>
              <div className="text-[11px] text-slate-500">
                {isAr ? 'يمكن تشغيله أو إيقافه أيضاً من صفحة ضرائبي CPU' : 'Can also be toggled directly inside CPU Tax view'}
              </div>
            </div>
            <input
              type="checkbox"
              checked={cpuRetEnabled}
              onChange={(e) => setCpuRetEnabled(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
            />
          </div>

          {/* Quick CNSS AMO Brackets Table inside Settings */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                {isAr ? 'جدول بريمات CNSS (AMO الشهري حسب شريحة الضريبة السنوية):' : 'CNSS Monthly AMO Brackets:'}
              </span>
              <button
                type="button"
                onClick={() => setCpuBracketsDraft(cpuSettings.cnssBrackets)}
                className="text-[11px] font-bold text-emerald-600 hover:underline flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{isAr ? 'تحديث' : 'Sync'}</span>
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {cpuBracketsDraft.map((br, bIdx) => (
                <div
                  key={br.id}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] space-y-1"
                >
                  <div className="font-bold text-slate-700 dark:text-slate-200 truncate" title={br.label}>
                    {br.label.split('(')[0].trim()}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {br.minAnnualTax} - {br.maxAnnualTax ?? '∞'}
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={br.monthlyAmo}
                    onChange={(e) => {
                      const val = Math.max(0, parseFloat(e.target.value) || 0);
                      setCpuBracketsDraft((prev) =>
                        prev.map((item, idx) => (idx === bIdx ? { ...item, monthlyAmo: val } : item))
                      );
                    }}
                    className="w-full px-2 py-1 text-xs font-mono font-black bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded-lg"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* POS Tab Icons & Colors Customization */}
        <TabCustomizationSection />

        {/* PWA Application Installation (تحميل التطبيق على الهاتف والكمبيوتر) */}
        <div className="space-y-2">
          <PWAInstallButton variant="settings" />
        </div>

        {/* Bluetooth Barcode Scanner Integration (HID Mode) */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Bluetooth className="w-4 h-4 text-blue-600" />
              <span>{isAr ? 'ماسح الباركود الخارجي عبر البلوتوث (HID Mode)' : 'External Bluetooth Barcode Scanner (HID)'}</span>
            </h3>
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{isAr ? 'نشط وجاهز للمسح' : 'Active & Ready'}</span>
            </span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {isAr
              ? 'يدعم النظام كافة أجهزة مسح الباركود اللاسلكية بالليزر أو كاميرات 2D (Eyoyo, Netum, Tera, Zebra, Inateck) العاملة بنمط HID Keyboard Emulation بدون الحاجة لأي برامج إضافية مع تمييز فوري لسرعة الإدخال.'
              : 'Directly compatible with all wireless laser & 2D barcode scanners in HID mode. Keystroke bursts are automatically parsed and mapped to cart products with high speed.'}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setShowBluetoothModal(true)}
              className="px-4 py-2.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-2 shadow-2xs"
            >
              <Bluetooth className="w-4 h-4" />
              <span>{isAr ? 'فتح مركز فحص واختبار سرعة الماسح' : 'Open Scanner Diagnostics & Test'}</span>
            </button>
          </div>
        </div>

        {/* Save button */}
        <button
          type="submit"
          className="px-6 py-3 rounded-2xl font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm"
        >
          {isAr ? 'حفظ كافة التعديلات' : 'Save Changes'}
        </button>
      </form>

      {/* Multi-Branch Management Section (إدارة الفروع المتعددة والمزامنة السحابية) */}
      <BranchManagementSection />

      {/* Audit Activity Log (سجل النشاطات والعمليات الرقابية) */}
      <div className="max-w-4xl">
        <ActivityLogSection />
      </div>

      {/* Bluetooth Scanner Modal */}
      <BluetoothScannerModal
        isOpen={showBluetoothModal}
        onClose={() => setShowBluetoothModal(false)}
      />

      {/* Bluetooth Thermal Printer Modal */}
      <BluetoothPrinterModal
        isOpen={showBluetoothPrinterModal}
        onClose={() => setShowBluetoothPrinterModal(false)}
      />

      {/* Google Drive & Gmail Cloud Sync Section */}
      <GoogleWorkspaceSyncSection />

      {/* Backup, Restore & Reset Section */}
      {(() => {
        const latestAt = settings.lastBackupAt || localSnapshotAt;
        const daysSinceBackup = latestAt
          ? Math.floor((Date.now() - new Date(latestAt).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        const needsBackupAlert = daysSinceBackup === null || daysSinceBackup >= 7;

        const handleExportRemoteOrdersCsv = () => {
          const headers = ['OrderNumber', 'Date', 'Customer', 'Phone', 'Zone', 'DeliveryFee', 'GrandTotal', 'Status'];
          const rows = remoteOrders.map((r) => [
            r.orderNumber,
            r.createdAt.slice(0, 10),
            `"${r.customerName}"`,
            r.customerPhone,
            `"${r.deliveryZoneName}"`,
            r.deliveryFee,
            r.grandTotal,
            r.status
          ]);
          const csv = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
          const link = document.createElement('a');
          link.setAttribute('href', encodeURI(csv));
          link.setAttribute('download', `kadi_remote_orders_${new Date().toISOString().slice(0, 10)}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        };

        const handleExportProductsCsv = () => {
          const headers = ['ID', 'Name', 'SKU', 'Barcode', 'Cost', 'Price', 'Stock'];
          const rows = products.map((p) => [
            p.id,
            `"${p.name}"`,
            p.sku,
            p.barcode,
            p.costPrice,
            p.price,
            p.stock
          ]);
          const csv = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
          const link = document.createElement('a');
          link.setAttribute('href', encodeURI(csv));
          link.setAttribute('download', `kadi_catalog_${new Date().toISOString().slice(0, 10)}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        };

        return (
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 max-w-4xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>{isAr ? 'النسخ الاحتياطي الذكي ونقاط الاستعادة' : 'Smart Backup & Snapshot Restore'}</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isAr
                    ? 'حماية كاملة للمبيعات، كناش الكريدي، ضرائبي CPU، وفواتير الموردين'
                    : 'Full protection for sales, credit ledger, CPU records, and supplier invoices'}
                </p>
              </div>

              <div
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black border flex items-center gap-1.5 ${
                  needsBackupAlert
                    ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                    : 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {latestAt
                    ? isAr
                      ? `آخر نسخة: ${new Date(latestAt).toLocaleString('ar-MA')} ${daysSinceBackup !== null && daysSinceBackup >= 7 ? '(مضى +7 أيام!)' : ''}`
                      : `Last backup: ${new Date(latestAt).toLocaleDateString()}`
                    : isAr
                    ? 'تنبيه: لم يتم أخذ نسخة احتياطية بعد'
                    : 'Alert: No backup taken yet'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  const res = saveLocalSnapshot();
                  setImportError(null);
                  setImportSuccess(
                    res.success
                      ? isAr
                        ? `✅ تم حفظ نقطة استعادة سريعة في المتصفح (${new Date(res.timestamp).toLocaleTimeString('ar-MA')})`
                        : '✅ Local snapshot saved!'
                      : isAr
                      ? 'تعذر حفظ نقطة الاستعادة'
                      : 'Snapshot failed'
                  );
                }}
                className="px-4 py-2.5 text-xs font-black rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-2 shadow-2xs"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isAr ? 'حفظ نقطة استعادة سريعة' : 'Save Quick Snapshot'}</span>
              </button>

              {localSnapshotAt && !confirmRestoreSnapshot && (
                <button
                  type="button"
                  onClick={() => setConfirmRestoreSnapshot(true)}
                  className="px-4 py-2.5 text-xs font-bold rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition-colors flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{isAr ? 'استعادة آخر نقطة حفظ' : 'Restore Last Snapshot'}</span>
                </button>
              )}

              {localSnapshotAt && confirmRestoreSnapshot && (
                <div className="inline-flex items-center gap-1.5 p-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-300 dark:border-indigo-700">
                  <button
                    type="button"
                    onClick={() => {
                      const ok = restoreLocalSnapshot();
                      setConfirmRestoreSnapshot(false);
                      if (ok) {
                        setImportError(null);
                        setImportSuccess(isAr ? '✅ تمت استعادة آخر نقطة حفظ بنجاح' : '✅ Snapshot restored!');
                      } else {
                        setImportError(isAr ? 'تعذر استعادة نقطة الحفظ' : 'Restore failed');
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-black"
                  >
                    {isAr ? 'تأكيد الاستعادة الآن' : 'Confirm Restore'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRestoreSnapshot(false)}
                    className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-[11px] font-bold"
                  >
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  exportDatabaseJson();
                  setImportError(null);
                  setImportSuccess(isAr ? '✅ تم تحميل ملف النسخة الاحتياطية JSON بنجاح' : '✅ JSON backup downloaded');
                }}
                className="px-4 py-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-2 shadow-2xs"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>{t.backup_db}</span>
              </button>

              <label className="px-4 py-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-2 shadow-2xs cursor-pointer">
                <Upload className="w-4 h-4 text-blue-600" />
                <span>{t.import_db}</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportFile}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleExportProductsCsv}
                className="px-3.5 py-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>{isAr ? 'تصدير الكتالوج CSV' : 'Catalog CSV'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportRemoteOrdersCsv}
                className="px-3.5 py-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4 text-violet-600" />
                <span>{isAr ? 'تصدير طلبات التوصيل CSV' : 'Orders CSV'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowImportProductsModal(true)}
                className="px-4 py-2.5 text-xs font-bold rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors flex items-center gap-2 shadow-2xs"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>{isAr ? 'استيراد قائمة المنتجات من إكسل / CSV' : 'Import Products (Excel/CSV)'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (confirm(isAr ? 'هل تريد استعادة البيانات الافتراضية؟ سيتم مسح التغييرات الحالية.' : 'Reset to demo data?')) {
                    resetToDemoData();
                  }
                }}
                className="px-4 py-2.5 text-xs font-bold rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 transition-colors flex items-center gap-2 shadow-2xs"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{t.reset_demo}</span>
              </button>
            </div>

            {importSuccess && (
              <div className="text-xs text-emerald-700 dark:text-emerald-400 font-bold mt-2">
                {importSuccess}
              </div>
            )}
            {importError && (
              <div className="text-xs text-rose-600 font-bold mt-2">
                {importError}
              </div>
            )}
          </div>
        );
      })()}

      {/* Bulk Products Excel / CSV Modal */}
      <ImportProductsModal
        isOpen={showImportProductsModal}
        onClose={() => setShowImportProductsModal(false)}
      />
    </div>
  );
};
