import React from 'react';
import { usePos } from '../../context/PosContext';
import { getT } from '../../utils/translations';
import { PauseCircle, Trash2, ArrowRight, ArrowLeft, X, ShoppingBag } from 'lucide-react';

interface HeldTicketsModalProps {
  onClose: () => void;
}

export const HeldTicketsModal: React.FC<HeldTicketsModalProps> = ({ onClose }) => {
  const {
    heldTickets,
    restoreHeldTicket,
    deleteHeldTicket,
    currencySymbol,
    language
  } = usePos();

  const t = getT(language);
  const isAr = language === 'ar';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <PauseCircle className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              {isAr ? 'الطلبات المعلقة' : 'Held Tickets'} ({heldTickets.length})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {heldTickets.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <ShoppingBag className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-xs font-semibold">{isAr ? 'لا توجد طلبات معلقة حالياً' : 'No held tickets'}</p>
            </div>
          ) : (
            heldTickets.map((tkt) => {
              const itemsCount = tkt.items.reduce((s, i) => s + i.quantity, 0);
              const totalAmount = tkt.items.reduce((s, i) => s + i.price * i.quantity, 0);

              return (
                <div
                  key={tkt.id}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                      {tkt.title}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {new Date(tkt.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {itemsCount} {isAr ? 'قطع' : 'items'}
                    </div>
                    <div className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                      {totalAmount.toFixed(2)} {currencySymbol}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => deleteHeldTicket(tkt.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                      title={isAr ? 'حذف' : 'Delete'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        restoreHeldTicket(tkt.id);
                        onClose();
                      }}
                      className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors shadow-sm"
                    >
                      {isAr ? 'استرجاع الطلب' : 'Restore'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
