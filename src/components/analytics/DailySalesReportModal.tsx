import React, { useState, useMemo } from 'react';
import { usePos } from '../../context/PosContext';
import { getT } from '../../utils/translations';
import { Order } from '../../types';
import { generateAndDownloadDailySalesPdf } from '../../utils/pdfReport';
import { getExpenseCategoryLabel, getExpenseCategoryMeta } from '../../utils/expenses';
import {
  Printer,
  Download,
  X,
  Calendar,
  Building2,
  TrendingUp,
  CreditCard,
  Award,
  DollarSign,
  ShoppingBag,
  Store,
  CheckCircle2,
  Wallet
} from 'lucide-react';

interface DailySalesReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate?: string;
}

export const DailySalesReportModal: React.FC<DailySalesReportModalProps> = ({
  isOpen,
  onClose,
  defaultDate
}) => {
  const { orders, expenses, settings, activeBranch, currentShift, currencySymbol, language } = usePos();
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [selectedDate, setSelectedDate] = useState<string>(defaultDate || todayStr);

  // Filter orders for the selected day
  const dayOrders = useMemo(() => {
    return orders.filter((o) => {
      if (o.status !== 'completed') return false;
      const orderDay = o.date ? o.date.slice(0, 10) : '';
      return orderDay === selectedDate;
    });
  }, [orders, selectedDate]);

  const dayExpenses = useMemo(() => {
    return expenses.filter((exp) =>
      exp.date ? exp.date.slice(0, 10) === selectedDate : false
    );
  }, [expenses, selectedDate]);

  const dayExpensesTotal = useMemo(
    () => dayExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [dayExpenses]
  );

  // Aggregate day figures
  const summary = useMemo(() => {
    let revenue = 0;
    let cost = 0;
    let profit = 0;
    let taxes = 0;
    let discounts = 0;

    const paymentMethods: Record<string, { count: number; total: number }> = {
      cash: { count: 0, total: 0 },
      card: { count: 0, total: 0 },
      apple_pay: { count: 0, total: 0 },
      split: { count: 0, total: 0 },
      credit: { count: 0, total: 0 }
    };

    const productSalesMap: Record<string, { name: string; qty: number; revenue: number; profit: number }> = {};

    dayOrders.forEach((o) => {
      revenue += o.grandTotal || 0;
      cost += o.costTotal || 0;
      profit += o.profitTotal || 0;
      taxes += o.taxTotal || 0;
      discounts += o.discountTotal || 0;

      const pm = o.paymentMethod || 'cash';
      if (!paymentMethods[pm]) {
        paymentMethods[pm] = { count: 0, total: 0 };
      }
      paymentMethods[pm].count += 1;
      paymentMethods[pm].total += o.grandTotal || 0;

      o.items.forEach((it) => {
        if (!productSalesMap[it.productId]) {
          productSalesMap[it.productId] = {
            name: it.productName,
            qty: 0,
            revenue: 0,
            profit: 0
          };
        }
        productSalesMap[it.productId].qty += it.quantity;
        productSalesMap[it.productId].revenue += it.total;
        productSalesMap[it.productId].profit += it.total - (it.costPrice * it.quantity);
      });
    });

    const topProducts = Object.values(productSalesMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);

    const aov = dayOrders.length > 0 ? revenue / dayOrders.length : 0;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    return {
      revenue: Number(revenue.toFixed(2)),
      cost: Number(cost.toFixed(2)),
      profit: Number(profit.toFixed(2)),
      taxes: Number(taxes.toFixed(2)),
      discounts: Number(discounts.toFixed(2)),
      ordersCount: dayOrders.length,
      aov: Number(aov.toFixed(2)),
      margin: Number(margin.toFixed(1)),
      paymentMethods,
      topProducts
    };
  }, [dayOrders]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    generateAndDownloadDailySalesPdf({
      orders,
      expenses,
      settings,
      activeBranch,
      cashierName: currentShift?.cashierName,
      currencySymbol,
      language,
      reportDate: selectedDate
    });
  };

  const paymentMethodLabels: Record<string, string> = {
    cash: isAr ? 'نقد (كاش)' : 'Espèces',
    card: isAr ? 'بطاقة بنكية' : 'Carte Bancaire',
    apple_pay: isAr ? 'آبل باي / بدون تلامس' : 'Apple Pay',
    split: isAr ? 'دفع مجزأ' : 'Paiement Fractionné',
    credit: isAr ? 'بيع بالكريدي (دفتر الكريدي)' : 'Vente à Crédit (Carnet)'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Top Bar (Non-Printable Actions) */}
        <div className="no-print flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                {isAr ? 'تقرير ملخص المبيعات اليومي' : 'Daily Sales Summary Report'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {isAr ? 'جاهز للطباعة والتصدير الورقي' : 'Ready to print and export'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="px-3.5 py-2 text-xs font-bold rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white transition-colors flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>{isAr ? 'تحميل PDF' : 'Download PDF'}</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>{isAr ? 'طباعة التقرير الآن' : 'Print Report'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Date Selection Filter (Non-Printable) */}
        <div className="no-print px-6 py-3 border-b border-slate-100 dark:border-slate-800/60 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span className="font-bold text-slate-700 dark:text-slate-300">
              {isAr ? 'تاريخ التقرير:' : 'Report Date:'}
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2.5 py-1 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedDate(todayStr)}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors ${
                selectedDate === todayStr
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              {isAr ? 'اليوم' : 'Today'}
            </button>
            <button
              type="button"
              onClick={() => {
                const y = new Date();
                y.setDate(y.getDate() - 1);
                setSelectedDate(y.toISOString().slice(0, 10));
              }}
              className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50"
            >
              {isAr ? 'أمس' : 'Yesterday'}
            </button>
          </div>
        </div>

        {/* Printable Document Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 print:p-0 print:m-0 print:overflow-visible">
          <div id="daily-sales-report-printable" className="bg-white text-slate-900 p-6 rounded-2xl border border-slate-200 shadow-xs print:border-none print:shadow-none print:p-0 space-y-6 select-text">
            {/* Report Header */}
            <div className="border-b-2 border-slate-900 pb-4 flex items-start justify-between">
              <div>
                <h1 className="text-xl font-black tracking-tight text-slate-950">
                  {settings.storeName || 'بقالة صفرو للمواد الغذائية'}
                </h1>
                <div className="flex items-center gap-2 text-xs text-slate-600 mt-1">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>{activeBranch.name} ({activeBranch.code})</span>
                  <span>·</span>
                  <span>{activeBranch.city}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {settings.address} · {settings.phone}
                </div>
              </div>

              <div className="text-end">
                <span className="inline-block px-3 py-1 rounded-md bg-slate-900 text-white text-xs font-mono font-bold uppercase">
                  {isAr ? 'تقرير المبيعات اليومي' : 'Daily Sales Summary'}
                </span>
                <div className="text-xs font-bold text-slate-900 mt-1 font-mono">
                  {selectedDate}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                  {isAr ? 'استخرج بتاريخ:' : 'Generated:'} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>

            {/* High-Level KPIs */}
            <div>
              <h4 className="text-xs font-black uppercase text-slate-500 mb-2">
                {isAr ? '1. مؤشرات الأداء الإجمالية لليوم' : '1. Key Daily Figures'}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">{isAr ? 'إجمالي المبيعات' : 'Gross Sales'}</div>
                  <div className="text-lg font-black font-mono text-emerald-700 mt-0.5">
                    {summary.revenue.toFixed(2)} {currencySymbol}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">{isAr ? 'صافي الأرباح' : 'Net Profit'}</div>
                  <div className="text-lg font-black font-mono text-slate-900 mt-0.5">
                    +{summary.profit.toFixed(2)} {currencySymbol}
                  </div>
                  <div className="text-[10px] font-bold text-emerald-600">
                    {summary.margin}% {isAr ? 'هامش' : 'margin'}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">{isAr ? 'عدد العمليات' : 'Transactions'}</div>
                  <div className="text-lg font-black font-mono text-slate-900 mt-0.5">
                    {summary.ordersCount} {isAr ? 'فاتورة' : 'orders'}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">{isAr ? 'متوسط السلة' : 'Avg Basket'}</div>
                  <div className="text-lg font-black font-mono text-slate-900 mt-0.5">
                    {summary.aov.toFixed(2)} {currencySymbol}
                  </div>
                </div>
              </div>

              {/* Net Profit after Expenses Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/70">
                  <div className="text-[10px] font-bold text-amber-800 uppercase">
                    {isAr ? 'مصاريف اليوم' : 'Daily Expenses'}
                  </div>
                  <div className="text-base font-black font-mono text-rose-700 mt-0.5">
                    -{dayExpensesTotal.toFixed(2)} {currencySymbol}
                    <span className="text-[11px] font-sans text-amber-800 ms-2">
                      ({dayExpenses.length} {isAr ? 'بند' : 'items'})
                    </span>
                  </div>
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    summary.profit - dayExpensesTotal >= 0
                      ? 'border-emerald-300 bg-emerald-50/80'
                      : 'border-rose-300 bg-rose-50/80'
                  }`}
                >
                  <div className="text-[10px] font-bold text-slate-700 uppercase">
                    {isAr ? 'صافي الربح = إجمالي الأرباح - إجمالي المصاريف' : 'Net Profit = Gross Profit - Expenses'}
                  </div>
                  <div
                    className={`text-base font-black font-mono mt-0.5 ${
                      summary.profit - dayExpensesTotal >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {summary.profit - dayExpensesTotal >= 0 ? '+' : ''}
                    {(summary.profit - dayExpensesTotal).toFixed(2)} {currencySymbol}
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Method Breakdown Table */}
            <div>
              <h4 className="text-xs font-black uppercase text-slate-500 mb-2 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-slate-700" />
                <span>{isAr ? '2. تفصيل المبيعات حسب طرق الدفع (Payment Breakdown)' : '2. Payment Methods Breakdown'}</span>
              </h4>
              <table className="w-full text-xs text-left rtl:text-right border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">{isAr ? 'طريقة الدفع' : 'Method'}</th>
                    <th className="p-2.5 text-center">{isAr ? 'العمليات' : 'Count'}</th>
                    <th className="p-2.5 text-end">{isAr ? 'المبلغ الإجمالي' : 'Total Amount'}</th>
                    <th className="p-2.5 text-end">{isAr ? 'النسبة' : 'Share'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.entries(summary.paymentMethods).map(([k, val]) => {
                    const pct = summary.revenue > 0 ? ((val.total / summary.revenue) * 100).toFixed(1) : '0';
                    return (
                      <tr key={k} className="hover:bg-slate-50/50">
                        <td className="p-2.5 font-bold text-slate-900">
                          {paymentMethodLabels[k] || k}
                        </td>
                        <td className="p-2.5 text-center font-mono font-semibold text-slate-600">
                          {val.count}
                        </td>
                        <td className="p-2.5 text-end font-mono font-bold text-slate-900">
                          {val.total.toFixed(2)} {currencySymbol}
                        </td>
                        <td className="p-2.5 text-end font-mono text-slate-500">
                          {pct}%
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-black border-t-2 border-slate-300">
                    <td className="p-2.5">{isAr ? 'المجموع النهائي' : 'Total'}</td>
                    <td className="p-2.5 text-center font-mono">{summary.ordersCount}</td>
                    <td className="p-2.5 text-end font-mono text-emerald-700">
                      {summary.revenue.toFixed(2)} {currencySymbol}
                    </td>
                    <td className="p-2.5 text-end font-mono">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Top-Selling Products Table */}
            <div>
              <h4 className="text-xs font-black uppercase text-slate-500 mb-2 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-amber-600" />
                <span>{isAr ? '3. قائمة المنتجات الأكثر مبيعاً خلال اليوم (Top Selling Items)' : '3. Top Selling Products'}</span>
              </h4>
              <table className="w-full text-xs text-left rtl:text-right border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 w-10 text-center">#</th>
                    <th className="p-2.5">{isAr ? 'اسم المنتج' : 'Product'}</th>
                    <th className="p-2.5 text-center">{isAr ? 'الكمية المباعة' : 'Qty'}</th>
                    <th className="p-2.5 text-end">{isAr ? 'إجمالي المبيعات' : 'Sales Revenue'}</th>
                    <th className="p-2.5 text-end">{isAr ? 'الربح المحقق' : 'Profit'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.topProducts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-400">
                        {isAr ? 'لا توجد مبيعات مسجلة في هذا اليوم' : 'No sales on this day'}
                      </td>
                    </tr>
                  ) : (
                    summary.topProducts.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2.5 text-center font-bold text-slate-400">{idx + 1}</td>
                        <td className="p-2.5 font-bold text-slate-900">{p.name}</td>
                        <td className="p-2.5 text-center font-mono font-bold text-slate-700">
                          {p.qty}
                        </td>
                        <td className="p-2.5 text-end font-mono font-bold text-slate-900">
                          {p.revenue.toFixed(2)} {currencySymbol}
                        </td>
                        <td className="p-2.5 text-end font-mono text-emerald-600 font-bold">
                          +{p.profit.toFixed(2)} {currencySymbol}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Section 4: جدول المصاريف (Daily Expenses Table) */}
            <div>
              <h4 className="text-xs font-black uppercase text-slate-500 mb-2 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-amber-600" />
                <span>{isAr ? '4. جدول المصاريف المسجلة في هذا اليوم' : '4. Daily Expenses Table'}</span>
              </h4>
              <table className="w-full text-xs text-left rtl:text-right border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-amber-50 text-amber-900 font-bold border-b border-amber-200">
                  <tr>
                    <th className="p-2.5 w-10 text-center">#</th>
                    <th className="p-2.5">{isAr ? 'اسم المصروف' : 'Expense'}</th>
                    <th className="p-2.5 text-center">{isAr ? 'التصنيف' : 'Category'}</th>
                    <th className="p-2.5">{isAr ? 'ملاحظات' : 'Notes'}</th>
                    <th className="p-2.5 text-end">{isAr ? 'المبلغ' : 'Amount'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dayExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-400">
                        {isAr ? 'لا توجد مصاريف مسجلة في هذا اليوم' : 'No expenses recorded on this day'}
                      </td>
                    </tr>
                  ) : (
                    dayExpenses.map((exp, idx) => {
                      const meta = getExpenseCategoryMeta(exp.category);
                      return (
                        <tr key={exp.id} className="hover:bg-slate-50/50">
                          <td className="p-2.5 text-center font-bold text-slate-400">{idx + 1}</td>
                          <td className="p-2.5 font-bold text-slate-900">{exp.name}</td>
                          <td className="p-2.5 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${meta.badgeClass}`}>
                              {getExpenseCategoryLabel(exp.category, language)}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-500">{exp.notes || '—'}</td>
                          <td className="p-2.5 text-end font-mono font-bold text-rose-700">
                            -{Number(exp.amount || 0).toFixed(2)} {currencySymbol}
                          </td>
                        </tr>
                      );
                    })
                  )}
                  <tr className="bg-slate-50 font-black border-t-2 border-slate-300">
                    <td colSpan={4} className="p-2.5 text-slate-900">
                      {isAr ? 'إجمالي المصاريف لليوم' : 'Total Daily Expenses'}
                    </td>
                    <td className="p-2.5 text-end font-mono text-rose-700">
                      -{dayExpensesTotal.toFixed(2)} {currencySymbol}
                    </td>
                  </tr>
                  <tr className="bg-emerald-50/90 font-black border-t border-emerald-200">
                    <td colSpan={4} className="p-2.5 text-emerald-900">
                      {isAr ? 'صافي الربح = إجمالي الأرباح - إجمالي المصاريف' : 'Net Profit = Gross Profit - Total Expenses'}
                    </td>
                    <td
                      className={`p-2.5 text-end font-mono ${
                        summary.profit - dayExpensesTotal >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {summary.profit - dayExpensesTotal >= 0 ? '+' : ''}
                      {(summary.profit - dayExpensesTotal).toFixed(2)} {currencySymbol}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Cashier & Management Sign-Off */}
            <div className="pt-4 border-t border-slate-200 grid grid-cols-2 gap-8 text-xs">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold">{isAr ? 'مسؤول الصندوق / الكاشير:' : 'Cashier Name:'}</div>
                <div className="font-bold text-slate-900 mt-1">{currentShift.cashierName || 'كاشير الفرع'}</div>
                <div className="h-10 mt-2 border-b border-dashed border-slate-300 flex items-end text-[10px] text-slate-400 pb-1">
                  {isAr ? 'توقيع الكاشير:' : 'Cashier Signature:'}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold">{isAr ? 'مدير الفرع / المسؤول:' : 'Branch Manager:'}</div>
                <div className="font-bold text-slate-900 mt-1">{activeBranch.managerName}</div>
                <div className="h-10 mt-2 border-b border-dashed border-slate-300 flex items-end text-[10px] text-slate-400 pb-1">
                  {isAr ? 'تأكيد وختم الإدارة:' : 'Manager Seal & Approval:'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
