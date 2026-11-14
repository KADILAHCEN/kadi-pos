import React, { useMemo, useState } from 'react';
import { usePos } from '../../context/PosContext';
import { Expense, ExpenseCategory, SupplierInvoice } from '../../types';
import {
  EXPENSE_CATEGORIES,
  computeExpenseMetrics,
  getExpenseCategoryLabel,
  getExpenseCategoryMeta,
  getLocalTodayYMD
} from '../../utils/expenses';
import {
  Wallet,
  Plus,
  Search,
  Calendar,
  Trash2,
  Pencil,
  Check,
  X,
  Home,
  Zap,
  Truck,
  Package,
  MoreHorizontal,
  TrendingUp,
  CheckCircle2,
  Filter,
  FileText,
  Phone,
  Clock
} from 'lucide-react';

const CategoryIcon: React.FC<{ category: ExpenseCategory; className?: string }> = ({
  category,
  className = 'w-4 h-4'
}) => {
  switch (category) {
    case 'rent':
      return <Home className={className} />;
    case 'electricity':
      return <Zap className={className} />;
    case 'transport':
      return <Truck className={className} />;
    case 'merchandise':
      return <Package className={className} />;
    default:
      return <MoreHorizontal className={className} />;
  }
};

export const ExpensesView: React.FC = () => {
  const {
    expenses,
    addExpense,
    updateExpense,
    deleteExpense,
    supplierInvoices,
    addSupplierInvoice,
    paySupplierInvoice,
    deleteSupplierInvoice,
    orders,
    currencySymbol,
    language,
    setCurrentTab
  } = usePos();

  const isAr = language === 'ar';
  const isFr = language === 'fr';
  const todayStr = getLocalTodayYMD();
  const monthPrefix = todayStr.slice(0, 7);

  const [activeSubTab, setActiveSubTab] = useState<'expenses' | 'suppliers'>('expenses');

  // Add Expense Form State
  const [name, setName] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(todayStr);
  const [category, setCategory] = useState<ExpenseCategory>('merchandise');
  const [notes, setNotes] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Filters & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ExpenseCategory>('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | 'month'>('all');

  // Edit / Confirm Delete State
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Supplier Invoice Form & Payment State
  const [supName, setSupName] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supInvoiceNumber, setSupInvoiceNumber] = useState('');
  const [supDate, setSupDate] = useState(todayStr);
  const [supDueDate, setSupDueDate] = useState('');
  const [supTotal, setSupTotal] = useState('');
  const [supPaid, setSupPaid] = useState('0');
  const [supNotes, setSupNotes] = useState('');
  const [supSearch, setSupSearch] = useState('');
  const [supStatusFilter, setSupStatusFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('all');
  const [payDraftMap, setPayDraftMap] = useState<Record<string, string>>({});
  const [supConfirmDeleteId, setSupConfirmDeleteId] = useState<string | null>(null);

  const supplierMetrics = useMemo(() => {
    const totalPurchased = supplierInvoices.reduce((s, inv) => s + (inv.totalAmount || 0), 0);
    const totalPaid = supplierInvoices.reduce((s, inv) => s + (inv.paidAmount || 0), 0);
    const totalPayable = Math.max(0, totalPurchased - totalPaid);
    const unpaidCount = supplierInvoices.filter((inv) => inv.status !== 'paid').length;
    return {
      totalPurchased,
      totalPaid,
      totalPayable,
      unpaidCount
    };
  }, [supplierInvoices]);

  const filteredSuppliers = useMemo(() => {
    const q = supSearch.trim().toLowerCase();
    return supplierInvoices
      .filter((inv) => {
        if (supStatusFilter !== 'all' && inv.status !== supStatusFilter) return false;
        if (!q) return true;
        return (
          inv.supplierName.toLowerCase().includes(q) ||
          inv.invoiceNumber.toLowerCase().includes(q) ||
          (inv.supplierPhone || '').toLowerCase().includes(q)
        );
      })
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [supplierInvoices, supSearch, supStatusFilter]);

  const handleAddSupplierInvoiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totalVal = parseFloat(supTotal);
    const paidVal = Math.max(0, parseFloat(supPaid) || 0);
    if (!supName.trim() || isNaN(totalVal) || totalVal <= 0) return;

    const invNum =
      supInvoiceNumber.trim() || `SUP-${String(supplierInvoices.length + 1).padStart(3, '0')}`;

    addSupplierInvoice({
      supplierName: supName.trim(),
      supplierPhone: supPhone.trim() || undefined,
      invoiceNumber: invNum,
      date: supDate || todayStr,
      dueDate: supDueDate || undefined,
      totalAmount: Number(totalVal.toFixed(2)),
      paidAmount: Number(Math.min(totalVal, paidVal).toFixed(2)),
      notes: supNotes.trim() || undefined
    });

    setSupName('');
    setSupPhone('');
    setSupInvoiceNumber('');
    setSupDueDate('');
    setSupTotal('');
    setSupPaid('0');
    setSupNotes('');
    setToastMsg(
      isAr
        ? `تم تسجيل فاتورة المورد (${invNum}) بمبلغ ${totalVal.toFixed(2)} ${currencySymbol}`
        : `Supplier invoice ${invNum} recorded`
    );
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handlePaySupplier = (inv: SupplierInvoice, customAmount?: number) => {
    const remaining = Math.max(0, Number((inv.totalAmount - inv.paidAmount).toFixed(2)));
    if (remaining <= 0) return;
    const raw = customAmount !== undefined ? customAmount : parseFloat(payDraftMap[inv.id] || '');
    const payAmt = !isNaN(raw) && raw > 0 ? Math.min(remaining, raw) : remaining;
    paySupplierInvoice(inv.id, payAmt);
    setPayDraftMap((prev) => {
      const copy = { ...prev };
      delete copy[inv.id];
      return copy;
    });
    setToastMsg(
      isAr
        ? `تم تسجيل دفعة بقيمة ${payAmt.toFixed(2)} ${currencySymbol} للمورد ${inv.supplierName}`
        : `Paid ${payAmt.toFixed(2)} ${currencySymbol} to ${inv.supplierName}`
    );
    setTimeout(() => setToastMsg(null), 3500);
  };

  const expenseMetrics = useMemo(() => computeExpenseMetrics(expenses), [expenses]);

  // Gross profit & Net Profit = Gross Profit - Total Expenses
  const totalGrossProfit = useMemo(
    () =>
      orders
        .filter((o) => o.status === 'completed')
        .reduce((sum, o) => sum + (o.profitTotal || 0), 0),
    [orders]
  );

  const netProfitAfterExpenses = totalGrossProfit - expenseMetrics.allTimeTotal;

  const filteredExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return expenses
      .filter((exp) => {
        if (categoryFilter !== 'all' && exp.category !== categoryFilter) return false;
        const expDay = exp.date ? exp.date.slice(0, 10) : '';
        if (periodFilter === 'today' && expDay !== todayStr) return false;
        if (periodFilter === 'month' && !expDay.startsWith(monthPrefix)) return false;
        if (q) {
          const catLabel = getExpenseCategoryLabel(exp.category, language).toLowerCase();
          const inName = exp.name.toLowerCase().includes(q);
          const inNotes = exp.notes ? exp.notes.toLowerCase().includes(q) : false;
          const inCat = catLabel.includes(q);
          return inName || inNotes || inCat;
        }
        return true;
      })
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [expenses, categoryFilter, periodFilter, searchQuery, todayStr, monthPrefix, language]);

  const filteredTotalAmount = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [filteredExpenses]
  );

  const quickPresets: Array<{ label: string; category: ExpenseCategory }> = isAr
    ? [
        { label: 'كراء المحل الشهري', category: 'rent' },
        { label: 'فاتورة الكهرباء والماء', category: 'electricity' },
        { label: 'نقل وتوصيل البضاعة', category: 'transport' },
        { label: 'شراء بضاعة بالجملة', category: 'merchandise' },
        { label: 'مستلزمات وصيانة', category: 'other' }
      ]
    : [
        { label: 'Monthly Shop Rent', category: 'rent' },
        { label: 'Electricity & Water Bill', category: 'electricity' },
        { label: 'Delivery & Transport', category: 'transport' },
        { label: 'Wholesale Merchandise', category: 'merchandise' },
        { label: 'Supplies & Maintenance', category: 'other' }
      ];

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = parseFloat(amount);
    if (!name.trim() || isNaN(numericAmount) || numericAmount <= 0) return;

    addExpense({
      name: name.trim(),
      amount: numericAmount,
      date: date || todayStr,
      category,
      notes: notes.trim() || undefined
    });

    setName('');
    setAmount('');
    setNotes('');
    setDate(todayStr);

    setToastMsg(
      isAr
        ? `تمت إضافة المصروف بنجاح (${numericAmount.toFixed(2)} ${currencySymbol})`
        : `Expense recorded (${numericAmount.toFixed(2)} ${currencySymbol})`
    );
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;
    if (!editingExpense.name.trim() || editingExpense.amount <= 0) return;
    updateExpense(editingExpense.id, {
      name: editingExpense.name.trim(),
      amount: editingExpense.amount,
      date: editingExpense.date,
      category: editingExpense.category,
      notes: editingExpense.notes?.trim() || undefined
    });
    setEditingExpense(null);
    setToastMsg(isAr ? 'تم تحديث بيانات المصروف بنجاح' : 'Expense updated');
    setTimeout(() => setToastMsg(null), 3000);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
              <Wallet className="w-5 h-5" />
            </div>
            <span>{isAr ? 'إدارة المصاريف وصافي الربح' : isFr ? 'Gestion des Dépenses' : 'Expenses & Net Profit'}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isAr
              ? 'تسجيل مصاريف المحل (كراء، كهرباء، نقل، شراء بضاعة، أخرى) واحتساب صافي الربح تلقائياً'
              : 'Track store operating expenses (rent, electricity, transport, merchandise, other) & compute net profit'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCurrentTab('analytics')}
          className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 self-start sm:self-auto"
        >
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span>{isAr ? 'عرض تقرير الأرباح وجدول المصاريف' : 'Open Profit Report'}</span>
        </button>
      </div>

      {toastMsg && (
        <div className="px-4 py-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Sub-Tab Switcher: Daily Expenses vs Supplier Invoices */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-fit shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveSubTab('expenses')}
          className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-colors ${
            activeSubTab === 'expenses'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>{isAr ? 'المصاريف اليومية' : 'Daily Expenses'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('suppliers')}
          className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-colors ${
            activeSubTab === 'suppliers'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>{isAr ? 'فواتير الموردين والسلعة' : 'Supplier Invoices'}</span>
          {supplierMetrics.unpaidCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-400 text-slate-950">
              {supplierMetrics.unpaidCount}
            </span>
          )}
        </button>
      </div>

      {activeSubTab === 'suppliers' ? (
        <div className="space-y-6">
          {/* Suppliers KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {isAr ? 'إجمالي مشتريات الموردين' : 'Total Supplier Purchases'}
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono tabular-nums">
                {supplierMetrics.totalPurchased.toFixed(2)} {currencySymbol}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {supplierInvoices.length} {isAr ? 'فاتورة مسجلة' : 'invoices logged'}
              </div>
            </div>

            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/70 shadow-2xs">
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                {isAr ? 'المبالغ المؤداة للموردين' : 'Total Paid to Suppliers'}
              </div>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono tabular-nums">
                {supplierMetrics.totalPaid.toFixed(2)} {currencySymbol}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {isAr ? 'الدفعات المسجلة والمؤداة' : 'Cumulative settled payments'}
              </div>
            </div>

            <div
              className={`p-5 rounded-3xl border shadow-2xs ${
                supplierMetrics.totalPayable > 0
                  ? 'bg-amber-50/90 dark:bg-amber-950/35 border-amber-200 dark:border-amber-800/80'
                  : 'bg-emerald-50/80 dark:bg-emerald-950/35 border-emerald-200 dark:border-emerald-800/80'
              }`}
            >
              <div className="text-xs font-bold text-amber-800 dark:text-amber-300">
                {isAr ? 'الباقي بذمتك للموردين (الديون المستحقة)' : 'Outstanding Payable to Suppliers'}
              </div>
              <div className="text-2xl font-black text-amber-700 dark:text-amber-400 mt-1 font-mono tabular-nums">
                {supplierMetrics.totalPayable.toFixed(2)} {currencySymbol}
              </div>
              <div className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-1">
                {supplierMetrics.unpaidCount} {isAr ? 'فاتورة تنتظر التسديد الكلي' : 'invoices pending full payment'}
              </div>
            </div>
          </div>

          {/* Add Supplier Invoice Form */}
          <form
            onSubmit={handleAddSupplierInvoiceSubmit}
            className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-600" />
                <span>{isAr ? 'تسجيل فاتورة مورد / شراء سلعة جديدة' : 'Record New Supplier Invoice'}</span>
              </h3>
              <span className="text-[11px] text-slate-400">
                {isAr ? 'تتبع الدفعات الجزئية وتواريخ الاستحقاق' : 'Track partial payments & due dates'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'اسم المورد / الشركة *' : 'Supplier Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  placeholder={isAr ? 'مثال: شركة ألبان الأطلس...' : 'e.g. Atlas Dairy...'}
                  className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'هاتف المورد' : 'Phone'}
                </label>
                <input
                  type="tel"
                  value={supPhone}
                  onChange={(e) => setSupPhone(e.target.value)}
                  placeholder="06XXXXXXXX"
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'رقم الفاتورة' : 'Invoice #'}
                </label>
                <input
                  type="text"
                  value={supInvoiceNumber}
                  onChange={(e) => setSupInvoiceNumber(e.target.value)}
                  placeholder={isAr ? 'تلقائي إن ترك فارغاً' : 'Auto if empty'}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'تاريخ الفاتورة *' : 'Date *'}
                </label>
                <input
                  type="date"
                  required
                  value={supDate}
                  onChange={(e) => setSupDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? `المبلغ الإجمالي (${currencySymbol}) *` : 'Total Amount *'}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  value={supTotal}
                  onChange={(e) => setSupTotal(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? `التسبيق المدفوع الآن (${currencySymbol})` : 'Initial Paid'}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={supPaid}
                  onChange={(e) => setSupPaid(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'تاريخ الاستحقاق (اختياري)' : 'Due Date'}
                </label>
                <input
                  type="date"
                  value={supDueDate}
                  onChange={(e) => setSupDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'ملاحظات السلعة' : 'Notes'}
                </label>
                <input
                  type="text"
                  value={supNotes}
                  onChange={(e) => setSupNotes(e.target.value)}
                  placeholder={isAr ? 'تفاصيل البضاعة المستلمة...' : 'Goods received...'}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-xs transition-all flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>{isAr ? 'حفظ فاتورة المورد' : 'Save Supplier Invoice'}</span>
              </button>
            </div>
          </form>

          {/* Supplier Invoices Register */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  {isAr ? 'سجل فواتير الموردين والمستحقات' : 'Supplier Invoices Ledger'}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isAr
                    ? `عرض ${filteredSuppliers.length} من إجمالي ${supplierInvoices.length} فاتورة`
                    : `Showing ${filteredSuppliers.length} of ${supplierInvoices.length} invoices`}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold">
                  {(
                    [
                      { id: 'all', label: isAr ? 'الكل' : 'All' },
                      { id: 'unpaid', label: isAr ? 'غير مدفوعة' : 'Unpaid' },
                      { id: 'partial', label: isAr ? 'جزئية' : 'Partial' },
                      { id: 'paid', label: isAr ? 'مدفوعة' : 'Paid' }
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSupStatusFilter(st.id)}
                      className={`px-3 py-1 rounded-lg transition-colors ${
                        supStatusFilter === st.id
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={supSearch}
                    onChange={(e) => setSupSearch(e.target.value)}
                    placeholder={isAr ? 'بحث بالمورد أو رقم الفاتورة...' : 'Search supplier or invoice...'}
                    className="ps-8 pe-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>
            </div>

            {filteredSuppliers.length === 0 ? (
              <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs font-semibold">
                  {isAr
                    ? 'لا توجد فواتير موردين مطابقة حالياً. أضف أول فاتورة من النموذج أعلاه.'
                    : 'No matching supplier invoices yet.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredSuppliers.map((inv) => {
                  const remaining = Math.max(0, Number((inv.totalAmount - inv.paidAmount).toFixed(2)));
                  const isOverdue =
                    inv.status !== 'paid' && inv.dueDate && inv.dueDate < todayStr;
                  const statusBadge =
                    inv.status === 'paid'
                      ? {
                          label: isAr ? 'مؤداة بالكامل' : 'Paid',
                          cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300'
                        }
                      : inv.status === 'partial'
                      ? {
                          label: isAr ? 'دفعة جزئية' : 'Partial',
                          cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                        }
                      : {
                          label: isAr ? 'غير مؤداة' : 'Unpaid',
                          cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300'
                        };

                  return (
                    <div
                      key={inv.id}
                      className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-sm text-slate-900 dark:text-white">
                              {inv.supplierName}
                            </span>
                            <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                              #{inv.invoiceNumber}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${statusBadge.cls}`}>
                              {statusBadge.label}
                            </span>
                            {isOverdue && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-600 text-white">
                                {isAr ? 'تجاوزت الأجل!' : 'Overdue'}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-1 font-mono">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {inv.date}
                            </span>
                            {inv.dueDate && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {isAr ? `الاستحقاق: ${inv.dueDate}` : `Due: ${inv.dueDate}`}
                              </span>
                            )}
                            {inv.supplierPhone && (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {inv.supplierPhone}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-end font-mono tabular-nums">
                          <div className="text-xs text-slate-500">
                            {isAr ? 'المجموع:' : 'Total:'} {inv.totalAmount.toFixed(2)} {currencySymbol}
                          </div>
                          <div className="text-sm font-black text-amber-700 dark:text-amber-400">
                            {isAr ? 'الباقي:' : 'Rem:'} {remaining.toFixed(2)} {currencySymbol}
                          </div>
                        </div>
                      </div>

                      {inv.notes && (
                        <div className="text-[11px] text-slate-600 dark:text-slate-300 italic">
                          {inv.notes}
                        </div>
                      )}

                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                        {remaining > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5 flex-1">
                            <input
                              type="number"
                              step="any"
                              min="0.01"
                              max={remaining}
                              value={payDraftMap[inv.id] ?? ''}
                              onChange={(e) =>
                                setPayDraftMap((prev) => ({ ...prev, [inv.id]: e.target.value }))
                              }
                              placeholder={remaining.toFixed(2)}
                              className="w-24 px-2.5 py-1.5 text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl"
                            />
                            <button
                              type="button"
                              onClick={() => handlePaySupplier(inv)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black"
                            >
                              {isAr ? 'تسديد الدفعة' : 'Pay'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePaySupplier(inv, remaining)}
                              className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold"
                            >
                              {isAr ? 'تصفية الكل' : 'Pay Full'}
                            </button>
                          </div>
                        ) : (
                          <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              {isAr
                                ? `تم الأداء بالكامل (${inv.paidAmount.toFixed(2)} ${currencySymbol})`
                                : 'Fully Settled'}
                            </span>
                          </div>
                        )}

                        {supConfirmDeleteId === inv.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                deleteSupplierInvoice(inv.id);
                                setSupConfirmDeleteId(null);
                              }}
                              className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold"
                            >
                              {isAr ? 'تأكيد' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setSupConfirmDeleteId(null)}
                              className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-[10px] font-bold"
                            >
                              {isAr ? 'إلغاء' : 'Cancel'}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSupConfirmDeleteId(inv.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            title={isAr ? 'حذف الفاتورة' : 'Delete Invoice'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>

      {/* KPI Strip: Today, This Month, Total Expenses, Net Profit */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isAr ? 'إجمالي المصاريف اليوم' : "Today's Expenses"}
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1 font-mono tabular-nums">
            {expenseMetrics.todayTotal.toFixed(2)} {currencySymbol}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {expenseMetrics.todayCount} {isAr ? 'مصروف مسجل اليوم' : 'entries today'}
          </div>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isAr ? 'إجمالي المصاريف هذا الشهر' : 'This Month Expenses'}
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 font-mono tabular-nums">
            {expenseMetrics.monthTotal.toFixed(2)} {currencySymbol}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {expenseMetrics.monthCount} {isAr ? 'مصروف هذا الشهر' : 'entries this month'}
          </div>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isAr ? 'إجمالي المصاريف الكلي' : 'All-Time Expenses'}
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono tabular-nums">
            {expenseMetrics.allTimeTotal.toFixed(2)} {currencySymbol}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {expenseMetrics.allCount} {isAr ? 'إجمالي العمليات المسجلة' : 'total entries'}
          </div>
        </div>

        <div
          className={`p-5 rounded-3xl border shadow-2xs ${
            netProfitAfterExpenses >= 0
              ? 'bg-emerald-50/80 dark:bg-emerald-950/35 border-emerald-200 dark:border-emerald-800/80'
              : 'bg-rose-50/80 dark:bg-rose-950/35 border-rose-200 dark:border-rose-800/80'
          }`}
        >
          <div
            className={`text-xs font-bold ${
              netProfitAfterExpenses >= 0
                ? 'text-emerald-700 dark:text-emerald-300'
                : 'text-rose-700 dark:text-rose-300'
            }`}
          >
            {isAr ? 'صافي الربح (إجمالي الأرباح - المصاريف)' : 'Net Profit (Profit - Expenses)'}
          </div>
          <div
            className={`text-2xl font-black mt-1 font-mono tabular-nums ${
              netProfitAfterExpenses >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {netProfitAfterExpenses >= 0 ? '+' : ''}
            {netProfitAfterExpenses.toFixed(2)} {currencySymbol}
          </div>
          <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 font-mono tabular-nums">
            {totalGrossProfit.toFixed(2)} - {expenseMetrics.allTimeTotal.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Add Expense Form + Category Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left/Start: Add New Expense Form */}
        <form
          onSubmit={handleAddSubmit}
          className="lg:col-span-7 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-rose-600" />
              <span>{isAr ? 'إضافة مصروف جديد' : 'Add New Expense'}</span>
            </h3>
            <span className="text-[11px] text-slate-400">
              {isAr ? 'يخصم تلقائياً من إجمالي الأرباح' : 'Deducted automatically from gross profit'}
            </span>
          </div>

          {/* Quick preset chips */}
          <div>
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">
              {isAr ? 'تعبئة سريعة:' : 'Quick presets:'}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {quickPresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setName(preset.label);
                    setCategory(preset.category);
                  }}
                  className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-700 dark:hover:text-rose-300 border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Category Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              {isAr ? 'التصنيف *' : 'Category *'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {EXPENSE_CATEGORIES.map((cat) => {
                const isSelected = category === cat.id;
                const label = getExpenseCategoryLabel(cat.id, language);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`p-2.5 rounded-2xl border text-xs font-extrabold flex flex-col items-center justify-center gap-1.5 transition-all ${
                      isSelected
                        ? 'border-rose-600 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 ring-2 ring-rose-500/20'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <CategoryIcon category={cat.id} className="w-4 h-4" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name, Amount, Date Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? 'اسم المصروف *' : 'Expense Name *'}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isAr ? 'مثال: كراء المحل، كهرباء...' : 'e.g. Shop rent...'}
                className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? `المبلغ (${currencySymbol}) *` : `Amount (${currencySymbol}) *`}
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? 'التاريخ *' : 'Date *'}
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-rose-500"
              />
            </div>
          </div>

          {/* Optional Notes + Submit */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? 'ملاحظات إضافية (اختياري)' : 'Notes (Optional)'}
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={isAr ? 'رقم الفاتورة أو تفاصيل الدفع...' : 'Invoice number or notes...'}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-rose-500"
              />
            </div>

            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-xs transition-all active:scale-95 flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>{isAr ? 'حفظ وإضافة المصروف' : 'Save Expense'}</span>
            </button>
          </div>
        </form>

        {/* Right/End: Category Breakdown Summary */}
        <div className="lg:col-span-5 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white pb-3 border-b border-slate-100 dark:border-slate-800">
              {isAr ? 'توزيع المصاريف حسب التصنيف' : 'Expenses Breakdown by Category'}
            </h3>

            <div className="space-y-3 mt-4">
              {EXPENSE_CATEGORIES.map((cat) => {
                const val = expenseMetrics.byCategory[cat.id] || 0;
                const pct =
                  expenseMetrics.allTimeTotal > 0
                    ? Number(((val / expenseMetrics.allTimeTotal) * 100).toFixed(1))
                    : 0;
                const label = getExpenseCategoryLabel(cat.id, language);

                return (
                  <div key={cat.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                        <CategoryIcon category={cat.id} className="w-3.5 h-3.5 text-slate-500" />
                        <span>{label}</span>
                      </span>
                      <span className="font-mono tabular-nums text-slate-900 dark:text-white">
                        {val.toFixed(2)} {currencySymbol}{' '}
                        <span className="text-[10px] text-slate-400">({pct}%)</span>
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${cat.barClass} rounded-full transition-all duration-300`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>{isAr ? 'إجمالي الأرباح:' : 'Gross Profit:'}</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                +{totalGrossProfit.toFixed(2)} {currencySymbol}
              </span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>{isAr ? '(-) إجمالي المصاريف:' : '(-) Total Expenses:'}</span>
              <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                -{expenseMetrics.allTimeTotal.toFixed(2)} {currencySymbol}
              </span>
            </div>
            <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 flex justify-between font-black">
              <span className="text-slate-900 dark:text-white">
                {isAr ? '(=) صافي الربح:' : '(=) Net Profit:'}
              </span>
              <span
                className={`font-mono ${
                  netProfitAfterExpenses >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {netProfitAfterExpenses >= 0 ? '+' : ''}
                {netProfitAfterExpenses.toFixed(2)} {currencySymbol}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Expenses Ledger Table */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
              {isAr ? 'سجل وجدول المصاريف' : 'Expenses Register'}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isAr
                ? `عدد المصاريف المعروضة: ${filteredExpenses.length} · المجموع: ${filteredTotalAmount.toFixed(2)} ${currencySymbol}`
                : `Showing ${filteredExpenses.length} entries · Total: ${filteredTotalAmount.toFixed(2)} ${currencySymbol}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Period Filter */}
            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold">
              {(
                [
                  { id: 'all', label: isAr ? 'الكل' : 'All' },
                  { id: 'today', label: isAr ? 'اليوم' : 'Today' },
                  { id: 'month', label: isAr ? 'هذا الشهر' : 'This Month' }
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriodFilter(p.id)}
                  className={`px-3 py-1 rounded-lg transition-colors ${
                    periodFilter === p.id
                      ? 'bg-slate-900 dark:bg-rose-600 text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as 'all' | ExpenseCategory)}
                className="px-3 py-1.5 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white"
              >
                <option value="all">{isAr ? 'كل التصنيفات' : 'All Categories'}</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {getExpenseCategoryLabel(c.id, language)}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'بحث باسم المصروف...' : 'Search expense...'}
                className="ps-8 pe-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-rose-500"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
          <table className="w-full text-xs text-start border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4 font-bold text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                <th className="py-3 px-4 font-bold text-start">{isAr ? 'اسم المصروف' : 'Expense Name'}</th>
                <th className="py-3 px-4 font-bold text-start">{isAr ? 'التصنيف' : 'Category'}</th>
                <th className="py-3 px-4 font-bold text-start">{isAr ? 'ملاحظات / المسؤول' : 'Notes / By'}</th>
                <th className="py-3 px-4 font-bold text-end">{isAr ? 'المبلغ' : 'Amount'}</th>
                <th className="py-3 px-4 font-bold text-center">{isAr ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Wallet className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-semibold">
                      {expenses.length === 0
                        ? isAr
                          ? 'لا توجد مصاريف مسجلة بعد. استخدم النموذج أعلاه لإضافة أول مصروف.'
                          : 'No expenses recorded yet. Use the form above to add one.'
                        : isAr
                        ? 'لا توجد مصاريف مطابقة لمعايير البحث أو التصفية'
                        : 'No matching expenses found'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => {
                  const meta = getExpenseCategoryMeta(exp.category);
                  const catLabel = getExpenseCategoryLabel(exp.category, language);
                  const isConfirmingDelete = confirmDeleteId === exp.id;

                  return (
                    <tr
                      key={exp.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{exp.date}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        {exp.name}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border text-[11px] font-bold ${meta.badgeClass}`}
                        >
                          <CategoryIcon category={exp.category} className="w-3 h-3" />
                          <span>{catLabel}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                        <div>{exp.notes || '—'}</div>
                        {exp.recordedBy && (
                          <div className="text-[10px] text-slate-400">{exp.recordedBy}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-end font-mono font-black text-rose-600 dark:text-rose-400 tabular-nums whitespace-nowrap">
                        -{exp.amount.toFixed(2)} {currencySymbol}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingExpense(exp)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
                            title={isAr ? 'تعديل المصروف' : 'Edit Expense'}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          {isConfirmingDelete ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  deleteExpense(exp.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold"
                              >
                                {isAr ? 'تأكيد الحذف' : 'Delete'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-1.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold"
                              >
                                {isAr ? 'إلغاء' : 'Cancel'}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(exp.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                              title={isAr ? 'حذف المصروف' : 'Delete Expense'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredExpenses.length > 0 && (
              <tfoot className="bg-slate-50 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700 font-black">
                <tr>
                  <td colSpan={4} className="py-3 px-4 text-slate-900 dark:text-white">
                    {isAr ? 'إجمالي المصاريف المعروضة:' : 'Total Filtered Expenses:'}
                  </td>
                  <td className="py-3 px-4 text-end font-mono text-rose-700 dark:text-rose-400 tabular-nums">
                    -{filteredTotalAmount.toFixed(2)} {currencySymbol}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
        </>
      )}

      {/* Edit Expense Modal */}
      {editingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                {isAr ? 'تعديل بيانات المصروف' : 'Edit Expense'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingExpense(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? 'اسم المصروف *' : 'Name *'}
              </label>
              <input
                type="text"
                required
                value={editingExpense.name}
                onChange={(e) =>
                  setEditingExpense({ ...editingExpense, name: e.target.value })
                }
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? `المبلغ (${currencySymbol}) *` : 'Amount *'}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  value={editingExpense.amount}
                  onChange={(e) =>
                    setEditingExpense({
                      ...editingExpense,
                      amount: parseFloat(e.target.value) || 0
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'التاريخ *' : 'Date *'}
                </label>
                <input
                  type="date"
                  required
                  value={editingExpense.date}
                  onChange={(e) =>
                    setEditingExpense({ ...editingExpense, date: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? 'التصنيف *' : 'Category *'}
              </label>
              <select
                value={editingExpense.category}
                onChange={(e) =>
                  setEditingExpense({
                    ...editingExpense,
                    category: e.target.value as ExpenseCategory
                  })
                }
                className="w-full px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {getExpenseCategoryLabel(c.id, language)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? 'ملاحظات' : 'Notes'}
              </label>
              <input
                type="text"
                value={editingExpense.notes || ''}
                onChange={(e) =>
                  setEditingExpense({ ...editingExpense, notes: e.target.value })
                }
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setEditingExpense(null)}
                className="flex-1 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="flex-2 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{isAr ? 'حفظ التعديلات' : 'Save Changes'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
