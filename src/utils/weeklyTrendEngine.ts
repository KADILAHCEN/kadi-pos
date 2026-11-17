import {
  BourseMarketMode,
  Category,
  CpuQuarterRecord,
  Expense,
  Order,
  PaymentMethod,
  Product,
  StoreSettings
} from '../types';
import { getLocalTodayYMD } from './expenses';
import { DEFAULT_DAILY_FIXED_EXPENSES, getMarketModeMeta } from './bourseEngine';
import { ZakatSummary } from './zakat';

export type WeeklyWindowSize = 4 | 8 | 12;

export interface WeeklyBucket {
  weekKey: string; // YYYY-MM-DD (Monday)
  endKey: string; // YYYY-MM-DD (Sunday)
  shortLabel: string; // e.g. 11/10–16
  rangeLabel: string;
  isCurrentWeek: boolean;
  daysElapsed: number; // 1..7 for current week, 7 for closed weeks
  sales: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  subscriptions: number;
  zakat: number;
  netProfit: number;
  marginPct: number;
  netMarginPct: number;
  ordersCount: number;
  unitsSold: number;
  avgBasket: number;
  dailyRunRate: number;
  wowSalesChangePct: number | null;
  paceChangePct: number | null;
  wowNetProfitDelta: number | null;
  rollingAvgSales: number;
}

export interface Day7ComparisonPoint {
  date: string;
  displayDate: string;
  weekdayName: string;
  label: string;
  isToday: boolean;
  sales: number;
  prevWeekSales: number;
  grossProfit: number;
  netProfit: number;
  prevWeekNetProfit: number;
  ordersCount: number;
  dayOverDayPct: number;
  weekOverWeekPct: number;
}

export interface WeekdayPatternPoint {
  dayIndex: number; // 1 = Mon .. 7 = Sun
  jsDay: number; // 0 = Sun .. 6 = Sat
  name: string;
  shortName: string;
  occurrences: number;
  totalSales: number;
  avgSalesPerDay: number;
  totalGrossProfit: number;
  ordersCount: number;
  avgBasket: number;
  sharePct: number;
  isPeak: boolean;
  isSlowest: boolean;
}

export interface ProductWeeklyMover {
  productId: string;
  name: string;
  sku: string;
  stock: number;
  unitType: string;
  current7dSales: number;
  prior7dSales: number;
  deltaSales: number;
  deltaPct: number;
  current7dQty: number;
  prior7dQty: number;
  current7dProfit: number;
  marginPct: number;
}

export interface CategoryWeeklyTrend {
  categoryId: string;
  name: string;
  current7dSales: number;
  prior7dSales: number;
  deltaSales: number;
  deltaPct: number;
  sharePct: number;
}

export interface PaymentWeeklyShift {
  method: PaymentMethod;
  currentSales: number;
  priorSales: number;
  currentSharePct: number;
  priorSharePct: number;
  shareDeltaPts: number;
}

export type WeeklyTrendDirection = 'accelerating' | 'growing' | 'stable' | 'cooling' | 'no_data';

export interface WeeklyTrendSummary {
  windowWeeks: WeeklyWindowSize;
  marketMode: BourseMarketMode;
  todayYMD: string;
  totalOrdersInWindow: number;
  totalSalesInWindow: number;
  totalNetProfitInWindow: number;
  currentWeek: WeeklyBucket;
  previousWeek: WeeklyBucket | null;
  bestWeek: WeeklyBucket | null;
  peakWeekday: WeekdayPatternPoint | null;
  slowestWeekday: WeekdayPatternPoint | null;
  // Rolling 7d vs prior 7d
  last7dSales: number;
  prior7dSales: number;
  last7dNetProfit: number;
  prior7dNetProfit: number;
  last7dOrdersCount: number;
  prior7dOrdersCount: number;
  last7dAvgBasket: number;
  rolling7dGrowthPct: number;
  rolling7dDailyAvg: number;
  movingAverage4w: number;
  trendDirection: WeeklyTrendDirection;
  weeklyBuckets: WeeklyBucket[];
  dayByDay7d: Day7ComparisonPoint[];
  weekdayPattern: WeekdayPatternPoint[];
  risingProducts: ProductWeeklyMover[];
  coolingProducts: ProductWeeklyMover[];
  categoryTrends: CategoryWeeklyTrend[];
  paymentMixShift: PaymentWeeklyShift[];
}

function parseYmdMidday(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map((v) => parseInt(v, 10));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function formatDateYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toLocalYMD(dateInput: string): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return dateInput.slice(0, 10);
  return formatDateYMD(d);
}

function getMondayOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
  const jsDay = copy.getDay(); // 0 = Sun .. 6 = Sat
  const diffToMon = jsDay === 0 ? -6 : 1 - jsDay;
  copy.setDate(copy.getDate() + diffToMon);
  return copy;
}

function getOffsetYMD(baseYmd: string, daysAgo: number): string {
  const d = parseYmdMidday(baseYmd);
  d.setDate(d.getDate() - daysAgo);
  return formatDateYMD(d);
}

export function buildWeeklyTrendSummary(params: {
  orders: Order[];
  expenses: Expense[];
  products: Product[];
  categories: Category[];
  cpuRecords: CpuQuarterRecord[];
  zakatSummary: ZakatSummary;
  settings: StoreSettings;
  windowWeeks: WeeklyWindowSize;
  language: 'ar' | 'fr' | 'en';
}): WeeklyTrendSummary {
  const {
    orders,
    expenses,
    products,
    categories,
    cpuRecords,
    zakatSummary,
    settings,
    windowWeeks,
    language
  } = params;

  const locale = language === 'ar' ? 'ar-MA' : language === 'fr' ? 'fr-FR' : 'en-US';
  const todayYMD = getLocalTodayYMD();
  const todayMid = parseYmdMidday(todayYMD);
  const currentMonday = getMondayOfWeek(todayMid);
  const currentMondayYMD = formatDateYMD(currentMonday);
  const todayMonIndex = todayMid.getDay() === 0 ? 7 : todayMid.getDay(); // 1..7

  const marketMode: BourseMarketMode = settings.marketMode || 'normal';
  const { costShockFactor } = getMarketModeMeta(marketMode);

  const productMap = new Map<string, Product>();
  products.forEach((p) => productMap.set(p.id, p));

  const categoryNameMap = new Map<string, string>();
  categories.forEach((c) => {
    categoryNameMap.set(
      c.id,
      language === 'ar' ? c.name : c.nameEn || c.name
    );
  });

  const computeOrderCost = (o: Order): number => {
    if (o.items && o.items.length > 0) {
      return o.items.reduce((sum, it) => {
        const live = productMap.get(it.productId);
        const unitCost = live ? Number(live.costPrice) || 0 : Number(it.costPrice) || 0;
        return sum + unitCost * costShockFactor * (Number(it.quantity) || 0);
      }, 0);
    }
    return (Number(o.costTotal) || 0) * costShockFactor;
  };

  // Linked overhead, subscriptions & zakat per day
  const fixedDailyTotal =
    Math.max(0, Number(settings.dailyFixedExpenses?.rentPerDay ?? DEFAULT_DAILY_FIXED_EXPENSES.rentPerDay) || 0) +
    Math.max(0, Number(settings.dailyFixedExpenses?.electricityPerDay ?? DEFAULT_DAILY_FIXED_EXPENSES.electricityPerDay) || 0) +
    Math.max(0, Number(settings.dailyFixedExpenses?.internetPerDay ?? DEFAULT_DAILY_FIXED_EXPENSES.internetPerDay) || 0) +
    Math.max(0, Number(settings.dailyFixedExpenses?.transportPerDay ?? DEFAULT_DAILY_FIXED_EXPENSES.transportPerDay) || 0) +
    Math.max(0, Number(settings.dailyFixedExpenses?.otherPerDay ?? DEFAULT_DAILY_FIXED_EXPENSES.otherPerDay) || 0);

  let monthlyCpuAmoBase = 0;
  if (cpuRecords && cpuRecords.length > 0) {
    const qWeight: Record<string, number> = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
    const latest = [...cpuRecords].sort(
      (a, b) => b.year * 10 + (qWeight[b.quarter] || 0) - (a.year * 10 + (qWeight[a.quarter] || 0))
    )[0];
    const mCpu = (Number(latest.calculatedTax) || 0) / 3;
    const mAmo = Number(latest.monthlyAmo) || (Number(latest.quarterlyAmo) || 0) / 3;
    const mRet = Number(latest.monthlyRetirement) || (Number(latest.quarterlyRetirement) || 0) / 3;
    monthlyCpuAmoBase = mCpu + mAmo + mRet;
  }
  const dailyCpuAmoBase = monthlyCpuAmoBase / 30;
  const dailyZakat = (Number(zakatSummary.zakatDue) || 0) / 365;
  const subsPct = Math.max(0, Number(settings.subscriptionsSalesPct ?? 3)) / 100;

  // Build ordered list of week slots (oldest -> current)
  type WeekAccum = {
    weekKey: string;
    endKey: string;
    shortLabel: string;
    rangeLabel: string;
    isCurrentWeek: boolean;
    daysElapsed: number;
    sales: number;
    cogs: number;
    loggedExpenses: number;
    ordersCount: number;
    unitsSold: number;
  };

  const weekMap = new Map<string, WeekAccum>();
  const weekKeysOrder: string[] = [];

  for (let wAgo = windowWeeks - 1; wAgo >= 0; wAgo--) {
    const mon = new Date(currentMonday);
    mon.setDate(mon.getDate() - wAgo * 7);
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    const weekKey = formatDateYMD(mon);
    const endKey = formatDateYMD(sun);
    const isCurrentWeek = weekKey === currentMondayYMD;
    const shortStart = `${mon.getMonth() + 1}/${mon.getDate()}`;
    const shortEnd = `${sun.getMonth() + 1}/${sun.getDate()}`;
    const rangeStart = mon.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    const rangeEnd = sun.toLocaleDateString(locale, { month: 'short', day: 'numeric' });

    weekKeysOrder.push(weekKey);
    weekMap.set(weekKey, {
      weekKey,
      endKey,
      shortLabel: isCurrentWeek
        ? language === 'ar'
          ? 'هذا الأسبوع'
          : language === 'fr'
          ? 'Cette sem.'
          : 'This Week'
        : `${shortStart}–${shortEnd}`,
      rangeLabel: `${rangeStart} – ${rangeEnd}`,
      isCurrentWeek,
      daysElapsed: isCurrentWeek ? todayMonIndex : 7,
      sales: 0,
      cogs: 0,
      loggedExpenses: 0,
      ordersCount: 0,
      unitsSold: 0
    });
  }

  // Rolling 7d & prior 7d windows
  const last7Keys: string[] = [];
  const prior7Keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    last7Keys.push(getOffsetYMD(todayYMD, i));
  }
  for (let i = 13; i >= 7; i--) {
    prior7Keys.push(getOffsetYMD(todayYMD, i));
  }
  const last7Set = new Set(last7Keys);
  const prior7Set = new Set(prior7Keys);

  const dayAgg = new Map<
    string,
    { sales: number; cogs: number; ordersCount: number; loggedExpenses: number }
  >();
  [...prior7Keys, ...last7Keys].forEach((k) => {
    dayAgg.set(k, { sales: 0, cogs: 0, ordersCount: 0, loggedExpenses: 0 });
  });

  // Weekday pattern accumulators across the full window (from earliest week Monday -> todayYMD)
  const earliestYmd = weekKeysOrder[0];
  const weekdayAcc = new Map<
    number,
    {
      dayIndex: number;
      jsDay: number;
      totalSales: number;
      totalGrossProfit: number;
      ordersCount: number;
      dateSet: Set<string>;
    }
  >();
  // Initialize 1=Mon .. 7=Sun
  for (let di = 1; di <= 7; di++) {
    const jsDay = di === 7 ? 0 : di;
    weekdayAcc.set(di, {
      dayIndex: di,
      jsDay,
      totalSales: 0,
      totalGrossProfit: 0,
      ordersCount: 0,
      dateSet: new Set()
    });
  }
  // Pre-count calendar occurrences of each weekday inside [earliestYmd .. todayYMD]
  {
    const cursor = parseYmdMidday(earliestYmd);
    const endMid = parseYmdMidday(todayYMD);
    while (cursor <= endMid) {
      const di = cursor.getDay() === 0 ? 7 : cursor.getDay();
      weekdayAcc.get(di)?.dateSet.add(formatDateYMD(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // Product & Category 7d vs prior 7d maps
  const prodStats = new Map<
    string,
    {
      name: string;
      sku: string;
      current7dSales: number;
      prior7dSales: number;
      current7dQty: number;
      prior7dQty: number;
      current7dProfit: number;
    }
  >();
  const catStats = new Map<string, { current7dSales: number; prior7dSales: number }>();

  const payMethods: PaymentMethod[] = ['cash', 'card', 'apple_pay', 'split', 'credit'];
  const paymentCurr = new Map<PaymentMethod, number>();
  const paymentPrior = new Map<PaymentMethod, number>();
  payMethods.forEach((m) => {
    paymentCurr.set(m, 0);
    paymentPrior.set(m, 0);
  });

  const completedOrders = orders.filter((o) => o.status === 'completed');

  completedOrders.forEach((o) => {
    const ymd = toLocalYMD(o.date);
    if (!ymd) return;
    const orderSales = Number(o.grandTotal) || 0;
    const orderCost = computeOrderCost(o);
    const orderGross = orderSales - orderCost;
    const orderUnits = (o.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);

    // 1. Weekly calendar buckets
    const dMid = parseYmdMidday(ymd);
    const monKey = formatDateYMD(getMondayOfWeek(dMid));
    const bucket = weekMap.get(monKey);
    if (bucket) {
      bucket.sales += orderSales;
      bucket.cogs += orderCost;
      bucket.ordersCount += 1;
      bucket.unitsSold += orderUnits;
    }

    // 2. Weekday pattern (within window up to today)
    if (ymd >= earliestYmd && ymd <= todayYMD) {
      const di = dMid.getDay() === 0 ? 7 : dMid.getDay();
      const wd = weekdayAcc.get(di);
      if (wd) {
        wd.totalSales += orderSales;
        wd.totalGrossProfit += orderGross;
        wd.ordersCount += 1;
      }
    }

    // 3. Rolling 14 days daily buckets
    const dEntry = dayAgg.get(ymd);
    if (dEntry) {
      dEntry.sales += orderSales;
      dEntry.cogs += orderCost;
      dEntry.ordersCount += 1;
    }

    // 4. Product, category, payment mix (7d vs prior 7d)
    const isLast7 = last7Set.has(ymd);
    const isPrior7 = prior7Set.has(ymd);
    if (isLast7 || isPrior7) {
      if (isLast7) {
        paymentCurr.set(o.paymentMethod, (paymentCurr.get(o.paymentMethod) || 0) + orderSales);
      } else {
        paymentPrior.set(o.paymentMethod, (paymentPrior.get(o.paymentMethod) || 0) + orderSales);
      }

      (o.items || []).forEach((it) => {
        const live = productMap.get(it.productId);
        const qty = Number(it.quantity) || 0;
        const lineSales = Number(it.total) || Number(it.price) * qty;
        const unitCost = live ? Number(live.costPrice) || 0 : Number(it.costPrice) || 0;
        const lineProfit = lineSales - unitCost * costShockFactor * qty;

        const existing = prodStats.get(it.productId) || {
          name: live?.name || it.productName,
          sku: live?.sku || '',
          current7dSales: 0,
          prior7dSales: 0,
          current7dQty: 0,
          prior7dQty: 0,
          current7dProfit: 0
        };
        if (isLast7) {
          existing.current7dSales += lineSales;
          existing.current7dQty += qty;
          existing.current7dProfit += lineProfit;
        } else {
          existing.prior7dSales += lineSales;
          existing.prior7dQty += qty;
        }
        prodStats.set(it.productId, existing);

        const catId = live?.categoryId || 'uncategorized';
        const cEntry = catStats.get(catId) || { current7dSales: 0, prior7dSales: 0 };
        if (isLast7) cEntry.current7dSales += lineSales;
        else cEntry.prior7dSales += lineSales;
        catStats.set(catId, cEntry);
      });
    }
  });

  // Aggregate logged expenses into weekly buckets and daily 14d buckets
  expenses.forEach((exp) => {
    const ymd = toLocalYMD(exp.date || exp.createdAt);
    if (!ymd) return;
    const amt = Math.max(0, Number(exp.amount) || 0);

    const monKey = formatDateYMD(getMondayOfWeek(parseYmdMidday(ymd)));
    const bucket = weekMap.get(monKey);
    if (bucket) {
      bucket.loggedExpenses += amt;
    }
    const dEntry = dayAgg.get(ymd);
    if (dEntry) {
      dEntry.loggedExpenses += amt;
    }
  });

  // Finalize WeeklyBuckets with WoW deltas and 4-week rolling average
  const rawBuckets = weekKeysOrder.map((k) => weekMap.get(k)!);
  const weeklyBuckets: WeeklyBucket[] = rawBuckets.map((b, idx) => {
    const grossProfit = b.sales - b.cogs;
    const expensesTotal = fixedDailyTotal * b.daysElapsed + b.loggedExpenses;
    const subscriptionsTotal = b.sales * subsPct + dailyCpuAmoBase * b.daysElapsed;
    const zakatTotal = dailyZakat * b.daysElapsed;
    const netProfit = grossProfit - expensesTotal - subscriptionsTotal - zakatTotal;
    const marginPct = b.sales > 0 ? (grossProfit / b.sales) * 100 : 0;
    const netMarginPct = b.sales > 0 ? (netProfit / b.sales) * 100 : 0;
    const avgBasket = b.ordersCount > 0 ? b.sales / b.ordersCount : 0;
    const dailyRunRate = b.sales / Math.max(1, b.daysElapsed);

    // 4-week rolling average up to idx
    const sliceStart = Math.max(0, idx - 3);
    const slice = rawBuckets.slice(sliceStart, idx + 1);
    const rollingAvgSales =
      slice.reduce((sum, s) => sum + s.sales, 0) / Math.max(1, slice.length);

    return {
      weekKey: b.weekKey,
      endKey: b.endKey,
      shortLabel: b.shortLabel,
      rangeLabel: b.rangeLabel,
      isCurrentWeek: b.isCurrentWeek,
      daysElapsed: b.daysElapsed,
      sales: Number(b.sales.toFixed(2)),
      cogs: Number(b.cogs.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      expenses: Number(expensesTotal.toFixed(2)),
      subscriptions: Number(subscriptionsTotal.toFixed(2)),
      zakat: Number(zakatTotal.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2)),
      marginPct: Number(marginPct.toFixed(1)),
      netMarginPct: Number(netMarginPct.toFixed(1)),
      ordersCount: b.ordersCount,
      unitsSold: Number(b.unitsSold.toFixed(2)),
      avgBasket: Number(avgBasket.toFixed(2)),
      dailyRunRate: Number(dailyRunRate.toFixed(2)),
      wowSalesChangePct: null,
      paceChangePct: null,
      wowNetProfitDelta: null,
      rollingAvgSales: Number(rollingAvgSales.toFixed(2))
    };
  });

  weeklyBuckets.forEach((wb, idx) => {
    if (idx === 0) return;
    const prev = weeklyBuckets[idx - 1];
    if (prev.sales > 0) {
      wb.wowSalesChangePct = Number((((wb.sales - prev.sales) / prev.sales) * 100).toFixed(1));
    } else if (wb.sales > 0) {
      wb.wowSalesChangePct = 100;
    }

    if (prev.dailyRunRate > 0) {
      wb.paceChangePct = Number(
        (((wb.dailyRunRate - prev.dailyRunRate) / prev.dailyRunRate) * 100).toFixed(1)
      );
    } else if (wb.dailyRunRate > 0) {
      wb.paceChangePct = 100;
    }

    wb.wowNetProfitDelta = Number((wb.netProfit - prev.netProfit).toFixed(2));
  });

  // Finalize 7-day rolling comparison
  const computeDayNet = (sales: number, cogs: number, loggedExp: number) => {
    const gross = sales - cogs;
    const exp = fixedDailyTotal + loggedExp;
    const subs = sales * subsPct + dailyCpuAmoBase;
    return gross - exp - subs - dailyZakat;
  };

  const dayByDay7d: Day7ComparisonPoint[] = last7Keys.map((ymd, idx) => {
    const cur = dayAgg.get(ymd)!;
    const prevWeekYmd = prior7Keys[idx];
    const prevWeek = dayAgg.get(prevWeekYmd)!;
    const prevDayYmd = idx > 0 ? last7Keys[idx - 1] : prior7Keys[prior7Keys.length - 1];
    const prevDay = dayAgg.get(prevDayYmd)!;

    const dObj = parseYmdMidday(ymd);
    const displayDate = `${dObj.getDate()}/${dObj.getMonth() + 1}`;
    const weekdayName = dObj.toLocaleDateString(locale, { weekday: 'short' });

    const grossProfit = cur.sales - cur.cogs;
    const netProfit = computeDayNet(cur.sales, cur.cogs, cur.loggedExpenses);
    const prevWeekNetProfit = computeDayNet(
      prevWeek.sales,
      prevWeek.cogs,
      prevWeek.loggedExpenses
    );

    const dayOverDayPct =
      prevDay.sales > 0
        ? Number((((cur.sales - prevDay.sales) / prevDay.sales) * 100).toFixed(1))
        : cur.sales > 0
        ? 100
        : 0;
    const weekOverWeekPct =
      prevWeek.sales > 0
        ? Number((((cur.sales - prevWeek.sales) / prevWeek.sales) * 100).toFixed(1))
        : cur.sales > 0
        ? 100
        : 0;

    return {
      date: ymd,
      displayDate,
      weekdayName,
      label: `${weekdayName} ${displayDate}`,
      isToday: ymd === todayYMD,
      sales: Number(cur.sales.toFixed(2)),
      prevWeekSales: Number(prevWeek.sales.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2)),
      prevWeekNetProfit: Number(prevWeekNetProfit.toFixed(2)),
      ordersCount: cur.ordersCount,
      dayOverDayPct,
      weekOverWeekPct
    };
  });

  const last7dSales = Number(dayByDay7d.reduce((s, d) => s + d.sales, 0).toFixed(2));
  const prior7dSales = Number(
    prior7Keys.reduce((s, k) => s + (dayAgg.get(k)?.sales || 0), 0).toFixed(2)
  );
  const last7dNetProfit = Number(dayByDay7d.reduce((s, d) => s + d.netProfit, 0).toFixed(2));
  const prior7dNetProfit = Number(
    dayByDay7d.reduce((s, d) => s + d.prevWeekNetProfit, 0).toFixed(2)
  );
  const last7dOrdersCount = dayByDay7d.reduce((s, d) => s + d.ordersCount, 0);
  const prior7dOrdersCount = prior7Keys.reduce(
    (s, k) => s + (dayAgg.get(k)?.ordersCount || 0),
    0
  );
  const last7dAvgBasket =
    last7dOrdersCount > 0 ? Number((last7dSales / last7dOrdersCount).toFixed(2)) : 0;
  const rolling7dDailyAvg = Number((last7dSales / 7).toFixed(2));
  const rolling7dGrowthPct =
    prior7dSales > 0
      ? Number((((last7dSales - prior7dSales) / prior7dSales) * 100).toFixed(1))
      : last7dSales > 0
      ? 100
      : 0;

  // Finalize Weekday Pattern
  const totalWindowSales = weeklyBuckets.reduce((s, w) => s + w.sales, 0);
  const weekdayNamesRef: Record<number, { ar: string; fr: string; en: string; shortAr: string; shortFr: string; shortEn: string }> = {
    1: { ar: 'الإثنين', fr: 'Lundi', en: 'Monday', shortAr: 'إثنين', shortFr: 'Lun', shortEn: 'Mon' },
    2: { ar: 'الثلاثاء', fr: 'Mardi', en: 'Tuesday', shortAr: 'ثلاثاء', shortFr: 'Mar', shortEn: 'Tue' },
    3: { ar: 'الأربعاء', fr: 'Mercredi', en: 'Wednesday', shortAr: 'أربعاء', shortFr: 'Mer', shortEn: 'Wed' },
    4: { ar: 'الخميس', fr: 'Jeudi', en: 'Thursday', shortAr: 'خميس', shortFr: 'Jeu', shortEn: 'Thu' },
    5: { ar: 'الجمعة', fr: 'Vendredi', en: 'Friday', shortAr: 'جمعة', shortFr: 'Ven', shortEn: 'Fri' },
    6: { ar: 'السبت', fr: 'Samedi', en: 'Saturday', shortAr: 'سبت', shortFr: 'Sam', shortEn: 'Sat' },
    7: { ar: 'الأحد', fr: 'Dimanche', en: 'Sunday', shortAr: 'أحد', shortFr: 'Dim', shortEn: 'Sun' }
  };

  const weekdayPatternRaw: WeekdayPatternPoint[] = [];
  for (let di = 1; di <= 7; di++) {
    const acc = weekdayAcc.get(di)!;
    const occ = Math.max(1, acc.dateSet.size);
    const meta = weekdayNamesRef[di];
    const avgSalesPerDay = acc.totalSales / occ;
    const avgBasket = acc.ordersCount > 0 ? acc.totalSales / acc.ordersCount : 0;
    const sharePct = totalWindowSales > 0 ? (acc.totalSales / totalWindowSales) * 100 : 0;
    weekdayPatternRaw.push({
      dayIndex: di,
      jsDay: acc.jsDay,
      name: language === 'ar' ? meta.ar : language === 'fr' ? meta.fr : meta.en,
      shortName: language === 'ar' ? meta.shortAr : language === 'fr' ? meta.shortFr : meta.shortEn,
      occurrences: occ,
      totalSales: Number(acc.totalSales.toFixed(2)),
      avgSalesPerDay: Number(avgSalesPerDay.toFixed(2)),
      totalGrossProfit: Number(acc.totalGrossProfit.toFixed(2)),
      ordersCount: acc.ordersCount,
      avgBasket: Number(avgBasket.toFixed(2)),
      sharePct: Number(sharePct.toFixed(1)),
      isPeak: false,
      isSlowest: false
    });
  }

  const nonZeroWeekdays = weekdayPatternRaw.filter((w) => w.totalSales > 0);
  let peakWeekday: WeekdayPatternPoint | null = null;
  let slowestWeekday: WeekdayPatternPoint | null = null;
  if (nonZeroWeekdays.length > 0) {
    peakWeekday = nonZeroWeekdays.reduce(
      (max, cur) => (cur.avgSalesPerDay > max.avgSalesPerDay ? cur : max),
      nonZeroWeekdays[0]
    );
    slowestWeekday = weekdayPatternRaw.reduce(
      (min, cur) => (cur.avgSalesPerDay < min.avgSalesPerDay ? cur : min),
      weekdayPatternRaw[0]
    );
    weekdayPatternRaw.forEach((w) => {
      if (peakWeekday && w.dayIndex === peakWeekday.dayIndex) w.isPeak = true;
      if (slowestWeekday && w.dayIndex === slowestWeekday.dayIndex && nonZeroWeekdays.length > 1) {
        w.isSlowest = true;
      }
    });
  }

  // Product Movers (Rising & Cooling)
  const moversAll: ProductWeeklyMover[] = Array.from(prodStats.entries()).map(([pid, st]) => {
    const prod = productMap.get(pid);
    const deltaSales = Number((st.current7dSales - st.prior7dSales).toFixed(2));
    const deltaPct =
      st.prior7dSales > 0
        ? Number((((st.current7dSales - st.prior7dSales) / st.prior7dSales) * 100).toFixed(1))
        : st.current7dSales > 0
        ? 100
        : 0;
    const marginPct =
      st.current7dSales > 0
        ? Number(((st.current7dProfit / st.current7dSales) * 100).toFixed(1))
        : prod && prod.price > 0
        ? Number((((prod.price - prod.costPrice * costShockFactor) / prod.price) * 100).toFixed(1))
        : 0;

    return {
      productId: pid,
      name: st.name,
      sku: st.sku,
      stock: prod ? Number(prod.stock) || 0 : 0,
      unitType: prod?.unitType || 'piece',
      current7dSales: Number(st.current7dSales.toFixed(2)),
      prior7dSales: Number(st.prior7dSales.toFixed(2)),
      deltaSales,
      deltaPct,
      current7dQty: Number(st.current7dQty.toFixed(2)),
      prior7dQty: Number(st.prior7dQty.toFixed(2)),
      current7dProfit: Number(st.current7dProfit.toFixed(2)),
      marginPct
    };
  });

  const risingProducts = [...moversAll]
    .filter((m) => m.deltaSales > 0 || (m.current7dSales > 0 && m.prior7dSales === 0))
    .sort((a, b) => b.deltaSales - a.deltaSales || b.current7dSales - a.current7dSales)
    .slice(0, 5);

  const coolingProducts = [...moversAll]
    .filter((m) => m.deltaSales < 0)
    .sort((a, b) => a.deltaSales - b.deltaSales)
    .slice(0, 5);

  // Category Trends
  const totalCat7d = Array.from(catStats.values()).reduce((s, c) => s + c.current7dSales, 0);
  const categoryTrends: CategoryWeeklyTrend[] = Array.from(catStats.entries())
    .map(([cid, c]) => {
      const deltaSales = Number((c.current7dSales - c.prior7dSales).toFixed(2));
      const deltaPct =
        c.prior7dSales > 0
          ? Number((((c.current7dSales - c.prior7dSales) / c.prior7dSales) * 100).toFixed(1))
          : c.current7dSales > 0
          ? 100
          : 0;
      const sharePct = totalCat7d > 0 ? Number(((c.current7dSales / totalCat7d) * 100).toFixed(1)) : 0;
      return {
        categoryId: cid,
        name:
          categoryNameMap.get(cid) ||
          (language === 'ar' ? 'أصناف عامة' : 'General'),
        current7dSales: Number(c.current7dSales.toFixed(2)),
        prior7dSales: Number(c.prior7dSales.toFixed(2)),
        deltaSales,
        deltaPct,
        sharePct
      };
    })
    .filter((c) => c.current7dSales > 0 || c.prior7dSales > 0)
    .sort((a, b) => b.current7dSales - a.current7dSales)
    .slice(0, 6);

  // Payment Mix Shift
  const payCurrTotal = payMethods.reduce((s, m) => s + (paymentCurr.get(m) || 0), 0);
  const payPriorTotal = payMethods.reduce((s, m) => s + (paymentPrior.get(m) || 0), 0);
  const paymentMixShift: PaymentWeeklyShift[] = payMethods
    .map((m) => {
      const cSales = Number((paymentCurr.get(m) || 0).toFixed(2));
      const pSales = Number((paymentPrior.get(m) || 0).toFixed(2));
      const cShare = payCurrTotal > 0 ? Number(((cSales / payCurrTotal) * 100).toFixed(1)) : 0;
      const pShare = payPriorTotal > 0 ? Number(((pSales / payPriorTotal) * 100).toFixed(1)) : 0;
      return {
        method: m,
        currentSales: cSales,
        priorSales: pSales,
        currentSharePct: cShare,
        priorSharePct: pShare,
        shareDeltaPts: Number((cShare - pShare).toFixed(1))
      };
    })
    .filter((p) => p.currentSales > 0 || p.priorSales > 0);

  const currentWeek = weeklyBuckets[weeklyBuckets.length - 1];
  const previousWeek =
    weeklyBuckets.length >= 2 ? weeklyBuckets[weeklyBuckets.length - 2] : null;
  const totalOrdersInWindow = weeklyBuckets.reduce((s, w) => s + w.ordersCount, 0);
  const totalNetProfitInWindow = Number(
    weeklyBuckets.reduce((s, w) => s + w.netProfit, 0).toFixed(2)
  );
  const movingAverage4w = currentWeek ? currentWeek.rollingAvgSales : 0;

  const activeWeeks = weeklyBuckets.filter((w) => w.sales > 0);
  const bestWeek =
    activeWeeks.length > 0
      ? activeWeeks.reduce((best, cur) => (cur.sales > best.sales ? cur : best), activeWeeks[0])
      : null;

  let trendDirection: WeeklyTrendDirection = 'no_data';
  if (totalOrdersInWindow > 0 || last7dSales > 0 || prior7dSales > 0) {
    const refPct =
      prior7dSales > 0
        ? rolling7dGrowthPct
        : currentWeek?.paceChangePct ?? 0;
    if (refPct >= 12) trendDirection = 'accelerating';
    else if (refPct >= 3) trendDirection = 'growing';
    else if (refPct <= -5) trendDirection = 'cooling';
    else trendDirection = 'stable';
  }

  return {
    windowWeeks,
    marketMode,
    todayYMD,
    totalOrdersInWindow,
    totalSalesInWindow: Number(totalWindowSales.toFixed(2)),
    totalNetProfitInWindow,
    currentWeek,
    previousWeek,
    bestWeek,
    peakWeekday,
    slowestWeekday,
    last7dSales,
    prior7dSales,
    last7dNetProfit,
    prior7dNetProfit,
    last7dOrdersCount,
    prior7dOrdersCount,
    last7dAvgBasket,
    rolling7dGrowthPct,
    rolling7dDailyAvg,
    movingAverage4w,
    trendDirection,
    weeklyBuckets,
    dayByDay7d,
    weekdayPattern: weekdayPatternRaw,
    risingProducts,
    coolingProducts,
    categoryTrends,
    paymentMixShift
  };
}
