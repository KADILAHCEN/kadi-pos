import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, CalendarDays, FileDown, Printer, UserCheck, X } from 'lucide-react';
import { usePos } from '../../context/PosContext';
import { exportVoiceInvoicePdf } from '../../utils/exportReports';

export type VoiceInvoiceTab = 'daily' | 'monthly' | 'customer';

interface VoiceInvoicesModalProps {
  isOpen: boolean;
  initialTab?: VoiceInvoiceTab;
  initialCustomerName?: string;
  onClose: () => void;
}

export const VoiceInvoicesModal: React.FC<VoiceInvoicesModalProps> = ({
  isOpen,
  initialTab = 'daily',
  initialCustomerName,
  onClose
}) => {
  const { orders, customers, creditTransactions, expenses, settings, currencySymbol, language } = usePos();
  const isAr = language === 'ar';

  const [tab, setTab] = useState<VoiceInvoiceTab>(initialTab);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (initialCustomerName?.trim()) {
      const q = initialCustomerName.trim().toLowerCase();
      const matched =
        customers.find((c) => c.name.trim().toLowerCase() === q) ||
        customers.find((c) => c.name.toLowerCase().includes(q) || q.includes(c.name.trim().toLowerCase()));
      if (matched) {
        setSelectedCustomerId(matched.id);
        return;
      }
    }
    if (!selectedCustomerId && customers.length > 0) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [isOpen, initialCustomerName, customers, selectedCustomerId]);

  const todayPrefix = new Date().toISOString().slice(0, 10);
  const monthPrefix = new Date().toISOString().slice(0, 7);

  // 1. Daily Invoice Data (grouped by customer for today)
  const dailyData = useMemo(() => {
    const todayOrders = orders.filter((o) => o.status === 'completed' && o.date.startsWith(todayPrefix));
    const byCustomer: Record<
      string,
      {
        customerName: string;
        ordersCount: number;
        total: number;
        paidCash: number;
        onCredit: number;
        items: { name: string; qty: number; total: number }[];
      }
    > = {};

    todayOrders.forEach((o) => {
      const key = o.customerId || o.customerName || 'walkin';
      const label = o.customerName || (isAr ? 'زبون نقدي (عابر)' : 'Walk-in');
      if (!byCustomer[key]) {
        byCustomer[key] = {
          customerName: label,
          ordersCount: 0,
          total: 0,
          paidCash: 0,
          onCredit: 0,
          items: []
        };
      }
      byCustomer[key].ordersCount += 1;
      byCustomer[key].total += o.grandTotal;
      if (o.paymentMethod === 'credit') byCustomer[key].onCredit += o.grandTotal;
      else byCustomer[key].paidCash += o.grandTotal;
      o.items.forEach((it) => {
        byCustomer[key].items.push({ name: it.productName, qty: it.quantity, total: it.total });
      });
    });

    const groups = Object.values(byCustomer).sort((a, b) => b.total - a.total);
    const totalSales = todayOrders.reduce((s, o) => s + o.grandTotal, 0);
    const totalProfit = todayOrders.reduce((s, o) => s + o.profitTotal, 0);
    const totalCredit = todayOrders.filter((o) => o.paymentMethod === 'credit').reduce((s, o) => s + o.grandTotal, 0);

    return { groups, totalSales, totalProfit, totalCredit, count: todayOrders.length };
  }, [orders, todayPrefix, isAr]);

  // 2. Monthly Invoice Data
  const monthlyData = useMemo(() => {
    const monthOrders = orders.filter((o) => o.status === 'completed' && o.date.startsWith(monthPrefix));
    const monthExpenses = expenses.filter((e) => e.date.startsWith(monthPrefix));
    const monthPayments = creditTransactions.filter(
      (tx) => tx.type === 'payment' && tx.date.startsWith(monthPrefix)
    );

    const totalSales = monthOrders.reduce((s, o) => s + o.grandTotal, 0);
    const totalGrossProfit = monthOrders.reduce((s, o) => s + o.profitTotal, 0);
    const totalExpenses = monthExpenses.reduce((s, e) => s + e.amount, 0);
    const totalPaymentsCollected = monthPayments.reduce((s, p) => s + p.amount, 0);
    const netProfit = totalGrossProfit - totalExpenses;

    const byDay: Record<string, { date: string; count: number; sales: number; profit: number }> = {};
    monthOrders.forEach((o) => {
      const d = o.date.slice(0, 10);
      if (!byDay[d]) byDay[d] = { date: d, count: 0, sales: 0, profit: 0 };
      byDay[d].count += 1;
      byDay[d].sales += o.grandTotal;
      byDay[d].profit += o.profitTotal;
    });

    return {
      totalSales,
      totalGrossProfit,
      totalExpenses,
      netProfit,
      totalPaymentsCollected,
      count: monthOrders.length,
      days: Object.values(byDay).sort((a, b) => b.date.localeCompare(a.date))
    };
  }, [orders, expenses, creditTransactions, monthPrefix]);

  // 3. Detailed Customer Day-by-Day Invoice
  const customerData = useMemo(() => {
    const cust = customers.find((c) => c.id === selectedCustomerId) || null;
    if (!cust) return null;

    const custOrders = orders.filter(
      (o) =>
        o.status === 'completed' &&
        (o.customerId === cust.id || o.customerName?.trim().toLowerCase() === cust.name.trim().toLowerCase())
    );
    const custCreditTx = creditTransactions.filter((t) => t.customerId === cust.id);

    const dayEntries: {
      date: string;
      kind: 'purchase' | 'payment' | 'debt_note';
      description: string;
      amount: number;
      method?: string;
    }[] = [];

    custOrders.forEach((o) => {
      const itemSummary = o.items.map((it) => `${it.productName} ×${it.quantity}`).join('، ');
      dayEntries.push({
        date: o.date,
        kind: 'purchase',
        description: `${o.orderNumber}: ${itemSummary}`,
        amount: o.grandTotal,
        method: o.paymentMethod === 'credit' ? (isAr ? 'كريدي' : 'Credit') : (isAr ? 'مؤدى' : 'Paid')
      });
    });

    custCreditTx.forEach((tx) => {
      if (tx.type === 'payment') {
        dayEntries.push({
          date: tx.date,
          kind: 'payment',
          description: tx.notes || (isAr ? 'دفعة تسديد كريدي' : 'Credit payment'),
          amount: tx.amount
        });
      } else if (!tx.receiptNumber) {
        dayEntries.push({
          date: tx.date,
          kind: 'debt_note',
          description: tx.notes || (isAr ? 'قيد كريدي يدوي' : 'Manual credit debt'),
          amount: tx.amount
        });
      }
    });

    dayEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const totalCashOrders = custOrders
      .filter((o) => o.paymentMethod !== 'credit')
      .reduce((s, o) => s + o.grandTotal, 0);
    const totalCreditPayments = custCreditTx
      .filter((t) => t.type === 'payment')
      .reduce((s, t) => s + t.amount, 0);
    const totalPaid = Number((totalCashOrders + totalCreditPayments).toFixed(2));

    const totalTaken = Number(
      (
        custOrders.reduce((s, o) => s + o.grandTotal, 0) +
        custCreditTx.filter((t) => t.type === 'debt' && !t.receiptNumber).reduce((s, t) => s + t.amount, 0)
      ).toFixed(2)
    );

    return {
      customer: cust,
      dayEntries,
      totalTaken,
      totalPaid,
      remainingDebt: Number(cust.balance.toFixed(2))
    };
  }, [customers, selectedCustomerId, orders, creditTransactions, isAr]);

  const handleExportCurrentPdf = () => {
    if (tab === 'daily') {
      exportVoiceInvoicePdf({
        settings,
        currencySymbol,
        title: isAr ? 'فاكتورة اليوم التفصيلية حسب الزبائن' : 'Daily Invoice by Customer',
        subtitle: todayPrefix,
        kpis: [
          { label: isAr ? 'عدد الفواتير' : 'Orders', value: String(dailyData.count) },
          { label: isAr ? 'مجموع اليوم' : 'Today Total', value: `${dailyData.totalSales.toFixed(2)} ${currencySymbol}` },
          { label: isAr ? 'كريدي اليوم' : 'Today Credit', value: `${dailyData.totalCredit.toFixed(2)} ${currencySymbol}` },
          { label: isAr ? 'صافي الربح' : 'Profit', value: `${dailyData.totalProfit.toFixed(2)} ${currencySymbol}` }
        ],
        headers: [isAr ? 'الزبون' : 'Customer', isAr ? 'السلع المشتراة' : 'Items', isAr ? 'المجموع' : 'Total'],
        rows: dailyData.groups.map((g) => ({
          col1: `${g.customerName} (${g.ordersCount})`,
          col2: g.items.map((i) => `${i.name} ×${i.qty}`).join('، ').slice(0, 48),
          col3: `${g.total.toFixed(2)} ${currencySymbol}`
        })),
        filenamePrefix: 'KadiPOS_Daily_Invoice'
      });
    } else if (tab === 'monthly') {
      exportVoiceInvoicePdf({
        settings,
        currencySymbol,
        title: isAr ? 'فاكتورة الشهر الكاملة' : 'Monthly Summary Invoice',
        subtitle: monthPrefix,
        kpis: [
          { label: isAr ? 'مبيعات الشهر' : 'Month Sales', value: `${monthlyData.totalSales.toFixed(2)} ${currencySymbol}` },
          { label: isAr ? 'المصاريف' : 'Expenses', value: `${monthlyData.totalExpenses.toFixed(2)} ${currencySymbol}` },
          { label: isAr ? 'تسديد الكريدي' : 'Collected', value: `${monthlyData.totalPaymentsCollected.toFixed(2)} ${currencySymbol}` },
          { label: isAr ? 'صافي ربح الشهر' : 'Net Profit', value: `${monthlyData.netProfit.toFixed(2)} ${currencySymbol}` }
        ],
        headers: [isAr ? 'اليوم' : 'Date', isAr ? 'الفواتير' : 'Orders', isAr ? 'المجموع والربح' : 'Sales / Profit'],
        rows: monthlyData.days.map((d) => ({
          col1: d.date,
          col2: `${d.count} ${isAr ? 'فواتير' : 'orders'}`,
          col3: `${d.sales.toFixed(2)} (${isAr ? 'ربح:' : 'P:'} ${d.profit.toFixed(0)}) ${currencySymbol}`
        })),
        filenamePrefix: 'KadiPOS_Monthly_Invoice'
      });
    } else if (customerData) {
      exportVoiceInvoicePdf({
        settings,
        currencySymbol,
        title: isAr ? `فاكتورة الزبون: ${customerData.customer.name}` : `Customer Invoice: ${customerData.customer.name}`,
        subtitle: new Date().toLocaleDateString('ar-MA'),
        kpis: [
          { label: isAr ? 'مجموع المشتريات' : 'Total Taken', value: `${customerData.totalTaken.toFixed(2)} ${currencySymbol}` },
          { label: isAr ? 'شحال خلص' : 'Total Paid', value: `${customerData.totalPaid.toFixed(2)} ${currencySymbol}` },
          { label: isAr ? 'الباقي بذمته' : 'Remaining Debt', value: `${customerData.remainingDebt.toFixed(2)} ${currencySymbol}` }
        ],
        headers: [isAr ? 'التاريخ' : 'Date', isAr ? 'التفاصيل (شنو خدا / خلص)' : 'Details', isAr ? 'المبلغ' : 'Amount'],
        rows: customerData.dayEntries.slice(0, 60).map((e) => ({
          col1: e.date.slice(0, 10),
          col2: e.description.slice(0, 52),
          col3: `${e.kind === 'payment' ? '-' : '+'}${e.amount.toFixed(2)} ${currencySymbol}`
        })),
        filenamePrefix: `KadiPOS_Customer_${customerData.customer.name}`
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="w-full max-w-3xl max-h-[88vh] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black">
              {isAr ? 'الفاكتورات الذكية (اليومية / الشهرية / الزبون)' : 'Voice & Smart Invoices'}
            </h3>
            <p className="text-[11px] text-emerald-300">
              {settings.storeName} · {new Date().toLocaleDateString('ar-MA')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCurrentPdf}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isAr ? 'طباعة' : 'Print'}</span>
            </button>
            <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3 Invoice Tabs */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('daily')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-colors ${
              tab === 'daily' ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{isAr ? '1- فاكتورة اليوم' : 'Daily Invoice'}</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('monthly')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-colors ${
              tab === 'monthly' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>{isAr ? '2- فاكتورة الشهر' : 'Monthly Invoice'}</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('customer')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-colors ${
              tab === 'customer' ? 'bg-amber-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>{isAr ? '3- فاكتورة الزبون' : 'Customer Invoice'}</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {tab === 'daily' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500 font-bold">{isAr ? 'مجموع اليوم' : 'Today Total'}</div>
                  <div className="text-base font-black font-mono text-emerald-600 mt-0.5">
                    {dailyData.totalSales.toFixed(2)} {currencySymbol}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500 font-bold">{isAr ? 'كريدي اليوم' : 'Today Credit'}</div>
                  <div className="text-base font-black font-mono text-amber-600 mt-0.5">
                    {dailyData.totalCredit.toFixed(2)} {currencySymbol}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500 font-bold">{isAr ? 'ربح اليوم' : 'Today Profit'}</div>
                  <div className="text-base font-black font-mono text-indigo-600 mt-0.5">
                    {dailyData.totalProfit.toFixed(2)} {currencySymbol}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500 font-bold">{isAr ? 'الزبائن / الفواتير' : 'Orders'}</div>
                  <div className="text-base font-black font-mono mt-0.5">
                    {dailyData.groups.length} / {dailyData.count}
                  </div>
                </div>
              </div>

              {dailyData.groups.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  {isAr ? 'لا توجد مبيعات مسجلة لهذا اليوم بعد.' : 'No sales recorded today yet.'}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {dailyData.groups.map((g, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black text-slate-900 dark:text-white">{g.customerName}</span>
                        <span className="text-sm font-black font-mono text-emerald-600">
                          {g.total.toFixed(2)} {currencySymbol}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {g.items.map((it, j) => (
                          <span
                            key={j}
                            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold"
                          >
                            {it.name} ×{it.qty} ({it.total.toFixed(2)} {currencySymbol})
                          </span>
                        ))}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 flex items-center gap-3">
                        <span>{isAr ? 'مؤدى:' : 'Cash:'} {g.paidCash.toFixed(2)} {currencySymbol}</span>
                        <span>{isAr ? 'كريدي:' : 'Credit:'} {g.onCredit.toFixed(2)} {currencySymbol}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'monthly' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500 font-bold">{isAr ? 'مبيعات الشهر كامل' : 'Monthly Sales'}</div>
                  <div className="text-base font-black font-mono text-emerald-600 mt-0.5">
                    {monthlyData.totalSales.toFixed(2)} {currencySymbol}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500 font-bold">{isAr ? 'مصاريف الشهر' : 'Monthly Expenses'}</div>
                  <div className="text-base font-black font-mono text-rose-600 mt-0.5">
                    {monthlyData.totalExpenses.toFixed(2)} {currencySymbol}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500 font-bold">{isAr ? 'تسديد الكريدي' : 'Credit Collected'}</div>
                  <div className="text-base font-black font-mono text-blue-600 mt-0.5">
                    {monthlyData.totalPaymentsCollected.toFixed(2)} {currencySymbol}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500 font-bold">{isAr ? 'صافي ربح الشهر' : 'Monthly Net Profit'}</div>
                  <div
                    className={`text-base font-black font-mono mt-0.5 ${
                      monthlyData.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {monthlyData.netProfit.toFixed(2)} {currencySymbol}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-xs text-start">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black">
                    <tr>
                      <th className="p-3 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                      <th className="p-3 text-center">{isAr ? 'الفواتير' : 'Orders'}</th>
                      <th className="p-3 text-end">{isAr ? 'المبيعات' : 'Sales'}</th>
                      <th className="p-3 text-end">{isAr ? 'الربح' : 'Profit'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {monthlyData.days.map((d) => (
                      <tr key={d.date}>
                        <td className="p-3 font-mono font-bold">{d.date}</td>
                        <td className="p-3 text-center font-mono">{d.count}</td>
                        <td className="p-3 text-end font-mono font-bold text-emerald-600">
                          {d.sales.toFixed(2)} {currencySymbol}
                        </td>
                        <td className="p-3 text-end font-mono font-bold text-indigo-600">
                          {d.profit.toFixed(2)} {currencySymbol}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'customer' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                  {isAr ? 'اختر الزبون:' : 'Select Customer:'}
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold min-w-[200px]"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.balance.toFixed(2)} {currencySymbol})
                    </option>
                  ))}
                </select>
              </div>

              {customerData && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className="text-[11px] font-bold text-slate-500">
                        {isAr ? 'مجموع ما أخذه (السلع)' : 'Total Taken'}
                      </div>
                      <div className="text-lg font-black font-mono text-slate-900 dark:text-white mt-0.5">
                        {customerData.totalTaken.toFixed(2)} {currencySymbol}
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                      <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                        {isAr ? 'شحال خلص (المدفوع)' : 'Total Paid'}
                      </div>
                      <div className="text-lg font-black font-mono text-emerald-600 mt-0.5">
                        {customerData.totalPaid.toFixed(2)} {currencySymbol}
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
                      <div className="text-[11px] font-bold text-rose-700 dark:text-rose-300">
                        {isAr ? 'الباقي كيسالني / بذمته' : 'Remaining Balance'}
                      </div>
                      <div className="text-lg font-black font-mono text-rose-600 mt-0.5">
                        {customerData.remainingDebt.toFixed(2)} {currencySymbol}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-black text-slate-700 dark:text-slate-300">
                      {isAr ? 'التفاصيل نهار بنهار:' : 'Day-by-Day History:'}
                    </h4>
                    {customerData.dayEntries.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">
                        {isAr ? 'لا توجد معاملات مسجلة لهذا الزبون بعد.' : 'No history yet.'}
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                        {customerData.dayEntries.map((e, i) => (
                          <div key={i} className="p-3 flex items-center justify-between gap-3 text-xs bg-white dark:bg-slate-900">
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 dark:text-white truncate">{e.description}</div>
                              <div className="text-[10px] font-mono text-slate-500">
                                {new Date(e.date).toLocaleString('ar-MA')} {e.method ? `· ${e.method}` : ''}
                              </div>
                            </div>
                            <span
                              className={`font-mono font-black shrink-0 ${
                                e.kind === 'payment' ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {e.kind === 'payment' ? '-' : '+'}
                              {e.amount.toFixed(2)} {currencySymbol}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
