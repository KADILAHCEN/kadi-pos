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
import { OrdersView } from './components/orders/OrdersView';
import { ShiftsView } from './components/shifts/ShiftsView';
import { CustomersView } from './components/customers/CustomersView';
import { ExpensesView } from './components/expenses/ExpensesView';
import { RemoteSalesView } from './components/remote/RemoteSalesView';
import { PublicCatalogView } from './components/remote/PublicCatalogView';
import { CpuTaxView } from './components/cpu/CpuTaxView';
import { AnalyticsView } from './components/analytics/AnalyticsView';
import { AiAssistantView } from './components/ai/AiAssistantView';
import { FloatingAiChatButton } from './components/ai/FloatingAiChatButton';
import { VoiceAssistantModal } from './components/voice/VoiceAssistantModal';
import { StockAlertOverlay } from './components/alerts/StockAlertOverlay';
import { SettingsView } from './components/settings/SettingsView';
import { Order } from './types';
import { playSound } from './utils/audio';
import { bluetoothPrinter } from './utils/bluetoothPrinter';
import { preloadStoreLogo } from './utils/pdfReport';
import {
  ensureKadiDriveFolder,
  getWorkspaceAccessToken,
  uploadFileToDriveFolder
} from './utils/googleWorkspace';
import {
  Store,
  Layers,
  Receipt,
  Clock,
  Users,
  TrendingUp,
  Settings,
  ShoppingBag,
  AlertTriangle,
  X,
  ArrowRight,
  Download,
  BellRing
} from 'lucide-react';

import { OfflineIndicator } from './components/pwa/OfflineIndicator';
import { PinGateModal } from './components/auth/PinGateModal';

const PosMainContent: React.FC = () => {
  const {
    currentTab,
    setCurrentTab,
    products,
    addToCart,
    cart,
    lowStockProducts,
    language,
    isTabProtected,
    settings,
    updateSettings,
    buildFullBackupObject,
    currencySymbol,
    notificationPermission,
    requestNotificationPermission
  } = usePos();
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [isPublicCatalogMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('catalog') === '1';
  });

  const [showAppPinModal, setShowAppPinModal] = useState(false);
  const [pendingAppTab, setPendingAppTab] = useState<typeof currentTab | null>(null);

  const handleProtectedTab = (tab: typeof currentTab) => {
    if (isTabProtected(tab)) {
      setPendingAppTab(tab);
      setShowAppPinModal(true);
    } else {
      setCurrentTab(tab);
    }
  };

  // Active Modals
  const [showCheckout, setShowCheckout] = useState(false);
  const [showHeldTickets, setShowHeldTickets] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<Order | null>(null);

  // Mobile cart sheet toggle
  const [showMobileCart, setShowMobileCart] = useState(false);

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
    const matched = products.find(
      (p) => p.barcode === clean || p.sku.toLowerCase() === clean.toLowerCase()
    );
    if (matched) {
      playSound('beep');
      addToCart(matched);
      setScanFeedbackToast({
        text: isAr
          ? `📷 تم مسح وإضافة: ${matched.name}`
          : `📷 Scanned & added: ${matched.name}`
      });
    } else {
      playSound('error');
      setScanFeedbackToast({
        text: isAr
          ? `⚠️ هذا الباركود غير مسجل في المخزون: ${clean}`
          : `⚠️ Barcode not found in catalog: ${clean}`,
        isError: true
      });
    }
    setTimeout(() => setScanFeedbackToast(null), 3200);
  };

  const handleCheckoutSuccess = (order: Order) => {
    setShowCheckout(false);
    setShowMobileCart(false);
    setActiveReceipt(order);

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
        <div className="fixed bottom-5 left-5 z-50 px-4 py-3 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white border border-emerald-500/60 shadow-2xl flex items-center gap-3 text-xs animate-in fade-in slide-in-from-bottom-2">
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

      {/* Persistent Visual Low Stock Alert Banner (Shown across all screens outside Inventory) */}
      {settings.enableLowStockVisualAlerts !== false &&
        !isBannerDismissed &&
        lowStockProducts.length > 0 &&
        currentTab !== 'inventory' && (
          <div className="bg-amber-50 dark:bg-amber-950/75 border-b border-amber-200 dark:border-amber-800/80 px-5 py-2.5 flex items-center justify-between gap-4 text-xs shrink-0 transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="p-1.5 rounded-lg bg-rose-600 text-white shrink-0 animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5" />
              </span>
              <div className="truncate">
                <span className="font-extrabold text-amber-950 dark:text-amber-200">
                  {isAr
                    ? `تنبيه المخزون (${lowStockProducts.length} منتجات تحت الحد الأدنى): `
                    : isFr
                    ? `Alerte Stock (${lowStockProducts.length} articles sous le seuil): `
                    : `Stock Alert (${lowStockProducts.length} items at/below min): `}
                </span>
                <span className="text-amber-800 dark:text-amber-300 font-medium">
                  {lowStockProducts
                    .slice(0, 3)
                    .map((p) => `${p.name} (${p.stock}/${p.lowStockThreshold})`)
                    .join(' · ')}
                  {lowStockProducts.length > 3 && ` +${lowStockProducts.length - 3}`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {notificationPermission === 'default' && (
                <button
                  type="button"
                  onClick={() => void requestNotificationPermission()}
                  className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] flex items-center gap-1 transition-colors shadow-2xs"
                >
                  <BellRing className="w-3 h-3" />
                  <span>{isAr ? 'تفعيل Push' : 'Enable Push'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => handleProtectedTab('inventory')}
                className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] transition-colors shadow-2xs"
              >
                {isAr ? 'عرض وتعديل المخزون' : isFr ? 'Gérer les stocks' : 'View & Restock'}
              </button>
              <button
                type="button"
                onClick={() => setDismissedLowStockSignature(currentLowStockSignature)}
                className="p-1 text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
                title={isAr ? 'إخفاء مؤقتاً' : 'Dismiss'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      {/* Main View Area */}
      <main className="flex-1 flex overflow-hidden relative">
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
              />
            </div>

            {/* Mobile Floating Cart Trigger */}
            <div className="lg:hidden fixed bottom-4 left-4 right-4 z-20">
              <button
                onClick={() => setShowMobileCart(true)}
                className="w-full py-3.5 px-5 bg-emerald-600 text-white font-extrabold rounded-2xl shadow-xl flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5" />
                  <span>{isAr ? 'عرض الفاتورة' : isFr ? 'Voir le panier' : 'View Ticket'}</span>
                  <span className="px-2 py-0.5 bg-emerald-700 rounded-full text-xs">
                    {cart.reduce((s, i) => s + i.quantity, 0)}
                  </span>
                </div>
              </button>
            </div>

            {/* Mobile Cart Bottom Sheet */}
            {showMobileCart && (
              <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end bg-slate-950/60 backdrop-blur-xs">
                <div className="w-full h-[88vh] bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl flex flex-col overflow-hidden">
                  <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">{isAr ? 'الفاتورة الحالية' : 'Current Order'}</span>
                    <button
                      onClick={() => setShowMobileCart(false)}
                      className="text-xs font-bold px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
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
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {currentTab === 'inventory' && <InventoryView />}
        {currentTab === 'orders' && <OrdersView />}
        {currentTab === 'shifts' && <ShiftsView />}
        {currentTab === 'customers' && <CustomersView />}
        {currentTab === 'expenses' && <ExpensesView />}
        {currentTab === 'remote_sales' && <RemoteSalesView />}
        {currentTab === 'cpu_tax' && <CpuTaxView />}
        {currentTab === 'analytics' && <AnalyticsView />}
        {currentTab === 'ai_assistant' && <AiAssistantView />}
        {currentTab === 'settings' && <SettingsView />}
      </main>

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

      {/* PIN Gate Modal for protected routes */}
      <PinGateModal
        isOpen={showAppPinModal}
        onClose={() => {
          setShowAppPinModal(false);
          setPendingAppTab(null);
        }}
        onSuccess={() => {
          if (pendingAppTab) {
            setCurrentTab(pendingAppTab);
            setPendingAppTab(null);
          }
        }}
        title={
          pendingAppTab === 'inventory'
            ? (isAr ? 'المخزون محمي برقم سري' : 'Inventory Protected')
            : (isAr ? 'الإعدادات محمية برقم سري' : 'Settings Protected')
        }
        description={
          isAr
            ? 'هذا القسم محمي بكلمة مرور. المرجو إدخال الرقم السري الخاص بالمدير (الافتراضي: 1234) للمتابعة.'
            : 'Manager authorization required. Enter PIN (Default: 1234).'
        }
      />

      {/* Global Floating AI Chat Launcher & Window */}
      <FloatingAiChatButton />

      {/* Global Kadi Voice Assistant, Camera & 3 Invoices Modals */}
      <VoiceAssistantModal />

      {/* Global Real-Time Low Stock Visual Push Alert Stack */}
      <StockAlertOverlay onNavigateInventory={() => handleProtectedTab('inventory')} />
    </div>
  );
};

export default function App() {
  return (
    <PosProvider>
      <PosMainContent />
    </PosProvider>
  );
}
