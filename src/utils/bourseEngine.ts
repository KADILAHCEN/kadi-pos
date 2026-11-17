import {
  BourseMarketMode,
  CpuQuarterRecord,
  DailyFixedExpenses,
  Expense,
  Order,
  Product,
  StoreSettings
} from '../types';
import { getLocalTodayYMD } from './expenses';
import { ZakatSummary } from './zakat';

export type BourseAdvisorAction =
  | 'BUY_MORE'
  | 'SELL_NOW'
  | 'STOP'
  | 'DISCOUNT'
  | 'INCREASE_PRICE';

export type BourseExpiryStatus = 'expired' | 'critical' | 'soon' | 'ok' | 'none';

export interface BourseProductSeriesPoint {
  ymd: string;
  label: string;
  sales: number;
  qty: number;
  profit: number;
}

export interface BourseProductInvoiceEntry {
  orderId: string;
  orderNumber: string;
  date: string;
  qty: number;
  sales: number;
  grossProfit: number;
  expensesAndSubsShare: number;
  netProfit: number;
}

export interface BourseProductStock {
  id: string;
  name: string;
  nameEn?: string;
  sku: string;
  categoryId: string;
  image?: string;
  salePrice: number;
  purchasePrice: number;
  effectivePurchasePrice: number;
  unitProfit: number;
  marginPct: number;
  stock: number;
  lowStockThreshold: number;
  unitType: string;
  expiryDate?: string;
  daysToExpiry: number | null;
  expiryStatus: BourseExpiryStatus;
  stockCostValue: number;
  stockRetailValue: number;
  todaySales: number;
  todayQty: number;
  todayProfit: number;
  yesterdaySales: number;
  yesterdayQty: number;
  weekSales: number;
  weekQty: number;
  monthSales: number;
  monthQty: number;
  monthProfit: number;
  totalSales: number;
  totalQty: number;
  totalProfit: number;
  changePct: number;
  trend: 'up' | 'down' | 'flat';
  expensesShareToday: number;
  subscriptionsShareToday: number;
  expensesShareMonth: number;
  netProfitAfterShareToday: number;
  netProfitAfterShareMonth: number;
  salesWeightPct: number;
  invoicesCount: number;
  todayInvoicesCount: number;
  avgNetProfitPerInvoice: number;
  recentInvoices: BourseProductInvoiceEntry[];
  forecastDailySales: number;
  series: BourseProductSeriesPoint[];
  advisor: {
    action: BourseAdvisorAction;
    titleDarija: string;
    reasonDarija: string;
    tone: 'green' | 'red' | 'amber';
  };
}

export interface BourseHanoutIndex {
  todayYMD: string;
  yesterdayYMD: string;
  marketMode: BourseMarketMode;
  demandMultiplier: number;
  costShockFactor: number;
  todaySales: number;
  yesterdaySales: number;
  changePctVsYesterday: number;
  indexTrend: 'up' | 'down' | 'flat';
  todayOrdersCount: number;
  todayGrossProfit: number;
  dailyFixedExpenses: DailyFixedExpenses;
  dailyFixedExpensesTotal: number;
  todayDirectExpenses: number;
  todayAmortizedExpenses: number;
  todayExpensesTotal: number;
  subscriptionsSalesPct: number;
  suggestedCpuTurnoverPct: number;
  todayDynamicSubscriptions: number;
  todayCpuAmoDaily: number;
  todaySubscriptionsTotal: number;
  todayZakatDaily: number;
  todayFixedOverhead: number;
  netProfitToday: number;
  forecastTodaySales: number;
  forecastTodayNetProfit: number;
  breakEvenSalesToday: number;
  breakEvenState: 'profit' | 'even' | 'loss';
  remainingToBreakEven: number;
  breakEvenProgressPct: number;
  isBreakEvenReached: boolean;
  monthSales: number;
  monthGrossProfit: number;
  monthExpensesTotal: number;
  monthSubscriptionsTotal: number;
  monthNetProfit: number;
  yearSales: number;
  yearGrossProfit: number;
  yearExpensesTotal: number;
  yearSubscriptionsTotal: number;
  yearNetProfit: number;
  yearlyTarget: number;
  remainingYearlyTarget: number;
  yearlyProgressPct: number;
  requiredDailySalesForYearTarget: number;
  totalStockCostValue: number;
  totalStockRetailValue: number;
  potentialStockProfit: number;
  averageMarginPct: number;
  expiringProductsCount: number;
}

export interface BourseSnapshot {
  index: BourseHanoutIndex;
  stocks: BourseProductStock[];
  topGainers: BourseProductStock[];
  topLosers: BourseProductStock[];
  counts: {
    buyMore: number;
    sellNow: number;
    increasePrice: number;
    discount: number;
    stop: number;
    expiring: number;
  };
}

export const DEFAULT_DAILY_FIXED_EXPENSES: DailyFixedExpenses = {
  rentPerDay: 50,
  electricityPerDay: 15,
  internetPerDay: 5,
  transportPerDay: 10,
  otherPerDay: 5
};

export function getMarketModeMeta(mode: BourseMarketMode): {
  mode: BourseMarketMode;
  demandMultiplier: number;
  costShockFactor: number;
  labelAr: string;
  labelEn: string;
  descAr: string;
} {
  switch (mode) {
    case 'high_season':
      return {
        mode,
        demandMultiplier: 1.25,
        costShockFactor: 1.0,
        labelAr: 'موسم طالع (+25%)',
        labelEn: 'High Season (+25%)',
        descAr: 'الطلب كيزيد بـ 25% — التوقعات والربح طالعين'
      };
    case 'low_season':
      return {
        mode,
        demandMultiplier: 0.8,
        costShockFactor: 1.0,
        labelAr: 'وقت هابط (-20%)',
        labelEn: 'Low Season (-20%)',
        descAr: 'حركة السوق تقيلة (-20%) — ركّز على البرومو'
      };
    case 'purchase_increase':
      return {
        mode,
        demandMultiplier: 1.0,
        costShockFactor: 1.12,
        labelAr: 'زيادة ثمن الشراء (+12%)',
        labelEn: 'Purchase Cost +12%',
        descAr: 'سلعة الجملة تزادت (+12%) — راقب الهامش وثمن البيع'
      };
    case 'normal':
    default:
      return {
        mode: 'normal',
        demandMultiplier: 1.0,
        costShockFactor: 1.0,
        labelAr: 'سوق عادي (Normal)',
        labelEn: 'Normal Market',
        descAr: 'الحركة عادية وثابتة في الحانوت'
      };
  }
}

function toLocalYMD(dateInput: string): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return dateInput.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getOffsetYMD(daysAgo: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computeDaysToExpiry(expiryDate?: string, todayYMD?: string): {
  daysToExpiry: number | null;
  expiryStatus: BourseExpiryStatus;
} {
  if (!expiryDate || !expiryDate.trim()) {
    return { daysToExpiry: null, expiryStatus: 'none' };
  }
  const baseYmd = todayYMD || getLocalTodayYMD();
  const todayMid = new Date(`${baseYmd}T00:00:00`).getTime();
  const expMid = new Date(`${expiryDate.slice(0, 10)}T00:00:00`).getTime();
  if (Number.isNaN(expMid) || Number.isNaN(todayMid)) {
    return { daysToExpiry: null, expiryStatus: 'none' };
  }
  const days = Math.round((expMid - todayMid) / 86_400_000);
  if (days < 0) return { daysToExpiry: days, expiryStatus: 'expired' };
  if (days <= 7) return { daysToExpiry: days, expiryStatus: 'critical' };
  if (days <= 30) return { daysToExpiry: days, expiryStatus: 'soon' };
  return { daysToExpiry: days, expiryStatus: 'ok' };
}

export function buildBourseSnapshot(params: {
  products: Product[];
  orders: Order[];
  expenses: Expense[];
  cpuRecords: CpuQuarterRecord[];
  zakatSummary: ZakatSummary;
  settings: StoreSettings;
}): BourseSnapshot {
  const { products, orders, expenses, cpuRecords, zakatSummary, settings } = params;

  const todayYMD = getLocalTodayYMD();
  const yesterdayYMD = getOffsetYMD(1);
  const monthPrefix = todayYMD.slice(0, 7);
  const yearPrefix = todayYMD.slice(0, 4);

  const marketMode: BourseMarketMode = settings.marketMode || 'normal';
  const modeMeta = getMarketModeMeta(marketMode);
  const { demandMultiplier, costShockFactor } = modeMeta;

  const dailyFixedExpenses: DailyFixedExpenses = {
    rentPerDay: Math.max(0, Number(settings.dailyFixedExpenses?.rentPerDay ?? DEFAULT_DAILY_FIXED_EXPENSES.rentPerDay) || 0),
    electricityPerDay: Math.max(0, Number(settings.dailyFixedExpenses?.electricityPerDay ?? DEFAULT_DAILY_FIXED_EXPENSES.electricityPerDay) || 0),
    internetPerDay: Math.max(0, Number(settings.dailyFixedExpenses?.internetPerDay ?? DEFAULT_DAILY_FIXED_EXPENSES.internetPerDay) || 0),
    transportPerDay: Math.max(0, Number(settings.dailyFixedExpenses?.transportPerDay ?? DEFAULT_DAILY_FIXED_EXPENSES.transportPerDay) || 0),
    otherPerDay: Math.max(0, Number(settings.dailyFixedExpenses?.otherPerDay ?? DEFAULT_DAILY_FIXED_EXPENSES.otherPerDay) || 0)
  };
  const dailyFixedExpensesTotal = Number(
    (
      dailyFixedExpenses.rentPerDay +
      dailyFixedExpenses.electricityPerDay +
      dailyFixedExpenses.internetPerDay +
      dailyFixedExpenses.transportPerDay +
      dailyFixedExpenses.otherPerDay
    ).toFixed(2)
  );

  const last7Days: { ymd: string; label: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const ymd = getOffsetYMD(i);
    last7Days.push({
      ymd,
      label: ymd.slice(5)
    });
  }
  const last7Set = new Set(last7Days.map((d) => d.ymd));

  const productMap = new Map<string, Product>();
  products.forEach((p) => productMap.set(p.id, p));

  const completedOrders = orders.filter((o) => o.status === 'completed');

  // Index accumulators
  let todaySales = 0;
  let todayCost = 0;
  let todayOrdersCount = 0;
  let yesterdaySales = 0;
  let monthSales = 0;
  let monthCost = 0;
  let yearSales = 0;
  let yearCost = 0;

  type RawInvoiceLine = {
    orderId: string;
    orderNumber: string;
    date: string;
    ymd: string;
    qty: number;
    sales: number;
    grossProfit: number;
  };

  type ProdAgg = {
    todaySales: number;
    todayQty: number;
    todayProfit: number;
    yesterdaySales: number;
    yesterdayQty: number;
    weekSales: number;
    weekQty: number;
    monthSales: number;
    monthQty: number;
    monthProfit: number;
    totalSales: number;
    totalQty: number;
    totalProfit: number;
    todayOrderIds: Set<string>;
    allOrderIds: Set<string>;
    rawInvoices: RawInvoiceLine[];
    byDay: Map<string, { sales: number; qty: number; profit: number }>;
  };

  const aggMap = new Map<string, ProdAgg>();
  const ensureAgg = (pid: string): ProdAgg => {
    let entry = aggMap.get(pid);
    if (!entry) {
      entry = {
        todaySales: 0,
        todayQty: 0,
        todayProfit: 0,
        yesterdaySales: 0,
        yesterdayQty: 0,
        weekSales: 0,
        weekQty: 0,
        monthSales: 0,
        monthQty: 0,
        monthProfit: 0,
        totalSales: 0,
        totalQty: 0,
        totalProfit: 0,
        todayOrderIds: new Set(),
        allOrderIds: new Set(),
        rawInvoices: [],
        byDay: new Map()
      };
      aggMap.set(pid, entry);
    }
    return entry;
  };

  completedOrders.forEach((o) => {
    const ymd = toLocalYMD(o.date);
    const orderSales = Number(o.grandTotal) || 0;
    const orderRealCost =
      o.items && o.items.length > 0
        ? o.items.reduce((sum, it) => {
            const liveProd = productMap.get(it.productId);
            const baseUnitCost = liveProd ? Number(liveProd.costPrice) || 0 : Number(it.costPrice) || 0;
            return sum + baseUnitCost * costShockFactor * (Number(it.quantity) || 0);
          }, 0)
        : (Number(o.costTotal) || 0) * costShockFactor;

    if (ymd === todayYMD) {
      todaySales += orderSales;
      todayCost += orderRealCost;
      todayOrdersCount++;
    } else if (ymd === yesterdayYMD) {
      yesterdaySales += orderSales;
    }

    if (ymd.startsWith(monthPrefix)) {
      monthSales += orderSales;
      monthCost += orderRealCost;
    }
    if (ymd.startsWith(yearPrefix)) {
      yearSales += orderSales;
      yearCost += orderRealCost;
    }

    (o.items || []).forEach((it) => {
      const agg = ensureAgg(it.productId);
      const liveProd = productMap.get(it.productId);
      const qty = Number(it.quantity) || 0;
      const lineSales = Number(it.total) || Number(it.price) * qty;
      const baseUnitCost = liveProd ? Number(liveProd.costPrice) || 0 : Number(it.costPrice) || 0;
      const effectiveCost = baseUnitCost * costShockFactor;
      const lineProfit = lineSales - effectiveCost * qty;

      agg.totalSales += lineSales;
      agg.totalQty += qty;
      agg.totalProfit += lineProfit;
      agg.allOrderIds.add(o.id);

      agg.rawInvoices.push({
        orderId: o.id,
        orderNumber: o.orderNumber,
        date: o.date,
        ymd,
        qty,
        sales: lineSales,
        grossProfit: lineProfit
      });

      if (ymd === todayYMD) {
        agg.todaySales += lineSales;
        agg.todayQty += qty;
        agg.todayProfit += lineProfit;
        agg.todayOrderIds.add(o.id);
      } else if (ymd === yesterdayYMD) {
        agg.yesterdaySales += lineSales;
        agg.yesterdayQty += qty;
      }

      if (last7Set.has(ymd)) {
        agg.weekSales += lineSales;
        agg.weekQty += qty;
        const prev = agg.byDay.get(ymd) || { sales: 0, qty: 0, profit: 0 };
        prev.sales += lineSales;
        prev.qty += qty;
        prev.profit += lineProfit;
        agg.byDay.set(ymd, prev);
      }

      if (ymd.startsWith(monthPrefix)) {
        agg.monthSales += lineSales;
        agg.monthQty += qty;
        agg.monthProfit += lineProfit;
      }
    });
  });

  // Expenses calculation: Detailed Daily Fixed Overhead + Today's Direct Ledger Expenses + Month Amortized
  let todayDirectExpenses = 0;
  let otherMonthExpenses = 0;
  let monthLoggedExpenses = 0;
  let yearLoggedExpenses = 0;

  expenses.forEach((exp) => {
    const ymd = toLocalYMD(exp.date || exp.createdAt);
    const amt = Math.max(0, Number(exp.amount) || 0);
    if (ymd === todayYMD) {
      todayDirectExpenses += amt;
    } else if (ymd.startsWith(monthPrefix)) {
      otherMonthExpenses += amt;
    }
    if (ymd.startsWith(monthPrefix)) {
      monthLoggedExpenses += amt;
    }
    if (ymd.startsWith(yearPrefix)) {
      yearLoggedExpenses += amt;
    }
  });

  const todayAmortizedExpenses = Number((otherMonthExpenses / 30).toFixed(2));
  const todayExpensesTotal = Number(
    (dailyFixedExpensesTotal + todayDirectExpenses + todayAmortizedExpenses).toFixed(2)
  );
  const monthExpensesTotal = Number(
    (dailyFixedExpensesTotal * 30 + monthLoggedExpenses).toFixed(2)
  );
  const yearExpensesBase =
    yearLoggedExpenses > 0 ? yearLoggedExpenses : monthLoggedExpenses * 12;
  const yearExpensesTotal = Number((dailyFixedExpensesTotal * 365 + yearExpensesBase).toFixed(2));

  // Subscriptions: Dynamic % of Turnover + CPU + AMO + CNSS base
  let monthlyCpuAmoBase = 0;
  let annualCpuAmoTotal = 0;
  let latestQuarterTurnover = 0;
  if (cpuRecords && cpuRecords.length > 0) {
    const qWeight: Record<string, number> = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
    const latest = [...cpuRecords].sort(
      (a, b) => b.year * 10 + (qWeight[b.quarter] || 0) - (a.year * 10 + (qWeight[a.quarter] || 0))
    )[0];
    const mCpu = (Number(latest.calculatedTax) || 0) / 3;
    const mAmo = Number(latest.monthlyAmo) || (Number(latest.quarterlyAmo) || 0) / 3;
    const mRet = Number(latest.monthlyRetirement) || (Number(latest.quarterlyRetirement) || 0) / 3;
    monthlyCpuAmoBase = mCpu + mAmo + mRet;
    annualCpuAmoTotal = monthlyCpuAmoBase * 12;
    latestQuarterTurnover = Number(latest.turnover) || 0;
  }

  const annualizedTurnover = Math.max(yearSales, latestQuarterTurnover * 4, 1);
  const suggestedCpuTurnoverPct = Number(
    Math.min(25, Math.max(0.5, (annualCpuAmoTotal / annualizedTurnover) * 100)).toFixed(1)
  );

  const subscriptionsSalesPct = Math.max(0, Number(settings.subscriptionsSalesPct ?? 3));
  const todayDynamicSubscriptions = Number(((todaySales * subscriptionsSalesPct) / 100).toFixed(2));
  const todayCpuAmoDaily = Number((monthlyCpuAmoBase / 30).toFixed(2));
  const todaySubscriptionsTotal = Number((todayDynamicSubscriptions + todayCpuAmoDaily).toFixed(2));
  const monthSubscriptionsTotal = Number(
    ((monthSales * subscriptionsSalesPct) / 100 + monthlyCpuAmoBase).toFixed(2)
  );
  const yearSubscriptionsTotal = Number(
    ((yearSales * subscriptionsSalesPct) / 100 + monthlyCpuAmoBase * 12).toFixed(2)
  );

  // Zakat daily / monthly / yearly share
  const yearlyZakat = Number(zakatSummary.zakatDue) || 0;
  const todayZakatDaily = Number((yearlyZakat / 365).toFixed(2));

  // Catalog Valuation & Margin (reacts to Market Mode costShockFactor too!)
  let totalStockCostValue = 0;
  let totalStockRetailValue = 0;
  let marginSum = 0;
  let marginCount = 0;
  let expiringProductsCount = 0;

  products.forEach((p) => {
    const stk = Math.max(0, Number(p.stock) || 0);
    const price = Math.max(0, Number(p.price) || 0);
    const cost = Math.max(0, Number(p.costPrice) || 0) * costShockFactor;
    totalStockCostValue += stk * cost;
    totalStockRetailValue += stk * price;
    if (price > 0) {
      marginSum += ((price - cost) / price) * 100;
      marginCount++;
    }
    const expInfo = computeDaysToExpiry(p.expiryDate, todayYMD);
    if (
      expInfo.expiryStatus === 'expired' ||
      expInfo.expiryStatus === 'critical' ||
      expInfo.expiryStatus === 'soon'
    ) {
      expiringProductsCount++;
    }
  });

  totalStockCostValue = Number(totalStockCostValue.toFixed(2));
  totalStockRetailValue = Number(totalStockRetailValue.toFixed(2));
  const potentialStockProfit = Number((totalStockRetailValue - totalStockCostValue).toFixed(2));
  const averageMarginPct = marginCount > 0 ? Number((marginSum / marginCount).toFixed(1)) : 22;

  const todayGrossProfit = Number((todaySales - todayCost).toFixed(2));
  const todayFixedOverhead = Number(
    (todayExpensesTotal + todayCpuAmoDaily + todayZakatDaily).toFixed(2)
  );
  const netProfitToday = Number(
    (todayGrossProfit - todayDynamicSubscriptions - todayFixedOverhead).toFixed(2)
  );

  // Exact Break-even Seuil = 0 formula:
  // Seuil Sales = (Expenses + Fixed Subscriptions + Zakat) / (Margin % - Subscription %)
  const effectiveGrossRatio =
    todaySales > 0 && todaySales > todayCost
      ? (todaySales - todayCost) / todaySales
      : Math.max(0.05, averageMarginPct / 100);
  const effectiveContributionRatio = Math.max(0.02, effectiveGrossRatio - subscriptionsSalesPct / 100);
  const breakEvenSalesToday = Number((todayFixedOverhead / effectiveContributionRatio).toFixed(2));

  let breakEvenState: 'profit' | 'even' | 'loss' = 'loss';
  if (Math.abs(netProfitToday) < 0.5 && (todaySales > 0 || todayFixedOverhead === 0)) {
    breakEvenState = 'even';
  } else if (netProfitToday > 0) {
    breakEvenState = 'profit';
  } else {
    breakEvenState = 'loss';
  }

  const isBreakEvenReached = breakEvenState === 'profit' || breakEvenState === 'even';
  const remainingToBreakEven =
    isBreakEvenReached ? 0 : Number(Math.max(0, breakEvenSalesToday - todaySales).toFixed(2));
  const breakEvenProgressPct =
    breakEvenSalesToday > 0
      ? Math.min(100, Math.max(0, Math.round((todaySales / breakEvenSalesToday) * 100)))
      : 100;

  // Market Mode Daily Forecast
  const forecastBaseSales = Math.max(todaySales, yesterdaySales, breakEvenSalesToday * 0.85);
  const forecastTodaySales = Number((forecastBaseSales * demandMultiplier).toFixed(2));
  const forecastTodayNetProfit = Number(
    (forecastTodaySales * effectiveContributionRatio - todayFixedOverhead).toFixed(2)
  );

  // Change % vs Yesterday
  let changePctVsYesterday = 0;
  if (yesterdaySales > 0) {
    changePctVsYesterday = Number((((todaySales - yesterdaySales) / yesterdaySales) * 100).toFixed(1));
  } else if (todaySales > 0) {
    changePctVsYesterday = 100;
  }
  const indexTrend: 'up' | 'down' | 'flat' =
    changePctVsYesterday > 0 ? 'up' : changePctVsYesterday < 0 ? 'down' : 'flat';

  // Month & Yearly Target totals (reacting to demandMultiplier/costShock/expenses/subs)
  const monthGrossProfit = Number((monthSales - monthCost).toFixed(2));
  const monthNetProfit = Number(
    (monthGrossProfit - monthExpensesTotal - monthSubscriptionsTotal - yearlyZakat / 12).toFixed(2)
  );
  const yearGrossProfit = Number((yearSales - yearCost).toFixed(2));
  const yearNetProfit = Number(
    (yearGrossProfit - yearExpensesTotal - yearSubscriptionsTotal - yearlyZakat).toFixed(2)
  );

  const yearlyTarget = Math.max(
    1200,
    Number(settings.yearlyProfitTarget ?? (settings.monthlyProfitTarget ?? 6000) * 12)
  );
  const remainingYearlyTarget = Math.max(0, Number((yearlyTarget - Math.max(0, yearNetProfit)).toFixed(2)));
  const yearlyProgressPct =
    yearlyTarget > 0
      ? Math.min(100, Math.max(0, Math.round((Math.max(0, yearNetProfit) / yearlyTarget) * 100)))
      : 0;

  const now = new Date();
  const yearEnd = new Date(now.getFullYear(), 11, 31);
  const remainingDaysInYear = Math.max(
    1,
    Math.ceil((yearEnd.getTime() - now.getTime()) / 86_400_000) + 1
  );
  const requiredDailySalesForYearTarget =
    remainingYearlyTarget > 0
      ? Math.ceil(remainingYearlyTarget / remainingDaysInYear / effectiveContributionRatio)
      : 0;

  const overheadToSalesRatio =
    todaySales > 0
      ? Math.min(0.45, (todayExpensesTotal + todaySubscriptionsTotal + todayZakatDaily) / todaySales)
      : subscriptionsSalesPct / 100 + 0.06;

  // Build per-product stock cards
  const stocks: BourseProductStock[] = products.map((p) => {
    const agg = ensureAgg(p.id);
    const salePrice = Number(p.price) || 0;
    const purchasePrice = Number(p.costPrice) || 0;
    const effectivePurchasePrice = Number((purchasePrice * costShockFactor).toFixed(2));
    const unitProfit = Number((salePrice - effectivePurchasePrice).toFixed(2));
    const marginPct = salePrice > 0 ? Number(((unitProfit / salePrice) * 100).toFixed(1)) : 0;
    const stock = Number(p.stock) || 0;
    const lowStockThreshold = Number(p.lowStockThreshold) || 5;
    const stockCostValue = Number((stock * effectivePurchasePrice).toFixed(2));
    const stockRetailValue = Number((stock * salePrice).toFixed(2));
    const { daysToExpiry, expiryStatus } = computeDaysToExpiry(p.expiryDate, todayYMD);

    let changePct = 0;
    if (agg.yesterdaySales > 0) {
      changePct = Number(
        (((agg.todaySales - agg.yesterdaySales) / agg.yesterdaySales) * 100).toFixed(1)
      );
    } else if (agg.todaySales > 0) {
      changePct = 100;
    } else if (unitProfit < 0) {
      changePct = -100;
    }

    const trend: 'up' | 'down' | 'flat' =
      changePct > 0 ? 'up' : changePct < 0 ? 'down' : 'flat';

    // Proportional expenses & subscriptions share
    const todayWeight =
      todaySales > 0
        ? agg.todaySales / todaySales
        : totalStockRetailValue > 0
        ? stockRetailValue / totalStockRetailValue
        : 0;
    const monthWeight =
      monthSales > 0
        ? agg.monthSales / monthSales
        : totalStockRetailValue > 0
        ? stockRetailValue / totalStockRetailValue
        : 0;

    const expensesShareToday = Number((todayExpensesTotal * todayWeight).toFixed(2));
    const subscriptionsShareToday = Number((todaySubscriptionsTotal * todayWeight).toFixed(2));
    const expensesShareMonth = Number(
      ((monthExpensesTotal + monthSubscriptionsTotal) * monthWeight).toFixed(2)
    );
    const netProfitAfterShareToday = Number(
      (agg.todayProfit - expensesShareToday - subscriptionsShareToday).toFixed(2)
    );
    const netProfitAfterShareMonth = Number((agg.monthProfit - expensesShareMonth).toFixed(2));

    // Per-invoice net profit calculation
    const recentInvoices: BourseProductInvoiceEntry[] = [...agg.rawInvoices]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 6)
      .map((inv) => {
        const share = Number((inv.sales * overheadToSalesRatio).toFixed(2));
        return {
          orderId: inv.orderId,
          orderNumber: inv.orderNumber,
          date: inv.date,
          qty: inv.qty,
          sales: Number(inv.sales.toFixed(2)),
          grossProfit: Number(inv.grossProfit.toFixed(2)),
          expensesAndSubsShare: share,
          netProfit: Number((inv.grossProfit - share).toFixed(2))
        };
      });

    const invoicesCount = agg.allOrderIds.size;
    const todayInvoicesCount = agg.todayOrderIds.size;
    const totalInvoiceNet = agg.rawInvoices.reduce(
      (s, inv) => s + (inv.grossProfit - inv.sales * overheadToSalesRatio),
      0
    );
    const avgNetProfitPerInvoice =
      agg.rawInvoices.length > 0
        ? Number((totalInvoiceNet / agg.rawInvoices.length).toFixed(2))
        : Number((unitProfit - salePrice * overheadToSalesRatio).toFixed(2));

    const forecastDailySales = Number(
      ((agg.weekSales > 0 ? agg.weekSales / 7 : agg.todaySales) * demandMultiplier).toFixed(2)
    );

    const series: BourseProductSeriesPoint[] = last7Days.map((d) => {
      const point = agg.byDay.get(d.ymd) || { sales: 0, qty: 0, profit: 0 };
      return {
        ymd: d.ymd,
        label: d.label,
        sales: Number(point.sales.toFixed(2)),
        qty: Number(point.qty.toFixed(2)),
        profit: Number(point.profit.toFixed(2))
      };
    });

    // Darija Hanout Advisor (5 actions: BUY_MORE / SELL_NOW / INCREASE_PRICE / DISCOUNT / STOP)
    let advisor: BourseProductStock['advisor'];
    const lowStockCutoff = Math.max(5, lowStockThreshold);

    if (expiryStatus === 'expired' || marginPct <= 0 || (marginPct < 6 && agg.weekQty === 0 && stock > lowStockCutoff)) {
      advisor = {
        action: 'STOP',
        titleDarija: 'حبس (STOP)',
        reasonDarija:
          expiryStatus === 'expired'
            ? 'الصلاحية سالات! حبس البيع وحيد السلعة من الريون دابا'
            : marginPct <= 0
            ? 'ثمن البيع أقل ولا كيساوي الشراء — حبس حتى تصحّح الثمن!'
            : 'الهامش ضعيف بزاف (<6%) وما كتخرجش هاد الأسبوع',
        tone: 'red'
      };
    } else if (
      (expiryStatus === 'critical' || expiryStatus === 'soon') &&
      stock > 0
    ) {
      advisor = {
        action: 'DISCOUNT',
        titleDarija: 'تخفيض (DISCOUNT)',
        reasonDarija:
          expiryStatus === 'critical'
            ? `قريبة تسالي الصلاحية (${daysToExpiry} أيام) — دير تخفيض عاجل باش ما تضيعش!`
            : `باقي ${daysToExpiry} يوم للصلاحية — دير برومو خفيف تصرفها دغيا`,
        tone: 'amber'
      };
    } else if (
      marginPct > 0 &&
      marginPct < 13 &&
      (marketMode === 'purchase_increase' || agg.todayQty > 0 || agg.weekQty > 0)
    ) {
      advisor = {
        action: 'INCREASE_PRICE',
        titleDarija: 'زيد فالثمن (INCREASE PRICE)',
        reasonDarija:
          marketMode === 'purchase_increase'
            ? `مع زيادة الشراء (+12%) الهامش نزل لـ ${marginPct}% — زيد شوية فثمن البيع`
            : `الهامش قليل (${marginPct}%) والسلعة مطلوبة — زيد درهم ولا جوج فالثمن`,
        tone: 'amber'
      };
    } else if (stock <= lowStockCutoff && (agg.todayQty > 0 || agg.weekQty > 0 || marginPct >= 14)) {
      advisor = {
        action: 'BUY_MORE',
        titleDarija: 'شري أكثر (BUY MORE)',
        reasonDarija:
          stock <= 0
            ? 'السلعة سلات من الستوك وعليها طلب — عمّر دابا!'
            : `الستوك قليل (${stock}) والسلعة خدامة مزيان — زيد كوموند`,
        tone: 'green'
      };
    } else if (
      (agg.weekQty === 0 || marketMode === 'low_season') &&
      stock >= Math.max(12, lowStockCutoff * 2) &&
      marginPct >= 13 &&
      agg.todayQty === 0
    ) {
      advisor = {
        action: 'DISCOUNT',
        titleDarija: 'تخفيض (DISCOUNT)',
        reasonDarija: `الستوك عامر (${stock}) والحركة ناقصة — دير تخفيض خفيف تجبد السيولة`,
        tone: 'amber'
      };
    } else {
      advisor = {
        action: 'SELL_NOW',
        titleDarija: 'بيع دابا (SELL NOW)',
        reasonDarija: `الربح +${unitProfit.toFixed(2)} (${marginPct}%) والسلعة واجدة فالحانوت`,
        tone: 'green'
      };
    }

    return {
      id: p.id,
      name: p.name,
      nameEn: p.nameEn,
      sku: p.sku,
      categoryId: p.categoryId,
      image: p.image,
      salePrice,
      purchasePrice,
      effectivePurchasePrice,
      unitProfit,
      marginPct,
      stock,
      lowStockThreshold,
      unitType: p.unitType || 'piece',
      expiryDate: p.expiryDate,
      daysToExpiry,
      expiryStatus,
      stockCostValue,
      stockRetailValue,
      todaySales: Number(agg.todaySales.toFixed(2)),
      todayQty: Number(agg.todayQty.toFixed(2)),
      todayProfit: Number(agg.todayProfit.toFixed(2)),
      yesterdaySales: Number(agg.yesterdaySales.toFixed(2)),
      yesterdayQty: Number(agg.yesterdayQty.toFixed(2)),
      weekSales: Number(agg.weekSales.toFixed(2)),
      weekQty: Number(agg.weekQty.toFixed(2)),
      monthSales: Number(agg.monthSales.toFixed(2)),
      monthQty: Number(agg.monthQty.toFixed(2)),
      monthProfit: Number(agg.monthProfit.toFixed(2)),
      totalSales: Number(agg.totalSales.toFixed(2)),
      totalQty: Number(agg.totalQty.toFixed(2)),
      totalProfit: Number(agg.totalProfit.toFixed(2)),
      changePct,
      trend,
      expensesShareToday,
      subscriptionsShareToday,
      expensesShareMonth,
      netProfitAfterShareToday,
      netProfitAfterShareMonth,
      salesWeightPct: Number(((todayWeight || 0) * 100).toFixed(1)),
      invoicesCount,
      todayInvoicesCount,
      avgNetProfitPerInvoice,
      recentInvoices,
      forecastDailySales,
      series,
      advisor
    };
  });

  // Sort default stocks list: active movers & margin first
  stocks.sort((a, b) => {
    if (b.todaySales !== a.todaySales) return b.todaySales - a.todaySales;
    if (b.weekSales !== a.weekSales) return b.weekSales - a.weekSales;
    return b.marginPct - a.marginPct;
  });

  // Top Gainers & Top Losers of the day
  const topGainers = [...stocks]
    .filter((s) => s.changePct > 0 || s.todayProfit > 0)
    .sort((a, b) => {
      if (b.changePct !== a.changePct) return b.changePct - a.changePct;
      return b.todayProfit - a.todayProfit;
    })
    .slice(0, 4);

  const topLosers = [...stocks]
    .filter(
      (s) =>
        s.changePct < 0 ||
        s.marginPct <= 0 ||
        s.expiryStatus === 'expired' ||
        s.expiryStatus === 'critical' ||
        (s.yesterdaySales > 0 && s.todaySales < s.yesterdaySales)
    )
    .sort((a, b) => {
      if (a.changePct !== b.changePct) return a.changePct - b.changePct;
      return a.marginPct - b.marginPct;
    })
    .slice(0, 4);

  const counts = {
    buyMore: stocks.filter((s) => s.advisor.action === 'BUY_MORE').length,
    sellNow: stocks.filter((s) => s.advisor.action === 'SELL_NOW').length,
    increasePrice: stocks.filter((s) => s.advisor.action === 'INCREASE_PRICE').length,
    discount: stocks.filter((s) => s.advisor.action === 'DISCOUNT').length,
    stop: stocks.filter((s) => s.advisor.action === 'STOP').length,
    expiring: expiringProductsCount
  };

  return {
    index: {
      todayYMD,
      yesterdayYMD,
      marketMode,
      demandMultiplier,
      costShockFactor,
      todaySales: Number(todaySales.toFixed(2)),
      yesterdaySales: Number(yesterdaySales.toFixed(2)),
      changePctVsYesterday,
      indexTrend,
      todayOrdersCount,
      todayGrossProfit,
      dailyFixedExpenses,
      dailyFixedExpensesTotal,
      todayDirectExpenses: Number(todayDirectExpenses.toFixed(2)),
      todayAmortizedExpenses,
      todayExpensesTotal,
      subscriptionsSalesPct,
      suggestedCpuTurnoverPct,
      todayDynamicSubscriptions,
      todayCpuAmoDaily,
      todaySubscriptionsTotal,
      todayZakatDaily,
      todayFixedOverhead,
      netProfitToday,
      forecastTodaySales,
      forecastTodayNetProfit,
      breakEvenSalesToday,
      breakEvenState,
      remainingToBreakEven,
      breakEvenProgressPct,
      isBreakEvenReached,
      monthSales: Number(monthSales.toFixed(2)),
      monthGrossProfit,
      monthExpensesTotal,
      monthSubscriptionsTotal,
      monthNetProfit,
      yearSales: Number(yearSales.toFixed(2)),
      yearGrossProfit,
      yearExpensesTotal,
      yearSubscriptionsTotal,
      yearNetProfit,
      yearlyTarget,
      remainingYearlyTarget,
      yearlyProgressPct,
      requiredDailySalesForYearTarget,
      totalStockCostValue,
      totalStockRetailValue,
      potentialStockProfit,
      averageMarginPct,
      expiringProductsCount
    },
    stocks,
    topGainers,
    topLosers,
    counts
  };
}
