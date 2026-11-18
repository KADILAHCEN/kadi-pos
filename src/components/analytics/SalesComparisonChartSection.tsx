import React, { useMemo, useState } from 'react';
import { usePos } from '../../context/PosContext';
import { BarChart3, ArrowUpRight, ArrowDownRight, GitCompareArrows } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

type ComparisonScope = 'today_vs_yesterday' | 'week_vs_last_week' | 'by_category';

function getLocalDateYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const SalesComparisonChartSection: React.FC = () => {
  const { orders, products, categories, currencySymbol, language, isDark } = usePos();
  const isAr = language === 'ar';

  const [scope, setScope] = useState<ComparisonScope>('today_vs_yesterday');
  const [visualType, setVisualType] = useState<'bar' | 'line'>('bar');

  const completedOrders = useMemo(
    () => orders.filter((o) => o.status === 'completed'),
    [orders]
  );

  // 1. Today vs Yesterday Time-Block Sales Comparison
  const todayVsYesterdayData = useMemo(() => {
    const now = new Date();
    const todayStr = getLocalDateYMD(now);
    const yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    const yestStr = getLocalDateYMD(yest);

    const blocks = [
      { id: 'morning', label: isAr ? 'الصباح (06-11)' : '06–11', minH: 0, maxH: 10 },
      { id: 'midday', label: isAr ? 'الظهر (11-14)' : '11–14', minH: 11, maxH: 13 },
      { id: 'afternoon', label: isAr ? 'العصر (14-17)' : '14–17', minH: 14, maxH: 16 },
      { id: 'evening', label: isAr ? 'المغرب (17-20)' : '17–20', minH: 17, maxH: 19 },
      { id: 'night', label: isAr ? 'الليل (20-00)' : '20–24', minH: 20, maxH: 23 }
    ].map((b) => ({
      ...b,
      primary: 0,
      secondary: 0
    }));

    completedOrders.forEach((o) => {
      const d = new Date(o.date);
      if (Number.isNaN(d.getTime())) return;
      const ymd = getLocalDateYMD(d);
      if (ymd !== todayStr && ymd !== yestStr) return;
      const hr = d.getHours();
      const targetBlock = blocks.find((b) => hr >= b.minH && hr <= b.maxH) || blocks[0];
      if (ymd === todayStr) targetBlock.primary += Number(o.grandTotal) || 0;
      else targetBlock.secondary += Number(o.grandTotal) || 0;
    });

    const primaryTotal = blocks.reduce((s, b) => s + b.primary, 0);
    const secondaryTotal = blocks.reduce((s, b) => s + b.secondary, 0);

    return {
      rows: blocks.map((b) => ({
        label: b.label,
        primary: Number(b.primary.toFixed(2)),
        secondary: Number(b.secondary.toFixed(2))
      })),
      primaryTotal: Number(primaryTotal.toFixed(2)),
      secondaryTotal: Number(secondaryTotal.toFixed(2)),
      primaryLabel: isAr ? 'مبيعات اليوم' : 'Today Sales',
      secondaryLabel: isAr ? 'مبيعات البارح' : 'Yesterday Sales'
    };
  }, [completedOrders, isAr]);

  // 2. This Week vs Last Week (Mon–Sun)
  const weekVsLastWeekData = useMemo(() => {
    const now = new Date();
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const jsDay = todayMid.getDay(); // 0 Sun..6 Sat
    const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;

    const thisMon = new Date(todayMid);
    thisMon.setDate(todayMid.getDate() + mondayOffset);
    const lastMon = new Date(thisMon);
    lastMon.setDate(thisMon.getDate() - 7);

    const dayLabelsAr = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
    const dayLabelsEn = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const rows = Array.from({ length: 7 }, (_, i) => {
      const dThis = new Date(thisMon);
      dThis.setDate(thisMon.getDate() + i);
      const dLast = new Date(lastMon);
      dLast.setDate(lastMon.getDate() + i);
      const ymdThis = getLocalDateYMD(dThis);
      const ymdLast = getLocalDateYMD(dLast);

      const thisTotal = completedOrders
        .filter((o) => {
          const d = new Date(o.date);
          return !Number.isNaN(d.getTime()) && getLocalDateYMD(d) === ymdThis;
        })
        .reduce((s, o) => s + (Number(o.grandTotal) || 0), 0);

      const lastTotal = completedOrders
        .filter((o) => {
          const d = new Date(o.date);
          return !Number.isNaN(d.getTime()) && getLocalDateYMD(d) === ymdLast;
        })
        .reduce((s, o) => s + (Number(o.grandTotal) || 0), 0);

      return {
        label: isAr ? dayLabelsAr[i] : dayLabelsEn[i],
        primary: Number(thisTotal.toFixed(2)),
        secondary: Number(lastTotal.toFixed(2))
      };
    });

    return {
      rows,
      primaryTotal: Number(rows.reduce((s, r) => s + r.primary, 0).toFixed(2)),
      secondaryTotal: Number(rows.reduce((s, r) => s + r.secondary, 0).toFixed(2)),
      primaryLabel: isAr ? 'هاد السيمانة' : 'This Week',
      secondaryLabel: isAr ? 'السيمانة الفايتة' : 'Last Week'
    };
  }, [completedOrders, isAr]);

  // 3. Category Sales vs Gross Profit Comparison
  const categoryComparisonData = useMemo(() => {
    const productById = new Map(products.map((p) => [p.id, p]));
    const catById = new Map(categories.map((c) => [c.id, c]));
    const bucket = new Map<string, { label: string; primary: number; secondary: number }>();

    completedOrders.forEach((o) => {
      o.items.forEach((it) => {
        const prod = productById.get(it.productId);
        const cat = prod ? catById.get(prod.categoryId) : undefined;
        const catId = cat?.id || 'other';
        const catLabel = cat ? (isAr ? cat.name : cat.nameEn || cat.name) : isAr ? 'أخرى' : 'Other';
        const entry = bucket.get(catId) || { label: catLabel, primary: 0, secondary: 0 };
        entry.primary += Number(it.total) || 0;
        entry.secondary += Math.max(0, (Number(it.total) || 0) - (Number(it.costPrice) || 0) * (Number(it.quantity) || 0));
        bucket.set(catId, entry);
      });
    });

    const rows = Array.from(bucket.values())
      .sort((a, b) => b.primary - a.primary)
      .slice(0, 7)
      .map((r) => ({
        label: r.label,
        primary: Number(r.primary.toFixed(2)),
        secondary: Number(r.secondary.toFixed(2))
      }));

    return {
      rows,
      primaryTotal: Number(rows.reduce((s, r) => s + r.primary, 0).toFixed(2)),
      secondaryTotal: Number(rows.reduce((s, r) => s + r.secondary, 0).toFixed(2)),
      primaryLabel: isAr ? 'إجمالي المبيعات' : 'Sales Revenue',
      secondaryLabel: isAr ? 'إجمالي الربح' : 'Gross Profit'
    };
  }, [completedOrders, products, categories, isAr]);

  const active =
    scope === 'today_vs_yesterday'
      ? todayVsYesterdayData
      : scope === 'week_vs_last_week'
      ? weekVsLastWeekData
      : categoryComparisonData;

  const deltaAmount = active.primaryTotal - active.secondaryTotal;
  const deltaPct =
    scope === 'by_category'
      ? active.primaryTotal > 0
        ? Number(((active.secondaryTotal / active.primaryTotal) * 100).toFixed(1))
        : 0
      : active.secondaryTotal > 0
      ? Number((((active.primaryTotal - active.secondaryTotal) / active.secondaryTotal) * 100).toFixed(1))
      : active.primaryTotal > 0
      ? 100
      : 0;

  return (
    <section className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
            <GitCompareArrows className="w-5 h-5 text-emerald-600" />
            <span>{isAr ? 'مخطط مقارنة المبيعات والأداء' : 'Sales Comparison Chart'}</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr
              ? 'قارن مبيعات اليوم بالبارح، هاد السيمانة بالفايتة، أو أداء التصنيفات مباشرة'
              : 'Compare period-over-period sales & category revenue vs profit'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Scope Selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-[11px] font-bold">
            {(
              [
                { id: 'today_vs_yesterday', label: isAr ? 'اليوم ضد البارح' : 'Today vs Yest' },
                { id: 'week_vs_last_week', label: isAr ? 'هاد السيمانة ضد الفايتة' : 'Week vs Last' },
                { id: 'by_category', label: isAr ? 'حسب الفئة' : 'By Category' }
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setScope(tab.id)}
                className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                  scope === tab.id
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs font-black'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Chart Visual Toggle */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setVisualType('bar')}
              className={`px-2.5 py-1 rounded-lg flex items-center gap-1 ${
                visualType === 'bar'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-500 dark:text-slate-300'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{isAr ? 'أعمدة' : 'Bars'}</span>
            </button>
            <button
              type="button"
              onClick={() => setVisualType('line')}
              className={`px-2.5 py-1 rounded-lg ${
                visualType === 'line'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-500 dark:text-slate-300'
              }`}
            >
              {isAr ? 'خطوط' : 'Lines'}
            </button>
          </div>
        </div>
      </div>

      {/* Comparison Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/60">
          <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
            {active.primaryLabel}
          </div>
          <div className="text-lg font-black font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
            {active.primaryTotal.toFixed(2)} {currencySymbol}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
          <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
            {active.secondaryLabel}
          </div>
          <div className="text-lg font-black font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
            {active.secondaryTotal.toFixed(2)} {currencySymbol}
          </div>
        </div>

        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 ${
            scope === 'by_category' || deltaAmount >= 0
              ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/70'
              : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/70'
          }`}
        >
          <div>
            <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
              {scope === 'by_category'
                ? isAr
                  ? 'نسبة الهامش الإجمالي'
                  : 'Overall Margin Ratio'
                : isAr
                ? 'الفرق مقارنة بالفترة السابقة'
                : 'Period Variance'}
            </div>
            <div
              className={`text-lg font-black font-mono tabular-nums mt-0.5 flex items-center gap-1 ${
                scope === 'by_category' || deltaAmount >= 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-rose-700 dark:text-rose-400'
              }`}
            >
              {scope === 'by_category' ? (
                <span>{deltaPct}%</span>
              ) : (
                <>
                  {deltaAmount >= 0 ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4" />
                  )}
                  <span>
                    {deltaAmount >= 0 ? '+' : ''}
                    {deltaAmount.toFixed(2)} {currencySymbol}
                  </span>
                </>
              )}
            </div>
          </div>

          {scope !== 'by_category' && (
            <span
              className={`px-2 py-1 rounded-lg font-mono text-xs font-black ${
                deltaPct >= 0
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
              }`}
            >
              {deltaPct >= 0 ? `+${deltaPct}%` : `${deltaPct}%`}
            </span>
          )}
        </div>
      </div>

      {/* Chart Area */}
      <div className="w-full h-64 pt-1" dir="ltr">
        {active.rows.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-400">
            {isAr ? 'لا توجد مبيعات كافية للمقارنة بعد' : 'Not enough sales data to compare yet'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {visualType === 'bar' ? (
              <BarChart data={active.rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={isDark ? '#1e293b' : '#e2e8f0'}
                  strokeOpacity={isDark ? 0.85 : 0.6}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: isDark ? '#b7c6db' : '#64748b' }}
                  axisLine={{ stroke: isDark ? '#26344a' : '#cbd5e1' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: isDark ? '#b7c6db' : '#64748b' }}
                  axisLine={{ stroke: isDark ? '#26344a' : '#cbd5e1' }}
                />
                <Tooltip
                  content={({ active: isActive, payload }) => {
                    if (!isActive || !payload || !payload.length) return null;
                    const item = payload[0].payload;
                    return (
                      <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 font-mono border border-slate-700">
                        <div className="font-bold text-slate-200 font-sans">{item.label}</div>
                        <div className="text-emerald-400 font-bold">
                          {active.primaryLabel}: {Number(item.primary).toFixed(2)} {currencySymbol}
                        </div>
                        <div className="text-sky-300 font-bold">
                          {active.secondaryLabel}: {Number(item.secondary).toFixed(2)} {currencySymbol}
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar
                  dataKey="primary"
                  name={active.primaryLabel}
                  fill="#059669"
                  radius={[5, 5, 0, 0]}
                />
                <Bar
                  dataKey="secondary"
                  name={active.secondaryLabel}
                  fill={scope === 'by_category' ? '#6366f1' : '#94a3b8'}
                  radius={[5, 5, 0, 0]}
                />
              </BarChart>
            ) : (
              <LineChart data={active.rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={isDark ? '#1e293b' : '#e2e8f0'}
                  strokeOpacity={isDark ? 0.85 : 0.6}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: isDark ? '#b7c6db' : '#64748b' }}
                  axisLine={{ stroke: isDark ? '#26344a' : '#cbd5e1' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: isDark ? '#b7c6db' : '#64748b' }}
                  axisLine={{ stroke: isDark ? '#26344a' : '#cbd5e1' }}
                />
                <Tooltip
                  content={({ active: isActive, payload }) => {
                    if (!isActive || !payload || !payload.length) return null;
                    const item = payload[0].payload;
                    return (
                      <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 font-mono border border-slate-700">
                        <div className="font-bold text-slate-200 font-sans">{item.label}</div>
                        <div className="text-emerald-400 font-bold">
                          {active.primaryLabel}: {Number(item.primary).toFixed(2)} {currencySymbol}
                        </div>
                        <div className="text-sky-300 font-bold">
                          {active.secondaryLabel}: {Number(item.secondary).toFixed(2)} {currencySymbol}
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Line
                  type="monotone"
                  dataKey="primary"
                  name={active.primaryLabel}
                  stroke="#059669"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: '#059669' }}
                />
                <Line
                  type="monotone"
                  dataKey="secondary"
                  name={active.secondaryLabel}
                  stroke={scope === 'by_category' ? '#6366f1' : '#94a3b8'}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3, fill: scope === 'by_category' ? '#6366f1' : '#94a3b8' }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
};
