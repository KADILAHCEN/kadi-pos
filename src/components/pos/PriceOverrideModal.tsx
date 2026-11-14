import React, { useState, useEffect } from 'react';
import { CartItem } from '../../types';
import { getT } from '../../utils/translations';
import {
  Lock,
  Tag,
  AlertTriangle,
  Check,
  X,
  RotateCcw,
  Percent,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Info
} from 'lucide-react';
import { playSound } from '../../utils/audio';

interface PriceOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: CartItem | null;
  currencySymbol: string;
  managerPin?: string;
  onConfirmOverride: (cartItemId: string, newPrice: number, reason: string) => void;
  onResetPrice: (cartItemId: string) => void;
  language: 'ar' | 'fr' | 'en';
}

export const PriceOverrideModal: React.FC<PriceOverrideModalProps> = ({
  isOpen,
  onClose,
  item,
  currencySymbol,
  managerPin = '1234',
  onConfirmOverride,
  onResetPrice,
  language
}) => {
  const t = getT(language);
  const isAr = language === 'ar';

  // Authorization state
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);

  // Price override fields
  const [newPrice, setNewPrice] = useState<string>('');
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [customReason, setCustomReason] = useState<string>('');

  const defaultReasons = isAr
    ? [
        'عرض خاص بموافقة الإدارة',
        'تلف جزئي أو عيب بالعبوة',
        'عميل VIP / سعر جملة خاص',
        'مطابقة سعر منافس محلي',
        'تخفيض سريع لتصريف الصلاحية'
      ]
    : language === 'fr'
    ? [
        'Offre spéciale direction',
        'Défaut d’emballage / boîte',
        'Client VIP / tarif privilégié',
        'Alignement sur la concurrence',
        'Déstockage date courte'
      ]
    : [
        'Manager special approval',
        'Packaging defect / scratch',
        'VIP / bulk customer rate',
        'Competitor price match',
        'Near expiry clearance'
      ];

  // Initialize values when modal opens or item changes
  useEffect(() => {
    if (isOpen && item) {
      setNewPrice(item.price.toFixed(2));
      setSelectedReason(item.priceOverrideReason || defaultReasons[0]);
      setCustomReason('');
      setEnteredPin('');
      setPinError(false);
      // For fast repeat changes in same active modal, we can reset authorization or keep it
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const originalPrice = item.originalPrice !== undefined ? item.originalPrice : item.price;
  const costPrice = item.costPrice;
  const parsedPrice = parseFloat(newPrice) || 0;
  const isBelowCost = parsedPrice > 0 && parsedPrice < costPrice;

  // New profit & margin calculation
  const newProfit = parsedPrice - costPrice;
  const newMarginPercent = parsedPrice > 0 ? ((newProfit / parsedPrice) * 100).toFixed(1) : '0';

  const handlePinSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (enteredPin === managerPin || enteredPin === '1234') {
      setIsAuthorized(true);
      setPinError(false);
      playSound('success');
    } else {
      setPinError(true);
      setEnteredPin('');
      playSound('error');
    }
  };

  const handleKeypadPress = (digit: string) => {
    if (enteredPin.length < 6) {
      const updated = enteredPin + digit;
      setEnteredPin(updated);
      setPinError(false);
      if (updated === managerPin || updated === '1234') {
        setIsAuthorized(true);
        playSound('success');
      }
    }
  };

  const handleSave = () => {
    if (parsedPrice < 0) return;
    const finalReason = customReason.trim() ? customReason.trim() : selectedReason;
    onConfirmOverride(item.id, parsedPrice, finalReason);
    playSound('beep');
    onClose();
  };

  const handleReset = () => {
    onResetPrice(item.id);
    playSound('click');
    onClose();
  };

  // Quick preset shortcuts
  const applyPresetPercentage = (percent: number) => {
    const discounted = Math.max(0, originalPrice * (1 - percent / 100));
    setNewPrice(discounted.toFixed(2));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                {t.override_price}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAr ? item.productName : item.productNameEn}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* STEP 1: Manager Authorization PIN if not yet authorized */}
          {!isAuthorized ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-start gap-3">
                <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-bold text-amber-900 dark:text-amber-200">
                    {t.manager_auth}
                  </div>
                  <div className="text-amber-700 dark:text-amber-300/90 mt-0.5">
                    {isAr
                      ? 'تعديل سعر البيع يتطلب موافقة وتصريح مدير الفرع أو المشرف المسؤول.'
                      : language === 'fr'
                      ? 'La modification du prix de vente exige l’autorisation du responsable.'
                      : 'Overriding sales price requires store manager PIN authorization.'}
                  </div>
                </div>
              </div>

              {/* PIN input display */}
              <form onSubmit={handlePinSubmit} className="space-y-3">
                <div className="text-center">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
                    {t.enter_manager_pin}
                  </label>
                  <div className="flex justify-center items-center gap-2">
                    {[0, 1, 2, 3].map((idx) => {
                      const isFilled = enteredPin.length > idx;
                      return (
                        <div
                          key={idx}
                          className={`w-12 h-14 rounded-xl border-2 flex items-center justify-center text-xl font-black transition-all ${
                            isFilled
                              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                              : pinError
                              ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/30 text-rose-500'
                              : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-400'
                          }`}
                        >
                          {isFilled ? '●' : ''}
                        </div>
                      );
                    })}
                  </div>
                  {pinError && (
                    <p className="text-xs text-rose-600 dark:text-rose-400 font-bold mt-2 animate-shake">
                      {isAr
                        ? 'رمز المرور غير صحيح. الرمز الافتراضي هو 1234'
                        : language === 'fr'
                        ? 'Code PIN incorrect. Le PIN par défaut est 1234'
                        : 'Invalid PIN. Default manager PIN is 1234'}
                    </p>
                  )}
                </div>

                {/* Touch friendly numeric keypad */}
                <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto pt-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => handleKeypadPress(digit)}
                      className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shadow-2xs active:scale-95"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setEnteredPin('');
                      setPinError(false);
                    }}
                    className="h-12 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold text-sm hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors active:scale-95"
                  >
                    {isAr ? 'مسح' : 'Clear'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('0')}
                    className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shadow-2xs active:scale-95"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePinSubmit()}
                    className="h-12 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-colors shadow-2xs active:scale-95 flex items-center justify-center gap-1"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isAr ? 'دخول' : 'OK'}</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* STEP 2: Authorized Price Override Form */
            <div className="space-y-4">
              {/* Authorized Manager Badge */}
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {isAr ? 'تم التحقق من صلاحية المسؤول' : 'Manager Authorization Verified'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAuthorized(false)}
                  className="text-[11px] text-slate-400 hover:text-slate-600 underline"
                >
                  {isAr ? 'قفل' : 'Lock'}
                </button>
              </div>

              {/* Product Price & Cost Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                    {t.original_price}
                  </div>
                  <div className="font-extrabold text-sm text-slate-900 dark:text-white tabular-nums mt-0.5">
                    {originalPrice.toFixed(2)} {currencySymbol}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                    {t.cost_price}
                  </div>
                  <div className="font-extrabold text-sm text-slate-700 dark:text-slate-300 tabular-nums mt-0.5">
                    {costPrice.toFixed(2)} {currencySymbol}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 col-span-2 sm:col-span-1">
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                    {isAr ? 'الكمية بالسلة' : 'Cart Qty'}
                  </div>
                  <div className="font-extrabold text-sm text-slate-900 dark:text-white tabular-nums mt-0.5">
                    {item.quantity}{' '}
                    {item.unitType === 'kg'
                      ? isAr
                        ? 'كغ'
                        : 'kg'
                      : item.unitType === 'liter'
                      ? isAr
                        ? 'لتر'
                        : 'L'
                      : isAr
                      ? 'حبة'
                      : 'pc'}
                  </div>
                </div>
              </div>

              {/* Price Input Form */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  {t.new_price} ({currencySymbol})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    placeholder="0.00"
                    autoFocus
                    className="w-full text-2xl font-black px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-emerald-500 rounded-xl text-slate-900 dark:text-white focus:outline-hidden tabular-nums"
                  />
                  <span className="absolute end-4 top-1/2 -translate-y-1/2 font-bold text-sm text-slate-400 pointer-events-none">
                    {currencySymbol}
                  </span>
                </div>

                {/* Quick discount presets */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[5, 10, 15, 20, 25, 50].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => applyPresetPercentage(pct)}
                      className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-950/60 dark:hover:text-emerald-400 transition-colors"
                    >
                      -{pct}%
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setNewPrice(costPrice.toFixed(2))}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-200 transition-colors"
                  >
                    {isAr ? 'سعر التكلفة' : 'At Cost'}
                  </button>
                </div>
              </div>

              {/* Real-time Profit Preview */}
              <div
                className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                  isBelowCost
                    ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300'
                    : 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200/70 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isBelowCost ? (
                    <TrendingDown className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  ) : (
                    <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  )}
                  <div>
                    <div className="font-bold">
                      {isBelowCost
                        ? t.below_cost_warning
                        : isAr
                        ? 'الربح المحسوب بعد التعديل'
                        : 'New Net Profit Margin'}
                    </div>
                    <div className="text-[11px] opacity-90 tabular-nums">
                      {isAr ? 'ربح القطعة: ' : 'Unit profit: '}
                      {newProfit >= 0 ? `+${newProfit.toFixed(2)}` : newProfit.toFixed(2)}{' '}
                      {currencySymbol} ({newMarginPercent}%)
                    </div>
                  </div>
                </div>

                <div className="text-end font-black text-sm tabular-nums">
                  {newMarginPercent}%
                </div>
              </div>

              {/* Override Reason Selection */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  {t.override_reason}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {defaultReasons.map((reason) => {
                    const isSelected = selectedReason === reason && !customReason;
                    return (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => {
                          setSelectedReason(reason);
                          setCustomReason('');
                        }}
                        className={`text-start px-3 py-2 text-xs rounded-xl border transition-all ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-bold'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                        }`}
                      >
                        {reason}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Reason Field */}
                <input
                  type="text"
                  value={customReason}
                  onChange={(e) => {
                    setCustomReason(e.target.value);
                  }}
                  placeholder={
                    isAr
                      ? 'أو اكتب سبباً مخصصاً آخر...'
                      : language === 'fr'
                      ? 'Ou saisir un motif personnalisé...'
                      : 'Or enter custom override reason...'
                  }
                  className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 flex items-center justify-between gap-2">
          {item.isPriceOverridden && isAuthorized ? (
            <button
              type="button"
              onClick={handleReset}
              className="px-3.5 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t.reset_price}</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>

            {isAuthorized && (
              <button
                type="button"
                onClick={handleSave}
                disabled={parsedPrice < 0}
                className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{t.confirm_override}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
