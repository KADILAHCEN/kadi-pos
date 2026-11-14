import React, { useEffect, useMemo, useState } from 'react';
import { AppTabId, usePos } from '../context/PosContext';
import {
  X,
  TrendingUp,
  Layers,
  Award,
  ArrowUpLeft,
  ArrowUpRight,
  PackageCheck,
  AlertTriangle,
  Plus,
  ShoppingBag,
  Wallet
} from 'lucide-react';
import { computeExpenseMetrics } from '../utils/expenses';

interface KExecutivePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: AppTabId) => void;
}

type BestSellerSort = 'qty' | 'sales' | 'profit';

export const KExecutivePanel: React.FC<KExecutivePanelProps> = ({
  isOpen,
  onClose,
  onNavigate
}) => {
  const {
    products,
    orders,
    expenses,
    lowStockProducts,
    adjustStock,
    activeBranch,
    currencySymbol,
    language
  } = usePos();

  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [bestSellerSort, setBestSellerSort] = useState<BestSellerSort>('qty');
  const [restockedId, setRestockedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const metrics = useMemo(() => {
    const completedOrders = orders.filter((o) => o.status === 'completed');

    let totalGrossSales = 0;
    let totalCost = 0;
    let totalProfit = 0;

    const productSalesMap: Record<
      string,
      { id: string; name: string; qty: number; sales: number; profit: number }
    > = {};

    completedOrders.forEach((o) => {
      totalGrossSales += o.grandTotal || 0;
      totalCost += o.costTotal || 0;
      totalProfit += o.profitTotal || 0;

      o.items.forEach((it) => {
        if (!productSalesMap[it.productId]) {
          productSalesMap[it.productId] = {
            id: it.productId,
            name: it.productName,
            qty: 0,
            sales: 0,
            profit: 0
          };
        }
        productSalesMap[it.productId].qty += it.quantity;
        productSalesMap[it.productId].sales += it.total;
        productSalesMap[it.productId].profit += it.total - it.costPrice * it.quantity;
      });
    });

    const profitMarginPct =
      totalGrossSales > 0 ? (totalProfit / totalGrossSales) * 100 : 0;

    let inventoryCostValue = 0;
    let inventoryRetailValue = 0;
    let outOfStockCount = 0;
    let totalUnitsInStock = 0;

    products.forEach((p) => {
      const stock = Math.max(0, p.stock || 0);
      totalUnitsInStock += stock;
      inventoryCostValue += (p.costPrice || 0) * stock;
      inventoryRetailValue += (p.price || 0) * stock;
      if (stock <= 0) outOfStockCount++;
    });

    const expectedInventoryProfit = inventoryRetailValue - inventoryCostValue;
    const inventoryMarginPct =
      inventoryRetailValue > 0 ? (expectedInventoryProfit / inventoryRetailValue) * 100 : 0;

    const allSoldProducts = Object.values(productSalesMap);

    return {
      completedCount: completedOrders.length,
      totalGrossSales,
      totalCost,
      totalProfit,
      profitMarginPct,
      totalProductsCount: products.length,
      totalUnitsInStock,
      inventoryCostValue,
      inventoryRetailValue,
      expectedInventoryProfit,
      inventoryMarginPct,
      outOfStockCount,
      allSoldProducts
    };
  }, [orders, products]);

  const topSellingProducts = useMemo(() => {
    const list = [...metrics.allSoldProducts];
    list.sort((a, b) => {
      if (bestSellerSort === 'sales') return b.sales - a.sales;
      if (bestSellerSort === 'profit') return b.profit - a.profit;
      return b.qty - a.qty;
    });
    return list.slice(0, 6);
  }, [metrics.allSoldProducts, bestSellerSort]);

  const expenseMetrics = useMemo(() => computeExpenseMetrics(expenses), [expenses]);
  const netProfitAfterExpenses = metrics.totalProfit - expenseMetrics.allTimeTotal;

  if (!isOpen) return null;

  const formatNum = (val: number) =>
    val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleQuickRestock = (productId: string) => {
    adjustStock(productId, 10, isAr ? 'توريد سريع من قائمة K' : 'Quick restock from K menu', 'restock');
    setRestockedId(productId);
    setTimeout(() => setRestockedId(null), 1500);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dropdown / Drawer anchored under K button on the right (RTL start) */}
      <div
        role="dialog"
        aria-label={isAr ? 'ملخص إدارة المخزون والأرباح والأكثر مبيعاً' : 'Inventory, Revenue, Profit & Best Sellers'}
        className="absolute top-full start-0 z-50 mt-2.5 w-[calc(100vw-2rem)] sm:w-[480px] md:w-[540px] max-h-[82vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/70 dark:bg-slate-900">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {isAr
                ? 'ملخص المخزون، المبيعات والأرباح'
                : isFr
                ? 'Stock, Chiffre d’affaires & Meilleures ventes'
                : 'Inventory, Total Sales, Profit & Top Products'}
            </h3>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 truncate">
              <span>{activeBranch.name}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {metrics.completedCount} {isAr ? 'فاتورة مكتملة' : 'completed orders'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {metrics.totalProductsCount} {isAr ? 'صنف' : 'items'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            title={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {/* 1. المبلغ الإجمالي ونسبة الأرباح (Total Revenue & Profit Percentage) */}
          <section className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span>{isAr ? 'المبلغ الإجمالي ونسبة الأرباح' : 'Total Sales & Profit Rate'}</span>
              </h4>
              <button
                type="button"
                onClick={() => {
                  onNavigate('analytics');
                  onClose();
                }}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 whitespace-nowrap"
              >
                <span>{isAr ? 'التقارير الكاملة' : 'Full Analytics'}</span>
                {isAr ? <ArrowUpLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* المبلغ الإجمالي للمبيعات */}
              <div className="p-3.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/35 border border-blue-200 dark:border-blue-800/70">
                <div className="text-[11px] font-bold text-blue-700 dark:text-blue-300">
                  {isAr ? 'المبلغ الإجمالي' : 'Total Sales'}
                </div>
                <div className="text-base font-black text-blue-950 dark:text-white mt-1 font-mono tabular-nums">
                  {formatNum(metrics.totalGrossSales)}
                  <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 ms-1">{currencySymbol}</span>
                </div>
                <div className="text-[10px] text-blue-700/80 dark:text-blue-300/80 mt-1 font-mono tabular-nums">
                  {isAr ? 'التكلفة:' : 'Cost:'} {formatNum(metrics.totalCost)}
                </div>
              </div>

              {/* إجمالي الأرباح قبل المصاريف */}
              <div
                className={`p-3.5 rounded-xl border ${
                  metrics.totalProfit < 0
                    ? 'bg-rose-50/80 dark:bg-rose-950/35 border-rose-200 dark:border-rose-800/70'
                    : 'bg-emerald-50/85 dark:bg-emerald-950/35 border-emerald-200 dark:border-emerald-800/70'
                }`}
              >
                <div
                  className={`text-[11px] font-bold ${
                    metrics.totalProfit < 0
                      ? 'text-rose-700 dark:text-rose-300'
                      : 'text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {isAr ? 'إجمالي الأرباح' : 'Gross Profit'}
                </div>
                <div
                  className={`text-base font-black mt-1 font-mono tabular-nums ${
                    metrics.totalProfit < 0
                      ? 'text-rose-700 dark:text-rose-300'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {metrics.totalProfit >= 0 ? '+' : ''}
                  {formatNum(metrics.totalProfit)}
                  <span className="text-[11px] font-semibold ms-1">{currencySymbol}</span>
                </div>
                <div
                  className={`text-[10px] mt-1 ${
                    metrics.totalProfit < 0
                      ? 'text-rose-700/80 dark:text-rose-300/80'
                      : 'text-emerald-700/80 dark:text-emerald-300/80'
                  }`}
                >
                  {isAr ? 'قبل خصم المصاريف' : 'After COGS'}
                </div>
              </div>

              {/* نسبة الأرباح */}
              <div
                className={`p-3.5 rounded-xl border ${
                  metrics.profitMarginPct < 0
                    ? 'bg-rose-50/80 dark:bg-rose-950/35 border-rose-200 dark:border-rose-800/70'
                    : metrics.profitMarginPct > 0 && metrics.profitMarginPct < 15
                    ? 'bg-amber-50/80 dark:bg-amber-950/35 border-amber-200 dark:border-amber-800/70'
                    : 'bg-teal-50/80 dark:bg-teal-950/35 border-teal-200 dark:border-teal-800/70'
                }`}
              >
                <div
                  className={`text-[11px] font-bold ${
                    metrics.profitMarginPct < 0
                      ? 'text-rose-700 dark:text-rose-300'
                      : metrics.profitMarginPct > 0 && metrics.profitMarginPct < 15
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-teal-700 dark:text-teal-300'
                  }`}
                >
                  {isAr ? 'نسبة الأرباح' : 'Profit Margin'}
                </div>
                <div
                  className={`text-base font-black mt-1 font-mono tabular-nums ${
                    metrics.profitMarginPct < 0
                      ? 'text-rose-700 dark:text-rose-300'
                      : metrics.profitMarginPct > 0 && metrics.profitMarginPct < 15
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-teal-700 dark:text-teal-300'
                  }`}
                >
                  {metrics.profitMarginPct.toFixed(1)}%
                </div>
                <div className="text-[10px] text-slate-600 dark:text-slate-300 mt-1 font-mono tabular-nums">
                  {isAr ? 'هامش المخزون:' : 'Stock:'} {metrics.inventoryMarginPct.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* صافي الربح = إجمالي الأرباح - إجمالي المصاريف + إجمالي المصاريف اليوم / هذا الشهر */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* صافي الربح بعد المصاريف */}
              <div
                className={`p-3.5 rounded-xl border ${
                  netProfitAfterExpenses < 0
                    ? 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/80'
                    : 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800/80'
                }`}
              >
                <div
                  className={`text-[11px] font-extrabold ${
                    netProfitAfterExpenses < 0
                      ? 'text-rose-800 dark:text-rose-300'
                      : 'text-emerald-800 dark:text-emerald-300'
                  }`}
                >
                  {isAr
                    ? 'صافي الربح = إجمالي الأرباح - إجمالي المصاريف'
                    : isFr
                    ? 'Bénéfice Net = Profit Brut - Dépenses'
                    : 'Net Profit = Gross Profit - Expenses'}
                </div>
                <div
                  className={`text-lg font-black mt-1 font-mono tabular-nums ${
                    netProfitAfterExpenses < 0
                      ? 'text-rose-700 dark:text-rose-300'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {netProfitAfterExpenses >= 0 ? '+' : ''}
                  {formatNum(netProfitAfterExpenses)}
                  <span className="text-xs font-semibold ms-1">{currencySymbol}</span>
                </div>
                <div className="text-[10px] text-slate-600 dark:text-slate-300 mt-1 font-mono tabular-nums">
                  {formatNum(metrics.totalProfit)} − {formatNum(expenseMetrics.allTimeTotal)} {currencySymbol}
                </div>
              </div>

              {/* إجمالي المصاريف اليوم / هذا الشهر */}
              <div className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-extrabold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                    <Wallet className="w-3.5 h-3.5" />
                    <span>
                      {isAr
                        ? 'إجمالي المصاريف اليوم / هذا الشهر'
                        : isFr
                        ? 'Dépenses Aujourd’hui / Ce mois'
                        : 'Expenses Today / This Month'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate('expenses');
                      onClose();
                    }}
                    className="text-[10px] font-bold text-amber-800 dark:text-amber-300 hover:underline whitespace-nowrap"
                  >
                    {isAr ? 'فتح المصاريف' : 'Open'}
                  </button>
                </div>

                <div className="flex items-baseline justify-between gap-2 mt-1.5 font-mono tabular-nums">
                  <div>
                    <span className="text-[10px] font-sans font-semibold text-amber-700 dark:text-amber-300 me-1">
                      {isAr ? 'اليوم:' : 'Today:'}
                    </span>
                    <span className="text-sm font-black text-rose-700 dark:text-rose-400">
                      {formatNum(expenseMetrics.todayTotal)}
                    </span>
                  </div>
                  <span className="text-amber-400 dark:text-amber-700">/</span>
                  <div>
                    <span className="text-[10px] font-sans font-semibold text-amber-700 dark:text-amber-300 me-1">
                      {isAr ? 'الشهر:' : 'Month:'}
                    </span>
                    <span className="text-sm font-black text-amber-900 dark:text-amber-200">
                      {formatNum(expenseMetrics.monthTotal)} {currencySymbol}
                    </span>
                  </div>
                </div>

                <div className="text-[10px] text-amber-800/80 dark:text-amber-300/80 mt-1 font-mono tabular-nums">
                  {isAr ? 'الإجمالي الكلي:' : 'All-time:'} {formatNum(expenseMetrics.allTimeTotal)} {currencySymbol} ({expenseMetrics.allCount})
                </div>
              </div>
            </div>
          </section>

          {/* 2. إدارة المخزون (Inventory Management) */}
          <section className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-600" />
                <span>{isAr ? 'إدارة المخزون' : 'Inventory Management'}</span>
              </h4>
              <button
                type="button"
                onClick={() => {
                  onNavigate('inventory');
                  onClose();
                }}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 whitespace-nowrap"
              >
                <span>{isAr ? 'فتح إدارة المخزون' : 'Manage Inventory'}</span>
                {isAr ? <ArrowUpLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl bg-sky-50/75 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/70">
                <div className="text-[11px] font-bold text-sky-700 dark:text-sky-300">
                  {isAr ? 'إجمالي السلع' : 'Products'}
                </div>
                <div className="text-sm font-black text-sky-950 dark:text-white mt-0.5 font-mono tabular-nums">
                  {metrics.totalProductsCount}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-indigo-50/75 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/70">
                <div className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                  {isAr ? 'قيمة التكلفة' : 'Cost Value'}
                </div>
                <div className="text-sm font-black text-indigo-950 dark:text-white mt-0.5 font-mono tabular-nums">
                  {formatNum(metrics.inventoryCostValue)}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50/75 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70">
                <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                  {isAr ? 'القيمة البيعية' : 'Retail Value'}
                </div>
                <div className="text-sm font-black text-emerald-700 dark:text-emerald-400 mt-0.5 font-mono tabular-nums">
                  {formatNum(metrics.inventoryRetailValue)}
                </div>
              </div>

              <div
                className={`p-3 rounded-xl border ${
                  metrics.outOfStockCount > 0
                    ? 'bg-rose-50/80 dark:bg-rose-950/35 border-rose-200 dark:border-rose-800/70'
                    : lowStockProducts.length > 0
                    ? 'bg-amber-50/80 dark:bg-amber-950/35 border-amber-200 dark:border-amber-800/70'
                    : 'bg-emerald-50/75 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/70'
                }`}
              >
                <div
                  className={`text-[11px] font-bold ${
                    metrics.outOfStockCount > 0
                      ? 'text-rose-700 dark:text-rose-300'
                      : lowStockProducts.length > 0
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {isAr ? 'نواقص / نافد' : 'Low / Out'}
                </div>
                <div
                  className={`text-sm font-black mt-0.5 font-mono tabular-nums ${
                    metrics.outOfStockCount > 0
                      ? 'text-rose-700 dark:text-rose-300'
                      : lowStockProducts.length > 0
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {lowStockProducts.length} / {metrics.outOfStockCount}
                </div>
              </div>
            </div>

            {/* Inventory Color Status Summary Line */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300 px-1">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {isAr ? 'متوفر' : 'Healthy'}: <span className="font-mono tabular-nums">{Math.max(0, metrics.totalProductsCount - lowStockProducts.length)}</span>
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-amber-700 dark:text-amber-400">
                  {isAr ? 'منخفض' : 'Low'}: <span className="font-mono tabular-nums">{Math.max(0, lowStockProducts.length - metrics.outOfStockCount)}</span>
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-rose-700 dark:text-rose-400">
                  {isAr ? 'نافد' : 'Out'}: <span className="font-mono tabular-nums">{metrics.outOfStockCount}</span>
                </span>
              </div>
              <span className="font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                {isAr ? 'ربح المخزون المتوقع:' : 'Est. Stock Profit:'} +{formatNum(metrics.expectedInventoryProfit)} {currencySymbol}
              </span>
            </div>

            {/* Quick Low Stock Restock List */}
            {lowStockProducts.length > 0 ? (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800/70 divide-y divide-amber-100 dark:divide-slate-800 overflow-hidden">
                <div className="px-3 py-2 bg-amber-50/90 dark:bg-amber-950/35 flex items-center justify-between text-[11px] font-bold text-amber-800 dark:text-amber-300">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>
                      {isAr
                        ? `منتجات تحتاج للتوريد (${lowStockProducts.length})`
                        : `Low Stock Items (${lowStockProducts.length})`}
                    </span>
                  </span>
                </div>
                {lowStockProducts.slice(0, 3).map((p) => {
                  const isOut = p.stock <= 0;
                  return (
                    <div
                      key={p.id}
                      className={`px-3 py-2 flex items-center justify-between gap-3 text-xs transition-colors ${
                        isOut
                          ? 'bg-rose-50/50 dark:bg-rose-950/20 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                          : 'hover:bg-amber-50/40 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          {isAr ? p.name : p.nameEn}
                        </div>
                        <div
                          className={`text-[11px] font-semibold font-mono tabular-nums ${
                            isOut
                              ? 'text-rose-700 dark:text-rose-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {isOut ? (isAr ? 'نافد (0)' : 'Out of Stock (0)') : `${isAr ? 'منخفض:' : 'Low:'} ${p.stock}`} · {isAr ? 'الحد:' : 'Min:'} {p.lowStockThreshold}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleQuickRestock(p.id)}
                        className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
                      >
                        <Plus className="w-3 h-3" />
                        <span>
                          {restockedId === p.id
                            ? (isAr ? 'تم +10' : '+10 Added')
                            : (isAr ? '+10 توريد' : '+10 Restock')}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-3 py-2.5 rounded-xl bg-emerald-50/75 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2 font-medium">
                <PackageCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  {isAr
                    ? 'جميع المنتجات متوفرة بكميات كافية في المخزون.'
                    : 'All inventory stock levels are healthy.'}
                </span>
              </div>
            )}
          </section>

          {/* 3. المنتوجات الأكثر مبيعاً (Best-Selling Products) */}
          <section className="p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-emerald-600" />
                <span>{isAr ? 'المنتوجات الأكثر مبيعاً' : 'Best-Selling Products'}</span>
              </h4>

              {/* Interactive Sort Segmented Control */}
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setBestSellerSort('qty')}
                  className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
                    bestSellerSort === 'qty'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {isAr ? 'بالكمية' : 'By Qty'}
                </button>
                <button
                  type="button"
                  onClick={() => setBestSellerSort('sales')}
                  className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
                    bestSellerSort === 'sales'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {isAr ? 'بالمبلغ' : 'By Sales'}
                </button>
                <button
                  type="button"
                  onClick={() => setBestSellerSort('profit')}
                  className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
                    bestSellerSort === 'profit'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {isAr ? 'بالربح' : 'By Profit'}
                </button>
              </div>
            </div>

            {topSellingProducts.length === 0 ? (
              <div className="p-6 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 space-y-2">
                <ShoppingBag className="w-7 h-7 text-slate-400 mx-auto" />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isAr
                    ? 'لم يتم تسجيل مبيعات مكتملة بعد لعرض المنتوجات الأكثر مبيعاً.'
                    : 'No completed sales yet to rank top-selling products.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate('pos');
                    onClose();
                  }}
                  className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                >
                  {isAr ? 'البدء بالبيع الآن' : 'Go to POS Register'}
                </button>
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-start border-collapse text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2 px-3 font-semibold text-start">#</th>
                      <th className="py-2 px-3 font-semibold text-start">{isAr ? 'المنتوج' : 'Product'}</th>
                      <th className="py-2 px-3 font-semibold text-center">{isAr ? 'الكمية' : 'Qty'}</th>
                      <th className="py-2 px-3 font-semibold text-end">{isAr ? 'المبلغ' : 'Sales'}</th>
                      <th className="py-2 px-3 font-semibold text-end">{isAr ? 'الربح' : 'Profit'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {topSellingProducts.map((item, idx) => {
                      const marginNum = item.sales > 0 ? (item.profit / item.sales) * 100 : 0;
                      const margin = marginNum.toFixed(0);
                      const profitColor =
                        item.profit < 0
                          ? 'text-rose-700 dark:text-rose-400'
                          : marginNum < 15
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-emerald-700 dark:text-emerald-400';
                      const rankColor =
                        idx === 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : idx === 1
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : idx === 2
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-slate-400';
                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className={`py-2.5 px-3 font-mono tabular-nums font-black ${rankColor}`}>
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white max-w-[165px] truncate">
                            {item.name}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono tabular-nums font-bold text-slate-700 dark:text-slate-200">
                            {item.qty}
                          </td>
                          <td className="py-2.5 px-3 text-end font-mono tabular-nums text-blue-700 dark:text-blue-300 font-semibold">
                            {item.sales.toFixed(2)} {currencySymbol}
                          </td>
                          <td className="py-2.5 px-3 text-end font-mono tabular-nums">
                            <span className={`font-bold ${profitColor}`}>
                              {item.profit >= 0 ? '+' : ''}
                              {item.profit.toFixed(2)}
                            </span>
                            <span className={`text-[10px] ms-1 font-semibold ${profitColor}`}>
                              ({margin}%)
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Footer Quick Actions */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              onNavigate('inventory');
              onClose();
            }}
            className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Layers className="w-4 h-4" />
            <span>{isAr ? 'إدارة المخزون' : 'Inventory'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onNavigate('expenses');
              onClose();
            }}
            className="py-2 px-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Wallet className="w-4 h-4" />
            <span>{isAr ? 'المصاريف' : 'Expenses'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onNavigate('analytics');
              onClose();
            }}
            className="flex-1 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span>{isAr ? 'التقارير والأرباح' : 'Reports'}</span>
          </button>
        </div>
      </div>
    </>
  );
};
