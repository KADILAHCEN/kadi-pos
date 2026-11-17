import React, { useMemo, useState } from 'react';
import {
  BourseMarketMode,
  CpuQuarterRecord,
  DailyFixedExpenses,
  Expense,
  Order,
  Product
} from '../../types';
import { ZakatSummary } from '../../utils/zakat';
import { computeExpenseMetrics, getLocalTodayYMD } from '../../utils/expenses';
import { DEFAULT_DAILY_FIXED_EXPENSES, getMarketModeMeta } from '../../utils/bourseEngine';
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  Target,
  TrendingUp,
  TrendingDown,
  Award,
  CheckCircle2,
  AlertTriangle,
  Calculator
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from 'recharts';

export type PeriodTab = 'daily' | 'monthly' | 'yearly';

interface PeriodProfitTargetPanelProps {
  orders: Order[];
  expenses: Expense[];
  products: Product[];
  cpuRecords: CpuQuarterRecord[];
  zakatSummary: ZakatSummary;
  monthlyProfitTarget: number;
  subscriptionsSalesPct?: number;
  dailyFixedExpenses?: DailyFixedExpenses;
  marketMode?: BourseMarketMode;
  onUpdateMonthlyTarget: (val: number) => void;
  currencySymbol: string;
  language: 'ar' | 'fr' | 'en';
  isDark: boolean;
}

function getOrderLocalYMD(dateIso: string): string {
  if (!dateIso) return '';
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return dateIso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const PeriodProfitTargetPanel: React.FC<PeriodProfitTargetPanelProps> = ({
  orders,
  expenses,
  products,
  cpuRecords,
  zakatSummary,
  monthlyProfitTarget,
  subscriptionsSalesPct = 3,
  dailyFixedExpenses,
  marketMode = 'normal',
  onUpdateMonthlyTarget,
  currencySymbol,
  language,
  isDark
}) => {
  const isAr = language === 'ar';
  const [periodTab, setPeriodTab] = useState<PeriodTab>('daily');
  const [targetInputStr, setTargetInputStr] = useState<string>(
    String(monthlyProfitTarget ?? 6000)
  );
  React.useEffect(() => {
    setTargetInputStr(String(monthlyProfitTarget ?? 6000));
  }, [monthlyProfitTarget]);

  const todayYMD = getLocalTodayYMD();
  const monthPrefix = todayYMD.slice(0, 7); // YYYY-MM
  const yearPrefix = todayYMD.slice(0, 4); // YYYY

  const productCostMap = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((p) => map.set(p.id, Number(p.costPrice) || 0));
    return map;
  }, [products]);

  const completedOrders = useMemo(
    () => orders.filter((o) => o.status === 'completed'),
    [orders]
  );

  const modeMeta = getMarketModeMeta(marketMode);
  const costShockFactor = modeMeta.costShockFactor;

  const computeOrderRealCost = (o: Order): number => {
    if (o.items && o.items.length > 0) {
      return o.items.reduce((sum, it) => {
        const liveCost = productCostMap.get(it.productId);
        const unitCost =
          liveCost !== undefined
            ? liveCost
            : Number(it.costPrice) || 0;
        return sum + unitCost * costShockFactor * (Number(it.quantity) || 0);
      }, 0);
    }
    return (Number(o.costTotal) || 0) * costShockFactor;
  };

  // Fallback Average Margin % from all completed orders or product catalog
  const baselineMarginRatio = useMemo(() => {
    let allSales = 0;
    let allCost = 0;
    completedOrders.forEach((o) => {
      allSales += Number(o.grandTotal) || 0;
      allCost += computeOrderRealCost(o);
    });
    if (allSales > 0 && allSales > allCost) {
      return (allSales - allCost) / allSales;
    }

    let catMarginSum = 0;
    let catCount = 0;
    products.forEach((p) => {
      const adjCost = (Number(p.costPrice) || 0) * costShockFactor;
      if (p.price > 0 && p.price > adjCost) {
        catMarginSum += (p.price - adjCost) / p.price;
        catCount++;
      }
    });
    if (catCount > 0) return catMarginSum / catCount;
    return 0.25;
  }, [completedOrders, products, productCostMap, costShockFactor]);

  // Expenses (Daily fixed overhead breakdown + Ledger expenses)
  const fixedDailyTotal =
    Math.max(0, Number(dailyFixedExpenses?.rentPerDay ?? DEFAULT_DAILY_FIXED_EXPENSES.rentPerDay) || 0) +
    Math.max(0, Number(dailyFixedExpenses?.electricityPerDay ?? DEFAULT_DAILY_FIXED_EXPENSES.electricityPerDay) || 0) +
    Math.max(0, Number(dailyFixedExpenses?.internetPerDay ?? DEFAULT_DAILY_FIXED_EXPENSES.internetPerDay) || 0) +
    Math.max(0, Number(dailyFixedExpenses?.transportPerDay ?? DEFAULT_DAILY_FIXED_EXPENSES.transportPerDay) || 0) +
    Math.max(0, Number(dailyFixedExpenses?.otherPerDay ?? DEFAULT_DAILY_FIXED_EXPENSES.otherPerDay) || 0);

  const expenseMetrics = useMemo(() => computeExpenseMetrics(expenses), [expenses]);
  const monthlyExpenses = fixedDailyTotal * 30 + expenseMetrics.monthTotal;
  const dailyExpenses = fixedDailyTotal + expenseMetrics.todayTotal + (expenseMetrics.monthTotal - expenseMetrics.todayTotal) / 30;
  const yearlyExpenses = fixedDailyTotal * 365 + expenseMetrics.monthTotal * 12;

  // Subscriptions = CPU Tax + AMO + CNSS Retirement (Quarterly / 3 => Monthly)
  const subscriptionsBreakdown = useMemo(() => {
    if (!cpuRecords || cpuRecords.length === 0) {
      return { monthlyCpu: 0, monthlyAmo: 0, monthlyRetirement: 0, monthlyTotal: 0 };
    }
    const qWeight: Record<string, number> = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
    const sorted = [...cpuRecords].sort((a, b) => {
      const aScore = a.year * 10 + (qWeight[a.quarter] || 0);
      const bScore = b.year * 10 + (qWeight[b.quarter] || 0);
      return bScore - aScore;
    });
    const latest = sorted[0];
    const monthlyCpu = (Number(latest.calculatedTax) || 0) / 3;
    const monthlyAmo = Number(latest.monthlyAmo) || (Number(latest.quarterlyAmo) || 0) / 3;
    const monthlyRetirement =
      Number(latest.monthlyRetirement) || (Number(latest.quarterlyRetirement) || 0) / 3;
    return {
      monthlyCpu,
      monthlyAmo,
      monthlyRetirement,
      monthlyTotal: monthlyCpu + monthlyAmo + monthlyRetirement
    };
  }, [cpuRecords]);

  const monthlySubscriptions = subscriptionsBreakdown.monthlyTotal;
  const dailySubscriptions = monthlySubscriptions / 30;
  const yearlySubscriptions = monthlySubscriptions * 12;

  // Zakat from Zakat module
  const yearlyZakat = Number(zakatSummary.zakatDue) || 0;
  const monthlyZakat = yearlyZakat / 12;
  const dailyZakat = yearlyZakat / 365;

  // 1. DAILY METRICS
  const dailyStats = useMemo(() => {
    let sales = 0;
    let cost = 0;
    let ordersCount = 0;

    completedOrders.forEach((o) => {
      if (getOrderLocalYMD(o.date) === todayYMD) {
        sales += Number(o.grandTotal) || 0;
        cost += computeOrderRealCost(o);
        ordersCount++;
      }
    });

    const marginRatio =
      sales > 0 && sales > cost ? (sales - cost) / sales : baselineMarginRatio;
    const safeMargin = Math.max(0.01, marginRatio);
    const dynamicSubs = (sales * Math.max(0, subscriptionsSalesPct)) / 100;
    const effectiveSubs = dailySubscriptions + dynamicSubs;
    const fixedCosts = dailyExpenses + dailySubscriptions + dailyZakat;
    const netProfit = sales - cost - fixedCosts - dynamicSubs;
    const effectiveContrib = Math.max(0.02, safeMargin - Math.max(0, subscriptionsSalesPct) / 100);
    const seuilDaily = fixedCosts / effectiveContrib;
    const progressPct =
      seuilDaily > 0 ? Math.min(100, Math.max(0, (sales / seuilDaily) * 100)) : 100;
    const neededToReachZero = Math.max(0, seuilDaily - sales);

    return {
      sales,
      cost,
      ordersCount,
      expenses: dailyExpenses,
      subscriptions: effectiveSubs,
      zakat: dailyZakat,
      fixedCosts,
      marginRatio: safeMargin,
      netProfit,
      seuilDaily,
      progressPct,
      neededToReachZero
    };
  }, [
    completedOrders,
    todayYMD,
    dailyExpenses,
    dailySubscriptions,
    dailyZakat,
    baselineMarginRatio,
    subscriptionsSalesPct,
    productCostMap,
    costShockFactor
  ]);

  // 2. MONTHLY METRICS + TARGET SYSTEM
  const monthlyStats = useMemo(() => {
    let sales = 0;
    let cost = 0;
    let ordersCount = 0;

    completedOrders.forEach((o) => {
      const ymd = getOrderLocalYMD(o.date);
      if (ymd.startsWith(monthPrefix)) {
        sales += Number(o.grandTotal) || 0;
        cost += computeOrderRealCost(o);
        ordersCount++;
      }
    });

    const marginRatio =
      sales > 0 && sales > cost ? (sales - cost) / sales : baselineMarginRatio;
    const safeMargin = Math.max(0.01, marginRatio);
    const dynamicSubs = (sales * Math.max(0, subscriptionsSalesPct)) / 100;
    const effectiveSubs = monthlySubscriptions + dynamicSubs;
    const fixedCosts = monthlyExpenses + monthlySubscriptions + monthlyZakat;
    const netProfit = sales - cost - fixedCosts - dynamicSubs;
    const effectiveContrib = Math.max(0.02, safeMargin - Math.max(0, subscriptionsSalesPct) / 100);
    const seuilMonthly = fixedCosts / effectiveContrib;

    const desiredProfit = Math.max(0, Number(monthlyProfitTarget) || 0);
    // Target Sales = Seuil + (Desired Profit / Effective Margin %)
    const targetSales = seuilMonthly + desiredProfit / effectiveContrib;

    const now = new Date();
    const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();
    const remainingDays = Math.max(1, totalDaysInMonth - currentDay + 1);

    const remainingSalesToTarget = Math.max(0, targetSales - sales);
    const dailySalesNeeded = remainingSalesToTarget / remainingDays;
    const targetProgressPct =
      targetSales > 0 ? Math.min(100, Math.max(0, (sales / targetSales) * 100)) : 100;

    return {
      sales,
      cost,
      ordersCount,
      expenses: monthlyExpenses,
      subscriptions: effectiveSubs,
      zakat: monthlyZakat,
      fixedCosts,
      marginRatio: safeMargin,
      netProfit,
      seuilMonthly,
      desiredProfit,
      targetSales,
      totalDaysInMonth,
      currentDay,
      remainingDays,
      remainingSalesToTarget,
      dailySalesNeeded,
      targetProgressPct
    };
  }, [
    completedOrders,
    monthPrefix,
    monthlyExpenses,
    monthlySubscriptions,
    monthlyZakat,
    baselineMarginRatio,
    monthlyProfitTarget,
    subscriptionsSalesPct,
    productCostMap,
    costShockFactor
  ]);

  // 3. YEARLY METRICS + 12 MONTHS CHART + BEST MONTH / BEST DAY
  const yearlyStats = useMemo(() => {
    const monthNamesAr = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'ماي', 'يونيو',
      'يوليوز', 'غشت', 'شتنبر', 'أكتوبر', 'نونبر', 'دجنبر'
    ];
    const monthNamesEn = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    const monthlyBuckets = Array.from({ length: 12 }, (_, idx) => ({
      monthIndex: idx,
      label: isAr ? monthNamesAr[idx] : monthNamesEn[idx],
      sales: 0,
      cost: 0,
      ordersCount: 0,
      fixedCosts: monthlyExpenses + monthlySubscriptions + monthlyZakat,
      netProfit: 0
    }));

    const dayMap: Record<string, { date: string; sales: number; cost: number; profit: number }> = {};

    let yearSales = 0;
    let yearCost = 0;
    let yearOrdersCount = 0;

    completedOrders.forEach((o) => {
      const ymd = getOrderLocalYMD(o.date);
      if (!ymd.startsWith(yearPrefix)) return;

      const s = Number(o.grandTotal) || 0;
      const c = computeOrderRealCost(o);
      yearSales += s;
      yearCost += c;
      yearOrdersCount++;

      const monthIdx = Math.max(0, Math.min(11, parseInt(ymd.slice(5, 7), 10) - 1));
      monthlyBuckets[monthIdx].sales += s;
      monthlyBuckets[monthIdx].cost += c;
      monthlyBuckets[monthIdx].ordersCount += 1;

      if (!dayMap[ymd]) {
        dayMap[ymd] = { date: ymd, sales: 0, cost: 0, profit: 0 };
      }
      dayMap[ymd].sales += s;
      dayMap[ymd].cost += c;
      dayMap[ymd].profit += s - c - (dailyExpenses + dailySubscriptions + dailyZakat);
    });

    monthlyBuckets.forEach((b) => {
      b.sales = Number(b.sales.toFixed(2));
      b.cost = Number(b.cost.toFixed(2));
      b.fixedCosts = Number(b.fixedCosts.toFixed(2));
      b.netProfit = Number((b.sales - b.cost - b.fixedCosts).toFixed(2));
    });

    const marginRatio =
      yearSales > 0 && yearSales > yearCost ? (yearSales - yearCost) / yearSales : baselineMarginRatio;
    const safeMargin = Math.max(0.01, marginRatio);
    const dynamicYearSubs = (yearSales * Math.max(0, subscriptionsSalesPct)) / 100;
    const effectiveYearSubs = yearlySubscriptions + dynamicYearSubs;
    const fixedCosts = yearlyExpenses + yearlySubscriptions + yearlyZakat;
    const netProfit = yearSales - yearCost - fixedCosts - dynamicYearSubs;
    const effectiveContrib = Math.max(0.02, safeMargin - Math.max(0, subscriptionsSalesPct) / 100);
    const seuilYearly = fixedCosts / effectiveContrib;
    const averageMonthlyProfit = netProfit / 12;

    const bestMonth = monthlyBuckets.reduce(
      (best, cur) => (cur.netProfit > best.netProfit ? cur : best),
      monthlyBuckets[0]
    );

    const daysArr = Object.values(dayMap);
    const bestDay =
      daysArr.length > 0
        ? daysArr.reduce((best, cur) => (cur.sales > best.sales ? cur : best), daysArr[0])
        : { date: '-', sales: 0, cost: 0, profit: 0 };

    return {
      sales: yearSales,
      cost: yearCost,
      ordersCount: yearOrdersCount,
      expenses: yearlyExpenses,
      subscriptions: effectiveYearSubs,
      zakat: yearlyZakat,
      fixedCosts,
      marginRatio: safeMargin,
      netProfit,
      seuilYearly,
      averageMonthlyProfit,
      monthlyBuckets,
      bestMonth,
      bestDay
    };
  }, [
    completedOrders,
    yearPrefix,
    isAr,
    monthlyExpenses,
    monthlySubscriptions,
    monthlyZakat,
    dailyExpenses,
    dailySubscriptions,
    dailyZakat,
    yearlyExpenses,
    yearlySubscriptions,
    yearlyZakat,
    baselineMarginRatio,
    subscriptionsSalesPct,
    productCostMap,
    costShockFactor
  ]);

  const activeData =
    periodTab === 'daily'
      ? dailyStats
      : periodTab === 'monthly'
      ? monthlyStats
      : yearlyStats;

  const activeSeuil =
    periodTab === 'daily'
      ? dailyStats.seuilDaily
      : periodTab === 'monthly'
      ? monthlyStats.seuilMonthly
      : yearlyStats.seuilYearly;

  const formatMoney = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <section className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
      {/* Top Header + 3 Period Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Calculator className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>
              {isAr
                ? 'التفاصيل اليومية والشهرية والسنوية — معادلة الربح الصافي والأهداف'
                : 'Daily / Monthly / Yearly P&L Details & Target System'}
            </span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr
              ? 'المعادلة الموحدة: المبيعات الحقيقية − تكلفة السلع − المصاريف − الاشتراكات (CPU + AMO + CNSS) − الزكاة = الربح الصافي'
              : 'Real Sales − Product Cost − Expenses − Subscriptions (CPU + AMO + CNSS) − Zakat = Net Profit'}
          </p>
        </div>

        {/* 3 Period Tabs at Top: Daily - Monthly - Yearly */}
        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 self-start lg:self-auto">
          {[
            { id: 'daily' as PeriodTab, label: isAr ? 'اليومي (Daily)' : 'Daily', icon: Calendar },
            { id: 'monthly' as PeriodTab, label: isAr ? 'الشهري (Monthly)' : 'Monthly', icon: CalendarDays },
            { id: 'yearly' as PeriodTab, label: isAr ? 'السنوي (Yearly)' : 'Yearly', icon: CalendarRange }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = periodTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPeriodTab(tab.id)}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                  active
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SAME LINKED EQUATION BAR ON ALL 3 TABS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
            {isAr ? '1. المبيعات الحقيقية' : '1. Real Sales'}
          </div>
          <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white font-mono tabular-nums mt-1">
            {formatMoney(activeData.sales)} <span className="text-[11px] font-bold">{currencySymbol}</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {activeData.ordersCount} {isAr ? 'فاتورة' : 'orders'}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
            {isAr ? '− 2. تكلفة السلع (الهامش الحقيقي)' : '− 2. Product Cost'}
          </div>
          <div className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 font-mono tabular-nums mt-1">
            −{formatMoney(activeData.cost)} <span className="text-[11px] font-bold">{currencySymbol}</span>
          </div>
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">
            {isAr ? 'متوسط الهامش:' : 'Margin:'} {(activeData.marginRatio * 100).toFixed(1)}%
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/80 dark:border-amber-800/60">
          <div className="text-[10px] font-bold text-amber-800 dark:text-amber-300">
            {periodTab === 'daily'
              ? isAr ? '− 3. المصاريف (الشهر ÷ 30)' : '− 3. Expenses (/30)'
              : periodTab === 'monthly'
              ? isAr ? '− 3. مصاريف الشهر' : '− 3. Monthly Expenses'
              : isAr ? '− 3. المصاريف (× 12)' : '− 3. Expenses (x12)'}
          </div>
          <div className="text-base sm:text-lg font-black text-amber-700 dark:text-amber-300 font-mono tabular-nums mt-1">
            −{formatMoney(activeData.expenses)} <span className="text-[11px] font-bold">{currencySymbol}</span>
          </div>
          <div className="text-[10px] text-amber-700/80 dark:text-amber-400/80 mt-0.5 font-mono">
            {isAr ? 'الأساس الشهري:' : 'Mo:'} {formatMoney(monthlyExpenses)}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/25 border border-indigo-200/80 dark:border-indigo-800/60">
          <div className="text-[10px] font-bold text-indigo-800 dark:text-indigo-300">
            {periodTab === 'daily'
              ? isAr ? '− 4. الاشتراكات (الشهر ÷ 30)' : '− 4. Subs (/30)'
              : periodTab === 'monthly'
              ? isAr ? '− 4. الاشتراكات (CPU+AMO+CNSS)' : '− 4. Subscriptions'
              : isAr ? '− 4. الاشتراكات (× 12)' : '− 4. Subs (x12)'}
          </div>
          <div className="text-base sm:text-lg font-black text-indigo-700 dark:text-indigo-300 font-mono tabular-nums mt-1">
            −{formatMoney(activeData.subscriptions)} <span className="text-[11px] font-bold">{currencySymbol}</span>
          </div>
          <div className="text-[10px] text-indigo-700/80 dark:text-indigo-300/80 mt-0.5">
            CPU + AMO + CNSS
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-sky-50/70 dark:bg-sky-950/25 border border-sky-200/80 dark:border-sky-800/60">
          <div className="text-[10px] font-bold text-sky-800 dark:text-sky-300">
            {periodTab === 'daily'
              ? isAr ? '− 5. الزكاة (السنوية ÷ 365)' : '− 5. Zakat (/365)'
              : periodTab === 'monthly'
              ? isAr ? '− 5. الزكاة (السنوية ÷ 12)' : '− 5. Zakat (/12)'
              : isAr ? '− 5. الزكاة السنوية (2.5%)' : '− 5. Yearly Zakat'}
          </div>
          <div className="text-base sm:text-lg font-black text-sky-700 dark:text-sky-300 font-mono tabular-nums mt-1">
            −{formatMoney(activeData.zakat)} <span className="text-[11px] font-bold">{currencySymbol}</span>
          </div>
          <div className="text-[10px] text-sky-700/80 dark:text-sky-300/80 mt-0.5 font-mono">
            {isAr ? 'السنوية:' : 'Yr:'} {formatMoney(yearlyZakat)}
          </div>
        </div>

        <div
          className={`p-3.5 rounded-2xl border ${
            activeData.netProfit >= 0
              ? 'bg-emerald-50 dark:bg-emerald-950/45 border-emerald-300 dark:border-emerald-700'
              : 'bg-rose-50 dark:bg-rose-950/45 border-rose-300 dark:border-rose-700'
          }`}
        >
          <div
            className={`text-[10px] font-extrabold ${
              activeData.netProfit >= 0
                ? 'text-emerald-800 dark:text-emerald-300'
                : 'text-rose-800 dark:text-rose-300'
            }`}
          >
            {isAr ? '= 6. صافي الربح (Net Profit)' : '= 6. Net Profit'}
          </div>
          <div
            className={`text-base sm:text-lg font-black font-mono tabular-nums mt-1 ${
              activeData.netProfit >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {activeData.netProfit >= 0 ? '+' : ''}
            {formatMoney(activeData.netProfit)} <span className="text-[11px] font-bold">{currencySymbol}</span>
          </div>
          <div className="text-[10px] text-slate-600 dark:text-slate-300 mt-0.5">
            {isAr ? 'التكاليف الثابتة:' : 'Fixed:'} {formatMoney(activeData.fixedCosts)}
          </div>
        </div>
      </div>

      {/* TAB 1 SPECIFIC: DAILY SEUIL & PROGRESS TO 0 */}
      {periodTab === 'daily' && (
        <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>
                  {isAr
                    ? 'نقطة التعادل اليومية (Seuil Daily) والتقدم نحو الصفر'
                    : 'Daily Break-Even (Seuil Daily) & Progress to 0'}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                Seuil Daily = ({formatMoney(dailyStats.expenses)} + {formatMoney(dailyStats.subscriptions)} + {formatMoney(dailyStats.zakat)}) ÷ {(dailyStats.marginRatio * 100).toFixed(1)}% ={' '}
                <span className="font-black text-slate-900 dark:text-white">
                  {formatMoney(dailyStats.seuilDaily)} {currencySymbol}
                </span>
              </div>
            </div>

            {/* Status Pill: Net Profit = 0 | > 0 | < 0 */}
            {Math.abs(dailyStats.netProfit) < 0.01 ? (
              <span className="px-3.5 py-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-xs font-black flex items-center gap-1.5 shrink-0">
                <CheckCircle2 className="w-4 h-4" />
                <span>{isAr ? 'تم تسديد المصاريف (Expenses paid)' : 'Expenses paid'}</span>
              </span>
            ) : dailyStats.netProfit > 0 ? (
              <span className="px-3.5 py-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 text-xs font-black flex items-center gap-1.5 shrink-0 font-mono">
                <TrendingUp className="w-4 h-4" />
                <span>+{formatMoney(dailyStats.netProfit)} {currencySymbol} {isAr ? 'ربح صافي اليوم' : 'profit'}</span>
              </span>
            ) : (
              <span className="px-3.5 py-2 rounded-xl bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-300 text-xs font-black flex items-center gap-1.5 shrink-0">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  {isAr
                    ? `تحتاج ${formatMoney(dailyStats.neededToReachZero)} ${currencySymbol} مبيعات إضافية للوصول إلى 0 اليوم`
                    : `Need ${formatMoney(dailyStats.neededToReachZero)} ${currencySymbol} more to reach 0 today`}
                </span>
              </span>
            )}
          </div>

          {/* Progress bar to 0 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-slate-600 dark:text-slate-300">
                {isAr ? 'مبيعات اليوم المحققة:' : "Today's Sales:"}{' '}
                <span className="font-mono text-slate-900 dark:text-white">
                  {formatMoney(dailyStats.sales)} {currencySymbol}
                </span>
              </span>
              <span className="font-mono text-slate-700 dark:text-slate-200">
                {dailyStats.progressPct.toFixed(0)}% {isAr ? 'من نقطة التعادل' : 'of Seuil'} ({formatMoney(dailyStats.seuilDaily)} {currencySymbol})
              </span>
            </div>
            <div className="w-full h-3.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  dailyStats.netProfit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
                style={{ width: `${dailyStats.progressPct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 2 SPECIFIC: MONTHLY SEUIL + DESIRED PROFIT TARGET SYSTEM */}
      {periodTab === 'monthly' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Seuil Monthly Box */}
          <div className="lg:col-span-5 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-amber-500" />
              <span>{isAr ? 'نقطة التعادل الشهرية (Seuil Monthly)' : 'Monthly Break-Even (Seuil)'}</span>
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums">
              {formatMoney(monthlyStats.seuilMonthly)} {currencySymbol}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono leading-relaxed">
              ({formatMoney(monthlyStats.expenses)} + {formatMoney(monthlyStats.subscriptions)} + {formatMoney(monthlyStats.zakat)}) ÷ {(monthlyStats.marginRatio * 100).toFixed(1)}%
            </p>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-300 font-bold">
                {isAr ? 'الأيام المتبقية في الشهر:' : 'Remaining Days:'}
              </span>
              <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">
                {monthlyStats.remainingDays} / {monthlyStats.totalDaysInMonth} {isAr ? 'يوم' : 'days'}
              </span>
            </div>
          </div>

          {/* Monthly Profit Target Calculator */}
          <div className="lg:col-span-7 p-5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{isAr ? 'نظام الهدف الشهري للأرباح (Monthly Target)' : 'Monthly Profit Target System'}</span>
                </div>
                <div className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 mt-0.5 font-mono">
                  Target Sales = Seuil + (Desired Profit ÷ {(monthlyStats.marginRatio * 100).toFixed(1)}%)
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                  {isAr ? 'الربح الصافي المطلوب:' : 'Desired Profit:'}
                </label>
                <div className="relative w-36">
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={targetInputStr}
                    onChange={(e) => {
                      setTargetInputStr(e.target.value);
                      const v = parseFloat(e.target.value);
                      if (!Number.isNaN(v) && v >= 0) {
                        onUpdateMonthlyTarget(v);
                      }
                    }}
                    className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-400 dark:border-emerald-700 text-xs font-mono font-black text-slate-900 dark:text-white"
                  />
                  <span className="absolute end-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                    {currencySymbol}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200/80 dark:border-slate-700">
                <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  {isAr ? 'المبيعات المطلوبة للهدف (Target Sales)' : 'Target Sales'}
                </div>
                <div className="text-base font-black text-slate-900 dark:text-white font-mono tabular-nums mt-0.5">
                  {formatMoney(monthlyStats.targetSales)} {currencySymbol}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200/80 dark:border-slate-700">
                <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  {isAr ? 'المتبقي للوصول للهدف' : 'Remaining to Target'}
                </div>
                <div className="text-base font-black text-amber-600 dark:text-amber-400 font-mono tabular-nums mt-0.5">
                  {formatMoney(monthlyStats.remainingSalesToTarget)} {currencySymbol}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200/80 dark:border-slate-700">
                <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  {isAr ? `البيع اليومي اللازم (${monthlyStats.remainingDays} يوم)` : `Daily Needed (${monthlyStats.remainingDays}d)`}
                </div>
                <div className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums mt-0.5">
                  {formatMoney(monthlyStats.dailySalesNeeded)} {currencySymbol}
                </div>
              </div>
            </div>

            {/* Target Progress Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">
                <span>{isAr ? 'التقدم نحو الهدف الشهري' : 'Monthly Target Progress'}</span>
                <span className="font-mono">{monthlyStats.targetProgressPct.toFixed(1)}%</span>
              </div>
              <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${monthlyStats.targetProgressPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3 SPECIFIC: YEARLY SEUIL + BEST MONTH / BEST DAY + 12-MONTH GREEN/RED CHART */}
      {periodTab === 'yearly' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'نقطة التعادل السنوية (Seuil Yearly)' : 'Seuil Yearly'}
              </div>
              <div className="text-lg font-black text-slate-900 dark:text-white font-mono tabular-nums mt-1">
                {formatMoney(yearlyStats.seuilYearly)} {currencySymbol}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {isAr ? 'لتغطية مصاريف واشتراكات وزكاة السنة' : 'Annual break-even sales'}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70">
              <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                <Award className="w-3.5 h-3.5" />
                <span>{isAr ? 'أفضل شهر (Best Month)' : 'Best Month'}</span>
              </div>
              <div className="text-lg font-black text-emerald-700 dark:text-emerald-300 mt-1">
                {yearlyStats.bestMonth.label}
              </div>
              <div className="text-[11px] font-mono font-bold text-emerald-700/90 dark:text-emerald-400">
                {yearlyStats.bestMonth.netProfit >= 0 ? '+' : ''}
                {formatMoney(yearlyStats.bestMonth.netProfit)} {currencySymbol}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/70">
              <div className="text-[11px] font-bold text-blue-800 dark:text-blue-300">
                {isAr ? 'أفضل يوم (Best Day)' : 'Best Day'}
              </div>
              <div className="text-base font-black text-blue-900 dark:text-blue-200 font-mono mt-1">
                {yearlyStats.bestDay.date}
              </div>
              <div className="text-[11px] font-mono font-bold text-blue-700 dark:text-blue-400">
                {formatMoney(yearlyStats.bestDay.sales)} {currencySymbol}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'متوسط الربح الشهري' : 'Avg Monthly Profit'}
              </div>
              <div
                className={`text-lg font-black font-mono tabular-nums mt-1 ${
                  yearlyStats.averageMonthlyProfit >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {yearlyStats.averageMonthlyProfit >= 0 ? '+' : ''}
                {formatMoney(yearlyStats.averageMonthlyProfit)} {currencySymbol}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">÷ 12 {isAr ? 'شهراً' : 'months'}</div>
            </div>

            <div
              className={`p-4 rounded-2xl border ${
                yearlyStats.netProfit >= 0
                  ? 'bg-emerald-50 dark:bg-emerald-950/45 border-emerald-300 dark:border-emerald-700'
                  : 'bg-rose-50 dark:bg-rose-950/45 border-rose-300 dark:border-rose-700'
              }`}
            >
              <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                {yearlyStats.netProfit >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                )}
                <span>{isAr ? 'صافي الربح السنوي' : 'Yearly Net Profit'}</span>
              </div>
              <div
                className={`text-lg font-black font-mono tabular-nums mt-1 ${
                  yearlyStats.netProfit >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {yearlyStats.netProfit >= 0 ? '+' : ''}
                {formatMoney(yearlyStats.netProfit)} {currencySymbol}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                {yearPrefix}
              </div>
            </div>
          </div>

          {/* 12 Months Net Profit Chart: Green above 0, Red below 0 */}
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                  {isAr
                    ? `أداء الـ 12 شهراً لسنة ${yearPrefix} (أخضر فوق الصفر · أحمر تحت الصفر)`
                    : `${yearPrefix} 12-Month Net Profit (Green > 0, Red < 0)`}
                </h4>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-bold">
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                  {isAr ? 'ربح صافي (> 0)' : 'Profit (> 0)'}
                </span>
                <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
                  {isAr ? 'عجز (< 0)' : 'Below 0'}
                </span>
              </div>
            </div>

            <div className="w-full h-64" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearlyStats.monthlyBuckets} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={isDark ? '#1e293b' : '#e2e8f0'}
                    strokeOpacity={isDark ? 0.85 : 0.6}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: isDark ? '#b7c6db' : '#64748b' }}
                    axisLine={{ stroke: isDark ? '#26344a' : '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: isDark ? '#b7c6db' : '#64748b' }}
                    axisLine={{ stroke: isDark ? '#26344a' : '#cbd5e1' }}
                    tickLine={false}
                  />
                  <ReferenceLine
                    y={0}
                    stroke={isDark ? '#94a3b8' : '#64748b'}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 font-mono border border-slate-700">
                          <div className="font-bold text-slate-200 font-sans mb-1">
                            {d.label} {yearPrefix}
                          </div>
                          <div className="text-slate-300">
                            {isAr ? 'المبيعات:' : 'Sales:'} {formatMoney(d.sales)} {currencySymbol}
                          </div>
                          <div className="text-slate-400">
                            {isAr ? 'التكلفة:' : 'Cost:'} −{formatMoney(d.cost)} {currencySymbol}
                          </div>
                          <div className="text-amber-300">
                            {isAr ? 'المصاريف والاشتراكات:' : 'Fixed:'} −{formatMoney(d.fixedCosts)} {currencySymbol}
                          </div>
                          <div
                            className={`pt-1 border-t border-slate-700 font-black ${
                              d.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isAr ? 'الصافي:' : 'Net:'} {d.netProfit >= 0 ? '+' : ''}
                            {formatMoney(d.netProfit)} {currencySymbol}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="netProfit" radius={[6, 6, 0, 0]} maxBarSize={36}>
                    {yearlyStats.monthlyBuckets.map((entry) => (
                      <Cell
                        key={`month-cell-${entry.monthIndex}`}
                        fill={entry.netProfit >= 0 ? '#10b981' : '#f43f5e'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Small note linking Seuil formula */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
        <span>
          {isAr
            ? `نقطة التعادل (${periodTab === 'daily' ? 'اليومية' : periodTab === 'monthly' ? 'الشهرية' : 'السنوية'}): `
            : 'Active Break-Even (Seuil): '}
          <strong className="font-mono text-slate-800 dark:text-slate-200">
            {formatMoney(activeSeuil)} {currencySymbol}
          </strong>
        </span>
        <span>
          {isAr
            ? `الهامش الحقيقي المعتمد: ${(activeData.marginRatio * 100).toFixed(1)}% · الزكاة السنوية من حاسبة الزكاة: ${formatMoney(yearlyZakat)} ${currencySymbol}`
            : `Real Margin: ${(activeData.marginRatio * 100).toFixed(1)}%`}
        </span>
      </div>
    </section>
  );
};
