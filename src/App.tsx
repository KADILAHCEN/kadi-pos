/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { PosProvider, usePos } from './context/PosContext';
import { Navbar } from './components/Navbar';
import { ProductGrid } from './components/pos/ProductGrid';
import { CartRegister } from './components/pos/CartRegister';
import { CheckoutModal } from './components/pos/CheckoutModal';
import { ReceiptModal } from './components/pos/ReceiptModal';
import { HeldTicketsModal } from './components/pos/HeldTicketsModal';
import { BarcodeScannerModal } from './components/pos/BarcodeScannerModal';
import { InventoryView } from './components/inventory/InventoryView';
import { InvoiceOcrView } from './components/inventory/InvoiceOcrView';
import { OrdersView } from './components/orders/OrdersView';
import { ShiftsView } from './components/shifts/ShiftsView';
import { CustomersView } from './components/customers/CustomersView';
import { ExpensesView } from './components/expenses/ExpensesView';
import { RemiseBoxView } from './components/remise/RemiseBoxView';
import { RemoteSalesView } from './components/remote/RemoteSalesView';
import { PublicCatalogView } from './components/remote/PublicCatalogView';
import { CpuTaxView } from './components/cpu/CpuTaxView';
import { AnalyticsView } from './components/analytics/AnalyticsView';
import { CustomersPeakView } from './components/analytics/CustomersPeakView';
import { DreamView } from './components/analytics/DreamView';
import { BourseHanoutView } from './components/bourse/BourseHanoutView';
import { SmartDreamGoalBanner } from './components/analytics/SmartDreamGoalBanner';
import { ShopEarView } from './components/shopEar/ShopEarView';
import { MarketRadarView } from './components/marketRadar/MarketRadarView';
import { FinMchaElMhalView } from './components/home/FinMchaElMhalView';
import { StoreMapView } from './components/home/StoreMapView';
import { ShopEarQuickModal } from './components/shopEar/ShopEarQuickModal';
import { PurchaseInvoiceScanModal } from './components/inventory/PurchaseInvoiceScanModal';
import { PriceCheckerModal } from './components/pos/PriceCheckerModal';
import { AiAssistantView } from './components/ai/AiAssistantView';
import { FloatingAiChatButton } from './components/ai/FloatingAiChatButton';
import { VoiceAssistantModal } from './components/voice/VoiceAssistantModal';
import { StockAlertOverlay } from './components/alerts/StockAlertOverlay';
import { TheftAlertOverlay } from './components/alerts/TheftAlertOverlay';
import { TheftSecurityModal } from './components/alerts/TheftSecurityModal';
import { AlertsView } from './components/alerts/AlertsView';
import { SettingsView } from './components/settings/SettingsView';
import { CustomerDisplayView } from './components/pos/CustomerDisplayView';
import { CustomerDisplayLauncherModal } from './components/pos/CustomerDisplayLauncherModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import {
  CUSTOMER_DISPLAY_CHANNEL,
  broadcastCustomerDisplaySnapshot,
  buildCustomerDisplaySnapshot
} from './utils/customerDisplaySync';
import { Order, Product } from './types';
import { playSound } from './utils/audio';
import { bluetoothPrinter } from './utils/bluetoothPrinter';
import { bluetoothScanner } from './utils/bluetoothScanner';
import { parseScaleBarcode } from './utils/scaleBarcode';
import {
  QuickBarcodeSourceContext,
  QuickNewBarcodeProductModal
} from './components/pos/QuickNewBarcodeProductModal';
import { preloadStoreLogo } from './utils/pdfReport';
import {
  ensureKadiDriveFolder,
  getWorkspaceAccessToken,
  uploadFileToDriveFolder
} from './utils/googleWorkspace';
import {
  ShoppingBag,
  AlertTriangle,
  X,
  Download,
  BellRing,
  Zap,
  Lock,
  LayoutGrid,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';

import { OfflineIndicator } from './components/pwa/OfflineIndicator';
import { PinGateModal } from './components/auth/PinGateModal';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { BranchInventoryView } from './components/branches/BranchInventoryView';

const PosMainContent: React.FC = () => {
  const {
    currentTab,
    setCurrentTab,
    products,
    addToCart,
    cart,
    cartSubtotal,
    cartDiscountTotal,
    cartTaxTotal,
    cartGrandTotal,
    selectedCustomer,
    lowStockProducts,
    language,
    isTabProtected,
    settings,
    updateSettings,
    buildFullBackupObject,
    currencySymbol,
    notificationPermission,
    requestNotificationPermission,
    currentShift,
    currentEmergencySession,
    closeEmergencySession
  } = usePos();
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [isPublicCatalogMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('catalog') === '1';
  });

  const [isCustomerDisplayMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('display') === 'customer';
  });

  const [showCustomerDisplayModal, setShowCustomerDisplayModal] = useState(false);
  const [showTheftSecurityModal, setShowTheftSecurityModal] = useState(false);
  const [lastDisplayOrder, setLastDisplayOrder] = useState<Order | null>(null);

  const [showAppPinModal, setShowAppPinModal] = useState(false);
  const [pendingAppTab, setPendingAppTab] = useState<typeof currentTab | null>(null);
  const [openedFromStoreMap, setOpenedFromStoreMap] = useState(false);
  const [pendingFromStoreMap, setPendingFromStoreMap] = useState(false);

  const handleProtectedTab = (tab: typeof currentTab) => {
    if (isTabProtected(tab)) {
      setPendingAppTab(tab);
      setPendingFromStoreMap(false);
      setShowAppPinModal(true);
    } else {
      setOpenedFromStoreMap(false);
      setCurrentTab(tab);
    }
  };

  const handleSelectFromMap = (tab: typeof currentTab) => {
    if (isTabProtected(tab)) {
      setPendingAppTab(tab);
      setPendingFromStoreMap(true);
      setShowAppPinModal(true);
    } else {
      setOpenedFromStoreMap(tab !== 'store_map');
      setCurrentTab(tab);
    }
  };

  useEffect(() => {
    if (currentTab === 'store_map') {
      setOpenedFromStoreMap(false);
    }
  }, [currentTab]);

  // Active Modals
  const [showCheckout, setShowCheckout] = useState(false);
  const [showHeldTickets, setShowHeldTickets] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<Order | null>(null);

  // Mobile cart sheet toggle
  const [showMobileCart, setShowMobileCart] = useState(false);

  // Smart Dream Progress Banner toggle on main screen
  const [isDreamBannerDismissed, setIsDreamBannerDismissed] = useState(false);

  // Low stock banner dismissed state tied to current low-stock signature (auto-resets on any new stock drop)
  const [dismissedLowStockSignature, setDismissedLowStockSignature] = useState<string>('');
  const currentLowStockSignature = lowStockProducts
    .map((p) => `${p.id}:${p.stock}`)
    .sort()
    .join('|');
  const isBannerDismissed =
    dismissedLowStockSignature !== '' && dismissedLowStockSignature === currentLowStockSignature;

  // Immediate post-sale alert toast
  const [postSaleAlert, setPostSaleAlert] = useState<string | null>(null);
  const [scanFeedbackToast, setScanFeedbackToast] = useState<{ text: string; isError?: boolean } | null>(null);
  const [pdfReadyToast, setPdfReadyToast] = useState<{ blobUrl: string; filename: string } | null>(null);
  const [quickNewBarcodeReq, setQuickNewBarcodeReq] = useState<{
    barcode: string;
    sourceContext: QuickBarcodeSourceContext;
  } | null>(null);

  // Initialize global Bluetooth HID Scanner & keep config synced with settings (100% offline)
  useEffect(() => {
    bluetoothScanner.init({
      enabled: settings.bluetoothScannerEnabled ?? true
    });
  }, []);

  useEffect(() => {
    bluetoothScanner.updateConfig({
      enabled: settings.bluetoothScannerEnabled ?? true
    });
  }, [settings.bluetoothScannerEnabled]);

  // Listen for unknown barcode prompts from any screen (Sale, Stock, Invoice Scan)
  useEffect(() => {
    const handleOpenNewBarcode = (evt: Event) => {
      const detail = (evt as CustomEvent<{
        barcode?: string;
        sourceContext?: QuickBarcodeSourceContext;
      }>).detail;
      const code = (detail?.barcode || '').trim();
      if (!code) return;
      setQuickNewBarcodeReq({
        barcode: code,
        sourceContext: detail?.sourceContext || 'global'
      });
    };
    window.addEventListener('kadi:open-quick-new-barcode', handleOpenNewBarcode);
    return () => window.removeEventListener('kadi:open-quick-new-barcode', handleOpenNewBarcode);
  }, []);

  // Global Bluetooth scan fallback when user is outside POS / Inventory / Settings & no priority modal is open
  useEffect(() => {
    const unsub = bluetoothScanner.onScan((payload) => {
      if (bluetoothScanner.getActiveScope() !== null) return;
      if (currentTab === 'pos' || currentTab === 'inventory' || currentTab === 'settings') return;

      const clean = payload.barcode.trim();
      const scaleParsed = parseScaleBarcode(clean, products, settings.scaleBarcodeConfig);
      const matched =
        scaleParsed?.product ||
        products.find((p) => p.barcode === clean || p.sku.toLowerCase() === clean.toLowerCase());
      const scannedQty = scaleParsed?.product ? scaleParsed.quantity : 1;

      if (matched) {
        const inCartQty = cart
          .filter((ci) => ci.productId === matched.id)
          .reduce((sum, ci) => sum + ci.quantity, 0);
        const remainingStock = Math.max(0, Number((matched.stock - inCartQty).toFixed(3)));
        if (settings.bluetoothAutoAddToCart !== false) {
          if (remainingStock <= 0 || scannedQty > remainingStock) {
            playSound('error');
            setScanFeedbackToast({
              text: isAr ? `نفذ - ${matched.name} ما بقاش` : `Out of stock - ${matched.name}`,
              isError: true
            });
            setTimeout(() => setScanFeedbackToast(null), 2800);
            return;
          }
          if (settings.bluetoothSoundFeedback !== false) playSound('beep');
          addToCart(matched, undefined, undefined, scannedQty);
          setScanFeedbackToast({
            text: scaleParsed?.product
              ? isAr
                ? `⚖️ الميزان: ${matched.name} (${matched.unitType === 'gram' ? scannedQty : scannedQty.toFixed(3)} ${matched.unitType === 'liter' ? 'لتر' : matched.unitType === 'gram' ? 'غ' : 'كغ'})`
                : `⚖️ Scale: ${matched.name} (${matched.unitType === 'gram' ? scannedQty + 'g' : scannedQty.toFixed(3)})`
              : isAr
              ? `🔊 بيب! تزادت للسلة: ${matched.name}`
              : `🔊 Scanned & added: ${matched.name}`
          });
          setTimeout(() => setScanFeedbackToast(null), 2600);
        } else {
          if (settings.bluetoothSoundFeedback !== false) playSound('beep');
          setScanFeedbackToast({
            text: isAr
              ? `🔊 ${matched.name} (${matched.price.toFixed(2)} ${currencySymbol})`
              : `🔊 ${matched.name}`
          });
          setTimeout(() => setScanFeedbackToast(null), 2600);
        }
      } else {
        playSound('error');
        setQuickNewBarcodeReq({ barcode: clean, sourceContext: 'global' });
      }
    });
    return () => unsub();
  }, [currentTab, products, cart, addToCart, settings.bluetoothSoundFeedback, settings.bluetoothAutoAddToCart, settings.scaleBarcodeConfig, isAr, currencySymbol]);

  // Preload custom Store Logo for canvas PDFs & Thermal receipts
  useEffect(() => {
    preloadStoreLogo(settings.storeLogo);
  }, [settings.storeLogo]);

  // Global PDF / Excel Blob Download Recovery Banner (for sandboxed iframes)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handlePdfReady = (evt: Event) => {
      const detail = (evt as CustomEvent<{ blobUrl: string; filename: string }>).detail;
      if (!detail?.blobUrl) return;
      setPdfReadyToast(detail);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setPdfReadyToast(null), 20000);
    };
    window.addEventListener('kadi:pdf-ready', handlePdfReady);
    return () => {
      window.removeEventListener('kadi:pdf-ready', handlePdfReady);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Listen for Customer Display Launcher triggers from Navbar / CartRegister
  useEffect(() => {
    const handleOpenCustomerDisplay = () => setShowCustomerDisplayModal(true);
    window.addEventListener('kadi:open-customer-display', handleOpenCustomerDisplay);
    return () => window.removeEventListener('kadi:open-customer-display', handleOpenCustomerDisplay);
  }, []);

  // Listen for Anti-Theft Security Center triggers from Navbar / TheftAlertOverlay / Settings
  useEffect(() => {
    const handleOpenTheftSecurity = () => setShowTheftSecurityModal(true);
    window.addEventListener('kadi:open-theft-security', handleOpenTheftSecurity);
    return () => window.removeEventListener('kadi:open-theft-security', handleOpenTheftSecurity);
  }, []);

  // Real-time BroadcastChannel & localStorage sync to any open Customer Display window/tab
  useEffect(() => {
    if (isCustomerDisplayMode || isPublicCatalogMode) return;

    const snapshot = buildCustomerDisplaySnapshot({
      cart,
      cartSubtotal,
      cartDiscountTotal,
      cartTaxTotal,
      cartGrandTotal,
      selectedCustomer,
      settings,
      currencySymbol,
      language,
      completedOrder: cart.length === 0 ? lastDisplayOrder : null
    });
    broadcastCustomerDisplaySnapshot(snapshot);
  }, [
    isCustomerDisplayMode,
    isPublicCatalogMode,
    cart,
    cartSubtotal,
    cartDiscountTotal,
    cartTaxTotal,
    cartGrandTotal,
    selectedCustomer,
    settings,
    currencySymbol,
    language,
    lastDisplayOrder
  ]);

  // Answer REQUEST_SYNC when a newly opened secondary Customer Display tab asks for initial state
  useEffect(() => {
    if (isCustomerDisplayMode || isPublicCatalogMode || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
    channel.onmessage = (event) => {
      const data = event.data as { type?: string };
      if (data?.type === 'REQUEST_SYNC') {
        const snapshot = buildCustomerDisplaySnapshot({
          cart,
          cartSubtotal,
          cartDiscountTotal,
          cartTaxTotal,
          cartGrandTotal,
          selectedCustomer,
          settings,
          currencySymbol,
          language,
          completedOrder: cart.length === 0 ? lastDisplayOrder : null
        });
        broadcastCustomerDisplaySnapshot(snapshot);
      }
    };
    return () => channel.close();
  }, [
    isCustomerDisplayMode,
    isPublicCatalogMode,
    cart,
    cartSubtotal,
    cartDiscountTotal,
    cartTaxTotal,
    cartGrandTotal,
    selectedCustomer,
    settings,
    currencySymbol,
    language,
    lastDisplayOrder
  ]);

  // Optional silent Drive Auto-Backup when user already connected Google Workspace in-session
  useEffect(() => {
    if (!settings.scheduledReportAutoDrive || !getWorkspaceAccessToken()) return;
    const freqMs = (settings.scheduledReportFrequency === 'daily' ? 1 : 7) * 86_400_000;
    const lastTs = settings.lastScheduledReportSentAt
      ? new Date(settings.lastScheduledReportSentAt).getTime()
      : 0;
    if (Date.now() - lastTs < freqMs) return;

    let cancelled = false;
    (async () => {
      try {
        const folderId = await ensureKadiDriveFolder(settings.driveBackupFolderId);
        const backup = buildFullBackupObject();
        const filename = `KadiPOS_AutoBackup_${new Date().toISOString().slice(0, 10)}.json`;
        await uploadFileToDriveFolder({
          folderId,
          filename,
          content: JSON.stringify(backup, null, 2),
          mimeType: 'application/json'
        });
        if (!cancelled) {
          const nowIso = new Date().toISOString();
          updateSettings({
            driveBackupFolderId: folderId,
            lastBackupAt: nowIso,
            lastScheduledReportSentAt: nowIso
          });
        }
      } catch {
        // Silent background skip if token expired or offline
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    settings.scheduledReportAutoDrive,
    settings.scheduledReportFrequency,
    settings.lastScheduledReportSentAt,
    settings.driveBackupFolderId,
    buildFullBackupObject,
    updateSettings
  ]);

  const handleBarcodeScanned = (code: string) => {
    const clean = code.trim();
    const scaleParsed = parseScaleBarcode(clean, products, settings.scaleBarcodeConfig);
    const matched =
      scaleParsed?.product ||
      products.find((p) => p.barcode === clean || p.sku.toLowerCase() === clean.toLowerCase());
    const scannedQty = scaleParsed?.product ? scaleParsed.quantity : 1;

    if (matched) {
      const inCartQty = cart
        .filter((ci) => ci.productId === matched.id)
        .reduce((sum, ci) => sum + ci.quantity, 0);
      const remainingStock = Math.max(0, Number((matched.stock - inCartQty).toFixed(3)));
      if (remainingStock <= 0 || scannedQty > remainingStock) {
        playSound('error');
        setScanFeedbackToast({
          text: isAr ? `نفذ - ${matched.name} ما بقاش` : `Out of stock - ${matched.name}`,
          isError: true
        });
        setTimeout(() => setScanFeedbackToast(null), 2800);
        return;
      }
      if (settings.bluetoothSoundFeedback !== false) playSound('beep');
      addToCart(matched, undefined, undefined, scannedQty);
      setScanFeedbackToast({
        text: scaleParsed?.product
          ? isAr
            ? `⚖️ الميزان: ${matched.name} (${matched.unitType === 'gram' ? scannedQty : scannedQty.toFixed(3)} ${matched.unitType === 'liter' ? 'لتر' : matched.unitType === 'gram' ? 'غ' : 'كغ'})`
            : `⚖️ Scale: ${matched.name} (${matched.unitType === 'gram' ? scannedQty + 'g' : scannedQty.toFixed(3)})`
          : isAr
          ? `🔊 بيب! تزادت للسلة: ${matched.name}`
          : `📷 Scanned & added: ${matched.name}`
      });
      setTimeout(() => setScanFeedbackToast(null), 3000);
    } else {
      playSound('error');
      setShowBarcodeScanner(false);
      setQuickNewBarcodeReq({
        barcode: clean,
        sourceContext: currentTab === 'inventory' ? 'inventory' : 'pos'
      });
    }
  };

  const handleCheckoutSuccess = (order: Order) => {
    setShowCheckout(false);
    setShowMobileCart(false);
    setActiveReceipt(order);
    setLastDisplayOrder(order);
    window.setTimeout(() => setLastDisplayOrder((prev) => (prev?.id === order.id ? null : prev)), 15000);

    if (
      settings.autoPrintOnCheckout &&
      settings.printerConnectionType === 'bluetooth' &&
      bluetoothPrinter.isConnected()
    ) {
      void bluetoothPrinter.printOrderReceipt(order, settings, currencySymbol, language);
    }

    // Check if any item in the order is now low in stock
    const newlyLowItems = order.items
      .map((it) => products.find((p) => p.id === it.productId))
      .filter((p): p is typeof products[0] => !!p && p.stock <= p.lowStockThreshold);

    if (newlyLowItems.length > 0) {
      const names = newlyLowItems.map((p) => `${p.name} (${isAr ? 'المتبقي' : 'left'}: ${p.stock})`).join('، ');
      setPostSaleAlert(
        isAr
          ? `⚠️ تنبيه المخزون: ${names} وصل للحد الأدنى المحدد مسبقاً!`
          : isFr
          ? `⚠️ Alerte Stock: ${names} a atteint le seuil minimum!`
          : `⚠️ Stock Alert: ${names} reached minimum threshold!`
      );
      setTimeout(() => setPostSaleAlert(null), 5000);
    }
  };

  if (isCustomerDisplayMode) {
    return <CustomerDisplayView />;
  }

  if (isPublicCatalogMode) {
    return <PublicCatalogView />;
  }

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans">
      {/* Offline Status Bar */}
      <OfflineIndicator />

      {/* Top Bar adhering to Top Bar Contract */}
      <Navbar />

      {/* Floating Camera Barcode Scan Feedback Toast */}
      {scanFeedbackToast && (
        <div
          className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-extrabold animate-in fade-in slide-in-from-top-2 ${
            scanFeedbackToast.isError
              ? 'bg-rose-700 text-white border border-rose-500'
              : 'bg-slate-900 text-white border border-emerald-500/60'
          }`}
        >
          <span>{scanFeedbackToast.text}</span>
        </div>
      )}

      {/* Persistent Download Recovery Banner for PDF / Excel inside Sandboxed iFrames */}
      {pdfReadyToast && (
        <div className="fixed bottom-20 lg:bottom-5 left-3 right-3 sm:right-auto sm:left-5 z-50 px-4 py-3 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white border border-emerald-500/60 shadow-2xl flex items-center gap-3 text-xs animate-in fade-in slide-in-from-bottom-2">
          <Download className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <div className="font-black truncate max-w-[200px]">{pdfReadyToast.filename}</div>
            <div className="text-[10px] text-slate-300">
              {isAr ? 'جاهز للتحميل المباشر' : 'Ready for direct download'}
            </div>
          </div>
          <a
            href={pdfReadyToast.blobUrl}
            download={pdfReadyToast.filename}
            onClick={() => setTimeout(() => setPdfReadyToast(null), 1500)}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] shrink-0 transition-colors"
          >
            {isAr ? 'تحميل الملف' : 'Download'}
          </a>
          <button
            type="button"
            onClick={() => setPdfReadyToast(null)}
            className="p-1 text-slate-400 hover:text-white"
            title={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating Post-Sale Critical Stock Toast */}
      {postSaleAlert && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-amber-900 text-amber-100 border border-amber-600 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-bold animate-in fade-in slide-in-from-top-2">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <span>{postSaleAlert}</span>
          <button
            onClick={() => setPostSaleAlert(null)}
            className="p-1 text-amber-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Persistent Visual Low Stock Alert Banner (Shown across all screens outside Inventory & Alerts) */}
      {settings.enableLowStockVisualAlerts !== false &&
        !isBannerDismissed &&
        lowStockProducts.length > 0 &&
        currentTab !== 'inventory' &&
        currentTab !== 'alerts' && (
          <div className="bg-amber-50 dark:bg-amber-950/75 border-b border-amber-200 dark:border-amber-800/80 px-2.5 sm:px-3 py-0.5 flex flex-nowrap items-center justify-between gap-1.5 text-[10px] shrink-0 transition-colors">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="p-0.5 rounded bg-rose-600 text-white shrink-0 animate-pulse">
                <AlertTriangle className="w-2.5 h-2.5" />
              </span>
              <div className="truncate">
                <span className="font-extrabold text-amber-950 dark:text-amber-200">
                  {isAr
                    ? `تنبيه المخزون (${lowStockProducts.length} منتجات): `
                    : isFr
                    ? `Alerte Stock (${lowStockProducts.length}): `
                    : `Stock Alert (${lowStockProducts.length}): `}
                </span>
                <span className="hidden sm:inline text-amber-800 dark:text-amber-300 font-medium">
                  {lowStockProducts
                    .slice(0, 3)
                    .map((p) => `${p.name} (${p.stock}/${p.lowStockThreshold})`)
                    .join(' · ')}
                  {lowStockProducts.length > 3 && ` +${lowStockProducts.length - 3}`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {notificationPermission === 'default' && (
                <button
                  type="button"
                  onClick={() => void requestNotificationPermission()}
                  className="hidden sm:flex px-2 py-0.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] items-center gap-1 transition-colors shadow-2xs"
                >
                  <BellRing className="w-3 h-3" />
                  <span>{isAr ? 'تفعيل Push' : 'Enable Push'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setCurrentTab('alerts')}
                className="px-2 py-0.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] transition-colors shadow-2xs whitespace-nowrap"
              >
                {isAr ? 'عرض التنبيهات' : isFr ? 'Alertes' : 'View Alerts'}
              </button>
              <button
                type="button"
                onClick={() => setDismissedLowStockSignature(currentLowStockSignature)}
                className="p-0.5 text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
                title={isAr ? 'إخفاء مؤقتاً' : 'Dismiss'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

      {/* Active Emergency Opening Bar (only shown while emergency open is active) */}
      {currentShift.status === 'closed' && currentEmergencySession?.status === 'open' && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border-b border-amber-300 dark:border-amber-800 px-3 py-1 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0 text-amber-900 dark:text-amber-200 font-bold truncate">
            <Zap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="truncate">
              {isAr
                ? `فتح استعجالي مفتوح (بلا مدة) · الوقت بدل الضائع: ${Math.max(
                    (currentEmergencySession.customerKeys || []).length,
                    currentEmergencySession.ordersCount || 0
                  )} زبون · ${(Number(currentEmergencySession.totalSales) || 0).toFixed(2)} ${currencySymbol}`
                : `Emergency Open Active · Overtime: ${Math.max(
                    (currentEmergencySession.customerKeys || []).length,
                    currentEmergencySession.ordersCount || 0
                  )} customers · ${(Number(currentEmergencySession.totalSales) || 0).toFixed(2)} ${currencySymbol}`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => closeEmergencySession()}
            className="px-2.5 py-0.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] flex items-center gap-1 shrink-0 transition-colors whitespace-nowrap"
          >
            <Lock className="w-3 h-3" />
            <span>{isAr ? 'إغلاق بيدي' : 'Close'}</span>
          </button>
        </div>
      )}

      {/* Smart Daily Dream Goal & Proactive Tip Banner (Main Home Screen) */}
      {currentTab === 'pos' && !isDreamBannerDismissed && (
        <SmartDreamGoalBanner
          variant="compact"
          onDismiss={() => setIsDreamBannerDismissed(true)}
        />
      )}

      {/* Back to Store Map Quick Bar when user navigated from the 21-section map */}
      {openedFromStoreMap && currentTab !== 'store_map' && (
        <div className="bg-slate-900 dark:bg-slate-950 border-b border-slate-800 px-3 sm:px-4 py-1.5 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setOpenedFromStoreMap(false);
              setCurrentTab('store_map');
            }}
            className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-extrabold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            {isAr ? (
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{isAr ? 'رجوع للخريطة' : isFr ? 'Retour à la carte' : 'Back to Store Map'}</span>
          </button>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300 truncate">
            <LayoutGrid className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <span className="truncate">
              {isAr ? 'خريطة المحال ديالي — 21 قسم' : 'Store Map — 21 Modules'}
            </span>
          </div>
        </div>
      )}

      {/* Main View Area */}
      <main className="flex-1 flex overflow-hidden relative pb-16 lg:pb-0">
        {currentTab === 'store_map' && <StoreMapView onSelectSection={handleSelectFromMap} />}
        {currentTab === 'pos' && (
          <div className="flex-1 flex w-full h-full overflow-hidden">
            {/* Left: Visual Product Grid ("واجهة للفئة بالصور") */}
            <ProductGrid
              onOpenBarcodeScanner={() => setShowBarcodeScanner(true)}
            />

            {/* Right: The Ticket / Cart Register (Desktop) */}
            <div className="hidden lg:flex h-full">
              <CartRegister
                onOpenCheckout={() => setShowCheckout(true)}
                onOpenHeldTickets={() => setShowHeldTickets(true)}
                onQuickCheckoutSuccess={handleCheckoutSuccess}
              />
            </div>

            {/* Permanent Compact Mobile Invoice Trigger (عرض الفاتورة دائم) */}
            <div className="lg:hidden fixed bottom-[60px] left-1/2 -translate-x-1/2 w-[min(82vw,260px)] z-30">
              <button
                type="button"
                onClick={() => setShowMobileCart(true)}
                className="w-full min-h-[38px] py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold rounded-xl shadow-lg flex items-center justify-between transition-transform active:scale-[0.99]"
              >
                <div className="flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                  <span>{isAr ? 'عرض الفاتورة' : isFr ? 'Voir le panier' : 'View Ticket'}</span>
                  <span className="px-1.5 py-0.2 bg-emerald-700 rounded-full text-[10px] tabular-nums">
                    {cart.reduce((s, i) => s + i.quantity, 0)}
                  </span>
                </div>
                <span className="font-mono text-[11px] font-black tabular-nums">
                  {cartGrandTotal.toFixed(2)} {currencySymbol}
                </span>
              </button>
            </div>

            {/* Mobile Cart Bottom Sheet */}
            {showMobileCart && (
              <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end bg-slate-950/60 backdrop-blur-xs">
                <div className="w-full h-[88vh] bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl flex flex-col overflow-hidden">
                  <div className="pt-2 flex justify-center shrink-0">
                    <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                  </div>
                  <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">{isAr ? 'الفاتورة الحالية' : 'Current Order'}</span>
                    <button
                      onClick={() => setShowMobileCart(false)}
                      className="min-h-[38px] text-xs font-bold px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      {isAr ? 'إغلاق' : 'Close'}
                    </button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <CartRegister
                      onOpenCheckout={() => {
                        setShowMobileCart(false);
                        setShowCheckout(true);
                      }}
                      onOpenHeldTickets={() => {
                        setShowMobileCart(false);
                        setShowHeldTickets(true);
                      }}
                      onQuickCheckoutSuccess={handleCheckoutSuccess}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {currentTab === 'home_summary' && <FinMchaElMhalView onNavigate={handleProtectedTab} />}
        {currentTab === 'branch_stock' && <BranchInventoryView />}
        {currentTab === 'bourse' && <BourseHanoutView />}
        {currentTab === 'inventory' && <InventoryView />}
        {currentTab === 'invoice_ocr' && <InvoiceOcrView />}
        {currentTab === 'orders' && <OrdersView />}
        {currentTab === 'shifts' && <ShiftsView />}
        {currentTab === 'customers' && <CustomersView />}
        {currentTab === 'expenses' && <ExpensesView />}
        {currentTab === 'remise_box' && <RemiseBoxView />}
        {currentTab === 'remote_sales' && <RemoteSalesView />}
        {currentTab === 'cpu_tax' && <CpuTaxView />}
        {currentTab === 'analytics' && <AnalyticsView />}
        {currentTab === 'customers_peak' && <CustomersPeakView />}
        {currentTab === 'dream' && <DreamView />}
        {currentTab === 'shop_ear' && <ShopEarView />}
        {currentTab === 'market_radar' && <MarketRadarView />}
        {currentTab === 'ai_assistant' && <AiAssistantView />}
        {currentTab === 'alerts' && <AlertsView />}
        {currentTab === 'settings' && <SettingsView />}
      </main>

      {/* Mobile Bottom Tab Bar & Module Sheet */}
      <MobileBottomNav onSelectProtectedTab={handleProtectedTab} />

      {/* Global Modals */}
      {showCheckout && (
        <CheckoutModal
          onClose={() => setShowCheckout(false)}
          onSuccess={handleCheckoutSuccess}
        />
      )}

      {activeReceipt && (
        <ReceiptModal
          order={activeReceipt}
          onClose={() => setActiveReceipt(null)}
        />
      )}

      {showHeldTickets && (
        <HeldTicketsModal
          onClose={() => setShowHeldTickets(false)}
        />
      )}

      {showBarcodeScanner && (
        <BarcodeScannerModal
          onClose={() => setShowBarcodeScanner(false)}
          onScanned={handleBarcodeScanned}
        />
      )}

      <ShopEarQuickModal />
      <PurchaseInvoiceScanModal />
      <PriceCheckerModal />
      <QuickNewBarcodeProductModal
        isOpen={!!quickNewBarcodeReq}
        scannedBarcode={quickNewBarcodeReq?.barcode || ''}
        sourceContext={quickNewBarcodeReq?.sourceContext || 'pos'}
        onClose={() => setQuickNewBarcodeReq(null)}
        onProductSaved={(created: Product) => {
          const ctx = quickNewBarcodeReq?.sourceContext || 'pos';
          if (ctx === 'pos' || ctx === 'global') {
            if (created.stock > 0) {
              addToCart(created);
              setScanFeedbackToast({
                text: isAr
                  ? `🔊 بيب! تسجلات "${created.name}" + تحفظ الباركود وتزادت للسلة`
                  : `🔊 Saved "${created.name}" & added to cart`
              });
            } else {
              setScanFeedbackToast({
                text: isAr
                  ? `✅ تسجلات "${created.name}" بمخزون 0 (نفذ)`
                  : `✅ Saved "${created.name}" with 0 stock`
              });
            }
            setTimeout(() => setScanFeedbackToast(null), 3200);
          }
          window.dispatchEvent(
            new CustomEvent('kadi:quick-barcode-product-created', {
              detail: {
                barcode: created.barcode,
                product: created,
                sourceContext: ctx
              }
            })
          );
        }}
      />

      {/* PIN Gate Modal for protected routes */}
      <PinGateModal
        isOpen={showAppPinModal}
        onClose={() => {
          setShowAppPinModal(false);
          setPendingAppTab(null);
          setPendingFromStoreMap(false);
        }}
        onSuccess={() => {
          if (pendingAppTab) {
            setOpenedFromStoreMap(pendingFromStoreMap && pendingAppTab !== 'store_map');
            setCurrentTab(pendingAppTab);
            setPendingAppTab(null);
            setPendingFromStoreMap(false);
          }
        }}
        title={
          pendingAppTab === 'inventory'
            ? (isAr ? 'المخزون محمي برقم سري' : 'Inventory Protected')
            : (isAr ? 'الإعدادات محمية برقم سري' : 'Settings Protected')
        }
        description={
          !settings.managerPin || settings.managerPin === '1234'
            ? isAr
              ? 'هذا القسم محمي بكلمة مرور. المرجو إدخال الرقم السري الخاص بالمدير (الافتراضي: 1234) للمتابعة.'
              : 'Manager authorization required. Enter PIN (Default: 1234).'
            : isAr
            ? 'هذا القسم محمي بكلمة مرور. المرجو إدخال الرقم السري الخاص بالمدير للمتابعة.'
            : 'Manager authorization required. Enter your Manager PIN to continue.'
        }
      />

      {/* Global Floating AI Chat Launcher & Window */}
      <FloatingAiChatButton />

      {/* Global Kadi Voice Assistant, Camera & 3 Invoices Modals */}
      <VoiceAssistantModal />

      {/* Global Real-Time Low Stock Visual Push Alert Stack */}
      <StockAlertOverlay onNavigateInventory={() => handleProtectedTab('inventory')} />

      {/* Global Real-Time Anti-Theft Visual Alert & Siren Banner */}
      <TheftAlertOverlay />

      {/* Anti-Theft Security Center Modal */}
      <TheftSecurityModal
        isOpen={showTheftSecurityModal}
        onClose={() => setShowTheftSecurityModal(false)}
        onOpenSettings={() => handleProtectedTab('settings')}
      />

      {/* Customer Display (Dual-Screen / Popup Live View) */}
      <CustomerDisplayLauncherModal
        isOpen={showCustomerDisplayModal}
        onClose={() => setShowCustomerDisplayModal(false)}
      />
    </div>
  );
};

export default function App() {
  return (
    <AppErrorBoundary>
      <PosProvider>
        <PosMainContent />
      </PosProvider>
    </AppErrorBoundary>
  );
}
