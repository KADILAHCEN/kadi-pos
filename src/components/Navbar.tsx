import React, { useState } from 'react';
import { usePos } from '../context/PosContext';
import { Product } from '../types';
import {
  Store,
  Layers,
  Receipt,
  Clock,
  Users,
  TrendingUp,
  Settings,
  Sun,
  Moon,
  Globe,
  PauseCircle,
  Bell,
  AlertTriangle,
  ArrowRight,
  PackageCheck,
  Building2,
  ChevronDown,
  Check,
  Calendar,
  Lock,
  UserCheck,
  Scale,
  Wallet,
  Send,
  Landmark,
  CheckCircle2,
  Palette,
  Plus,
  Sparkles,
  BellRing,
  MessageSquare,
  Mic,
  Monitor,
  ShieldAlert
} from 'lucide-react';
import { PinGateModal } from './auth/PinGateModal';
import { KExecutivePanel } from './KExecutivePanel';
import { PWAInstallButton } from './pwa/PWAInstallButton';

export const Navbar: React.FC = () => {
  const {
    currentTab,
    setCurrentTab,
    currentShift,
    heldTickets,
    lowStockProducts,
    expiringSoonProducts,
    adjustStock,
    branches,
    activeBranch,
    setActiveBranchId,
    criticalLowStockProducts,
    notificationPermission,
    requestNotificationPermission,
    triggerTestStockAlert,
    isDark,
    toggleTheme,
    language,
    toggleLanguage,
    users,
    currentUser,
    setCurrentUserId,
    isTabProtected,
    settings,
    zakatSummary,
    currencySymbol,
    remoteOrders,
    cpuAlerts,
    markCpuQuarterPaid,
    allPalettes,
    activePalette,
    selectPalette,
    unresolvedTheftAlerts,
    isSirenActive
  } = usePos();

  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const newRemoteOrdersCount = remoteOrders.filter((r) => r.status === 'new').length;

  const [showKPanel, setShowKPanel] = useState(false);
  const [showAlertDropdown, setShowAlertDropdown] = useState(false);
  const [alertTab, setAlertTab] = useState<'low_stock' | 'expiring' | 'zakat' | 'cpu'>('low_stock');
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showPaletteDropdown, setShowPaletteDropdown] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingTab, setPendingTab] = useState<typeof currentTab | null>(null);

  const handleTabClick = (tabId: typeof currentTab) => {
    if (isTabProtected(tabId)) {
      setPendingTab(tabId);
      setShowPinModal(true);
    } else {
      setCurrentTab(tabId);
    }
  };

  const navItems = [
    { id: 'pos' as const, label: isAr ? 'نقطة البيع' : 'POS Register', icon: Store },
    { id: 'inventory' as const, label: isAr ? 'إدارة المخزون والتتبع' : 'Inventory & Stock', icon: Layers },
    { id: 'orders' as const, label: isAr ? 'الفواتير والمبيعات' : 'Receipts', icon: Receipt },
    { id: 'shifts' as const, label: isAr ? 'الورديات والصندوق' : 'Shifts & Cash', icon: Clock },
    { id: 'customers' as const, label: isAr ? 'كناش الكريدي والعملاء' : 'Credit Ledger & Customers', icon: Users },
    { id: 'expenses' as const, label: isAr ? 'المصاريف' : isFr ? 'Dépenses' : 'Expenses', icon: Wallet },
    { id: 'remote_sales' as const, label: isAr ? 'البيع عن بعد' : isFr ? 'Vente à distance' : 'Remote & WA', icon: Send },
    { id: 'cpu_tax' as const, label: isAr ? 'ضرائبي CPU' : isFr ? 'Impôt CPU' : 'CPU Tax', icon: Landmark },
    { id: 'analytics' as const, label: isAr ? 'التقارير والأرباح' : 'Analytics & Profit', icon: TrendingUp },
    { id: 'ai_assistant' as const, label: isAr ? 'مساعد الذكاء الاصطناعي' : isFr ? 'Assistant IA' : 'AI Assistant', icon: Sparkles },
    { id: 'settings' as const, label: isAr ? 'الإعدادات' : 'Settings', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-30 flex flex-wrap md:flex-nowrap items-center justify-between gap-2 xl:gap-4 px-3 sm:px-5 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors">
      {/* Zone 1: K Quick Overview Button, Wordmark, Always-Visible Red EOD Close Button & Branch Switcher */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 relative">
        <button
          type="button"
          onClick={() => {
            setShowKPanel((prev) => !prev);
            setShowBranchDropdown(false);
            setShowAlertDropdown(false);
            setShowUserDropdown(false);
          }}
          aria-expanded={showKPanel}
          aria-label={isAr ? 'ملخص إدارة المخزون والمبلغ الإجمالي ونسبة الأرباح والأكثر مبيعاً' : 'Inventory, Total Sales, Profit & Best Sellers'}
          title={isAr ? 'إدارة المخزون، المبلغ الإجمالي، نسبة الأرباح والمنتوجات الأكثر مبيعاً' : 'Inventory, Total Sales, Profit % & Top Products'}
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-extrabold text-base sm:text-lg shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 shrink-0 ${
            showKPanel
              ? 'bg-slate-900 dark:bg-emerald-500 text-white ring-2 ring-emerald-500/40'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
        >
          K
        </button>

        <button
          type="button"
          onClick={() => {
            setShowKPanel(false);
            setCurrentTab('pos');
          }}
          className="flex items-center text-left rtl:text-right group focus:outline-none"
        >
          <div className="whitespace-nowrap">
            <span className="text-base sm:text-lg xl:text-xl font-bold tracking-tight text-slate-900 dark:text-white font-sans">
              kadi <span className="text-emerald-600 dark:text-emerald-400">pos</span>
            </span>
          </div>
        </button>

        <KExecutivePanel
          isOpen={showKPanel}
          onClose={() => setShowKPanel(false)}
          onNavigate={handleTabClick}
        />

        {/* Branch Switcher Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowBranchDropdown(!showBranchDropdown)}
            className="flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 transition-colors shadow-2xs"
            title={isAr ? 'تبديل الفرع النشط' : 'Switch active branch'}
          >
            <Building2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="max-w-[72px] sm:max-w-[120px] truncate">{activeBranch.name}</span>
            <ChevronDown className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
          </button>

          {showBranchDropdown && (
            <div className="absolute top-full start-0 z-50 mt-1 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden animate-in fade-in">
              <div className="p-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">
                  {isAr ? 'اختر الفرع للبيع والعمليات' : 'Select Active Branch'}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                  {branches.length} {isAr ? 'فروع' : 'branches'}
                </span>
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {branches.map((b) => {
                  const isCurrent = b.id === activeBranch.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        setActiveBranchId(b.id);
                        setShowBranchDropdown(false);
                      }}
                      className={`w-full p-2.5 text-start flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                        isCurrent ? 'bg-emerald-50/60 dark:bg-emerald-950/30' : ''
                      }`}
                    >
                      <div className="min-w-0 pe-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] font-black px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {b.code}
                          </span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {b.name}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                          {b.city} · {b.managerName}
                        </div>
                      </div>
                      {isCurrent && (
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentTab('settings');
                    setShowBranchDropdown(false);
                  }}
                  className="text-[11px] font-bold text-emerald-600 hover:underline"
                >
                  {isAr ? 'إدارة ونقل المخزون بين الفروع ←' : 'Manage Branches & Transfers →'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Zone 2: Scrollable single-line navigation links */}
      <nav className="hidden lg:flex flex-1 min-w-0 items-center gap-1 overflow-x-auto py-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          const isProtected = isTabProtected(item.id);
          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-700/60 font-bold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
              {isProtected && (
                <Lock className="w-3 h-3 text-amber-500 opacity-80" />
              )}
              {item.id === 'pos' && heldTickets.length > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] bg-amber-500 text-white rounded-full font-bold">
                  {heldTickets.length}
                </span>
              )}
              {item.id === 'remote_sales' && newRemoteOrdersCount > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] bg-rose-500 text-white rounded-full font-black animate-pulse">
                  {newRemoteOrdersCount}
                </span>
              )}
              {item.id === 'cpu_tax' && cpuAlerts.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Shift Status & Utilities */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-end gap-1.5 sm:gap-2 shrink-0 w-full md:w-auto max-w-full">
        {/* Alerts Center (Low Stock & Expiry Tracking) */}
        <div className="relative">
          {(() => {
            const zakatAlertCount = zakatSummary.hasReachedNisab ? 1 : 0;
            const totalAlerts = lowStockProducts.length + expiringSoonProducts.length + zakatAlertCount + cpuAlerts.length;
            const hasAlerts = totalAlerts > 0;
            const hasCritical = criticalLowStockProducts.length > 0;
            return (
              <>
                <button
                  onClick={() => setShowAlertDropdown(!showAlertDropdown)}
                  className={`relative p-2 rounded-xl transition-all ${
                    hasCritical
                      ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 ring-2 ring-rose-400/25'
                      : hasAlerts
                      ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 ring-2 ring-amber-400/20'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title={isAr ? `مركز التنبيهات (${totalAlerts})` : `Alerts Center (${totalAlerts})`}
                >
                  <Bell className="w-4 h-4" />
                  {hasAlerts && (
                    <span className="absolute -top-1 -right-1 rtl:-right-auto rtl:-left-1 px-1.5 py-0.2 text-[9px] font-black bg-rose-500 text-white rounded-full shadow-xs animate-pulse">
                      {totalAlerts}
                    </span>
                  )}
                </button>

                {/* Dropdown Drawer */}
                {showAlertDropdown && (
                  <div className="absolute top-full right-0 rtl:right-auto rtl:left-0 z-50 mt-2 w-84 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1">
                    {/* Header Tabs */}
                    <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setAlertTab('low_stock')}
                        className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 ${
                          alertTab === 'low_stock'
                            ? 'bg-amber-500 text-white shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                        }`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>{isAr ? 'المخزون' : 'Stock'}</span>
                        <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-white/20">
                          {lowStockProducts.length}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAlertTab('expiring')}
                        className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 ${
                          alertTab === 'expiring'
                            ? 'bg-rose-500 text-white shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                        }`}
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{isAr ? 'الصلاحية' : 'Expiry'}</span>
                        <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-white/20">
                          {expiringSoonProducts.length}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAlertTab('zakat')}
                        className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 ${
                          alertTab === 'zakat'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                        }`}
                      >
                        <Scale className="w-3.5 h-3.5" />
                        <span>{isAr ? 'الزكاة' : 'Zakat'}</span>
                        {zakatSummary.hasReachedNisab && (
                          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setAlertTab('cpu')}
                        className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 ${
                          alertTab === 'cpu'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                        }`}
                      >
                        <Landmark className="w-3.5 h-3.5" />
                        <span>CPU</span>
                        {cpuAlerts.length > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-amber-400 text-slate-950 font-black">
                            {cpuAlerts.length}
                          </span>
                        )}
                      </button>
                    </div>

                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {alertTab === 'low_stock' ? (
                        <div>
                          {notificationPermission !== 'unsupported' && (
                            <div className="p-2.5 bg-rose-50/90 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-800/80 flex items-center justify-between gap-2">
                              <div className="text-[11px] font-bold text-rose-800 dark:text-rose-200 leading-snug">
                                {notificationPermission === 'granted'
                                  ? isAr
                                    ? 'إشعارات الدفع (Push) مفعّلة لأي منتج يقل عن الحد الأدنى ✓'
                                    : 'Low-stock Push alerts active ✓'
                                  : isAr
                                  ? 'تفعيل إشعارات الدفع الفورية عند نزول أي منتج تحت الحد الأدنى'
                                  : 'Enable Push Alerts when any item drops below minimum'}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {notificationPermission !== 'granted' ? (
                                  <button
                                    type="button"
                                    onClick={() => void requestNotificationPermission()}
                                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black flex items-center gap-1 transition-colors"
                                  >
                                    <BellRing className="w-3 h-3" />
                                    <span>{isAr ? 'تفعيل' : 'Enable'}</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => void triggerTestStockAlert()}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black transition-colors"
                                  >
                                    {isAr ? 'تجربة التنبيه' : 'Test Alert'}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {lowStockProducts.length === 0 ? (
                            <div className="p-6 text-center text-xs text-slate-400 flex flex-col items-center">
                              <PackageCheck className="w-8 h-8 text-emerald-500 mb-1 opacity-70" />
                              <span>{isAr ? 'جميع المنتجات فوق الحد الأدنى' : 'All stock levels healthy'}</span>
                            </div>
                          ) : (
                            lowStockProducts.map((p: Product) => {
                              const isCritical =
                                p.lowStockThreshold > 0 && p.stock <= p.lowStockThreshold * 0.2;
                              return (
                                <div
                                  key={p.id}
                                  className={`p-3 flex items-center justify-between gap-2.5 transition-colors ${
                                    isCritical
                                      ? 'bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100/70 dark:hover:bg-rose-950/50'
                                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                        {p.name}
                                      </span>
                                      {isCritical && (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-600 text-white shrink-0">
                                          {isAr ? 'حرج < 20%' : 'Critical <20%'}
                                        </span>
                                      )}
                                    </div>
                                    <div
                                      className={`text-[11px] font-medium ${
                                        isCritical
                                          ? 'text-rose-600 dark:text-rose-400'
                                          : 'text-amber-600 dark:text-amber-400'
                                      }`}
                                    >
                                      {isAr ? 'المتبقي:' : 'Stock:'}{' '}
                                      <span className="font-bold font-mono tabular-nums">{p.stock}</span> (
                                      {isAr ? 'حد التنبيه:' : 'Min:'} {p.lowStockThreshold})
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => {
                                      adjustStock(p.id, 20, 'توريد سريع عبر تنبيه المخزون', 'restock');
                                      setShowAlertDropdown(false);
                                    }}
                                    className="px-2 py-1 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors whitespace-nowrap shrink-0"
                                  >
                                    +20 {isAr ? 'توريد' : 'Restock'}
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      ) : alertTab === 'expiring' ? (
                        expiringSoonProducts.length === 0 ? (
                          <div className="p-6 text-center text-xs text-slate-400 flex flex-col items-center">
                            <PackageCheck className="w-8 h-8 text-emerald-500 mb-1 opacity-70" />
                            <span>{isAr ? 'لا توجد منتجات قريبة من انتهاء الصلاحية' : 'No expiring products'}</span>
                          </div>
                        ) : (
                          expiringSoonProducts.map((p: Product) => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const exp = p.expiryDate ? new Date(p.expiryDate) : null;
                            const diffDays = exp ? Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                            const isExpired = diffDays < 0;

                            return (
                              <div key={p.id} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center justify-between gap-2.5">
                                <div className="min-w-0">
                                  <div className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                    {p.name}
                                  </div>
                                  <div className="text-[11px] font-medium mt-0.5 flex items-center gap-1.5">
                                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-black ${
                                      isExpired
                                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                    }`}>
                                      {isExpired ? (isAr ? 'منتهي الصلاحية' : 'Expired') : (isAr ? `ينتهي خلال ${diffDays} يوم` : `${diffDays}d left`)}
                                    </span>
                                    <span className="text-slate-400 font-mono text-[10px]">
                                      {p.expiryDate}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => {
                                    setCurrentTab('inventory');
                                    setShowAlertDropdown(false);
                                  }}
                                  className="px-2 py-1 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
                                >
                                  {isAr ? 'معاينة' : 'Inspect'}
                                </button>
                              </div>
                            );
                          })
                        )
                      ) : alertTab === 'zakat' ? (
                        <div className="p-4 space-y-3 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-black text-slate-900 dark:text-white">
                              {zakatSummary.hasReachedNisab
                                ? (isAr ? '✅ تم تجاوز نصاب 85 جم ذهب' : '✅ 85g Gold Nisab Exceeded')
                                : (isAr ? '⏳ لم يبلغ النصاب بعد' : '⏳ Below 85g Nisab')}
                            </span>
                            <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                              {zakatSummary.nisabProgressPct}%
                            </span>
                          </div>
                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1.5">
                            <div className="flex justify-between">
                              <span className="text-slate-500">{isAr ? 'الوعاء الزكوي:' : 'Zakatable Base:'}</span>
                              <span className="font-mono font-bold text-slate-900 dark:text-white">
                                {zakatSummary.zakatableBase.toFixed(2)} {currencySymbol}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">{isAr ? 'النصاب (85g ذهب):' : 'Nisab (85g):'}</span>
                              <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                                {zakatSummary.nisabValue.toFixed(2)} {currencySymbol}
                              </span>
                            </div>
                            <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                              <span className="font-bold text-slate-700 dark:text-slate-300">
                                {isAr ? 'الزكاة الواجبة (2.5%):' : 'Auto Zakat (2.5%):'}
                              </span>
                              <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                                {zakatSummary.zakatDue.toFixed(2)} {currencySymbol}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentTab('analytics');
                              setShowAlertDropdown(false);
                            }}
                            className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors"
                          >
                            {isAr ? 'فتح حاسبة وتفاصيل الزكاة' : 'Open Zakat Calculator'}
                          </button>
                        </div>
                      ) : (
                        cpuAlerts.length === 0 ? (
                          <div className="p-6 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                            <CheckCircle2 className="w-8 h-8 text-emerald-500 opacity-70" />
                            <span>{isAr ? 'لا توجد دفعات CPU مستحقة خلال 7 أيام' : 'No CPU payments due within 7 days'}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setCurrentTab('cpu_tax');
                                setShowAlertDropdown(false);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-[11px]"
                            >
                              {isAr ? 'فتح ضرائبي CPU' : 'Open CPU Tax'}
                            </button>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {cpuAlerts.map((al) => (
                              <div key={al.recordId} className="p-3 flex items-center justify-between gap-2 text-xs">
                                <div className="min-w-0">
                                  <div className="font-black text-slate-900 dark:text-white">
                                    CPU {al.year}-{al.quarter} · {al.totalDue.toFixed(2)} {currencySymbol}
                                  </div>
                                  <div className={`text-[11px] font-bold ${al.isOverdue ? 'text-rose-600' : 'text-amber-600'}`}>
                                    {al.isOverdue
                                      ? (isAr ? `متأخر بـ ${Math.abs(al.daysLeft)} يوم` : `Overdue ${Math.abs(al.daysLeft)}d`)
                                      : (isAr ? `باقي ${al.daysLeft} يوم للدفع (${al.dueDate})` : `${al.daysLeft}d left`)}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    markCpuQuarterPaid(al.recordId, true);
                                    setShowAlertDropdown(false);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black shrink-0"
                                >
                                  {isAr ? 'لقد دفعت' : 'I Paid'}
                                </button>
                              </div>
                            ))}
                          </div>
                        )
                      )}
                    </div>

                    <div className="p-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-center">
                      <button
                        onClick={() => {
                          setCurrentTab('inventory');
                          setShowAlertDropdown(false);
                        }}
                        className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        {isAr ? 'الانتقال إلى إدارة وتتبع المخزون ←' : 'Go to Inventory & Tracking →'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Held Orders quick trigger */}
        {heldTickets.length > 0 && (
          <button
            onClick={() => setCurrentTab('pos')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors whitespace-nowrap shrink-0"
            title={isAr ? 'الطلبات المعلقة' : 'Held Tickets'}
          >
            <PauseCircle className="w-3.5 h-3.5" />
            <span>{heldTickets.length} {isAr ? 'معلق' : 'held'}</span>
          </button>
        )}

        {/* Shift status pill */}
        <button
          onClick={() => handleTabClick('shifts')}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors whitespace-nowrap shrink-0"
        >
          <span className={`w-2 h-2 rounded-full ${currentShift.status === 'open' ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
          <span>{currentShift.status === 'open' ? (isAr ? `وردية #${currentShift.shiftNumber}` : `Shift #${currentShift.shiftNumber}`) : (isAr ? 'الوردية مغلقة' : 'Shift Closed')}</span>
        </button>

        {/* User Profile & Role Switcher */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors shadow-2xs shrink-0"
            title={isAr ? `المستخدم: ${currentUser.name}` : `User: ${currentUser.name}`}
          >
            <span className="text-sm">
              {currentUser.avatar ||
                (currentUser.role === 'manager' ? '👨‍💼' : currentUser.role === 'courier' ? '🛵' : '🧑‍💻')}
            </span>
            <span className="hidden xl:inline max-w-[85px] truncate">{currentUser.name}</span>
            <span
              className={`px-1.5 py-0.2 rounded-md text-[9px] font-black ${
                currentUser.role === 'manager'
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                  : currentUser.role === 'courier'
                  ? 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300'
                  : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
              }`}
            >
              {currentUser.role === 'manager'
                ? isAr ? 'مدير' : 'Manager'
                : currentUser.role === 'courier'
                ? isAr ? 'موزّع' : 'Courier'
                : isAr ? 'كاشير' : 'Cashier'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
          </button>

          {showUserDropdown && (
            <div className="absolute top-full end-0 z-50 mt-1.5 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in">
              <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <div className="text-[11px] font-bold text-slate-400">
                  {isAr ? 'المستخدم الحالي' : 'Current User'}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xl">{currentUser.avatar || '👤'}</span>
                  <div>
                    <div className="font-extrabold text-xs text-slate-900 dark:text-white">
                      {currentUser.name}
                    </div>
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                      {currentUser.role === 'manager'
                        ? isAr ? 'صلاحيات المدير الكاملة' : 'Manager (Full Access)'
                        : currentUser.role === 'courier'
                        ? isAr ? 'صلاحيات التوصيل والتحصيل (Livreur)' : 'Courier (Delivery Only)'
                        : isAr ? 'صلاحيات الكاشير' : 'Cashier'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                <div className="text-[10px] font-bold text-slate-400 px-2 py-1">
                  {isAr ? 'تبديل المستخدم:' : 'Switch User:'}
                </div>
                <div className="space-y-1">
                  {users.map((u) => {
                    const isSelected = u.id === currentUser.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setCurrentUserId(u.id);
                          setShowUserDropdown(false);
                        }}
                        className={`w-full p-2 rounded-xl text-start flex items-center justify-between text-xs transition-colors ${
                          isSelected
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">{u.avatar || '👤'}</span>
                          <div>
                            <div>{u.name}</div>
                            <div className="text-[10px] opacity-70">
                              {u.role === 'manager'
                                ? isAr ? 'مدير (رمز: 1234)' : 'Manager'
                                : u.role === 'courier'
                                ? isAr ? 'موزّع / توصيل (Livreur)' : 'Courier'
                                : isAr ? 'كاشير' : 'Cashier'}
                            </div>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-emerald-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-2 bg-slate-50 dark:bg-slate-800/30 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowUserDropdown(false);
                    handleTabClick('settings');
                  }}
                  className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  {isAr ? 'إدارة المستخدمين والأذونات ←' : 'Manage Users & Permissions →'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Language switch */}
        <button
          onClick={toggleLanguage}
          className="p-2 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1"
          title={isAr ? 'تغيير اللغة' : 'Switch Language'}
        >
          <Globe className="w-4 h-4" />
          <span className="font-bold">{language === 'ar' ? 'EN' : 'عربي'}</span>
        </button>

        {/* App Palette Quick Switcher */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowPaletteDropdown((prev) => !prev);
              setShowBranchDropdown(false);
              setShowAlertDropdown(false);
              setShowUserDropdown(false);
              setShowKPanel(false);
            }}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
            title={isAr ? `الباليت النشطة: ${activePalette.name}` : `Active Palette: ${activePalette.nameEn || activePalette.name}`}
          >
            <Palette className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span
              className="w-2.5 h-2.5 rounded-full border border-white/60 dark:border-slate-900 shadow-2xs shrink-0"
              style={{ backgroundColor: activePalette.primaryColor }}
            />
          </button>

          {showPaletteDropdown && (
            <div className="absolute top-full end-0 z-50 mt-1.5 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in">
              <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                    {isAr ? 'لوحات الألوان (الباليت)' : 'App Color Palettes'}
                  </span>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                  {allPalettes.length}
                </span>
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {allPalettes.map((pal) => {
                  const isCurrent = pal.id === activePalette.id;
                  return (
                    <button
                      key={pal.id}
                      type="button"
                      onClick={() => {
                        selectPalette(pal.id);
                        setShowPaletteDropdown(false);
                      }}
                      className={`w-full p-2.5 text-start flex items-center justify-between gap-2 transition-colors ${
                        isCurrent
                          ? 'bg-emerald-50/80 dark:bg-emerald-950/40'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex items-center -space-x-1 rtl:space-x-reverse shrink-0">
                          <span
                            className="w-4 h-4 rounded-full border border-white dark:border-slate-900 shadow-2xs"
                            style={{ backgroundColor: pal.primaryColor }}
                          />
                          <span
                            className="w-4 h-4 rounded-full border border-white dark:border-slate-900 shadow-2xs"
                            style={{ backgroundColor: pal.accentColor }}
                          />
                          <span
                            className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 shadow-2xs"
                            style={{ backgroundColor: pal.darkBgColor }}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {isAr ? pal.name : pal.nameEn || pal.name}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            {pal.isBuiltIn
                              ? isAr ? 'باليت جاهزة' : 'Preset'
                              : isAr ? 'مخصصة من إنشائك' : 'Custom Palette'}
                          </div>
                        </div>
                      </div>
                      {isCurrent && (
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                <button
                  type="button"
                  onClick={() => {
                    setShowPaletteDropdown(false);
                    handleTabClick('settings');
                    setTimeout(() => {
                      document.getElementById('palette-studio')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 120);
                  }}
                  className="w-full py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إنشاء وتخصيص باليت جديدة' : 'Create / Customize Palette'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Compact Top Install on Phone (PWA) Trigger */}
        <PWAInstallButton variant="navbar" />

        {/* Anti-Theft & Loss Prevention Security Center Button */}
        <button
          type="button"
          onClick={() => {
            setShowPaletteDropdown(false);
            setShowBranchDropdown(false);
            setShowAlertDropdown(false);
            setShowUserDropdown(false);
            setShowKPanel(false);
            window.dispatchEvent(new CustomEvent('kadi:open-theft-security'));
          }}
          aria-label={isAr ? 'مركز تنبيهات السرقة والأمان' : 'Anti-Theft Security Center'}
          title={
            isAr
              ? `مركز تنبيهات السرقة (${unresolvedTheftAlerts.length} غير مراجعة)`
              : `Anti-Theft Security (${unresolvedTheftAlerts.length} open)`
          }
          className={`relative p-2 rounded-lg border transition-colors ${
            isSirenActive || unresolvedTheftAlerts.length > 0
              ? 'text-white bg-rose-600 border-rose-500 hover:bg-rose-700 ring-2 ring-rose-500/40 animate-pulse'
              : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200/80 dark:border-rose-800/70 hover:bg-rose-100 dark:hover:bg-rose-900/50'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          {unresolvedTheftAlerts.length > 0 && (
            <span className="absolute -top-1 -end-1 px-1.5 py-0.2 text-[9px] font-black bg-slate-950 text-white border border-rose-300 rounded-full tabular-nums">
              {unresolvedTheftAlerts.length}
            </span>
          )}
        </button>

        {/* Compact Top Customer Display (Dual Screen) Launcher */}
        <button
          type="button"
          onClick={() => {
            setShowPaletteDropdown(false);
            setShowBranchDropdown(false);
            setShowAlertDropdown(false);
            setShowUserDropdown(false);
            setShowKPanel(false);
            window.dispatchEvent(new CustomEvent('kadi:open-customer-display'));
          }}
          aria-label={isAr ? 'شاشة عرض العميل' : 'Customer Display'}
          title={isAr ? 'شاشة عرض العميل (شاشة ثانية مباشرة)' : 'Customer Display (Dual Screen)'}
          className="p-2 rounded-lg text-sky-600 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/50 border border-sky-200/80 dark:border-sky-800/70 hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors"
        >
          <Monitor className="w-4 h-4" />
        </button>

        {/* Compact Top Voice Assistant Trigger */}
        <button
          type="button"
          onClick={() => {
            setShowPaletteDropdown(false);
            setShowBranchDropdown(false);
            setShowAlertDropdown(false);
            setShowUserDropdown(false);
            setShowKPanel(false);
            window.dispatchEvent(new CustomEvent('kadi:toggle-voice-assistant'));
          }}
          aria-label={isAr ? 'التسجيل الصوتي الذكي' : 'Kadi Voice POS'}
          title={isAr ? 'التسجيل الصوتي الذكي (بالدارجة والريال)' : 'Voice POS (Darija & Riyal)'}
          className="relative p-2 rounded-lg text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800/70 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors"
        >
          <Mic className="w-4 h-4" />
          <span className="absolute -top-0.5 -end-0.5 w-2 h-2 rounded-full bg-rose-500 border border-white dark:border-slate-900" />
        </button>

        {/* Compact Top AI Chat Trigger */}
        <button
          type="button"
          onClick={() => {
            setShowPaletteDropdown(false);
            setShowBranchDropdown(false);
            setShowAlertDropdown(false);
            setShowUserDropdown(false);
            setShowKPanel(false);
            window.dispatchEvent(new CustomEvent('kadi:toggle-ai-chat'));
          }}
          aria-label={isAr ? 'محادثة الذكاء الاصطناعي' : 'AI Chat'}
          title={isAr ? 'محادثة الذكاء الاصطناعي' : 'Quick AI Chat'}
          className="relative p-2 rounded-lg text-violet-600 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/50 border border-violet-200/80 dark:border-violet-800/70 hover:bg-violet-100 dark:hover:bg-violet-900/60 transition-colors"
        >
          <MessageSquare className="w-4 h-4" />
          <span className="absolute -top-0.5 -end-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-white dark:border-slate-900" />
        </button>

        {/* Dark/Light mode toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-slate-600 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          title={isDark ? (isAr ? 'الوضع الليلي الحقيقي مفعّل — اضغط للوضع الفاتح' : 'True Dark Active — Switch to Light') : (isAr ? 'تفعيل الوضع الليلي الحقيقي' : 'Enable True Dark Mode')}
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Compact Red End-of-Day Cash Closing Button (Left side in RTL) */}
        {currentShift.status === 'open' ? (
          <button
            type="button"
            onClick={() => {
              setShowKPanel(false);
              setShowBranchDropdown(false);
              sessionStorage.setItem('kadi_open_eod_modal', '1');
              handleTabClick('shifts');
              window.setTimeout(() => {
                window.dispatchEvent(new CustomEvent('kadi:open-eod-closing'));
              }, 60);
            }}
            className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] leading-tight font-bold rounded-md bg-rose-600 hover:bg-rose-700 text-white shadow-2xs transition-colors whitespace-nowrap shrink-0"
            title={isAr ? 'إغلاق صندوق التاجر في آخر النهار' : 'Merchant End-of-Day Cash Closing'}
          >
            <Lock className="w-2.5 h-2.5 shrink-0" />
            <span>{isAr ? 'إغلاق' : 'Close'}</span>
          </button>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowKPanel(false);
                handleTabClick('shifts');
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] leading-tight font-bold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors whitespace-nowrap shrink-0"
              title={isAr ? 'فتح الصندوق' : 'Open Drawer'}
            >
              <span>{isAr ? 'فتح' : 'Open'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowKPanel(false);
                sessionStorage.setItem('kadi_open_daily_report', '1');
                handleTabClick('shifts');
                window.setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('kadi:open-daily-report'));
                }, 60);
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] leading-tight font-bold rounded-md bg-rose-600 hover:bg-rose-700 text-white shadow-2xs transition-colors whitespace-nowrap shrink-0"
              title={isAr ? 'تقرير الإغلاق النهاري' : 'Daily Closing Report'}
            >
              <Lock className="w-2.5 h-2.5 shrink-0" />
              <span>{isAr ? 'إغلاق' : 'EOD'}</span>
            </button>
          </div>
        )}
      </div>

      {/* PIN Gate Modal for protected tab navigation */}
      <PinGateModal
        isOpen={showPinModal}
        onClose={() => {
          setShowPinModal(false);
          setPendingTab(null);
        }}
        onSuccess={() => {
          if (pendingTab) {
            setCurrentTab(pendingTab);
            if (pendingTab === 'shifts' && sessionStorage.getItem('kadi_open_eod_modal') === '1') {
              window.setTimeout(() => {
                window.dispatchEvent(new CustomEvent('kadi:open-eod-closing'));
              }, 80);
            } else if (pendingTab === 'shifts' && sessionStorage.getItem('kadi_open_daily_report') === '1') {
              window.setTimeout(() => {
                window.dispatchEvent(new CustomEvent('kadi:open-daily-report'));
              }, 80);
            }
            setPendingTab(null);
          }
        }}
        title={
          pendingTab === 'inventory'
            ? (isAr ? 'المخزون محمي برقم سري' : 'Inventory Protected')
            : pendingTab === 'shifts'
            ? (isAr ? 'الصندوق محمي برقم سري' : 'Cash Drawer Protected')
            : (isAr ? 'الإعدادات محمية برقم سري' : 'Settings Protected')
        }
        description={
          isAr
            ? 'هذا القسم محمي بكلمة مرور. المرجو إدخال الرقم السري الخاص بالمدير (الافتراضي: 1234) للمتابعة.'
            : 'Manager authorization required. Enter PIN (Default: 1234).'
        }
      />
    </header>
  );
};
