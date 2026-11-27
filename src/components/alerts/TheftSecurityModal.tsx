import React, { useMemo, useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Siren,
  VolumeX,
  X,
  Lock,
  CheckCircle2,
  Trash2,
  SlidersHorizontal,
  BellRing,
  AlertTriangle,
  User,
  Clock,
  Send
} from 'lucide-react';
import { usePos } from '../../context/PosContext';
import { TheftAlertCategory, TheftAlertItem } from '../../types';
import { DEFAULT_THEFT_ALERT_SETTINGS } from '../../data/initialData';

interface TheftSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}

type StatusFilter = 'unresolved' | 'all' | 'critical' | 'acknowledged';

const CATEGORY_OPTIONS: { id: 'all' | TheftAlertCategory; ar: string; en: string }[] = [
  { id: 'all', ar: 'جميع الفئات', en: 'All Categories' },
  { id: 'manual_panic', ar: 'إنذار سرقة طارئ (SOS)', en: 'Emergency SOS' },
  { id: 'cash_discrepancy', ar: 'عجز الصندوق عند الإغلاق', en: 'Cash Drawer Shortage' },
  { id: 'suspicious_payout', ar: 'سحب نقدي كبير', en: 'Large Cash Pay-Out' },
  { id: 'suspicious_refund', ar: 'استرجاع فاتورة مشبوه', en: 'Suspicious Refund' },
  { id: 'price_tampering', ar: 'خصم مرتفع / تعديل سعر', en: 'Discount / Price Override' },
  { id: 'stock_shrinkage', ar: 'عجز / إتلاف مخزون', en: 'Stock Shrinkage' },
  { id: 'cart_void', ar: 'إفراغ / إلغاء فاتورة جارية', en: 'Cart Void' }
];

export const TheftSecurityModal: React.FC<TheftSecurityModalProps> = ({
  isOpen,
  onClose,
  onOpenSettings
}) => {
  const {
    theftAlerts,
    unresolvedTheftAlerts,
    isSirenActive,
    stopActiveSecuritySiren,
    triggerPanicTheftAlert,
    triggerTestTheftAlert,
    acknowledgeTheftAlert,
    acknowledgeAllTheftAlerts,
    clearAcknowledgedTheftAlerts,
    settings,
    currencySymbol,
    language,
    notificationPermission,
    requestNotificationPermission
  } = usePos();

  const isAr = language === 'ar';
  const theftCfg = {
    ...DEFAULT_THEFT_ALERT_SETTINGS,
    ...(settings.theftAlertSettings || {})
  };

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('unresolved');
  const [categoryFilter, setCategoryFilter] = useState<'all' | TheftAlertCategory>('all');
  const [panicNote, setPanicNote] = useState('');

  // Inline Manager PIN confirmation modal/panel inside Security Center
  const [pinPromptTarget, setPinPromptTarget] = useState<
    | { mode: 'single'; alertId: string }
    | { mode: 'all' }
    | null
  >(null);
  const [managerPinInput, setManagerPinInput] = useState('');
  const [resolutionNoteInput, setResolutionNoteInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const stats = useMemo(() => {
    const unresolved = unresolvedTheftAlerts.length;
    const critical = unresolvedTheftAlerts.filter((a) => a.severity === 'critical').length;
    const totalAtRisk = unresolvedTheftAlerts.reduce(
      (sum, a) => sum + (a.amountAtRisk || 0),
      0
    );
    return { unresolved, critical, totalAtRisk };
  }, [unresolvedTheftAlerts]);

  const filteredAlerts = useMemo(() => {
    return theftAlerts.filter((item) => {
      if (statusFilter === 'unresolved' && item.acknowledged) return false;
      if (statusFilter === 'acknowledged' && !item.acknowledged) return false;
      if (statusFilter === 'critical' && (item.severity !== 'critical' || item.acknowledged)) {
        return false;
      }
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      return true;
    });
  }, [theftAlerts, statusFilter, categoryFilter]);

  if (!isOpen) return null;

  const showTempFeedback = (msg: string) => {
    setFeedbackBanner(msg);
    window.setTimeout(() => setFeedbackBanner(null), 3500);
  };

  const handleAcknowledgeSingle = (item: TheftAlertItem) => {
    if (theftCfg.requireManagerPinToDismiss) {
      setPinPromptTarget({ mode: 'single', alertId: item.id });
      setManagerPinInput('');
      setResolutionNoteInput('');
      setPinError(null);
      return;
    }
    const res = acknowledgeTheftAlert(item.id);
    if (res.success) {
      showTempFeedback(isAr ? 'تم توثيق ومراجعة التنبيه بنجاح' : 'Alert acknowledged');
    }
  };

  const handleAcknowledgeAll = () => {
    if (unresolvedTheftAlerts.length === 0) return;
    if (theftCfg.requireManagerPinToDismiss) {
      setPinPromptTarget({ mode: 'all' });
      setManagerPinInput('');
      setResolutionNoteInput('');
      setPinError(null);
      return;
    }
    const res = acknowledgeAllTheftAlerts();
    if (res.success) {
      showTempFeedback(isAr ? 'تم اعتماد وإغلاق جميع التنبيهات' : 'All alerts resolved');
    }
  };

  const handleConfirmPinAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinPromptTarget) return;
    if (pinPromptTarget.mode === 'single') {
      const res = acknowledgeTheftAlert(
        pinPromptTarget.alertId,
        resolutionNoteInput,
        managerPinInput
      );
      if (!res.success) {
        setPinError(res.message || (isAr ? 'رمز غير صحيح' : 'Invalid PIN'));
        return;
      }
      setPinPromptTarget(null);
      showTempFeedback(isAr ? 'تم اعتماد المراجعة برمز المدير ✓' : 'Verified & acknowledged ✓');
    } else {
      const res = acknowledgeAllTheftAlerts(managerPinInput);
      if (!res.success) {
        setPinError(res.message || (isAr ? 'رمز غير صحيح' : 'Invalid PIN'));
        return;
      }
      setPinPromptTarget(null);
      showTempFeedback(isAr ? 'تم إغلاق جميع التنبيهات برمز المدير ✓' : 'All verified ✓');
    }
  };

  const getCategoryLabel = (cat: TheftAlertCategory) => {
    const found = CATEGORY_OPTIONS.find((c) => c.id === cat);
    return found ? (isAr ? found.ar : found.en) : cat;
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-l from-rose-950 via-slate-900 to-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-rose-600/90 border border-rose-400/50 flex items-center justify-center shadow-lg">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black flex items-center gap-2">
                <span>
                  {isAr
                    ? 'مركز تنبيهات السرقة وحماية الصندوق والمخزون'
                    : 'Anti-Theft & Loss Prevention Security Center'}
                </span>
                {theftCfg.enabled ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    {isAr ? 'مراقبة نشطة' : 'Active Shield'}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-700 text-slate-300">
                    {isAr ? 'متوقف مؤقتاً' : 'Paused'}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {isAr
                  ? 'رصد فوري لعجز الصندوق، السحوبات النقدية الكبيرة، الاسترجاعات، الخصومات المفرطة، وفقدان المخزون'
                  : 'Real-time detection of cash shortage, suspicious pay-outs, refunds, price tampering & shrinkage'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSirenActive && (
              <button
                type="button"
                onClick={stopActiveSecuritySiren}
                className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black flex items-center gap-1.5 animate-pulse transition-colors"
              >
                <VolumeX className="w-4 h-4" />
                <span>{isAr ? 'إيقاف الصافرة' : 'Stop Siren'}</span>
              </button>
            )}

            {onOpenSettings && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>{isAr ? 'حدود التنبيه' : 'Thresholds'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              aria-label={isAr ? 'إغلاق' : 'Close'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Emergency Panic Trigger Card */}
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/35 border border-rose-200 dark:border-rose-900/70 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Siren className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-rose-900 dark:text-rose-200">
                  {isAr ? 'زر إنذار السرقة والطوارئ الفوري (SOS)' : 'Instant Theft Panic Alarm (SOS)'}
                </h3>
                <p className="text-xs text-rose-700 dark:text-rose-300/90 mt-0.5">
                  {isAr
                    ? 'في حال الاشتباه في سرقة أو تلاعب مباشر، أطلق الصافرة وتوثيق الحادثة فوراً مع إشعار المتصفح.'
                    : 'Trigger an immediate siren, push notification & incident log when theft is suspected.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={panicNote}
                onChange={(e) => setPanicNote(e.target.value)}
                placeholder={isAr ? 'ملاحظة سريعة للحادثة (اختياري)...' : 'Optional note...'}
                className="px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white w-56 outline-none focus:ring-2 focus:ring-rose-500"
              />
              <button
                type="button"
                onClick={() => {
                  triggerPanicTheftAlert(panicNote);
                  setPanicNote('');
                  showTempFeedback(
                    isAr ? '🚨 تم إطلاق إنذار السرقة الفوري وتسجيله!' : '🚨 Emergency theft alarm triggered!'
                  );
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-1.5 shadow-md transition-colors"
              >
                <Siren className="w-4 h-4" />
                <span>{isAr ? 'إطلاق إنذار السرقة الآن' : 'Trigger Theft SOS'}</span>
              </button>

              <button
                type="button"
                onClick={() => void triggerTestTheftAlert()}
                className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950 text-xs font-bold transition-colors"
              >
                {isAr ? 'تجربة التنبيه' : 'Test Alert'}
              </button>
            </div>
          </div>

          {notificationPermission !== 'unsupported' && notificationPermission !== 'granted' && (
            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
                <BellRing className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {isAr
                    ? 'فعّل إشعارات الدفع (Push) لاستقبال تنبيهات السرقة حتى في الخلفية'
                    : 'Enable browser push notifications to receive theft alerts even in the background'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void requestNotificationPermission()}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-[11px] font-black shrink-0"
              >
                {isAr ? 'تفعيل الإشعارات' : 'Enable Push'}
              </button>
            </div>
          )}

          {feedbackBanner && (
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{feedbackBanner}</span>
            </div>
          )}

          {/* KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'تنبيهات بانتظار المراجعة' : 'Unresolved Alerts'}
              </div>
              <div className="text-2xl font-black font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-1">
                {stats.unresolved}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'حالات خطيرة جداً (Critical)' : 'Critical Incidents'}
              </div>
              <div className="text-2xl font-black font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1">
                {stats.critical}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'المبالغ المعرضة للخطر (غير مراجعة)' : 'Amount at Risk (Open)'}
              </div>
              <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                {stats.totalAtRisk.toFixed(2)}{' '}
                <span className="text-sm font-bold text-slate-500">{currencySymbol}</span>
              </div>
            </div>
          </div>

          {/* Inline Manager PIN Authorization Bar */}
          {pinPromptTarget && (
            <form
              onSubmit={handleConfirmPinAction}
              className="p-4 rounded-2xl bg-slate-900 text-white border border-rose-500/60 shadow-xl space-y-3 animate-in fade-in"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-black text-rose-300">
                  <Lock className="w-4 h-4" />
                  <span>
                    {pinPromptTarget.mode === 'all'
                      ? isAr
                        ? 'مطلوب رمز المدير السري لاعتماد وإغلاق جميع التنبيهات'
                        : 'Manager PIN required to resolve all alerts'
                      : isAr
                      ? 'مطلوب رمز المدير السري لتوثيق وإغلاق التنبيه'
                      : 'Manager PIN required to acknowledge alert'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPinPromptTarget(null)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  autoFocus
                  value={managerPinInput}
                  onChange={(e) => {
                    setManagerPinInput(e.target.value);
                    setPinError(null);
                  }}
                  placeholder={
                    !settings.managerPin || settings.managerPin === '1234'
                      ? isAr
                        ? 'رمز المدير (الافتراضي 1234)'
                        : 'Manager PIN (default 1234)'
                      : isAr
                      ? 'أدخل رمز المدير السري'
                      : 'Enter Manager PIN'
                  }
                  className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white font-mono w-48 outline-none focus:ring-2 focus:ring-rose-500"
                />
                {pinPromptTarget.mode === 'single' && (
                  <input
                    type="text"
                    value={resolutionNoteInput}
                    onChange={(e) => setResolutionNoteInput(e.target.value)}
                    placeholder={isAr ? 'ملاحظة / سبب التسوية (اختياري)...' : 'Resolution note (optional)...'}
                    className="flex-1 min-w-[180px] px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                )}
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isAr ? 'تأكيد وإغلاق' : 'Confirm & Resolve'}</span>
                </button>
              </div>
              {pinError && <div className="text-xs font-bold text-rose-400">{pinError}</div>}
            </form>
          )}

          {/* Filters & Bulk Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'unresolved', label: isAr ? `غير مراجعة (${unresolvedTheftAlerts.length})` : `Open (${unresolvedTheftAlerts.length})` },
                  { id: 'critical', label: isAr ? `خطيرة (${stats.critical})` : `Critical (${stats.critical})` },
                  { id: 'all', label: isAr ? `الكل (${theftAlerts.length})` : `All (${theftAlerts.length})` },
                  { id: 'acknowledged', label: isAr ? 'المؤكدة' : 'Resolved' }
                ] as { id: StatusFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    statusFilter === tab.id
                      ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as 'all' | TheftAlertCategory)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {isAr ? opt.ar : opt.en}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              {unresolvedTheftAlerts.length > 0 && (
                <button
                  type="button"
                  onClick={handleAcknowledgeAll}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isAr ? 'مراجعة الكل' : 'Resolve All'}</span>
                </button>
              )}

              {theftAlerts.some((a) => a.acknowledged) && (
                <button
                  type="button"
                  onClick={clearAcknowledgedTheftAlerts}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isAr ? 'مسح المؤكدة' : 'Clear Resolved'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Alerts List */}
          {filteredAlerts.length === 0 ? (
            <div className="p-10 text-center rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
              <ShieldCheck className="w-12 h-12 text-emerald-500 mx-auto mb-2 opacity-80" />
              <div className="text-sm font-black text-slate-800 dark:text-slate-100">
                {isAr ? 'الوضع آمن — لا توجد تنبيهات سرقة في هذا القسم' : 'All Clear — No Matching Security Alerts'}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {isAr
                  ? 'يراقب النظام تلقائياً عجز الصندوق، السحوبات النقدية، الخصومات، الاسترجاعات وتعديلات المخزون.'
                  : 'Automatic monitoring protects cash drawer, pay-outs, discounts, refunds and stock counts.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredAlerts.map((item) => {
                const isCritical = item.severity === 'critical';
                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-2xl border transition-colors ${
                      item.acknowledged
                        ? 'bg-slate-50/70 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800 opacity-80'
                        : isCritical
                        ? 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800'
                        : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/70'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                              item.acknowledged
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                : isCritical
                                ? 'bg-rose-600 text-white'
                                : 'bg-amber-500 text-slate-950'
                            }`}
                          >
                            {item.acknowledged
                              ? isAr
                                ? '✓ تمت المراجعة'
                                : '✓ Resolved'
                              : isCritical
                              ? isAr
                                ? 'خطير جداً'
                                : 'Critical'
                              : isAr
                              ? 'تنبيه اشتباه'
                              : 'High Risk'}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {getCategoryLabel(item.category)}
                          </span>
                          {item.amountAtRisk !== undefined && item.amountAtRisk > 0 && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-black font-mono tabular-nums bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300">
                              {item.amountAtRisk.toFixed(2)} {currencySymbol}
                            </span>
                          )}
                        </div>

                        <h4 className="font-black text-sm text-slate-900 dark:text-white">
                          {item.title}
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {item.description}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1 font-bold">
                            <User className="w-3.5 h-3.5" />
                            {item.actorName} ({item.actorRole})
                          </span>
                          {item.branchName && (
                            <span>• {item.branchName}</span>
                          )}
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="w-3.5 h-3.5" />
                            {new Date(item.timestamp).toLocaleString('ar-MA')}
                          </span>
                        </div>

                        {item.acknowledged && (
                          <div className="mt-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                            {isAr
                              ? `اعتمدها: ${item.acknowledgedBy || 'المدير'} — ${
                                  item.acknowledgedAt
                                    ? new Date(item.acknowledgedAt).toLocaleString('ar-MA')
                                    : ''
                                }${item.resolutionNote ? ` (${item.resolutionNote})` : ''}`
                              : `Resolved by ${item.acknowledgedBy || 'Manager'}`}
                          </div>
                        )}
                      </div>

                      {!item.acknowledged && (
                        <button
                          type="button"
                          onClick={() => handleAcknowledgeSingle(item)}
                          className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 shrink-0 transition-colors"
                        >
                          {theftCfg.requireManagerPinToDismiss ? (
                            <Lock className="w-3.5 h-3.5" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          )}
                          <span>{isAr ? 'مراجعة وإغلاق' : 'Verify & Resolve'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
