import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Edit3,
  FileText,
  History,
  Mail,
  MessageSquare,
  Package,
  Phone,
  Plus,
  Printer,
  Save,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  User,
  X
} from 'lucide-react';
import { CreditTransaction, Customer, Order } from '../../types';

interface CustomerCreditPageProps {
  customer: Customer;
  allCustomers: Customer[];
  transactions: CreditTransaction[];
  customerOrders: Order[];
  currencySymbol: string;
  language: 'ar' | 'fr' | 'en';
  storeName: string;
  onBack: () => void;
  onSelectCustomer: (customerId: string) => void;
  onAddDebt: (amount: number, notes?: string) => void;
  onSettleDebt: (amount: number, notes?: string) => { success: boolean; error?: string };
  onUpdateCustomer: (updates: Partial<Customer>) => void;
  onDeleteCustomer: () => void;
  onOpenDebtInvoice: () => void;
  onOpenOrderReceipt: (order: Order) => void;
  onOpenWhatsAppReminder: () => void;
  onUpdateTransaction?: (
    txId: string,
    updates: { type?: 'debt' | 'payment'; amount?: number; date?: string; notes?: string; receiptNumber?: string }
  ) => { success: boolean; message?: string };
  onDeleteTransaction?: (txId: string) => { success: boolean; message?: string };
  onAddCustomEntry?: (entry: {
    type: 'debt' | 'payment';
    amount: number;
    date: string;
    notes?: string;
    receiptNumber?: string;
  }) => { success: boolean; message?: string };
  onRebuildLedger?: () => void;
}

const buildWhatsAppHref = (phone: string, text: string): string => {
  let cleanPhone = phone.replace(/[^\d]/g, '');
  if (cleanPhone.startsWith('0') && cleanPhone.length === 10) {
    cleanPhone = '212' + cleanPhone.slice(1);
  }
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
};

const formatRelativeDays = (isoDate: string | undefined, isAr: boolean): string => {
  if (!isoDate) return isAr ? 'لا توجد حركات بعد' : 'No activity yet';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const days = Math.max(0, Math.floor(diffMs / 86_400_000));
  if (days === 0) return isAr ? 'اليوم' : 'Today';
  if (days === 1) return isAr ? 'أمس' : 'Yesterday';
  if (days < 30) return isAr ? `منذ ${days} يوم` : `${days}d ago`;
  const months = Math.floor(days / 30);
  return isAr ? `منذ ${months} شهر` : `${months}mo ago`;
};

export const CustomerCreditPage: React.FC<CustomerCreditPageProps> = ({
  customer,
  allCustomers,
  transactions,
  customerOrders,
  currencySymbol,
  language,
  storeName,
  onBack,
  onSelectCustomer,
  onAddDebt,
  onSettleDebt,
  onUpdateCustomer,
  onDeleteCustomer,
  onOpenDebtInvoice,
  onOpenOrderReceipt,
  onOpenWhatsAppReminder,
  onUpdateTransaction,
  onDeleteTransaction,
  onAddCustomEntry,
  onRebuildLedger
}) => {
  const isAr = language === 'ar';

  // Quick Debt / Payment forms
  const [debtAmount, setDebtAmount] = useState<string>('');
  const [debtNotes, setDebtNotes] = useState<string>('');
  const [payAmount, setPayAmount] = useState<string>('');
  const [payNotes, setPayNotes] = useState<string>('');
  const [actionBanner, setActionBanner] = useState<{ type: 'debt' | 'payment' | 'edit'; text: string; lastPaid?: number } | null>(null);

  // Edit profile state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(customer.name);
  const [editPhone, setEditPhone] = useState(customer.phone);
  const [editEmail, setEditEmail] = useState(customer.email || '');
  const [editLimit, setEditLimit] = useState(customer.creditLimit ? String(customer.creditLimit) : '');
  const [editNotes, setEditNotes] = useState(customer.notes || '');

  // Delete confirmation bar
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Ledger row edit / delete / custom entry modals
  const [editingTx, setEditingTx] = useState<CreditTransaction | null>(null);
  const [txEditType, setTxEditType] = useState<'debt' | 'payment'>('debt');
  const [txEditAmount, setTxEditAmount] = useState<string>('');
  const [txEditDate, setTxEditDate] = useState<string>('');
  const [txEditNotes, setTxEditNotes] = useState<string>('');
  const [confirmDeleteTxId, setConfirmDeleteTxId] = useState<string | null>(null);
  const [showCustomEntryModal, setShowCustomEntryModal] = useState(false);
  const [customType, setCustomType] = useState<'debt' | 'payment'>('debt');
  const [customAmount, setCustomAmount] = useState<string>('');
  const [customDate, setCustomDate] = useState<string>(() => new Date().toISOString().slice(0, 16));
  const [customNotes, setCustomNotes] = useState<string>('');

  // History filtering & Activity Log tab
  const [txFilter, setTxFilter] = useState<'all' | 'debt' | 'payment' | 'invoices' | 'activity'>('all');
  const [txSearch, setTxSearch] = useState('');

  // Sync edit fields when switching customer via dropdown
  React.useEffect(() => {
    setEditName(customer.name);
    setEditPhone(customer.phone);
    setEditEmail(customer.email || '');
    setEditLimit(customer.creditLimit ? String(customer.creditLimit) : '');
    setEditNotes(customer.notes || '');
    setIsEditingProfile(false);
    setConfirmDelete(false);
    setDebtAmount('');
    setDebtNotes('');
    setPayAmount('');
    setPayNotes('');
    setActionBanner(null);
  }, [customer.id, customer.name, customer.phone, customer.email, customer.creditLimit, customer.notes]);

  const stats = useMemo(() => {
    const totalDebtTaken = transactions
      .filter((t) => t.type === 'debt')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalPayments = transactions
      .filter((t) => t.type === 'payment')
      .reduce((sum, t) => sum + t.amount, 0);
    const baseDebt = Math.max(totalDebtTaken, customer.balance + totalPayments);
    const repaymentRate = baseDebt > 0 ? Math.min(100, Math.round((totalPayments / baseDebt) * 100)) : 100;
    const latestTx = transactions[0];
    const limit = customer.creditLimit && customer.creditLimit > 0 ? customer.creditLimit : 0;
    const limitUsagePct = limit > 0 ? Math.round((customer.balance / limit) * 100) : 0;
    const isOverLimit = limit > 0 && customer.balance > limit;
    const isNearLimit = limit > 0 && !isOverLimit && limitUsagePct >= 80;
    const remainingLimit = limit > 0 ? Math.max(0, limit - customer.balance) : 0;

    return {
      totalDebtTaken,
      totalPayments,
      repaymentRate,
      latestTx,
      limit,
      limitUsagePct,
      isOverLimit,
      isNearLimit,
      remainingLimit
    };
  }, [transactions, customer.balance, customer.creditLimit]);

  const filteredTransactions = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (txFilter === 'debt' && tx.type !== 'debt') return false;
      if (txFilter === 'payment' && tx.type !== 'payment') return false;
      if (!q) return true;
      const inNotes = (tx.notes || '').toLowerCase().includes(q);
      const inReceipt = (tx.receiptNumber || '').toLowerCase().includes(q);
      const inActor = (tx.recordedBy || '').toLowerCase().includes(q);
      return inNotes || inReceipt || inActor;
    });
  }, [transactions, txFilter, txSearch]);

  const filteredOrders = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    return customerOrders.filter((ord) => {
      if (!q) return true;
      const inNum = ord.orderNumber.toLowerCase().includes(q);
      const inItems = ord.items.some((i) => i.productName.toLowerCase().includes(q));
      return inNum || inItems;
    });
  }, [customerOrders, txSearch]);

  // Customer Activity Log Metrics (سجل النشاط وسلوك الزبون)
  const activityBehavior = useMemo(() => {
    const completed = [...customerOrders]
      .filter((o) => o.status === 'completed')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const totalOrdersValue = completed.reduce((s, o) => s + (o.grandTotal || 0), 0);
    const directPaid = completed
      .filter((o) => o.paymentMethod !== 'credit')
      .reduce((s, o) => s + (o.grandTotal || 0), 0);
    const totalPaidOverall = directPaid + stats.totalPayments;
    const avgTicket = completed.length > 0 ? totalOrdersValue / completed.length : 0;

    let avgDaysBetweenVisits: number | null = null;
    if (completed.length >= 2) {
      let totalGapMs = 0;
      for (let i = 1; i < completed.length; i++) {
        totalGapMs +=
          new Date(completed[i].date).getTime() - new Date(completed[i - 1].date).getTime();
      }
      avgDaysBetweenVisits = Number(
        (totalGapMs / (completed.length - 1) / 86_400_000).toFixed(1)
      );
    }

    const itemCounts = new Map<string, { name: string; qty: number; spent: number }>();
    const paymentCounts = new Map<string, number>();
    completed.forEach((o) => {
      paymentCounts.set(o.paymentMethod, (paymentCounts.get(o.paymentMethod) || 0) + 1);
      o.items.forEach((it) => {
        const prev = itemCounts.get(it.productId) || { name: it.productName, qty: 0, spent: 0 };
        prev.qty += it.quantity;
        prev.spent += it.total;
        itemCounts.set(it.productId, prev);
      });
    });

    const favoriteItems = Array.from(itemCounts.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    let preferredMethod = '-';
    let topMethodCount = 0;
    paymentCounts.forEach((cnt, m) => {
      if (cnt > topMethodCount) {
        topMethodCount = cnt;
        preferredMethod = m;
      }
    });

    return {
      completedDesc: [...completed].reverse(),
      totalOrdersValue,
      totalPaidOverall,
      avgTicket,
      avgDaysBetweenVisits,
      favoriteItems,
      preferredMethod
    };
  }, [customerOrders, stats.totalPayments]);

  const handleQuickDebtSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(debtAmount);
    if (!val || val <= 0) return;
    onAddDebt(val, debtNotes.trim() || undefined);
    setActionBanner({
      type: 'debt',
      text: isAr
        ? `تم تقييد دين جديد بقيمة +${val.toFixed(2)} ${currencySymbol} في صفحة ${customer.name}`
        : `Recorded +${val.toFixed(2)} ${currencySymbol} new credit debt`
    });
    setDebtAmount('');
    setDebtNotes('');
  };

  const handleQuickPaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = parseFloat(payAmount);
    if (!raw || raw <= 0 || customer.balance <= 0) return;
    const settled = Math.min(raw, customer.balance);
    const res = onSettleDebt(settled, payNotes.trim() || undefined);
    if (res.success) {
      const nextBal = Math.max(0, Number((customer.balance - settled).toFixed(2)));
      setActionBanner({
        type: 'payment',
        lastPaid: settled,
        text: isAr
          ? `تم تسجيل خلاص بقيمة ${settled.toFixed(2)} ${currencySymbol} — الباقي في الذمة: ${nextBal.toFixed(2)} ${currencySymbol}`
          : `Recorded payment of ${settled.toFixed(2)} ${currencySymbol} — Remaining: ${nextBal.toFixed(2)} ${currencySymbol}`
      });
      setPayAmount('');
      setPayNotes('');
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !editPhone.trim()) return;
    const parsedLimit = parseFloat(editLimit);
    onUpdateCustomer({
      name: editName.trim(),
      phone: editPhone.trim(),
      email: editEmail.trim() || undefined,
      creditLimit: parsedLimit > 0 ? parsedLimit : undefined,
      notes: editNotes.trim() || undefined
    });
    setIsEditingProfile(false);
    setActionBanner({
      type: 'edit',
      text: isAr ? 'تم تحديث بيانات الزبون وسقف الكريدي بنجاح' : 'Customer details updated'
    });
  };

  const paymentReceiptMsg = useMemo(() => {
    const paid = actionBanner?.lastPaid;
    if (paid) {
      return isAr
        ? `السلام عليكم ${customer.name}،\nوصل خلاص من "${storeName}":\nتم تسديد مبلغ: ${paid.toFixed(2)} ${currencySymbol}.\nالرصيد المتبقي بذمتكم حالياً: ${customer.balance.toFixed(2)} ${currencySymbol}.\nشكراً جزيلاً على ثقتكم!`
        : `Bonjour ${customer.name},\nReçu de paiement de "${storeName}": ${paid.toFixed(2)} ${currencySymbol} payé. Solde restant: ${customer.balance.toFixed(2)} ${currencySymbol}. Merci!`;
    }
    return isAr
      ? `السلام عليكم ${customer.name}،\nكشف حسابكم من "${storeName}":\nالرصيد الحالي في كناش الكريدي: ${customer.balance.toFixed(2)} ${currencySymbol}.\nمرحباً بكم دائماً!`
      : `Bonjour ${customer.name}, votre solde actuel chez "${storeName}" est de ${customer.balance.toFixed(2)} ${currencySymbol}.`;
  }, [actionBanner, customer.name, customer.balance, storeName, currencySymbol, isAr]);

  const initials = customer.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 space-y-4">
      {/* Top Bar: Back + Customer Switcher + Print / WA / Delete */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[38px] px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            {isAr ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
            <span>{isAr ? 'الرجوع إلى كناش الكريدي' : 'Back to Credit Ledger'}</span>
          </button>

          {/* Quick Jump to another Customer Page */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 min-h-[38px]">
            <User className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 hidden sm:inline">
              {isAr ? 'تبديل الزبون:' : 'Switch:'}
            </span>
            <select
              value={customer.id}
              onChange={(e) => onSelectCustomer(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden max-w-[200px]"
            >
              {allCustomers.map((c) => (
                <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900">
                  {c.name} ({c.balance.toFixed(0)} {currencySymbol})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsEditingProfile((v) => !v)}
            className={`min-h-[38px] px-3 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
              isEditingProfile
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{isAr ? 'تعديل البيانات والسقف' : 'Edit Profile'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenDebtInvoice}
            className="min-h-[38px] px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
            <span>{isAr ? 'طبع فاتورة الدين PDF' : 'Print Statement'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenWhatsAppReminder}
            className="min-h-[38px] px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-2xs"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isAr ? 'تذكير واتساب' : 'WhatsApp'}</span>
          </button>

          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="min-h-[38px] p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
              title={isAr ? 'حذف صفحة الزبون' : 'Delete customer'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800">
              <span className="text-xs font-bold text-rose-700 dark:text-rose-300">
                {isAr ? 'تأكيد الحذف؟' : 'Delete?'}
              </span>
              <button
                type="button"
                onClick={onDeleteCustomer}
                className="px-2.5 py-0.5 rounded-lg bg-rose-600 text-white text-xs font-bold"
              >
                {isAr ? 'نعم' : 'Yes'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-2.5 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold"
              >
                {isAr ? 'لا' : 'No'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {actionBanner && (
        <div
          className={`rounded-2xl px-4 py-3 border flex flex-wrap items-center justify-between gap-3 ${
            actionBanner.type === 'debt'
              ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{actionBanner.text}</span>
          </div>
          <div className="flex items-center gap-2">
            {actionBanner.type === 'payment' && (
              <a
                href={buildWhatsAppHref(customer.phone, paymentReceiptMsg)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{isAr ? 'إرسال وصل الخلاص واتساب' : 'Send WA Receipt'}</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => setActionBanner(null)}
              className="p-1 opacity-70 hover:opacity-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Customer Identity Hero Card + Credit Limit Meter */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center font-extrabold text-lg shrink-0 ${
                stats.isOverLimit
                  ? 'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                  : customer.balance > 0
                  ? 'bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                  : 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              }`}
            >
              {initials || <User className="w-6 h-6" />}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white leading-snug">
                  {customer.name}
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold">
                  {customer.tier}
                </span>
                {stats.isOverLimit ? (
                  <span className="px-2.5 py-0.5 rounded-lg bg-rose-600 text-white text-xs font-bold flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>{isAr ? 'تجاوز السقف المحدد' : 'Over Credit Limit'}</span>
                  </span>
                ) : stats.isNearLimit ? (
                  <span className="px-2.5 py-0.5 rounded-lg bg-amber-600 text-white text-xs font-bold">
                    {isAr ? 'قريب من السقف' : 'Near Limit'}
                  </span>
                ) : customer.balance === 0 ? (
                  <span className="px-2.5 py-0.5 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{isAr ? 'حساب خالص' : 'Settled'}</span>
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-xs text-slate-600 dark:text-slate-300">
                <a
                  href={`tel:${customer.phone}`}
                  className="inline-flex items-center gap-1.5 font-mono tabular-nums font-semibold hover:text-emerald-600 dark:hover:text-emerald-400"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{customer.phone}</span>
                </a>
                {customer.email && (
                  <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                    <Mail className="w-3.5 h-3.5" />
                    <span>{customer.email}</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {isAr ? 'آخر حركة:' : 'Last activity:'}{' '}
                    <strong className="text-slate-800 dark:text-slate-100">
                      {formatRelativeDays(stats.latestTx?.date, isAr)}
                    </strong>
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {isAr ? 'زبون منذ:' : 'Since:'}{' '}
                    {new Date(customer.createdAt).toLocaleDateString(isAr ? 'ar-MA' : 'en-US')}
                  </span>
                </span>
              </div>

              {customer.notes && (
                <p className="text-xs text-slate-700 dark:text-slate-300 mt-2 bg-slate-50 dark:bg-slate-800/70 px-3 py-1.5 rounded-xl inline-block leading-relaxed">
                  {customer.notes}
                </p>
              )}
            </div>
          </div>

          {/* Highlighted Live Balance Box */}
          <div
            className={`px-5 py-3.5 rounded-2xl border min-w-[215px] text-end ${
              stats.isOverLimit
                ? 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
                : customer.balance > 0
                ? 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
                : 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
            }`}
          >
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              {isAr ? 'الدين الحالي المعلق بذمة الزبون' : 'Current Credit Balance'}
            </div>
            <div
              className={`text-2xl sm:text-3xl font-extrabold tabular-nums mt-1 ${
                stats.isOverLimit
                  ? 'text-rose-600 dark:text-rose-400'
                  : customer.balance > 0
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {customer.balance.toFixed(2)}{' '}
              <span className="text-sm font-bold">{currencySymbol}</span>
            </div>
          </div>
        </div>

        {/* Credit Limit Utilization Meter */}
        <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
              <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="tabular-nums">
                {stats.limit > 0
                  ? isAr
                    ? `سقف الكريدي المسموح: ${stats.limit.toFixed(2)} ${currencySymbol}`
                    : `Credit Limit: ${stats.limit.toFixed(2)} ${currencySymbol}`
                  : isAr
                  ? 'لم يتم تحديد سقف كريدي لهذا الزبون بعد'
                  : 'No credit limit configured'}
              </span>
            </div>

            {stats.limit > 0 ? (
              <div className="flex items-center gap-3 tabular-nums text-xs">
                <span
                  className={`font-bold ${
                    stats.isOverLimit
                      ? 'text-rose-600 dark:text-rose-400'
                      : stats.isNearLimit
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {isAr ? `الاستهلاك: ${stats.limitUsagePct}%` : `Used: ${stats.limitUsagePct}%`}
                </span>
                <span className="text-slate-600 dark:text-slate-300">
                  {stats.isOverLimit
                    ? isAr
                      ? `تجاوز بـ ${(customer.balance - stats.limit).toFixed(2)} ${currencySymbol}`
                      : `Over by ${(customer.balance - stats.limit).toFixed(2)} ${currencySymbol}`
                    : isAr
                    ? `المتاح للكريدي: ${stats.remainingLimit.toFixed(2)} ${currencySymbol}`
                    : `Available: ${stats.remainingLimit.toFixed(2)} ${currencySymbol}`}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingProfile(true)}
                className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                {isAr ? '+ تحديد سقف الكريدي الآن' : '+ Set Limit'}
              </button>
            )}
          </div>

          {stats.limit > 0 && (
            <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  stats.isOverLimit
                    ? 'bg-rose-600'
                    : stats.isNearLimit
                    ? 'bg-amber-600'
                    : 'bg-emerald-600'
                }`}
                style={{ width: `${Math.min(100, stats.limitUsagePct)}%` }}
              />
            </div>
          )}
        </div>

        {/* Inline Edit Form (Collapsible) */}
        {isEditingProfile && (
          <form
            onSubmit={handleSaveProfile}
            className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-emerald-300 dark:border-emerald-800 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-900 dark:text-white">
                {isAr ? 'تحديث معلومات الزبون وسقف الكريدي' : 'Update Customer Info & Limit'}
              </h4>
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  {isAr ? 'الاسم الكامل' : 'Name'} *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  {isAr ? 'رقم الهاتف' : 'Phone'} *
                </label>
                <input
                  type="tel"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  {isAr ? `سقف الكريدي (${currencySymbol})` : `Credit Limit (${currencySymbol})`}
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={editLimit}
                  onChange={(e) => setEditLimit(e.target.value)}
                  placeholder={isAr ? 'بدون سقف' : 'No limit'}
                  className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  {isAr ? 'البريد الإلكتروني' : 'Email'}
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder={isAr ? 'ملاحظات أو عنوان الزبون بالحي...' : 'Notes / address...'}
                className="flex-1 min-w-[220px] px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isAr ? 'حفظ التعديلات' : 'Save Changes'}</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 4 Customer KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span>{isAr ? 'مجموع الكريدي المأخوذ' : 'Total Credit Taken'}</span>
            <ArrowUpRight className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-xl font-extrabold tabular-nums text-amber-700 dark:text-amber-400 mt-1.5">
            {stats.totalDebtTaken.toFixed(2)} <span className="text-xs font-bold">{currencySymbol}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isAr
              ? `${transactions.filter((t) => t.type === 'debt').length} عملية تقييد دين`
              : `${transactions.filter((t) => t.type === 'debt').length} debt entries`}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span>{isAr ? 'مجموع الدفعات المسددة' : 'Total Payments Made'}</span>
            <ArrowDownRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400 mt-1.5">
            {stats.totalPayments.toFixed(2)} <span className="text-xs font-bold">{currencySymbol}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isAr ? `نسبة الالتزام بالسداد: ${stats.repaymentRate}%` : `Repayment rate: ${stats.repaymentRate}%`}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span>{isAr ? 'فواتير الكاشير والمشتريات' : 'Total Purchases'}</span>
            <Package className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-xl font-extrabold tabular-nums text-slate-900 dark:text-white mt-1.5">
            {customer.totalSpent.toFixed(2)} <span className="text-xs font-bold">{currencySymbol}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isAr
              ? `${customer.ordersCount} فاتورة مسجلة (${customerOrders.length} محفوظة)`
              : `${customer.ordersCount} orders (${customerOrders.length} stored)`}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span>{isAr ? 'نقاط الولاء المكتسبة' : 'Loyalty Points'}</span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-extrabold tabular-nums text-slate-900 dark:text-white mt-1.5">
            {customer.points} <span className="text-xs font-bold text-slate-500">pts</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isAr ? `تصنيف الزبون: ${customer.tier}` : `Tier: ${customer.tier}`}
          </div>
        </div>
      </div>

      {/* Inline Fast Action Dock: Quick Record Debt (Amber) & Quick Record Payment (Emerald) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Panel 1: Quick Record Debt */}
        <form
          onSubmit={handleQuickDebtSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center">
                <Plus className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isAr ? 'تقييد كريدي جديد مباشرة' : 'Quick Record New Debt'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isAr ? 'يضاف فوراً إلى كناش الزبون وحركات الكريدي' : 'Adds immediately to customer balance'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {[20, 50, 100, 200].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDebtAmount(String(preset))}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/60 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 transition-colors"
                >
                  +{preset}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-1">
              <input
                type="number"
                min="0.01"
                step="any"
                required
                value={debtAmount}
                onChange={(e) => setDebtAmount(e.target.value)}
                placeholder={isAr ? `المبلغ (${currencySymbol})` : `Amount (${currencySymbol})`}
                className="w-full px-3.5 py-2.5 text-sm font-extrabold tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-amber-700 dark:text-amber-400 focus:outline-hidden focus:border-amber-500"
              />
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <input
                type="text"
                value={debtNotes}
                onChange={(e) => setDebtNotes(e.target.value)}
                placeholder={isAr ? 'تفاصيل السلع (مثلاً: خبز + حليب + زيت...)' : 'Notes (e.g. groceries...)'}
                className="flex-1 px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-amber-500"
              />
              <button
                type="submit"
                disabled={!debtAmount || parseFloat(debtAmount) <= 0}
                className="min-h-[40px] px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-45 text-white text-xs font-bold shrink-0 transition-all active:scale-95"
              >
                {isAr ? '+ تقييد' : '+ Add'}
              </button>
            </div>
          </div>
        </form>

        {/* Panel 2: Quick Record Payment / Settlement */}
        <form
          onSubmit={handleQuickPaySubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <DollarSign className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isAr ? 'تسجيل دفع / خلاص الدين' : 'Quick Record Payment'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {customer.balance > 0
                    ? isAr
                      ? `المتبقي حالياً: ${customer.balance.toFixed(2)} ${currencySymbol}`
                      : `Due: ${customer.balance.toFixed(2)} ${currencySymbol}`
                    : isAr
                    ? 'الحساب خالص حالياً (0.00)'
                    : 'Balance is currently settled (0.00)'}
                </p>
              </div>
            </div>

            {customer.balance > 0 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPayAmount(customer.balance.toFixed(2))}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 hover:bg-emerald-100 text-xs font-bold text-emerald-700 dark:text-emerald-300 transition-colors"
                >
                  {isAr ? 'خلاص كلي' : 'Full'}
                </button>
                <button
                  type="button"
                  onClick={() => setPayAmount((customer.balance / 2).toFixed(2))}
                  className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 text-xs font-mono font-bold text-slate-700 dark:text-slate-200"
                >
                  50%
                </button>
                {[100, 200]
                  .filter((p) => p < customer.balance)
                  .map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setPayAmount(String(preset))}
                      className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-mono font-bold text-slate-700 dark:text-slate-200"
                    >
                      {preset}
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-1">
              <input
                type="number"
                min="0.01"
                step="any"
                max={customer.balance > 0 ? customer.balance : undefined}
                disabled={customer.balance <= 0}
                required
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder={isAr ? `الدفعة (${currencySymbol})` : `Payment (${currencySymbol})`}
                className="w-full px-3.5 py-2.5 text-sm font-extrabold tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-emerald-700 dark:text-emerald-400 focus:outline-hidden focus:border-emerald-500 disabled:opacity-50"
              />
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <input
                type="text"
                disabled={customer.balance <= 0}
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                placeholder={isAr ? 'ملاحظة الدفع (مثلاً: دفع نقدي في الصباح...)' : 'Payment notes...'}
                className="flex-1 px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={customer.balance <= 0 || !payAmount || parseFloat(payAmount) <= 0}
                className="min-h-[40px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 text-white text-xs font-bold shrink-0 flex items-center gap-1 transition-all active:scale-95"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>{isAr ? 'تسجيل الخلاص' : 'Record Pay'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Full Customer Running-Balance Ledger & Itemized Invoices */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                {isAr ? 'سجل الحركات والفواتير المفصلة للزبون' : 'Customer Credit History & Invoices'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {isAr
                  ? `${transactions.length} حركة كناش · ${customerOrders.length} فاتورة مشتريات`
                  : `${transactions.length} ledger entries · ${customerOrders.length} itemized orders`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                placeholder={isAr ? 'بحث في الملاحظات أو رقم الفاتورة...' : 'Search notes or #invoice...'}
                className="ps-8 pe-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white w-52 focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            {/* Ledger Management Actions */}
            {onAddCustomEntry && (
              <button
                type="button"
                onClick={() => {
                  setCustomType('debt');
                  setCustomAmount('');
                  setCustomDate(new Date().toISOString().slice(0, 16));
                  setCustomNotes('');
                  setShowCustomEntryModal(true);
                }}
                className="min-h-[34px] px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1 shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'حركة مخصصة' : 'Custom Entry'}</span>
              </button>
            )}
            {onRebuildLedger && (
              <button
                type="button"
                onClick={() => {
                  onRebuildLedger();
                  setActionBanner({
                    type: 'edit',
                    text: isAr
                      ? 'تمت إعادة ترتيب وبناء أرصدة الكناش زمنياً بدقة ✓'
                      : 'Ledger balances rebuilt chronologically ✓'
                  });
                }}
                className="min-h-[34px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs font-semibold text-slate-700 dark:text-slate-200"
                title={isAr ? 'إعادة حساب الترتيب الزمني للأرصدة' : 'Rebuild Running Balances'}
              >
                {isAr ? 'إعادة بناء الكناش' : 'Rebuild Ledger'}
              </button>
            )}

            {/* Filter Segmented Tabs */}
            <div className="flex flex-wrap items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              {[
                { id: 'all' as const, label: isAr ? `الكل (${transactions.length})` : `All (${transactions.length})` },
                {
                  id: 'debt' as const,
                  label: isAr
                    ? `تقييد دين (${transactions.filter((t) => t.type === 'debt').length})`
                    : `Debts (${transactions.filter((t) => t.type === 'debt').length})`
                },
                {
                  id: 'payment' as const,
                  label: isAr
                    ? `دفعات الخلاص (${transactions.filter((t) => t.type === 'payment').length})`
                    : `Payments (${transactions.filter((t) => t.type === 'payment').length})`
                },
                {
                  id: 'invoices' as const,
                  label: isAr
                    ? `فواتير السلع (${customerOrders.length})`
                    : `Invoices (${customerOrders.length})`
                },
                {
                  id: 'activity' as const,
                  label: isAr ? 'سجل النشاط' : 'Activity Log'
                }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTxFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    txFilter === tab.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Activity Log Tab vs Itemized Invoices Tab vs Ledger Table */}
        {txFilter === 'activity' ? (
          <div className="space-y-4">
            {/* Behavior Summary KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70">
                <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                  {isAr ? 'إجمالي المبالغ المدفوعة فعلياً' : 'Total Amount Paid'}
                </div>
                <div className="text-xl font-black text-emerald-700 dark:text-emerald-400 font-mono tabular-nums mt-1">
                  {activityBehavior.totalPaidOverall.toFixed(2)} {currencySymbol}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {isAr
                    ? `مشتريات نقدية + دفعات الكريدي (${stats.totalPayments.toFixed(0)} ${currencySymbol})`
                    : `Direct sales + ${stats.totalPayments.toFixed(0)} credit settled`}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/70">
                <div className="text-[11px] font-bold text-blue-700 dark:text-blue-300">
                  {isAr ? 'متوسط توقيت الزيارات' : 'Avg. Visit Interval'}
                </div>
                <div className="text-xl font-black text-blue-700 dark:text-blue-400 font-mono tabular-nums mt-1">
                  {activityBehavior.avgDaysBetweenVisits !== null
                    ? isAr
                      ? `كل ${activityBehavior.avgDaysBetweenVisits} يوم`
                      : `Every ${activityBehavior.avgDaysBetweenVisits}d`
                    : isAr
                    ? 'زيارة واحدة'
                    : 'Single visit'}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {isAr
                    ? `بناءً على ${activityBehavior.completedDesc.length} فواتير شراء مكتملة`
                    : `Based on ${activityBehavior.completedDesc.length} completed orders`}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70">
                <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                  {isAr ? 'متوسط قيمة سلة الشراء' : 'Average Basket Size'}
                </div>
                <div className="text-xl font-black text-amber-700 dark:text-amber-400 font-mono tabular-nums mt-1">
                  {activityBehavior.avgTicket.toFixed(2)} {currencySymbol}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {isAr ? `الدفع المفضل: ${activityBehavior.preferredMethod}` : `Preferred: ${activityBehavior.preferredMethod}`}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  {isAr ? 'السلع المفضلة للزبون' : 'Top Purchased Items'}
                </div>
                {activityBehavior.favoriteItems.length === 0 ? (
                  <div className="text-xs text-slate-400 mt-2">{isAr ? 'لا توجد بيانات' : 'No data yet'}</div>
                ) : (
                  <div className="mt-1.5 space-y-1">
                    {activityBehavior.favoriteItems.slice(0, 3).map((it, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[11px]">
                        <span className="truncate font-semibold text-slate-800 dark:text-slate-200">
                          {it.name}
                        </span>
                        <span className="font-mono font-bold text-emerald-600 shrink-0">×{it.qty}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Historical Purchases Timeline */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-xs font-black text-slate-800 dark:text-white flex items-center justify-between">
                <span>{isAr ? 'سجل المشتريات التاريخية للزبون' : 'Historical Purchases Timeline'}</span>
                <span className="font-mono text-[11px] text-slate-500">
                  {activityBehavior.completedDesc.length} {isAr ? 'عملية شراء' : 'purchases'}
                </span>
              </div>
              {activityBehavior.completedDesc.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  {isAr ? 'لا توجد مشتريات مسجلة لهذا الزبون حتى الآن' : 'No historical purchases yet'}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activityBehavior.completedDesc.map((ord) => (
                    <div
                      key={ord.id}
                      className="p-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs text-blue-600 dark:text-blue-400">
                            {ord.orderNumber}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-300">
                            {ord.paymentMethod}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {new Date(ord.date).toLocaleString(isAr ? 'ar-MA' : 'fr-FR', {
                              dateStyle: 'medium',
                              timeStyle: 'short'
                            })}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 truncate max-w-xl">
                          {ord.items.map((i) => `${i.productName} (×${i.quantity})`).join(' · ')}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-black text-sm text-slate-900 dark:text-white tabular-nums">
                          {ord.grandTotal.toFixed(2)} {currencySymbol}
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenOrderReceipt(ord)}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-[11px] font-bold hover:bg-blue-100"
                        >
                          {isAr ? 'عرض' : 'View'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : txFilter === 'invoices' ? (
          filteredOrders.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              {isAr ? 'لا توجد فواتير مبيعات مفصلة مرتبطة بهذا الزبون بعد' : 'No itemized invoices found for this customer'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-xs text-blue-600 dark:text-blue-400">
                          {ord.orderNumber}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black ${
                            ord.paymentMethod === 'credit'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}
                        >
                          {ord.paymentMethod === 'credit' ? (isAr ? 'كريدي' : 'Credit') : ord.paymentMethod}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {new Date(ord.date).toLocaleString(isAr ? 'ar-MA' : 'en-US', {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        })}
                      </div>
                    </div>

                    <div className="text-end font-mono tabular-nums">
                      <div className="text-sm font-black text-slate-900 dark:text-white">
                        {ord.grandTotal.toFixed(2)} {currencySymbol}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {ord.items.length} {isAr ? 'منتجات' : 'items'}
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1 bg-white dark:bg-slate-900 rounded-xl p-2.5 border border-slate-200/70 dark:border-slate-800">
                    {ord.items.slice(0, 4).map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {item.productName} × {item.quantity}
                        </span>
                        <span className="font-mono font-bold shrink-0">
                          {item.total.toFixed(2)} {currencySymbol}
                        </span>
                      </div>
                    ))}
                    {ord.items.length > 4 && (
                      <div className="text-[10px] text-slate-400 pt-0.5">
                        +{ord.items.length - 4} {isAr ? 'سلع أخرى...' : 'more items...'}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => onOpenOrderReceipt(ord)}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>{isAr ? 'فتح الفاتورة المفصلة' : 'View Receipt'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : filteredTransactions.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
            <BookOpen className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
            <p className="font-bold text-slate-600 dark:text-slate-300">
              {isAr ? 'لا توجد حركات كريدي مطابقة للعرض' : 'No matching credit transactions'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-3.5 text-start">{isAr ? 'التاريخ والوقت' : 'Date & Time'}</th>
                  <th className="py-3 px-3.5 text-start">{isAr ? 'العملية' : 'Type'}</th>
                  <th className="py-3 px-3.5 text-start">{isAr ? 'البيان / السلع والملاحظات' : 'Details & Invoice'}</th>
                  <th className="py-3 px-3.5 text-start">{isAr ? 'الكاشير' : 'By'}</th>
                  <th className="py-3 px-3.5 text-end">{isAr ? 'المبلغ' : 'Amount'}</th>
                  <th className="py-3 px-3.5 text-end">{isAr ? 'الرصيد قبل ← بعد' : 'Balance Impact'}</th>
                  {(onUpdateTransaction || onDeleteTransaction) && (
                    <th className="py-3 px-3 text-center">{isAr ? 'إدارة' : 'Edit'}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTransactions.map((tx) => {
                  const isDebt = tx.type === 'debt';
                  const linkedOrder = tx.receiptNumber
                    ? customerOrders.find((o) => o.orderNumber === tx.receiptNumber)
                    : undefined;
                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-3.5 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {new Date(tx.date).toLocaleString(isAr ? 'ar-MA' : 'en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="py-3.5 px-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${
                            isDebt
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                          }`}
                        >
                          {isDebt ? (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5" />
                          )}
                          <span>{isDebt ? (isAr ? 'تقييد دين' : 'Debt') : (isAr ? 'خلاص / دفع' : 'Payment')}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-3.5 max-w-xs">
                        <div className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-slate-100 leading-relaxed">
                          {tx.notes || (isDebt ? (isAr ? 'أخذ سلع على الحساب' : 'Credit purchase') : (isAr ? 'دفعة نقدية' : 'Cash payment'))}
                        </div>
                        {linkedOrder && (
                          <button
                            type="button"
                            onClick={() => onOpenOrderReceipt(linkedOrder)}
                            className="mt-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>
                              {linkedOrder.orderNumber} ({linkedOrder.items.length}{' '}
                              {isAr ? 'سلع' : 'items'})
                            </span>
                          </button>
                        )}
                      </td>
                      <td className="py-3.5 px-3.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {tx.recordedBy || (isAr ? 'الكاشير' : 'Cashier')}
                      </td>
                      <td
                        className={`py-3.5 px-3.5 text-end font-extrabold tabular-nums whitespace-nowrap ${
                          isDebt ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {isDebt ? '+' : '-'}
                        {tx.amount.toFixed(2)} {currencySymbol}
                      </td>
                      <td className="py-3.5 px-3.5 text-end font-mono tabular-nums whitespace-nowrap text-xs">
                        <span className="text-slate-500 dark:text-slate-400">{tx.previousBalance.toFixed(2)}</span>
                        <span className="mx-1.5 text-slate-400">{isAr ? '←' : '→'}</span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {tx.newBalance.toFixed(2)} {currencySymbol}
                        </span>
                      </td>
                      {(onUpdateTransaction || onDeleteTransaction) && (
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {onUpdateTransaction && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTx(tx);
                                  setTxEditType(tx.type);
                                  setTxEditAmount(String(tx.amount));
                                  setTxEditDate(tx.date ? tx.date.slice(0, 16) : new Date().toISOString().slice(0, 16));
                                  setTxEditNotes(tx.notes || '');
                                }}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
                                title={isAr ? 'تعديل الحركة' : 'Edit Entry'}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {onDeleteTransaction && (
                              confirmDeleteTxId === tx.id ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteTransaction(tx.id);
                                    setConfirmDeleteTxId(null);
                                    setActionBanner({
                                      type: 'edit',
                                      text: isAr ? 'تم حذف الحركة وإعادة حساب الرصيد' : 'Deleted entry & rebuilt balance'
                                    });
                                  }}
                                  className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-black"
                                >
                                  {isAr ? 'تأكيد' : 'Confirm'}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteTxId(tx.id)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                                  title={isAr ? 'حذف الحركة' : 'Delete Entry'}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Existing Credit Transaction Modal */}
      {editingTx && onUpdateTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const amt = parseFloat(txEditAmount);
              if (!amt || amt <= 0) return;
              onUpdateTransaction(editingTx.id, {
                type: txEditType,
                amount: amt,
                date: txEditDate ? new Date(txEditDate).toISOString() : editingTx.date,
                notes: txEditNotes.trim() || undefined
              });
              setEditingTx(null);
              setActionBanner({
                type: 'edit',
                text: isAr ? 'تم تعديل الحركة وإعادة حساب الأرصدة بنجاح' : 'Updated entry & rebuilt balances'
              });
            }}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h4 className="font-black text-slate-900 dark:text-white text-sm">
                {isAr ? 'تعديل حركة كناش الكريدي' : 'Edit Ledger Transaction'}
              </h4>
              <button type="button" onClick={() => setEditingTx(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['debt', 'payment'] as const).map((tp) => (
                <button
                  key={tp}
                  type="button"
                  onClick={() => setTxEditType(tp)}
                  className={`py-2 rounded-xl text-xs font-black border ${
                    txEditType === tp
                      ? tp === 'debt'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600'
                  }`}
                >
                  {tp === 'debt' ? (isAr ? 'تقييد دين (+)' : 'Debt (+)') : isAr ? 'خلاص (-)' : 'Payment (-)'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  {isAr ? `المبلغ (${currencySymbol})` : 'Amount'}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  value={txEditAmount}
                  onChange={(e) => setTxEditAmount(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  {isAr ? 'التاريخ والوقت' : 'Date & Time'}
                </label>
                <input
                  type="datetime-local"
                  required
                  value={txEditDate}
                  onChange={(e) => setTxEditDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                {isAr ? 'البيان / الملاحظات' : 'Notes'}
              </label>
              <input
                type="text"
                value={txEditNotes}
                onChange={(e) => setTxEditNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isAr ? 'حفظ وإعادة الحساب' : 'Save & Rebuild'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Custom Dated Entry Modal */}
      {showCustomEntryModal && onAddCustomEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const amt = parseFloat(customAmount);
              if (!amt || amt <= 0) return;
              onAddCustomEntry({
                type: customType,
                amount: amt,
                date: customDate ? new Date(customDate).toISOString() : new Date().toISOString(),
                notes: customNotes.trim() || undefined
              });
              setShowCustomEntryModal(false);
              setActionBanner({
                type: customType,
                text: isAr
                  ? 'تمت إضافة الحركة المخصصة وترتيب الكناش زمنياً'
                  : 'Added custom entry & sorted chronologically'
              });
            }}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h4 className="font-black text-slate-900 dark:text-white text-sm">
                {isAr ? 'بناء حركة كناش بتاريخ مخصص' : 'Add Custom Dated Ledger Entry'}
              </h4>
              <button type="button" onClick={() => setShowCustomEntryModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['debt', 'payment'] as const).map((tp) => (
                <button
                  key={tp}
                  type="button"
                  onClick={() => setCustomType(tp)}
                  className={`py-2 rounded-xl text-xs font-black border ${
                    customType === tp
                      ? tp === 'debt'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600'
                  }`}
                >
                  {tp === 'debt' ? (isAr ? 'دين قديم / جديد (+)' : 'Debt (+)') : isAr ? 'دفعة خلاص (-)' : 'Payment (-)'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  {isAr ? `المبلغ (${currencySymbol})` : 'Amount'}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  {isAr ? 'التاريخ المخصص' : 'Custom Date'}
                </label>
                <input
                  type="datetime-local"
                  required
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                {isAr ? 'التفاصيل والملاحظة' : 'Details / Notes'}
              </label>
              <input
                type="text"
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                placeholder={isAr ? 'مثال: رصيد مرحّل من الدفتر الورقي' : 'e.g., Prior paper ledger balance'}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCustomEntryModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة وإعادة بناء الرصيد' : 'Add & Rebuild'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Customer Loyalty Quick Summary Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-slate-100/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="tabular-nums">
            {isAr
              ? `معدل الالتزام العام للزبون "${customer.name}": ${stats.repaymentRate}%`
              : `Overall repayment health: ${stats.repaymentRate}%`}
          </span>
        </div>
        <span>
          {isAr
            ? `متصل مباشرة بنقطة البيع وفواتير الكاشير (${storeName})`
            : `Synced live with POS & Receipts (${storeName})`}
        </span>
      </div>
    </div>
  );
};
