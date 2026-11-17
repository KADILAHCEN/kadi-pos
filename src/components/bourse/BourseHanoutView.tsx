import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePos } from '../../context/PosContext';
import {
  BourseAdvisorAction,
  BourseProductStock,
  buildBourseSnapshot,
  getMarketModeMeta
} from '../../utils/bourseEngine';
import { buildWeeklyTrendSummary } from '../../utils/weeklyTrendEngine';
import { BourseMarketMode, DailyFixedExpenses, ExpenseCategory } from '../../types';
import { getLocalTodayYMD } from '../../utils/expenses';
import { exportBourseThermalPdf } from '../../utils/exportReports';
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Search,
  Package,
  Target,
  Percent,
  Check,
  X,
  Plus,
  ShoppingBag,
  ExternalLink,
  Printer,
  CalendarClock,
  Receipt
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';

type AdvisorFilterType = 'all' | BourseAdvisorAction | 'EXPIRING';

const MiniStockSparkline: React.FC<{
  series: { label: string; sales: number }[];
  trend: 'up' | 'down' | 'flat';
}> = ({ series, trend }) => {
  const width = 116;
  const height = 34;
  const pad = 4;

  const values = series.map((s) => s.sales);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const span = Math.max(1, maxVal - minVal);

  const coords = values.map((val, i) => {
    const x = pad + (i / Math.max(1, values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((val - minVal) / span) * (height - pad * 2);
    return { x, y };
  });

  const linePoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPoints = `${pad},${height - pad} ${linePoints} ${width - pad},${height - pad}`;
  const last = coords[coords.length - 1] || { x: width - pad, y: height / 2 };

  const strokeColor =
    trend === 'up' ? '#16a34a' : trend === 'down' ? '#dc2626' : '#64748b';
  const fillColor =
    trend === 'up'
      ? 'rgba(22, 163, 74, 0.14)'
      : trend === 'down'
      ? 'rgba(220, 38, 38, 0.14)'
      : 'rgba(100, 116, 139, 0.12)';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-28 h-8 shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <polygon points={areaPoints} fill={fillColor} />
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={linePoints}
      />
      <circle cx={last.x} cy={last.y} r="2.75" fill={strokeColor} />
    </svg>
  );
};

export const BourseHanoutView: React.FC = () => {
  const {
    products,
    categories,
    orders,
    expenses,
    cpuRecords,
    zakatSummary,
    settings,
    updateSettings,
    updateProduct,
    addExpense,
    addToCart,
    currencySymbol,
    language,
    isDark,
    setCurrentTab
  } = usePos();

  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const snapshot = useMemo(
    () =>
      buildBourseSnapshot({
        products,
        orders,
        expenses,
        cpuRecords,
        zakatSummary,
        settings
      }),
    [products, orders, expenses, cpuRecords, zakatSummary, settings]
  );

  const weeklyPulse = useMemo(
    () =>
      buildWeeklyTrendSummary({
        orders,
        expenses,
        products,
        categories,
        cpuRecords,
        zakatSummary,
        settings,
        windowWeeks: 4,
        language
      }),
    [orders, expenses, products, categories, cpuRecords, zakatSummary, settings, language]
  );

  const { index: idx, stocks, topGainers, topLosers, counts } = snapshot;

  // Filters & inspector selection
  const [searchQuery, setSearchQuery] = useState('');
  const [advisorFilter, setAdvisorFilter] = useState<AdvisorFilterType>('all');
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);

  // Quick Add Ad-hoc Expense State
  const [showAddExpenseBox, setShowAddExpenseBox] = useState(false);
  const [expName, setExpName] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('other');
  const [syncSavedFeedback, setSyncSavedFeedback] = useState<string | null>(null);

  // Instant Flash Detection on Live Index Changes (green if up, red if down)
  type FlashDir = 'up' | 'down' | null;
  const [flashes, setFlashes] = useState<{
    sales: FlashDir;
    change: FlashDir;
    net: FlashDir;
    breakEven: FlashDir;
    yearly: FlashDir;
  }>({ sales: null, change: null, net: null, breakEven: null, yearly: null });

  const prevSnapshotRef = useRef<{
    sales: number;
    change: number;
    net: number;
    remaining: number;
    yearlyPct: number;
  } | null>(null);

  useEffect(() => {
    const prev = prevSnapshotRef.current;
    if (prev) {
      const nextFlashes: typeof flashes = {
        sales:
          idx.todaySales > prev.sales ? 'up' : idx.todaySales < prev.sales ? 'down' : null,
        change:
          idx.changePctVsYesterday > prev.change
            ? 'up'
            : idx.changePctVsYesterday < prev.change
            ? 'down'
            : null,
        net:
          idx.netProfitToday > prev.net
            ? 'up'
            : idx.netProfitToday < prev.net
            ? 'down'
            : null,
        breakEven:
          idx.remainingToBreakEven < prev.remaining
            ? 'up'
            : idx.remainingToBreakEven > prev.remaining
            ? 'down'
            : null,
        yearly:
          idx.yearlyProgressPct > prev.yearlyPct
            ? 'up'
            : idx.yearlyProgressPct < prev.yearlyPct
            ? 'down'
            : null
      };

      if (
        nextFlashes.sales ||
        nextFlashes.change ||
        nextFlashes.net ||
        nextFlashes.breakEven ||
        nextFlashes.yearly
      ) {
        setFlashes(nextFlashes);
        const timer = window.setTimeout(() => {
          setFlashes({ sales: null, change: null, net: null, breakEven: null, yearly: null });
        }, 680);
        prevSnapshotRef.current = {
          sales: idx.todaySales,
          change: idx.changePctVsYesterday,
          net: idx.netProfitToday,
          remaining: idx.remainingToBreakEven,
          yearlyPct: idx.yearlyProgressPct
        };
        return () => window.clearTimeout(timer);
      }
    }
    prevSnapshotRef.current = {
      sales: idx.todaySales,
      change: idx.changePctVsYesterday,
      net: idx.netProfitToday,
      remaining: idx.remainingToBreakEven,
      yearlyPct: idx.yearlyProgressPct
    };
  }, [
    idx.todaySales,
    idx.changePctVsYesterday,
    idx.netProfitToday,
    idx.remainingToBreakEven,
    idx.yearlyProgressPct
  ]);

  const flashClass = (dir: FlashDir) =>
    dir === 'up'
      ? 'ring-2 ring-emerald-500/70 bg-emerald-500/10 transition-colors duration-300'
      : dir === 'down'
      ? 'ring-2 ring-rose-500/70 bg-rose-500/10 transition-colors duration-300'
      : 'transition-colors duration-500';

  const selectedStock: BourseProductStock | null = useMemo(() => {
    if (!selectedStockId) return null;
    return stocks.find((s) => s.id === selectedStockId) || null;
  }, [stocks, selectedStockId]);

  // Product detail live editor drafts
  const [editPurchasePrice, setEditPurchasePrice] = useState<string>('');
  const [editSalePrice, setEditSalePrice] = useState<string>('');
  const [editStockQty, setEditStockQty] = useState<string>('');
  const [editExpiryDate, setEditExpiryDate] = useState<string>('');

  useEffect(() => {
    if (selectedStock) {
      setEditPurchasePrice(String(selectedStock.purchasePrice));
      setEditSalePrice(String(selectedStock.salePrice));
      setEditStockQty(String(selectedStock.stock));
      setEditExpiryDate(selectedStock.expiryDate || '');
    }
  }, [
    selectedStock?.id,
    selectedStock?.purchasePrice,
    selectedStock?.salePrice,
    selectedStock?.stock,
    selectedStock?.expiryDate
  ]);

  const filteredStocks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return stocks.filter((s) => {
      if (advisorFilter === 'EXPIRING') {
        if (
          s.expiryStatus !== 'expired' &&
          s.expiryStatus !== 'critical' &&
          s.expiryStatus !== 'soon'
        ) {
          return false;
        }
      } else if (advisorFilter !== 'all' && s.advisor.action !== advisorFilter) {
        return false;
      }
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.nameEn || '').toLowerCase().includes(q) ||
        s.sku.toLowerCase().includes(q)
      );
    });
  }, [stocks, searchQuery, advisorFilter]);

  const showToast = (msg: string) => {
    setSyncSavedFeedback(msg);
    window.setTimeout(() => setSyncSavedFeedback(null), 2600);
  };

  // Instant Live Update Handlers (update settings immediately -> all views update same second)
  const handleMarketModeChange = (mode: BourseMarketMode) => {
    updateSettings({ marketMode: mode });
    const meta = getMarketModeMeta(mode);
    showToast(
      isAr
        ? `تم تفعيل وضع السوق: ${meta.labelAr} — تحيّنت الأرباح والتوقعات فالبورصة والداشبورد`
        : `Market Mode set to ${meta.labelEn} — All profits & forecasts updated`
    );
  };

  const handleDailyOverheadChange = (field: keyof DailyFixedExpenses, rawVal: string) => {
    const clean = Math.max(0, Number(rawVal) || 0);
    updateSettings({
      dailyFixedExpenses: {
        ...idx.dailyFixedExpenses,
        [field]: Number(clean.toFixed(2))
      }
    });
  };

  const handleSubscriptionsPctChange = (rawVal: string) => {
    const nextSubs = Math.max(0, Math.min(50, Number(rawVal) || 0));
    updateSettings({ subscriptionsSalesPct: Number(nextSubs.toFixed(1)) });
  };

  const handleYearlyTargetChange = (rawVal: string) => {
    const nextYearly = Math.max(1200, Number(rawVal) || 1200);
    updateSettings({ yearlyProfitTarget: Math.round(nextYearly) });
  };

  const handleQuickAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(expAmount);
    if (!expName.trim() || !Number.isFinite(amt) || amt <= 0) return;
    addExpense({
      name: expName.trim(),
      amount: Number(amt.toFixed(2)),
      date: getLocalTodayYMD(),
      category: expCategory,
      notes: 'مضاف من بورصة الحانوت'
    });
    setExpName('');
    setExpAmount('');
    setShowAddExpenseBox(false);
    showToast(
      isAr
        ? 'تم تسجيل المصروف وتحديث صافي الربح ونقطة التعادل في كل الأقسام'
        : 'Expense added — Profit & Break-even updated everywhere'
    );
  };

  const handleSaveProductChanges = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStock) return;
    const rawPurchase = Number(editPurchasePrice);
    const rawSale = Number(editSalePrice);
    const rawStock = Number(editStockQty);
    if (!Number.isFinite(rawPurchase) || !Number.isFinite(rawSale) || !Number.isFinite(rawStock)) {
      return;
    }

    updateProduct(selectedStock.id, {
      costPrice: Math.max(0, Number(rawPurchase.toFixed(2))),
      price: Math.max(0, Number(rawSale.toFixed(2))),
      stock: Math.max(0, Number(rawStock.toFixed(2))),
      expiryDate: editExpiryDate.trim() ? editExpiryDate.trim() : undefined
    });
    showToast(
      isAr
        ? `تم تحديث "${selectedStock.name}" وربطه مع البورصة، الأرباح، الستوك، والهدف`
        : `Updated "${selectedStock.name}" across Bourse, Profits, Stock & Targets`
    );
  };

  const handleExportThermalPdf = () => {
    const stocksToExport = filteredStocks;
    const filterParts: string[] = [];
    if (advisorFilter === 'EXPIRING') {
      filterParts.push(isAr ? 'فلتر: قرب انتهاء الصلاحية' : 'Filter: Expiring Soon');
    } else if (advisorFilter !== 'all') {
      const filterNames: Record<BourseAdvisorAction, string> = {
        BUY_MORE: isAr ? 'فلتر: شري أكثر' : 'Filter: BUY MORE',
        SELL_NOW: isAr ? 'فلتر: بيع دابا' : 'Filter: SELL NOW',
        INCREASE_PRICE: isAr ? 'فلتر: زيد فالثمن' : 'Filter: INCREASE PRICE',
        DISCOUNT: isAr ? 'فلتر: تخفيض' : 'Filter: DISCOUNT',
        STOP: isAr ? 'فلتر: حبس' : 'Filter: STOP'
      };
      filterParts.push(filterNames[advisorFilter]);
    }
    if (searchQuery.trim()) {
      filterParts.push(`${isAr ? 'بحث' : 'Search'}: "${searchQuery.trim()}"`);
    }

    const res = exportBourseThermalPdf({
      snapshot,
      stocksToExport,
      settings,
      currencySymbol,
      language,
      filterLabel: filterParts.length > 0 ? filterParts.join(' · ') : undefined
    });

    showToast(
      isAr
        ? `تم تصدير تقرير البورصة الحراري (${res.paperWidth}) لـ ${res.itemsCount} سلعة: ${res.filename}`
        : `Exported ${res.paperWidth} thermal Bourse PDF (${res.itemsCount} items): ${res.filename}`
    );
  };

  const fmtMoney = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const indexUp = idx.indexTrend === 'up';
  const indexDown = idx.indexTrend === 'down';
  const thermalPaperBadge = settings.receiptPaperWidth === '58mm' ? '58mm' : '80mm';
  const modeMeta = getMarketModeMeta(idx.marketMode);

  const marketModesList: { id: BourseMarketMode; label: string }[] = [
    { id: 'normal', label: isAr ? 'عادي (Normal)' : 'Normal' },
    { id: 'high_season', label: isAr ? 'موسم طالع (+25%)' : 'High Season' },
    { id: 'low_season', label: isAr ? 'وقت هابط (-20%)' : 'Low Season' },
    { id: 'purchase_increase', label: isAr ? 'زيادة الشراء (+12%)' : 'Purchase +12%' }
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-5 pb-12">
        {/* Top Feedback Banner */}
        {syncSavedFeedback && (
          <div className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{syncSavedFeedback}</span>
            </span>
            <button
              type="button"
              onClick={() => setSyncSavedFeedback(null)}
              className="p-1 hover:bg-emerald-700 rounded-lg"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 1. TOP: HANOUT INDEX CARD + MARKET MODE + LIVE FLASH */}
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
          {/* Header Row */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span>
                  {isAr
                    ? `بث مباشر لحظي · ${modeMeta.labelAr} · ربط تلقائي كامل`
                    : `LIVE STREAM · ${modeMeta.labelEn} · Full Auto-Sync`}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-0.5">
                {isAr ? 'مؤشر الحانوت اليومي — بورصة الحانوت' : 'Bourse Hanout · Market Index'}
              </h1>
            </div>

            {/* Market State + Market Mode Selector + Actions */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Market Mode Segmented Bar */}
              <div
                className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                role="group"
                aria-label={isAr ? 'وضع السوق' : 'Market Mode'}
              >
                {marketModesList.map((m) => {
                  const active = idx.marketMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleMarketModeChange(m.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors ${
                        active
                          ? m.id === 'high_season'
                            ? 'bg-emerald-600 text-white'
                            : m.id === 'low_season' || m.id === 'purchase_increase'
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleExportThermalPdf}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white border border-slate-800 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span>
                  {isAr
                    ? `PDF حراري (${thermalPaperBadge})`
                    : isFr
                    ? `PDF Thermique (${thermalPaperBadge})`
                    : `Thermal PDF (${thermalPaperBadge})`}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentTab('pos')}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <ShoppingBag className="w-4 h-4 shrink-0" />
                <span>{isAr ? 'بيعة جديدة' : 'New Sale'}</span>
              </button>
            </div>
          </div>

          {/* 5 Required Hanout Index Metrics with Green/Red Instant Flash */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* Metric 1: Today's Sales */}
            <div
              className={`p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1 ${flashClass(
                flashes.sales
              )}`}
            >
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {isAr ? 'مبيعات اليوم' : "Today's Sales"}
              </div>
              <div
                className={`text-xl font-black font-mono tabular-nums ${
                  idx.todaySales > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                {fmtMoney(idx.todaySales)}{' '}
                <span className="text-xs font-sans font-bold text-slate-500">{currencySymbol}</span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {idx.todayOrdersCount} {isAr ? 'فواتير' : 'orders'} ·{' '}
                {isAr ? `البارح: ${fmtMoney(idx.yesterdaySales)}` : `Yest: ${fmtMoney(idx.yesterdaySales)}`}
              </div>
            </div>

            {/* Metric 2: Change % vs Yesterday */}
            <div
              className={`p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1 ${flashClass(
                flashes.change
              )}`}
            >
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {isAr ? 'التغيير vs البارح %' : 'Change vs Yesterday'}
              </div>
              <div
                className={`text-xl font-black font-mono tabular-nums flex items-center gap-1 ${
                  indexUp
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : indexDown
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                {indexUp ? (
                  <ArrowUpRight className="w-5 h-5 shrink-0" />
                ) : indexDown ? (
                  <ArrowDownRight className="w-5 h-5 shrink-0" />
                ) : (
                  <Minus className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {idx.changePctVsYesterday > 0 ? '+' : ''}
                  {idx.changePctVsYesterday}%
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {indexUp
                  ? isAr
                    ? 'طالع فوق البارح'
                    : 'Up vs yesterday'
                  : indexDown
                  ? isAr
                    ? 'هابط تحت البارح'
                    : 'Down vs yesterday'
                  : isAr
                  ? 'نفس مستوى البارح'
                  : 'Flat vs yesterday'}
              </div>
            </div>

            {/* Metric 3: Net Profit Today (with Market Mode Forecast) */}
            <div
              className={`p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1 ${flashClass(
                flashes.net
              )}`}
            >
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {isAr ? 'الربح الصافي اليوم' : 'Net Profit Today'}
              </div>
              <div
                className={`text-xl font-black font-mono tabular-nums ${
                  idx.netProfitToday > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : idx.netProfitToday < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {idx.netProfitToday > 0 ? '+' : ''}
                {fmtMoney(idx.netProfitToday)}{' '}
                <span className="text-xs font-sans font-bold text-slate-500">{currencySymbol}</span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {isAr
                  ? `التوقع (${modeMeta.demandMultiplier}x): ${idx.forecastTodayNetProfit > 0 ? '+' : ''}${fmtMoney(idx.forecastTodayNetProfit)}`
                  : `Forecast: ${idx.forecastTodayNetProfit > 0 ? '+' : ''}${fmtMoney(idx.forecastTodayNetProfit)}`}
              </div>
            </div>

            {/* Metric 4: Break-even Seuil = 0 (Green > 0, Yellow = 0, Red < 0 "Need X DH") */}
            <div
              className={`p-4 rounded-xl border space-y-1.5 ${
                idx.breakEvenState === 'profit'
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                  : idx.breakEvenState === 'even'
                  ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                  : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
              } ${flashClass(flashes.breakEven)}`}
            >
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <span>{isAr ? 'نقطة الصفر (Seuil 0)' : 'Break-even Seuil = 0'}</span>
                <span className="font-mono tabular-nums font-bold">{idx.breakEvenProgressPct}%</span>
              </div>
              <div
                className={`text-lg font-black font-mono tabular-nums ${
                  idx.breakEvenState === 'profit'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : idx.breakEvenState === 'even'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {idx.breakEvenState === 'profit'
                  ? isAr
                    ? `رابح +${fmtMoney(idx.netProfitToday)} ${currencySymbol}`
                    : `Profit +${fmtMoney(idx.netProfitToday)} ${currencySymbol}`
                  : idx.breakEvenState === 'even'
                  ? isAr
                    ? `نقطة التعادل = 0`
                    : `Break-even = 0`
                  : isAr
                  ? `خاصك ${fmtMoney(idx.remainingToBreakEven)} ${currencySymbol}`
                  : `Need ${fmtMoney(idx.remainingToBreakEven)} ${currencySymbol}`}
              </div>
              <div className="text-[10px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                {isAr
                  ? `عتبة التعادل: ${fmtMoney(idx.breakEvenSalesToday)} ${currencySymbol}`
                  : `Seuil Sales: ${fmtMoney(idx.breakEvenSalesToday)} ${currencySymbol}`}
              </div>
            </div>

            {/* Metric 5: Yearly Target Progress */}
            <div
              className={`p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1.5 ${flashClass(
                flashes.yearly
              )}`}
            >
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span>{isAr ? 'الهدف السنوي' : 'Yearly Target'}</span>
                <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                  {idx.yearlyProgressPct}%
                </span>
              </div>
              <div className="text-xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
                {idx.yearNetProfit > 0 ? '+' : ''}
                {fmtMoney(idx.yearNetProfit)}{' '}
                <span className="text-xs font-sans font-bold text-slate-500">
                  / {idx.yearlyTarget.toLocaleString('en-US')}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                  style={{ width: `${idx.yearlyProgressPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Live Formula Bar for Break-even Seuil + Connected Totals */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="font-bold text-slate-700 dark:text-slate-200">
              {isAr
                ? 'معادلة التعادل (Seuil 0) = (المصاريف + الاشتراكات + الزكاة) ÷ (نسبة الهامش − نسبة الاشتراكات)'
                : 'Seuil Formula = (Expenses + Subscriptions + Zakat) ÷ (Margin % − Subscription %)'}
            </span>
            <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
              ({fmtMoney(idx.todayExpensesTotal)} + {fmtMoney(idx.todayCpuAmoDaily)} +{' '}
              {fmtMoney(idx.todayZakatDaily)}) ÷ ({idx.averageMarginPct}% − {idx.subscriptionsSalesPct}%) ={' '}
              <strong className="text-slate-900 dark:text-white">
                {fmtMoney(idx.breakEvenSalesToday)} {currencySymbol}
              </strong>
            </span>
          </div>
        </section>

        {/* WEEKLY TREND PULSE BAR (LIVE LINK TO FULL WEEKLY TREND ANALYSIS) */}
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{isAr ? 'نبض الاتجاه الأسبوعي (7 أيام)' : 'Weekly Trend Pulse (7d)'}</span>
            </div>
            <div className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
              {isAr ? 'المبيعات:' : '7d Sales:'}{' '}
              <strong className="text-slate-900 dark:text-white">
                {fmtMoney(weeklyPulse.last7dSales)} {currencySymbol}
              </strong>{' '}
              <span
                className={`font-bold ${
                  weeklyPulse.rolling7dGrowthPct > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : weeklyPulse.rolling7dGrowthPct < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-500'
                }`}
              >
                ({weeklyPulse.rolling7dGrowthPct > 0 ? '+' : ''}
                {weeklyPulse.rolling7dGrowthPct}% WoW)
              </span>
            </div>
            <div className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
              {isAr ? 'صافي 7 أيام:' : '7d Net:'}{' '}
              <strong
                className={
                  weeklyPulse.last7dNetProfit >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }
              >
                {weeklyPulse.last7dNetProfit >= 0 ? '+' : ''}
                {fmtMoney(weeklyPulse.last7dNetProfit)} {currencySymbol}
              </strong>
            </div>
            <div className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
              {isAr ? 'أقوى يوم:' : 'Peak Day:'}{' '}
              <strong className="font-sans text-slate-900 dark:text-white">
                {weeklyPulse.peakWeekday ? weeklyPulse.peakWeekday.name : '—'}
              </strong>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setCurrentTab('analytics');
              window.setTimeout(() => {
                document
                  .getElementById('weekly-trend-analysis')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 80);
            }}
            className="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start lg:self-auto transition-colors"
          >
            <span>{isAr ? 'تحليل الاتجاه الأسبوعي الكامل' : 'Full Weekly Trend Analysis'}</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </button>
        </section>

        {/* 2. TOP GAINERS & TOP LOSERS OF THE DAY */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top Gainers */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-sm font-extrabold text-emerald-700 dark:text-emerald-400">
                <TrendingUp className="w-4 h-4 shrink-0" />
                <span>{isAr ? 'أكبر الرابحين اليوم (Top Gainers)' : 'Top Gainers Today'}</span>
              </div>
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {topGainers.length} {isAr ? 'أسهم طالعة' : 'up'}
              </span>
            </div>

            {topGainers.length === 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400 py-3">
                {isAr
                  ? 'ما كاينينش أسهم طالعة اليوم بعد — غادي يبانو هنا مباشرة مع كل بيعة'
                  : 'No gainers recorded today yet — updates live with every sale'}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {topGainers.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedStockId(g.id)}
                    className="w-full py-2 px-2 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 rounded-lg flex items-center justify-between gap-3 text-start transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                        {g.name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {isAr ? 'ربح اليوم:' : 'Profit:'} +{fmtMoney(g.todayProfit)} {currencySymbol} ·{' '}
                        {isAr ? 'هامش:' : 'Margin:'} {g.marginPct}%
                      </div>
                    </div>
                    <div className="text-end shrink-0 font-mono tabular-nums">
                      <div className="text-xs font-black text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-0.5">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>+{g.changePct}%</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {fmtMoney(g.todaySales)} {currencySymbol}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Top Losers */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-sm font-extrabold text-rose-700 dark:text-rose-400">
                <TrendingDown className="w-4 h-4 shrink-0" />
                <span>{isAr ? 'أكبر الخاسرين والنازلين اليوم (Top Losers)' : 'Top Losers & Risks Today'}</span>
              </div>
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {topLosers.length} {isAr ? 'تنبيهات' : 'alerts'}
              </span>
            </div>

            {topLosers.length === 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400 py-3">
                {isAr
                  ? 'ممتاز! ما كاين حتى سهم خاسر ولا هابط اليوم'
                  : 'No declining or loss-making products today'}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {topLosers.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setSelectedStockId(l.id)}
                    className="w-full py-2 px-2 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 rounded-lg flex items-center justify-between gap-3 text-start transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                        {l.name}
                      </div>
                      <div className="text-[11px] text-rose-600 dark:text-rose-400 truncate">
                        {l.advisor.titleDarija} · {isAr ? 'هامش' : 'M'}: {l.marginPct}%
                      </div>
                    </div>
                    <div className="text-end shrink-0 font-mono tabular-nums">
                      <div className="text-xs font-black text-rose-600 dark:text-rose-400 flex items-center justify-end gap-0.5">
                        <ArrowDownRight className="w-3.5 h-3.5" />
                        <span>{l.changePct}%</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {fmtMoney(l.todaySales)} {currencySymbol}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 3. LINKED SYSTEM: DETAILED EXPENSES + DYNAMIC SUBSCRIPTIONS (CPU+AMO+CNSS) + YEARLY TARGET + ZAKAT */}
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Detailed Daily Expenses (Rent/Day, Electricity/Day, Internet/Day, Transport, Other + Add Expense) */}
          <div className="xl:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {isAr ? 'مصاريف الحانوت اليومية المفصلة' : 'Detailed Daily Store Expenses'}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isAr
                    ? `ثابت/يوم: ${fmtMoney(idx.dailyFixedExpensesTotal)} + اليوم مسجلة: ${fmtMoney(idx.todayDirectExpenses)} = ${fmtMoney(idx.todayExpensesTotal)} ${currencySymbol}/يوم`
                    : `Fixed/day: ${fmtMoney(idx.dailyFixedExpensesTotal)} + Direct today: ${fmtMoney(idx.todayDirectExpenses)} = ${fmtMoney(idx.todayExpensesTotal)} ${currencySymbol}`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddExpenseBox((v) => !v)}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إضافة مصروف' : 'Add Expense'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTab('expenses')}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                >
                  <span>{isAr ? 'السجل' : 'Ledger'}</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* 5 Editable Daily Expense Inputs */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {[
                {
                  key: 'rentPerDay' as const,
                  label: isAr ? 'الكراء / يوم' : 'Rent / Day'
                },
                {
                  key: 'electricityPerDay' as const,
                  label: isAr ? 'الضو والماء / يوم' : 'Electricity / Day'
                },
                {
                  key: 'internetPerDay' as const,
                  label: isAr ? 'الإنترنت / يوم' : 'Internet / Day'
                },
                {
                  key: 'transportPerDay' as const,
                  label: isAr ? 'النقل / يوم' : 'Transport / Day'
                },
                {
                  key: 'otherPerDay' as const,
                  label: isAr ? 'مصاريف أخرى' : 'Other / Day'
                }
              ].map((field) => (
                <div key={field.key}>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 truncate">
                    {field.label}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={idx.dailyFixedExpenses[field.key]}
                    onChange={(e) => handleDailyOverheadChange(field.key, e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              ))}
            </div>

            {showAddExpenseBox && (
              <form
                onSubmit={handleQuickAddExpense}
                className="flex flex-wrap items-end gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
              >
                <div className="w-36">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {isAr ? 'النوع' : 'Category'}
                  </label>
                  <select
                    value={expCategory}
                    onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="rent">{isAr ? 'كراء' : 'Rent'}</option>
                    <option value="electricity">{isAr ? 'كهرباء/إنترنت' : 'Utilities'}</option>
                    <option value="transport">{isAr ? 'نقل' : 'Transport'}</option>
                    <option value="merchandise">{isAr ? 'بضاعة' : 'Merchandise'}</option>
                    <option value="other">{isAr ? 'أخرى' : 'Other'}</option>
                  </select>
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {isAr ? 'الوصف' : 'Label'}
                  </label>
                  <input
                    type="text"
                    required
                    value={expName}
                    onChange={(e) => setExpName(e.target.value)}
                    placeholder={isAr ? 'مثال: تيليكوم أو مازوط' : 'e.g. Internet fiber'}
                    className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div className="w-28">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {currencySymbol}
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    step="any"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    placeholder="100"
                    className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold whitespace-nowrap"
                >
                  {isAr ? 'حفظ' : 'Save'}
                </button>
              </form>
            )}
          </div>

          {/* Dynamic Subscriptions (CPU + AMO + CNSS) + Yearly Target + Zakat Chain */}
          <div className="xl:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {isAr ? 'الاشتراكات (CPU+AMO+CNSS) والزكاة والهدف' : 'Dynamic Subscriptions, Zakat & Target'}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isAr
                    ? 'كلما تزادت المبيعات كتزاد الاشتراكات آلياً بنفس النسبة'
                    : 'Auto-scales with turnover & syncs Analytics + Dashboard'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCurrentTab('analytics')}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
              >
                <span>{isAr ? 'لوحة الأرباح' : 'Profits'}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 truncate">
                    {isAr ? 'الاشتراكات (% رقم المعاملات)' : 'Subs (% Turnover)'}
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      handleSubscriptionsPctChange(String(idx.suggestedCpuTurnoverPct))
                    }
                    className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
                    title={isAr ? 'مزامنة من شريحة CPU/CNSS' : 'Sync from CPU/CNSS records'}
                  >
                    {isAr ? `CPU: ${idx.suggestedCpuTurnoverPct}%` : `Sync ${idx.suggestedCpuTurnoverPct}%`}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step="0.5"
                    value={idx.subscriptionsSalesPct}
                    onChange={(e) => handleSubscriptionsPctChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                  <Percent className="w-3.5 h-3.5 text-slate-400 absolute end-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 truncate">
                  {isAr ? `الهدف السنوي (${currencySymbol})` : `Yearly Target (${currencySymbol})`}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={1200}
                    step={500}
                    value={idx.yearlyTarget}
                    onChange={(e) => handleYearlyTargetChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                  <Target className="w-3.5 h-3.5 text-slate-400 absolute end-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Connected Subscriptions, Zakat, Required Sales Summary */}
            <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
                <div className="text-slate-500 dark:text-slate-400 truncate">
                  {isAr ? 'اقتطاع اليوم' : 'Today Subs'}
                </div>
                <div className="font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                  -{fmtMoney(idx.todaySubscriptionsTotal)} {currencySymbol}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
                <div className="text-slate-500 dark:text-slate-400 truncate">
                  {isAr ? 'الزكاة / يوم' : 'Zakat / Day'}
                </div>
                <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-white mt-0.5">
                  -{fmtMoney(idx.todayZakatDaily)} {currencySymbol}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
                <div className="text-slate-500 dark:text-slate-400 truncate">
                  {isAr ? 'للهدف/يوم' : 'Daily Needed'}
                </div>
                <div className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {idx.requiredDailySalesForYearTarget.toLocaleString('en-US')} {currencySymbol}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. FILTER & ADVISOR SEGMENTED BAR (5 Actions + Expiring + Search) */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {[
              { id: 'all' as const, label: isAr ? `الكل (${stocks.length})` : `All (${stocks.length})` },
              {
                id: 'BUY_MORE' as const,
                label: isAr ? `شري أكثر (${counts.buyMore})` : `BUY MORE (${counts.buyMore})`
              },
              {
                id: 'SELL_NOW' as const,
                label: isAr ? `بيع دابا (${counts.sellNow})` : `SELL NOW (${counts.sellNow})`
              },
              {
                id: 'INCREASE_PRICE' as const,
                label: isAr
                  ? `زيد فالثمن (${counts.increasePrice})`
                  : `INCREASE PRICE (${counts.increasePrice})`
              },
              {
                id: 'DISCOUNT' as const,
                label: isAr ? `تخفيض (${counts.discount})` : `DISCOUNT (${counts.discount})`
              },
              {
                id: 'STOP' as const,
                label: isAr ? `حبس (${counts.stop})` : `STOP (${counts.stop})`
              },
              {
                id: 'EXPIRING' as const,
                label: isAr
                  ? `قريب الصلاحية (${counts.expiring})`
                  : `Expiring (${counts.expiring})`
              }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAdvisorFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                  advisorFilter === tab.id
                    ? tab.id === 'STOP' || tab.id === 'EXPIRING'
                      ? 'bg-rose-600 text-white'
                      : tab.id === 'DISCOUNT' || tab.id === 'INCREASE_PRICE'
                      ? 'bg-amber-600 text-white'
                      : 'bg-emerald-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full lg:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'قلب على أي سهم سلعة...' : 'Search product stock...'}
              className="w-full ps-9 pe-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"
            />
          </div>
        </div>

        {/* 5. MIDDLE: PRODUCT STOCKS LIST + LIVE INSPECTOR SPLIT */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Stocks Grid */}
          <div
            className={`${
              selectedStock ? 'lg:col-span-7 xl:col-span-8' : 'lg:col-span-12'
            } grid grid-cols-1 sm:grid-cols-2 ${
              selectedStock ? 'xl:grid-cols-2' : 'xl:grid-cols-3'
            } gap-4`}
          >
            {filteredStocks.length === 0 ? (
              <div className="col-span-full p-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2">
                <Package className="w-8 h-8 text-slate-400 mx-auto" />
                <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  {isAr ? 'ما كاين حتى منتوج بهاد الفلتر' : 'No matching product stocks'}
                </div>
              </div>
            ) : (
              filteredStocks.map((item) => {
                const isSelected = selectedStock?.id === item.id;
                const isUp = item.trend === 'up';
                const isDown = item.trend === 'down';
                const hasExpiryAlert =
                  item.expiryStatus === 'expired' ||
                  item.expiryStatus === 'critical' ||
                  item.expiryStatus === 'soon';

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedStockId(isSelected ? null : item.id)}
                    className={`text-start p-4 rounded-2xl bg-white dark:bg-slate-900 border transition-all space-y-3 hover:border-emerald-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      isSelected
                        ? 'border-emerald-600 ring-2 ring-emerald-500/25'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {/* Title + Arrow UP/DOWN + Change % */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                          {item.name}
                        </h3>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span>
                            {item.sku} · {isAr ? 'الستوك:' : 'Stk:'} {item.stock}
                          </span>
                          {hasExpiryAlert && (
                            <span
                              className={`font-sans font-bold ${
                                item.expiryStatus === 'expired' || item.expiryStatus === 'critical'
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              ·{' '}
                              {item.expiryStatus === 'expired'
                                ? isAr
                                  ? 'منتهي الصلاحية!'
                                  : 'EXPIRED!'
                                : isAr
                                ? `صلاحية: ${item.daysToExpiry}ي`
                                : `Exp: ${item.daysToExpiry}d`}
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        className={`flex items-center gap-1 font-mono tabular-nums text-xs font-extrabold shrink-0 ${
                          isUp
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : isDown
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {isUp ? (
                          <ArrowUpRight className="w-4 h-4 shrink-0" />
                        ) : isDown ? (
                          <ArrowDownRight className="w-4 h-4 shrink-0" />
                        ) : (
                          <Minus className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>
                          {item.changePct > 0 ? '+' : ''}
                          {item.changePct}%
                        </span>
                      </div>
                    </div>

                    {/* Sale Price, Purchase Price, Margin % + Mini Live Chart */}
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <div className="space-y-1">
                        <div className="text-lg font-black font-mono tabular-nums text-slate-900 dark:text-white">
                          {item.salePrice.toFixed(2)}{' '}
                          <span className="text-[11px] font-sans font-semibold text-slate-500">
                            {currencySymbol}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {isAr ? 'الشراء:' : 'Buy:'}{' '}
                          <span className="font-bold">{item.effectivePurchasePrice.toFixed(2)}</span> ·{' '}
                          {isAr ? 'الهامش:' : 'Margin:'}{' '}
                          <span
                            className={`font-bold ${
                              item.marginPct <= 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : item.marginPct < 13
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {item.marginPct}%
                          </span>
                        </div>
                      </div>

                      <MiniStockSparkline series={item.series} trend={item.trend} />
                    </div>

                    {/* Advisor Action Line */}
                    <div
                      className={`pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] font-bold ${
                        item.advisor.tone === 'red'
                          ? 'text-rose-600 dark:text-rose-400'
                          : item.advisor.tone === 'amber'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      <span>{item.advisor.titleDarija}</span>
                      <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400 truncate">
                        {item.invoicesCount > 0
                          ? isAr
                            ? `${fmtMoney(item.avgNetProfitPerInvoice)} ${currencySymbol}/فاتورة`
                            : `${fmtMoney(item.avgNetProfitPerInvoice)}/inv`
                          : isAr
                          ? 'اضغط للتفاصيل'
                          : 'Inspect'}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Sticky Live Product Inspector (Sales, Profit, Stock, Expenses Share, Net Profit/Invoice + Live Editor) */}
          {selectedStock && (
            <aside className="lg:col-span-5 xl:col-span-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 lg:sticky lg:top-16">
              <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    {selectedStock.sku} ·{' '}
                    <span
                      className={
                        selectedStock.advisor.tone === 'red'
                          ? 'text-rose-600 dark:text-rose-400 font-bold'
                          : selectedStock.advisor.tone === 'amber'
                          ? 'text-amber-600 dark:text-amber-400 font-bold'
                          : 'text-emerald-600 dark:text-emerald-400 font-bold'
                      }
                    >
                      {selectedStock.advisor.titleDarija}
                    </span>
                  </div>
                  <h2 className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
                    {selectedStock.name}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                    {selectedStock.advisor.reasonDarija}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedStockId(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label={isAr ? 'إغلاق' : 'Close'}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Expiry Banner if set */}
              {selectedStock.expiryDate && (
                <div
                  className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
                    selectedStock.expiryStatus === 'expired' || selectedStock.expiryStatus === 'critical'
                      ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                      : selectedStock.expiryStatus === 'soon'
                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <CalendarClock className="w-4 h-4 shrink-0" />
                    <span>
                      {isAr ? 'الصلاحية:' : 'Expiry:'} {selectedStock.expiryDate}
                    </span>
                  </span>
                  <span className="font-mono tabular-nums">
                    {selectedStock.daysToExpiry !== null
                      ? selectedStock.daysToExpiry < 0
                        ? isAr
                          ? 'منتهية!'
                          : 'Expired'
                        : `${selectedStock.daysToExpiry} ${isAr ? 'يوم' : 'days'}`
                      : ''}
                  </span>
                </div>
              )}

              {/* 4 Key Inspector Metrics: Sales, Profit, Net Profit / Invoice, Expenses Share */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {isAr ? 'مبيعات اليوم / الكل' : 'Sales (Today / All)'}
                  </div>
                  <div className="text-sm font-black font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {fmtMoney(selectedStock.todaySales)} {currencySymbol}
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {selectedStock.todayQty} {isAr ? 'اليوم' : 'td'} · {fmtMoney(selectedStock.totalSales)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {isAr ? 'الربح الصافي / فاتورة' : 'Net Profit / Invoice'}
                  </div>
                  <div
                    className={`text-sm font-black font-mono tabular-nums mt-0.5 ${
                      selectedStock.avgNetProfitPerInvoice >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {selectedStock.avgNetProfitPerInvoice > 0 ? '+' : ''}
                    {fmtMoney(selectedStock.avgNetProfitPerInvoice)} {currencySymbol}
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {selectedStock.invoicesCount} {isAr ? 'فواتير' : 'invoices'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {isAr ? 'الربح الصافي اليوم' : 'Net Profit Today'}
                  </div>
                  <div
                    className={`text-sm font-black font-mono tabular-nums mt-0.5 ${
                      selectedStock.netProfitAfterShareToday >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {selectedStock.netProfitAfterShareToday > 0 ? '+' : ''}
                    {fmtMoney(selectedStock.netProfitAfterShareToday)} {currencySymbol}
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {isAr ? 'الستوك:' : 'Stk:'} {selectedStock.stock} ({fmtMoney(selectedStock.stockCostValue)})
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {isAr ? 'نصيب المصاريف والاشتراك' : 'Expenses & Subs Share'}
                  </div>
                  <div className="text-sm font-black font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-0.5">
                    -{fmtMoney(selectedStock.expensesShareToday + selectedStock.subscriptionsShareToday)}{' '}
                    {currencySymbol}
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {isAr ? `وزن اليوم: ${selectedStock.salesWeightPct}%` : `Weight: ${selectedStock.salesWeightPct}%`}
                  </div>
                </div>
              </div>

              {/* 7-Day Trend Area Chart */}
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'حركة مبيعات السهم (آخر 7 أيام)' : '7-Day Stock Trend'}
                </div>
                <div className="h-32 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={selectedStock.series}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={isDark ? '#1e293b' : '#e2e8f0'}
                      />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} width={34} />
                      <Tooltip
                        formatter={(val) => [
                          `${fmtMoney(Number(val ?? 0))} ${currencySymbol}`,
                          isAr ? 'المبيعات' : 'Sales'
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="sales"
                        stroke={selectedStock.trend === 'down' ? '#dc2626' : '#16a34a'}
                        fill={
                          selectedStock.trend === 'down'
                            ? 'rgba(220,38,38,0.16)'
                            : 'rgba(22,163,74,0.18)'
                        }
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Net Profit Per Invoice Breakdown Table */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>{isAr ? 'الربح الصافي حسب الفاتورة' : 'Net Profit Per Invoice'}</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    {selectedStock.recentInvoices.length} {isAr ? 'آخر فواتير' : 'recent'}
                  </span>
                </div>
                {selectedStock.recentInvoices.length === 0 ? (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 py-2">
                    {isAr ? 'ما كاينة حتى فاتورة مسجلة بهاد السلعة بعد' : 'No invoices recorded for this item yet'}
                  </div>
                ) : (
                  <div className="max-h-32 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5">
                    {selectedStock.recentInvoices.map((inv) => (
                      <div
                        key={inv.orderId + inv.qty}
                        className="py-1.5 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {inv.orderNumber}
                          </span>{' '}
                          <span className="text-slate-500 dark:text-slate-400">
                            ×{inv.qty} ({fmtMoney(inv.sales)})
                          </span>
                        </div>
                        <span
                          className={`font-black shrink-0 ${
                            inv.netProfit >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {inv.netProfit >= 0 ? '+' : ''}
                          {fmtMoney(inv.netProfit)} {currencySymbol}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Live Connected Price, Purchase Price, Stock & Expiry Editor */}
              <form
                onSubmit={handleSaveProductChanges}
                className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5"
              >
                <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                  {isAr
                    ? 'تعديل مباشر (يتحدّث تلقائياً فالبورصة، الأرباح، الستوك، والداشبورد)'
                    : 'Live Update (Syncs Bourse, Profits, Stock, Target & Dashboard)'}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      {isAr ? 'ثمن الشراء' : 'Purchase'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={editPurchasePrice}
                      onChange={(e) => setEditPurchasePrice(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      {isAr ? 'ثمن البيع' : 'Sale Price'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={editSalePrice}
                      onChange={(e) => setEditSalePrice(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      {isAr ? 'الستوك' : 'Stock'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={editStockQty}
                      onChange={(e) => setEditStockQty(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      {isAr ? 'الصلاحية' : 'Expiry'}
                    </label>
                    <input
                      type="date"
                      value={editExpiryDate}
                      onChange={(e) => setEditExpiryDate(e.target.value)}
                      className="w-full px-1.5 py-1.5 text-[10px] font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold whitespace-nowrap transition-colors"
                  >
                    {isAr ? 'حفظ ومزامنة الكل' : 'Save & Sync All'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const prod = products.find((p) => p.id === selectedStock.id);
                      if (prod) {
                        addToCart(prod);
                        setCurrentTab('pos');
                      }
                    }}
                    className="py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold whitespace-nowrap shrink-0 transition-colors"
                  >
                    {isAr ? 'إضافة للكيس' : 'Add to POS'}
                  </button>
                </div>
              </form>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
};
