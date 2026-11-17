import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePos } from '../../context/PosContext';
import { getT } from '../../utils/translations';
import { getExpenseCategoryLabel, getLocalTodayYMD } from '../../utils/expenses';
import { Shift } from '../../types';
import { DailySalesReportModal } from '../analytics/DailySalesReportModal';
import {
  ArrowDownRight,
  ArrowUpRight,
  Printer,
  History,
  Lock,
  Unlock,
  CheckCircle2,
  X,
  TrendingUp,
  Coins,
  ClipboardCheck,
  Calculator,
  AlertTriangle,
  Copy,
  Check,
  Download,
  Wallet,
  BarChart3,
  PieChart as PieChartIcon,
  Clock,
  FileText,
  CreditCard,
  RotateCcw,
  Zap,
  Users,
  Ear
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { PinGateModal } from '../auth/PinGateModal';

const CHART_PALETTE = [
  '#059669',
  '#2563EB',
  '#D97706',
  '#7C3AED',
  '#0D9488',
  '#DB2777',
  '#64748B'
];

const toLocalYMD = (isoStr?: string): string => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
};

const MAD_DENOMINATIONS = [
  { key: '200', value: 200, label: '200 د.م' },
  { key: '100', value: 100, label: '100 د.م' },
  { key: '50', value: 50, label: '50 د.م' },
  { key: '20', value: 20, label: '20 د.م' },
  { key: '10', value: 10, label: '10 د.م' },
  { key: '5', value: 5, label: '5 د.م' },
  { key: '2', value: 2, label: '2 د.م' },
  { key: '1', value: 1, label: '1 د.م' },
  { key: '0.5', value: 0.5, label: '0.50 د.م' }
];

export const ShiftsView: React.FC = () => {
  const {
    currentShift,
    openNewShift,
    closeCurrentShift,
    addCashTransaction,
    shiftsHistory,
    currentEmergencySession,
    openEmergencySession,
    closeEmergencySession,
    todayEmergencyStats,
    shopEarRequests,
    currencySymbol,
    orders,
    expenses,
    products,
    categories,
    creditTransactions,
    setCurrentTab,
    isTabProtected,
    settings,
    isDark,
    language
  } = usePos();

  const t = getT(language);
  const isAr = language === 'ar';

  // Modals
  const [showPayInModal, setShowPayInModal] = useState(false);
  const [showPayOutModal, setShowPayOutModal] = useState(false);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState<Shift | null>(null);
  const [showDailyReportModal, setShowDailyReportModal] = useState(false);
  const [showStocktakePinModal, setShowStocktakePinModal] = useState(false);

  // Form values
  const [txAmount, setTxAmount] = useState<number>(50);
  const [txReason, setTxReason] = useState<string>('');
  const [openFloat, setOpenFloat] = useState<number>(500);
  const [openCashier, setOpenCashier] = useState<string>(currentShift.cashierName || 'كاشير كادي');
  const [countedCash, setCountedCash] = useState<number>(500);
  const [closingNotes, setClosingNotes] = useState<string>('');
  const [useDenominationCounter, setUseDenominationCounter] = useState<boolean>(false);
  const [denominations, setDenominations] = useState<Record<string, number>>({});
  const [includeCreditCollections, setIncludeCreditCollections] = useState<boolean>(false);
  const [retainedFloat, setRetainedFloat] = useState<number>(currentShift.startingCash || 0);
  const [reopenNextShift, setReopenNextShift] = useState<boolean>(true);
  const [copiedReport, setCopiedReport] = useState<boolean>(false);
  const [eodChartMode, setEodChartMode] = useState<'periods' | 'categories'>('periods');
  const [eodScope, setEodScope] = useState<'today' | 'shift'>('today');

  // Compute live current shift / end-of-day numbers
  const shiftMetrics = useMemo(() => {
    const shiftStartTime = new Date(currentShift.openedAt).getTime();
    const shiftStartDateStr = currentShift.openedAt.slice(0, 10);

    const activeOrders = orders.filter(
      (o) =>
        new Date(o.date).getTime() >= shiftStartTime &&
        o.status === 'completed' &&
        !o.isEmergencyOvertime
    );
    const refundOrders = orders.filter(
      (o) =>
        new Date(o.date).getTime() >= shiftStartTime &&
        !o.isEmergencyOvertime &&
        (o.status === 'refunded' || o.status === 'partially_refunded')
    );

    let liveCashSales = 0;
    let liveCardSales = 0;
    let liveApplePaySales = 0;
    let liveCreditSales = 0;
    let liveGrossSales = 0;
    let liveTaxes = 0;
    let liveCostOfGoods = 0;

    const paymentCounts = {
      cash: 0,
      card: 0,
      apple_pay: 0,
      credit: 0,
      split: 0
    };

    activeOrders.forEach((o) => {
      liveGrossSales += o.grandTotal;
      liveTaxes += o.taxTotal;
      liveCostOfGoods += o.costTotal || 0;

      if (o.paymentMethod === 'cash') {
        liveCashSales += o.grandTotal;
        paymentCounts.cash += 1;
      } else if (o.paymentMethod === 'card') {
        liveCardSales += o.grandTotal;
        paymentCounts.card += 1;
      } else if (o.paymentMethod === 'apple_pay') {
        liveApplePaySales += o.grandTotal;
        paymentCounts.apple_pay += 1;
      } else if (o.paymentMethod === 'credit') {
        liveCreditSales += o.grandTotal;
        paymentCounts.credit += 1;
      } else if (o.paymentMethod === 'split' && o.splitDetails) {
        liveCashSales += o.splitDetails.cash || 0;
        liveCardSales += o.splitDetails.card || 0;
        liveApplePaySales += o.splitDetails.applePay || 0;
        paymentCounts.split += 1;
      }
    });

    const liveRefunds = refundOrders.reduce(
      (sum, o) => sum + (o.refundedAmount || o.grandTotal),
      0
    );

    const liveCreditCollections = creditTransactions
      .filter((tx) => tx.type === 'payment' && new Date(tx.date).getTime() >= shiftStartTime)
      .reduce((sum, tx) => sum + tx.amount, 0);

    const shiftExpensesList = expenses.filter(
      (e) =>
        new Date(e.createdAt).getTime() >= shiftStartTime ||
        e.date >= shiftStartDateStr
    );
    const liveExpenses = shiftExpensesList.reduce((sum, e) => sum + e.amount, 0);

    let totalPayIns = 0;
    let totalPayOuts = 0;
    (currentShift.cashTransactions || []).forEach((tx) => {
      if (tx.type === 'pay_in') totalPayIns += tx.amount;
      if (tx.type === 'pay_out') totalPayOuts += tx.amount;
    });

    const netSales = liveGrossSales - liveTaxes;
    const grossProfit = netSales - liveCostOfGoods;
    const netProfit = grossProfit - liveExpenses;
    const profitMarginPct = netSales > 0 ? (netProfit / netSales) * 100 : 0;

    const baseExpectedCash =
      currentShift.startingCash + liveCashSales + totalPayIns - totalPayOuts;
    const expectedCashWithOptionalCredit =
      baseExpectedCash + (includeCreditCollections ? liveCreditCollections : 0);

    return {
      activeOrdersCount: activeOrders.length,
      refundOrdersCount: refundOrders.length,
      liveRefunds: Number(liveRefunds.toFixed(2)),
      paymentCounts,
      liveCashSales: Number(liveCashSales.toFixed(2)),
      liveCardSales: Number(liveCardSales.toFixed(2)),
      liveApplePaySales: Number(liveApplePaySales.toFixed(2)),
      liveCreditSales: Number(liveCreditSales.toFixed(2)),
      liveGrossSales: Number(liveGrossSales.toFixed(2)),
      liveTaxes: Number(liveTaxes.toFixed(2)),
      liveCostOfGoods: Number(liveCostOfGoods.toFixed(2)),
      liveExpenses: Number(liveExpenses.toFixed(2)),
      shiftExpensesList,
      liveCreditCollections: Number(liveCreditCollections.toFixed(2)),
      totalPayIns: Number(totalPayIns.toFixed(2)),
      totalPayOuts: Number(totalPayOuts.toFixed(2)),
      netSales: Number(netSales.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2)),
      profitMarginPct: Number(profitMarginPct.toFixed(1)),
      baseExpectedCash: Number(baseExpectedCash.toFixed(2)),
      expectedCashInDrawer: Number(expectedCashWithOptionalCredit.toFixed(2))
    };
  }, [currentShift, orders, expenses, creditTransactions, includeCreditCollections]);

  const eodSummaryData = useMemo(() => {
    const todayYMD = getLocalTodayYMD();
    const shiftStartTime = new Date(currentShift.openedAt).getTime();
    const shiftStartDateStr = toLocalYMD(currentShift.openedAt) || currentShift.openedAt.slice(0, 10);

    const scopeOrders = orders.filter((o) => {
      if (o.status !== 'completed') return false;
      if (eodScope === 'shift') {
        return new Date(o.date).getTime() >= shiftStartTime;
      }
      return toLocalYMD(o.date) === todayYMD;
    });

    const scopeExpenses = expenses.filter((e) => {
      if (eodScope === 'shift') {
        return new Date(e.createdAt).getTime() >= shiftStartTime || e.date >= shiftStartDateStr;
      }
      const expDay = e.date ? e.date.slice(0, 10) : toLocalYMD(e.createdAt);
      return expDay === todayYMD;
    });

    let grossSales = 0;
    let taxes = 0;
    let cogs = 0;

    const periods = [
      {
        key: 'morning',
        label: isAr ? 'الصباح' : 'Morning',
        timeRange: '06:00 - 11:59',
        sales: 0,
        profit: 0,
        ordersCount: 0
      },
      {
        key: 'noon',
        label: isAr ? 'الظهر' : 'Midday',
        timeRange: '12:00 - 15:59',
        sales: 0,
        profit: 0,
        ordersCount: 0
      },
      {
        key: 'afternoon',
        label: isAr ? 'العصر' : 'Afternoon',
        timeRange: '16:00 - 19:59',
        sales: 0,
        profit: 0,
        ordersCount: 0
      },
      {
        key: 'evening',
        label: isAr ? 'المساء والليل' : 'Evening',
        timeRange: '20:00 - 05:59',
        sales: 0,
        profit: 0,
        ordersCount: 0
      }
    ];

    const productCategoryLookup = new Map<string, string>();
    products.forEach((p) => {
      productCategoryLookup.set(p.id, p.categoryId);
    });
    const categoryNameLookup = new Map<string, string>();
    categories.forEach((c) => {
      categoryNameLookup.set(c.id, isAr ? c.name : c.nameEn || c.name);
    });

    const categoryMap = new Map<
      string,
      {
        id: string;
        name: string;
        sales: number;
        profit: number;
        qty: number;
        orderIds: Set<string>;
      }
    >();

    scopeOrders.forEach((o) => {
      grossSales += o.grandTotal || 0;
      taxes += o.taxTotal || 0;
      cogs += o.costTotal || 0;

      const orderDate = new Date(o.date);
      const hour = Number.isNaN(orderDate.getTime()) ? 12 : orderDate.getHours();
      const periodIdx =
        hour >= 6 && hour < 12 ? 0 : hour >= 12 && hour < 16 ? 1 : hour >= 16 && hour < 20 ? 2 : 3;

      const orderNetProfitBeforeExp = (o.grandTotal || 0) - (o.taxTotal || 0) - (o.costTotal || 0);
      periods[periodIdx].sales += o.grandTotal || 0;
      periods[periodIdx].profit += orderNetProfitBeforeExp;
      periods[periodIdx].ordersCount += 1;

      o.items.forEach((item) => {
        const catId = productCategoryLookup.get(item.productId) || 'uncategorized';
        const catName =
          categoryNameLookup.get(catId) || (isAr ? 'منتجات متنوعة' : 'Uncategorized');
        let entry = categoryMap.get(catId);
        if (!entry) {
          entry = {
            id: catId,
            name: catName,
            sales: 0,
            profit: 0,
            qty: 0,
            orderIds: new Set<string>()
          };
          categoryMap.set(catId, entry);
        }
        entry.sales += item.total || 0;
        entry.profit += (item.total || 0) - (item.costPrice || 0) * (item.quantity || 0);
        entry.qty += item.quantity || 0;
        entry.orderIds.add(o.id);
      });
    });

    const totalExpenses = scopeExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const netSales = grossSales - taxes;
    const grossProfit = netSales - cogs;
    const netProfitAfterExpenses = grossProfit - totalExpenses;
    const netMarginPct = netSales > 0 ? (netProfitAfterExpenses / netSales) * 100 : 0;

    const periodBuckets = periods.map((p) => ({
      ...p,
      sales: Number(p.sales.toFixed(2)),
      profit: Number(p.profit.toFixed(2)),
      sharePct: grossSales > 0 ? Number(((p.sales / grossSales) * 100).toFixed(1)) : 0
    }));

    const peakPeriod = periodBuckets.reduce(
      (best, cur) => (cur.sales > best.sales ? cur : best),
      periodBuckets[0]
    );

    const categoryBuckets = Array.from(categoryMap.values())
      .sort((a, b) => b.sales - a.sales)
      .map((entry, idx) => ({
        id: entry.id,
        name: entry.name,
        sales: Number(entry.sales.toFixed(2)),
        profit: Number(entry.profit.toFixed(2)),
        qty: Number(entry.qty.toFixed(2)),
        ordersCount: entry.orderIds.size,
        sharePct: grossSales > 0 ? Number(((entry.sales / grossSales) * 100).toFixed(1)) : 0,
        color: CHART_PALETTE[idx % CHART_PALETTE.length]
      }));

    return {
      ordersCount: scopeOrders.length,
      expensesCount: scopeExpenses.length,
      grossSales: Number(grossSales.toFixed(2)),
      taxes: Number(taxes.toFixed(2)),
      netSales: Number(netSales.toFixed(2)),
      cogs: Number(cogs.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      totalExpenses: Number(totalExpenses.toFixed(2)),
      netProfitAfterExpenses: Number(netProfitAfterExpenses.toFixed(2)),
      netMarginPct: Number(netMarginPct.toFixed(1)),
      periodBuckets,
      peakPeriod,
      categoryBuckets
    };
  }, [orders, expenses, products, categories, currentShift.openedAt, eodScope, isAr]);

  const denominationTotal = useMemo(() => {
    return Number(
      MAD_DENOMINATIONS.reduce(
        (sum, d) => sum + d.value * (denominations[d.key] || 0),
        0
      ).toFixed(2)
    );
  }, [denominations]);

  const effectiveCountedCash = useDenominationCounter ? denominationTotal : countedCash;
  const liveDiscrepancy = Number(
    (effectiveCountedCash - shiftMetrics.expectedCashInDrawer).toFixed(2)
  );
  const merchantTakeHomeCash = Number(
    Math.max(0, effectiveCountedCash - retainedFloat).toFixed(2)
  );

  const openEodModalRef = useRef<() => void>(() => {});
  openEodModalRef.current = () => {
    if (currentShift.status === 'open') {
      setCountedCash(shiftMetrics.expectedCashInDrawer);
      setRetainedFloat(currentShift.startingCash);
      setShowCloseShiftModal(true);
    } else {
      setShowOpenShiftModal(true);
    }
  };

  useEffect(() => {
    if (sessionStorage.getItem('kadi_open_eod_modal') === '1') {
      sessionStorage.removeItem('kadi_open_eod_modal');
      openEodModalRef.current();
    }
    if (sessionStorage.getItem('kadi_open_daily_report') === '1') {
      sessionStorage.removeItem('kadi_open_daily_report');
      setShowDailyReportModal(true);
    }
    const handleOpenEodEvent = () => {
      sessionStorage.removeItem('kadi_open_eod_modal');
      openEodModalRef.current();
    };
    const handleOpenDailyReportEvent = () => {
      sessionStorage.removeItem('kadi_open_daily_report');
      setShowDailyReportModal(true);
    };
    window.addEventListener('kadi:open-eod-closing', handleOpenEodEvent);
    window.addEventListener('kadi:open-daily-report', handleOpenDailyReportEvent);
    return () => {
      window.removeEventListener('kadi:open-eod-closing', handleOpenEodEvent);
      window.removeEventListener('kadi:open-daily-report', handleOpenDailyReportEvent);
    };
  }, []);

  const handlePayIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (txAmount > 0) {
      addCashTransaction('pay_in', txAmount, txReason.trim() || 'إيداع نقدي إضافي');
      setShowPayInModal(false);
      setTxAmount(50);
      setTxReason('');
    }
  };

  const handlePayOut = (e: React.FormEvent) => {
    e.preventDefault();
    if (txAmount > 0) {
      addCashTransaction('pay_out', txAmount, txReason.trim() || 'سحب نقدي / مصروفات');
      setShowPayOutModal(false);
      setTxAmount(50);
      setTxReason('');
    }
  };

  const handleCloseShift = (e: React.FormEvent) => {
    e.preventDefault();
    const closed = closeCurrentShift(effectiveCountedCash, {
      closingNotes,
      denominationBreakdown: useDenominationCounter ? denominations : undefined,
      includeCreditCollectionsInExpectedCash: includeCreditCollections,
      retainedFloatForNextDay: retainedFloat,
      reopenNextShiftWithRetainedFloat: reopenNextShift
    });
    setShowCloseShiftModal(false);
    setClosingNotes('');
    setDenominations({});
    setUseDenominationCounter(false);
    setCopiedReport(false);
    setShowReportModal(closed);
  };

  const buildMerchantZReportText = (report: Shift): string => {
    const storeTitle = settings?.storeName || 'Kadi POS';
    const diff = report.discrepancy ?? 0;
    const diffLabel =
      diff === 0
        ? 'مقاد 100% ✅'
        : diff > 0
        ? `فائض +${diff.toFixed(2)} ${currencySymbol}`
        : `عجز ${diff.toFixed(2)} ${currencySymbol}`;
    const closedAtStr = report.closedAt
      ? new Date(report.closedAt).toLocaleString('ar-MA')
      : new Date().toLocaleString('ar-MA');
    return [
      `📊 تقرير إغلاق صندوق التاجر - ${storeTitle}`,
      `الوردية: #${report.shiftNumber} | المسؤول: ${report.cashierName}`,
      `تاريخ الإغلاق: ${closedAtStr}`,
      `-----------------------------`,
      `💰 إجمالي المبيعات: ${(report.grossSales ?? 0).toFixed(2)} ${currencySymbol}`,
      `📦 تكلفة السلعة: -${(report.totalCostOfGoods ?? 0).toFixed(2)} ${currencySymbol}`,
      `🧾 مصاريف اليوم: -${(report.totalExpenses ?? 0).toFixed(2)} ${currencySymbol}`,
      `📈 الربح الصافي: ${(report.netProfit ?? 0).toFixed(2)} ${currencySymbol}`,
      `-----------------------------`,
      `💵 مبيعات الكاش: ${(report.totalCashSales ?? 0).toFixed(2)} ${currencySymbol}`,
      `💳 مبيعات البطاقة: ${((report.totalCardSales ?? 0) + (report.totalApplePaySales ?? 0)).toFixed(2)} ${currencySymbol}`,
      `📒 الكريدي الممنوح: ${(report.totalCreditSales ?? 0).toFixed(2)} ${currencySymbol}`,
      `📥 المتوقع بالصندوق: ${(report.expectedCash ?? 0).toFixed(2)} ${currencySymbol}`,
      `🧮 المعدود فعلياً: ${(report.actualCashCounted ?? 0).toFixed(2)} ${currencySymbol}`,
      `⚖️ حالة الصندوق: ${diffLabel}`,
      `-----------------------------`,
      `🏦 فوندو الغد المتروك بالدرج: ${(report.retainedFloatForNextDay ?? 0).toFixed(2)} ${currencySymbol}`,
      `🤝 الفلوس المسحوبة للتاجر: ${(report.merchantWithdrawnCash ?? 0).toFixed(2)} ${currencySymbol}`,
      report.closingNotes ? `📝 ملاحظات: ${report.closingNotes}` : ''
    ]
      .filter(Boolean)
      .join('\n');
  };

  const handleCopyZReport = async (report: Shift) => {
    try {
      await navigator.clipboard.writeText(buildMerchantZReportText(report));
      setCopiedReport(true);
      window.setTimeout(() => setCopiedReport(false), 2500);
    } catch {
      // Fallback ignored if clipboard permissions are blocked
    }
  };

  const handleDownloadZReport = (report: Shift) => {
    const content = buildMerchantZReportText(report);
    const blob = new Blob([`\uFEFF${content}`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `z-report-shift-${report.shiftNumber}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleOpenShift = (e: React.FormEvent) => {
    e.preventDefault();
    openNewShift(openFloat, openCashier);
    setShowOpenShiftModal(false);
  };

  const openStocktakeDirect = () => {
    setCurrentTab('inventory');
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('kadi:open-stocktake'));
    }, 60);
  };

  const handleGoToStocktake = () => {
    if (isTabProtected('inventory')) {
      setShowStocktakePinModal(true);
    } else {
      openStocktakeDirect();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Top Banner / Current Shift Overview */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <span
              className={`px-3 py-1 text-xs font-extrabold rounded-full ${
                currentShift.status === 'open'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                  : currentEmergencySession?.status === 'open'
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {currentShift.status === 'open'
                ? t.open_shift
                : currentEmergencySession?.status === 'open'
                ? isAr
                  ? 'فتح استعجالي مفتوح · بلا مدة محدودة'
                  : 'Emergency Open · Unlimited'
                : t.closed_shift}{' '}
              · #{currentShift.shiftNumber}
            </span>
            <span className="text-xs text-slate-400 font-medium">
              {isAr ? 'بدأت في:' : 'Opened:'}{' '}
              {new Date(currentShift.openedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">
            {currentShift.cashierName}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isAr ? 'رصيد الصباح (فوندو الصندوق):' : t.opening_float}{' '}
            <span className="font-bold tabular-nums font-mono">
              {currentShift.startingCash.toFixed(2)} {currencySymbol}
            </span>
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowDailyReportModal(true)}
            className="px-4 py-2 text-xs font-bold rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 transition-colors flex items-center gap-1.5 shadow-2xs whitespace-nowrap shrink-0"
          >
            <FileText className="w-4 h-4" />
            <span>{isAr ? 'تقرير الإغلاق النهاري' : 'Daily Closing Report'}</span>
          </button>

          <button
            type="button"
            onClick={handleGoToStocktake}
            className="px-4 py-2 text-xs font-bold rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 transition-colors flex items-center gap-1.5 shadow-2xs whitespace-nowrap shrink-0"
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>{isAr ? 'جرد المخزون الحقيقي (الحانوت)' : 'Shop Stocktake'}</span>
          </button>

          {currentShift.status === 'open' ? (
            <>
              <button
                onClick={() => setShowPayInModal(true)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-emerald-700 dark:text-emerald-400 transition-colors flex items-center gap-1.5 shadow-2xs whitespace-nowrap shrink-0"
              >
                <ArrowDownRight className="w-4 h-4" />
                <span>{t.pay_in}</span>
              </button>
              <button
                onClick={() => setShowPayOutModal(true)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-rose-600 dark:text-rose-400 transition-colors flex items-center gap-1.5 shadow-2xs whitespace-nowrap shrink-0"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>{t.pay_out}</span>
              </button>
              <button
                onClick={() => openEodModalRef.current()}
                className="px-5 py-2.5 text-xs sm:text-sm font-black rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition-colors flex items-center gap-2 shadow-md ring-2 ring-rose-500/25 whitespace-nowrap shrink-0"
              >
                <Lock className="w-4 h-4" />
                <span>{isAr ? 'إغلاق الصندوق آخر النهار' : t.close_shift_btn}</span>
              </button>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {currentEmergencySession?.status === 'open' ? (
                <button
                  type="button"
                  onClick={() => closeEmergencySession()}
                  className="px-4 py-2.5 text-xs sm:text-sm font-black rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap shrink-0"
                >
                  <Lock className="w-4 h-4" />
                  <span>{isAr ? 'إغلاق الفتح الاستعجالي بيدي' : 'Close Emergency Opening'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openEmergencySession()}
                  className="px-4 py-2.5 text-xs sm:text-sm font-black rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap shrink-0"
                >
                  <Zap className="w-4 h-4" />
                  <span>{isAr ? 'فتح استعجالي (بلا مدة)' : 'Emergency Open'}</span>
                </button>
              )}
              <button
                onClick={() => setShowOpenShiftModal(true)}
                className="px-4 py-2.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap shrink-0"
              >
                <Unlock className="w-4 h-4" />
                <span>{t.open_shift_btn}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Emergency Re-Opening & Overtime Sales Card (الفتح الاستعجالي و الوقت بدل الضائع) */}
      {(currentShift.status === 'closed' || todayEmergencyStats.openingsCount > 0) && (
        <div
          className={`rounded-2xl p-4 sm:p-5 border transition-colors ${
            currentEmergencySession?.status === 'open'
              ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${
                    currentEmergencySession?.status === 'open'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>
                    {currentEmergencySession?.status === 'open'
                      ? isAr
                        ? 'الفتح الاستعجالي شغال الآن (مفتوح بلا مدة محدودة)'
                        : 'Emergency Open Active (No Auto-Close Timer)'
                      : isAr
                      ? 'الفتح الاستعجالي والوقت بدل الضائع'
                      : 'Emergency Re-Opening & Overtime'}
                  </span>
                </span>
                {currentEmergencySession?.status === 'open' && (
                  <span className="text-xs font-mono tabular-nums text-amber-800 dark:text-amber-300">
                    {isAr ? 'تحلّ في:' : 'Opened:'}{' '}
                    {new Date(currentEmergencySession.openedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                )}
              </div>

              <p className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                {isAr
                  ? `اليوم حليتي استعجالي ${todayEmergencyStats.openingsCount} مرات، و جاوك ${todayEmergencyStats.customersCount} زبون من بعد السدان`
                  : `Today you opened emergency ${todayEmergencyStats.openingsCount} times, serving ${todayEmergencyStats.customersCount} customers after closing`}
              </p>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAr
                  ? 'مبيعات الوقت بدل الضائع كتتحسب بوحدها، والصندوق كيبقى محلول حتى تسدو بيدك ملي كتسالي الروينة.'
                  : 'Overtime sales are tracked separately from your closed shift, and the drawer stays open until you manually close it.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <div className="px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {isAr ? 'مبيعات الوقت بدل الضائع' : 'Overtime Sales'}
                </div>
                <div className="text-base font-black font-mono tabular-nums text-amber-700 dark:text-amber-300">
                  {todayEmergencyStats.totalSales.toFixed(2)} {currencySymbol}
                </div>
              </div>

              <div className="px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {isAr ? 'زبناء بعد السدان' : 'After-Hours Customers'}
                </div>
                <div className="text-base font-black font-mono tabular-nums text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>{todayEmergencyStats.customersCount}</span>
                </div>
              </div>

              {currentShift.status === 'closed' && (
                currentEmergencySession?.status === 'open' ? (
                  <button
                    type="button"
                    onClick={() => closeEmergencySession()}
                    className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{isAr ? 'إغلاق الفتح الاستعجالي' : 'Close Emergency'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openEmergencySession()}
                    className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>{isAr ? 'فتح استعجالي الآن' : 'Emergency Open'}</span>
                  </button>
                )
              )}

              <button
                type="button"
                onClick={() => setCurrentTab('customers_peak')}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
              >
                {isAr ? 'صفحة الزبناء و الذروة' : 'Customers & Peak'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nightly Shop Ear Summary Strip (خلاصة ودن الحانوت الليلية) */}
      {shopEarRequests.length > 0 && (() => {
        const todayKey = getLocalTodayYMD();
        const weekAgoMs = Date.now() - 7 * 86400000;
        const todayReqs = shopEarRequests.filter((r) => r.dateKey === todayKey && r.status !== 'notified');
        const weekReqs = shopEarRequests.filter((r) => {
          const ms = new Date(r.requestedAt).getTime();
          return !Number.isNaN(ms) && ms >= weekAgoMs && r.status !== 'notified';
        });
        const counts = new Map<string, { name: string; today: number; week: number }>();
        weekReqs.forEach((r) => {
          const prev = counts.get(r.normalizedName) || { name: r.itemName, today: 0, week: 0 };
          prev.week += 1;
          if (r.dateKey === todayKey) prev.today += 1;
          counts.set(r.normalizedName, prev);
        });
        const topItem = Array.from(counts.values()).sort((a, b) => b.today - a.today || b.week - a.week)[0];
        const arrivedCnt = shopEarRequests.filter((r) => r.status === 'arrived').length;
        if (!topItem && arrivedCnt === 0) return null;

        return (
          <div className="rounded-2xl p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                <Ear className="w-4 h-4" />
              </div>
              <div className="text-xs space-y-0.5">
                <div className="font-black text-slate-900 dark:text-white">
                  {isAr ? 'خلاصة ودن الحانوت (السلعة اللي كتخسرك فلوس)' : 'Shop Ear Evening Summary'}
                </div>
                {topItem && (
                  <p className="text-slate-600 dark:text-slate-300 font-semibold">
                    {isAr
                      ? `اليوم ${todayReqs.length} طلب (${topItem.today} على "${topItem.name}") · هاد السيمانة ${topItem.week} واحد سول على "${topItem.name}" و ما جبتيهاش`
                      : `Today: ${todayReqs.length} missed · This week: ${topItem.week} asked for "${topItem.name}"`}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCurrentTab('shop_ear')}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black whitespace-nowrap shrink-0"
            >
              {arrivedCnt > 0
                ? isAr
                  ? `ورقة الجملة وإخبار ${arrivedCnt} زبون`
                  : `Wholesale & Notify (${arrivedCnt})`
                : isAr
                ? 'فتح ورقة الجملة (ودن الحانوت)'
                : 'Open Wholesale Sheet'}
            </button>
          </div>
        );
      })()}

      {/* End-of-Day Cash Drawer & Real Net Profit Breakdown Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Card 1: Expected Cash in Drawer */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {isAr ? 'الفلوس المفروض تكون في الصندوق' : t.expected_cash}
            </span>
            <Coins className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1.5 tabular-nums font-mono">
            {shiftMetrics.expectedCashInDrawer.toFixed(2)} {currencySymbol}
          </div>
          <div className="text-[11px] text-slate-400 mt-1.5">
            {isAr
              ? `الصباح (${currentShift.startingCash}) + كاش (${shiftMetrics.liveCashSales}) + إيداع (${shiftMetrics.totalPayIns}) - سحب (${shiftMetrics.totalPayOuts})`
              : 'Opening + Cash Sales + Pay Ins - Pay Outs'}
          </div>
        </div>

        {/* Card 2: True Net Profit Today / Shift */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-300/70 dark:border-emerald-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
              {isAr ? 'الربح الصافي الحقيقي (بعد المصاريف والتكلفة)' : 'True Net Profit'}
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div
            className={`text-2xl font-black mt-1.5 tabular-nums font-mono ${
              shiftMetrics.netProfit >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {shiftMetrics.netProfit >= 0 ? '+' : ''}
            {shiftMetrics.netProfit.toFixed(2)} {currencySymbol}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
            {isAr
              ? `ربح البيع (${shiftMetrics.grossProfit.toFixed(2)}) - المصاريف (${shiftMetrics.liveExpenses.toFixed(2)}) · الهامش ${shiftMetrics.profitMarginPct}%`
              : `Gross Profit (${shiftMetrics.grossProfit.toFixed(2)}) - Expenses (${shiftMetrics.liveExpenses.toFixed(2)})`}
          </div>
        </div>

        {/* Card 3: Gross Sales & Cost Breakdown */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
            {isAr ? 'إجمالي المبيعات وتكلفة السلعة' : 'Gross Sales & COGS'}
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1.5 tabular-nums font-mono">
            {shiftMetrics.liveGrossSales.toFixed(2)} {currencySymbol}
          </div>
          <div className="text-[11px] text-slate-400 mt-1.5 flex flex-wrap items-center gap-2">
            <span>{shiftMetrics.activeOrdersCount} {isAr ? 'فاتورة' : 'orders'}</span>
            <span>·</span>
            <span>{isAr ? 'تكلفة السلعة:' : 'COGS:'} {shiftMetrics.liveCostOfGoods.toFixed(2)}</span>
          </div>
        </div>

        {/* Card 4: Cash Sales */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isAr ? 'مبيعات الكاش (نقداً)' : 'Cash Sales'}
          </div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums font-mono">
            {shiftMetrics.liveCashSales.toFixed(2)} {currencySymbol}
          </div>
        </div>

        {/* Card 5: Card & Electronic Sales */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isAr ? 'مبيعات البطاقة / TPE' : 'Card & Digital Sales'}
          </div>
          <div className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1 tabular-nums font-mono">
            {(shiftMetrics.liveCardSales + shiftMetrics.liveApplePaySales).toFixed(2)} {currencySymbol}
          </div>
        </div>

        {/* Card 6: Credit Given vs Credit Collected */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isAr ? 'الكريدي اليوم (مبيعات / تحصيل)' : 'Credit (Sales / Collected)'}
          </div>
          <div className="text-lg font-black text-amber-600 dark:text-amber-400 mt-1 tabular-nums font-mono flex items-center gap-2">
            <span>{shiftMetrics.liveCreditSales.toFixed(2)}</span>
            <span className="text-slate-400 text-xs">/</span>
            <span className="text-emerald-600 dark:text-emerald-400">
              +{shiftMetrics.liveCreditCollections.toFixed(2)} {currencySymbol}
            </span>
          </div>
        </div>
      </div>

      {/* End-of-Day Summary Chart & Net Profit After Expenses Statement */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
              {isAr ? 'ملخص نهاية اليوم وتوزيع المبيعات' : 'End-of-Day Summary & Sales Distribution'}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>
                {eodScope === 'today'
                  ? isAr
                    ? 'نطاق العرض: اليوم الكامل'
                    : 'Scope: Full Day'
                  : isAr
                  ? `نطاق العرض: الوردية #${currentShift.shiftNumber}`
                  : `Scope: Shift #${currentShift.shiftNumber}`}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {eodSummaryData.ordersCount} {isAr ? 'فاتورة' : 'orders'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {eodSummaryData.expensesCount} {isAr ? 'مصروف' : 'expenses'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Scope Filter */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setEodScope('today')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  eodScope === 'today'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {isAr ? 'اليوم بالكامل' : 'Full Day'}
              </button>
              <button
                type="button"
                onClick={() => setEodScope('shift')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  eodScope === 'shift'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {isAr ? 'الوردية الحالية' : 'Current Shift'}
              </button>
            </div>

            {/* Chart Mode Switcher */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setEodChartMode('periods')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  eodChartMode === 'periods'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{isAr ? 'فترات اليوم' : 'Day Periods'}</span>
              </button>
              <button
                type="button"
                onClick={() => setEodChartMode('categories')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  eodChartMode === 'categories'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <PieChartIcon className="w-3.5 h-3.5" />
                <span>{isAr ? 'فئات المنتجات' : 'Product Categories'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Distribution Chart Area */}
          <div className="lg:col-span-8 min-w-0 flex flex-col justify-between space-y-5">
            {eodSummaryData.ordersCount === 0 ? (
              <div className="flex-1 min-h-[280px] flex flex-col items-center justify-center text-center px-6 py-10 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 space-y-3">
                <BarChart3 className="w-9 h-9 text-slate-400" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    {isAr
                      ? 'لا توجد مبيعات مسجلة في هذا النطاق بعد'
                      : 'No completed sales recorded in this scope yet'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isAr
                      ? 'سيظهر هنا الرسم البياني لتوزيع المبيعات حسب فترات اليوم وفئات المنتجات بمجرد تسجيل أول عملية بيع.'
                      : 'Sales breakdown charts by time period and product category will appear once orders are recorded.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentTab('pos')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0"
                >
                  {isAr ? 'الانتقال لنقطة البيع' : 'Go to POS Register'}
                </button>
              </div>
            ) : eodChartMode === 'periods' ? (
              <>
                <div className="w-full h-[270px] min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={eodSummaryData.periodBuckets}
                      margin={{ top: 10, right: 12, left: 0, bottom: 4 }}
                      barGap={8}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={isDark ? '#1e293b' : '#e2e8f0'}
                        strokeOpacity={isDark ? 0.85 : 0.7}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12, fontWeight: 700, fill: isDark ? '#cbd5e1' : '#334155' }}
                        axisLine={{ stroke: isDark ? '#26344a' : '#cbd5e1' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        width={54}
                      />
                      <Tooltip
                        cursor={{ fill: isDark ? 'rgba(30,41,59,0.5)' : 'rgba(241,245,249,0.8)' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const row = payload[0].payload as (typeof eodSummaryData.periodBuckets)[number];
                            return (
                              <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-xl text-xs space-y-1.5 border border-slate-700 min-w-[190px]">
                                <div className="font-black text-slate-100 flex items-center justify-between gap-3">
                                  <span>{row.label}</span>
                                  <span className="text-[11px] font-mono text-slate-400">{row.timeRange}</span>
                                </div>
                                <div className="flex justify-between gap-4 font-mono tabular-nums text-emerald-400 font-bold">
                                  <span>{isAr ? 'المبيعات:' : 'Sales:'}</span>
                                  <span>
                                    {row.sales.toFixed(2)} {currencySymbol}
                                  </span>
                                </div>
                                <div className="flex justify-between gap-4 font-mono tabular-nums text-sky-400 font-bold">
                                  <span>{isAr ? 'ربح البيع:' : 'Gross Profit:'}</span>
                                  <span>
                                    {row.profit.toFixed(2)} {currencySymbol}
                                  </span>
                                </div>
                                <div className="flex justify-between gap-4 pt-1 border-t border-slate-700 text-slate-300 font-mono tabular-nums">
                                  <span>{row.ordersCount} {isAr ? 'فاتورة' : 'orders'}</span>
                                  <span>{row.sharePct}%</span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: '12px', fontWeight: 700, paddingTop: '8px' }}
                      />
                      <Bar
                        dataKey="sales"
                        name={isAr ? 'إجمالي المبيعات' : 'Sales'}
                        fill="#059669"
                        radius={[8, 8, 0, 0]}
                        maxBarSize={44}
                      />
                      <Bar
                        dataKey="profit"
                        name={isAr ? 'ربح البيع' : 'Gross Profit'}
                        fill="#2563EB"
                        radius={[8, 8, 0, 0]}
                        maxBarSize={44}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Period Breakdown Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  {eodSummaryData.periodBuckets.map((p) => {
                    const isPeak = eodSummaryData.peakPeriod.key === p.key && p.sales > 0;
                    return (
                      <div
                        key={p.key}
                        className={`p-3 rounded-xl border ${
                          isPeak
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 text-xs font-extrabold text-slate-800 dark:text-slate-100">
                          <span>{p.label}</span>
                          <span className="font-mono tabular-nums text-[11px] text-emerald-700 dark:text-emerald-400">
                            {p.sharePct}%
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">{p.timeRange}</div>
                        <div className="text-sm font-black font-mono tabular-nums text-slate-900 dark:text-white mt-1.5">
                          {p.sales.toFixed(2)} {currencySymbol}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                          {p.ordersCount} {isAr ? 'فاتورة' : 'orders'}
                          {isPeak ? (isAr ? ' · الذروة' : ' · Peak') : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                <div className="md:col-span-5 h-[260px] min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={eodSummaryData.categoryBuckets}
                        dataKey="sales"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={56}
                        outerRadius={92}
                        paddingAngle={2}
                        stroke={isDark ? '#0a0f18' : '#ffffff'}
                        strokeWidth={2}
                      >
                        {eodSummaryData.categoryBuckets.map((entry) => (
                          <Cell key={entry.id} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const row = payload[0].payload as (typeof eodSummaryData.categoryBuckets)[number];
                            return (
                              <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 border border-slate-700">
                                <div className="font-black text-slate-100">{row.name}</div>
                                <div className="font-mono tabular-nums text-emerald-400 font-bold">
                                  {row.sales.toFixed(2)} {currencySymbol} ({row.sharePct}%)
                                </div>
                                <div className="font-mono tabular-nums text-slate-300">
                                  {isAr ? 'الربح:' : 'Profit:'} {row.profit.toFixed(2)} {currencySymbol}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="md:col-span-7 overflow-x-auto">
                  <table className="w-full text-xs text-left rtl:text-right">
                    <thead className="text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2 pe-3">{isAr ? 'الفئة' : 'Category'}</th>
                        <th className="py-2 px-2 text-center">{isAr ? 'الكمية' : 'Qty'}</th>
                        <th className="py-2 px-2 text-end">{isAr ? 'الحصة' : 'Share'}</th>
                        <th className="py-2 px-2 text-end">{isAr ? 'المبيعات' : 'Sales'}</th>
                        <th className="py-2 ps-2 text-end">{isAr ? 'ربح البيع' : 'Profit'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {eodSummaryData.categoryBuckets.map((cat) => (
                        <tr key={cat.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 pe-3">
                            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                              <span
                                className="w-2.5 h-2.5 rounded-sm shrink-0"
                                style={{ backgroundColor: cat.color }}
                              />
                              <span className="truncate max-w-[140px]">{cat.name}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono tabular-nums text-slate-600 dark:text-slate-300">
                            {cat.qty}
                          </td>
                          <td className="py-2.5 px-2 text-end font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300">
                            {cat.sharePct}%
                          </td>
                          <td className="py-2.5 px-2 text-end font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                            {cat.sales.toFixed(2)} {currencySymbol}
                          </td>
                          <td className="py-2.5 ps-2 text-end font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                            +{cat.profit.toFixed(2)} {currencySymbol}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Net Profit After Expenses Breakdown Statement */}
          <div className="lg:col-span-4 lg:border-s lg:ps-6 border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
                {isAr
                  ? 'حساب إجمالي الربح الصافي بعد المصروفات'
                  : 'Net Profit After Expenses Breakdown'}
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <span className="text-slate-600 dark:text-slate-400">
                    {isAr ? 'إجمالي المبيعات (شامل الضريبة)' : 'Gross Sales'}
                  </span>
                  <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                    {eodSummaryData.grossSales.toFixed(2)} {currencySymbol}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <span className="text-slate-600 dark:text-slate-400">
                    {isAr ? 'صافي المبيعات (بعد الضريبة)' : 'Net Sales (ex. Tax)'}
                  </span>
                  <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                    {eodSummaryData.netSales.toFixed(2)} {currencySymbol}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <span className="text-slate-600 dark:text-slate-400">
                    {isAr ? '− تكلفة السلعة المباعة' : '− Cost of Goods Sold'}
                  </span>
                  <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300">
                    -{eodSummaryData.cogs.toFixed(2)} {currencySymbol}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {isAr ? '= إجمالي ربح البيع' : '= Gross Profit'}
                  </span>
                  <span className="font-mono tabular-nums font-black text-slate-900 dark:text-white">
                    {eodSummaryData.grossProfit.toFixed(2)} {currencySymbol}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <span className="text-rose-700 dark:text-rose-400 font-semibold">
                    {isAr
                      ? `− المصروفات (${eodScope === 'today' ? 'اليوم' : 'الوردية'})`
                      : '− Operating Expenses'}
                  </span>
                  <span className="font-mono tabular-nums font-black text-rose-600 dark:text-rose-400">
                    -{eodSummaryData.totalExpenses.toFixed(2)} {currencySymbol}
                  </span>
                </div>
              </div>
            </div>

            <div
              className={`p-4 rounded-2xl border space-y-2 ${
                eodSummaryData.netProfitAfterExpenses >= 0
                  ? 'bg-emerald-50/80 dark:bg-emerald-950/35 border-emerald-200 dark:border-emerald-800/70'
                  : 'bg-rose-50/80 dark:bg-rose-950/35 border-rose-200 dark:border-rose-800/70'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-xs font-extrabold text-slate-700 dark:text-slate-200">
                <span>
                  {isAr ? 'إجمالي الربح الصافي النهائي' : 'Final Net Profit'}
                </span>
                <span className="font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-300">
                  {isAr ? 'الهامش:' : 'Margin:'} {eodSummaryData.netMarginPct}%
                </span>
              </div>
              <div
                className={`text-2xl font-black font-mono tabular-nums ${
                  eodSummaryData.netProfitAfterExpenses >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {eodSummaryData.netProfitAfterExpenses >= 0 ? '+' : ''}
                {eodSummaryData.netProfitAfterExpenses.toFixed(2)} {currencySymbol}
              </div>
              <div className="flex items-center justify-between gap-2 pt-1 text-[11px]">
                <span
                  className={`font-bold ${
                    eodSummaryData.netProfitAfterExpenses >= 0
                      ? 'text-emerald-800 dark:text-emerald-300'
                      : 'text-rose-800 dark:text-rose-300'
                  }`}
                >
                  {eodSummaryData.netProfitAfterExpenses >= 0
                    ? isAr
                      ? 'ربح صافي بعد خصم جميع المصروفات'
                      : 'Net profit after all expenses'
                    : isAr
                    ? 'عجز / خسارة صافية بعد المصروفات'
                    : 'Net deficit after expenses'}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentTab('expenses')}
                  className="font-bold text-slate-700 dark:text-slate-200 hover:underline whitespace-nowrap shrink-0"
                >
                  {isAr ? 'إدارة المصاريف' : 'Expenses'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cash Drawer Transactions Table (Pay In / Pay Out) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
            {isAr ? 'حركات الصندوق في هذه الوردية (إيداع وسحب)' : 'Shift Cash Transactions (Pay In / Pay Out)'}
          </h3>
          <span className="text-xs text-slate-400 font-semibold">
            {currentShift.cashTransactions?.length || 0} {isAr ? 'حركة' : 'tx'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left rtl:text-right text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="py-3 px-5">{t.date_time}</th>
                <th className="py-3 px-4">{isAr ? 'النوع' : 'Type'}</th>
                <th className="py-3 px-4 font-mono">{isAr ? 'المبلغ' : 'Amount'}</th>
                <th className="py-3 px-5">{t.reason}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
              {(!currentShift.cashTransactions || currentShift.cashTransactions.length === 0) ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400">
                    {isAr ? 'لا توجد حركات إيداع أو سحب مسجلة في هذه الوردية' : 'No pay-in/out records for this shift'}
                  </td>
                </tr>
              ) : (
                currentShift.cashTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-5 font-mono text-[11px] text-slate-500">
                      {new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          tx.type === 'pay_in'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                        }`}
                      >
                        {tx.type === 'pay_in' ? t.pay_in : t.pay_out}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold tabular-nums">
                      <span className={tx.type === 'pay_in' ? 'text-emerald-600' : 'text-rose-600'}>
                        {tx.type === 'pay_in' ? `+${tx.amount.toFixed(2)}` : `-${tx.amount.toFixed(2)}`} {currencySymbol}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-slate-600 dark:text-slate-400">
                      {tx.reason}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Closed Shifts History (سجل إغلاقات آخر النهار السابقة) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-600" />
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
              {isAr ? 'سجل إغلاقات الصندوق السابقة (آخر النهار)' : 'Previous End-of-Day Closings'}
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-semibold">
            {shiftsHistory.length} {isAr ? 'إغلاق' : 'closings'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left rtl:text-right text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">{isAr ? 'الوردية / التاريخ' : 'Shift / Date'}</th>
                <th className="py-3 px-4">{isAr ? 'إجمالي المبيعات' : 'Sales'}</th>
                <th className="py-3 px-4">{isAr ? 'الربح الصافي' : 'Net Profit'}</th>
                <th className="py-3 px-4">{isAr ? 'المتوقع' : 'Expected'}</th>
                <th className="py-3 px-4">{isAr ? 'المعدود' : 'Counted'}</th>
                <th className="py-3 px-4">{isAr ? 'فوندو الغد / سحب التاجر' : 'Retained / Withdrawn'}</th>
                <th className="py-3 px-4">{isAr ? 'حالة الصندوق' : 'Drawer Status'}</th>
                <th className="py-3 px-4 text-center">{isAr ? 'التقرير' : 'Report'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {shiftsHistory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    {isAr
                      ? 'لا توجد إغلاقات سابقة بعد. اضغط "إغلاق الصندوق آخر النهار" لحفظ أول تقرير.'
                      : 'No closed shifts yet.'}
                  </td>
                </tr>
              ) : (
                shiftsHistory.map((sh) => {
                  const diff = sh.discrepancy ?? 0;
                  return (
                    <tr key={sh.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">
                          #{sh.shiftNumber} · {sh.cashierName}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {sh.closedAt ? new Date(sh.closedAt).toLocaleString('ar-MA') : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold tabular-nums">
                        {(sh.grossSales ?? 0).toFixed(2)} {currencySymbol}
                      </td>
                      <td className="py-3 px-4 font-mono font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                        {(sh.netProfit ?? 0).toFixed(2)} {currencySymbol}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums">
                        {(sh.expectedCash ?? 0).toFixed(2)} {currencySymbol}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold tabular-nums">
                        {(sh.actualCashCounted ?? 0).toFixed(2)} {currencySymbol}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] tabular-nums">
                        <div className="text-slate-500">
                          {isAr ? 'فوندو:' : 'Float:'} {(sh.retainedFloatForNextDay ?? 0).toFixed(2)}
                        </div>
                        <div className="font-bold text-indigo-600 dark:text-indigo-400">
                          {isAr ? 'سحب:' : 'Take:'} {(sh.merchantWithdrawnCash ?? 0).toFixed(2)} {currencySymbol}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {diff === 0 ? (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                            {isAr ? '✅ مقاد 100%' : 'Balanced'}
                          </span>
                        ) : diff > 0 ? (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                            {isAr ? `فائض +${diff.toFixed(2)}` : `Over +${diff.toFixed(2)}`}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                            {isAr ? `عجز ${diff.toFixed(2)}` : `Short ${diff.toFixed(2)}`}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setCopiedReport(false);
                            setShowReportModal(sh);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200"
                        >
                          {isAr ? 'عرض / طباعة' : 'View'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pay In Modal */}
      {showPayInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form
            onSubmit={handlePayIn}
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                {t.pay_in}
              </h3>
              <button
                type="button"
                onClick={() => setShowPayInModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'المبلغ المودع' : 'Amount'} ({currencySymbol})
              </label>
              <input
                type="number"
                step="any"
                required
                value={txAmount}
                onChange={(e) => setTxAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-xl font-bold font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {t.reason}
              </label>
              <input
                type="text"
                value={txReason}
                onChange={(e) => setTxReason(e.target.value)}
                placeholder={isAr ? 'مثال: تغذية الصندوق، صرف فكة...' : 'Reason for pay in...'}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 rounded-2xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm"
            >
              {isAr ? 'تأكيد الإيداع بالدرج' : 'Confirm Pay In'}
            </button>
          </form>
        </div>
      )}

      {/* Pay Out Modal */}
      {showPayOutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form
            onSubmit={handlePayOut}
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                {t.pay_out}
              </h3>
              <button
                type="button"
                onClick={() => setShowPayOutModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'المبلغ المسحوب' : 'Amount'} ({currencySymbol})
              </label>
              <input
                type="number"
                step="any"
                required
                value={txAmount}
                onChange={(e) => setTxAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-xl font-bold font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {t.reason}
              </label>
              <input
                type="text"
                value={txReason}
                onChange={(e) => setTxReason(e.target.value)}
                placeholder={isAr ? 'مثال: شراء سلعة عاجلة، مصاريف...' : 'Reason for payout...'}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 rounded-2xl font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-sm"
            >
              {isAr ? 'تأكيد السحب من الدرج' : 'Confirm Pay Out'}
            </button>
          </form>
        </div>
      )}

      {/* Enhanced End-of-Day Close Shift Modal (تفاصيل المبيعات + طرق الدفع + المصاريف المسجلة + تصفير الصندوق لليوم التالي) */}
      {showCloseShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs">
          <form
            onSubmit={handleCloseShift}
            className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="font-black text-slate-900 dark:text-white text-base">
                  {isAr ? `إغلاق الصندوق في آخر النهار (الوردية #${currentShift.shiftNumber})` : t.close_shift_btn}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {currentShift.cashierName} · {shiftMetrics.activeOrdersCount} {isAr ? 'فاتورة مكتملة' : 'orders'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDailyReportModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{isAr ? 'تقرير الإغلاق النهاري' : 'Daily Closing Report'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCloseShiftModal(false)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                >
                  <X className="w-4 h-4" />
                  <span>{isAr ? 'إغلاق' : 'Close'}</span>
                </button>
              </div>
            </div>

            {/* 1. Sales Details & Payment Methods Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Sales & Net Profit Summary */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 space-y-2 text-xs">
                <div className="font-black text-slate-900 dark:text-white flex items-center justify-between">
                  <span>{isAr ? 'تفاصيل المبيعات والربح الصافي' : 'Sales & Net Profit Details'}</span>
                  <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                    {shiftMetrics.activeOrdersCount} {isAr ? 'فاتورة' : 'orders'}
                  </span>
                </div>
                <div className="divide-y divide-slate-200/70 dark:divide-slate-700/70">
                  <div className="py-1.5 flex justify-between text-slate-700 dark:text-slate-300">
                    <span>{isAr ? 'إجمالي المبيعات:' : 'Gross Sales:'}</span>
                    <span className="font-mono tabular-nums font-bold">{shiftMetrics.liveGrossSales.toFixed(2)} {currencySymbol}</span>
                  </div>
                  {shiftMetrics.liveRefunds > 0 && (
                    <div className="py-1.5 flex justify-between text-rose-600 dark:text-rose-400">
                      <span>{isAr ? `المرتجعات (${shiftMetrics.refundOrdersCount}):` : 'Refunds:'}</span>
                      <span className="font-mono tabular-nums font-bold">-{shiftMetrics.liveRefunds.toFixed(2)} {currencySymbol}</span>
                    </div>
                  )}
                  <div className="py-1.5 flex justify-between text-slate-600 dark:text-slate-400">
                    <span>{isAr ? 'صافي المبيعات (بدون ضريبة):' : 'Net Sales:'}</span>
                    <span className="font-mono tabular-nums font-bold">{shiftMetrics.netSales.toFixed(2)} {currencySymbol}</span>
                  </div>
                  <div className="py-1.5 flex justify-between text-slate-600 dark:text-slate-400">
                    <span>{isAr ? '− تكلفة السلعة المباعة:' : '− Cost of Goods:'}</span>
                    <span className="font-mono tabular-nums font-bold">-{shiftMetrics.liveCostOfGoods.toFixed(2)} {currencySymbol}</span>
                  </div>
                  <div className="py-1.5 flex justify-between text-rose-600 dark:text-rose-400">
                    <span>{isAr ? '− المصاريف المسجلة:' : '− Recorded Expenses:'}</span>
                    <span className="font-mono tabular-nums font-bold">-{shiftMetrics.liveExpenses.toFixed(2)} {currencySymbol}</span>
                  </div>
                  <div className="pt-2 flex justify-between text-sm font-black text-emerald-700 dark:text-emerald-400">
                    <span>{isAr ? 'الربح الصافي بعد المصاريف:' : 'Net Profit:'}</span>
                    <span className="font-mono tabular-nums">
                      {shiftMetrics.netProfit >= 0 ? '+' : ''}
                      {shiftMetrics.netProfit.toFixed(2)} {currencySymbol}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Methods Breakdown */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 space-y-2 text-xs">
                <div className="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>{isAr ? 'طرق الدفع المختلفة' : 'Payment Methods Breakdown'}</span>
                </div>
                <div className="divide-y divide-slate-200/70 dark:divide-slate-700/70">
                  <div className="py-1.5 flex justify-between items-center text-slate-700 dark:text-slate-300">
                    <span>{isAr ? `كاش / نقداً (${shiftMetrics.paymentCounts.cash})` : `Cash (${shiftMetrics.paymentCounts.cash})`}</span>
                    <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                      {shiftMetrics.liveCashSales.toFixed(2)} {currencySymbol}
                    </span>
                  </div>
                  <div className="py-1.5 flex justify-between items-center text-slate-700 dark:text-slate-300">
                    <span>{isAr ? `بطاقة بنكية / TPE (${shiftMetrics.paymentCounts.card})` : `Card (${shiftMetrics.paymentCounts.card})`}</span>
                    <span className="font-mono tabular-nums font-bold text-blue-600 dark:text-blue-400">
                      {shiftMetrics.liveCardSales.toFixed(2)} {currencySymbol}
                    </span>
                  </div>
                  <div className="py-1.5 flex justify-between items-center text-slate-700 dark:text-slate-300">
                    <span>{isAr ? `دفع إلكتروني (${shiftMetrics.paymentCounts.apple_pay})` : `Digital Pay (${shiftMetrics.paymentCounts.apple_pay})`}</span>
                    <span className="font-mono tabular-nums font-bold text-indigo-600 dark:text-indigo-400">
                      {shiftMetrics.liveApplePaySales.toFixed(2)} {currencySymbol}
                    </span>
                  </div>
                  <div className="py-1.5 flex justify-between items-center text-slate-700 dark:text-slate-300">
                    <span>{isAr ? `مبيعات الكريدي (${shiftMetrics.paymentCounts.credit})` : `Credit Sales (${shiftMetrics.paymentCounts.credit})`}</span>
                    <span className="font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400">
                      {shiftMetrics.liveCreditSales.toFixed(2)} {currencySymbol}
                    </span>
                  </div>
                  <div className="py-1.5 flex justify-between items-center text-slate-700 dark:text-slate-300">
                    <span>{isAr ? 'تحصيل وخلاص الكريدي:' : 'Credit Collections:'}</span>
                    <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                      +{shiftMetrics.liveCreditCollections.toFixed(2)} {currencySymbol}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Recorded Expenses List & Drawer Cash Math */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Recorded Expenses Detail List */}
              <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/50 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-amber-950 dark:text-amber-200">
                    {isAr
                      ? `المصاريف المسجلة (${shiftMetrics.shiftExpensesList.length})`
                      : `Recorded Expenses (${shiftMetrics.shiftExpensesList.length})`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCloseShiftModal(false);
                      setCurrentTab('expenses');
                    }}
                    className="text-[11px] font-bold text-amber-800 dark:text-amber-300 hover:underline whitespace-nowrap shrink-0"
                  >
                    {isAr ? 'إدارة المصاريف' : 'Manage'}
                  </button>
                </div>

                {shiftMetrics.shiftExpensesList.length === 0 ? (
                  <div className="py-4 text-center text-[11px] text-slate-500 dark:text-slate-400">
                    {isAr ? 'لا توجد مصاريف مسجلة في هذه الفترة' : 'No recorded expenses for this period'}
                  </div>
                ) : (
                  <div className="max-h-32 overflow-y-auto divide-y divide-amber-200/60 dark:divide-amber-900/40 pe-1">
                    {shiftMetrics.shiftExpensesList.map((exp) => (
                      <div key={exp.id} className="py-1.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800 dark:text-slate-100 truncate">
                            {exp.name}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            {getExpenseCategoryLabel(exp.category, language)} · {exp.date}
                          </div>
                        </div>
                        <span className="font-mono tabular-nums font-black text-rose-600 dark:text-rose-400 shrink-0">
                          -{Number(exp.amount || 0).toFixed(2)} {currencySymbol}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-2 border-t border-amber-200/80 dark:border-amber-900/50 flex justify-between font-black text-rose-700 dark:text-rose-400">
                  <span>{isAr ? 'إجمالي المصاريف:' : 'Total Expenses:'}</span>
                  <span className="font-mono tabular-nums">
                    -{shiftMetrics.liveExpenses.toFixed(2)} {currencySymbol}
                  </span>
                </div>
              </div>

              {/* Drawer Cash Expected Math */}
              <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900/60 space-y-1.5 text-xs">
                <div className="font-black text-emerald-950 dark:text-emerald-200 mb-1">
                  {isAr ? 'حساب الفلوس المتوقعة بالدرج' : 'Drawer Cash Calculation'}
                </div>
                <div className="flex justify-between text-slate-700 dark:text-slate-300">
                  <span>{isAr ? 'رصيد الصباح (الفوندو):' : t.opening_float}</span>
                  <span className="font-mono tabular-nums font-bold">{currentShift.startingCash.toFixed(2)} {currencySymbol}</span>
                </div>
                <div className="flex justify-between text-slate-700 dark:text-slate-300">
                  <span>{isAr ? '+ مبيعات الكاش:' : '+ Cash Sales:'}</span>
                  <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">+{shiftMetrics.liveCashSales.toFixed(2)} {currencySymbol}</span>
                </div>
                <div className="flex justify-between text-slate-700 dark:text-slate-300">
                  <span>{isAr ? '+ إيداعات الدرج:' : '+ Pay Ins:'}</span>
                  <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">+{shiftMetrics.totalPayIns.toFixed(2)} {currencySymbol}</span>
                </div>
                <div className="flex justify-between text-slate-700 dark:text-slate-300">
                  <span>{isAr ? '− سحوبات الدرج:' : '− Pay Outs:'}</span>
                  <span className="font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">-{shiftMetrics.totalPayOuts.toFixed(2)} {currencySymbol}</span>
                </div>
                {includeCreditCollections && (
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                    <span>{isAr ? '+ خلاص الكريدي اليوم:' : '+ Credit Collected:'}</span>
                    <span className="font-mono tabular-nums font-bold">+{shiftMetrics.liveCreditCollections.toFixed(2)} {currencySymbol}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black pt-2 border-t border-emerald-200 dark:border-emerald-800 text-slate-900 dark:text-white">
                  <span>{isAr ? 'المفروض يكون بالدرج:' : 'Expected in Drawer:'}</span>
                  <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    {shiftMetrics.expectedCashInDrawer.toFixed(2)} {currencySymbol}
                  </span>
                </div>
              </div>
            </div>

            {shiftMetrics.liveCreditCollections > 0 && (
              <label className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs cursor-pointer">
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  {isAr
                    ? `هل خلاص الكريدي اليومي (${shiftMetrics.liveCreditCollections.toFixed(2)} ${currencySymbol}) محطوط داخل نفس الصندوق؟`
                    : `Include credit collections (${shiftMetrics.liveCreditCollections.toFixed(2)}) in drawer cash?`}
                </span>
                <input
                  type="checkbox"
                  checked={includeCreditCollections}
                  onChange={(e) => setIncludeCreditCollections(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded"
                />
              </label>
            )}

            {/* Toggle between Direct Input & Moroccan Denomination Cash Counter */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                {isAr ? 'الفلوس الحقيقية اللي عدّيتي في الصندوق:' : 'Actual Cash Counted:'}
              </span>
              <button
                type="button"
                onClick={() => setUseDenominationCounter((prev) => !prev)}
                className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-[11px] font-black flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>
                  {useDenominationCounter
                    ? isAr
                      ? 'العودة لإدخال الإجمالي مباشرة'
                      : 'Switch to Direct Total'
                    : isAr
                    ? 'حاسبة عدّ الأوراق والقطع المغربية'
                    : 'Count Bills & Coins'}
                </span>
              </button>
            </div>

            {useDenominationCounter ? (
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  {MAD_DENOMINATIONS.map((d) => (
                    <div
                      key={d.key}
                      className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-1.5"
                    >
                      <span className="text-[11px] font-black text-slate-700 dark:text-slate-200">
                        {d.label}
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={denominations[d.key] || ''}
                        placeholder="0"
                        onChange={(e) =>
                          setDenominations((prev) => ({
                            ...prev,
                            [d.key]: Math.max(0, parseInt(e.target.value, 10) || 0)
                          }))
                        }
                        className="w-14 px-1.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center font-mono font-bold text-xs"
                      />
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs font-black">
                  <span>{isAr ? 'مجموع الفلوس المعدودة:' : 'Total Counted:'}</span>
                  <span className="font-mono text-lg text-slate-900 dark:text-white">
                    {denominationTotal.toFixed(2)} {currencySymbol}
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <input
                  type="number"
                  step="any"
                  required
                  value={countedCash}
                  onChange={(e) => setCountedCash(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-2.5 text-2xl font-black font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-center"
                />
              </div>
            )}

            {/* Clear "Balanced or Not" Indicator */}
            <div
              className={`p-3.5 rounded-2xl border flex items-center justify-center gap-2 text-xs font-black ${
                liveDiscrepancy === 0
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                  : liveDiscrepancy > 0
                  ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                  : 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300'
              }`}
            >
              {liveDiscrepancy === 0 ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isAr ? '✅ فلوس الصندوق مقادة 100% (لا عجز ولا فائض)' : 'Drawer Balanced 100%'}</span>
                </>
              ) : liveDiscrepancy > 0 ? (
                <span>
                  {isAr
                    ? `🔵 الصندوق زايد (فائض) بـ +${liveDiscrepancy.toFixed(2)} ${currencySymbol}`
                    : `Over by +${liveDiscrepancy.toFixed(2)} ${currencySymbol}`}
                </span>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4" />
                  <span>
                    {isAr
                      ? `⚠️ كاين عجز / نقص في الصندوق بـ ${liveDiscrepancy.toFixed(2)} ${currencySymbol}`
                      : `Short by ${liveDiscrepancy.toFixed(2)} ${currencySymbol}`}
                  </span>
                </>
              )}
            </div>

            {/* Merchant Drawer Settlement & Zero-Reset for Next Day (تصفير الصندوق لليوم التالي) */}
            <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/35 border border-indigo-200 dark:border-indigo-900/60 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-black text-indigo-900 dark:text-indigo-200">
                  <Wallet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>{isAr ? 'تصفية وتصفير الصندوق لليوم التالي' : 'Next-Day Drawer Reset & Settlement'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setRetainedFloat(0);
                      setReopenNextShift(true);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                      retainedFloat === 0
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:bg-rose-50'
                    }`}
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{isAr ? 'تصفير الصندوق (0 د.م)' : 'Reset Drawer (0)'}</span>
                  </button>
                  {[200, 500, 1000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRetainedFloat(preset)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-black border transition-colors ${
                        retainedFloat === preset
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-indigo-50'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    {isAr ? `الرصيد المتروك لليوم التالي (${currencySymbol})` : `Next-Day Opening Float (${currencySymbol})`}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={retainedFloat}
                    onChange={(e) => setRetainedFloat(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 font-mono tabular-nums font-black text-sm text-center"
                  />
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 text-center">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    {isAr ? 'الفلوس المسحوبة للتاجر (للدار/البنك)' : 'Merchant Withdrawn Cash'}
                  </div>
                  <div className="text-lg font-black font-mono tabular-nums text-indigo-700 dark:text-indigo-300 mt-0.5">
                    {merchantTakeHomeCash.toFixed(2)} {currencySymbol}
                  </div>
                </div>
              </div>

              <div className="text-[11px] font-bold text-indigo-800 dark:text-indigo-300">
                {retainedFloat === 0
                  ? isAr
                    ? '✓ سيتم تصفير الصندوق بالكامل (0.00) لليوم التالي وسحب كل المبلغ المعدود.'
                    : '✓ Drawer will be reset to 0.00 for the next day.'
                  : isAr
                  ? `سيبدأ اليوم التالي بفوندو قدره ${retainedFloat.toFixed(2)} ${currencySymbol}.`
                  : `Next day starts with a ${retainedFloat.toFixed(2)} ${currencySymbol} float.`}
              </div>

              <label className="flex items-center justify-between gap-2 pt-1 text-xs cursor-pointer">
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  {isAr
                    ? 'تجهيز وفتح صندوق اليوم التالي تلقائياً مباشرة بعد الإغلاق'
                    : 'Auto-open next day shift immediately after closing'}
                </span>
                <input
                  type="checkbox"
                  checked={reopenNextShift}
                  onChange={(e) => setReopenNextShift(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
              </label>
            </div>

            <div>
              <input
                type="text"
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                placeholder={isAr ? 'ملاحظات إغلاق الصندوق (اختياري)...' : 'Closing notes (optional)...'}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setShowDailyReportModal(true)}
                className="py-3.5 px-3 rounded-2xl font-bold text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <FileText className="w-4 h-4" />
                <span>{isAr ? 'تقرير الإغلاق النهاري' : 'Daily Report'}</span>
              </button>
              <button
                type="submit"
                className="sm:col-span-2 py-3.5 px-4 rounded-2xl font-black text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 transition-colors shadow-sm"
              >
                {isAr ? 'تأكيد إغلاق الصندوق وإصدار التقرير' : 'Close Drawer & Generate Report'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Open Shift Modal */}
      {showOpenShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form
            onSubmit={handleOpenShift}
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                {t.open_shift_btn}
              </h3>
              <button
                type="button"
                onClick={() => setShowOpenShiftModal(false)}
                className="text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {t.cashier}
              </label>
              <input
                type="text"
                required
                value={openCashier}
                onChange={(e) => setOpenCashier(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'رصيد الصباح (فوندو الصندوق)' : t.opening_float} ({currencySymbol})
              </label>
              <input
                type="number"
                step="any"
                required
                value={openFloat}
                onChange={(e) => setOpenFloat(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-xl font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 rounded-2xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm"
            >
              {isAr ? 'فتح الصندوق وبدء يوم جديد' : 'Start Shift'}
            </button>
          </form>
        </div>
      )}

      {/* Detailed End-of-Day Z-Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-black text-slate-900 dark:text-white">
                {isAr ? `تقرير إغلاق آخر النهار #${showReportModal.shiftNumber}` : `${t.z_report} #${showReportModal.shiftNumber}`}
              </h3>
              <button
                type="button"
                onClick={() => setShowReportModal(null)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
              >
                <X className="w-4 h-4" />
                <span>{isAr ? 'إغلاق' : 'Close'}</span>
              </button>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl font-mono text-xs space-y-1.5">
              <div className="flex justify-between">
                <span>{isAr ? 'إجمالي المبيعات:' : 'Gross Sales:'}</span>
                <span className="font-bold">{(showReportModal.grossSales ?? 0).toFixed(2)} {currencySymbol}</span>
              </div>
              <div className="flex justify-between">
                <span>{isAr ? 'تكلفة السلعة المباعة:' : 'Cost of Goods:'}</span>
                <span>-{(showReportModal.totalCostOfGoods ?? 0).toFixed(2)} {currencySymbol}</span>
              </div>
              <div className="flex justify-between">
                <span>{isAr ? 'مصاريف النهار:' : 'Expenses:'}</span>
                <span className="text-rose-600">-{(showReportModal.totalExpenses ?? 0).toFixed(2)} {currencySymbol}</span>
              </div>
              <div className="flex justify-between font-black text-sm text-emerald-600 dark:text-emerald-400 pt-1.5 border-t border-slate-200 dark:border-slate-700">
                <span>{isAr ? 'الربح الصافي:' : 'Net Profit:'}</span>
                <span>
                  {(showReportModal.netProfit ?? 0) >= 0 ? '+' : ''}
                  {(showReportModal.netProfit ?? 0).toFixed(2)} {currencySymbol}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1">
                <div className="flex justify-between">
                  <span>{isAr ? 'مبيعات الكاش:' : 'Cash:'}</span>
                  <span>{(showReportModal.totalCashSales ?? 0).toFixed(2)} {currencySymbol}</span>
                </div>
                <div className="flex justify-between">
                  <span>{isAr ? 'مبيعات البطاقة:' : 'Card:'}</span>
                  <span>{(showReportModal.totalCardSales ?? 0).toFixed(2)} {currencySymbol}</span>
                </div>
                <div className="flex justify-between">
                  <span>{isAr ? 'الدفع الإلكتروني:' : 'Digital Pay:'}</span>
                  <span>{(showReportModal.totalApplePaySales ?? 0).toFixed(2)} {currencySymbol}</span>
                </div>
                <div className="flex justify-between">
                  <span>{isAr ? 'مبيعات الكريدي:' : 'Credit Sales:'}</span>
                  <span>{(showReportModal.totalCreditSales ?? 0).toFixed(2)} {currencySymbol}</span>
                </div>
                <div className="flex justify-between">
                  <span>{isAr ? 'خلاص الكريدي:' : 'Credit Collected:'}</span>
                  <span>{(showReportModal.creditCollectionsCash ?? 0).toFixed(2)} {currencySymbol}</span>
                </div>
                <div className="flex justify-between">
                  <span>{isAr ? 'المفروض في الصندوق:' : 'Expected Cash:'}</span>
                  <span>{(showReportModal.expectedCash ?? 0).toFixed(2)} {currencySymbol}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>{isAr ? 'الفلوس المعدودة فعلياً:' : 'Counted Cash:'}</span>
                  <span>{(showReportModal.actualCashCounted ?? 0).toFixed(2)} {currencySymbol}</span>
                </div>
              </div>

              <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700 font-black">
                <span>{isAr ? 'الفرق (واش مقاد):' : 'Discrepancy:'}</span>
                <span
                  className={
                    (showReportModal.discrepancy ?? 0) === 0
                      ? 'text-emerald-600'
                      : (showReportModal.discrepancy ?? 0) > 0
                      ? 'text-blue-600'
                      : 'text-rose-600'
                  }
                >
                  {(showReportModal.discrepancy ?? 0) === 0
                    ? isAr
                      ? 'مقاد 100% ✅'
                      : 'Balanced ✅'
                    : `${(showReportModal.discrepancy ?? 0) > 0 ? '+' : ''}${(showReportModal.discrepancy ?? 0).toFixed(2)} ${currencySymbol}`}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1">
                <div className="flex justify-between">
                  <span>{isAr ? 'فوندو الغد المتروك بالدرج:' : 'Retained Float:'}</span>
                  <span className="font-bold">{(showReportModal.retainedFloatForNextDay ?? 0).toFixed(2)} {currencySymbol}</span>
                </div>
                <div className="flex justify-between font-black text-indigo-600 dark:text-indigo-400">
                  <span>{isAr ? 'الفلوس المسحوبة للتاجر:' : 'Merchant Withdrawn:'}</span>
                  <span>{(showReportModal.merchantWithdrawnCash ?? 0).toFixed(2)} {currencySymbol}</span>
                </div>
              </div>
              {showReportModal.closingNotes && (
                <div className="pt-1.5 text-[11px] text-slate-500">
                  {isAr ? 'ملاحظات:' : 'Notes:'} {showReportModal.closingNotes}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleCopyZReport(showReportModal)}
                className="py-2.5 px-3 rounded-xl font-bold text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 flex items-center justify-center gap-1.5 transition-colors"
              >
                {copiedReport ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-600">{isAr ? 'تم النسخ ✓' : 'Copied ✓'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>{isAr ? 'نسخ الملخص (واتساب)' : 'Copy Summary'}</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadZReport(showReportModal)}
                className="py-2.5 px-3 rounded-xl font-bold text-xs bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>{isAr ? 'تحميل ملف التقرير' : 'Download TXT'}</span>
              </button>
            </div>
            <button
              onClick={() => {
                window.print();
                setShowReportModal(null);
              }}
              className="w-full py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span>{isAr ? 'طباعة تقرير آخر النهار' : 'Print Z-Report'}</span>
            </button>
          </div>
        </div>
      )}

      <DailySalesReportModal
        isOpen={showDailyReportModal}
        onClose={() => setShowDailyReportModal(false)}
      />

      <PinGateModal
        isOpen={showStocktakePinModal}
        onClose={() => setShowStocktakePinModal(false)}
        onSuccess={openStocktakeDirect}
        title={isAr ? 'جرد المخزون محمي برقم سري' : 'Stocktake Protected'}
        description={
          isAr
            ? 'المرجو إدخال الرقم السري الخاص بالمدير للانتقال إلى شاشة جرد المخزون الحقيقي.'
            : 'Enter Manager PIN to open Physical Stocktake.'
        }
      />
    </div>
  );
};
