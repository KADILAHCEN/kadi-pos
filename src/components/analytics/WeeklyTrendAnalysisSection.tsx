import React, { useMemo, useState } from 'react';
import { usePos } from '../../context/PosContext';
import {
  buildWeeklyTrendSummary,
  WeeklyTrendDirection,
  WeeklyWindowSize
} from '../../utils/weeklyTrendEngine';
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  BarChart3,
  Clock,
  Download,
  ShoppingBag,
  Minus
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  AreaChart,
  Area,
  Line,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

type WeeklyViewPerspective = 'multi_week' | '7d_daily' | 'weekday_pattern';
type WeeklyMetricMode = 'revenue_profit' | 'margin_basket';

export const WeeklyTrendAnalysisSection: React.FC = () => {
  const {
    orders,
    expenses,
    products,
    categories,
    cpuRecords,
    zakatSummary,
    settings,
    currencySymbol,
    language,
    isDark,
    setCurrentTab
  } = usePos();

  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [windowWeeks, setWindowWeeks] = useState<WeeklyWindowSize>(8);
  const [perspective, setPerspective] = useState<WeeklyViewPerspective>('multi_week');
  const [metricMode, setMetricMode] = useState<WeeklyMetricMode>('revenue_profit');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const summary = useMemo(
    () =>
      buildWeeklyTrendSummary({
        orders,
        expenses,
        products,
        categories,
        cpuRecords,
        zakatSummary,
        settings,
        windowWeeks,
        language
      }),
    [orders, expenses, products, categories, cpuRecords, zakatSummary, settings, windowWeeks, language]
  );

  const fmtMoney = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtCompact = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const getTrendStateCopy = (dir: WeeklyTrendDirection) => {
    switch (dir) {
      case 'accelerating':
        return {
          label: isAr ? 'اتجاه صاعد بقوة' : isFr ? 'Forte hausse' : 'Accelerating',
          toneClass: 'text-emerald-700 dark:text-emerald-400',
          hint: isAr
            ? 'المبيعات فهاد 7 أيام طالعة بزاف على السيمانة اللي فاتت — زيد التوريد للسلع السريعة.'
            : isFr
            ? 'Les ventes accélèrent nettement par rapport à la semaine précédente.'
            : 'Weekly sales pace is rising strongly vs prior 7 days — keep fast movers stocked.'
        };
      case 'growing':
        return {
          label: isAr ? 'نمو أسبوعي إيجابي' : isFr ? 'En croissance' : 'Growing',
          toneClass: 'text-emerald-700 dark:text-emerald-400',
          hint: isAr
            ? 'الحانوت غادي مزيان وتيرة المبيعات طالعة بتدرج على الأسبوع الماضي.'
            : isFr
            ? 'Croissance hebdomadaire régulière.'
            : 'Healthy upward weekly momentum compared with last week.'
        };
      case 'cooling':
        return {
          label: isAr ? 'تراجع أسبوعي' : isFr ? 'Ralentissement' : 'Cooling',
          toneClass: 'text-rose-700 dark:text-rose-400',
          hint: isAr
            ? 'كاين تراجع فالحركة مقارنة بالأسبوع الفايت — جرب برومو خفيف فأبرد أيام الأسبوع.'
            : isFr
            ? 'Baisse hebdomadaire détectée — ciblez les jours creux avec des promotions.'
            : 'Weekly volume softened vs prior week — consider targeted offers on slower weekdays.'
        };
      case 'stable':
        return {
          label: isAr ? 'حركة مستقرة' : isFr ? 'Stable' : 'Stable',
          toneClass: 'text-slate-700 dark:text-slate-300',
          hint: isAr
            ? 'المبيعات مستقرة قريبة من متوسط 4 أسابيع.'
            : isFr
            ? 'Ventes stables proches de la moyenne sur 4 semaines.'
            : 'Sales pace is steady near the 4-week moving average.'
        };
      default:
        return {
          label: isAr ? 'في انتظار المبيعات' : isFr ? 'En attente de ventes' : 'Awaiting Data',
          toneClass: 'text-slate-500 dark:text-slate-400',
          hint: isAr
            ? 'ابدأ تسجيل البيوعات باش يبان لك منحنى الأسابيع ونمط أيام الذروة.'
            : isFr
            ? 'Enregistrez des ventes pour générer les tendances hebdomadaires.'
            : 'Record sales in POS to populate multi-week trends and weekday patterns.'
        };
    }
  };

  const trendCopy = getTrendStateCopy(summary.trendDirection);

  const getPaymentLabel = (method: string) => {
    const map: Record<string, string> = {
      cash: isAr ? 'كاش (نقداً)' : isFr ? 'Espèces' : 'Cash',
      card: isAr ? 'بطاقة بنكية' : isFr ? 'Carte' : 'Card',
      apple_pay: 'Apple Pay',
      split: isAr ? 'مجزأ' : isFr ? 'Mixte' : 'Split',
      credit: isAr ? 'كريدي' : isFr ? 'Crédit' : 'Credit'
    };
    return map[method] || method;
  };

  const handleExportWeeklyCsv = () => {
    const headers = [
      'Week Start',
      'Week End',
      'Orders',
      `Sales (${currencySymbol})`,
      `COGS (${currencySymbol})`,
      `Gross Profit (${currencySymbol})`,
      `Expenses (${currencySymbol})`,
      `Subscriptions (${currencySymbol})`,
      `Net Profit (${currencySymbol})`,
      'Gross Margin %',
      `Avg Basket (${currencySymbol})`,
      '4W Moving Avg',
      'WoW Change %'
    ];
    const rows = summary.weeklyBuckets.map((w) => [
      w.weekKey,
      w.endKey,
      w.ordersCount,
      w.sales.toFixed(2),
      w.cogs.toFixed(2),
      w.grossProfit.toFixed(2),
      w.expenses.toFixed(2),
      w.subscriptions.toFixed(2),
      w.netProfit.toFixed(2),
      w.marginPct.toFixed(1),
      w.avgBasket.toFixed(2),
      w.rollingAvgSales.toFixed(2),
      w.wowSalesChangePct !== null ? w.wowSalesChangePct.toFixed(1) : ''
    ]);
    const csv = '\uFEFF' + [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const filename = `KadiPOS_Weekly_Trend_${windowWeeks}W_${summary.todayYMD}.csv`;

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    window.dispatchEvent(new CustomEvent('kadi:pdf-ready', { detail: { blobUrl: url, filename } }));
    window.setTimeout(() => {
      if (link.parentNode) link.parentNode.removeChild(link);
    }, 1500);
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);

    setExportNotice(
      isAr ? `تم تصدير تحليل الاتجاه الأسبوعي (${filename})` : `Exported ${filename}`
    );
    window.setTimeout(() => setExportNotice(null), 3500);
  };

  const axisTickColor = isDark ? '#94a3b8' : '#64748b';
  const gridStrokeColor = isDark ? '#1e293b' : '#e2e8f0';

  return (
    <section
      id="weekly-trend-analysis"
      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-6"
    >
      {/* Top Header + Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span className={trendCopy.toneClass}>{trendCopy.label}</span>
            <span aria-hidden="true">·</span>
            <span>
              {isAr ? `نافذة ${windowWeeks} أسابيع` : isFr ? `Fenêtre ${windowWeeks} sem.` : `${windowWeeks}-Week Window`}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {summary.totalOrdersInWindow} {isAr ? 'فاتورة مكتملة' : 'orders'}
            </span>
          </div>
          <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              {isAr
                ? 'تحليل الاتجاه الأسبوعي — مقارنة الأسابيع وأيام الذروة'
                : isFr
                ? 'Analyse des tendances hebdomadaires (WoW)'
                : 'Weekly Trend Analysis'}
            </span>
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl">
            {trendCopy.hint}
          </p>
        </div>

        {/* Interactive Toolbar */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Perspective Switcher */}
          <div
            className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            role="tablist"
            aria-label={isAr ? 'زاوية التحليل الأسبوعي' : 'Weekly trend perspective'}
          >
            {(
              [
                {
                  id: 'multi_week',
                  label: isAr ? 'مسار الأسابيع' : isFr ? 'Multi-Semaines' : 'Multi-Week'
                },
                {
                  id: '7d_daily',
                  label: isAr ? 'مقارنة 7 أيام' : isFr ? '7 Jours' : '7-Day vs Prior'
                },
                {
                  id: 'weekday_pattern',
                  label: isAr ? 'أيام الأسبوع' : isFr ? 'Jours types' : 'Weekday Pattern'
                }
              ] as const
            ).map((tab) => {
              const active = perspective === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPerspective(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Lookback Window Selector */}
          <div
            className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            role="group"
            aria-label={isAr ? 'عدد الأسابيع' : 'Weeks window'}
          >
            {([4, 8, 12] as const).map((w) => {
              const active = windowWeeks === w;
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWindowWeeks(w)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {isAr ? `${w} أسابيع` : `${w}W`}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleExportWeeklyCsv}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>{isAr ? 'تصدير CSV' : 'Export CSV'}</span>
          </button>
        </div>
      </div>

      {exportNotice && (
        <div className="px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold">
          {exportNotice}
        </div>
      )}

      {/* KPI Strip: 4 Clean Single-Elevation Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* 1. Last 7 Days Sales + WoW */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>{isAr ? 'مبيعات آخر 7 أيام' : 'Last 7 Days Sales'}</span>
            <span
              className={`inline-flex items-center gap-0.5 font-mono tabular-nums font-bold ${
                summary.rolling7dGrowthPct > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : summary.rolling7dGrowthPct < 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-500'
              }`}
            >
              {summary.rolling7dGrowthPct > 0 ? (
                <ArrowUpRight className="w-3.5 h-3.5" />
              ) : summary.rolling7dGrowthPct < 0 ? (
                <ArrowDownRight className="w-3.5 h-3.5" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
              {summary.rolling7dGrowthPct > 0 ? '+' : ''}
              {summary.rolling7dGrowthPct}%
            </span>
          </div>
          <div className="text-xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
            {fmtMoney(summary.last7dSales)}{' '}
            <span className="text-xs font-sans font-bold text-slate-500">{currencySymbol}</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {isAr ? '7 أيام قبلها:' : 'Prior 7d:'} {fmtMoney(summary.prior7dSales)} {currencySymbol}
          </div>
        </div>

        {/* 2. Weekly Net Profit (After Expenses, CPU/AMO/CNSS & Zakat) */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isAr ? 'صافي ربح آخر 7 أيام' : '7-Day Net Profit'}
          </div>
          <div
            className={`text-xl font-black font-mono tabular-nums ${
              summary.last7dNetProfit > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : summary.last7dNetProfit < 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-900 dark:text-white'
            }`}
          >
            {summary.last7dNetProfit > 0 ? '+' : ''}
            {fmtMoney(summary.last7dNetProfit)}{' '}
            <span className="text-xs font-sans font-bold text-slate-500">{currencySymbol}</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {summary.last7dOrdersCount} {isAr ? 'فاتورة' : 'orders'} ·{' '}
            {isAr ? 'سلة:' : 'AOV:'} {fmtMoney(summary.last7dAvgBasket)} {currencySymbol}
          </div>
        </div>

        {/* 3. 4-Week Moving Average */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isAr ? 'متوسط 4 أسابيع المتحرك' : '4-Week Moving Avg'}
          </div>
          <div className="text-xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
            {fmtMoney(summary.movingAverage4w)}{' '}
            <span className="text-xs font-sans font-bold text-slate-500">{currencySymbol}</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {isAr ? 'معدل يومي (7أ):' : 'Daily avg:'} {fmtMoney(summary.rolling7dDailyAvg)}{' '}
            {currencySymbol}
          </div>
        </div>

        {/* 4. Peak Weekday Pattern */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isAr ? 'أقوى يوم في الأسبوع' : 'Peak Day of Week'}
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white truncate">
            {summary.peakWeekday ? summary.peakWeekday.name : '—'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
            {summary.peakWeekday
              ? `${isAr ? 'متوسط:' : 'Avg:'} ${fmtMoney(summary.peakWeekday.avgSalesPerDay)} ${currencySymbol} (${summary.peakWeekday.sharePct}%)`
              : isAr
              ? 'لا توجد بيانات كافية بعد'
              : 'No weekday pattern yet'}
          </div>
        </div>
      </div>

      {/* Empty State when zero completed orders exist across the selected window */}
      {summary.totalOrdersInWindow === 0 ? (
        <div className="p-8 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 text-center space-y-3">
          <div className="text-sm font-extrabold text-slate-900 dark:text-white">
            {isAr
              ? `ما كايناش فواتير مسجلة فآخر ${windowWeeks} أسابيع`
              : `No completed sales found in the last ${windowWeeks} weeks`}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {isAr
              ? 'غير تبدأ البيع في نقطة البيع، غادي يبان هنا منحنى الأسابيع الأوتوماتيكي، مقارنة أيام الأسبوع، وأكثر السلع طلباً.'
              : 'Once you complete orders in the POS register, multi-week trend lines, weekday patterns, and product movers will appear automatically.'}
          </p>
          <button
            type="button"
            onClick={() => setCurrentTab('pos')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold whitespace-nowrap transition-colors"
          >
            <ShoppingBag className="w-4 h-4 shrink-0" />
            <span>{isAr ? 'تسجيل أول بيعة' : 'Log First Sale'}</span>
          </button>
        </div>
      ) : (
        <>
          {/* Main Interactive Chart Panel */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  {perspective === 'multi_week'
                    ? isAr
                      ? `أداء ${windowWeeks} أسابيع متتالية + خط المتوسط المتحرك`
                      : `${windowWeeks}-Week Performance & 4-Week Moving Average`
                    : perspective === '7d_daily'
                    ? isAr
                      ? 'آخر 7 أيام مقارنة مع نفس اليوم في الأسبوع الماضي'
                      : 'Last 7 Days vs Same Weekday Last Week'
                    : isAr
                    ? `متوسط المبيعات والطلبات حسب يوم الأسبوع (${windowWeeks} أسابيع)`
                    : `Average Sales & Orders by Day of Week (${windowWeeks}W)`}
                </span>
              </div>

              {perspective === 'multi_week' && (
                <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setMetricMode('revenue_profit')}
                    className={`px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${
                      metricMode === 'revenue_profit'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {isAr ? 'المبيعات والربح الصافي' : 'Sales & Net Profit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMetricMode('margin_basket')}
                    className={`px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${
                      metricMode === 'margin_basket'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {isAr ? 'نسبة الهامش والسلة' : 'Margin % & Avg Basket'}
                  </button>
                </div>
              )}
            </div>

            <div className="w-full h-72" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                {perspective === 'multi_week' ? (
                  metricMode === 'revenue_profit' ? (
                    <ComposedChart
                      data={summary.weeklyBuckets}
                      margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStrokeColor} strokeOpacity={0.7} />
                      <XAxis
                        dataKey="shortLabel"
                        tick={{ fontSize: 11, fill: axisTickColor }}
                        axisLine={{ stroke: gridStrokeColor }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: axisTickColor }}
                        axisLine={{ stroke: gridStrokeColor }}
                        tickLine={false}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload.length) return null;
                          const item = payload[0].payload;
                          const wow = item.wowSalesChangePct;
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 border border-slate-700 font-mono tabular-nums">
                              <div className="font-sans font-bold text-slate-100">
                                {item.rangeLabel} {item.isCurrentWeek ? (isAr ? '(الحالي)' : '(Current)') : ''}
                              </div>
                              <div className="text-sky-400 font-bold">
                                {isAr ? 'المبيعات:' : 'Sales:'} {fmtMoney(item.sales)} {currencySymbol}
                              </div>
                              <div
                                className={`font-bold ${
                                  item.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {isAr ? 'صافي الربح:' : 'Net Profit:'} {item.netProfit >= 0 ? '+' : ''}
                                {fmtMoney(item.netProfit)} {currencySymbol}
                              </div>
                              <div className="text-amber-300">
                                {isAr ? 'متوسط 4 أسابيع:' : '4W Moving Avg:'} {fmtMoney(item.rollingAvgSales)} {currencySymbol}
                              </div>
                              <div className="text-slate-300 pt-1 border-t border-slate-700">
                                {item.ordersCount} {isAr ? 'فواتير' : 'orders'} ·{' '}
                                {wow !== null
                                  ? `${isAr ? 'أسبوع/أسبوع:' : 'WoW:'} ${wow >= 0 ? '+' : ''}${wow}%`
                                  : isAr
                                  ? 'أول أسبوع بالنافذة'
                                  : 'Baseline week'}
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                        formatter={(val) => {
                          if (val === 'sales') return isAr ? `المبيعات (${currencySymbol})` : `Weekly Sales (${currencySymbol})`;
                          if (val === 'netProfit') return isAr ? `صافي الربح (${currencySymbol})` : `Net Profit (${currencySymbol})`;
                          if (val === 'rollingAvgSales') return isAr ? 'متوسط 4 أسابيع' : '4W Moving Avg';
                          return val;
                        }}
                      />
                      <Bar dataKey="sales" name="sales" radius={[6, 6, 0, 0]} barSize={28}>
                        {summary.weeklyBuckets.map((entry) => (
                          <Cell
                            key={entry.weekKey}
                            fill={entry.isCurrentWeek ? '#059669' : '#2563eb'}
                          />
                        ))}
                      </Bar>
                      <Line
                        type="monotone"
                        dataKey="rollingAvgSales"
                        name="rollingAvgSales"
                        stroke="#d97706"
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={{ r: 3, fill: '#d97706' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="netProfit"
                        name="netProfit"
                        stroke="#16a34a"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#16a34a' }}
                      />
                    </ComposedChart>
                  ) : (
                    <ComposedChart
                      data={summary.weeklyBuckets}
                      margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStrokeColor} strokeOpacity={0.7} />
                      <XAxis
                        dataKey="shortLabel"
                        tick={{ fontSize: 11, fill: axisTickColor }}
                        axisLine={{ stroke: gridStrokeColor }}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="left"
                        tick={{ fontSize: 11, fill: axisTickColor }}
                        axisLine={{ stroke: gridStrokeColor }}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 11, fill: axisTickColor }}
                        axisLine={{ stroke: gridStrokeColor }}
                        tickLine={false}
                        unit="%"
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload.length) return null;
                          const item = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 border border-slate-700 font-mono tabular-nums">
                              <div className="font-sans font-bold text-slate-100">{item.rangeLabel}</div>
                              <div className="text-sky-400 font-bold">
                                {isAr ? 'متوسط السلة:' : 'Avg Basket:'} {fmtMoney(item.avgBasket)} {currencySymbol}
                              </div>
                              <div className="text-emerald-400 font-bold">
                                {isAr ? 'الهامش الإجمالي:' : 'Gross Margin:'} {item.marginPct}%
                              </div>
                              <div className="text-amber-300">
                                {isAr ? 'هامش الصافي:' : 'Net Margin:'} {item.netMarginPct}%
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                        formatter={(val) => {
                          if (val === 'avgBasket') return isAr ? `متوسط السلة (${currencySymbol})` : `Avg Basket (${currencySymbol})`;
                          if (val === 'marginPct') return isAr ? 'الهامش الإجمالي %' : 'Gross Margin %';
                          return val;
                        }}
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="avgBasket"
                        name="avgBasket"
                        fill="#0284c7"
                        radius={[6, 6, 0, 0]}
                        barSize={26}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="marginPct"
                        name="marginPct"
                        stroke="#16a34a"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#16a34a' }}
                      />
                    </ComposedChart>
                  )
                ) : perspective === '7d_daily' ? (
                  <AreaChart
                    data={summary.dayByDay7d}
                    margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="wtSales7d" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.32} />
                        <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStrokeColor} strokeOpacity={0.7} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: axisTickColor }}
                      axisLine={{ stroke: gridStrokeColor }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: axisTickColor }}
                      axisLine={{ stroke: gridStrokeColor }}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const item = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 border border-slate-700 font-mono tabular-nums">
                            <div className="font-sans font-bold text-slate-100">
                              {item.label} ({item.date})
                            </div>
                            <div className="text-emerald-400 font-bold">
                              {isAr ? 'مبيعات اليوم:' : 'Sales:'} {fmtMoney(item.sales)} {currencySymbol}
                            </div>
                            <div className="text-slate-300">
                              {isAr ? 'نفس اليوم الأسبوع الماضي:' : 'Prior Week:'} {fmtMoney(item.prevWeekSales)} {currencySymbol}
                            </div>
                            <div className={item.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-400'}>
                              {isAr ? 'الربح الصافي:' : 'Net Profit:'} {item.netProfit >= 0 ? '+' : ''}
                              {fmtMoney(item.netProfit)} {currencySymbol}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                      formatter={(val) => {
                        if (val === 'sales') return isAr ? `آخر 7 أيام (${currencySymbol})` : `Last 7 Days (${currencySymbol})`;
                        if (val === 'prevWeekSales') return isAr ? `الأسبوع السابق (${currencySymbol})` : `Prior Week (${currencySymbol})`;
                        return val;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="sales"
                      name="sales"
                      stroke="#059669"
                      strokeWidth={2.5}
                      fill="url(#wtSales7d)"
                      dot={{ r: 3.5, fill: '#059669' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="prevWeekSales"
                      name="prevWeekSales"
                      stroke="#94a3b8"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={{ r: 2.5, fill: '#94a3b8' }}
                    />
                  </AreaChart>
                ) : (
                  <BarChart
                    data={summary.weekdayPattern}
                    margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStrokeColor} strokeOpacity={0.7} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: axisTickColor }}
                      axisLine={{ stroke: gridStrokeColor }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: axisTickColor }}
                      axisLine={{ stroke: gridStrokeColor }}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const item = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 border border-slate-700 font-mono tabular-nums">
                            <div className="font-sans font-bold text-slate-100">{item.name}</div>
                            <div className="text-emerald-400 font-bold">
                              {isAr ? 'متوسط المبيعات/يوم:' : 'Avg Sales/Day:'} {fmtMoney(item.avgSalesPerDay)} {currencySymbol}
                            </div>
                            <div className="text-slate-300">
                              {isAr ? 'المساهمة من الأسبوع:' : 'Weekly Share:'} {item.sharePct}%
                            </div>
                            <div className="text-sky-300">
                              {item.ordersCount} {isAr ? 'فواتير' : 'orders'} · {isAr ? 'سلة:' : 'AOV:'} {fmtMoney(item.avgBasket)} {currencySymbol}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="avgSalesPerDay" radius={[6, 6, 0, 0]} barSize={32}>
                      {summary.weekdayPattern.map((entry) => (
                        <Cell
                          key={entry.dayIndex}
                          fill={
                            entry.isPeak
                              ? '#16a34a'
                              : entry.isSlowest
                              ? '#d97706'
                              : '#2563eb'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* 7-Day Strip when on 7-day comparison OR Weekly Ledger Table when on Multi-Week */}
            {perspective === '7d_daily' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                {summary.dayByDay7d.map((day) => {
                  const isUp = day.weekOverWeekPct >= 0;
                  return (
                    <div
                      key={day.date}
                      className={`p-2.5 rounded-xl border text-center ${
                        day.isToday
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                          : 'bg-slate-50/80 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800'
                      }`}
                    >
                      <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">
                        {day.isToday ? (isAr ? 'اليوم' : 'Today') : day.weekdayName}{' '}
                        <span className="font-mono text-slate-400">{day.displayDate}</span>
                      </div>
                      <div className="text-xs font-black text-slate-900 dark:text-white font-mono tabular-nums mt-1">
                        {fmtCompact(day.sales)} {currencySymbol}
                      </div>
                      <div
                        className={`text-[10px] font-bold font-mono tabular-nums mt-0.5 inline-flex items-center justify-center gap-0.5 ${
                          isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        <span>
                          {isUp ? '+' : ''}
                          {day.weekOverWeekPct}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {perspective === 'weekday_pattern' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-800/70 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-emerald-800 dark:text-emerald-300">
                      {isAr ? 'يوم الذروة الأسبوعي (حضر السلعة بكثرة)' : 'Peak Weekday (Prioritize Stock)'}
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                      {summary.peakWeekday
                        ? `${summary.peakWeekday.name} · ${summary.peakWeekday.ordersCount} ${isAr ? 'فواتير' : 'orders'}`
                        : '—'}
                    </div>
                  </div>
                  <div className="font-mono tabular-nums font-black text-emerald-700 dark:text-emerald-400 shrink-0">
                    {summary.peakWeekday ? `${fmtMoney(summary.peakWeekday.avgSalesPerDay)} ${currencySymbol}` : '—'}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800/70 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-amber-800 dark:text-amber-300">
                      {isAr ? 'أهدأ يوم في الأسبوع (دير فيه برومو)' : 'Slowest Weekday (Ideal for Promos)'}
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                      {summary.slowestWeekday
                        ? `${summary.slowestWeekday.name} · ${summary.slowestWeekday.sharePct}% ${isAr ? 'من المبيعات' : 'share'}`
                        : '—'}
                    </div>
                  </div>
                  <div className="font-mono tabular-nums font-black text-amber-700 dark:text-amber-400 shrink-0">
                    {summary.slowestWeekday ? `${fmtMoney(summary.slowestWeekday.avgSalesPerDay)} ${currencySymbol}` : '—'}
                  </div>
                </div>
              </div>
            )}

            {perspective === 'multi_week' && (
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-xs text-start border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3.5">{isAr ? 'الأسبوع' : 'Week'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'الفواتير' : 'Orders'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'المبيعات' : 'Sales'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'المصاريف والاشتراكات' : 'Expenses & Subs'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'صافي الربح' : 'Net Profit'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'الهامش' : 'Margin'}</th>
                      <th className="py-2.5 px-3.5 text-end">{isAr ? 'التغيير WoW' : 'WoW %'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                    {[...summary.weeklyBuckets].reverse().map((wk) => {
                      const wow = wk.isCurrentWeek && wk.daysElapsed < 7 && wk.paceChangePct !== null
                        ? wk.paceChangePct
                        : wk.wowSalesChangePct;
                      const isBest = summary.bestWeek?.weekKey === wk.weekKey;
                      return (
                        <tr
                          key={wk.weekKey}
                          className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                            wk.isCurrentWeek ? 'bg-emerald-50/40 dark:bg-emerald-950/15' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3.5 font-sans">
                            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <span>{wk.rangeLabel}</span>
                              {wk.isCurrentWeek && (
                                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                                  · {isAr ? `الحالي (${wk.daysElapsed}/7ي)` : `Current (${wk.daysElapsed}/7d)`}
                                </span>
                              )}
                              {isBest && !wk.isCurrentWeek && (
                                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                  · {isAr ? 'الأقوى' : 'Peak'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-end text-slate-600 dark:text-slate-300">
                            {wk.ordersCount}
                          </td>
                          <td className="py-2.5 px-3 text-end font-bold text-slate-900 dark:text-white whitespace-nowrap">
                            {fmtMoney(wk.sales)} {currencySymbol}
                          </td>
                          <td className="py-2.5 px-3 text-end text-rose-600 dark:text-rose-400 whitespace-nowrap">
                            -{fmtMoney(wk.expenses + wk.subscriptions + wk.zakat)} {currencySymbol}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-end font-black whitespace-nowrap ${
                              wk.netProfit >= 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {wk.netProfit >= 0 ? '+' : ''}
                            {fmtMoney(wk.netProfit)} {currencySymbol}
                          </td>
                          <td className="py-2.5 px-3 text-end text-slate-700 dark:text-slate-300">
                            {wk.marginPct}%
                          </td>
                          <td className="py-2.5 px-3.5 text-end whitespace-nowrap">
                            {wow === null ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              <span
                                className={`font-bold ${
                                  wow > 0
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : wow < 0
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-slate-500'
                                }`}
                              >
                                {wow > 0 ? '+' : ''}
                                {wow}%
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 2-Column Balanced Weekly Movers + Category & Payment Shift */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2 border-t border-slate-100 dark:border-slate-800">
            {/* Left: Rising & Cooling Products (This 7d vs Prior 7d) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{isAr ? 'السلع الصاعدة والنازلة هاد السيمانة' : 'Weekly Product Movers (7d vs Prior 7d)'}</span>
                </h4>
                <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {summary.risingProducts.length} ↑ · {summary.coolingProducts.length} ↓
                </span>
              </div>

              <div className="space-y-2">
                {summary.risingProducts.length === 0 && summary.coolingProducts.length === 0 ? (
                  <div className="text-xs text-slate-500 dark:text-slate-400 py-4">
                    {isAr
                      ? 'قارن مبيعات السلع غادي تبان مباشرة منين يكونو مبيعات فآخر 14 يوم.'
                      : 'Product movers will appear once items are sold across the 14-day comparison.'}
                  </div>
                ) : (
                  <>
                    {summary.risingProducts.slice(0, 3).map((p) => (
                      <div
                        key={`up-${p.productId}`}
                        className="py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                            {p.name}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                            {isAr ? 'الكمية:' : 'Qty:'} {p.current7dQty} ({isAr ? 'قبل:' : 'was:'} {p.prior7dQty}) ·{' '}
                            {isAr ? 'هامش:' : 'M:'} {p.marginPct}%
                          </div>
                        </div>
                        <div className="text-end shrink-0 font-mono tabular-nums">
                          <div className="text-xs font-black text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-0.5">
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            <span>+{fmtCompact(p.deltaSales)} {currencySymbol}</span>
                          </div>
                          <div className="text-[10px] text-emerald-700 dark:text-emerald-400">
                            +{p.deltaPct}%
                          </div>
                        </div>
                      </div>
                    ))}

                    {summary.coolingProducts.slice(0, 2).map((p) => (
                      <div
                        key={`dn-${p.productId}`}
                        className="py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                            {p.name}
                          </div>
                          <div className="text-[11px] text-rose-600 dark:text-rose-400 font-mono tabular-nums">
                            {isAr ? 'الكمية:' : 'Qty:'} {p.current7dQty} ({isAr ? 'قبل:' : 'was:'} {p.prior7dQty}) ·{' '}
                            {isAr ? 'دير برومو' : 'Promo tip'}
                          </div>
                        </div>
                        <div className="text-end shrink-0 font-mono tabular-nums">
                          <div className="text-xs font-black text-rose-600 dark:text-rose-400 flex items-center justify-end gap-0.5">
                            <ArrowDownRight className="w-3.5 h-3.5" />
                            <span>{fmtCompact(p.deltaSales)} {currencySymbol}</span>
                          </div>
                          <div className="text-[10px] text-rose-600 dark:text-rose-400">
                            {p.deltaPct}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Right: Category Weekly Momentum & Payment Method Shift */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>{isAr ? 'أداء الفئات وتحول طرق الدفع' : 'Category Momentum & Payment Shift'}</span>
                </h4>
              </div>

              {summary.categoryTrends.length > 0 && (
                <div className="space-y-2.5">
                  {summary.categoryTrends.slice(0, 4).map((cat) => (
                    <div key={cat.categoryId} className="space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                          {cat.name}
                        </span>
                        <span className="font-mono tabular-nums shrink-0 text-slate-700 dark:text-slate-300">
                          {fmtMoney(cat.current7dSales)} {currencySymbol}{' '}
                          <span
                            className={`font-bold ${
                              cat.deltaPct > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : cat.deltaPct < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-slate-400'
                            }`}
                          >
                            ({cat.deltaPct > 0 ? '+' : ''}
                            {cat.deltaPct}%)
                          </span>
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(2, cat.sharePct))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {summary.paymentMixShift.length > 0 && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    {isAr ? 'تغير نسب الدفع (آخر 7 أيام vs قبلها):' : 'Payment Mix Shift (7d vs Prior 7d):'}
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {summary.paymentMixShift.map((pm) => (
                      <div
                        key={pm.method}
                        className="py-1.5 flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {getPaymentLabel(pm.method)}
                        </span>
                        <span className="font-mono tabular-nums text-slate-900 dark:text-white font-bold">
                          {pm.currentSharePct}%{' '}
                          <span
                            className={`text-[11px] ${
                              pm.shareDeltaPts > 0
                                ? pm.method === 'credit'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                                : pm.shareDeltaPts < 0
                                ? 'text-slate-500 dark:text-slate-400'
                                : 'text-slate-400'
                            }`}
                          >
                            ({pm.shareDeltaPts > 0 ? '+' : ''}
                            {pm.shareDeltaPts}pt)
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
};
