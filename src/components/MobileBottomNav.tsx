import React, { useState } from 'react';
import {
  Bell,
  Building2,
  Check,
  Globe,
  Grid,
  Lock,
  MessageSquare,
  Mic,
  Monitor,
  Moon,
  ShieldAlert,
  Sun,
  X,
  Zap
} from 'lucide-react';
import { AppTabId, usePos } from '../context/PosContext';
import { POS_TAB_CATALOG, resolveTabVisual } from '../utils/tabCustomization';
import { PWAInstallButton } from './pwa/PWAInstallButton';

interface MobileBottomNavProps {
  onSelectProtectedTab: (tab: AppTabId) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ onSelectProtectedTab }) => {
  const {
    currentTab,
    heldTickets,
    remoteOrders,
    cpuAlerts,
    lowStockProducts,
    expiringSoonProducts,
    zakatSummary,
    unresolvedTheftAlerts,
    isTabProtected,
    settings,
    language,
    toggleLanguage,
    isDark,
    toggleTheme,
    branches,
    activeBranch,
    setActiveBranchId,
    users,
    currentUser,
    setCurrentUserId,
    currentShift,
    currentEmergencySession,
    openEmergencySession,
    closeEmergencySession
  } = usePos();

  const [showMoreSheet, setShowMoreSheet] = useState(false);

  const isAr = language === 'ar';
  const isFr = language === 'fr';
  const customizations = settings.tabCustomizations;

  const newRemoteOrdersCount = remoteOrders.filter((r) => r.status === 'new').length;
  const totalAlertsCount =
    lowStockProducts.length +
    expiringSoonProducts.length +
    (zakatSummary.hasReachedNisab ? 1 : 0) +
    cpuAlerts.length +
    unresolvedTheftAlerts.length;

  const primaryTabs: AppTabId[] = ['pos', 'inventory', 'customers', 'orders'];
  const isMoreTabActive = !primaryTabs.includes(currentTab);

  const navigateTab = (tabId: AppTabId) => {
    setShowMoreSheet(false);
    onSelectProtectedTab(tabId);
  };

  return (
    <>
      {/* Compact Centered Mobile Bottom Tab Bar (<1024px) */}
      <nav
        aria-label={isAr ? 'التنقل السريع للهاتف' : 'Mobile Navigation'}
        className="lg:hidden fixed bottom-2 left-1/2 -translate-x-1/2 z-40 w-[min(90vw,310px)] h-[52px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl px-1 flex items-center justify-around gap-0.5 shadow-xl"
      >
        {primaryTabs.map((tabId) => {
          const { definition, IconComponent, colorPreset } = resolveTabVisual(tabId, customizations);
          const isActive = currentTab === tabId;
          const isProtected = isTabProtected(tabId);
          const label = isAr
            ? definition.shortLabelAr
            : isFr
            ? definition.shortLabelFr
            : definition.shortLabelEn;

          return (
            <button
              key={tabId}
              type="button"
              onClick={() => navigateTab(tabId)}
              className={`relative flex-1 min-h-[44px] py-1 px-0.5 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive
                  ? `${colorPreset.mobileActiveBgClass} ${colorPreset.mobileActiveTextClass} font-extrabold`
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold'
              }`}
            >
              <div className="relative">
                <IconComponent className="w-4 h-4" />
                {isProtected && (
                  <Lock className="w-2.5 h-2.5 text-amber-500 absolute -top-1 -end-1.5" />
                )}
                {tabId === 'pos' && heldTickets.length > 0 && (
                  <span className="absolute -top-1.5 -end-2.5 px-1 min-w-[14px] h-3.5 flex items-center justify-center rounded-full bg-amber-500 text-white text-[8px] font-black tabular-nums">
                    {heldTickets.length}
                  </span>
                )}
              </div>
              <span className="text-[9px] leading-tight whitespace-nowrap truncate max-w-full">
                {label}
              </span>
            </button>
          );
        })}

        {/* 5th Slot: "More" Drawer Sheet */}
        <button
          type="button"
          onClick={() => setShowMoreSheet(true)}
          className={`relative flex-1 min-h-[44px] py-1 px-0.5 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
            isMoreTabActive || showMoreSheet
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-extrabold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold'
          }`}
        >
          <div className="relative">
            <Grid className="w-4 h-4" />
            {(newRemoteOrdersCount > 0 || totalAlertsCount > 0) && (
              <span className="absolute -top-1 -end-1.5 w-2 h-2 rounded-full bg-rose-500 border border-white dark:border-slate-900" />
            )}
          </div>
          <span className="text-[9px] leading-tight whitespace-nowrap">
            {isAr ? 'المزيد' : isFr ? 'Plus' : 'More'}
          </span>
        </button>
      </nav>

      {/* Mobile "More" Bottom Sheet (All Tabs + Quick Tools) */}
      {showMoreSheet && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowMoreSheet(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-h-[86vh] bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
          >
            {/* Bottom Sheet Drag Handle */}
            <div className="pt-2.5 pb-1 flex justify-center shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>

            {/* Header */}
            <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  {isAr ? 'جميع أقسام kadi pos' : isFr ? 'Tous les modules' : 'All kadi pos Modules'}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {activeBranch.name} · {currentUser.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMoreSheet(false)}
                className="min-w-[40px] min-h-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center"
                aria-label={isAr ? 'إغلاق' : 'Close'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-8">
              {/* All Customized Tabs Grid */}
              <div className="grid grid-cols-3 gap-2.5">
                {POS_TAB_CATALOG.map((tab) => {
                  const tabId = tab.id as AppTabId;
                  const { IconComponent, colorPreset } = resolveTabVisual(tabId, customizations);
                  const isActive = currentTab === tabId;
                  const isProtected = isTabProtected(tabId);
                  const label = isAr ? tab.shortLabelAr : isFr ? tab.shortLabelFr : tab.shortLabelEn;

                  return (
                    <button
                      key={tabId}
                      type="button"
                      onClick={() => navigateTab(tabId)}
                      className={`relative min-h-[76px] p-2.5 rounded-2xl border flex flex-col items-center justify-center gap-1.5 text-center transition-all ${
                        isActive
                          ? `${colorPreset.activeNavClass} ${colorPreset.ringClass}`
                          : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span
                        className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                          isActive ? colorPreset.badgeSolidClass : colorPreset.softCardClass
                        } border`}
                      >
                        <IconComponent className="w-4 h-4" />
                      </span>
                      <span className="text-[11px] font-extrabold leading-tight line-clamp-1">
                        {label}
                      </span>

                      {tabId === 'bourse' && (
                        <span className="absolute top-2 start-2 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                      )}
                      {isProtected && (
                        <Lock className="w-3 h-3 text-amber-500 absolute top-2 end-2" />
                      )}
                      {tabId === 'remote_sales' && newRemoteOrdersCount > 0 && (
                        <span className="absolute top-1.5 start-1.5 px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-black">
                          {newRemoteOrdersCount}
                        </span>
                      )}
                      {tabId === 'alerts' && totalAlertsCount > 0 && (
                        <span className="absolute top-1.5 start-1.5 px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-black">
                          {totalAlertsCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Quick Tools Row */}
              <div className="space-y-2">
                <div className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400">
                  {isAr ? 'أدوات سريعة' : 'Quick Tools'}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreSheet(false);
                      window.dispatchEvent(new CustomEvent('kadi:toggle-voice-assistant'));
                    }}
                    className="min-h-[44px] px-3 py-2 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold flex items-center gap-2"
                  >
                    <Mic className="w-4 h-4 shrink-0" />
                    <span className="truncate">{isAr ? 'التسجيل الصوتي' : 'Voice POS'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreSheet(false);
                      window.dispatchEvent(new CustomEvent('kadi:toggle-ai-chat'));
                    }}
                    className="min-h-[44px] px-3 py-2 rounded-2xl bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800/70 text-violet-700 dark:text-violet-300 text-xs font-extrabold flex items-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4 shrink-0" />
                    <span className="truncate">{isAr ? 'محادثة AI' : 'AI Chat'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreSheet(false);
                      window.dispatchEvent(new CustomEvent('kadi:open-theft-security'));
                    }}
                    className="min-h-[44px] px-3 py-2 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 text-rose-700 dark:text-rose-300 text-xs font-extrabold flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span className="truncate">{isAr ? 'تنبيهات السرقة' : 'Anti-Theft'}</span>
                    </span>
                    {unresolvedTheftAlerts.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-black">
                        {unresolvedTheftAlerts.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreSheet(false);
                      window.dispatchEvent(new CustomEvent('kadi:open-customer-display'));
                    }}
                    className="min-h-[44px] px-3 py-2 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/70 text-sky-700 dark:text-sky-300 text-xs font-extrabold flex items-center gap-2"
                  >
                    <Monitor className="w-4 h-4 shrink-0" />
                    <span className="truncate">{isAr ? 'شاشة العميل' : 'Customer Screen'}</span>
                  </button>
                </div>
              </div>

              {/* Branch & User Quick Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-2">
                  <div className="text-[11px] font-extrabold text-slate-500 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{isAr ? 'الفرع النشط:' : 'Active Branch:'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {branches.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setActiveBranchId(b.id)}
                        className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 border ${
                          b.id === activeBranch.id
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {b.id === activeBranch.id && <Check className="w-3 h-3" />}
                        <span>{b.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-2">
                  <div className="text-[11px] font-extrabold text-slate-500">
                    {isAr ? 'تبديل المستخدم:' : 'Switch User:'}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {users.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setCurrentUserId(u.id)}
                        className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 border ${
                          u.id === currentUser.id
                            ? 'bg-slate-900 dark:bg-emerald-600 text-white border-transparent'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <span>{u.avatar || '👤'}</span>
                        <span>{u.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Theme, Language, Alerts, PWA, EOD */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="min-h-[44px] flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-2"
                >
                  {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
                  <span>{isDark ? (isAr ? 'الوضع الفاتح' : 'Light Mode') : isAr ? 'الوضع الليلي' : 'Dark Mode'}</span>
                </button>

                <button
                  type="button"
                  onClick={toggleLanguage}
                  className="min-h-[44px] flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-2"
                >
                  <Globe className="w-4 h-4" />
                  <span>{language === 'ar' ? 'English' : 'العربية'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigateTab('alerts')}
                  className="min-h-[44px] flex-1 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Bell className="w-4 h-4" />
                  <span>{isAr ? `التنبيهات (${totalAlertsCount})` : `Alerts (${totalAlertsCount})`}</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <PWAInstallButton variant="navbar" />
                {currentShift.status === 'open' ? (
                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.setItem('kadi_open_eod_modal', '1');
                      navigateTab('shifts');
                      window.setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('kadi:open-eod-closing'));
                      }, 60);
                    }}
                    className="min-h-[44px] flex-1 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center justify-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{isAr ? 'إغلاق صندوق آخر النهار' : 'End-of-Day Close'}</span>
                  </button>
                ) : currentEmergencySession?.status === 'open' ? (
                  <button
                    type="button"
                    onClick={() => {
                      closeEmergencySession();
                      setShowMoreSheet(false);
                    }}
                    className="min-h-[44px] flex-1 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center justify-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{isAr ? 'إغلاق الفتح الاستعجالي' : 'Close Emergency'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      openEmergencySession();
                      setShowMoreSheet(false);
                    }}
                    className="min-h-[44px] flex-1 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>{isAr ? 'فتح استعجالي (بلا مدة)' : 'Emergency Open'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
