import React, { useEffect, useState } from 'react';
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
  BookOpen,
  Gift,
  MessageCircle,
  AlertTriangle
} from 'lucide-react';
import {
  computeCumulativeLoyaltyPoints,
  computeCustomerVisitInsight
} from '../../utils/customerInsights';

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
    orders,
    addCustomer,
    settings,
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

  // Carnet de Crédit & Customer picker state
  const [creditNote, setCreditNote] = useState<string>('');
  const [custSearchQuery, setCustSearchQuery] = useState<string>('');
  const [showCustomerPicker, setShowCustomerPicker] = useState<boolean>(false);
  const [showAddCustomer, setShowAddCustomer] = useState<boolean>(false);
  const [newCustName, setNewCustName] = useState<string>('');
  const [newCustPhone, setNewCustPhone] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Loyalty configuration & redemption state
  const loyaltyEnabled = settings.loyaltyEnabled !== false;
  const pointsPer100 = Math.max(0, Number(settings.loyaltyPointsPer100 ?? 10));
  const pointValue = Math.max(0, Number(settings.loyaltyPointValue ?? 1));

  const maxRedeemablePoints =
    loyaltyEnabled && selectedCustomer && pointValue > 0
      ? Math.min(
          Math.max(0, Math.floor(selectedCustomer.points)),
          Math.floor(cartGrandTotal / pointValue + 1e-9)
        )
      : 0;

  const [pointsToRedeem, setPointsToRedeem] = useState<number>(0);

  useEffect(() => {
    setPointsToRedeem((prev) => {
      if (!loyaltyEnabled || !selectedCustomer) return 0;
      return Math.min(Math.max(0, Math.floor(prev)), maxRedeemablePoints);
    });
  }, [selectedCustomer?.id, maxRedeemablePoints, loyaltyEnabled]);

  const clampedPointsToRedeem =
    loyaltyEnabled && selectedCustomer
      ? Math.min(Math.max(0, Math.floor(pointsToRedeem)), maxRedeemablePoints)
      : 0;
  const loyaltyDiscount = Number(
    Math.min(cartGrandTotal, clampedPointsToRedeem * pointValue).toFixed(2)
  );
  const payableTotal = Number(Math.max(0, cartGrandTotal - loyaltyDiscount).toFixed(2));
  const previewLoyalty = selectedCustomer
    ? computeCumulativeLoyaltyPoints(
        payableTotal,
        selectedCustomer.loyaltyCarrySpend || 0,
        pointsPer100,
        loyaltyEnabled
      )
    : { pointsEarned: 0, nextCarrySpend: 0 };
  const previewPointsEarned = previewLoyalty.pointsEarned;
  const selectedCustomerInsight = computeCustomerVisitInsight(
    selectedCustomer,
    orders,
    settings.storeName
  );

  useEffect(() => {
    setAmountTenderedStr(payableTotal.toString());
    if (method === 'split') {
      setSplitCash(payableTotal);
      setSplitCard(0);
    }
    setValidationError(null);
  }, [payableTotal, method]);

  const amountTendered = parseFloat(amountTenderedStr) || 0;
  const changeDue = Math.max(0, Number((amountTendered - payableTotal).toFixed(2)));

  // Fast tender presets based on payableTotal after loyalty discount
  const presets = [
    payableTotal,
    Math.ceil(payableTotal / 10) * 10,
    Math.ceil(payableTotal / 50) * 50,
    100,
    200,
    500
  ].filter((v, idx, arr) => v >= payableTotal && arr.indexOf(v) === idx);

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
    setValidationError(null);
    let splitDetails: SplitPaymentDetail | undefined = undefined;

    if (method === 'split') {
      const splitTotal = splitCash + splitCard;
      if (Math.abs(splitTotal - payableTotal) > 0.05) {
        setValidationError(
          isAr
            ? 'مجموع المبالغ المجزأة يجب أن يساوي صافي الفاتورة المطلوب دفعه'
            : isFr
            ? 'La somme Cash + Carte doit égaler le total net'
            : 'Split sum must equal net payable total'
        );
        return;
      }
      splitDetails = { cash: splitCash, card: splitCard };
    }

    if (method === 'credit' && !selectedCustomer) {
      setValidationError(
        isAr
          ? 'يجب تحديد زبون لإتمام البيع الآجل'
          : isFr
          ? 'Veuillez sélectionner un client pour la vente à crédit'
          : 'Customer required for credit sale'
      );
      return;
    }

    const completed = completeCheckout(
      method,
      splitDetails,
      method === 'cash' ? amountTendered : payableTotal,
      creditNote.trim() || undefined,
      clampedPointsToRedeem > 0 ? { pointsToRedeem: clampedPointsToRedeem } : undefined
    );

    if (completed) {
      onSuccess(completed);
    }
  };

  const filteredCustomers = customers
    .filter(
      (c) =>
        c.name.toLowerCase().includes(custSearchQuery.toLowerCase()) ||
        c.phone.includes(custSearchQuery)
    )
    .slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg max-h-[92vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 shrink-0">
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-lg">
              {t.checkout}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {selectedCustomer
                ? `${selectedCustomer.name} (${selectedCustomer.points} pts)`
                : t.guest_customer}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Total Banner */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div>
            <div className="text-xs text-slate-400 font-medium">{t.total_to_pay}</div>
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <div className="text-3xl font-black font-mono tracking-tight tabular-nums text-emerald-400">
                {payableTotal.toFixed(2)}{' '}
                <span className="text-lg font-sans text-white">{currencySymbol}</span>
              </div>
              {loyaltyDiscount > 0 && (
                <span className="text-xs font-mono text-slate-400 line-through">
                  {cartGrandTotal.toFixed(2)} {currencySymbol}
                </span>
              )}
            </div>
            {loyaltyDiscount > 0 && (
              <div className="text-[11px] font-bold text-amber-300 mt-0.5">
                {isAr
                  ? `خصم نقاط الولاء: -${loyaltyDiscount.toFixed(2)} ${currencySymbol} (${clampedPointsToRedeem} نقطة)`
                  : `Loyalty discount: -${loyaltyDiscount.toFixed(2)} ${currencySymbol} (${clampedPointsToRedeem} pts)`}
              </div>
            )}
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

        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Quick Customer Link & Loyalty Selector (when not in credit card mode) */}
          {method !== 'credit' && (
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <User className="w-4 h-4 text-emerald-600 shrink-0" />
                  {selectedCustomer ? (
                    <div className="truncate">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                        {selectedCustomer.name}
                      </span>
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono ms-2">
                        {selectedCustomer.points} pts
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 truncate">
                      {isAr
                        ? 'ربط زبون لكسب أو استبدال النقاط'
                        : isFr
                        ? 'Associer un client (points de fidélité)'
                        : 'Link customer to earn or redeem points'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {selectedCustomer && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomer(null);
                        setPointsToRedeem(0);
                      }}
                      className="text-[11px] font-bold text-rose-600 hover:underline"
                    >
                      {isAr ? 'إزالة' : 'Remove'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowCustomerPicker((v) => !v)}
                    className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100"
                  >
                    {selectedCustomer
                      ? isAr
                        ? 'تغيير'
                        : 'Change'
                      : showCustomerPicker
                      ? isAr
                        ? 'إغلاق'
                        : 'Close'
                      : isAr
                      ? 'اختيار زبون'
                      : 'Select'}
                  </button>
                </div>
              </div>

              {selectedCustomer &&
                selectedCustomerInsight &&
                (selectedCustomerInsight.isAbsent15Days ||
                  selectedCustomerInsight.isReturningCustomer) && (
                  <div
                    className={`px-3 py-2 rounded-xl border text-[11px] font-bold flex items-center justify-between gap-2 ${
                      selectedCustomerInsight.isAbsent15Days
                        ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex items-start gap-1.5 min-w-0">
                      {selectedCustomerInsight.isAbsent15Days && (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <span className="leading-snug">
                        {selectedCustomerInsight.isAbsent15Days
                          ? isAr
                            ? `هاد الزبون غبر عليك ${selectedCustomerInsight.daysSinceLastVisit} يوم! سيفط ليه مساج: توحشناك، عندنا سلعة جديدة`
                            : `Absent ${selectedCustomerInsight.daysSinceLastVisit} days — send win-back message`
                          : isAr
                          ? `هاد الزبون شرى عندك ${selectedCustomerInsight.visits} مرات من قبل، مجموع ${selectedCustomerInsight.totalSpent.toFixed(0)} ${currencySymbol}`
                          : `${selectedCustomerInsight.visits} prior visits · ${selectedCustomerInsight.totalSpent.toFixed(0)} ${currencySymbol}`}
                      </span>
                    </div>
                    {selectedCustomerInsight.isAbsent15Days &&
                      selectedCustomerInsight.whatsappWinBackHref && (
                        <a
                          href={selectedCustomerInsight.whatsappWinBackHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black flex items-center gap-1 whitespace-nowrap shrink-0"
                        >
                          <MessageCircle className="w-3 h-3" />
                          <span>{isAr ? 'واتساب' : 'WhatsApp'}</span>
                        </a>
                      )}
                  </div>
                )}

              {showCustomerPicker && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute right-3 rtl:right-3 rtl:left-auto left-3 rtl:right-auto top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={custSearchQuery}
                        onChange={(e) => setCustSearchQuery(e.target.value)}
                        placeholder={isAr ? 'ابحث بالاسم أو رقم الهاتف...' : 'Search name or phone...'}
                        className="w-full py-1.5 px-8 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const q = custSearchQuery.trim();
                        const looksLikePhone = /^[\d+\s\-()]{6,}$/.test(q);
                        setNewCustName(looksLikePhone ? '' : q);
                        setNewCustPhone(looksLikePhone ? q : '');
                        setShowAddCustomer((v) => !v);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isAr ? 'زبون جديد' : 'New'}</span>
                    </button>
                  </div>

                  {showAddCustomer && (
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={newCustName}
                          onChange={(e) => setNewCustName(e.target.value)}
                          placeholder={isAr ? 'اسم الزبون (اختياري مع الهاتف)' : 'Customer name'}
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                        <input
                          type="tel"
                          value={newCustPhone}
                          onChange={(e) => setNewCustPhone(e.target.value)}
                          placeholder={isAr ? 'رقم الهاتف (اختياري)' : 'Phone (optional)'}
                          className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddCustomer(false)}
                          className="px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-700"
                        >
                          {isAr ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                          type="button"
                          disabled={!newCustName.trim() && !newCustPhone.trim()}
                          onClick={() => {
                            const cleanName = newCustName.trim() || newCustPhone.trim();
                            const cleanPhone = newCustPhone.trim() || '-';
                            const existingByPhone =
                              cleanPhone !== '-'
                                ? customers.find(
                                    (c) =>
                                      c.phone.replace(/\D+/g, '') ===
                                      cleanPhone.replace(/\D+/g, '')
                                  )
                                : undefined;
                            if (existingByPhone) {
                              setSelectedCustomer(existingByPhone);
                            } else {
                              const created = addCustomer({ name: cleanName, phone: cleanPhone });
                              setSelectedCustomer(created);
                            }
                            setNewCustName('');
                            setNewCustPhone('');
                            setCustSearchQuery('');
                            setShowAddCustomer(false);
                            setShowCustomerPicker(false);
                          }}
                          className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[11px] font-black"
                        >
                          {isAr ? 'حفظ وربط الزبون' : 'Save & Link'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="max-h-32 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                    {filteredCustomers.length > 0 ? (
                      filteredCustomers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedCustomer(c);
                            setShowCustomerPicker(false);
                            setShowAddCustomer(false);
                          }}
                          className="w-full p-2 text-start flex items-center justify-between hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                        >
                          <div>
                            <div className="font-bold text-xs text-slate-900 dark:text-white">{c.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{c.phone}</div>
                          </div>
                          <span className="text-[11px] font-bold font-mono text-emerald-600 dark:text-emerald-400">
                            {c.points} pts
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="p-2.5 text-center text-[11px] text-slate-500">
                        {isAr ? 'لا يوجد زبون مطابق — اضغط "زبون جديد" لإضافته فوراً' : 'No match — click New to add'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Loyalty Points Redemption & Earn Card */}
          {loyaltyEnabled && selectedCustomer && (
            <div className="p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800/70 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Gift className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                    {isAr ? 'نقاط الولاء للزبون' : isFr ? 'Points de fidélité' : 'Customer Loyalty Points'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-bold">
                  <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 font-mono border border-emerald-200 dark:border-emerald-800">
                    {selectedCustomer.points} pts
                    {pointValue > 0 && (
                      <span className="text-slate-400 ms-1">
                        ({(selectedCustomer.points * pointValue).toFixed(2)} {currencySymbol})
                      </span>
                    )}
                  </span>
                  {previewPointsEarned > 0 && (
                    <span className="text-emerald-700 dark:text-emerald-400 font-mono">
                      +{previewPointsEarned} {isAr ? 'مكتسبة' : 'earned'}
                    </span>
                  )}
                </div>
              </div>

              {maxRedeemablePoints > 0 ? (
                <div className="space-y-2 pt-1 border-t border-emerald-200/70 dark:border-emerald-800/60">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      {isAr
                        ? `استبدال النقاط كخصم (1 نقطة = ${pointValue} ${currencySymbol}):`
                        : `Redeem points (1 pt = ${pointValue} ${currencySymbol}):`}
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPointsToRedeem(0)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${
                          clampedPointsToRedeem === 0
                            ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        0
                      </button>
                      <button
                        type="button"
                        onClick={() => setPointsToRedeem(maxRedeemablePoints)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                          clampedPointsToRedeem === maxRedeemablePoints
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                        }`}
                      >
                        {isAr
                          ? `استعمال الكل (${maxRedeemablePoints})`
                          : `Max (${maxRedeemablePoints})`}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={maxRedeemablePoints}
                      step={1}
                      value={clampedPointsToRedeem === 0 ? '' : clampedPointsToRedeem}
                      placeholder="0"
                      onChange={(e) => {
                        const raw = Math.floor(Number(e.target.value) || 0);
                        setPointsToRedeem(Math.min(maxRedeemablePoints, Math.max(0, raw)));
                      }}
                      className="w-28 px-3 py-1.5 text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-xl"
                    />
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                      {clampedPointsToRedeem > 0
                        ? isAr
                          ? `= خصم -${loyaltyDiscount.toFixed(2)} ${currencySymbol}`
                          : `= -${loyaltyDiscount.toFixed(2)} ${currencySymbol} off`
                        : isAr
                        ? `الحد الأقصى المتاح: ${maxRedeemablePoints} نقطة`
                        : `Up to ${maxRedeemablePoints} pts available`}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isAr
                    ? `سيكسب الزبون +${previewPointsEarned} نقطة عند إتمام الدفع (${pointsPer100} نقطة لكل 100 ${currencySymbol})`
                    : `Earns +${previewPointsEarned} pts on this purchase (${pointsPer100} pts / 100 ${currencySymbol})`}
                </div>
              )}
            </div>
          )}

          {/* Validation Notice */}
          {validationError && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

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
                      setSplitCard(Math.max(0, Number((payableTotal - val).toFixed(2))));
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
                      setSplitCash(Math.max(0, Number((payableTotal - val).toFixed(2))));
                    }}
                    className="w-full px-3 py-2 text-base font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>
              <div className="text-xs text-slate-500 text-center">
                {isAr ? 'المجموع المجزأ:' : 'Split total:'}{' '}
                <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                  {(splitCash + splitCard).toFixed(2)} / {payableTotal.toFixed(2)} {currencySymbol}
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
                    onClick={() => {
                      setSelectedCustomer(null);
                      setPointsToRedeem(0);
                    }}
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
                    {isAr
                      ? 'اختر الزبون لتسجيل الفاتورة في حسابه، أو أضف زبوناً جديداً فوراً:'
                      : 'Select a customer or register a new one to record credit:'}
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
                    {filteredCustomers.map((c) => (
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
                          <span
                            className={`text-[11px] font-bold tabular-nums ${
                              c.balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                            }`}
                          >
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
                          +{payableTotal.toFixed(2)} {currencySymbol}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm font-black text-amber-950 dark:text-amber-200 pt-1.5 border-t border-dashed border-amber-200 dark:border-amber-800">
                        <span>{isAr ? '= مجموع الكريدي الجديد:' : '= New Total Debt:'}</span>
                        <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                          {(selectedCustomer.balance + payableTotal).toFixed(2)} {currencySymbol}
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
              (method === 'cash' && amountTendered < payableTotal) ||
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
                      ? `تسجيل في دفتر الكريدي (${(selectedCustomer.balance + payableTotal).toFixed(2)} ${currencySymbol})`
                      : `Charge to Tab (${(selectedCustomer.balance + payableTotal).toFixed(2)} ${currencySymbol})`
                    : isAr
                    ? 'اختر زبوناً لإتمام البيع بالكريدي'
                    : 'Select a customer'}
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span>
                  {t.confirm_payment} ({payableTotal.toFixed(2)} {currencySymbol})
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
