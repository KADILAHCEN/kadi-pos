import React, { useState } from 'react';
import { usePos } from '../../context/PosContext';
import { getT } from '../../utils/translations';
import { PaymentMethod, SplitPaymentDetail, Order } from '../../types';
import {
  Banknote,
  CreditCard,
  Smartphone,
  PieChart,
  UserCheck,
  CheckCircle2,
  X,
  AlertCircle,
  User,
  Plus,
  Search,
  BookOpen
} from 'lucide-react';

interface CheckoutModalProps {
  onClose: () => void;
  onSuccess: (order: Order) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({ onClose, onSuccess }) => {
  const {
    cartGrandTotal,
    currencySymbol,
    completeCheckout,
    selectedCustomer,
    setSelectedCustomer,
    customers,
    addCustomer,
    language
  } = usePos();

  const t = getT(language);
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amountTenderedStr, setAmountTenderedStr] = useState<string>(cartGrandTotal.toString());

  // Split payment state
  const [splitCash, setSplitCash] = useState<number>(0);
  const [splitCard, setSplitCard] = useState<number>(0);

  // Carnet de Crédit (البيع بالكريدي) state
  const [creditNote, setCreditNote] = useState<string>('');
  const [custSearchQuery, setCustSearchQuery] = useState<string>('');
  const [showAddCustomer, setShowAddCustomer] = useState<boolean>(false);
  const [newCustName, setNewCustName] = useState<string>('');
  const [newCustPhone, setNewCustPhone] = useState<string>('');

  const amountTendered = parseFloat(amountTenderedStr) || 0;
  const changeDue = Math.max(0, Number((amountTendered - cartGrandTotal).toFixed(2)));

  // Fast tender presets
  const presets = [
    cartGrandTotal,
    Math.ceil(cartGrandTotal / 10) * 10,
    Math.ceil(cartGrandTotal / 50) * 50,
    100,
    200,
    500
  ].filter((v, idx, arr) => v >= cartGrandTotal && arr.indexOf(v) === idx);

  const handleKeyClick = (key: string) => {
    if (key === 'C') {
      setAmountTenderedStr('0');
      return;
    }
    if (key === 'BS') {
      setAmountTenderedStr((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
      return;
    }
    if (key === '.') {
      if (!amountTenderedStr.includes('.')) {
        setAmountTenderedStr((prev) => prev + '.');
      }
      return;
    }
    setAmountTenderedStr((prev) => (prev === '0' ? key : prev + key));
  };

  const handleComplete = () => {
    let splitDetails: SplitPaymentDetail | undefined = undefined;

    if (method === 'split') {
      const splitTotal = splitCash + splitCard;
      if (Math.abs(splitTotal - cartGrandTotal) > 0.05) {
        alert(isAr ? 'مجموع المبالغ المجزأة يجب أن يساوي إجمالي الفاتورة' : 'Split sum must equal total');
        return;
      }
      splitDetails = { cash: splitCash, card: splitCard };
    }

    if (method === 'credit' && !selectedCustomer) {
      alert(isAr ? 'يجب تحديد عميل لإتمام البيع الآجل' : 'Customer required for credit sale');
      return;
    }

    const completed = completeCheckout(
      method,
      splitDetails,
      method === 'cash' ? amountTendered : cartGrandTotal,
      creditNote.trim() || undefined
    );

    if (completed) {
      onSuccess(completed);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-lg">
              {t.checkout}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.points} pts)` : t.guest_customer}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Total Banner */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-medium">{t.total_to_pay}</div>
            <div className="text-3xl font-black font-mono tracking-tight tabular-nums text-emerald-400">
              {cartGrandTotal.toFixed(2)}{' '}
              <span className="text-lg font-sans text-white">{currencySymbol}</span>
            </div>
          </div>

          {method === 'cash' && (
            <div className="text-right rtl:text-left">
              <div className="text-xs text-slate-400 font-medium">{t.change_due}</div>
              <div className="text-2xl font-black font-mono tabular-nums text-amber-400">
                {changeDue.toFixed(2)} {currencySymbol}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 space-y-5">
          {/* Payment Method Selector */}
          <div className="grid grid-cols-5 gap-2">
            {[
              { id: 'cash' as const, label: t.cash, icon: Banknote },
              { id: 'card' as const, label: t.card, icon: CreditCard },
              { id: 'apple_pay' as const, label: t.apple_pay, icon: Smartphone },
              { id: 'split' as const, label: t.split, icon: PieChart },
              { id: 'credit' as const, label: t.credit, icon: UserCheck },
            ].map((m) => {
              const Icon = m.icon;
              const isSelected = method === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={`py-3 px-2 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 ring-2 ring-emerald-600/30'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="text-[11px] font-bold leading-tight line-clamp-1">{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* Cash Mode Options */}
          {method === 'cash' && (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">
                  {isAr ? 'المبالغ المقترحة السريعة:' : 'Quick Cash Tender:'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {presets.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setAmountTenderedStr(val.toString())}
                      className={`py-2 px-3.5 text-xs font-bold rounded-xl border transition-colors tabular-nums ${
                        amountTenderedStr === val.toString()
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {val.toFixed(2)} {currencySymbol}
                    </button>
                  ))}
                </div>
              </div>

              {/* Keypad */}
              <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'BS'].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleKeyClick(key)}
                    className={`py-2 text-base font-bold rounded-xl active:scale-95 transition-colors ${
                      key === 'BS'
                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200'
                    }`}
                  >
                    {key === 'BS' ? (isAr ? 'مسح' : 'Del') : key}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Split Mode Options */}
          {method === 'split' && (
            <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? 'تجزئة المبلغ بين نقد وبطاقة:' : 'Split between Cash & Card:'}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    {t.cash} ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={splitCash || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setSplitCash(val);
                      setSplitCard(Math.max(0, Number((cartGrandTotal - val).toFixed(2))));
                    }}
                    className="w-full px-3 py-2 text-base font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    {t.card} ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={splitCard || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setSplitCard(val);
                      setSplitCash(Math.max(0, Number((cartGrandTotal - val).toFixed(2))));
                    }}
                    className="w-full px-3 py-2 text-base font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>
              <div className="text-xs text-slate-500 text-center">
                {isAr ? 'المجموع المجزأ:' : 'Split total:'}{' '}
                <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                  {(splitCash + splitCard).toFixed(2)} / {cartGrandTotal.toFixed(2)} {currencySymbol}
                </span>
              </div>
            </div>
          )}

          {/* Carnet de Crédit (البيع بالكريدي للزبون) */}
          {method === 'credit' && (
            <div className="space-y-3 p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                  <span className="font-extrabold text-xs text-amber-950 dark:text-amber-200">
                    {isAr ? 'دفتر الكريدي المغربي (Carnet de Crédit)' : 'Customer Credit Ledger (Tab)'}
                  </span>
                </div>
                {selectedCustomer && (
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:underline"
                  >
                    {isAr ? 'تغيير الزبون' : 'Change'}
                  </button>
                )}
              </div>

              {!selectedCustomer ? (
                /* No Customer Selected - Search or Quick Add */
                <div className="space-y-2.5">
                  <p className="text-[11px] text-amber-800 dark:text-amber-300">
                    {isAr ? 'اختر الزبون لتسجيل الفاتورة في حسابه، أو أضف زبوناً جديداً فوراً:' : 'Select a customer or register a new one to record credit:'}
                  </p>

                  <div className="relative">
                    <Search className="absolute right-3 rtl:right-3 rtl:left-auto left-3 rtl:right-auto top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={custSearchQuery}
                      onChange={(e) => setCustSearchQuery(e.target.value)}
                      placeholder={isAr ? 'ابحث بالاسم أو رقم الهاتف...' : 'Search customer...'}
                      className="w-full py-2 px-8 text-xs bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-xl focus:border-amber-500"
                    />
                  </div>

                  {/* Customer Quick List */}
                  <div className="max-h-36 overflow-y-auto divide-y divide-amber-100 dark:divide-amber-900/40 bg-white dark:bg-slate-900 rounded-xl border border-amber-200/70 dark:border-amber-800">
                    {customers
                      .filter(
                        (c) =>
                          c.name.toLowerCase().includes(custSearchQuery.toLowerCase()) ||
                          c.phone.includes(custSearchQuery)
                      )
                      .slice(0, 5)
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedCustomer(c)}
                          className="w-full p-2 text-start flex items-center justify-between hover:bg-amber-50 dark:hover:bg-amber-950/50 transition-colors"
                        >
                          <div>
                            <div className="font-bold text-xs text-slate-900 dark:text-white">
                              {c.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {c.phone}
                            </div>
                          </div>
                          <div className="text-end">
                            <span className={`text-[11px] font-bold tabular-nums ${c.balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                              {isAr ? 'الكريدي السابق:' : 'Tab:'} {c.balance.toFixed(2)} {currencySymbol}
                            </span>
                          </div>
                        </button>
                      ))}
                  </div>

                  {/* Quick Add Button or Form */}
                  {!showAddCustomer ? (
                    <button
                      type="button"
                      onClick={() => setShowAddCustomer(true)}
                      className="w-full py-2 text-xs font-bold text-amber-800 dark:text-amber-300 border border-dashed border-amber-300 dark:border-amber-800 rounded-xl hover:bg-amber-100/50 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isAr ? '+ تسجيل زبون جديد فوراً في الدفتر' : '+ Register new customer tab'}</span>
                    </button>
                  ) : (
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-amber-200 dark:border-amber-800 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder={isAr ? 'اسم الزبون (مثال: سي محمد)' : 'Customer name'}
                          value={newCustName}
                          onChange={(e) => setNewCustName(e.target.value)}
                          className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                        <input
                          type="tel"
                          placeholder={isAr ? 'رقم الهاتف' : 'Phone'}
                          value={newCustPhone}
                          onChange={(e) => setNewCustPhone(e.target.value)}
                          className="px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddCustomer(false)}
                          className="flex-1 py-1.5 text-xs font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg"
                        >
                          {isAr ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (newCustName.trim() && newCustPhone.trim()) {
                              addCustomer({
                                name: newCustName.trim(),
                                phone: newCustPhone.trim()
                              });
                              setShowAddCustomer(false);
                              setNewCustName('');
                              setNewCustPhone('');
                            }
                          }}
                          className="flex-1 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg"
                        >
                          {isAr ? 'حفظ واختيار' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Customer Selected - Carnet Ledger Breakdown */
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-amber-800/80 space-y-2 text-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <div className="font-extrabold text-slate-900 dark:text-white text-sm">
                          {selectedCustomer.name}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {selectedCustomer.phone}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        {isAr ? 'دفتر الكريدي' : 'Credit Account'}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>{isAr ? 'الكريدي السابق بالدفتر:' : 'Previous balance:'}</span>
                        <span className="font-bold font-mono tabular-nums">
                          {selectedCustomer.balance.toFixed(2)} {currencySymbol}
                        </span>
                      </div>
                      <div className="flex justify-between text-amber-700 dark:text-amber-400 font-semibold">
                        <span>{isAr ? '+ فاتورة المشتريات الحالية:' : '+ Current purchase:'}</span>
                        <span className="font-bold font-mono tabular-nums">
                          +{cartGrandTotal.toFixed(2)} {currencySymbol}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm font-black text-amber-950 dark:text-amber-200 pt-1.5 border-t border-dashed border-amber-200 dark:border-amber-800">
                        <span>{isAr ? '= مجموع الكريدي الجديد:' : '= New Total Debt:'}</span>
                        <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                          {(selectedCustomer.balance + cartGrandTotal).toFixed(2)} {currencySymbol}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Credit Note Input */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      {isAr ? 'ملاحظة الكريدي (اختياري):' : 'Credit note (optional):'}
                    </label>
                    <input
                      type="text"
                      value={creditNote}
                      onChange={(e) => setCreditNote(e.target.value)}
                      placeholder={isAr ? 'مثال: أخذ السلعة مع الابن، الدفع في رأس الشهر...' : 'e.g. Due end of month'}
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-amber-500"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Final Payment Button */}
          <button
            type="button"
            onClick={handleComplete}
            disabled={
              (method === 'cash' && amountTendered < cartGrandTotal) ||
              (method === 'credit' && !selectedCustomer)
            }
            className={`w-full py-4 px-4 rounded-2xl font-extrabold text-base text-white active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-2 shadow-xl ${
              method === 'credit'
                ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
            }`}
          >
            {method === 'credit' ? (
              <>
                <BookOpen className="w-5 h-5" />
                <span>
                  {selectedCustomer
                    ? isAr
                      ? `تسجيل في دفتر الكريدي (${(selectedCustomer.balance + cartGrandTotal).toFixed(2)} ${currencySymbol})`
                      : `Charge to Tab (${(selectedCustomer.balance + cartGrandTotal).toFixed(2)} ${currencySymbol})`
                    : isAr
                    ? 'اختر زبوناً لإتمام البيع بالكريدي'
                    : 'Select a customer'}
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span>{t.confirm_payment}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
