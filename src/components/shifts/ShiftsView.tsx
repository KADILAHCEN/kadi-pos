import React, { useState } from 'react';
import { usePos } from '../../context/PosContext';
import { getT } from '../../utils/translations';
import { Shift } from '../../types';
import {
  Clock,
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  AlertCircle,
  Printer,
  History,
  Lock,
  Unlock,
  CheckCircle2,
  X
} from 'lucide-react';

export const ShiftsView: React.FC = () => {
  const {
    currentShift,
    openNewShift,
    closeCurrentShift,
    addCashTransaction,
    shiftsHistory,
    currencySymbol,
    orders,
    language
  } = usePos();

  const t = getT(language);
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  // Modals
  const [showPayInModal, setShowPayInModal] = useState(false);
  const [showPayOutModal, setShowPayOutModal] = useState(false);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState<Shift | null>(null);

  // Form values
  const [txAmount, setTxAmount] = useState<number>(50);
  const [txReason, setTxReason] = useState<string>('');
  const [openFloat, setOpenFloat] = useState<number>(500);
  const [openCashier, setOpenCashier] = useState<string>('كاشير كادي');
  const [countedCash, setCountedCash] = useState<number>(500);

  // Compute live current shift numbers
  const shiftStartTime = new Date(currentShift.openedAt).getTime();
  const activeOrders = orders.filter(
    (o) => new Date(o.date).getTime() >= shiftStartTime && o.status === 'completed'
  );

  let liveCashSales = 0;
  let liveCardSales = 0;
  let liveApplePaySales = 0;
  let liveGrossSales = 0;
  let liveTaxes = 0;

  activeOrders.forEach((o) => {
    liveGrossSales += o.grandTotal;
    liveTaxes += o.taxTotal;
    if (o.paymentMethod === 'cash') liveCashSales += o.grandTotal;
    else if (o.paymentMethod === 'card') liveCardSales += o.grandTotal;
    else if (o.paymentMethod === 'apple_pay') liveApplePaySales += o.grandTotal;
    else if (o.paymentMethod === 'split' && o.splitDetails) {
      liveCashSales += o.splitDetails.cash || 0;
      liveCardSales += o.splitDetails.card || 0;
      liveApplePaySales += o.splitDetails.applePay || 0;
    }
  });

  let totalPayIns = 0;
  let totalPayOuts = 0;
  (currentShift.cashTransactions || []).forEach((tx) => {
    if (tx.type === 'pay_in') totalPayIns += tx.amount;
    if (tx.type === 'pay_out') totalPayOuts += tx.amount;
  });

  const expectedCashInDrawer =
    currentShift.startingCash + liveCashSales + totalPayIns - totalPayOuts;

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
    const closed = closeCurrentShift(countedCash);
    setShowCloseShiftModal(false);
    setShowReportModal(closed);
  };

  const handleOpenShift = (e: React.FormEvent) => {
    e.preventDefault();
    openNewShift(openFloat, openCashier);
    setShowOpenShiftModal(false);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-6 space-y-6">
      {/* Top Banner / Current Shift Overview */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span
              className={`px-3 py-1 text-xs font-extrabold rounded-full ${
                currentShift.status === 'open'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {currentShift.status === 'open' ? t.open_shift : t.closed_shift} · #{currentShift.shiftNumber}
            </span>
            <span className="text-xs text-slate-400 font-medium">
              {isAr ? 'بدأت في:' : 'Opened:'} {new Date(currentShift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">
            {currentShift.cashierName}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t.opening_float}: <span className="font-bold tabular-nums font-mono">{currentShift.startingCash.toFixed(2)} {currencySymbol}</span>
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {currentShift.status === 'open' ? (
            <>
              <button
                onClick={() => setShowPayInModal(true)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-emerald-700 dark:text-emerald-400 transition-colors flex items-center gap-1.5 shadow-2xs"
              >
                <ArrowDownRight className="w-4 h-4" />
                <span>{t.pay_in}</span>
              </button>
              <button
                onClick={() => setShowPayOutModal(true)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-rose-600 dark:text-rose-400 transition-colors flex items-center gap-1.5 shadow-2xs"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>{t.pay_out}</span>
              </button>
              <button
                onClick={() => {
                  setCountedCash(Number(expectedCashInDrawer.toFixed(2)));
                  setShowCloseShiftModal(true);
                }}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-rose-600 dark:hover:bg-rose-700 text-white transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Lock className="w-4 h-4" />
                <span>{t.close_shift_btn}</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowOpenShiftModal(true)}
              className="px-5 py-2.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-2 shadow-sm"
            >
              <Unlock className="w-4 h-4" />
              <span>{t.open_shift_btn}</span>
            </button>
          )}
        </div>
      </div>

      {/* Cash Register Breakdown Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {t.expected_cash}
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-1 tabular-nums font-mono">
            {expectedCashInDrawer.toFixed(2)} {currencySymbol}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            {isAr ? 'النقد الفعلي المفترض بالدرج' : 'Theoretical drawer cash'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isAr ? 'مبيعات الكاش' : 'Cash Sales'}
          </div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums font-mono">
            {liveCashSales.toFixed(2)} {currencySymbol}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            {isAr ? 'مقبوضات نقدية بالوردية' : 'Shift cash orders'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isAr ? 'مبيعات الشبكة ومدى' : 'Card & Mada Sales'}
          </div>
          <div className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1 tabular-nums font-mono">
            {liveCardSales.toFixed(2)} {currencySymbol}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            {isAr ? 'عمليات البطاقة الإلكترونية' : 'Electronic POS transactions'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isAr ? 'إجمالي مبيعات الوردية' : 'Gross Shift Sales'}
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-1 tabular-nums font-mono">
            {liveGrossSales.toFixed(2)} {currencySymbol}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            {activeOrders.length} {isAr ? 'طلب مكتمل' : 'completed orders'}
          </div>
        </div>
      </div>

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
                placeholder={isAr ? 'مثال: تغذية الصندوق، استرداد فكة...' : 'Reason for pay in...'}
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
                placeholder={isAr ? 'مثال: شراء بن، مصاريف نقل، إيداع بنكي...' : 'Reason for payout...'}
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

      {/* Close Shift Modal (Z-Report) */}
      {showCloseShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form
            onSubmit={handleCloseShift}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                {t.close_shift_btn}
              </h3>
              <button
                type="button"
                onClick={() => setShowCloseShiftModal(false)}
                className="text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>{t.opening_float}:</span>
                <span className="font-mono font-bold">{currentShift.startingCash.toFixed(2)} {currencySymbol}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>{isAr ? 'مبيعات الكاش' : 'Cash Sales'}:</span>
                <span className="font-mono font-bold">+{liveCashSales.toFixed(2)} {currencySymbol}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>{isAr ? 'صافي الإيداعات والسحوبات' : 'Net Pay in/out'}:</span>
                <span className="font-mono font-bold">{(totalPayIns - totalPayOuts).toFixed(2)} {currencySymbol}</span>
              </div>
              <div className="flex justify-between text-sm font-extrabold pt-2 border-t border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">
                <span>{t.expected_cash}:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">{expectedCashInDrawer.toFixed(2)} {currencySymbol}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {t.actual_counted} ({currencySymbol}) *
              </label>
              <input
                type="number"
                step="any"
                required
                value={countedCash}
                onChange={(e) => setCountedCash(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2.5 text-2xl font-black font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-center"
              />
            </div>

            {/* Discrepancy Preview */}
            <div className="text-center">
              <span
                className={`px-3 py-1 rounded-xl text-xs font-bold ${
                  countedCash - expectedCashInDrawer === 0
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                    : countedCash - expectedCashInDrawer > 0
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-rose-50 text-rose-700'
                }`}
              >
                {t.discrepancy}: {(countedCash - expectedCashInDrawer).toFixed(2)} {currencySymbol}{' '}
                {countedCash - expectedCashInDrawer === 0
                  ? (isAr ? '(متطابق)' : '(Balanced)')
                  : countedCash - expectedCashInDrawer > 0
                  ? (isAr ? '(فائض)' : '(Over)')
                  : (isAr ? '(عجز)' : '(Short)')}
              </span>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-2xl font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 transition-colors shadow-sm"
            >
              {isAr ? 'إغلاق الوردية وإصدار تقرير Z-Report' : 'Close Shift & Print Z-Report'}
            </button>
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
                {t.opening_float} ({currencySymbol})
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
              {isAr ? 'فتح الوردية وبدء العمل' : 'Start Shift'}
            </button>
          </form>
        </div>
      )}

      {/* Z-Report Thermal Preview Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white">
                {t.z_report} #{showReportModal.shiftNumber}
              </h3>
              <button onClick={() => setShowReportModal(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl font-mono text-xs space-y-1.5">
              <div className="flex justify-between">
                <span>{isAr ? 'إجمالي المبيعات' : 'Gross'}:</span>
                <span className="font-bold">{showReportModal.grossSales?.toFixed(2)} {currencySymbol}</span>
              </div>
              <div className="flex justify-between">
                <span>{t.vat_tax}:</span>
                <span>{showReportModal.taxesCollected?.toFixed(2)} {currencySymbol}</span>
              </div>
              <div className="flex justify-between">
                <span>{isAr ? 'مبيعات الكاش' : 'Cash'}:</span>
                <span>{showReportModal.totalCashSales?.toFixed(2)} {currencySymbol}</span>
              </div>
              <div className="flex justify-between">
                <span>{isAr ? 'مبيعات الشبكة' : 'Card'}:</span>
                <span>{showReportModal.totalCardSales?.toFixed(2)} {currencySymbol}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700 font-bold">
                <span>{t.discrepancy}:</span>
                <span className={showReportModal.discrepancy === 0 ? 'text-emerald-600' : 'text-rose-600'}>
                  {showReportModal.discrepancy?.toFixed(2)} {currencySymbol}
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                window.print();
                setShowReportModal(null);
              }}
              className="w-full py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span>{isAr ? 'طباعة تقرير الإغلاق' : 'Print Z-Report'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
