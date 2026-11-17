import React, { useState } from 'react';
import { usePos } from '../context/PosContext';
import {
  Sun,
  Moon,
  Globe,
  PauseCircle,
  Bell,
  Building2,
  ChevronDown,
  Check,
  Lock,
  Palette,
  Plus,
  MessageSquare,
  Mic,
  Monitor,
  ShieldAlert,
  Zap,
  Unlock,
  Ear
} from 'lucide-react';
import { PinGateModal } from './auth/PinGateModal';
import { KExecutivePanel } from './KExecutivePanel';
import { PWAInstallButton } from './pwa/PWAInstallButton';
import { POS_TAB_CATALOG, resolveTabVisual } from '../utils/tabCustomization';

export const Navbar: React.FC = () => {
  const {
    currentTab,
    setCurrentTab,
    currentShift,
    heldTickets,
    lowStockProducts,
    expiringSoonProducts,
    branches,
    activeBranch,
    setActiveBranchId,
    criticalLowStockProducts,
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
    remoteOrders,
    cpuAlerts,
    allPalettes,
    activePalette,
    selectPalette,
    unresolvedTheftAlerts,
    isSirenActive,
    currentEmergencySession,
    openEmergencySession,
    closeEmergencySession,
    shopEarRequests
  } = usePos();

  const arrivedShopEarCount = shopEarRequests.filter((r) => r.status === 'arrived').length;
  const pendingShopEarCount = shopEarRequests.filter((r) => r.status === 'pending').length;

  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const newRemoteOrdersCount = remoteOrders.filter((r) => r.status === 'new').length;

  const [showKPanel, setShowKPanel] = useState(false);
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

  const navItems = POS_TAB_CATALOG.filter((t) => t.showInTopNav !== false);

  return (
    <header className="sticky top-0 z-30 flex flex-nowrap items-center justify-between gap-2 xl:gap-3 px-2.5 sm:px-4 py-1.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors">
      {/* Zone 1: K Quick Overview Button, Wordmark, Always-Visible Red EOD Close Button & Branch Switcher */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 relative">
        <button
          type="button"
          onClick={() => {
            setShowKPanel((prev) => !prev);
            setShowBranchDropdown(false);
            setShowUserDropdown(false);
            setShowPaletteDropdown(false);
          }}
          aria-expanded={showKPanel}
          aria-label={isAr ? 'ملخص إدارة المخزون والمبلغ الإجمالي ونسبة الأرباح والأكثر مبيعاً' : 'Inventory, Total Sales, Profit & Best Sellers'}
          title={isAr ? 'إدارة المخزون، المبلغ الإجمالي، نسبة الأرباح والمنتوجات الأكثر مبيعاً' : 'Inventory, Total Sales, Profit % & Top Products'}
          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center font-extrabold text-sm sm:text-base shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 shrink-0 ${
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
            <span className="text-sm sm:text-base xl:text-lg font-bold tracking-tight text-slate-900 dark:text-white font-sans">
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
        <div className="relative hidden sm:block">
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
      <nav className="hidden lg:flex flex-1 min-w-0 items-center gap-1 overflow-x-auto py-0.5">
        {navItems.map((item) => {
          const { IconComponent, colorPreset } = resolveTabVisual(item.id, settings.tabCustomizations);
          const isActive = currentTab === item.id;
          const isProtected = isTabProtected(item.id);
          const label = isAr ? item.labelAr : isFr ? item.labelFr : item.labelEn;
          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? colorPreset.activeNavClass
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80'
              }`}
            >
              <IconComponent className={`w-3.5 h-3.5 shrink-0 ${isActive ? '' : colorPreset.iconTintClass}`} />
              <span>{label}</span>
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
      <div className="flex flex-nowrap items-center justify-end gap-1.5 sm:gap-2 shrink-0">
        {/* Alerts Center Button -> Navigates directly to in-app AlertsView page */}
        {(() => {
          const zakatAlertCount = zakatSummary.hasReachedNisab ? 1 : 0;
          const totalAlerts =
            lowStockProducts.length +
            expiringSoonProducts.length +
            zakatAlertCount +
            cpuAlerts.length +
            unresolvedTheftAlerts.length;
          const hasAlerts = totalAlerts > 0;
          const hasCritical = criticalLowStockProducts.length > 0;
          const alertsVisual = resolveTabVisual('alerts', settings.tabCustomizations);
          const AlertsIcon = alertsVisual.IconComponent;
          const isAlertsActive = currentTab === 'alerts';

          return (
            <button
              type="button"
              onClick={() => {
                setShowKPanel(false);
                setShowBranchDropdown(false);
                setShowUserDropdown(false);
                setShowPaletteDropdown(false);
                setCurrentTab('alerts');
              }}
              aria-current={isAlertsActive ? 'page' : undefined}
              className={`relative p-2 rounded-xl transition-all ${
                isAlertsActive
                  ? `${alertsVisual.colorPreset.activeNavClass} ${alertsVisual.colorPreset.ringClass}`
                  : hasCritical
                  ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 ring-2 ring-rose-400/25'
                  : hasAlerts
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 ring-2 ring-amber-400/20'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title={isAr ? `مركز التنبيهات (${totalAlerts})` : `Alerts Center (${totalAlerts})`}
            >
              <AlertsIcon className="w-4 h-4" />
              {hasAlerts && (
                <span className="absolute -top-1 -end-1 px-1.5 py-0.2 text-[9px] font-black bg-rose-500 text-white rounded-full shadow-xs tabular-nums">
                  {totalAlerts}
                </span>
              )}
            </button>
          );
        })()}

        {/* Held Orders quick trigger */}
        {heldTickets.length > 0 && (
          <button
            onClick={() => setCurrentTab('pos')}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors whitespace-nowrap shrink-0"
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
          <span
            className={`w-2 h-2 rounded-full ${
              currentShift.status === 'open'
                ? 'bg-emerald-500'
                : currentEmergencySession?.status === 'open'
                ? 'bg-amber-500'
                : 'bg-slate-400'
            }`}
          ></span>
          <span>
            {currentShift.status === 'open'
              ? isAr
                ? `وردية #${currentShift.shiftNumber}`
                : `Shift #${currentShift.shiftNumber}`
              : currentEmergencySession?.status === 'open'
              ? isAr
                ? `استعجالي (${currentEmergencySession.ordersCount})`
                : `Emergency (${currentEmergencySession.ordersCount})`
              : isAr
              ? 'الصندوق مسدود'
              : 'Drawer Closed'}
          </span>
        </button>

        {/* User Profile & Role Switcher */}
        <div className="relative hidden md:block">
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
          className="hidden sm:flex p-2 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors items-center gap-1"
          title={isAr ? 'تغيير اللغة' : 'Switch Language'}
        >
          <Globe className="w-4 h-4" />
          <span className="font-bold">{language === 'ar' ? 'EN' : 'عربي'}</span>
        </button>

        {/* App Palette Quick Switcher */}
        <div className="relative hidden md:block">
          <button
            type="button"
            onClick={() => {
              setShowPaletteDropdown((prev) => !prev);
              setShowBranchDropdown(false);
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
        <div className="hidden md:block">
          <PWAInstallButton variant="navbar" />
        </div>

        {/* Anti-Theft & Loss Prevention Security Center Button */}
        <button
          type="button"
          onClick={() => {
            setShowPaletteDropdown(false);
            setShowBranchDropdown(false);
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
              : 'hidden sm:inline-flex text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200/80 dark:border-rose-800/70 hover:bg-rose-100 dark:hover:bg-rose-900/50'
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
            setShowUserDropdown(false);
            setShowKPanel(false);
            window.dispatchEvent(new CustomEvent('kadi:open-customer-display'));
          }}
          aria-label={isAr ? 'شاشة عرض العميل' : 'Customer Display'}
          title={isAr ? 'شاشة عرض العميل (شاشة ثانية مباشرة)' : 'Customer Display (Dual Screen)'}
          className="hidden md:inline-flex p-2 rounded-lg text-sky-600 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/50 border border-sky-200/80 dark:border-sky-800/70 hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors"
        >
          <Monitor className="w-4 h-4" />
        </button>

        {/* Compact Top Shop Ear Trigger (ودن الحانوت) */}
        <button
          type="button"
          onClick={() => {
            setShowPaletteDropdown(false);
            setShowBranchDropdown(false);
            setShowUserDropdown(false);
            setShowKPanel(false);
            if (arrivedShopEarCount > 0) {
              handleTabClick('shop_ear');
            } else {
              window.dispatchEvent(new CustomEvent('kadi:open-shop-ear-modal'));
            }
          }}
          aria-label={isAr ? 'ودن الحانوت — السلعة المطلوبة' : 'Shop Ear'}
          title={
            isAr
              ? arrivedShopEarCount > 0
                ? `ودن الحانوت: ${arrivedShopEarCount} سلع جات كتسنى واتساب للزبناء`
                : `ودن الحانوت (${pendingShopEarCount} سلعة مطلوبة للجملة)`
              : 'Shop Ear'
          }
          className="relative p-2 rounded-lg text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/70 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors"
        >
          <Ear className="w-4 h-4" />
          {(arrivedShopEarCount > 0 || pendingShopEarCount > 0) && (
            <span
              className={`absolute -top-1 -end-1 px-1 py-0.2 text-[9px] font-black rounded-full tabular-nums ${
                arrivedShopEarCount > 0
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-500 text-slate-950'
              }`}
            >
              {arrivedShopEarCount > 0 ? arrivedShopEarCount : pendingShopEarCount}
            </span>
          )}
        </button>

        {/* Compact Top Voice Assistant Trigger */}
        <button
          type="button"
          onClick={() => {
            setShowPaletteDropdown(false);
            setShowBranchDropdown(false);
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
            setShowUserDropdown(false);
            setShowKPanel(false);
            window.dispatchEvent(new CustomEvent('kadi:toggle-ai-chat'));
          }}
          aria-label={isAr ? 'محادثة الذكاء الاصطناعي' : 'AI Chat'}
          title={isAr ? 'محادثة الذكاء الاصطناعي' : 'Quick AI Chat'}
          className="hidden sm:inline-flex relative p-2 rounded-lg text-violet-600 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/50 border border-violet-200/80 dark:border-violet-800/70 hover:bg-violet-100 dark:hover:bg-violet-900/60 transition-colors"
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
            {currentEmergencySession?.status === 'open' ? (
              <button
                type="button"
                onClick={() => closeEmergencySession()}
                className="flex items-center gap-1 px-2 py-0.5 text-[10px] leading-tight font-black rounded-md bg-rose-600 hover:bg-rose-700 text-white shadow-2xs transition-colors whitespace-nowrap shrink-0"
                title={isAr ? 'إغلاق الفتح الاستعجالي يدوياً' : 'Close Emergency Opening'}
              >
                <Lock className="w-2.5 h-2.5 shrink-0" />
                <span>{isAr ? 'إغلاق استعجالي' : 'End Emg.'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openEmergencySession()}
                className="flex items-center gap-1 px-2 py-0.5 text-[10px] leading-tight font-black rounded-md bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-2xs transition-colors whitespace-nowrap shrink-0"
                title={isAr ? 'فتح استعجالي للصندوق بلا مدة محدودة' : 'Emergency Open (No Timer)'}
              >
                <Zap className="w-2.5 h-2.5 shrink-0" />
                <span>{isAr ? 'فتح استعجالي' : 'Emergency'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowKPanel(false);
                handleTabClick('shifts');
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] leading-tight font-bold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors whitespace-nowrap shrink-0"
              title={isAr ? 'فتح الصندوق' : 'Open Drawer'}
            >
              <Unlock className="w-2.5 h-2.5 shrink-0" />
              <span>{isAr ? 'فتح' : 'Open'}</span>
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
