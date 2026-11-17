import React, { useEffect, useMemo, useState } from 'react';
import { usePos } from '../../context/PosContext';
import { Sparkles, Target, TrendingUp, ArrowUpRight, X, Flame, CheckCircle2 } from 'lucide-react';
import { DEFAULT_DAILY_FIXED_EXPENSES, getMarketModeMeta } from '../../utils/bourseEngine';

interface DreamGoalConfig {
  title: string;
  targetAmount: number;
  initialSaved: number;
}

const DEFAULT_DREAM_CONFIG: DreamGoalConfig = {
  title: 'تكبير المحال وتطوير المشروع',
  targetAmount: 100000,
  initialSaved: 0
};

const readDreamConfig = (): DreamGoalConfig => {
  try {
    const saved = localStorage.getItem('kadi_pos_dream_goal_v1');
    return saved ? { ...DEFAULT_DREAM_CONFIG, ...JSON.parse(saved) } : DEFAULT_DREAM_CONFIG;
  } catch {
    return DEFAULT_DREAM_CONFIG;
  }
};

interface SmartDreamGoalBannerProps {
  variant?: 'compact' | 'dashboard';
  onDismiss?: () => void;
}

export const SmartDreamGoalBanner: React.FC<SmartDreamGoalBannerProps> = ({
  variant = 'compact',
  onDismiss
}) => {
  const {
    orders,
    expenses,
    products,
    settings,
    currencySymbol,
    language,
    setCurrentTab
  } = usePos();

  const isAr = language === 'ar';
  const [dreamConfig, setDreamConfig] = useState<DreamGoalConfig>(readDreamConfig);

  useEffect(() => {
    const syncDream = () => setDreamConfig(readDreamConfig());
    window.addEventListener('kadi:dream-updated', syncDream);
    window.addEventListener('storage', syncDream);
    return () => {
      window.removeEventListener('kadi:dream-updated', syncDream);
      window.removeEventListener('storage', syncDream);
    };
  }, []);

  const monthlyTarget = Math.max(100, Number(settings.monthlyProfitTarget) || 10000);

  const metrics = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 86_400_000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let todaySales = 0;
    let todayProfit = 0;
    let weekSales = 0;
    let weekProfit = 0;
    let monthSales = 0;
    let monthProfit = 0;
    let allTimeProfit = 0;
    let allTimeSales = 0;

    const prodCostMap = new Map<string, number>();
    products.forEach((p) => prodCostMap.set(p.id, Number(p.costPrice) || 0));
    const modeMeta = getMarketModeMeta(settings.marketMode || 'normal');
    const costShock = modeMeta.costShockFactor;

    orders.forEach((o) => {
      if (o.status !== 'completed') return;
      const ms = new Date(o.date).getTime();
      if (Number.isNaN(ms)) return;
      const liveCost =
        o.items && o.items.length > 0
          ? o.items.reduce(
              (s, it) => s + (prodCostMap.get(it.productId) ?? (Number(it.costPrice) || 0)) * costShock * (Number(it.quantity) || 0),
              0
            )
          : (Number(o.costTotal) || 0) * costShock;
      const profit = o.grandTotal - liveCost;

      allTimeSales += o.grandTotal;
      allTimeProfit += profit;

      if (ms >= todayStart) {
        todaySales += o.grandTotal;
        todayProfit += profit;
      }
      if (ms >= weekStart) {
        weekSales += o.grandTotal;
        weekProfit += profit;
      }
      if (ms >= monthStart) {
        monthSales += o.grandTotal;
        monthProfit += profit;
      }
    });

    const fixedDaily =
      Math.max(0, Number(settings.dailyFixedExpenses?.rentPerDay ?? DEFAULT_DAILY_FIXED_EXPENSES.rentPerDay) || 0) +
      Math.max(0, Number(settings.dailyFixedExpenses?.electricityPerDay ?? DEFAULT_DAILY_FIXED_EXPENSES.electricityPerDay) || 0) +
      Math.max(0, Number(settings.dailyFixedExpenses?.internetPerDay ?? DEFAULT_DAILY_FIXED_EXPENSES.internetPerDay) || 0) +
      Math.max(0, Number(settings.dailyFixedExpenses?.transportPerDay ?? DEFAULT_DAILY_FIXED_EXPENSES.transportPerDay) || 0) +
      Math.max(0, Number(settings.dailyFixedExpenses?.otherPerDay ?? DEFAULT_DAILY_FIXED_EXPENSES.otherPerDay) || 0);

    let todayExpenses = fixedDaily;
    let weekExpenses = fixedDaily * 7;
    let monthExpenses = fixedDaily * 30;
    let allTimeExpenses = fixedDaily * 30;

    expenses.forEach((exp) => {
      const ms = new Date(exp.date || exp.createdAt).getTime();
      if (Number.isNaN(ms)) return;
      allTimeExpenses += exp.amount;
      if (ms >= todayStart) todayExpenses += exp.amount;
      if (ms >= weekStart) weekExpenses += exp.amount;
      if (ms >= monthStart) monthExpenses += exp.amount;
    });

    const subsPct = Math.max(0, Number(settings.subscriptionsSalesPct ?? 3)) / 100;
    const todayNet = Number((todayProfit - todayExpenses - todaySales * subsPct).toFixed(2));
    const weekNet = Number((weekProfit - weekExpenses - weekSales * subsPct).toFixed(2));
    const monthNet = Number((monthProfit - monthExpenses - monthSales * subsPct).toFixed(2));
    const allTimeNet = Math.max(0, Number((allTimeProfit - allTimeExpenses - allTimeSales * subsPct).toFixed(2)));

    // Effective Gross Margin Ratio from actual POS history or catalog average
    const catalogAvgMargin =
      products.length > 0
        ? products.reduce((s, p) => s + (p.price > 0 ? (p.price - p.costPrice * costShock) / p.price : 0), 0) /
          products.length
        : 0.22;
    const rawMarginRatio =
      monthSales > 0 && monthProfit > 0
        ? monthProfit / monthSales
        : allTimeSales > 0 && allTimeProfit > 0
        ? allTimeProfit / allTimeSales
        : catalogAvgMargin;
    const safeMarginRatio = Math.min(0.85, Math.max(0.08, rawMarginRatio || 0.22));

    // Weekly Profit & Sales Goal (scaled cleanly from monthly goal)
    const weeklyProfitTarget = Math.max(50, Math.round(monthlyTarget / 4.33));
    const weeklySalesTarget = Math.ceil(weeklyProfitTarget / safeMarginRatio);
    const remainingWeeklySales = Math.max(0, Math.ceil(weeklySalesTarget - weekSales));
    const weeklyPct = Math.min(100, Math.round((Math.max(0, weekSales) / weeklySalesTarget) * 100));

    // Monthly Remaining & Required Daily Sales Goal
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeftInMonth = Math.max(1, daysInMonth - now.getDate() + 1);
    const remainingMonthlyProfit = Math.max(0, Number((monthlyTarget - monthNet).toFixed(2)));
    const monthlyPct = Math.min(100, Math.round((Math.max(0, monthNet) / monthlyTarget) * 100));
    const dailyProfitTarget = Number((remainingMonthlyProfit / daysLeftInMonth).toFixed(2));
    const dailySalesTarget = dailyProfitTarget > 0 ? Math.ceil(dailyProfitTarget / safeMarginRatio) : 0;
    const remainingTodaySales = Math.max(0, Math.ceil(dailySalesTarget - todaySales));
    const dailyPct =
      dailySalesTarget > 0
        ? Math.min(100, Math.round((Math.max(0, todaySales) / dailySalesTarget) * 100))
        : 100;

    // Long-Term Dream Progress
    const totalSavedTowardDream = Number((dreamConfig.initialSaved + allTimeNet).toFixed(2));
    const dreamPct =
      dreamConfig.targetAmount > 0
        ? Math.min(100, Math.round((totalSavedTowardDream / dreamConfig.targetAmount) * 100))
        : 0;

    // Top-margin in-stock item recommendation for proactive upsell tip
    const topUpsellProduct = products
      .filter((p) => p.stock > 0 && p.price > p.costPrice)
      .sort((a, b) => (b.price - b.costPrice) - (a.price - a.costPrice))[0];

    // Proactive Tip Message
    let proactiveTip = '';
    let tipTone: 'encourage' | 'on_track' | 'goal_met' = 'encourage';

    if (remainingMonthlyProfit <= 0) {
      tipTone = 'goal_met';
      proactiveTip = isAr
        ? `مبروك! حققتي الهدف الشهري (${monthlyTarget.toLocaleString('en-US')} ${currencySymbol}) — كل بيعة دابا كتقرّبك لحلم "${dreamConfig.title}"!`
        : `Monthly target reached! Every extra sale boosts your "${dreamConfig.title}" dream.`;
    } else if (remainingWeeklySales > 0 && remainingWeeklySales <= dailySalesTarget * 1.6) {
      tipTone = 'encourage';
      proactiveTip = isAr
        ? `بيع ${remainingWeeklySales.toLocaleString('en-US')} ${currencySymbol} إضافية اليوم للوصول لهدفك الأسبوعي (${weeklyPct}% مكتمل)!`
        : `Sell ${remainingWeeklySales.toLocaleString('en-US')} ${currencySymbol} more today to hit your weekly target (${weeklyPct}% done)!`;
    } else if (remainingTodaySales > 0) {
      tipTone = 'encourage';
      proactiveTip = isAr
        ? `باقي ليك ${remainingTodaySales.toLocaleString('en-US')} ${currencySymbol} فمبيعات اليوم باش تكمل هدف اليوم (${dailyPct}%) وتوصل للهدف الشهري.`
        : `Sell ${remainingTodaySales.toLocaleString('en-US')} ${currencySymbol} more today to stay on daily pace (${dailyPct}%).`;
    } else {
      tipTone = 'on_track';
      proactiveTip = isAr
        ? `أداء ممتاز اليوم! وصلتي لهدف اليوم (${todaySales.toFixed(0)} ${currencySymbol})${
            topUpsellProduct
              ? ` · ركّز على "${topUpsellProduct.name}" (+${(topUpsellProduct.price - topUpsellProduct.costPrice).toFixed(0)} ${currencySymbol} ربح/وحدة)`
              : ''
          }`
        : `Great pace today! You hit today's target (${todaySales.toFixed(0)} ${currencySymbol}).`;
    }

    return {
      todaySales,
      todayNet,
      weekSales,
      weekNet,
      weeklySalesTarget,
      weeklyPct,
      remainingWeeklySales,
      monthNet,
      monthlyPct,
      dailySalesTarget,
      remainingTodaySales,
      dailyPct,
      dreamPct,
      totalSavedTowardDream,
      proactiveTip,
      tipTone,
      topUpsellProduct
    };
  }, [
    orders,
    expenses,
    products,
    dreamConfig,
    monthlyTarget,
    settings.subscriptionsSalesPct,
    settings.dailyFixedExpenses,
    settings.marketMode,
    currencySymbol,
    isAr
  ]);

  if (variant === 'compact') {
    return (
      <div className="bg-slate-900 dark:bg-slate-950 border-b border-amber-500/30 text-white px-2.5 sm:px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className={`p-1 rounded-md shrink-0 ${
              metrics.tipTone === 'goal_met'
                ? 'bg-emerald-500 text-slate-950'
                : metrics.tipTone === 'on_track'
                ? 'bg-amber-400 text-slate-950'
                : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
            }`}
          >
            {metrics.tipTone === 'goal_met' ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
          </span>

          {/* Daily Goal Mini Progress Pill */}
          <div className="hidden md:flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 rounded-lg px-2 py-0.5 shrink-0">
            <span className="text-[10px] font-bold text-slate-300">
              {isAr ? 'هدف اليوم:' : 'Today:'}
            </span>
            <div className="w-16 h-1.5 rounded-full bg-slate-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  metrics.dailyPct >= 100 ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
                style={{ width: `${metrics.dailyPct}%` }}
              />
            </div>
            <span className="font-mono tabular-nums font-black text-[10px] text-amber-300">
              {metrics.dailyPct}%
            </span>
          </div>

          {/* Dream Overall Progress Pill */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-800/70 border border-slate-700 rounded-lg px-2 py-0.5 shrink-0">
            <Target className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] font-bold text-emerald-300 font-mono tabular-nums">
              {isAr ? `الحلم ${metrics.dreamPct}%` : `Dream ${metrics.dreamPct}%`}
            </span>
          </div>

          {/* Proactive Advice */}
          <p className="font-bold text-amber-100 truncate">
            {metrics.proactiveTip}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setCurrentTab('dream')}
            className="px-2.5 py-0.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[10px] flex items-center gap-1 transition-colors whitespace-nowrap"
          >
            <TrendingUp className="w-3 h-3" />
            <span>{isAr ? 'لوحة الحلم والأرباح' : 'Dream Board'}</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="p-0.5 text-slate-400 hover:text-white transition-colors"
              title={isAr ? 'إخفاء' : 'Dismiss'}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Expanded Dashboard Card Variant (shown at top of Analytics Dashboard)
  return (
    <section className="rounded-3xl bg-slate-900 border border-amber-500/40 text-white p-4 sm:p-5 shadow-sm space-y-3.5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0">
            <Flame className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black text-amber-400">
                {isAr ? 'رادار التقدم اليومي نحو الحلم' : 'Daily Dream Progress Alert'}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-200">
                {dreamConfig.title}
              </span>
            </div>
            <p className="text-sm sm:text-base font-extrabold text-white mt-0.5 leading-snug">
              {metrics.proactiveTip}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCurrentTab('dream')}
          className="self-start lg:self-auto px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black flex items-center gap-1.5 transition-colors shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{isAr ? 'فتح لوحة الحلم والأرباح' : 'Open Dream & Profit Board'}</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 3 Daily / Weekly / Long-term Dream Progress Bars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Daily Target Progress */}
        <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-bold">
            <span className="text-slate-300">{isAr ? 'تقدم مبيعات اليوم' : "Today's Sales Pace"}</span>
            <span className="font-mono tabular-nums text-amber-400 font-black">
              {metrics.dailyPct}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                metrics.dailyPct >= 100 ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
              style={{ width: `${metrics.dailyPct}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-400 font-mono tabular-nums flex justify-between">
            <span>{metrics.todaySales.toFixed(0)} {currencySymbol}</span>
            <span>{isAr ? `الهدف: ${metrics.dailySalesTarget.toLocaleString('en-US')} ${currencySymbol}` : `Goal: ${metrics.dailySalesTarget}`}</span>
          </div>
        </div>

        {/* Weekly Target Progress */}
        <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-bold">
            <span className="text-slate-300">{isAr ? 'تقدم الهدف الأسبوعي' : 'Weekly Sales Target'}</span>
            <span className="font-mono tabular-nums text-emerald-400 font-black">
              {metrics.weeklyPct}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all duration-500"
              style={{ width: `${metrics.weeklyPct}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-400 font-mono tabular-nums flex justify-between">
            <span>{metrics.weekSales.toFixed(0)} {currencySymbol}</span>
            <span>{isAr ? `الأسبوعي: ${metrics.weeklySalesTarget.toLocaleString('en-US')} ${currencySymbol}` : `Weekly: ${metrics.weeklySalesTarget}`}</span>
          </div>
        </div>

        {/* Dream Long-Term + Monthly Summary */}
        <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-bold">
            <span className="text-slate-300">{isAr ? 'التقدم نحو الحلم والهدف الشهري' : 'Monthly & Dream Progress'}</span>
            <span className="font-mono tabular-nums text-amber-300 font-black">
              {metrics.dreamPct}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-300 transition-all duration-500"
              style={{ width: `${metrics.dreamPct}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-400 font-mono tabular-nums flex justify-between">
            <span>{isAr ? `ربح الشهر: ${metrics.monthNet.toFixed(0)} ${currencySymbol}` : `Month Net: ${metrics.monthNet.toFixed(0)}`}</span>
            <span>{isAr ? `الشهري: ${metrics.monthlyPct}%` : `Monthly: ${metrics.monthlyPct}%`}</span>
          </div>
        </div>
      </div>
    </section>
  );
};
