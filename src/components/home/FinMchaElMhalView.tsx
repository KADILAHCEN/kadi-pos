import React, { useMemo, useState } from 'react';
import { AppTabId, usePos } from '../../context/PosContext';
import { computeExpenseMetrics, getLocalTodayYMD } from '../../utils/expenses';
import { buildBourseSnapshot, DEFAULT_DAILY_FIXED_EXPENSES } from '../../utils/bourseEngine';
import {
  exportFinMchaElMhalPdf,
  FinMchaElMhalPdfBillLine
} from '../../utils/exportReports';
import { playSound } from '../../utils/audio';
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  MessageCircle,
  Wallet,
  CreditCard,
  TrendingUp,
  Package,
  Landmark,
  Receipt,
  Calendar,
  Coins,
  CheckCircle2
} from 'lucide-react';

interface FinMchaElMhalViewProps {
  onNavigate?: (tab: AppTabId) => void;
}

const toLocalYMD = (isoOrDate?: string): string => {
  if (!isoOrDate) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) return isoOrDate;
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const fmtMoney = (n: number): string =>
  Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

export const FinMchaElMhalView: React.FC<FinMchaElMhalViewProps> = ({ onNavigate }) => {
  const {
    orders,
    expenses,
    products,
    customers,
    currentShift,
    cpuRecords,
    cpuSettings,
    supplierInvoices,
    zakatSummary,
    settings,
    currencySymbol,
    language,
    setCurrentTab
  } = usePos();

  const [actionToast, setActionToast] = useState<string | null>(null);

  const go = (tab: AppTabId) => {
    if (onNavigate) {
      onNavigate(tab);
    } else {
      setCurrentTab(tab);
    }
  };

  const todayYMD = getLocalTodayYMD();
  const monthPrefix = todayYMD.slice(0, 7);

  // 1 & 6. Today's Sales, Expenses, Sales - Expenses, and True Product Profit
  const todayStats = useMemo(() => {
    const completedToday = orders.filter(
      (o) => o.status === 'completed' && toLocalYMD(o.date) === todayYMD
    );
    const sales = completedToday.reduce((sum, o) => sum + (Number(o.grandTotal) || 0), 0);
    const taxes = completedToday.reduce((sum, o) => sum + (Number(o.taxTotal) || 0), 0);
    const costOfGoods = completedToday.reduce((sum, o) => {
      if (Number.isFinite(o.costTotal) && o.costTotal > 0) return sum + o.costTotal;
      const itemsCost = (o.items || []).reduce(
        (s, it) => s + (Number(it.costPrice) || 0) * (Number(it.quantity) || 0),
        0
      );
      return sum + itemsCost;
    }, 0);

    const grossProfit = sales - taxes - costOfGoods;
    const expMetrics = computeExpenseMetrics(expenses);
    const todayExpenses = expMetrics.todayTotal;
    const netSalesMinusExpenses = sales - todayExpenses;
    const trueProfit = grossProfit - todayExpenses;

    return {
      ordersCount: completedToday.length,
      sales: Number(sales.toFixed(2)),
      expenses: Number(todayExpenses.toFixed(2)),
      netSalesMinusExpenses: Number(netSalesMinusExpenses.toFixed(2)),
      trueProfit: Number(trueProfit.toFixed(2)),
      monthExpensesTotal: expMetrics.monthTotal,
      monthExpensesCount: expMetrics.monthCount
    };
  }, [orders, expenses, todayYMD]);

  // 2. الصندوق — Live Cash in Box (mirrors ShiftsView formula)
  const cashBoxSummary = useMemo(() => {
    const shiftStartTime = new Date(currentShift.openedAt).getTime();
    let shiftCashSales = 0;

    orders.forEach((o) => {
      if (o.status !== 'completed' || o.isEmergencyOvertime) return;
      if (new Date(o.date).getTime() < shiftStartTime) return;
      if (o.paymentMethod === 'cash') {
        shiftCashSales += Number(o.grandTotal) || 0;
      } else if (o.paymentMethod === 'split' && o.splitDetails) {
        shiftCashSales += Number(o.splitDetails.cash) || 0;
      }
    });

    let payIns = 0;
    let payOuts = 0;
    (currentShift.cashTransactions || []).forEach((tx) => {
      if (tx.type === 'pay_in') payIns += Number(tx.amount) || 0;
      if (tx.type === 'pay_out') payOuts += Number(tx.amount) || 0;
    });

    const cashNow = (Number(currentShift.startingCash) || 0) + shiftCashSales + payIns - payOuts;
    return {
      cashNow: Number(cashNow.toFixed(2)),
      startingCash: Number(currentShift.startingCash) || 0,
      shiftCashSales: Number(shiftCashSales.toFixed(2))
    };
  }, [currentShift, orders]);

  // 3. الكريدي — Credit owed by customers
  const creditSummary = useMemo(() => {
    let totalCreditOwed = 0;
    let debtorsCount = 0;
    customers.forEach((c) => {
      const bal = Number(c.balance) || 0;
      if (bal > 0) {
        totalCreditOwed += bal;
        debtorsCount += 1;
      }
    });
    return {
      totalCreditOwed: Number(totalCreditOwed.toFixed(2)),
      debtorsCount
    };
  }, [customers]);

  // 4. البورصة — Top 5 products prices today
  const bourseTop5 = useMemo(() => {
    const snapshot = buildBourseSnapshot({
      products,
      orders,
      expenses,
      cpuRecords,
      zakatSummary,
      settings
    });

    const sorted = [...snapshot.stocks].sort((a, b) => {
      if (b.todaySales !== a.todaySales) return b.todaySales - a.todaySales;
      if (b.weekSales !== a.weekSales) return b.weekSales - a.weekSales;
      return b.salePrice - a.salePrice;
    });

    return sorted.slice(0, 5).map((s) => ({
      id: s.id,
      name: s.name,
      price: s.salePrice,
      changePct: s.changePct,
      trend: s.trend
    }));
  }, [products, orders, expenses, cpuRecords, zakatSummary, settings]);

  // 5. المخزون — Top 5 best sellers + Low stock count
  const inventorySummary = useMemo(() => {
    const qtyByProduct = new Map<string, number>();
    orders.forEach((o) => {
      if (o.status !== 'completed') return;
      (o.items || []).forEach((it) => {
        qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) || 0) + (Number(it.quantity) || 0));
      });
    });

    const sortedBestSellers = [...products]
      .map((p) => ({
        id: p.id,
        name: p.name,
        soldQty: Number((qtyByProduct.get(p.id) || 0).toFixed(1)),
        stock: Number((p.stock || 0).toFixed(1))
      }))
      .sort((a, b) => {
        if (b.soldQty !== a.soldQty) return b.soldQty - a.soldQty;
        return b.stock - a.stock;
      })
      .slice(0, 5);

    const lowStockCount = products.filter(
      (p) => (Number(p.stock) || 0) <= (Number(p.lowStockThreshold) || 0)
    ).length;

    return {
      top5BestSellers: sortedBestSellers,
      lowStockCount
    };
  }, [orders, products]);

  // 7. الضريبة — Tax to pay this month & Tax already paid
  const taxSummary = useMemo(() => {
    const paidTotal = cpuRecords
      .filter((r) => r.status === 'paid')
      .reduce((sum, r) => sum + (Number(r.totalDue) || 0), 0);

    const unpaidRecords = cpuRecords.filter((r) => r.status === 'unpaid');
    const unpaidQuarterlyTotal = unpaidRecords.reduce(
      (sum, r) => sum + (Number(r.totalDue) || 0),
      0
    );

    const monthlyPatente = Math.max(0, Number(cpuSettings?.annualPatenteTax) || 0) / 12;

    let toPayThisMonth = 0;
    let nextDueDate = '';

    if (unpaidRecords.length > 0) {
      const nearest = [...unpaidRecords].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
      nextDueDate = nearest.dueDate;
      toPayThisMonth = unpaidQuarterlyTotal / (3 * unpaidRecords.length) + monthlyPatente;
    } else {
      const monthTurnover = orders
        .filter((o) => o.status === 'completed' && toLocalYMD(o.date).startsWith(monthPrefix))
        .reduce((sum, o) => sum + (Number(o.grandTotal) || 0), 0);
      const coeff = (Number(cpuSettings?.professionCoeffPct) || 6) / 100;
      const taxRate = (Number(cpuSettings?.taxRatePct) || 10) / 100;
      toPayThisMonth = monthTurnover * coeff * taxRate + monthlyPatente;
    }

    return {
      toPayThisMonth: Number(toPayThisMonth.toFixed(2)),
      alreadyPaid: Number(paidTotal.toFixed(2)),
      nextDueDate
    };
  }, [cpuRecords, cpuSettings, orders, monthPrefix]);

  // 8. الاشتراكات والفواتير — Rent, Electricity, Water, Internet, Phone + Due dates
  const monthlyBillsSummary = useMemo(() => {
    const fixed = {
      ...DEFAULT_DAILY_FIXED_EXPENSES,
      ...(settings.dailyFixedExpenses || {})
    };

    const thisMonthExpenses = expenses.filter(
      (e) => e.date && e.date.slice(0, 7) === monthPrefix
    );

    const findLoggedAmount = (keywords: string[], fallbackCategory?: string): number => {
      const matches = thisMonthExpenses.filter((e) => {
        const lower = (e.name || '').toLowerCase();
        if (keywords.some((k) => lower.includes(k))) return true;
        if (fallbackCategory && e.category === fallbackCategory && keywords.length === 0) return true;
        return false;
      });
      return matches.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    };

    const rentLogged =
      findLoggedAmount(['كراء', 'الكراء', 'loyer', 'rent']) ||
      thisMonthExpenses
        .filter((e) => e.category === 'rent')
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const elecLogged = findLoggedAmount(['ضو', 'الضو', 'كهرباء', 'electric', 'onee', 'lydec', 'redal', 'amend']);
    const waterLogged = findLoggedAmount(['ماء', 'الماء', 'eau', 'water']);
    const internetLogged = findLoggedAmount(['انترنت', 'إنترنت', 'wifi', 'fiber', 'internet', 'adsl']);
    const phoneLogged = findLoggedAmount(['تليفون', 'هاتف', 'التليفون', 'phone', 'iam', 'inwi', 'orange', 'اتصالات']);

    const rentEst = Math.max(0, Number(fixed.rentPerDay) || 50) * 30;
    const utilitiesDaily = Math.max(0, Number(fixed.electricityPerDay) || 15);
    const elecEst = Math.round(utilitiesDaily * 0.68 * 30);
    const waterEst = Math.round(utilitiesDaily * 0.32 * 30);
    const netDaily = Math.max(0, Number(fixed.internetPerDay) || 5);
    const internetEst = Math.round(netDaily * 0.65 * 30);
    const phoneEst = Math.max(30, Math.round(netDaily * 0.35 * 30));

    const rows: FinMchaElMhalPdfBillLine[] = [
      {
        name: 'الكراء',
        amount: Number((rentLogged > 0 ? rentLogged : rentEst).toFixed(2)),
        dueDate: `${monthPrefix}-01`,
        paid: rentLogged > 0
      },
      {
        name: 'الضو',
        amount: Number((elecLogged > 0 ? elecLogged : elecEst).toFixed(2)),
        dueDate: `${monthPrefix}-15`,
        paid: elecLogged > 0
      },
      {
        name: 'الماء',
        amount: Number((waterLogged > 0 ? waterLogged : waterEst).toFixed(2)),
        dueDate: `${monthPrefix}-18`,
        paid: waterLogged > 0
      },
      {
        name: 'الإنترنت',
        amount: Number((internetLogged > 0 ? internetLogged : internetEst).toFixed(2)),
        dueDate: `${monthPrefix}-20`,
        paid: internetLogged > 0
      },
      {
        name: 'التليفون',
        amount: Number((phoneLogged > 0 ? phoneLogged : phoneEst).toFixed(2)),
        dueDate: `${monthPrefix}-25`,
        paid: phoneLogged > 0
      }
    ];

    const unpaidSuppliersCount = supplierInvoices.filter((inv) => inv.status !== 'paid').length;
    const totalBillsToPay = rows
      .filter((r) => !r.paid)
      .reduce((s, r) => s + r.amount, 0);
    const totalBillsAll = rows.reduce((s, r) => s + r.amount, 0);

    return {
      rows,
      totalBillsToPay: Number(totalBillsToPay.toFixed(2)),
      totalBillsAll: Number(totalBillsAll.toFixed(2)),
      unpaidSuppliersCount
    };
  }, [settings.dailyFixedExpenses, expenses, supplierInvoices, monthPrefix]);

  // Build PDF Action
  const handlePrintPdf = () => {
    try {
      const filename = exportFinMchaElMhalPdf({
        settings,
        currencySymbol,
        language,
        todaySales: todayStats.sales,
        todayExpenses: todayStats.expenses,
        todayNetSalesMinusExpenses: todayStats.netSalesMinusExpenses,
        todayTrueProfit: todayStats.trueProfit,
        cashInBoxNow: cashBoxSummary.cashNow,
        totalCreditOwed: creditSummary.totalCreditOwed,
        creditCustomersCount: creditSummary.debtorsCount,
        top5BoursePrices: bourseTop5.map((b) => ({
          name: b.name,
          price: b.price,
          changePct: b.changePct
        })),
        top5BestSellers: inventorySummary.top5BestSellers.map((p) => ({
          name: p.name,
          soldQty: p.soldQty,
          stock: p.stock
        })),
        lowStockCount: inventorySummary.lowStockCount,
        taxToPayThisMonth: taxSummary.toPayThisMonth,
        taxAlreadyPaid: taxSummary.alreadyPaid,
        monthlyBillsTotal: monthlyBillsSummary.totalBillsToPay,
        monthlyBills: monthlyBillsSummary.rows,
        monthExpensesTotal: todayStats.monthExpensesTotal
      });
      if (settings.enableSoundEffects) playSound('success');
      setActionToast(`تم تحميل التقرير PDF بنجاح (${filename})`);
    } catch {
      if (settings.enableSoundEffects) playSound('error');
      setActionToast('تعذر إنشاء ملف PDF');
    }
    window.setTimeout(() => setActionToast(null), 4000);
  };

  // Build WhatsApp Share URL (works cleanly via <a href> with clipboard fallback)
  const whatsappText = useMemo(() => {
    const store = settings.storeName || 'الحانوت';
    const bourseLines = bourseTop5
      .map((b, i) => `  ${i + 1}. ${b.name}: ${b.price.toFixed(2)} ${currencySymbol}`)
      .join('\n');
    const stockLines = inventorySummary.top5BestSellers
      .map((p, i) => `  ${i + 1}. ${p.name}: بيع ${p.soldQty} (باقي ${p.stock})`)
      .join('\n');
    const billsLines = monthlyBillsSummary.rows
      .map(
        (b) =>
          `  - ${b.name}: ${b.amount.toFixed(0)} ${currencySymbol} (${b.dueDate}) [${
            b.paid ? 'مخلص' : 'للدفع'
          }]`
      )
      .join('\n');

    return [
      `📊 *فين مشى المحال — ${store}* (${todayYMD})`,
      ``,
      `1️⃣ *اليوم:*`,
      `• المبيعات: ${todayStats.sales.toFixed(2)} ${currencySymbol}`,
      `• المصاريف: ${todayStats.expenses.toFixed(2)} ${currencySymbol}`,
      `• الصافي (المبيعات - المصاريف): ${todayStats.netSalesMinusExpenses.toFixed(2)} ${currencySymbol}`,
      ``,
      `2️⃣ *الصندوق دابا:* ${cashBoxSummary.cashNow.toFixed(2)} ${currencySymbol}`,
      `3️⃣ *الكريدي عند الكليان:* ${creditSummary.totalCreditOwed.toFixed(2)} ${currencySymbol} (${creditSummary.debtorsCount} كليان)`,
      `6️⃣ *ربح اليوم:* ${todayStats.trueProfit.toFixed(2)} ${currencySymbol}`,
      `7️⃣ *الضريبة:* للدفع هاد الشهر ${taxSummary.toPayThisMonth.toFixed(2)} ${currencySymbol} | تخلصات ${taxSummary.alreadyPaid.toFixed(2)} ${currencySymbol}`,
      `9️⃣ *مصاريف الشهر:* ${todayStats.monthExpensesTotal.toFixed(2)} ${currencySymbol}`,
      ``,
      `4️⃣ *البورصة (أهم 5 أثمنة اليوم):*\n${bourseLines || '  لا توجد سلع'}`,
      ``,
      `5️⃣ *المخزون (الأكثر مبيعاً · السلع الناقصة: ${inventorySummary.lowStockCount}):*\n${stockLines || '  لا توجد مبيعات'}`,
      ``,
      `8️⃣ *الاشتراكات والفواتير هاد الشهر (للدفع: ${monthlyBillsSummary.totalBillsToPay.toFixed(0)} ${currencySymbol}):*\n${billsLines}`
    ].join('\n');
  }, [
    settings.storeName,
    todayYMD,
    todayStats,
    cashBoxSummary,
    creditSummary,
    taxSummary,
    bourseTop5,
    inventorySummary,
    monthlyBillsSummary,
    currencySymbol
  ]);

  const whatsappHref = useMemo(() => {
    const rawPhone = (settings.whatsappBusinessPhone || '').replace(/\D+/g, '');
    const phone = rawPhone.startsWith('0') ? `212${rawPhone.slice(1)}` : rawPhone;
    const encoded = encodeURIComponent(whatsappText);
    return phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  }, [settings.whatsappBusinessPhone, whatsappText]);

  const handleWhatsAppCopyToast = () => {
    try {
      void navigator.clipboard?.writeText(whatsappText);
    } catch {
      // Clipboard optional offline
    }
    setActionToast('تم نسخ ملخص التقرير وفتح واتساب ✓');
    window.setTimeout(() => setActionToast(null), 3500);
  };

  return (
    <div
      dir="rtl"
      className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 pb-24 lg:pb-8"
    >
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Top Bar: Title & 2 Primary Actions */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              فين مشى المحال
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              ملخص أرقام المحال في صفحة وحدة · {settings.storeName || 'Kadi POS'} · {todayYMD}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrintPdf}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-950 text-xs sm:text-sm font-black flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>طبع التقرير PDF</span>
            </button>

            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleWhatsAppCopyToast}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-black flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span>صيفط في واتساب</span>
            </a>
          </div>
        </header>

        {actionToast && (
          <div className="px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{actionToast}</span>
          </div>
        )}

        {/* SECTION GRID 1: Focal Hero Summary Row (اليوم + الصندوق + الكريدي) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* 1. اليوم (Today: Sales, Expenses, Net = Sales - Expenses) */}
          <button
            type="button"
            onClick={() => go('pos')}
            className="lg:col-span-6 text-start rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 p-5 transition-colors flex flex-col justify-between gap-4"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <div>
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  1. اليوم ({todayStats.ordersCount} فواتير)
                </div>
                <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                  الصافي اليومي (المبيعات − المصاريف)
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 whitespace-nowrap">
                <span>نقطة البيع</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </span>
            </div>

            <div
              className={`text-3xl sm:text-4xl font-mono tabular-nums font-black tracking-tight ${
                todayStats.netSalesMinusExpenses >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {fmtMoney(todayStats.netSalesMinusExpenses)}{' '}
              <span className="text-lg font-bold">{currencySymbol}</span>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800 w-full">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">مجموع مبيعات اليوم</div>
                <div className="text-lg sm:text-xl font-mono tabular-nums font-black text-slate-900 dark:text-white mt-0.5">
                  {fmtMoney(todayStats.sales)} {currencySymbol}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">مجموع مصاريف اليوم</div>
                <div className="text-lg sm:text-xl font-mono tabular-nums font-black text-rose-600 dark:text-rose-400 mt-0.5">
                  {fmtMoney(todayStats.expenses)} {currencySymbol}
                </div>
              </div>
            </div>
          </button>

          {/* 2. الصندوق (Cash in box now -> Go to الصندوق / shifts) */}
          <button
            type="button"
            onClick={() => go('shifts')}
            className="lg:col-span-3 text-start rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500 p-5 transition-colors flex flex-col justify-between gap-4"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-sm font-black text-slate-900 dark:text-white">2. الصندوق</span>
              </div>
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 whitespace-nowrap">
                <span>الصندوق</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </span>
            </div>

            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">الكاش اللي كاين في الصندوق دابا</div>
              <div className="text-2xl sm:text-3xl font-mono tabular-nums font-black text-slate-900 dark:text-white mt-1">
                {fmtMoney(cashBoxSummary.cashNow)}{' '}
                <span className="text-base font-bold">{currencySymbol}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 w-full flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              <span>البداية: {fmtMoney(cashBoxSummary.startingCash)}</span>
              <span>كاش: +{fmtMoney(cashBoxSummary.shiftCashSales)}</span>
            </div>
          </button>

          {/* 3. الكريدي (Total credit customers owe -> Go to الكريدي / customers) */}
          <button
            type="button"
            onClick={() => go('customers')}
            className="lg:col-span-3 text-start rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500 p-5 transition-colors flex flex-col justify-between gap-4"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-sm font-black text-slate-900 dark:text-white">3. الكريدي</span>
              </div>
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 whitespace-nowrap">
                <span>الكريدي</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </span>
            </div>

            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">مجموع الفلوس اللي كتسال عند الكليان</div>
              <div className="text-2xl sm:text-3xl font-mono tabular-nums font-black text-amber-600 dark:text-amber-400 mt-1">
                {fmtMoney(creditSummary.totalCreditOwed)}{' '}
                <span className="text-base font-bold">{currencySymbol}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 w-full text-xs text-slate-500 dark:text-slate-400">
              عدد الكليان اللي عليهم الكريدي:{' '}
              <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                {creditSummary.debtorsCount}
              </span>
            </div>
          </button>
        </div>

        {/* SECTION GRID 2: الأرباح + الضريبة + المصاريف */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 6. الأرباح (Today profit -> Go to الأرباح / analytics) */}
          <button
            type="button"
            onClick={() => go('analytics')}
            className="text-start rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 p-5 transition-colors flex flex-col justify-between gap-3"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-sm font-black text-slate-900 dark:text-white">6. الأرباح</span>
              </div>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 whitespace-nowrap">
                <span>الأرباح</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </span>
            </div>

            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">ربح اليوم الصافي (بعد التكلفة والمصاريف)</div>
              <div
                className={`text-2xl sm:text-3xl font-mono tabular-nums font-black mt-1 ${
                  todayStats.trueProfit >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {fmtMoney(todayStats.trueProfit)}{' '}
                <span className="text-base font-bold">{currencySymbol}</span>
              </div>
            </div>

            <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 w-full text-xs text-slate-500 dark:text-slate-400">
              كليكي باش تشوف تفاصيل الأرباح والأهداف
            </div>
          </button>

          {/* 7. الضريبة (Tax to pay this month & Tax already paid -> Go to الضرائب / cpu_tax) */}
          <button
            type="button"
            onClick={() => go('cpu_tax')}
            className="text-start rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-orange-500 p-5 transition-colors flex flex-col justify-between gap-3"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-orange-600 shrink-0" />
                <span className="text-sm font-black text-slate-900 dark:text-white">7. الضريبة</span>
              </div>
              <span className="text-xs font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1 whitespace-nowrap">
                <span>الضرائب</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </span>
            </div>

            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">الضريبة اللي خاص تخلص هاد الشهر</div>
              <div className="text-2xl sm:text-3xl font-mono tabular-nums font-black text-orange-600 dark:text-orange-400 mt-1">
                {fmtMoney(taxSummary.toPayThisMonth)}{' '}
                <span className="text-base font-bold">{currencySymbol}</span>
              </div>
            </div>

            <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 w-full flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">الضريبة المخلصة لحد الآن:</span>
              <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                {fmtMoney(taxSummary.alreadyPaid)} {currencySymbol}
              </span>
            </div>
          </button>

          {/* 9. المصاريف (Total expenses this month -> Go to المصاريف / expenses) */}
          <button
            type="button"
            onClick={() => go('expenses')}
            className="text-start rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-rose-500 p-5 transition-colors flex flex-col justify-between gap-3"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="text-sm font-black text-slate-900 dark:text-white">9. المصاريف</span>
              </div>
              <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1 whitespace-nowrap">
                <span>المصاريف</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </span>
            </div>

            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">مجموع المصاريف هاد الشهر</div>
              <div className="text-2xl sm:text-3xl font-mono tabular-nums font-black text-rose-600 dark:text-rose-400 mt-1">
                {fmtMoney(todayStats.monthExpensesTotal)}{' '}
                <span className="text-base font-bold">{currencySymbol}</span>
              </div>
            </div>

            <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 w-full text-xs text-slate-500 dark:text-slate-400">
              عدد المصاريف المسجلة هاد الشهر:{' '}
              <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                {todayStats.monthExpensesCount}
              </span>
            </div>
          </button>
        </div>

        {/* SECTION GRID 3: البورصة + المخزون + الاشتراكات والفواتير */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* 4. البورصة (Top 5 products prices today -> Go to البورصة / bourse) */}
          <button
            type="button"
            onClick={() => go('bourse')}
            className="lg:col-span-4 text-start rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 p-5 transition-colors flex flex-col justify-between gap-3"
          >
            <div className="flex items-center justify-between gap-2 w-full pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="text-sm font-black text-slate-900 dark:text-white">4. البورصة</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">أثمنة أهم 5 سلع اليوم</div>
              </div>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 whitespace-nowrap">
                <span>البورصة</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 w-full flex-1">
              {bourseTop5.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">لا توجد سلع بعد</div>
              ) : (
                bourseTop5.map((item, idx) => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-900 dark:text-white truncate">
                      {idx + 1}. {item.name}
                    </span>
                    <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                      <span
                        className={`flex items-center text-[11px] font-bold ${
                          item.changePct >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {item.changePct >= 0 ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {Math.abs(item.changePct).toFixed(0)}%
                      </span>
                      <span className="font-black text-sm text-slate-900 dark:text-white">
                        {item.price.toFixed(2)} {currencySymbol}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </button>

          {/* 5. المخزون (Top 5 best sellers + Low stock -> Go to المخزون / inventory) */}
          <button
            type="button"
            onClick={() => go('inventory')}
            className="lg:col-span-4 text-start rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 p-5 transition-colors flex flex-col justify-between gap-3"
          >
            <div className="flex items-center justify-between gap-2 w-full pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <div className="text-sm font-black text-slate-900 dark:text-white">5. المخزون</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    أكثر 5 سلع مبيعاً · ناقصة:{' '}
                    <span
                      className={`font-mono tabular-nums font-black ${
                        inventorySummary.lowStockCount > 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {inventorySummary.lowStockCount}
                    </span>
                  </div>
                </div>
              </div>
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 whitespace-nowrap">
                <span>المخزون</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 w-full flex-1">
              {inventorySummary.top5BestSellers.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">لا توجد بيانات مخزون</div>
              ) : (
                inventorySummary.top5BestSellers.map((item, idx) => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-900 dark:text-white truncate">
                      {idx + 1}. {item.name}
                    </span>
                    <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                      <span className="text-slate-500 dark:text-slate-400">بيع: {item.soldQty}</span>
                      <span
                        className={`font-black ${
                          item.stock <= 5
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        باقي: {item.stock}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </button>

          {/* 8. الاشتراكات والفواتير (Rent, Electricity, Water, Internet, Phone + Due Date -> Go to الفواتير / orders) */}
          <button
            type="button"
            onClick={() => go('orders')}
            className="lg:col-span-4 text-start rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-teal-500 p-5 transition-colors flex flex-col justify-between gap-3"
          >
            <div className="flex items-center justify-between gap-2 w-full pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-teal-600 shrink-0" />
                <div>
                  <div className="text-sm font-black text-slate-900 dark:text-white">
                    8. الاشتراكات والفواتير هاد الشهر
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    للدفع: {fmtMoney(monthlyBillsSummary.totalBillsToPay)} {currencySymbol}
                    {monthlyBillsSummary.unpaidSuppliersCount > 0
                      ? ` · ${monthlyBillsSummary.unpaidSuppliersCount} فواتير موردين`
                      : ''}
                  </div>
                </div>
              </div>
              <span className="text-xs font-bold text-teal-600 dark:text-teal-400 flex items-center gap-1 whitespace-nowrap">
                <span>الفواتير</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 w-full flex-1">
              {monthlyBillsSummary.rows.map((bill) => (
                <div key={bill.name} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-slate-900 dark:text-white">{bill.name}</span>
                    <span className="text-[11px] text-slate-400 font-mono tabular-nums flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {bill.dueDate}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                    <span className="font-black text-slate-900 dark:text-white">
                      {bill.amount.toFixed(0)} {currencySymbol}
                    </span>
                    <span
                      className={`text-[11px] font-bold ${
                        bill.paid
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {bill.paid ? 'مخلص' : 'للدفع'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
