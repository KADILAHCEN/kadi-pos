import React, { useState, useRef } from 'react';
import { usePos } from '../../context/PosContext';
import { getT } from '../../utils/translations';
import { CartItem } from '../../types';
import { PriceOverrideModal } from './PriceOverrideModal';
import {
  User,
  Plus,
  Trash2,
  Percent,
  FileText,
  PauseCircle,
  ShoppingBag,
  TrendingUp,
  Tag,
  ChevronDown,
  X,
  CreditCard,
  Sliders,
  Monitor
} from 'lucide-react';
import { playSound } from '../../utils/audio';

interface CartRegisterProps {
  onOpenCheckout: () => void;
  onOpenHeldTickets: () => void;
}

export const CartRegister: React.FC<CartRegisterProps> = ({
  onOpenCheckout,
  onOpenHeldTickets
}) => {
  const {
    cart,
    updateCartItemQuantity,
    setCartItemQuantity,
    removeCartItem,
    clearCart,
    overrideCartItemPrice,
    settings,
    cartSubtotal,
    cartDiscountTotal,
    cartTaxTotal,
    cartGrandTotal,
    cartCostTotal,
    cartProfitTotal,
    cartProfitMarginPercent,
    currencySymbol,
    selectedCustomer,
    setSelectedCustomer,
    customers,
    addCustomer,
    orderDiscount,
    setOrderDiscount,
    holdCurrentTicket,
    heldTickets,
    language
  } = usePos();

  const t = getT(language);
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  // Price override modal & long-press states
  const [priceOverrideItem, setPriceOverrideItem] = useState<CartItem | null>(null);
  const [showPriceOverrideModal, setShowPriceOverrideModal] = useState(false);
  const [pressingItemId, setPressingItemId] = useState<string | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleStartLongPress = (item: CartItem) => {
    setPressingItemId(item.id);
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      setPressingItemId(null);
      setPriceOverrideItem(item);
      setShowPriceOverrideModal(true);
      if (settings.enableSoundEffects) playSound('click');
    }, 550);
  };

  const handleCancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setPressingItemId(null);
  };

  const handleConfirmPriceOverride = (cartItemId: string, newPrice: number, reason: string) => {
    overrideCartItemPrice(cartItemId, newPrice, reason);
  };

  const handleResetPriceOverride = (cartItemId: string) => {
    const item = cart.find((ci) => ci.id === cartItemId);
    if (item && item.originalPrice !== undefined) {
      overrideCartItemPrice(cartItemId, item.originalPrice, 'استعادة السعر الأصلي');
    }
  };

  // Customer selection modal / quick add
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');

  // Discount modal
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountVal, setDiscountVal] = useState<string>('10');

  // Held ticket title input
  const [holdTitle, setHoldTitle] = useState('');
  const [showHoldModal, setShowHoldModal] = useState(false);

  const handleApplyOrderDiscount = () => {
    const val = parseFloat(discountVal) || 0;
    if (val > 0) {
      setOrderDiscount({ type: discountType, value: val });
    } else {
      setOrderDiscount(null);
    }
    setShowDiscountModal(false);
  };

  const handleQuickAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim() || !newCustPhone.trim()) return;

    addCustomer({
      name: newCustName.trim(),
      phone: newCustPhone.trim()
    });
    setNewCustName('');
    setNewCustPhone('');
    setShowAddCustomerModal(false);
    setShowCustomerDropdown(false);
  };

  const handleConfirmHold = () => {
    holdCurrentTicket(holdTitle.trim());
    setHoldTitle('');
    setShowHoldModal(false);
  };

  return (
    <div className="w-full lg:w-96 xl:w-[420px] flex flex-col h-full bg-white dark:bg-slate-900 border-l rtl:border-l-0 rtl:border-r border-slate-200 dark:border-slate-800 shrink-0">
      {/* Ticket Header & Customer Selection */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
        <div className="flex items-center justify-between gap-2 mb-2">
          {/* Customer button */}
          <div className="relative flex-1">
            <button
              onClick={() => setShowCustomerDropdown(!showCustomerDropdown)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-emerald-500 text-slate-800 dark:text-slate-200 transition-colors shadow-2xs"
            >
              <div className="flex items-center gap-2 truncate">
                <User className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="truncate">
                  {selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.points} pts)` : t.guest_customer}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {/* Customer Dropdown */}
            {showCustomerDropdown && (
              <div className="absolute top-full left-0 right-0 z-40 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                <div className="p-2 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">{t.select_customer}</span>
                  <button
                    onClick={() => {
                      setShowAddCustomerModal(true);
                      setShowCustomerDropdown(false);
                    }}
                    className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{isAr ? 'عميل جديد' : isFr ? 'Nouveau' : 'New'}</span>
                  </button>
                </div>
                <button
                  onClick={() => {
                    setSelectedCustomer(null);
                    setShowCustomerDropdown(false);
                  }}
                  className="w-full px-3 py-2 text-xs text-left rtl:text-right hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 font-medium"
                >
                  {t.guest_customer}
                </button>
                {customers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedCustomer(c);
                      setShowCustomerDropdown(false);
                    }}
                    className="w-full px-3 py-2 text-xs text-left rtl:text-right hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between border-t border-slate-100 dark:border-slate-700/60"
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">{c.name}</div>
                      <div className="text-[10px] text-slate-400">{c.phone}</div>
                    </div>
                    <div className="text-right rtl:text-left">
                      <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                        {c.tier} · {c.points} pts
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Customer Display dual-screen trigger */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('kadi:open-customer-display'))}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-xl hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 transition-colors shadow-2xs"
            title={isAr ? 'فتح شاشة عرض العميل (شاشة ثانية)' : 'Open Customer Display'}
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>

          {/* Held tickets toggle button */}
          <button
            onClick={onOpenHeldTickets}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-amber-500 text-slate-700 dark:text-slate-300 transition-colors shadow-2xs"
            title={t.hold_ticket}
          >
            <PauseCircle className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[11px] font-bold">{heldTickets.length}</span>
          </button>

          {/* Clear cart */}
          {cart.length > 0 && (
            <button
              onClick={() => clearCart(true)}
              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors"
              title={t.clear_cart}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-400">
            <ShoppingBag className="w-12 h-12 mb-3 stroke-1 text-slate-300 dark:text-slate-700" />
            <p className="text-xs font-semibold leading-relaxed max-w-[200px]">
              {t.empty_cart}
            </p>
          </div>
        ) : (
          <>
            {/* Visual hint for staff on long-press */}
            <div className="flex items-center justify-between px-1 pb-1 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-semibold">{isAr ? 'العناصر المضافة' : 'Cart Items'} ({cart.length})</span>
              <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-900/40">
                <Tag className="w-3 h-3 shrink-0" />
                {t.long_press_hint}
              </span>
            </div>

            {cart.map((item) => {
              const isWeighted = item.unitType === 'kg' || item.unitType === 'liter';
              const step = isWeighted ? 0.25 : 1;
              const lineBase = item.price * item.quantity;
              let lineDiscount = 0;
              if (item.itemDiscount) {
                if (item.itemDiscount.type === 'percent') {
                  lineDiscount = (lineBase * item.itemDiscount.value) / 100;
                } else {
                  lineDiscount = item.itemDiscount.value;
                }
              }
              const lineTotal = lineBase - lineDiscount;
              const lineCost = item.costPrice * item.quantity;
              const lineProfit = lineTotal - lineCost;
              const profitMargin = lineTotal > 0 ? ((lineProfit / lineTotal) * 100).toFixed(0) : '0';
              const isPressing = pressingItemId === item.id;

              return (
                <div
                  key={item.id}
                  onMouseDown={() => handleStartLongPress(item)}
                  onMouseUp={handleCancelLongPress}
                  onMouseLeave={handleCancelLongPress}
                  onTouchStart={() => handleStartLongPress(item)}
                  onTouchEnd={handleCancelLongPress}
                  onTouchMove={handleCancelLongPress}
                  className={`p-2.5 rounded-xl border transition-all relative select-none cursor-pointer group ${
                    isPressing
                      ? 'ring-2 ring-amber-500 bg-amber-50/80 dark:bg-amber-950/50 border-amber-400 scale-[0.98]'
                      : item.isPriceOverridden
                      ? 'border-amber-300 dark:border-amber-700/80 bg-amber-50/20 dark:bg-amber-950/20 shadow-2xs hover:border-amber-400'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs hover:border-slate-300'
                  }`}
                  title={t.long_press_hint}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                        {isAr ? item.productName : item.productNameEn}
                      </div>

                      {/* Variant & Modifiers tags */}
                      {(item.variantName || (item.modifiers && item.modifiers.length > 0)) && (
                        <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          {item.variantName}
                          {item.modifiers && item.modifiers.length > 0 && (
                            <span> · {item.modifiers.map((m) => m.name).join(', ')}</span>
                          )}
                        </div>
                      )}

                      {/* Overridden Price Details Badge */}
                      {item.isPriceOverridden && (
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                            <Tag className="w-2.5 h-2.5" />
                            {t.custom_price}
                          </span>
                          {item.originalPrice !== undefined && (
                            <span className="text-[10px] text-slate-400 line-through tabular-nums">
                              {item.originalPrice.toFixed(2)} {currencySymbol}
                            </span>
                          )}
                          {item.priceOverrideReason && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 italic truncate max-w-[180px]">
                              ({item.priceOverrideReason})
                            </span>
                          )}
                        </div>
                      )}

                      <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                        {item.price.toFixed(2)} {currencySymbol} {isWeighted ? `/ ${item.unitType === 'kg' ? (isAr ? 'كغ' : 'kg') : (isAr ? 'لتر' : 'L')}` : ''}
                        <span className="mx-1 text-slate-300">·</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold" title={`${t.profit}: ${lineProfit.toFixed(2)}`}>
                          +{profitMargin}% {t.profit}
                        </span>
                      </div>
                    </div>

                    {/* Line Total */}
                    <div className="text-right rtl:text-left shrink-0">
                      <div className="font-extrabold text-sm text-slate-900 dark:text-white tabular-nums">
                        {lineTotal.toFixed(2)} {currencySymbol}
                      </div>
                      {lineDiscount > 0 && (
                        <div className="text-[10px] text-rose-500 font-bold tabular-nums">
                          -{lineDiscount.toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quantity Stepper & Actions */}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCartItem(item.id);
                        }}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        title={isAr ? 'حذف' : 'Remove'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Price override button */}
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPriceOverrideItem(item);
                          setShowPriceOverrideModal(true);
                        }}
                        className={`p-1 rounded transition-colors flex items-center gap-1 text-[11px] font-medium ${
                          item.isPriceOverridden
                            ? 'text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 hover:bg-amber-200'
                            : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                        }`}
                        title={t.override_price}
                      >
                        <Tag className="w-3.5 h-3.5" />
                        {item.isPriceOverridden && (
                          <span className="text-[10px] hidden sm:inline">{isAr ? 'تعديل' : 'Edit'}</span>
                        )}
                      </button>
                    </div>

                    {/* Stepper with step depending on unit */}
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg"
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateCartItemQuantity(item.id, -step);
                        }}
                        className="w-6 h-6 rounded-md bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center hover:bg-slate-200 shadow-2xs text-xs"
                      >
                        -
                      </button>
                      <span className="w-10 text-center font-bold text-xs tabular-nums text-slate-900 dark:text-white">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateCartItemQuantity(item.id, step);
                        }}
                        className="w-6 h-6 rounded-md bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center hover:bg-slate-200 shadow-2xs text-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Financial Breakdown & Profit Margins Box */}
      {cart.length > 0 && (
        <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 space-y-2">
          {/* Subtotal, Discount, Tax */}
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span>{t.subtotal}</span>
              <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-200">
                {cartSubtotal.toFixed(2)} {currencySymbol}
              </span>
            </div>

            {cartDiscountTotal > 0 && (
              <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 font-medium">
                <span>{t.discount}</span>
                <span className="font-bold tabular-nums">-{cartDiscountTotal.toFixed(2)} {currencySymbol}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span>{t.vat_tax} (15%)</span>
              <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-200">
                {cartTaxTotal.toFixed(2)} {currencySymbol}
              </span>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between text-base font-extrabold text-slate-900 dark:text-white pt-1.5 border-t border-slate-200 dark:border-slate-800">
              <span>{t.total_to_pay}</span>
              <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                {cartGrandTotal.toFixed(2)} {currencySymbol}
              </span>
            </div>
          </div>

          {/* Profit Analytics Card ("نسبة الارباح") */}
          <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <div className="text-[10px] text-emerald-800 dark:text-emerald-300 font-medium">
                  {t.total_cost}: <span className="font-bold tabular-nums">{cartCostTotal.toFixed(2)} {currencySymbol}</span>
                </div>
                <div className="font-bold text-emerald-900 dark:text-emerald-200">
                  {t.net_profit}: <span className="tabular-nums">+{cartProfitTotal.toFixed(2)} {currencySymbol}</span>
                </div>
              </div>
            </div>
            <div className="text-right rtl:text-left">
              <span className="px-2 py-1 text-xs font-extrabold bg-emerald-600 text-white rounded-lg shadow-2xs tabular-nums">
                {cartProfitMarginPercent}% {isAr ? 'هامش' : isFr ? 'Marge' : 'Margin'}
              </span>
            </div>
          </div>

          {/* Order Actions Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowDiscountModal(true)}
              className="py-2 px-3 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center gap-1.5"
            >
              <Percent className="w-3.5 h-3.5 text-amber-500" />
              <span>{orderDiscount ? `${orderDiscount.value}${orderDiscount.type === 'percent' ? '%' : currencySymbol}` : t.add_discount}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowHoldModal(true)}
              className="py-2 px-3 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center gap-1.5"
            >
              <PauseCircle className="w-3.5 h-3.5 text-slate-400" />
              <span>{t.hold_ticket}</span>
            </button>
          </div>

          {/* Big Charge Button */}
          <button
            type="button"
            onClick={onOpenCheckout}
            className="w-full py-3.5 px-4 rounded-xl font-extrabold text-base text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] transition-all flex items-center justify-between shadow-lg shadow-emerald-600/20"
          >
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              <span>{t.charge}</span>
            </div>
            <span className="tabular-nums font-mono text-lg tracking-wide">
              {cartGrandTotal.toFixed(2)} {currencySymbol}
            </span>
          </button>
        </div>
      )}

      {/* Add Quick Customer Modal */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <form
            onSubmit={handleQuickAddCustomer}
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white">
                {isAr ? 'إضافة عميل جديد' : isFr ? 'Nouveau Client' : 'New Customer'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddCustomerModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {t.customer_name}
              </label>
              <input
                type="text"
                required
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                placeholder={isAr ? 'مثال: محمد العمري' : 'e.g. John Doe'}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {t.phone}
              </label>
              <input
                type="tel"
                required
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                placeholder="05xxxxxxxx"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
            >
              {isAr ? 'حفظ وتعيين للفاتورة' : 'Save & Assign'}
            </button>
          </form>
        </div>
      )}

      {/* Order Discount Modal */}
      {showDiscountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-xs bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white">{t.discount}</h3>
              <button onClick={() => setShowDiscountModal(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDiscountType('percent')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                  discountType === 'percent'
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                % نسبة
              </button>
              <button
                type="button"
                onClick={() => setDiscountType('fixed')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                  discountType === 'fixed'
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {currencySymbol} مبلغ ثابت
              </button>
            </div>
            <div>
              <input
                type="number"
                min="0"
                step="any"
                value={discountVal}
                onChange={(e) => setDiscountVal(e.target.value)}
                className="w-full px-3 py-2 text-center text-xl font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setOrderDiscount(null);
                  setShowDiscountModal(false);
                }}
                className="flex-1 py-2 text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-xl"
              >
                {isAr ? 'إلغاء الخصم' : 'Remove'}
              </button>
              <button
                type="button"
                onClick={handleApplyOrderDiscount}
                className="flex-1 py-2 text-xs font-bold text-white bg-emerald-600 rounded-xl"
              >
                {isAr ? 'تطبيق الخصم' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hold Ticket Modal */}
      {showHoldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-xs bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-white">{t.hold_ticket}</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'اسم الفاتورة أو رقم الطاولة' : 'Ticket title / Table #'}
              </label>
              <input
                type="text"
                value={holdTitle}
                onChange={(e) => setHoldTitle(e.target.value)}
                placeholder={isAr ? 'مثال: طاولة 4 أو طلب سيارة' : 'e.g. Table 4'}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowHoldModal(false)}
                className="flex-1 py-2 text-xs font-bold text-slate-600 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirmHold}
                className="flex-1 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl"
              >
                {isAr ? 'تعليق' : 'Hold'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Price Override Modal for Authorized Staff */}
      <PriceOverrideModal
        isOpen={showPriceOverrideModal}
        onClose={() => {
          setShowPriceOverrideModal(false);
          setPriceOverrideItem(null);
        }}
        item={priceOverrideItem}
        currencySymbol={currencySymbol}
        managerPin={settings.managerPin}
        onConfirmOverride={handleConfirmPriceOverride}
        onResetPrice={handleResetPriceOverride}
        language={language}
      />
    </div>
  );
};
