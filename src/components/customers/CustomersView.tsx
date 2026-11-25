import React, { useState, useMemo } from 'react';
import { usePos } from '../../context/PosContext';
import { getT } from '../../utils/translations';
import { Customer, Order } from '../../types';
import { ReceiptModal } from '../pos/ReceiptModal';
import { CustomerDebtInvoiceModal } from './CustomerDebtInvoiceModal';
import { CustomerCreditPage } from './CustomerCreditPage';
import { ExportCreditLedgerGmailModal } from './ExportCreditLedgerGmailModal';
import {
  Users,
  Plus,
  Search,
  Phone,
  TrendingUp,
  X,
  Check,
  BookOpen,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Send,
  History,
  FileText,
  ArrowDownRight,
  ArrowUpRight,
  Trash2,
  Copy,
  Printer,
  LayoutGrid,
  List,
  ArrowUpDown,
  ShieldAlert,
  Clock,
  ExternalLink,
  Mail
} from 'lucide-react';

export const CustomersView: React.FC = () => {
  const {
    customers,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    creditTransactions,
    addCreditDebt,
    settleCustomerCredit,
    updateCreditTransaction,
    deleteCreditTransaction,
    addCustomCreditEntry,
    rebuildCustomerCreditLedger,
    currencySymbol,
    language,
    settings,
    orders,
    isOnline
  } = usePos();

  const t = getT(language);
  const isAr = language === 'ar';

  // Navigation Tabs: 'ledger' (كناش الكريدي) vs 'loyalty' (برنامج الولاء والعملاء)
  const [activeTab, setActiveTab] = useState<'ledger' | 'loyalty'>('ledger');

  // Dedicated Page per Customer (صفحة الزبون)
  const [selectedCustomerPageId, setSelectedCustomerPageId] = useState<string | null>(null);

  // Search by Name AND Phone
  const [searchQuery, setSearchQuery] = useState('');

  // Status Filter: 'all' | 'debtors' | 'overdue' | 'over_limit' | 'settled'
  const [statusFilter, setStatusFilter] = useState<'all' | 'debtors' | 'overdue' | 'over_limit' | 'settled'>('all');

  // Sort & View mode for Credit Ledger
  const [sortBy, setSortBy] = useState<'debt_desc' | 'overdue' | 'recent' | 'over_limit' | 'name'>('debt_desc');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Modals state
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [showDebtorsDetailsModal, setShowDebtorsDetailsModal] = useState(false);
  const [debtorsModalSearch, setDebtorsModalSearch] = useState('');
  const [showCreatePaymentModal, setShowCreatePaymentModal] = useState(false);
  const [settleModalCustomer, setSettleModalCustomer] = useState<Customer | null>(null);
  const [addDebtModalCustomer, setAddDebtModalCustomer] = useState<Customer | null>(null);
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
  const [debtInvoiceCustomer, setDebtInvoiceCustomer] = useState<Customer | null>(null);
  const [selectedCreditOrder, setSelectedCreditOrder] = useState<Order | null>(null);
  const [whatsappReminderCustomer, setWhatsappReminderCustomer] = useState<Customer | null>(null);
  const [showBulkReminderModal, setShowBulkReminderModal] = useState(false);
  const [showCreditGmailModal, setShowCreditGmailModal] = useState(false);
  const [creditLimitModalCustomer, setCreditLimitModalCustomer] = useState<Customer | null>(null);
  const [draftCreditLimit, setDraftCreditLimit] = useState<string>('');
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);

  // Form states for Add Customer
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newInitialBalance, setNewInitialBalance] = useState<number>(0);
  const [newCreditLimit, setNewCreditLimit] = useState<string>('');
  const [newNotes, setNewNotes] = useState('');

  // Form states for Settle Debt / Create Debt Payment (إنشاء دفع الدين)
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [settleNotes, setSettleNotes] = useState('');
  const [paymentToast, setPaymentToast] = useState<string | null>(null);

  // Form states for Add Debt (تقييد دين جديد)
  const [newDebtAmount, setNewDebtAmount] = useState<number>(0);
  const [newDebtNotes, setNewDebtNotes] = useState('');

  // Custom WhatsApp message edit
  const [customWhatsAppMsg, setCustomWhatsAppMsg] = useState('');
  const [copiedToast, setCopiedToast] = useState(false);

  // Per-customer ledger analytics map
  const customerStatsMap = useMemo(() => {
    const map = new Map<
      string,
      {
        latestTxDate?: string;
        daysInactive: number;
        isOverdue: boolean;
        txCount: number;
        totalDebtTaken: number;
        totalPaid: number;
        repaymentRate: number;
        isOverLimit: boolean;
        limitUsagePct: number;
      }
    >();

    for (const c of customers) {
      const txs = creditTransactions
        .filter((tx) => tx.customerId === c.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const totalDebtTaken = txs
        .filter((tx) => tx.type === 'debt')
        .reduce((s, tx) => s + tx.amount, 0);
      const totalPaid = txs
        .filter((tx) => tx.type === 'payment')
        .reduce((s, tx) => s + tx.amount, 0);
      const baseDebt = Math.max(totalDebtTaken, c.balance + totalPaid);
      const repaymentRate = baseDebt > 0 ? Math.min(100, Math.round((totalPaid / baseDebt) * 100)) : 100;
      const isOverLimit = Boolean(c.creditLimit && c.creditLimit > 0 && c.balance > c.creditLimit);
      const limitUsagePct =
        c.creditLimit && c.creditLimit > 0 ? Math.round((c.balance / c.creditLimit) * 100) : 0;

      const refIso = txs[0]?.date || c.createdAt;
      const daysInactive = refIso
        ? Math.max(0, Math.floor((Date.now() - new Date(refIso).getTime()) / 86_400_000))
        : 0;
      const isOverdue = c.balance > 0 && daysInactive >= 15;

      map.set(c.id, {
        latestTxDate: txs[0]?.date,
        daysInactive,
        isOverdue,
        txCount: txs.length,
        totalDebtTaken,
        totalPaid,
        repaymentRate,
        isOverLimit,
        limitUsagePct
      });
    }
    return map;
  }, [customers, creditTransactions]);

  // Filtered & sorted customers matching search (Name OR Phone OR Notes)
  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const cleanDigits = query.replace(/[^\d+]/g, '');

    const filtered = customers.filter((c) => {
      const matchesName = c.name.toLowerCase().includes(query);
      const matchesPhone = cleanDigits
        ? c.phone.replace(/[^\d+]/g, '').includes(cleanDigits)
        : c.phone.toLowerCase().includes(query);
      const matchesNotes = c.notes ? c.notes.toLowerCase().includes(query) : false;
      const matchesEmail = c.email ? c.email.toLowerCase().includes(query) : false;

      const matchesSearch = !query || matchesName || matchesPhone || matchesNotes || matchesEmail;

      let matchesStatus = true;
      if (statusFilter === 'debtors') {
        matchesStatus = c.balance > 0;
      } else if (statusFilter === 'overdue') {
        matchesStatus = Boolean(customerStatsMap.get(c.id)?.isOverdue);
      } else if (statusFilter === 'over_limit') {
        matchesStatus = Boolean(c.creditLimit && c.creditLimit > 0 && c.balance > c.creditLimit);
      } else if (statusFilter === 'settled') {
        matchesStatus = c.balance <= 0;
      }

      return matchesSearch && matchesStatus;
    });

    return [...filtered].sort((a, b) => {
      if (activeTab === 'loyalty') {
        return b.totalSpent - a.totalSpent || b.points - a.points;
      }
      if (sortBy === 'overdue') {
        const aDays = a.balance > 0 ? (customerStatsMap.get(a.id)?.daysInactive ?? 0) : -1;
        const bDays = b.balance > 0 ? (customerStatsMap.get(b.id)?.daysInactive ?? 0) : -1;
        return bDays - aDays || b.balance - a.balance;
      }
      if (sortBy === 'over_limit') {
        const aOver = a.creditLimit && a.balance > a.creditLimit ? 1 : 0;
        const bOver = b.creditLimit && b.balance > b.creditLimit ? 1 : 0;
        return bOver - aOver || b.balance - a.balance;
      }
      if (sortBy === 'recent') {
        const aTime = customerStatsMap.get(a.id)?.latestTxDate
          ? new Date(customerStatsMap.get(a.id)!.latestTxDate!).getTime()
          : 0;
        const bTime = customerStatsMap.get(b.id)?.latestTxDate
          ? new Date(customerStatsMap.get(b.id)!.latestTxDate!).getTime()
          : 0;
        return bTime - aTime || b.balance - a.balance;
      }
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name, isAr ? 'ar' : 'en');
      }
      // Default: highest debt first
      return b.balance - a.balance || a.name.localeCompare(b.name, isAr ? 'ar' : 'en');
    });
  }, [customers, searchQuery, statusFilter, sortBy, activeTab, customerStatsMap, isAr]);

  // Overall Credit Ledger KPIs
  const metrics = useMemo(() => {
    const totalDebt = customers.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);
    const debtorsCount = customers.filter((c) => c.balance > 0).length;
    const overdueCount = customers.filter((c) => customerStatsMap.get(c.id)?.isOverdue).length;
    const overLimitCount = customers.filter(
      (c) => c.creditLimit && c.creditLimit > 0 && c.balance > c.creditLimit
    ).length;
    const settledCount = customers.filter((c) => c.balance <= 0).length;
    const totalPaymentsReceived = creditTransactions
      .filter((t) => t.type === 'payment')
      .reduce((sum, t) => sum + t.amount, 0);
    const collectionDenominator = totalDebt + totalPaymentsReceived;
    const collectionRatePct =
      collectionDenominator > 0
        ? Math.round((totalPaymentsReceived / collectionDenominator) * 100)
        : 100;

    const lastTransaction = creditTransactions[0] || null;

    return {
      totalDebt,
      debtorsCount,
      overdueCount,
      overLimitCount,
      settledCount,
      totalPaymentsReceived,
      collectionRatePct,
      lastTransaction
    };
  }, [customers, creditTransactions, customerStatsMap]);

  const selectedPageCustomer = useMemo(() => {
    if (!selectedCustomerPageId) return null;
    return customers.find((c) => c.id === selectedCustomerPageId) || null;
  }, [customers, selectedCustomerPageId]);

  const selectedPageTransactions = useMemo(() => {
    if (!selectedPageCustomer) return [];
    return creditTransactions.filter((tx) => tx.customerId === selectedPageCustomer.id);
  }, [selectedPageCustomer, creditTransactions]);

  const selectedPageOrders = useMemo(() => {
    if (!selectedPageCustomer) return [];
    return orders.filter(
      (o) =>
        o.status === 'completed' &&
        (o.customerId === selectedPageCustomer.id ||
          (o.customerName && o.customerName === selectedPageCustomer.name))
    );
  }, [selectedPageCustomer, orders]);

  const formatLastActivity = (isoDate?: string): string => {
    if (!isoDate) return isAr ? 'بدون حركات' : 'No activity';
    const days = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000));
    if (days === 0) return isAr ? 'اليوم' : 'Today';
    if (days === 1) return isAr ? 'أمس' : 'Yesterday';
    return isAr ? `منذ ${days} يوم` : `${days}d ago`;
  };

  // List of all customers currently owing debt (sorted highest debt first)
  const debtorsList = useMemo(() => {
    return customers
      .filter((c) => c.balance > 0)
      .sort((a, b) => b.balance - a.balance);
  }, [customers]);

  const filteredDebtorsInModal = useMemo(() => {
    const q = debtorsModalSearch.trim().toLowerCase();
    const digits = q.replace(/[^\d+]/g, '');
    if (!q) return debtorsList;
    return debtorsList.filter((c) => {
      const mName = c.name.toLowerCase().includes(q);
      const mPhone = digits
        ? c.phone.replace(/[^\d+]/g, '').includes(digits)
        : c.phone.toLowerCase().includes(q);
      const mNotes = c.notes ? c.notes.toLowerCase().includes(q) : false;
      return mName || mPhone || mNotes;
    });
  }, [debtorsList, debtorsModalSearch]);

  const openCreatePaymentModal = (customer?: Customer) => {
    const target = customer || debtorsList[0] || null;
    setSettleModalCustomer(target);
    setSettleAmount(target ? target.balance : 0);
    setSettleNotes('');
    setShowCreatePaymentModal(true);
  };

  // Handle Add Customer Submit
  const handleAddCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;

    addCustomer({
      name: newName.trim(),
      phone: newPhone.trim(),
      email: newEmail.trim() || undefined,
      balance: newInitialBalance > 0 ? newInitialBalance : 0,
      creditLimit: parseFloat(newCreditLimit) > 0 ? parseFloat(newCreditLimit) : undefined,
      notes: newNotes.trim() || undefined
    });

    setNewName('');
    setNewPhone('');
    setNewEmail('');
    setNewInitialBalance(0);
    setNewCreditLimit('');
    setNewNotes('');
    setShowAddCustomerModal(false);
  };

  // Handle Settle / Create Debt Payment Submit
  const handleSettleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleModalCustomer || settleAmount <= 0) return;

    const paidAmount = Math.min(settleAmount, settleModalCustomer.balance);
    const result = settleCustomerCredit(
      settleModalCustomer.id,
      paidAmount,
      settleNotes.trim() || undefined
    );

    if (result.success) {
      const remaining = Math.max(0, Number((settleModalCustomer.balance - paidAmount).toFixed(2)));
      const offlineSuffix = !isOnline
        ? isAr
          ? ' (محفوظ محلياً أوفلاين وسيتزامن تلقائياً)'
          : ' (saved offline locally)'
        : '';
      setPaymentToast(
        isAr
          ? `تم تسجيل دفع الدين (${paidAmount.toFixed(2)} ${currencySymbol}) للزبون "${settleModalCustomer.name}" — المتبقي: ${remaining.toFixed(2)} ${currencySymbol}${offlineSuffix}`
          : `Debt payment (${paidAmount.toFixed(2)} ${currencySymbol}) recorded for "${settleModalCustomer.name}"${offlineSuffix}`
      );
      setTimeout(() => setPaymentToast(null), 4000);
    }

    setShowCreatePaymentModal(false);
    setSettleModalCustomer(null);
    setSettleAmount(0);
    setSettleNotes('');
  };

  // Handle Add Debt Submit
  const handleAddDebtSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addDebtModalCustomer || newDebtAmount <= 0) return;

    const res = addCreditDebt(
      addDebtModalCustomer.id,
      newDebtAmount,
      newDebtNotes.trim() || undefined
    );
    if (res.success) {
      const offlineSuffix = !isOnline
        ? isAr
          ? ' (محفوظ محلياً أوفلاين)'
          : ' (saved offline)'
        : '';
      setPaymentToast(
        isAr
          ? `تم تقييد كريدي جديد (${newDebtAmount.toFixed(2)} ${currencySymbol}) على "${addDebtModalCustomer.name}"${offlineSuffix}`
          : `Added ${newDebtAmount.toFixed(2)} ${currencySymbol} credit for "${addDebtModalCustomer.name}"${offlineSuffix}`
      );
      setTimeout(() => setPaymentToast(null), 4000);
    }
    setAddDebtModalCustomer(null);
    setNewDebtAmount(0);
    setNewDebtNotes('');
  };

  // Open WhatsApp Modal & Preload Polite Message
  const openWhatsAppModal = (c: Customer) => {
    setWhatsappReminderCustomer(c);
    const store = settings.storeName || (isAr ? 'البقالة' : 'Store');
    const msg = isAr
      ? `السلام عليكم ورحمة الله وبركاته أخي/أختي ${c.name} المحترم(ة)،\n\nتذكير ودي من "${store}":\nنود إعلامكم بأن الرصيد المتبقي بذمتكم في كناش الكريدي هو: ${c.balance.toFixed(2)} ${currencySymbol}.\n\nنشكركم جزيلاً على ثقتكم وحسن تعاملكم، ومرحباً بكم في أي وقت!`
      : `Bonjour ${c.name},\nRappel amical de "${store}": le solde restant sur votre compte crédit est de ${c.balance.toFixed(2)} ${currencySymbol}. Merci de votre confiance!`;

    setCustomWhatsAppMsg(msg);
  };

  // Build clean WhatsApp URL helper
  const buildCustomerWhatsAppHref = (phone: string, text: string): string => {
    let cleanPhone = phone.replace(/[^\d]/g, '');
    if (cleanPhone.startsWith('0') && cleanPhone.length === 10) {
      cleanPhone = '212' + cleanPhone.slice(1);
    }
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  };

  const buildPoliteDebtMessage = (c: Customer): string => {
    const store = settings.storeName || (isAr ? 'البقالة' : 'Store');
    const overLimit = c.creditLimit && c.creditLimit > 0 && c.balance > c.creditLimit;
    return isAr
      ? `السلام عليكم ورحمة الله وبركاته أخي/أختي ${c.name} المحترم(ة)،\n\nتذكير ودي من "${store}":\nنود إعلامكم بأن الرصيد المتبقي بذمتكم في كناش الكريدي هو: ${c.balance.toFixed(2)} ${currencySymbol}${
          overLimit ? ` (وقد تجاوز السقف المحدد ${c.creditLimit?.toFixed(2)} ${currencySymbol})` : ''
        }.\n\nنشكركم جزيلاً على ثقتكم وحسن تعاملكم، ومرحباً بكم في أي وقت!`
      : `Bonjour ${c.name},\nRappel amical de "${store}": le solde restant sur votre compte crédit est de ${c.balance.toFixed(2)} ${currencySymbol}. Merci de votre confiance!`;
  };

  // Copy WhatsApp text to clipboard
  const handleCopyWhatsApp = () => {
    navigator.clipboard.writeText(customWhatsAppMsg);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2000);
  };

  // Customer credit transactions
  const selectedCustomerTransactions = useMemo(() => {
    if (!statementCustomer) return [];
    return creditTransactions.filter((tx) => tx.customerId === statementCustomer.id);
  }, [statementCustomer, creditTransactions]);

  const selectedCustomerCreditOrders = useMemo(() => {
    if (!statementCustomer) return [];
    return orders.filter(
      (o) =>
        o.status === 'completed' &&
        (o.customerId === statementCustomer.id ||
          (o.customerName && o.customerName === statementCustomer.name))
    );
  }, [statementCustomer, orders]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-950">
      {selectedPageCustomer ? (
        <CustomerCreditPage
          customer={selectedPageCustomer}
          allCustomers={customers}
          transactions={selectedPageTransactions}
          customerOrders={selectedPageOrders}
          currencySymbol={currencySymbol}
          language={language}
          storeName={settings.storeName || (isAr ? 'البقالة' : 'Store')}
          onBack={() => setSelectedCustomerPageId(null)}
          onSelectCustomer={(id) => setSelectedCustomerPageId(id)}
          onAddDebt={(amount, notes) => addCreditDebt(selectedPageCustomer.id, amount, notes)}
          onSettleDebt={(amount, notes) => settleCustomerCredit(selectedPageCustomer.id, amount, notes)}
          onUpdateCustomer={(updates) => updateCustomer(selectedPageCustomer.id, updates)}
          onDeleteCustomer={() => {
            deleteCustomer(selectedPageCustomer.id);
            setSelectedCustomerPageId(null);
          }}
          onOpenDebtInvoice={() => setDebtInvoiceCustomer(selectedPageCustomer)}
          onOpenOrderReceipt={(order) => setSelectedCreditOrder(order)}
          onOpenWhatsAppReminder={() => openWhatsAppModal(selectedPageCustomer)}
          onUpdateTransaction={updateCreditTransaction}
          onDeleteTransaction={deleteCreditTransaction}
          onAddCustomEntry={(entry) => addCustomCreditEntry(selectedPageCustomer.id, entry)}
          onRebuildLedger={() => rebuildCustomerCreditLedger(selectedPageCustomer.id)}
        />
      ) : (
        <div className="flex-1 flex flex-col h-full overflow-hidden p-4 sm:p-6">
      {/* Top Header & Navigation Segmented Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/70 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-normal leading-snug">
              {isAr ? 'كناش الكريدي والعملاء' : 'Credit Ledger & Customers'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
              {isAr
                ? 'إدارة ديون الزبناء، تقييد الكريدي، تسديد الدفعات، والبحث السريع بالاسم أو الهاتف'
                : 'Manage customer credit debts, record payments, and search by name or phone'}
            </p>
          </div>
        </div>

        {/* Action Controls: Tabs & Clean Semantic Action Hierarchy */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented Control */}
          <div className="flex items-center p-1 bg-slate-200/80 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('ledger')}
              className={`min-h-[36px] px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'ledger'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>{isAr ? 'كناش الكريدي' : 'Credit Ledger'}</span>
              {metrics.debtorsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md text-xs bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold tabular-nums">
                  {metrics.debtorsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('loyalty')}
              className={`min-h-[36px] px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'loyalty'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{isAr ? 'العملاء والولاء' : 'Loyalty & All'}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">({customers.length})</span>
            </button>
          </div>

          {/* Secondary Utility: Export Credit Ledger File & Send via Gmail */}
          <button
            type="button"
            onClick={() => setShowCreditGmailModal(true)}
            disabled={customers.length === 0}
            className="min-h-[40px] px-3.5 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
            title={isAr ? 'حفظ كناش الكريدي في ملف وإرساله إلى Gmail' : 'Export Credit Ledger to File & Gmail'}
          >
            <Mail className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            <span>{isAr ? 'تصدير Gmail' : 'Ledger ➔ Gmail'}</span>
          </button>

          {/* Secondary Utility: Bulk WhatsApp Reminders */}
          <button
            type="button"
            onClick={() => setShowBulkReminderModal(true)}
            disabled={debtorsList.length === 0}
            className="min-h-[40px] px-3.5 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
            title={isAr ? 'إرسال تذكير واتساب لأصحاب الديون والسقف المتجاوز' : 'WhatsApp Reminders'}
          >
            <Send className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="tabular-nums">{isAr ? `واتساب (${debtorsList.length})` : `WA Remind (${debtorsList.length})`}</span>
          </button>

          {/* Primary Payment CTA: Create Debt Payment (Emerald = Settlement/Cash In) */}
          <button
            type="button"
            onClick={() => openCreatePaymentModal()}
            disabled={debtorsList.length === 0}
            className="min-h-[40px] px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 disabled:cursor-not-allowed text-white transition-all shadow-xs flex items-center gap-1.5 active:scale-95"
            title={isAr ? 'إنشاء وتسجيل دفع الدين لأي زبون' : 'Create Debt Payment'}
          >
            <DollarSign className="w-4 h-4" />
            <span>{isAr ? 'تسجيل دفع الدين' : '+ Debt Payment'}</span>
          </button>

          {/* Primary Ledger CTA: Add New Customer */}
          <button
            type="button"
            onClick={() => setShowAddCustomerModal(true)}
            className="min-h-[40px] px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 transition-all shadow-xs flex items-center gap-1.5 active:scale-95"
            title={isAr ? 'إضافة زبون جديد في الكناش' : 'Add new customer'}
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'إضافة زبون' : '+ Add Customer'}</span>
          </button>
        </div>
      </div>

      {/* Payment Confirmation Toast */}
      {paymentToast && (
        <div className="mb-4 px-4 py-3 rounded-2xl bg-emerald-600 text-white text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 shadow-sm shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{paymentToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setPaymentToast(null)}
            className="text-white/80 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary KPI Cards for Credit Ledger */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 shrink-0">
        {/* Total Credit in Market */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {isAr ? 'إجمالي الكريدي المعلق' : 'Total Outstanding Debt'}
            </span>
            <span className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-amber-700 dark:text-amber-400 mt-1.5 tabular-nums">
            {metrics.totalDebt.toFixed(2)}{' '}
            <span className="text-xs font-bold text-amber-700/80 dark:text-amber-400/80">
              {currencySymbol}
            </span>
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 flex items-center justify-between gap-2">
            <span className="tabular-nums">{isAr ? `في ذمة ${metrics.debtorsCount} زبون` : `${metrics.debtorsCount} debtors`}</span>
            {metrics.overLimitCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter('over_limit')}
                className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold tabular-nums hover:bg-rose-100"
              >
                {isAr ? `${metrics.overLimitCount} تجاوز السقف` : `${metrics.overLimitCount} over`}
              </button>
            )}
          </div>
        </div>

        {/* Debtors Button Card */}
        <button
          type="button"
          onClick={() => {
            setStatusFilter('debtors');
            setShowDebtorsDetailsModal(true);
          }}
          className={`text-start p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs ${
            statusFilter === 'debtors'
              ? 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-400 ring-2 ring-rose-500/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-700'
          }`}
          title={isAr ? 'اضغط لعرض تفاصيل الزبناء اللي عليهم الدين وإنشاء دفع الدين' : 'Click to view debtor details & create payment'}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {isAr ? 'الزبناء المدينون' : 'Debtors'}
            </span>
            <span className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1.5">
            <span className="text-xl sm:text-2xl font-extrabold text-rose-600 dark:text-rose-400 tabular-nums">
              {metrics.debtorsCount}
            </span>
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums">
              ({metrics.totalDebt.toFixed(0)} {currencySymbol})
            </span>
          </div>
          <div className="text-xs font-semibold text-rose-700 dark:text-rose-400 mt-1.5">
            {isAr ? 'عرض القائمة وتسجيل الدفع ←' : 'View list & record payment →'}
          </div>
        </button>

        {/* Settled Customers Count */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'settled' ? 'all' : 'settled')}
          className={`text-start p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs ${
            statusFilter === 'settled'
              ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-400 ring-2 ring-emerald-500/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700'
          }`}
          title={isAr ? 'انقر لتصفية الزبناء الخالصين' : 'Click to filter settled customers'}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {isAr ? 'الزبناء الخالصون' : 'Settled Customers'}
            </span>
            <span className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1.5 tabular-nums">
            {metrics.settledCount}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
            {isAr ? 'حسابهم خالص (0.00 د.م)' : 'Zero debt balance'}
          </div>
        </button>

        {/* Total Collections + Collection Rate */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {isAr ? 'التحصيل ونسبة الاستخلاص' : 'Collected & Rate'}
            </span>
            <span className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2 mt-1.5">
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
              {metrics.totalPaymentsReceived.toFixed(0)}{' '}
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{currencySymbol}</span>
            </div>
            <span className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold font-mono tabular-nums">
              {metrics.collectionRatePct}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2.5">
            <div
              className="h-full bg-emerald-600 transition-all"
              style={{ width: `${metrics.collectionRatePct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Prominent Search, Filters, Sort & View Mode Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200 dark:border-slate-800 shadow-2xs mb-4 shrink-0 flex flex-wrap items-center justify-between gap-3">
        {/* Instant Search input */}
        <div className="relative flex-1 min-w-[230px]">
          <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isAr
                ? 'ابحث بالاسم، رقم الهاتف، أو الملاحظات...'
                : 'Search ledger by name, phone, or notes...'
            }
            className="w-full py-2.5 ps-10 pe-10 text-xs sm:text-sm font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:border-emerald-500 text-slate-900 dark:text-white transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white bg-slate-200 dark:bg-slate-700 rounded-full w-5 h-5 flex items-center justify-center transition-colors"
            >
              ×
            </button>
          )}
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all' as const, label: isAr ? 'الكل' : 'All', count: customers.length },
            { id: 'debtors' as const, label: isAr ? 'عليهم الدين' : 'Has Debt', count: metrics.debtorsCount },
            { id: 'overdue' as const, label: isAr ? 'متأخر +15 يوم' : 'Overdue 15d+', count: metrics.overdueCount },
            { id: 'over_limit' as const, label: isAr ? 'تجاوز السقف' : 'Over Limit', count: metrics.overLimitCount },
            { id: 'settled' as const, label: isAr ? 'خالصين' : 'Settled', count: metrics.settledCount }
          ].map((chip) => {
            const isSelected = statusFilter === chip.id;
            const activeClass =
              chip.id === 'over_limit' || chip.id === 'overdue'
                ? 'bg-rose-600 text-white shadow-xs'
                : chip.id === 'debtors'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-emerald-600 text-white shadow-xs';
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setStatusFilter(chip.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
                  isSelected
                    ? activeClass
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>{chip.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-xs font-bold tabular-nums ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sort & View Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl px-3 min-h-[36px] border border-slate-200 dark:border-slate-700">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as 'debt_desc' | 'overdue' | 'recent' | 'over_limit' | 'name')
              }
              className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-hidden"
            >
              <option value="debt_desc" className="bg-white dark:bg-slate-900">
                {isAr ? 'الأعلى ديناً' : 'Highest Debt'}
              </option>
              <option value="overdue" className="bg-white dark:bg-slate-900">
                {isAr ? 'الأكثر تأخراً أولاً' : 'Most Overdue First'}
              </option>
              <option value="recent" className="bg-white dark:bg-slate-900">
                {isAr ? 'الأحدث حركة' : 'Recent Activity'}
              </option>
              <option value="over_limit" className="bg-white dark:bg-slate-900">
                {isAr ? 'تجاوز السقف أولاً' : 'Over Limit First'}
              </option>
              <option value="name" className="bg-white dark:bg-slate-900">
                {isAr ? 'الاسم أ - ي' : 'Name A-Z'}
              </option>
            </select>
          </div>

          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'cards'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
              }`}
              title={isAr ? 'عرض بطاقات' : 'Cards View'}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
              }`}
              title={isAr ? 'عرض جدول الكناش المضغوط' : 'Compact Ledger Table'}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Customers List / Cards / Table */}
      <div className="flex-1 overflow-y-auto">
        {filteredCustomers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <Search className="w-10 h-10 mb-2 stroke-1 text-slate-400 dark:text-slate-500" />
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {searchQuery
                ? (isAr ? `لا يوجد زبون مطابق للبحث: "${searchQuery}"` : `No customer matches: "${searchQuery}"`)
                : (isAr ? 'لا يوجد زبناء في هذه الفئة' : 'No customers in this category')}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {isAr ? 'تأكد من كتابة الاسم أو رقم الهاتف أو أضف زبوناً جديداً' : 'Check name or phone, or add a new customer'}
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setShowAddCustomerModal(true);
              }}
              className="mt-4 min-h-[40px] px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إضافة زبون جديد الآن' : 'Add New Customer'}</span>
            </button>
          </div>
        ) : viewMode === 'table' ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto shadow-2xs mb-4">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3.5 px-4 text-start">{isAr ? 'الزبون' : 'Customer'}</th>
                  <th className="py-3.5 px-3 text-start">{isAr ? 'الهاتف' : 'Phone'}</th>
                  <th className="py-3.5 px-3 text-start">{isAr ? 'آخر حركة' : 'Activity'}</th>
                  <th className="py-3.5 px-3 text-start">{isAr ? 'نسبة السداد' : 'Repayment'}</th>
                  <th className="py-3.5 px-3 text-end">{isAr ? 'الدين الحالي / السقف' : 'Balance / Limit'}</th>
                  <th className="py-3.5 px-4 text-end">{isAr ? 'إجراءات سريعة' : 'Quick Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredCustomers.map((cust) => {
                  const hasDebt = cust.balance > 0;
                  const cStats = customerStatsMap.get(cust.id);
                  return (
                    <tr
                      key={cust.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => setSelectedCustomerPageId(cust.id)}
                          className="text-sm font-bold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1.5 text-start"
                        >
                          <span>{cust.name}</span>
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                        {cust.notes && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[220px] mt-0.5">
                            {cust.notes}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {cust.phone}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        <div>{formatLastActivity(cStats?.latestTxDate)}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          {cStats?.txCount || 0} {isAr ? 'حركات' : 'txs'}
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-600"
                              style={{ width: `${cStats?.repaymentRate ?? 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                            {cStats?.repaymentRate ?? 100}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-end tabular-nums whitespace-nowrap">
                        <div
                          className={`font-extrabold text-sm ${
                            cStats?.isOverLimit
                              ? 'text-rose-600 dark:text-rose-400'
                              : hasDebt
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {cust.balance.toFixed(2)} {currencySymbol}
                        </div>
                        {cust.creditLimit ? (
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {isAr ? 'السقف:' : 'Max:'} {cust.creditLimit.toFixed(0)} {currencySymbol}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 text-end whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedCustomerPageId(cust.id)}
                            className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold flex items-center gap-1"
                          >
                            <BookOpen className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                            <span>{isAr ? 'صفحة الزبون' : 'Page'}</span>
                          </button>
                          {hasDebt && (
                            <button
                              type="button"
                              onClick={() => openCreatePaymentModal(cust)}
                              className="min-h-[34px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                            >
                              {isAr ? 'خلص' : 'Pay'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setAddDebtModalCustomer(cust);
                              setNewDebtAmount(0);
                              setNewDebtNotes('');
                            }}
                            className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 text-xs font-bold"
                            title={isAr ? 'تقييد كريدي جديد' : 'Add debt'}
                          >
                            + {isAr ? 'دين' : 'Debt'}
                          </button>
                          {hasDebt && (
                            <button
                              type="button"
                              onClick={() => openWhatsAppModal(cust)}
                              className="min-h-[34px] p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100"
                              title={isAr ? 'واتساب' : 'WhatsApp'}
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
            {filteredCustomers.map((cust) => {
              const hasDebt = cust.balance > 0;
              const cStats = customerStatsMap.get(cust.id);
              const isCriticalAlert = Boolean(cStats?.isOverLimit || cStats?.isOverdue);

              return (
                <div
                  key={cust.id}
                  className={`rounded-2xl p-5 bg-white dark:bg-slate-900 border transition-all flex flex-col justify-between shadow-2xs hover:shadow-sm ${
                    isCriticalAlert
                      ? 'border-rose-300 dark:border-rose-800/80'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {/* Top Customer Info */}
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3.5">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setSelectedCustomerPageId(cust.id)}
                          className="group flex items-center gap-1.5 text-start"
                          title={isAr ? 'فتح الصفحة الخاصة للزبون في كناش الكريدي' : 'Open customer page'}
                        >
                          <h4 className="font-bold text-base text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 truncate transition-colors">
                            {cust.name}
                          </h4>
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-500 shrink-0" />
                        </button>

                        {/* Phone Number + Last Activity */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300 mt-1">
                          <a
                            href={`tel:${cust.phone}`}
                            className="inline-flex items-center gap-1 font-mono tabular-nums font-semibold hover:underline hover:text-emerald-600 dark:hover:text-emerald-400"
                            title={isAr ? 'اتصال بالهاتف' : 'Call'}
                          >
                            <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>{cust.phone}</span>
                          </a>
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatLastActivity(cStats?.latestTxDate)}</span>
                          </span>
                        </div>

                        {cust.notes && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 line-clamp-1 leading-relaxed">
                            {cust.notes}
                          </p>
                        )}
                      </div>

                      {/* Single Clean Semantic Status Badge */}
                      <div className="shrink-0">
                        {cStats?.isOverLimit ? (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800 inline-flex items-center gap-1">
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                            <span>{isAr ? 'تجاوز السقف' : 'Over Limit'}</span>
                          </span>
                        ) : cStats?.isOverdue ? (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800 inline-flex items-center gap-1 tabular-nums">
                            <Clock className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                            <span>
                              {isAr ? `متأخر (${cStats.daysInactive} ي)` : `Overdue (${cStats.daysInactive}d)`}
                            </span>
                          </span>
                        ) : hasDebt ? (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800 inline-flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span>{isAr ? 'عليه كريدي' : 'Debt Due'}</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>{isAr ? 'خالص' : 'Settled'}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Clean Unboxed Balance & Primary Actions Section */}
                    <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800 space-y-3 mb-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {isAr ? 'رصيد الكريدي المستحق' : 'Outstanding Credit'}
                          </div>
                          <div
                            className={`text-2xl font-extrabold tabular-nums mt-0.5 ${
                              cStats?.isOverLimit
                                ? 'text-rose-600 dark:text-rose-400'
                                : hasDebt
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {cust.balance.toFixed(2)}{' '}
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                              {currencySymbol}
                            </span>
                          </div>
                        </div>

                        {/* Semantically Distinct Fast Actions: Amber (+Debt) vs Emerald (Settle) */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setAddDebtModalCustomer(cust);
                              setNewDebtAmount(0);
                              setNewDebtNotes('');
                            }}
                            className="min-h-[38px] px-3 py-1.5 text-xs font-bold rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 transition-colors flex items-center gap-1"
                            title={isAr ? 'تقييد كريدي جديد على الحساب' : 'Record Credit'}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{hasDebt ? (isAr ? 'دين' : 'Debt') : isAr ? 'تقييد كريدي' : 'Add Credit'}</span>
                          </button>
                          {hasDebt && (
                            <button
                              type="button"
                              onClick={() => openCreatePaymentModal(cust)}
                              className="min-h-[38px] px-3.5 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all active:scale-95 flex items-center gap-1"
                              title={isAr ? 'إنشاء دفع الدين وتسديد الكريدي' : 'Settle Debt'}
                            >
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>{isAr ? 'خلص' : 'Settle'}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Credit Limit & Repayment Rate */}
                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-300">
                          <span className="tabular-nums font-medium">
                            {cust.creditLimit && cust.creditLimit > 0
                              ? `${isAr ? 'السقف:' : 'Limit:'} ${cust.creditLimit.toFixed(0)} ${currencySymbol} (${Math.min(999, cStats?.limitUsagePct || 0)}%)`
                              : isAr
                              ? 'بدون سقف محدد'
                              : 'No limit set'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setCreditLimitModalCustomer(cust);
                              setDraftCreditLimit(cust.creditLimit ? String(cust.creditLimit) : '');
                            }}
                            className="text-emerald-700 dark:text-emerald-400 font-semibold hover:underline"
                          >
                            {cust.creditLimit ? (isAr ? 'تعديل السقف' : 'Edit Limit') : isAr ? '+ تحديد السقف' : '+ Set Limit'}
                          </button>
                        </div>

                        {cStats && cStats.txCount > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                              <span>{isAr ? 'نسبة السداد والالتزام' : 'Repayment rate'}</span>
                              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                                {cStats.repaymentRate}% ({cStats.txCount})
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-600 transition-all"
                                style={{ width: `${cStats.repaymentRate}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quiet Summary Strip: Loyalty Points & Orders */}
                    <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 mb-3">
                      <div className="tabular-nums">
                        <span className="text-slate-500 dark:text-slate-400">{t.points}: </span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                          {cust.points} ({((cust.points || 0) * (settings.loyaltyPointValue ?? 1)).toFixed(0)} {currencySymbol})
                        </span>
                      </div>
                      <div className="tabular-nums">
                        <span className="text-slate-500 dark:text-slate-400">{isAr ? 'المشتريات' : 'Orders'}: </span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {cust.ordersCount} ({cust.totalSpent.toFixed(0)} {currencySymbol})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Clean Action Footer */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedCustomerPageId(cust.id)}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors flex items-center gap-1.5"
                        title={isAr ? 'فتح الصفحة الكاملة للزبون في كناش الكريدي' : 'Open Customer Page'}
                      >
                        <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                        <span>{isAr ? 'صفحة الزبون' : 'Page'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDebtInvoiceCustomer(cust)}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1"
                        title={isAr ? 'طبع فاتورة الدين بتفاصيل المشتريات' : 'Print Debt Invoice'}
                      >
                        <Printer className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                      </button>

                      {hasDebt && (
                        <button
                          type="button"
                          onClick={() => openWhatsAppModal(cust)}
                          className="min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800 transition-colors flex items-center gap-1"
                          title={isAr ? 'إرسال تذكير بالكريدي عبر واتساب' : 'Send WhatsApp Reminder'}
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setStatementCustomer(cust)}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        title={isAr ? 'كشف حساب سريع' : 'Quick Ledger'}
                      >
                        <History className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDeletingCustomer(cust)}
                      className="min-h-[36px] px-2 py-1.5 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      title={isAr ? 'حذف العميل' : 'Delete'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
        </div>
      )}

      {/* MODAL 0: Debtors Details & Payment Creation (تفاصيل الزبناء اللي عليهم الدين) */}
      {showDebtorsDetailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                    {isAr ? 'تفاصيل الزبناء اللي عليهم الدين' : 'Debtors Details & Payment'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isAr
                      ? `${debtorsList.length} زبون بذمتهم إجمالي ${metrics.totalDebt.toFixed(2)} ${currencySymbol}`
                      : `${debtorsList.length} customers owing ${metrics.totalDebt.toFixed(2)} ${currencySymbol}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {debtorsList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => openCreatePaymentModal()}
                    className="px-3.5 py-2 text-xs font-extrabold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all active:scale-95 flex items-center gap-1.5"
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>{isAr ? '+ إنشاء دفع الدين' : '+ Create Debt Payment'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowDebtorsDetailsModal(false)}
                  className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Summary Strip */}
            <div className="grid grid-cols-3 gap-2.5 shrink-0">
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {isAr ? 'إجمالي الدين المعلق' : 'Total Debt'}
                </div>
                <div className="text-base sm:text-lg font-extrabold text-rose-600 dark:text-rose-400 tabular-nums mt-0.5">
                  {metrics.totalDebt.toFixed(2)} {currencySymbol}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {isAr ? 'عدد اللي عليهم الدين' : 'Debtors Count'}
                </div>
                <div className="text-base sm:text-lg font-extrabold text-amber-700 dark:text-amber-400 tabular-nums mt-0.5">
                  {debtorsList.length}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {isAr ? 'الدفعات المحصلة' : 'Collected'}
                </div>
                <div className="text-base sm:text-lg font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
                  {metrics.totalPaymentsReceived.toFixed(2)} {currencySymbol}
                </div>
              </div>
            </div>

            {/* Quick Search inside Debtors Details */}
            {debtorsList.length > 0 && (
              <div className="relative shrink-0">
                <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={debtorsModalSearch}
                  onChange={(e) => setDebtorsModalSearch(e.target.value)}
                  placeholder={isAr ? 'ابحث في قائمة المدينين بالاسم أو الهاتف...' : 'Search debtors by name or phone...'}
                  className="w-full py-2.5 ps-10 pe-9 text-xs sm:text-sm font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                />
                {debtorsModalSearch && (
                  <button
                    type="button"
                    onClick={() => setDebtorsModalSearch('')}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:text-slate-300 text-xs font-bold"
                  >
                    ×
                  </button>
                )}
              </div>
            )}

            {/* Debtors Detailed Breakdown List */}
            <div className="flex-1 overflow-y-auto space-y-3 pe-1">
              {filteredDebtorsInModal.length === 0 ? (
                <div className="py-12 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    {debtorsList.length === 0
                      ? (isAr ? 'لا يوجد أي زبون عليه دين حالياً!' : 'No outstanding debtors!')
                      : (isAr ? 'لا توجد نتائج مطابقة للبحث' : 'No matching debtors')}
                  </p>
                </div>
              ) : (
                filteredDebtorsInModal.map((cust) => {
                  const custTxs = creditTransactions.filter((tx) => tx.customerId === cust.id);
                  const totalDebtAdded = custTxs
                    .filter((tx) => tx.type === 'debt')
                    .reduce((sum, tx) => sum + tx.amount, 0);
                  const totalPaid = custTxs
                    .filter((tx) => tx.type === 'payment')
                    .reduce((sum, tx) => sum + tx.amount, 0);
                  const baseTotal = Math.max(totalDebtAdded, cust.balance + totalPaid);
                  const paidPct = baseTotal > 0 ? Math.min(100, Math.round((totalPaid / baseTotal) * 100)) : 0;
                  const recentTxs = custTxs.slice(0, 3);

                  return (
                    <div
                      key={cust.id}
                      className="p-4 rounded-2xl bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 space-y-3"
                    >
                      {/* Top row: Customer & Balance */}
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                              {cust.name}
                            </h4>
                            <span className="text-xs font-mono tabular-nums font-medium text-slate-600 dark:text-slate-300">
                              {cust.phone}
                            </span>
                          </div>
                          {cust.notes && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                              {cust.notes}
                            </p>
                          )}
                        </div>

                        <div className="text-end">
                          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {isAr ? 'الدين المتبقي بذمته' : 'Remaining Debt'}
                          </div>
                          <div className="text-lg font-extrabold text-amber-700 dark:text-amber-400 tabular-nums">
                            {cust.balance.toFixed(2)} {currencySymbol}
                          </div>
                        </div>
                      </div>

                      {/* Debt vs Paid Stats + Progress Bar */}
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                          <span>
                            {isAr ? 'إجمالي الكريدي:' : 'Total Debt:'}{' '}
                            <strong className="tabular-nums text-slate-900 dark:text-white">
                              {baseTotal.toFixed(2)} {currencySymbol}
                            </strong>
                          </span>
                          <span>
                            {isAr ? 'المسدد سابقاً:' : 'Paid:'}{' '}
                            <strong className="tabular-nums text-emerald-700 dark:text-emerald-400">
                              {totalPaid.toFixed(2)} {currencySymbol} ({paidPct}%)
                            </strong>
                          </span>
                          <span>
                            {isAr ? 'عدد العمليات:' : 'Transactions:'}{' '}
                            <strong className="font-mono tabular-nums">{custTxs.length}</strong>
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-600 transition-all duration-300"
                            style={{ width: `${paidPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Recent Credit Movements Preview */}
                      {recentTxs.length > 0 && (
                        <div className="bg-slate-50 dark:bg-slate-900/70 rounded-xl border border-slate-200/80 dark:border-slate-700/70 divide-y divide-slate-100 dark:divide-slate-800">
                          {recentTxs.map((tx) => {
                            const isDebtTx = tx.type === 'debt';
                            return (
                              <div
                                key={tx.id}
                                className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={`font-bold shrink-0 ${
                                      isDebtTx
                                        ? 'text-rose-600 dark:text-rose-400'
                                        : 'text-emerald-700 dark:text-emerald-400'
                                    }`}
                                  >
                                    {isDebtTx ? (isAr ? 'دين' : 'Debt') : (isAr ? 'دفع' : 'Paid')}
                                  </span>
                                  <span className="text-slate-700 dark:text-slate-300 truncate">
                                    {tx.notes || (isDebtTx ? 'تقييد دين' : 'سداد دين')}
                                  </span>
                                  <span className="text-slate-500 dark:text-slate-400 font-mono shrink-0">
                                    {new Date(tx.date).toLocaleDateString('ar-MA', {
                                      month: 'short',
                                      day: 'numeric'
                                    })}
                                  </span>
                                </div>
                                <span
                                  className={`font-bold tabular-nums shrink-0 ${
                                    isDebtTx
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-emerald-700 dark:text-emerald-400'
                                  }`}
                                >
                                  {isDebtTx ? '+' : '-'}{tx.amount.toFixed(2)} {currencySymbol}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Direct Actions Row */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openCreatePaymentModal(cust)}
                            className="min-h-[36px] px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all active:scale-95 flex items-center gap-1.5"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>{isAr ? 'إنشاء دفع الدين' : 'Create Payment'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setShowDebtorsDetailsModal(false);
                              setSelectedCustomerPageId(cust.id);
                            }}
                            className="min-h-[36px] px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white flex items-center gap-1.5"
                          >
                            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                            <span>{isAr ? 'صفحة الزبون' : 'Customer Page'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setStatementCustomer(cust)}
                            className="min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1.5"
                          >
                            <History className="w-3.5 h-3.5 text-slate-500" />
                            <span>{isAr ? 'كشف الحساب' : 'Statement'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setDebtInvoiceCustomer(cust)}
                            className="min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1.5"
                          >
                            <Printer className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                            <span>{isAr ? 'طبع فاتورة' : 'Print Debt Invoice'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setAddDebtModalCustomer(cust);
                              setNewDebtAmount(0);
                              setNewDebtNotes('');
                            }}
                            className="min-h-[36px] px-2.5 py-1.5 text-xs font-bold rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{isAr ? 'إضافة دين' : 'Add Debt'}</span>
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => openWhatsAppModal(cust)}
                          className="min-h-[36px] px-2.5 py-1.5 text-xs font-semibold rounded-xl text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{isAr ? 'واتساب' : 'WhatsApp'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 flex justify-end shrink-0 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowDebtorsDetailsModal(false)}
                className="min-h-[38px] px-5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Create Debt Payment / Settle Debt (إنشاء دفع الدين) */}
      {showCreatePaymentModal && settleModalCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <form
            onSubmit={handleSettleSubmit}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                    {isAr ? 'إنشاء دفع الدين' : 'Create Debt Payment'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {settleModalCustomer.name} · {settleModalCustomer.phone}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreatePaymentModal(false);
                  setSettleModalCustomer(null);
                }}
                className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Debtor Selector (allows choosing/switching any indebted customer) */}
            {debtorsList.length > 1 && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  {isAr ? 'اختر الزبون المدين:' : 'Select Debtor:'}
                </label>
                <select
                  value={settleModalCustomer.id}
                  onChange={(e) => {
                    const next = debtorsList.find((c) => c.id === e.target.value);
                    if (next) {
                      setSettleModalCustomer(next);
                      setSettleAmount(next.balance);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                >
                  {debtorsList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone}) — {c.balance.toFixed(2)} {currencySymbol}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Current Balance Banner */}
            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900 dark:text-amber-300">
                {isAr ? 'الرصيد الكلي المستحق بذمته:' : 'Current Debt:'}
              </span>
              <span className="text-lg font-black text-amber-700 dark:text-amber-400 tabular-nums font-mono">
                {settleModalCustomer.balance.toFixed(2)} {currencySymbol}
              </span>
            </div>

            {/* Quick Settle Presets */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                {isAr ? 'خيارات سريعة للمبلغ:' : 'Quick Amount Presets:'}
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                <button
                  type="button"
                  onClick={() => setSettleAmount(settleModalCustomer.balance)}
                  className={`py-2.5 px-1 text-xs font-bold rounded-xl border transition-all text-center ${
                    settleAmount === settleModalCustomer.balance
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {isAr ? 'كامل' : 'Full'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSettleAmount(Number((settleModalCustomer.balance / 2).toFixed(2)))
                  }
                  className={`py-2.5 px-1 text-xs font-bold rounded-xl border transition-all text-center ${
                    settleAmount === Number((settleModalCustomer.balance / 2).toFixed(2))
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {isAr ? 'النصف' : '50%'}
                </button>
                {[50, 100, 200].map((val) => {
                  const capped = Math.min(val, settleModalCustomer.balance);
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setSettleAmount(capped)}
                      className={`py-2.5 px-1 text-xs font-bold rounded-xl border transition-all text-center tabular-nums ${
                        settleAmount === capped
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Exact Amount input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? 'مبلغ الدفعة الآن' : 'Amount Paid'} ({currencySymbol}) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  max={settleModalCustomer.balance}
                  required
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-2.5 text-xl font-extrabold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white tabular-nums focus:border-emerald-500"
                />
                <span className="absolute end-4 top-1/2 -translate-y-1/2 font-bold text-slate-500 dark:text-slate-400">
                  {currencySymbol}
                </span>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 flex justify-between">
                <span>{isAr ? 'المتبقي بعد هذا الدفع:' : 'Remaining after payment:'}</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                  {Math.max(0, Number((settleModalCustomer.balance - settleAmount).toFixed(2)))}{' '}
                  {currencySymbol}
                </span>
              </div>
            </div>

            {/* Quick Note Chips & Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? 'ملاحظة أو طريقة الدفع (اختياري)' : 'Payment Notes (Optional)'}
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(isAr
                  ? ['دفعة نقدية بالصندوق', 'تحويل بنكي', 'دفعة جزئية']
                  : ['Cash payment', 'Bank transfer', 'Partial payment']
                ).map((presetNote) => (
                  <button
                    key={presetNote}
                    type="button"
                    onClick={() => setSettleNotes(presetNote)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      settleNotes === presetNote
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-400 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {presetNote}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={settleNotes}
                onChange={(e) => setSettleNotes(e.target.value)}
                placeholder={isAr ? 'مثال: دفعة نقدية بالصندوق، تسليم يدوي...' : 'e.g. Cash payment at register...'}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreatePaymentModal(false);
                  setSettleModalCustomer(null);
                }}
                className="flex-1 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="flex-2 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-2xl shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>{isAr ? 'تأكيد إنشاء دفع الدين' : 'Confirm Debt Payment'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: Add New Debt / Credit Purchase (تقييد كريدي جديد على الحساب) */}
      {addDebtModalCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <form
            onSubmit={handleAddDebtSubmit}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs">
                  <Plus className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    {isAr ? 'تقييد كريدي جديد على الحساب' : 'Record Credit Purchase'}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {addDebtModalCustomer.name} · <span className="font-mono">{addDebtModalCustomer.phone}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddDebtModalCustomer(null)}
                className="w-8 h-8 rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Balance Banner */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {isAr ? 'الرصيد السابق قبل التقييد:' : 'Previous Debt:'}
              </span>
              <span className="text-base font-extrabold text-slate-900 dark:text-white tabular-nums">
                {addDebtModalCustomer.balance.toFixed(2)} {currencySymbol}
              </span>
            </div>

            {/* Debt Amount input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? 'قيمة السلعة أو المبلغ المراد تقييده' : 'Credit Amount'} ({currencySymbol}) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  required
                  value={newDebtAmount || ''}
                  onChange={(e) => setNewDebtAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  autoFocus
                  className="w-full px-4 py-2.5 text-xl font-extrabold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white tabular-nums focus:border-amber-500"
                />
                <span className="absolute end-4 top-1/2 -translate-y-1/2 font-bold text-slate-500 dark:text-slate-400">
                  {currencySymbol}
                </span>
              </div>
              <div className="text-xs text-amber-700 dark:text-amber-400 font-semibold mt-1.5 flex justify-between">
                <span>{isAr ? 'الرصيد الإجمالي الجديد:' : 'New Total Debt:'}</span>
                <span className="tabular-nums font-bold">
                  {(addDebtModalCustomer.balance + (newDebtAmount || 0)).toFixed(2)} {currencySymbol}
                </span>
              </div>
            </div>

            {/* Details / Item Description */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? 'بيان السلع والملاحظات (مهم للتتبع)' : 'Items Description / Notes'} *
              </label>
              <input
                type="text"
                required
                value={newDebtNotes}
                onChange={(e) => setNewDebtNotes(e.target.value)}
                placeholder={isAr ? 'مثال: أخذ 5 لتر زيت لوسيور + 2 قالب سكر + شاي...' : 'e.g. 5L Olive oil, sugar, tea...'}
                className="w-full px-3.5 py-2.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setAddDebtModalCustomer(null)}
                className="flex-1 min-h-[40px] py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="flex-2 min-h-[40px] py-2.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-2xl shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>{isAr ? 'تقييد في الكناش' : 'Save to Ledger'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 3: WhatsApp Payment Reminder (إرسال تذكير بالكريدي عبر واتساب) */}
      {whatsappReminderCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                    {isAr ? 'إرسال تذكير بالكريدي عبر واتساب' : 'WhatsApp Debt Reminder'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {whatsappReminderCustomer.name} · {whatsappReminderCustomer.phone}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWhatsappReminderCustomer(null)}
                className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Debt Banner */}
            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-center justify-between text-xs">
              <span className="font-bold text-amber-900 dark:text-amber-300">
                {isAr ? 'المبلغ المذكور في الرسالة:' : 'Amount:'}
              </span>
              <span className="font-black text-amber-700 dark:text-amber-400 tabular-nums text-sm">
                {whatsappReminderCustomer.balance.toFixed(2)} {currencySymbol}
              </span>
            </div>

            {/* Editable message preview */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {isAr ? 'نص الرسالة (يمكنك تعديله قبل الإرسال):' : 'Message Text:'}
                </label>
                <button
                  type="button"
                  onClick={handleCopyWhatsApp}
                  className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold hover:underline flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedToast ? (isAr ? 'تم النسخ!' : 'Copied!') : (isAr ? 'نسخ النص' : 'Copy')}</span>
                </button>
              </div>
              <textarea
                rows={5}
                value={customWhatsAppMsg}
                onChange={(e) => setCustomWhatsAppMsg(e.target.value)}
                className="w-full p-3 text-xs leading-relaxed bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl focus:border-emerald-500 text-slate-900 dark:text-white"
              />
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setWhatsappReminderCustomer(null)}
                className="flex-1 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-2xl hover:bg-slate-200"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <a
                href={buildCustomerWhatsAppHref(whatsappReminderCustomer.phone, customWhatsAppMsg)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setWhatsappReminderCustomer(null)}
                className="flex-2 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-2xl shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>{isAr ? 'فتح وتثبيت الإرسال عبر واتساب' : 'Open in WhatsApp'}</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Customer Credit Statement / Ledger History (كشف حساب الكريدي) */}
      {statementCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shadow-xs">
                  <FileText className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                    {isAr ? 'كشف حساب كناش الكريدي' : 'Credit Ledger Statement'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {statementCustomer.name} · {statementCustomer.phone}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStatementCustomer(null)}
                className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Outstanding Box */}
            <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-900/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div>
                <span className="text-xs font-semibold text-amber-900 dark:text-amber-300 block">
                  {isAr ? 'الرصيد الحالي المعلق في الذمة:' : 'Current Outstanding Balance:'}
                </span>
                <span className="text-xl sm:text-2xl font-extrabold text-amber-700 dark:text-amber-400 tabular-nums">
                  {statementCustomer.balance.toFixed(2)} {currencySymbol}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {statementCustomer.balance > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const cust = statementCustomer;
                      setStatementCustomer(null);
                      openCreatePaymentModal(cust);
                    }}
                    className="min-h-[38px] px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isAr ? 'تسجيل دفع الدين' : 'Settle Now'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDebtInvoiceCustomer(statementCustomer)}
                  className="min-h-[38px] px-3.5 py-1.5 text-xs font-bold bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white rounded-xl shadow-xs flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isAr ? 'طبع فاتورة الدين بالمشتريات' : 'Print Debt Invoice'}</span>
                </button>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
              {selectedCustomerTransactions.length === 0 ? (
                <div className="py-12 text-center text-slate-500 dark:text-slate-400 text-xs">
                  {isAr ? 'لا توجد حركات كريدي مسجلة لهذا العميل حتى الآن' : 'No credit transactions recorded yet.'}
                </div>
              ) : (
                selectedCustomerTransactions.map((tx) => {
                  const isDebt = tx.type === 'debt';
                  const linkedOrder = tx.receiptNumber
                    ? orders.find((o) => o.orderNumber === tx.receiptNumber)
                    : undefined;
                  return (
                    <div
                      key={tx.id}
                      className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                            isDebt
                              ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
                              : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                          }`}
                        >
                          {isDebt ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                                isDebt
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              }`}
                            >
                              {isDebt ? (isAr ? 'تقييد دين' : 'Debt') : (isAr ? 'سداد وخلاص' : 'Payment')}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                              {new Date(tx.date).toLocaleDateString('ar-MA', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 font-medium mt-1 leading-relaxed">
                            {tx.notes || (isDebt ? (isAr ? 'أخذ سلعة على الحساب' : 'Item purchase') : (isAr ? 'سداد نقدي' : 'Cash repayment'))}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                            <span>{isAr ? 'سجلها:' : 'By:'} {tx.recordedBy || 'الكاشير'}</span>
                            {linkedOrder && (
                              <button
                                type="button"
                                onClick={() => setSelectedCreditOrder(linkedOrder)}
                                className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 font-semibold inline-flex items-center gap-1"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>{isAr ? `فاتورة مفصلة (${linkedOrder.items.length} سلع)` : 'Detailed Invoice'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Amount and balance impact */}
                      <div className="text-end">
                        <div
                          className={`text-sm font-extrabold tabular-nums ${
                            isDebt ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {isDebt ? '+' : '-'}{tx.amount.toFixed(2)} {currencySymbol}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                          {isAr ? 'الرصيد بعد العملية:' : 'New Bal:'} {tx.newBalance.toFixed(2)} {currencySymbol}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {selectedCustomerCreditOrders.length > 0 && (
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2 shrink-0">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>{isAr ? 'فواتير الزبون المفصلة بالمنتوجات والثمن:' : 'Customer Detailed Invoices:'}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCustomerCreditOrders.slice(0, 6).map((ord) => (
                    <button
                      key={ord.id}
                      type="button"
                      onClick={() => setSelectedCreditOrder(ord)}
                      className="px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 hover:bg-blue-50 text-xs font-bold font-mono flex items-center gap-1.5"
                    >
                      <span>{ord.orderNumber}</span>
                      <span className="text-slate-400">·</span>
                      <span className="tabular-nums">{ord.grandTotal.toFixed(2)} {currencySymbol}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setStatementCustomer(null)}
                className="px-5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Invoice Modal from Credit Ledger */}
      {selectedCreditOrder && (
        <ReceiptModal
          order={selectedCreditOrder}
          initialViewMode="detailed"
          onClose={() => setSelectedCreditOrder(null)}
        />
      )}

      {/* Customer Itemized Debt Invoice Print Modal */}
      {debtInvoiceCustomer && (
        <CustomerDebtInvoiceModal
          customer={debtInvoiceCustomer}
          onClose={() => setDebtInvoiceCustomer(null)}
        />
      )}

      {/* MODAL 5: Add New Customer to Ledger / Loyalty */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <form
            onSubmit={handleAddCustomerSubmit}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <Plus className="w-5 h-5 stroke-[3]" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                    {isAr ? 'إضافة زبون جديد في الكناش' : 'Add New Customer'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isAr ? 'تسجيل زبون في دفتر الكريدي وبرنامج الولاء' : 'Register for credit ledger & loyalty'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCustomerModal(false)}
                className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? 'اسم الزبون الكامل' : 'Customer Name'} *
              </label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={isAr ? 'مثال: الحاج إدريس الشريف' : 'e.g. Idriss Cherif'}
                autoFocus
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? 'رقم الهاتف / الواتساب' : 'Phone / WhatsApp'} *
              </label>
              <input
                type="tel"
                required
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="0661000000"
                className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            {/* Optional Initial Balance & Credit Limit */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'رصيد كريدي سابق (اختياري)' : 'Initial Debt'} ({currencySymbol})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={newInitialBalance || ''}
                  onChange={(e) => setNewInitialBalance(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'سقف الكريدي الأقصى (اختياري)' : 'Credit Limit'} ({currencySymbol})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={newCreditLimit}
                  onChange={(e) => setNewCreditLimit(e.target.value)}
                  placeholder={isAr ? 'مثال: 1000' : 'e.g. 1000'}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Neighborhood notes / address */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? 'ملاحظات الزبون أو العنوان بالحي (اختياري)' : 'Address / Neighborhood Notes (Optional)'}
              </label>
              <input
                type="text"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder={isAr ? 'مثال: درب القاضي، نجار الحي، يسدد أسبوعياً...' : 'e.g. Neighbor, carpenter...'}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Email ({isAr ? 'اختياري' : 'Optional'})
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="client@gmail.com"
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setShowAddCustomerModal(false)}
                className="flex-1 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-2xl hover:bg-slate-200"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="flex-2 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-2xl shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>{isAr ? 'حفظ وإضافة إلى الكناش' : 'Save Customer'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 6: Edit Customer Credit Limit */}
      {creditLimitModalCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const val = parseFloat(draftCreditLimit);
              updateCustomer(creditLimitModalCustomer.id, {
                creditLimit: val > 0 ? val : undefined
              });
              setCreditLimitModalCustomer(null);
            }}
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-black text-sm text-slate-900 dark:text-white">
                  {isAr ? 'تحديد سقف الكريدي الأقصى' : 'Set Customer Credit Limit'}
                </h3>
                <p className="text-xs text-slate-500">{creditLimitModalCustomer.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setCreditLimitModalCustomer(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? `السقف الأقصى (${currencySymbol}) — اتركه فارغاً لإلغاء السقف` : `Max Credit Limit (${currencySymbol})`}
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={draftCreditLimit}
                onChange={(e) => setDraftCreditLimit(e.target.value)}
                placeholder="1000"
                className="w-full px-3.5 py-2.5 text-base font-mono font-black bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCreditLimitModalCustomer(null)}
                className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black"
              >
                {isAr ? 'حفظ السقف' : 'Save Limit'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 7: Bulk WhatsApp Debt Reminders Campaign */}
      {showBulkReminderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900 dark:text-white">
                    {isAr ? 'حملة تذكير الزبناء بالكريدي عبر واتساب' : 'Bulk WhatsApp Debt Reminders'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isAr
                      ? `${debtorsList.length} زبون عليهم ديون — إرسال بنقرة واحدة مرتبة حسب الأولوية`
                      : `${debtorsList.length} indebted customers prioritized by risk`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkReminderModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl">
              {[...debtorsList]
                .sort((a, b) => {
                  const aOver = a.creditLimit && a.balance > a.creditLimit ? 1 : 0;
                  const bOver = b.creditLimit && b.balance > b.creditLimit ? 1 : 0;
                  return bOver - aOver || b.balance - a.balance;
                })
                .map((c) => {
                  const isOver = Boolean(c.creditLimit && c.balance > c.creditLimit);
                  const msg = buildPoliteDebtMessage(c);
                  return (
                    <div key={c.id} className="p-3.5 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            {c.name}
                          </span>
                          {isOver && (
                            <span className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold">
                              {isAr ? 'تجاوز السقف!' : 'Over Limit'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 font-mono mt-0.5">
                          {c.phone} ·{' '}
                          <span className="font-bold text-amber-700 dark:text-amber-400">
                            {c.balance.toFixed(2)} {currencySymbol}
                          </span>
                          {c.creditLimit ? ` / ${c.creditLimit} ${currencySymbol}` : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(msg)}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 flex items-center gap-1"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>{isAr ? 'نسخ' : 'Copy'}</span>
                        </button>
                        <a
                          href={buildCustomerWhatsAppHref(c.phone, msg)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{isAr ? 'إرسال واتساب' : 'Send WA'}</span>
                        </a>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      <ExportCreditLedgerGmailModal
        isOpen={showCreditGmailModal}
        onClose={() => setShowCreditGmailModal(false)}
      />

      {deletingCustomer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs"
          onClick={() => setDeletingCustomer(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  {isAr ? 'حذف الزبون' : 'Delete Customer'}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  {isAr
                    ? `هل أنت متأكد من حذف "${deletingCustomer.name}" نهائياً من النظام؟`
                    : `Are you sure you want to permanently delete "${deletingCustomer.name}"?`}
                </p>
                {deletingCustomer.balance > 0 && (
                  <div className="mt-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] font-bold text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      {isAr
                        ? `تنبيه: ما زال بذمته ${deletingCustomer.balance.toFixed(2)} ${currencySymbol} كريدي!`
                        : `Warning: Customer still owes ${deletingCustomer.balance.toFixed(2)} ${currencySymbol}!`}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeletingCustomer(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteCustomer(deletingCustomer.id);
                  setDeletingCustomer(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-xs"
              >
                {isAr ? 'تأكيد الحذف' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
