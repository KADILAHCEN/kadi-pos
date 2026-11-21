import React from 'react';
import { AlertTriangle, CheckCircle2, Coins, Plus, Sparkles } from 'lucide-react';
import {
  detectCentimeChoices,
  evaluatePriceAlert,
  formatMoroccanPriceTranslation
} from '../../utils/priceAlerts';

interface PriceAlertAdvisorProps {
  costPrice: number;
  sellPrice: number;
  currencySymbol?: string;
  isAr?: boolean;
  onApplyChoice: (patch: { costPrice?: number; price?: number }) => void;
}

export const PriceAlertAdvisor: React.FC<PriceAlertAdvisorProps> = ({
  costPrice,
  sellPrice,
  currencySymbol = 'د.م',
  isAr = true,
  onApplyChoice
}) => {
  const safeCost = Number.isFinite(costPrice) && costPrice > 0 ? costPrice : 0;
  const safeSell = Number.isFinite(sellPrice) && sellPrice > 0 ? sellPrice : 0;

  const costTr = formatMoroccanPriceTranslation(safeCost);
  const sellTr = formatMoroccanPriceTranslation(safeSell);
  const { status, profit } = evaluatePriceAlert(safeCost, safeSell);
  const centimeChoice = detectCentimeChoices(safeCost, safeSell);

  if (safeCost === 0 && safeSell === 0) {
    return null;
  }

  const suggestedPrice = Number((safeCost + 1).toFixed(2));

  return (
    <div className="space-y-2.5 text-xs">
      {/* 1. Live Moroccan Currency Translation (درهم · سنتيم · ريال) */}
      <div className="p-3 rounded-xl bg-slate-100/90 dark:bg-slate-800/75 border border-slate-200 dark:border-slate-700 space-y-1.5">
        <div className="flex items-center gap-1.5 font-extrabold text-slate-700 dark:text-slate-200">
          <Coins className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span>{isAr ? 'الترجمة بالدرهم والسنتيم والريال:' : 'Moroccan Currency Breakdown:'}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] font-bold tabular-nums">
          {safeCost > 0 && (
            <div className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-200">
              <span className="text-slate-500 dark:text-slate-400">
                {isAr ? 'الشراء:' : 'Cost:'}{' '}
              </span>
              <span className="text-slate-900 dark:text-white">{costTr.dhLabel}</span>
              <span className="text-slate-400 mx-1">·</span>
              <span className="text-amber-700 dark:text-amber-300">{costTr.centimesLabel}</span>
              <span className="text-slate-400 mx-1">·</span>
              <span className="text-indigo-700 dark:text-indigo-300">{costTr.rialLabel}</span>
            </div>
          )}
          {safeSell > 0 && (
            <div className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-200">
              <span className="text-slate-500 dark:text-slate-400">
                {isAr ? 'البيع:' : 'Sell:'}{' '}
              </span>
              <span className="text-emerald-700 dark:text-emerald-300">{sellTr.dhLabel}</span>
              <span className="text-slate-400 mx-1">·</span>
              <span className="text-amber-700 dark:text-amber-300">{sellTr.centimesLabel}</span>
              <span className="text-slate-400 mx-1">·</span>
              <span className="text-indigo-700 dark:text-indigo-300">{sellTr.rialLabel}</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. "واش قصدتي؟" Centime / Decimal Disambiguation */}
      {centimeChoice && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-700 space-y-2">
          <div className="flex items-center gap-1.5 font-black text-amber-900 dark:text-amber-200">
            <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>{centimeChoice.prompt}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onApplyChoice(centimeChoice.option1Patch)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs transition-colors shadow-2xs"
            >
              {centimeChoice.option1Label}
            </button>
            <button
              type="button"
              onClick={() => onApplyChoice(centimeChoice.option2Patch)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-amber-300 dark:border-amber-700 text-slate-900 dark:text-white font-black text-xs transition-colors"
            >
              {centimeChoice.option2Label}
            </button>
          </div>
        </div>
      )}

      {/* 3. Non-Blocking Loss / Zero-Profit Alert + "واخا زيد درهم" */}
      {status === 'loss' && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/45 border-2 border-rose-400 dark:border-rose-700 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-black text-rose-800 dark:text-rose-200">
                  {isAr
                    ? `⚠️ راك كتبيع بالخسارة! (${profit.toFixed(2)} ${currencySymbol})`
                    : `⚠️ Selling at a loss (${profit.toFixed(2)} ${currencySymbol})`}
                </div>
                <div className="text-[11px] font-bold text-rose-700/90 dark:text-rose-300">
                  {isAr
                    ? 'تنبيه الأثمنة ما كيمنعكش من الحفظ، غير كيعلمك قبل ما تسجل.'
                    : 'Non-blocking price warning — you can still save or fix below.'}
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onApplyChoice({ price: suggestedPrice })}
            className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>
              {isAr
                ? `واخا زيد درهم (بيع بـ ${suggestedPrice} ${currencySymbol})`
                : `Add +1 ${currencySymbol} (${suggestedPrice} ${currencySymbol})`}
            </span>
          </button>
        </div>
      )}

      {status === 'zero_profit' && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/45 border-2 border-amber-400 dark:border-amber-700 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-black text-amber-900 dark:text-amber-200">
                {isAr
                  ? `⚠️ كتبيع بنفس ثمن الشراء (بلا ربح: 0.00 ${currencySymbol})`
                  : '⚠️ Zero profit: sell price equals cost price'}
              </div>
              <div className="text-[11px] font-bold text-amber-800/90 dark:text-amber-300">
                {isAr
                  ? 'ما كيمنعكش من التسجيل، غير كينبهك.'
                  : 'Non-blocking notice — you may still save or bump the price.'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onApplyChoice({ price: suggestedPrice })}
            className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>
              {isAr
                ? `واخا زيد درهم (بيع بـ ${suggestedPrice} ${currencySymbol})`
                : `Add +1 ${currencySymbol} (${suggestedPrice} ${currencySymbol})`}
            </span>
          </button>
        </div>
      )}

      {status === 'healthy' && safeCost > 0 && (
        <div className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/45 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-black flex items-center justify-between gap-2 tabular-nums">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{isAr ? 'مزيان! كاين ربح:' : 'Healthy profit:'}</span>
          </span>
          <span>
            +{profit.toFixed(2)} {currencySymbol}
          </span>
        </div>
      )}
    </div>
  );
};
