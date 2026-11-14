import React from 'react';
import { AlertTriangle, BellRing, Boxes, PackagePlus, Siren, X } from 'lucide-react';
import { usePos } from '../../context/PosContext';

interface StockAlertOverlayProps {
  onNavigateInventory: () => void;
}

export const StockAlertOverlay: React.FC<StockAlertOverlayProps> = ({ onNavigateInventory }) => {
  const {
    activeLowStockToasts,
    dismissLowStockToast,
    dismissAllLowStockToasts,
    adjustStock,
    notificationPermission,
    requestNotificationPermission,
    language
  } = usePos();

  const isAr = language === 'ar';
  const isFr = language === 'fr';

  if (activeLowStockToasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-20 lg:bottom-5 end-4 z-[65] w-[calc(100vw-2rem)] sm:w-[390px] space-y-2.5 pointer-events-none"
      role="region"
      aria-live="assertive"
      aria-label={isAr ? 'تنبيهات انخفاض المخزون الفورية' : 'Real-time Low Stock Alerts'}
    >
      {activeLowStockToasts.length > 1 && (
        <div className="pointer-events-auto flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-900/95 text-white border border-slate-700 shadow-lg text-[11px] font-bold">
          <span>
            {isAr
              ? `${activeLowStockToasts.length} تنبيهات مخزون فورية`
              : `${activeLowStockToasts.length} active stock alerts`}
          </span>
          <button
            type="button"
            onClick={dismissAllLowStockToasts}
            className="text-amber-300 hover:text-white font-black transition-colors"
          >
            {isAr ? 'إغلاق الكل' : 'Dismiss all'}
          </button>
        </div>
      )}

      {activeLowStockToasts.map((item) => {
        const isOut = item.severity === 'out_of_stock';
        const isCritical = item.severity === 'critical';
        const ratio = item.threshold > 0 ? Math.min(100, Math.round((item.stock / item.threshold) * 100)) : 0;

        return (
          <div
            key={item.productId}
            className={`pointer-events-auto rounded-2xl border shadow-2xl p-3.5 backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-3 ${
              isOut
                ? 'bg-rose-950/95 text-white border-rose-500/80 ring-2 ring-rose-500/30'
                : isCritical
                ? 'bg-slate-950/95 text-white border-rose-500/60 ring-2 ring-rose-400/20'
                : 'bg-slate-900/95 text-white border-amber-500/70 ring-2 ring-amber-400/20'
            }`}
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2.5 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    isOut
                      ? 'bg-rose-600 text-white animate-pulse'
                      : isCritical
                      ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40'
                      : 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  {isOut ? <Siren className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase ${
                        isOut
                          ? 'bg-rose-500 text-white'
                          : isCritical
                          ? 'bg-rose-600/90 text-white'
                          : 'bg-amber-500 text-slate-950'
                      }`}
                    >
                      {isOut
                        ? isAr
                          ? 'نفذ المخزون (0)'
                          : 'Out of Stock'
                        : isCritical
                        ? isAr
                          ? 'نفاد حرج'
                          : 'Critical'
                        : isAr
                        ? 'أقل من الحد الأدنى'
                        : isFr
                        ? 'Stock Faible'
                        : 'Low Stock'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(item.triggeredAt).toLocaleTimeString('ar-MA', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>

                  <h4 className="font-black text-xs text-white truncate mt-1">{item.name}</h4>

                  <p className="text-[11px] text-slate-300 mt-0.5 tabular-nums">
                    {isAr ? 'الرصيد المتبقي:' : 'Remaining:'}{' '}
                    <span className={`font-black font-mono ${isOut || isCritical ? 'text-rose-300' : 'text-amber-300'}`}>
                      {item.stock}
                    </span>{' '}
                    / {isAr ? 'حد الطلب:' : 'Min:'}{' '}
                    <span className="font-bold font-mono">{item.threshold}</span>{' '}
                    {item.unitType || ''}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => dismissLowStockToast(item.productId)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                title={isAr ? 'إغلاق التنبيه' : 'Dismiss'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Stock ratio progress bar */}
            <div className="mt-2.5 w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isOut || isCritical ? 'bg-rose-500' : 'bg-amber-400'
                }`}
                style={{ width: `${Math.max(4, ratio)}%` }}
              />
            </div>

            {/* Quick actions directly inside toast */}
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    adjustStock(item.productId, 10, 'توريد سريع من إشعار انخفاض المخزون', 'restock');
                    dismissLowStockToast(item.productId);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black flex items-center gap-1 transition-colors"
                >
                  <PackagePlus className="w-3 h-3" />
                  <span>+10 {isAr ? 'توريد' : 'Restock'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onNavigateInventory();
                    dismissLowStockToast(item.productId);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold flex items-center gap-1 transition-colors"
                >
                  <Boxes className="w-3 h-3" />
                  <span>{isAr ? 'المخزون' : 'Inventory'}</span>
                </button>
              </div>

              {notificationPermission === 'default' && (
                <button
                  type="button"
                  onClick={() => void requestNotificationPermission()}
                  className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-[10px] font-bold flex items-center gap-1 transition-colors"
                >
                  <BellRing className="w-3 h-3" />
                  <span>{isAr ? 'تفعيل Push' : 'Enable Push'}</span>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
