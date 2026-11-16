import React from 'react';
import {
  ShieldAlert,
  Siren,
  VolumeX,
  X,
  User,
  Clock,
  ExternalLink
} from 'lucide-react';
import { usePos } from '../../context/PosContext';
import { TheftAlertCategory } from '../../types';

const getCategoryBadgeLabel = (category: TheftAlertCategory, isAr: boolean): string => {
  switch (category) {
    case 'cash_discrepancy':
      return isAr ? 'عجز الصندوق' : 'Cash Shortage';
    case 'suspicious_payout':
      return isAr ? 'سحب نقدي مشبوه' : 'Large Pay-Out';
    case 'suspicious_refund':
      return isAr ? 'استرجاع مشبوه' : 'Suspicious Refund';
    case 'price_tampering':
      return isAr ? 'تلاعب في السعر/الخصم' : 'Price/Discount Override';
    case 'stock_shrinkage':
      return isAr ? 'عجز / إتلاف مخزون' : 'Stock Shrinkage';
    case 'cart_void':
      return isAr ? 'إلغاء فاتورة جارية' : 'Cart Voided';
    case 'manual_panic':
      return isAr ? 'إنذار سرقة طارئ (SOS)' : 'Emergency Theft SOS';
  }
};

export const TheftAlertOverlay: React.FC = () => {
  const {
    activeTheftToasts,
    dismissTheftToast,
    isSirenActive,
    stopActiveSecuritySiren,
    currencySymbol,
    language
  } = usePos();

  const isAr = language === 'ar';

  if (activeTheftToasts.length === 0 && !isSirenActive) return null;

  return (
    <div
      className="fixed top-16 left-1/2 -translate-x-1/2 z-[72] w-[calc(100vw-2rem)] sm:w-[490px] space-y-2 pointer-events-none"
      role="alert"
      aria-live="assertive"
      aria-label={isAr ? 'تنبيهات السرقة والأمان الفورية' : 'Real-Time Anti-Theft Alerts'}
    >
      {isSirenActive && (
        <div className="pointer-events-auto flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-rose-600 text-white border-2 border-rose-300 shadow-2xl animate-pulse">
          <div className="flex items-center gap-2.5">
            <Siren className="w-5 h-5 shrink-0" />
            <span className="text-xs font-black">
              {isAr ? '🚨 صافرة إنذار السرقة مفعّلة الآن!' : '🚨 Anti-Theft Siren Active!'}
            </span>
          </div>
          <button
            type="button"
            onClick={stopActiveSecuritySiren}
            className="px-3 py-1 rounded-xl bg-slate-950 hover:bg-slate-900 text-white text-[11px] font-black flex items-center gap-1.5 transition-colors shrink-0"
          >
            <VolumeX className="w-3.5 h-3.5" />
            <span>{isAr ? 'إيقاف الصافرة' : 'Silence Siren'}</span>
          </button>
        </div>
      )}

      {activeTheftToasts.map((alert) => {
        const isCritical = alert.severity === 'critical';
        return (
          <div
            key={alert.id}
            className={`pointer-events-auto rounded-2xl border-2 shadow-2xl p-4 backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-3 ${
              isCritical
                ? 'bg-rose-950/95 text-white border-rose-500 ring-4 ring-rose-500/30'
                : 'bg-slate-950/95 text-white border-amber-500 ring-2 ring-amber-500/25'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isCritical
                      ? 'bg-rose-600 text-white animate-pulse'
                      : 'bg-amber-500/25 text-amber-300 border border-amber-400/50'
                  }`}
                >
                  <ShieldAlert className="w-5 h-5" />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                        isCritical ? 'bg-rose-500 text-white' : 'bg-amber-400 text-slate-950'
                      }`}
                    >
                      {getCategoryBadgeLabel(alert.category, isAr)}
                    </span>
                    {alert.amountAtRisk !== undefined && alert.amountAtRisk > 0 && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black font-mono bg-white/15 text-rose-200 tabular-nums">
                        {alert.amountAtRisk.toFixed(2)} {currencySymbol}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-300 font-mono flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(alert.timestamp).toLocaleTimeString('ar-MA', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>

                  <h4 className="font-black text-xs sm:text-sm text-white mt-1.5 leading-snug">
                    {alert.title}
                  </h4>
                  <p className="text-[11px] text-slate-200 mt-1 leading-relaxed">
                    {alert.description}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] text-slate-300">
                    <span className="flex items-center gap-1 font-bold">
                      <User className="w-3 h-3 text-rose-300" />
                      {alert.actorName}
                    </span>
                    {alert.branchName && (
                      <span className="px-1.5 py-0.2 rounded bg-white/10 text-slate-200">
                        {alert.branchName}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => dismissTheftToast(alert.id)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                title={isAr ? 'إخفاء التنبيه المنبثق' : 'Dismiss popup'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('kadi:open-theft-security'));
                }}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-black flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{isAr ? 'فتح مركز تنبيهات السرقة والمراجعة' : 'Open Security Center'}</span>
              </button>

              {isSirenActive && (
                <button
                  type="button"
                  onClick={stopActiveSecuritySiren}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-[11px] font-bold flex items-center gap-1 transition-colors"
                >
                  <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                  <span>{isAr ? 'كتم الصافرة' : 'Mute Siren'}</span>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
