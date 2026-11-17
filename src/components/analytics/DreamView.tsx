import React, { useMemo, useState } from 'react';
import { usePos } from '../../context/PosContext';
import {
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Clock,
  Package,
  CreditCard,
  Ear,
  Pencil,
  Check,
  X,
  ArrowUpRight,
  Compass,
  Target,
  Search,
  BarChart3,
  ArrowUpDown
} from 'lucide-react';

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

export const DreamView: React.FC = () => {
  const {
    orders,
    expenses,
    products,
    customers,
    creditTransactions,
    currentShift,
    shiftsHistory,
    shopEarRequests,
    settings,
    updateSettings,
    currencySymbol,
    setCurrentTab
  } = usePos();

  const [dreamConfig, setDreamConfig] = useState<DreamGoalConfig>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_dream_goal_v1');
      return saved ? { ...DEFAULT_DREAM_CONFIG, ...JSON.parse(saved) } : DEFAULT_DREAM_CONFIG;
    } catch {
      return DEFAULT_DREAM_CONFIG;
    }
  });

  const monthlyTarget = Math.max(100, Number(settings.monthlyProfitTarget) || 10000);

  const [isEditingDream, setIsEditingDream] = useState(false);
  const [draftTitle, setDraftTitle] = useState(dreamConfig.title);
  const [draftTarget, setDraftTarget] = useState(String(dreamConfig.targetAmount));
  const [draftInitialSaved, setDraftInitialSaved] = useState(String(dreamConfig.initialSaved));
  const [draftMonthlyTarget, setDraftMonthlyTarget] = useState(String(monthlyTarget));
  const [isEditingMonthlyInline, setIsEditingMonthlyInline] = useState(false);
  const [inlineMonthlyInput, setInlineMonthlyInput] = useState(String(monthlyTarget));

  // Product Margin Table state
  const [marginSearch, setMarginSearch] = useState('');
  const [marginSort, setMarginSort] = useState<'profit30d' | 'marginDesc' | 'marginAsc' | 'unitProfit'>('profit30d');

  const saveDreamConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const next: DreamGoalConfig = {
      title: draftTitle.trim() || DEFAULT_DREAM_CONFIG.title,
      targetAmount: Math.max(100, Number(draftTarget) || DEFAULT_DREAM_CONFIG.targetAmount),
      initialSaved: Math.max(0, Number(draftInitialSaved) || 0)
    };
    const nextMonthly = Math.max(100, Number(draftMonthlyTarget) || monthlyTarget);
    setDreamConfig(next);
    updateSettings({ monthlyProfitTarget: nextMonthly });
    try {
      localStorage.setItem('kadi_pos_dream_goal_v1', JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
    setIsEditingDream(false);
  };

  const handleSaveInlineMonthlyTarget = (e: React.FormEvent) => {
    e.preventDefault();
    const nextMonthly = Math.max(100, Number(inlineMonthlyInput) || monthlyTarget);
    updateSettings({ monthlyProfitTarget: nextMonthly });
    setIsEditingMonthlyInline(false);
  };

  // =========================================================================
  // 1. REAL PROFIT METRICS: TODAY / THIS WEEK / THIS MONTH / MONTHLY GOAL / DREAM PROGRESS
  // =========================================================================
  const profitAnalytics = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 86400000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let todayGrossProfit = 0;
    let weekGrossProfit = 0;
    let monthGrossProfit = 0;
    let allTimeGrossProfit = 0;

    let todaySales = 0;
    let weekSales = 0;
    let monthSales = 0;
    let allTimeSales = 0;

    const monthlyMap = new Map<string, number>();

    orders.forEach((o) => {
      if (o.status !== 'completed') return;
      const ms = new Date(o.date).getTime();
      if (Number.isNaN(ms)) return;
      const profit = o.profitTotal ?? Math.max(0, o.grandTotal - (o.costTotal || 0));

      allTimeGrossProfit += profit;
      allTimeSales += o.grandTotal;
      const d = new Date(ms);
      const ymKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(ymKey, (monthlyMap.get(ymKey) || 0) + profit);

      if (ms >= todayStart) {
        todayGrossProfit += profit;
        todaySales += o.grandTotal;
      }
      if (ms >= weekStart) {
        weekGrossProfit += profit;
        weekSales += o.grandTotal;
      }
      if (ms >= monthStart) {
        monthGrossProfit += profit;
        monthSales += o.grandTotal;
      }
    });

    let todayExpenses = 0;
    let weekExpenses = 0;
    let monthExpenses = 0;
    let allTimeExpenses = 0;

    expenses.forEach((exp) => {
      const ms = new Date(exp.date || exp.createdAt).getTime();
      if (Number.isNaN(ms)) return;
      allTimeExpenses += exp.amount;
      if (ms >= todayStart) todayExpenses += exp.amount;
      if (ms >= weekStart) weekExpenses += exp.amount;
      if (ms >= monthStart) monthExpenses += exp.amount;
    });

    const todayNet = Number((todayGrossProfit - todayExpenses).toFixed(2));
    const weekNet = Number((weekGrossProfit - weekExpenses).toFixed(2));
    const monthNet = Number((monthGrossProfit - monthExpenses).toFixed(2));
    const allTimeNet = Math.max(0, Number((allTimeGrossProfit - allTimeExpenses).toFixed(2)));

    // Monthly Goal Calculations (الهدف الشهري ديال المحال)
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();
    const daysLeftInMonth = Math.max(1, daysInMonth - currentDay + 1);
    const remainingMonthlyProfit = Math.max(0, Number((monthlyTarget - monthNet).toFixed(2)));
    const monthlyProgressPct =
      monthlyTarget > 0 ? Math.min(100, Math.round((Math.max(0, monthNet) / monthlyTarget) * 100)) : 0;
    const requiredDailyNetProfit = Number((remainingMonthlyProfit / daysLeftInMonth).toFixed(2));

    // Real gross margin % from sales (fallback to average product margin)
    const catalogAvgMargin =
      products.length > 0
        ? products.reduce((s, p) => s + (p.price > 0 ? (p.price - p.costPrice) / p.price : 0), 0) /
          products.length
        : 0.22;
    const realGrossMarginRatio =
      monthSales > 0 && monthGrossProfit > 0
        ? monthGrossProfit / monthSales
        : allTimeSales > 0 && allTimeGrossProfit > 0
        ? allTimeGrossProfit / allTimeSales
        : catalogAvgMargin;
    const safeMarginRatio = Math.min(0.85, Math.max(0.08, realGrossMarginRatio || 0.22));
    const requiredDailySalesTurnover =
      requiredDailyNetProfit > 0 ? Math.ceil(requiredDailyNetProfit / safeMarginRatio) : 0;

    // Long-Term Dream Progress
    const totalSavedTowardDream = Number((dreamConfig.initialSaved + allTimeNet).toFixed(2));
    const remainingAmount = Math.max(
      0,
      Number((dreamConfig.targetAmount - totalSavedTowardDream).toFixed(2))
    );
    const progressPct =
      dreamConfig.targetAmount > 0
        ? Math.min(100, Math.round((totalSavedTowardDream / dreamConfig.targetAmount) * 100))
        : 0;

    const dayOfMonth = Math.max(1, currentDay);
    const projectedCurrentMonthNet =
      dayOfMonth < 28 && monthNet > 0 ? (monthNet / dayOfMonth) * 30 : monthNet;
    const weeklyRunRateMonthly = weekNet > 0 ? (weekNet / 7) * 30 : 0;
    const monthlyPace = Math.max(
      0,
      Number(
        (
          projectedCurrentMonthNet > 0
            ? projectedCurrentMonthNet
            : weeklyRunRateMonthly > 0
            ? weeklyRunRateMonthly
            : allTimeNet / Math.max(1, monthlyMap.size)
        ).toFixed(2)
      )
    );

    const monthsRemaining =
      remainingAmount <= 0
        ? 0
        : monthlyPace > 0
        ? Math.max(1, Math.ceil(remainingAmount / monthlyPace))
        : null;

    const sixMonthProjectedTotal = Number(
      (totalSavedTowardDream + monthlyPace * 6).toFixed(2)
    );

    return {
      todayNet,
      weekNet,
      monthNet,
      todaySales,
      weekSales,
      monthSales,
      todayExpenses,
      weekExpenses,
      monthExpenses,
      daysInMonth,
      currentDay,
      daysLeftInMonth,
      remainingMonthlyProfit,
      monthlyProgressPct,
      requiredDailyNetProfit,
      requiredDailySalesTurnover,
      effectiveMarginPct: Number((safeMarginRatio * 100).toFixed(1)),
      totalSavedTowardDream,
      remainingAmount,
      progressPct,
      monthlyPace,
      monthsRemaining,
      sixMonthProjectedTotal
    };
  }, [orders, expenses, products, dreamConfig, monthlyTarget]);

  // =========================================================================
  // 2. PER-PRODUCT PROFIT MARGIN & 30-DAY CONTRIBUTION (هامش الربح ديال كل سلعة)
  // =========================================================================
  const productMarginAnalytics = useMemo(() => {
    const thirtyDaysAgoMs = Date.now() - 30 * 86400000;
    const soldQtyMap = new Map<string, number>();
    const soldRevenueMap = new Map<string, number>();
    const soldProfitMap = new Map<string, number>();

    orders.forEach((o) => {
      if (o.status !== 'completed') return;
      const ms = new Date(o.date).getTime();
      if (Number.isNaN(ms) || ms < thirtyDaysAgoMs) return;
      o.items.forEach((it) => {
        const lineRev = it.total || it.price * it.quantity;
        const lineCost = (it.costPrice || 0) * it.quantity;
        const lineProfit = lineRev - lineCost;
        soldQtyMap.set(it.productId, (soldQtyMap.get(it.productId) || 0) + it.quantity);
        soldRevenueMap.set(it.productId, (soldRevenueMap.get(it.productId) || 0) + lineRev);
        soldProfitMap.set(it.productId, (soldProfitMap.get(it.productId) || 0) + lineProfit);
      });
    });

    const rows = products.map((p) => {
      const unitProfit = Number((p.price - p.costPrice).toFixed(2));
      const marginPct = p.price > 0 ? Number((((p.price - p.costPrice) / p.price) * 100).toFixed(1)) : 0;
      const sold30d = soldQtyMap.get(p.id) || 0;
      const revenue30d = Number((soldRevenueMap.get(p.id) || 0).toFixed(2));
      const profit30d = Number((soldProfitMap.get(p.id) || 0).toFixed(2));

      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        costPrice: p.costPrice,
        price: p.price,
        unitProfit,
        marginPct,
        sold30d,
        revenue30d,
        profit30d,
        stock: p.stock,
        lowStockThreshold: p.lowStockThreshold
      };
    });

    const avgMarginPct =
      rows.length > 0
        ? Number((rows.reduce((s, r) => s + r.marginPct, 0) / rows.length).toFixed(1))
        : 0;
    const topEarner = [...rows].sort((a, b) => b.profit30d - a.profit30d)[0] || null;
    const highestMargin = [...rows].sort((a, b) => b.marginPct - a.marginPct)[0] || null;

    const query = marginSearch.trim().toLowerCase();
    const filtered = rows
      .filter((r) => !query || r.name.toLowerCase().includes(query) || r.sku.toLowerCase().includes(query))
      .sort((a, b) => {
        if (marginSort === 'marginDesc') return b.marginPct - a.marginPct;
        if (marginSort === 'marginAsc') return a.marginPct - b.marginPct;
        if (marginSort === 'unitProfit') return b.unitProfit - a.unitProfit;
        if (b.profit30d !== a.profit30d) return b.profit30d - a.profit30d;
        return b.marginPct - a.marginPct;
      });

    return {
      avgMarginPct,
      topEarner,
      highestMargin,
      rows: filtered,
      totalProducts: rows.length
    };
  }, [products, orders, marginSearch, marginSort]);

  // =========================================================================
  // 3. "شنو اللي كيخسرك؟" — REAL STAGNANT INVENTORY, DELAYED CREDIT, LATE OPENING
  // =========================================================================
  const leaksAnalysis = useMemo(() => {
    const nowMs = Date.now();
    const sixtyDaysMs = 60 * 86400000;

    const lastSoldMap = new Map<string, number>();
    orders.forEach((o) => {
      if (o.status !== 'completed') return;
      const ms = new Date(o.date).getTime();
      if (Number.isNaN(ms)) return;
      o.items.forEach((it) => {
        const prev = lastSoldMap.get(it.productId) || 0;
        if (ms > prev) lastSoldMap.set(it.productId, ms);
      });
    });

    const stagnantProducts = products
      .filter((p) => {
        if (p.stock <= 0) return false;
        const lastSold = lastSoldMap.get(p.id);
        return !lastSold || nowMs - lastSold >= sixtyDaysMs;
      })
      .map((p) => ({
        id: p.id,
        name: p.name,
        stock: p.stock,
        tiedCapital: Number((p.stock * (p.costPrice > 0 ? p.costPrice : p.price * 0.75)).toFixed(2)),
        daysIdle: lastSoldMap.get(p.id)
          ? Math.floor((nowMs - (lastSoldMap.get(p.id) || nowMs)) / 86400000)
          : 60
      }))
      .sort((a, b) => b.tiedCapital - a.tiedCapital);

    const stagnantCapitalTotal = Number(
      stagnantProducts.reduce((s, p) => s + p.tiedCapital, 0).toFixed(2)
    );

    const overdueCreditCustomers = customers
      .filter((c) => c.balance > 0)
      .map((c) => {
        const custTx = creditTransactions
          .filter((tx) => tx.customerId === c.id)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const lastPay = custTx.find((tx) => tx.type === 'payment');
        const oldestDebt = [...custTx].reverse().find((tx) => tx.type === 'debt');
        const refMs = new Date(lastPay?.date || oldestDebt?.date || c.createdAt).getTime();
        const daysWaiting = Number.isNaN(refMs)
          ? 0
          : Math.max(0, Math.floor((nowMs - refMs) / 86400000));
        return {
          id: c.id,
          name: c.name,
          balance: c.balance,
          daysWaiting
        };
      })
      .filter((c) => c.daysWaiting >= 14)
      .sort((a, b) => b.balance - a.balance);

    const overdueCreditTotal = Number(
      overdueCreditCustomers.reduce((s, c) => s + c.balance, 0).toFixed(2)
    );

    const allShifts = [currentShift, ...shiftsHistory].filter((s) => s?.openedAt);
    const openingMinutes: number[] = allShifts
      .map((s) => {
        const d = new Date(s.openedAt);
        return Number.isNaN(d.getTime()) ? null : d.getHours() * 60 + d.getMinutes();
      })
      .filter((v): v is number => v !== null);

    const avgOpenMinutes =
      openingMinutes.length > 0
        ? Math.round(openingMinutes.reduce((a, b) => a + b, 0) / openingMinutes.length)
        : 9 * 60;
    const avgOpenHourStr = `${String(Math.floor(avgOpenMinutes / 60)).padStart(2, '0')}:${String(
      avgOpenMinutes % 60
    ).padStart(2, '0')}`;

    const morningOrders = orders.filter((o) => {
      if (o.status !== 'completed') return false;
      const d = new Date(o.date);
      if (Number.isNaN(d.getTime())) return false;
      const mins = d.getHours() * 60 + d.getMinutes();
      return mins >= 7 * 60 && mins < 10 * 60;
    });

    const opensLate = avgOpenMinutes >= 8 * 60 + 30;
    const avgDailyEarlyCustomers = Math.max(
      4,
      Math.min(18, Math.round(Math.max(morningOrders.length, 6) * 1.4))
    );

    return {
      stagnantProducts,
      stagnantCapitalTotal,
      overdueCreditCustomers,
      overdueCreditTotal,
      avgOpenHourStr,
      opensLate,
      avgDailyEarlyCustomers
    };
  }, [products, orders, customers, creditTransactions, currentShift, shiftsHistory]);

  // =========================================================================
  // 4. "شنو إلا زدتيه غادي تربح كتر؟" — MISSED OPPORTUNITIES FORECAST
  // =========================================================================
  const growthOpportunities = useMemo(() => {
    const weekAgoMs = Date.now() - 7 * 86400000;
    const pendingShopEar = shopEarRequests.filter((r) => r.status !== 'notified');
    const weeklyShopEar = pendingShopEar.filter((r) => {
      const ms = new Date(r.requestedAt).getTime();
      return !Number.isNaN(ms) && ms >= weekAgoMs;
    });

    const weeklyMissedSales = weeklyShopEar.reduce(
      (sum, r) => sum + (r.estimatedUnitPrice && r.estimatedUnitPrice > 0 ? r.estimatedUnitPrice : 25),
      0
    );
    const estimatedMonthlyShopEarBoost =
      weeklyShopEar.length > 0
        ? Math.max(500, Math.round(weeklyMissedSales * 4.2))
        : 2000;

    const earlyHourNewCustomers = leaksAnalysis.opensLate
      ? Math.max(8, leaksAnalysis.avgDailyEarlyCustomers)
      : 6;

    return {
      pendingShopEarCount: pendingShopEar.length,
      weeklyShopEarCount: weeklyShopEar.length,
      estimatedMonthlyShopEarBoost,
      earlyHourNewCustomers
    };
  }, [shopEarRequests, leaksAnalysis]);

  const todaySalesReachedTarget =
    profitAnalytics.requiredDailySalesTurnover > 0 &&
    profitAnalytics.todaySales >= profitAnalytics.requiredDailySalesTurnover;

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-950 text-white p-3 sm:p-6 space-y-5">
      {/* Top 3 Always-Visible Profit Numbers: اليوم / هاد السيمانة / هاد الشهر */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400">
            <span>الربح الصافي — اليوم</span>
            <span className="px-2 py-0.5 rounded-md bg-amber-400/15 text-amber-300 text-[10px]">اليوم</span>
          </div>
          <div
            className={`text-xl sm:text-2xl font-black font-mono tabular-nums mt-1 ${
              profitAnalytics.todayNet >= 0 ? 'text-amber-400' : 'text-rose-400'
            }`}
          >
            {profitAnalytics.todayNet.toFixed(0)}{' '}
            <span className="text-xs sm:text-sm font-bold">{currencySymbol}</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-1 flex items-center justify-between">
            <span>المبيعات: {profitAnalytics.todaySales.toFixed(0)} {currencySymbol}</span>
            <span>المصاريف: {profitAnalytics.todayExpenses.toFixed(0)} {currencySymbol}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400">
            <span>الربح الصافي — هاد السيمانة</span>
            <span className="px-2 py-0.5 rounded-md bg-amber-400/15 text-amber-300 text-[10px]">7 أيام</span>
          </div>
          <div
            className={`text-xl sm:text-2xl font-black font-mono tabular-nums mt-1 ${
              profitAnalytics.weekNet >= 0 ? 'text-amber-400' : 'text-rose-400'
            }`}
          >
            {profitAnalytics.weekNet.toFixed(0)}{' '}
            <span className="text-xs sm:text-sm font-bold">{currencySymbol}</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-1 flex items-center justify-between">
            <span>المبيعات: {profitAnalytics.weekSales.toFixed(0)} {currencySymbol}</span>
            <span>المصاريف: {profitAnalytics.weekExpenses.toFixed(0)} {currencySymbol}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400">
            <span>الربح الصافي — هاد الشهر</span>
            <span className="px-2 py-0.5 rounded-md bg-emerald-400/15 text-emerald-300 text-[10px]">الشهر الحالي</span>
          </div>
          <div
            className={`text-xl sm:text-2xl font-black font-mono tabular-nums mt-1 ${
              profitAnalytics.monthNet >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {profitAnalytics.monthNet.toFixed(0)}{' '}
            <span className="text-xs sm:text-sm font-bold">{currencySymbol}</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-1 flex items-center justify-between">
            <span>المبيعات: {profitAnalytics.monthSales.toFixed(0)} {currencySymbol}</span>
            <span>المصاريف: {profitAnalytics.monthExpenses.toFixed(0)} {currencySymbol}</span>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 1. الهدف الشهري (الحلم ديال المحال هاد الشهر) + شحال خاصك تبيع كل نهار */}
      {/* =================================================================== */}
      <section className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-bold text-emerald-400">1. الهدف الشهري (الحلم ديال المحال هاد الشهر)</div>
              <h2 className="text-lg sm:text-xl font-black text-white">
                تتبع الربح الشهري والمبيعات اليومية المطلوبة
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isEditingMonthlyInline ? (
              <form onSubmit={handleSaveInlineMonthlyTarget} className="flex items-center gap-2">
                <input
                  type="number"
                  min="100"
                  step="100"
                  value={inlineMonthlyInput}
                  onChange={(e) => setInlineMonthlyInput(e.target.value)}
                  className="w-32 px-3 py-1.5 rounded-xl bg-slate-950 border border-emerald-500 text-sm font-mono font-black text-white focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>حفظ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingMonthlyInline(false)}
                  className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2.5 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2">
                <div>
                  <div className="text-[10px] text-slate-400">الهدف الشهري المحدد</div>
                  <div className="text-base font-black font-mono tabular-nums text-emerald-400">
                    {monthlyTarget.toLocaleString('en-US')} {currencySymbol}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInlineMonthlyInput(String(monthlyTarget));
                    setIsEditingMonthlyInline(true);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-amber-300 flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" />
                  <span>تعديل</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Monthly Goal Progress Bar */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm font-bold">
            <span className="text-emerald-400 font-mono tabular-nums">
              ربحتي هاد الشهر: {profitAnalytics.monthNet.toLocaleString('en-US')} {currencySymbol}
            </span>
            <span className="text-slate-300 font-mono tabular-nums">
              باقي ليك باش توصل للهدف: {profitAnalytics.remainingMonthlyProfit.toLocaleString('en-US')} {currencySymbol}
            </span>
            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-400 text-slate-950 font-black font-mono tabular-nums">
              {profitAnalytics.monthlyProgressPct}%
            </span>
          </div>

          <div className="w-full h-3.5 rounded-full bg-slate-800 border border-slate-700 overflow-hidden">
            <div
              className="h-full bg-emerald-400 transition-all duration-500 rounded-full"
              style={{ width: `${profitAnalytics.monthlyProgressPct}%` }}
            />
          </div>
        </div>

        {/* Remaining + Required Daily Sales Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[11px] text-slate-400">شحال باقي ليك للهدف الشهري</div>
            <div className="text-xl font-black font-mono tabular-nums text-amber-400 mt-1">
              {profitAnalytics.remainingMonthlyProfit.toLocaleString('en-US')} {currencySymbol}
            </div>
            <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
              باقي {profitAnalytics.daysLeftInMonth} يوم فهاد الشهر (من أصل {profitAnalytics.daysInMonth} يوم)
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/40">
            <div className="text-[11px] text-amber-300 font-bold">شحال خاصك تبيع كل نهار (رقم المعاملات)</div>
            <div className="text-xl font-black font-mono tabular-nums text-white mt-1">
              {profitAnalytics.remainingMonthlyProfit <= 0
                ? 'وصلتي للهدف! 🎉'
                : `${profitAnalytics.requiredDailySalesTurnover.toLocaleString('en-US')} ${currencySymbol} / نهار`}
            </div>
            <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
              على أساس هامش ربح {profitAnalytics.effectiveMarginPct}% · بعتي اليوم {profitAnalytics.todaySales.toFixed(0)} {currencySymbol}
              {todaySalesReachedTarget ? ' (تجاوزتي هدف اليوم ✓)' : ''}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[11px] text-slate-400">الربح الصافي اليومي المطلوب</div>
            <div className="text-xl font-black font-mono tabular-nums text-emerald-400 mt-1">
              {profitAnalytics.requiredDailyNetProfit.toLocaleString('en-US')} {currencySymbol} / نهار
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              باش تسكر هدف {monthlyTarget.toLocaleString('en-US')} {currencySymbol} قبل نهاية الشهر
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 2. الحلم الكبير ديالي */}
      {/* =================================================================== */}
      <section className="bg-slate-900 border border-amber-500/40 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-400">2. الحلم الكبير ديالي</div>
              <h1 className="text-xl sm:text-2xl font-black text-white">{dreamConfig.title}</h1>
            </div>
          </div>

          <div className="text-start sm:text-end">
            <div className="text-xs text-slate-400">ثمن الحلم المطلوب</div>
            <div className="text-xl font-black font-mono tabular-nums text-amber-400">
              {dreamConfig.targetAmount.toLocaleString('en-US')} {currencySymbol}
            </div>
          </div>
        </div>

        {/* Progress Bar: التقدم نحو الحلم */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm font-bold">
            <span className="text-emerald-400 font-mono tabular-nums">
              جمعتي {profitAnalytics.totalSavedTowardDream.toLocaleString('en-US')} {currencySymbol}
            </span>
            <span className="text-slate-300 font-mono tabular-nums">
              باقي ليك {profitAnalytics.remainingAmount.toLocaleString('en-US')} {currencySymbol}
            </span>
            <span className="px-2.5 py-0.5 rounded-lg bg-amber-400 text-slate-950 font-black font-mono tabular-nums">
              {profitAnalytics.progressPct}%
            </span>
          </div>

          <div className="w-full h-4 rounded-full bg-slate-800 border border-slate-700 overflow-hidden">
            <div
              className="h-full bg-amber-400 transition-all duration-500 rounded-full"
              style={{ width: `${profitAnalytics.progressPct}%` }}
            />
          </div>
        </div>

        <div className="px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm sm:text-base font-extrabold text-amber-300">
            {profitAnalytics.remainingAmount <= 0
              ? 'مبروك! وصلتي للهدف ديال الحلم ديالك!'
              : profitAnalytics.monthsRemaining !== null
              ? `بقا ليك ${profitAnalytics.monthsRemaining} شهر بهاد الوتيرة، قربتي!`
              : 'سجل مبيعاتك اليومية باش يحسب ليك التطبيق شحال بقا ليك من شهر للحلم.'}
          </p>
          <span className="text-xs text-slate-400 font-mono tabular-nums">
            الوتيرة الشهرية: {profitAnalytics.monthlyPace.toFixed(0)} {currencySymbol}/شهر
          </span>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 3. هامش الربح ديال كل سلعة (تحليل الأرباح حسب المنتوج) */}
      {/* =================================================================== */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
              <BarChart3 className="w-4 h-4" />
              <span>3. لوحة هامش الربح ديال كل سلعة (آخر 30 يوم)</span>
            </div>
            <h2 className="text-lg font-black text-white mt-0.5">
              شحال كتربح فكل منتوج وسلعة فالمحال
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={marginSearch}
                onChange={(e) => setMarginSearch(e.target.value)}
                placeholder="قلب على سلعة..."
                className="ps-8 pe-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div className="inline-flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1 text-[11px] font-bold">
              <ArrowUpDown className="w-3 h-3 text-slate-400 mx-1" />
              {[
                { id: 'profit30d' as const, label: 'أعلى ربح (30 ي)' },
                { id: 'marginDesc' as const, label: 'أعلى هامش %' },
                { id: 'marginAsc' as const, label: 'أقل هامش %' },
                { id: 'unitProfit' as const, label: 'ربح الوحدة' }
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setMarginSort(s.id)}
                  className={`px-2.5 py-1 rounded-lg transition-colors ${
                    marginSort === s.id
                      ? 'bg-emerald-500 text-slate-950 font-black'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary Margin KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[11px] text-slate-400">متوسط هامش الربح فالمحال</div>
            <div className="text-xl font-black font-mono tabular-nums text-emerald-400 mt-1">
              {productMarginAnalytics.avgMarginPct}%
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              محسوب على {productMarginAnalytics.totalProducts} سلعة فالمخزون
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[11px] text-slate-400">السلعة اللي دخّلات أكبر ربح (30 يوم)</div>
            <div className="text-sm sm:text-base font-black text-white truncate mt-1">
              {productMarginAnalytics.topEarner ? productMarginAnalytics.topEarner.name : '—'}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-amber-400 mt-0.5">
              {productMarginAnalytics.topEarner
                ? `+${productMarginAnalytics.topEarner.profit30d.toFixed(0)} ${currencySymbol} (${productMarginAnalytics.topEarner.sold30d} وحدة)`
                : 'سجل المبيعات باش تبان هنا'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[11px] text-slate-400">أعلى هامش ربح % للوحدة</div>
            <div className="text-sm sm:text-base font-black text-white truncate mt-1">
              {productMarginAnalytics.highestMargin ? productMarginAnalytics.highestMargin.name : '—'}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-emerald-400 mt-0.5">
              {productMarginAnalytics.highestMargin
                ? `${productMarginAnalytics.highestMargin.marginPct}% (+${productMarginAnalytics.highestMargin.unitProfit.toFixed(2)} ${currencySymbol}/وحدة)`
                : '—'}
            </div>
          </div>
        </div>

        {/* Per-Product Margin Table */}
        <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
          <div className="max-h-[380px] overflow-y-auto overflow-x-auto">
            <table className="w-full text-start border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-900 text-slate-300 border-b border-slate-800 font-bold">
                <tr>
                  <th className="py-2.5 px-3 text-start">السلعة</th>
                  <th className="py-2.5 px-3 text-end">ثمن الشراء</th>
                  <th className="py-2.5 px-3 text-end">ثمن البيع</th>
                  <th className="py-2.5 px-3 text-end">الربح / وحدة</th>
                  <th className="py-2.5 px-3 text-center">هامش الربح %</th>
                  <th className="py-2.5 px-3 text-center">المباع (30 يوم)</th>
                  <th className="py-2.5 px-3 text-end">إجمالي ربح 30 يوم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {productMarginAnalytics.rows.slice(0, 80).map((row) => (
                  <tr key={row.id} className="hover:bg-slate-900/70">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-white">{row.name}</div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {row.sku} · المخزون: {row.stock}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-end font-mono tabular-nums text-slate-400">
                      {row.costPrice.toFixed(2)} {currencySymbol}
                    </td>
                    <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-white">
                      {row.price.toFixed(2)} {currencySymbol}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-end font-mono tabular-nums font-black ${
                        row.unitProfit > 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {row.unitProfit >= 0 ? '+' : ''}
                      {row.unitProfit.toFixed(2)} {currencySymbol}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-lg font-mono tabular-nums text-[11px] font-black ${
                          row.marginPct >= 25
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : row.marginPct >= 12
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {row.marginPct}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono tabular-nums text-slate-300">
                      {row.sold30d}
                    </td>
                    <td className="py-2.5 px-3 text-end font-mono tabular-nums font-black text-amber-400">
                      +{row.profit30d.toFixed(2)} {currencySymbol}
                    </td>
                  </tr>
                ))}
                {productMarginAnalytics.rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                      ما كايناش سلعة مطابقة للبحث ديالك.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 4. فين غادي بيك محالك؟ */}
      {/* =================================================================== */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
          <Compass className="w-4 h-4" />
          <span>4. فين غادي بيك محالك؟</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-xs text-slate-400">نتيجة هاد الشهر</div>
            <div className="text-lg sm:text-xl font-black text-white mt-1">
              هاد الشهر ربحتي{' '}
              <span className="text-emerald-400 font-mono tabular-nums">
                {profitAnalytics.monthNet.toLocaleString('en-US')} {currencySymbol}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-xs text-slate-400">توقعات 6 شهور الجاية</div>
            <div className="text-lg sm:text-xl font-black text-white mt-1">
              إلا بقيتي غادي هكا، من هنا 6 شهور غادي يكون عندك{' '}
              <span className="text-amber-400 font-mono tabular-nums">
                {profitAnalytics.sixMonthProjectedTotal.toLocaleString('en-US')} {currencySymbol}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 5. شنو اللي كيخسرك؟ */}
      {/* =================================================================== */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-rose-400 text-sm font-black">
            <AlertTriangle className="w-5 h-5" />
            <span>5. شنو اللي كيخسرك؟ (مسح تلقائي للمخزون والكريدي والتوقيت)</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Stagnant Stock */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-rose-400">
              <span className="flex items-center gap-1.5">
                <Package className="w-4 h-4" />
                <span>السلعة الراكدة</span>
              </span>
              <span className="font-mono tabular-nums">
                {leaksAnalysis.stagnantCapitalTotal.toFixed(0)} {currencySymbol} مجمدة
              </span>
            </div>

            {leaksAnalysis.stagnantProducts.length === 0 ? (
              <p className="text-xs text-emerald-400 font-semibold">
                مزيان! ما كايناش سلعة جالسة بلا بيع فوق شهرين.
              </p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-white">
                  هاد السلعة كتبقى عندك 2 شهور ما كتتباعش ({leaksAnalysis.stagnantProducts.length} صنف):
                </p>
                {leaksAnalysis.stagnantProducts.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="text-[11px] text-slate-300 flex items-center justify-between border-t border-slate-800/80 pt-1"
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="font-mono tabular-nums text-amber-300 shrink-0">
                      {item.stock} حبة · {item.tiedCapital.toFixed(0)} {currencySymbol}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Overdue Credit */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-rose-400">
              <span className="flex items-center gap-1.5">
                <CreditCard className="w-4 h-4" />
                <span>زبناء الكريدي المتأخرين</span>
              </span>
              <span className="font-mono tabular-nums">
                {leaksAnalysis.overdueCreditTotal.toFixed(0)} {currencySymbol}
              </span>
            </div>

            {leaksAnalysis.overdueCreditCustomers.length === 0 ? (
              <p className="text-xs text-emerald-400 font-semibold">
                مزيان! ما كاين حتى زبون متعطل بزاف في الكريدي.
              </p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-white">
                  هاد الزبناء كياخدو كريدي و ما كيخلصوش في الوقت:
                </p>
                {leaksAnalysis.overdueCreditCustomers.slice(0, 3).map((c) => (
                  <div
                    key={c.id}
                    className="text-[11px] text-slate-300 flex items-center justify-between border-t border-slate-800/80 pt-1"
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="font-mono tabular-nums text-rose-300 shrink-0">
                      {c.balance.toFixed(0)} {currencySymbol} ({c.daysWaiting} ي)
                    </span>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setCurrentTab('customers_peak')}
                  className="text-[11px] font-bold text-amber-400 hover:underline flex items-center gap-1 pt-1"
                >
                  <span>صيفط ليهم تذكير واتساب</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Opening Hours vs Peak Traffic */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-amber-400">
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>ساعات الفتح والذروة</span>
              </span>
              <span className="font-mono tabular-nums">معدل الحلان: {leaksAnalysis.avgOpenHourStr}</span>
            </div>

            <p className="text-xs font-bold text-white leading-relaxed">
              {leaksAnalysis.opensLate
                ? 'كتحل معطل، و الزبناء كيجيو قبلك و كيلقاو الباب مسدود!'
                : `توقيت الحلان ديالك مزيان (${leaksAnalysis.avgOpenHourStr})، و لكن باقي تقدر تربح زبناء الصباح.`}
            </p>
            <p className="text-[11px] text-slate-400">
              تقديرياً كاين {leaksAnalysis.avgDailyEarlyCustomers} زبون كيخرجو بكري قبل وقت الذروة الصباحية.
            </p>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 6. شنو إلا زدتيه غادي تربح كتر؟ (تنبيهات الفرص الضائعة) */}
      {/* =================================================================== */}
      <section className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-emerald-400 text-sm font-black">
          <TrendingUp className="w-5 h-5" />
          <span>6. شنو إلا زدتيه غادي تربح كتر؟ (تنبيهات الفرص الضائعة)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <Ear className="w-4 h-4" />
                <span>السلعة الناقصة في ودن الحانوت</span>
              </div>
              <p className="text-sm sm:text-base font-extrabold text-white leading-relaxed">
                إلا جبتي السلعة اللي في ودن الحانوت، غادي تزيد{' '}
                <span className="text-emerald-400 font-mono tabular-nums">
                  {growthOpportunities.estimatedMonthlyShopEarBoost.toLocaleString('en-US')}{' '}
                  {currencySymbol}
                </span>{' '}
                في الشهر
              </p>
              <p className="text-[11px] text-slate-400">
                عندك دابا {growthOpportunities.pendingShopEarCount} طلبات معلقة سولو عليها الزبناء وما لقاوهاش.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCurrentTab('shop_ear')}
                className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black transition-colors"
              >
                شوف ورقة الجملة (ودن الحانوت)
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrentTab('inventory');
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('kadi:open-smart-planning'));
                  }, 60);
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors"
              >
                قائمة الشراء حسب المورد
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>توقيت الحلان والذروة</span>
              </div>
              <p className="text-sm sm:text-base font-extrabold text-white leading-relaxed">
                إلا حليتي مع 8، غادي يجيك{' '}
                <span className="text-emerald-400 font-mono tabular-nums">
                  {growthOpportunities.earlyHourNewCustomers} زبناء جداد
                </span>
              </p>
              <p className="text-[11px] text-slate-400">
                زبناء الفطور والصباح كيقلبو على الحانوت اللي حال بكري قبل ما يمشيو للخدمة.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCurrentTab('customers_peak')}
              className="self-start px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black transition-colors"
            >
              شوف أوقات الذروة ديالك
            </button>
          </div>
        </div>
      </section>

      {/* Big Bottom Action Button: "بدل الحلم ديالي ✏️" */}
      <div className="pt-2 pb-4">
        <button
          type="button"
          onClick={() => {
            setDraftTitle(dreamConfig.title);
            setDraftTarget(String(dreamConfig.targetAmount));
            setDraftInitialSaved(String(dreamConfig.initialSaved));
            setDraftMonthlyTarget(String(monthlyTarget));
            setIsEditingDream(true);
          }}
          className="w-full py-4 px-6 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-base sm:text-lg font-black flex items-center justify-center gap-2 transition-colors shadow-lg"
        >
          <Pencil className="w-5 h-5" />
          <span>بدل الحلم والهدف الشهري ✏️</span>
        </button>
      </div>

      {/* Dream Goal & Monthly Target Editor Modal */}
      {isEditingDream && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <form
            onSubmit={saveDreamConfig}
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4 text-white"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-amber-400">تعديل الحلم والهدف الشهري ✏️</h2>
              <button
                type="button"
                onClick={() => setIsEditingDream(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                الهدف الشهري للربح الصافي ({currencySymbol})
              </label>
              <input
                type="number"
                min="100"
                step="100"
                value={draftMonthlyTarget}
                onChange={(e) => setDraftMonthlyTarget(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-emerald-500/60 text-sm font-mono text-white focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                الحلم الكبير: شنو بغيتي توصل ليه؟ (طونوبيل، تكبير المحال، الحج...)
              </label>
              <input
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                شحال داير الحلم الكبير؟ ({currencySymbol})
              </label>
              <input
                type="number"
                min="100"
                step="100"
                value={draftTarget}
                onChange={(e) => setDraftTarget(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm font-mono text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                شحال ديجا جامع من قبل؟ ({currencySymbol}) — اختياري
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={draftInitialSaved}
                onChange={(e) => setDraftInitialSaved(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm font-mono text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditingDream(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-bold text-slate-300 hover:bg-slate-800"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>حفظ التغييرات</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

