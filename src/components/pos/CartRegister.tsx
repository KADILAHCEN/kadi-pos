import React, { useState, useRef, useMemo, useEffect } from 'react';
import { usePos } from '../../context/PosContext';
import { getT } from '../../utils/translations';
import { CartItem, Order } from '../../types';
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
  Monitor,
  Banknote,
  BookOpen,
  Receipt
} from 'lucide-react';
import { playSound } from '../../utils/audio';

interface CartRegisterProps {
  onOpenCheckout: () => void;
  onOpenHeldTickets: () => void;
  onQuickCheckoutSuccess?: (order: Order) => void;
}

export const CartRegister: React.FC<CartRegisterProps> = ({
  onOpenCheckout,
  onOpenHeldTickets,
  onQuickCheckoutSuccess
}) => {
  const {
    cart,
    products,
    orders,
    updateCartItemQuantity,
    setCartItemQuantity,
    removeCartItem,
    clearCart,
    overrideCartItemPrice,
    completeCheckout,
    setCurrentTab,
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
  const [stockLimitNotice, setStockLimitNotice] = useState<string | null>(null);
  const stockNoticeTimerRef = useRef<number | null>(null);

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

  // Quick Credit Checkout modal & Today's sales summary drawer
  const [showQuickCreditModal, setShowQuickCreditModal] = useState(false);
  const [quickCreditCustName, setQuickCreditCustName] = useState('');
  const [quickCreditCustPhone, setQuickCreditCustPhone] = useState('');
  const [quickCreditSearch, setQuickCreditSearch] = useState('');
  const [pendingQuickCredit, setPendingQuickCredit] = useState(false);
  const [showTodaySalesList, setShowTodaySalesList] = useState(false);

  // Inline cart item quantity editor state
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null);
  const [editingQtyDraft, setEditingQtyDraft] = useState<string>('');

  const todaySalesSummary = useMemo(() => {
    const todayStr = new Date().toDateString();
    const todayOrders = orders.filter(
      (o) => o.status === 'completed' && new Date(o.date).toDateString() === todayStr
    );
    const total = todayOrders.reduce((sum, o) => sum + o.grandTotal, 0);
    return {
      total,
      count: todayOrders.length,
      recentOrders: todayOrders.slice(0, 5)
    };
  }, [orders]);

  useEffect(() => {
    if (!pendingQuickCredit || !selectedCustomer || cart.length === 0) return;
    setPendingQuickCredit(false);
    const order = completeCheckout('credit', undefined, 0);
    if (order) {
      if (settings.enableSoundEffects !== false) playSound('success');
      onQuickCheckoutSuccess?.(order);
    }
  }, [pendingQuickCredit, selectedCustomer, cart.length, completeCheckout, onQuickCheckoutSuccess, settings.enableSoundEffects]);

  const handleInstantCashCheckout = () => {
    if (cart.length === 0) return;
    const order = completeCheckout('cash', undefined, cartGrandTotal);
    if (order) {
      if (settings.enableSoundEffects !== false) playSound('success');
      onQuickCheckoutSuccess?.(order);
    }
  };

  const handleInstantCreditCheckout = () => {
    if (cart.length === 0) return;
    if (selectedCustomer) {
      const order = completeCheckout('credit', undefined, 0);
      if (order) {
        if (settings.enableSoundEffects !== false) playSound('success');
        onQuickCheckoutSuccess?.(order);
      }
      return;
    }
    setQuickCreditCustName('');
    setQuickCreditCustPhone('');
    setQuickCreditSearch('');
    setShowQuickCreditModal(true);
  };

  const handleConfirmQuickCreditNewCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    const name = quickCreditCustName.trim();
    if (!name) return;
    const phone = quickCreditCustPhone.trim() || '-';
    addCustomer({ name, phone });
    setShowQuickCreditModal(false);
    setPendingQuickCredit(true);
  };

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

  const commitInlineQuantity = (item: CartItem) => {
    const raw = parseFloat(editingQtyDraft.replace(',', '.'));
    setEditingQtyId(null);
    if (!Number.isFinite(raw) || raw <= 0) {
      return;
    }
    const cleanQty = Number(raw.toFixed(2));
    const targetProd = products.find((p) => p.id === item.productId);
    if (targetProd) {
      const otherCartQty = cart
        .filter((ci) => ci.productId === item.productId && ci.id !== item.id)
        .reduce((sum, ci) => sum + ci.quantity, 0);
      const maxAllowed = Math.max(0, Number((targetProd.stock - otherCartQty).toFixed(2)));
      if (cleanQty > maxAllowed) {
        playSound('error');
        setStockLimitNotice(
          isAr
            ? `نفذ - المتوفر من ${item.productName} هو ${maxAllowed}`
            : isFr
            ? `Stock max pour ${item.productNameEn || item.productName}: ${maxAllowed}`
            : `Max available for ${item.productNameEn || item.productName}: ${maxAllowed}`
        );
        if (stockNoticeTimerRef.current) window.clearTimeout(stockNoticeTimerRef.current);
        stockNoticeTimerRef.current = window.setTimeout(() => setStockLimitNotice(null), 2600);
        if (maxAllowed > 0) {
          setCartItemQuantity(item.id, maxAllowed);
        }
        return;
      }
    }
    setCartItemQuantity(item.id, cleanQty);
  };

  // F8 = 1-tap Quick Cash, F9 = Detailed Checkout when cart has items
  useEffect(() => {
    const handleCheckoutShortcuts = (e: KeyboardEvent) => {
      if (cart.length === 0) return;
      if (
        showAddCustomerModal ||
        showDiscountModal ||
        showHoldModal ||
        showQuickCreditModal ||
        showPriceOverrideModal
      ) {
        return;
      }
      if (e.key === 'F8') {
        e.preventDefault();
        handleInstantCashCheckout();
      } else if (e.key === 'F9') {
        e.preventDefault();
        onOpenCheckout();
      }
    };
    window.addEventListener('keydown', handleCheckoutShortcuts);
    return () => window.removeEventListener('keydown', handleCheckoutShortcuts);
  });

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

        {/* Today's Sales Quick KPI & Recent Invoices Bar */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTodaySalesList((prev) => !prev)}
            className="w-full px-2.5 py-1.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between text-[11px] hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40 transition-colors"
          >
            <div className="flex items-center gap-1.5 font-extrabold text-emerald-800 dark:text-emerald-300">
              <Receipt className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{isAr ? 'مبيعات اليوم:' : isFr ? "Ventes du jour:" : "Today's Sales:"}</span>
              <span className="font-mono font-black tabular-nums">
                {todaySalesSummary.total.toFixed(2)} {currencySymbol}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
              <span className="px-1.5 py-0.5 rounded-md bg-white/80 dark:bg-slate-800 tabular-nums">
                {todaySalesSummary.count} {isAr ? 'فاتورة' : 'inv'}
              </span>
              <ChevronDown className={`w-3 h-3 transition-transform ${showTodaySalesList ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {showTodaySalesList && (
            <div className="mt-1.5 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg space-y-1.5 text-[11px]">
              {todaySalesSummary.recentOrders.length === 0 ? (
                <div className="text-center py-2 text-slate-400 font-semibold">
                  {isAr ? 'لا توجد مبيعات مسجلة اليوم بعد' : 'No sales recorded today yet'}
                </div>
              ) : (
                todaySalesSummary.recentOrders.map((ord) => (
                  <div
                    key={ord.id}
                    className="flex items-center justify-between py-1 px-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/70"
                  >
                    <div className="min-w-0 truncate">
                      <span className="font-bold text-slate-800 dark:text-slate-200">{ord.orderNumber}</span>
                      <span className="text-slate-400 mx-1">·</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {ord.paymentMethod === 'credit'
                          ? isAr
                            ? `كريدي (${ord.customerName || 'زبون'})`
                            : 'Credit'
                          : isAr
                          ? 'كاش'
                          : 'Cash'}
                      </span>
                    </div>
                    <span className="font-mono font-black text-emerald-700 dark:text-emerald-400 tabular-nums shrink-0">
                      {ord.grandTotal.toFixed(2)} {currencySymbol}
                    </span>
                  </div>
                ))
              )}
              <button
                type="button"
                onClick={() => {
                  setShowTodaySalesList(false);
                  setCurrentTab('orders');
                }}
                className="w-full py-1 text-center text-[11px] font-black text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                {isAr ? 'عرض كل مبيعات اليوم ➔' : 'View all orders ➔'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-400">
            <ShoppingBag className="w-12 h-12 mb-3 stroke-1 text-slate-300 dark:text-slate-700" />
            <p className="text-xs font-semibold leading-relaxed max-w-[220px]">
              {t.empty_cart}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {heldTickets.length > 0 && (
                <button
                  type="button"
                  onClick={onOpenHeldTickets}
                  className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-[11px] font-extrabold flex items-center gap-1.5 hover:bg-amber-100 transition-colors"
                >
                  <PauseCircle className="w-3.5 h-3.5" />
                  <span>
                    {isAr ? `فواتير معلقة (${heldTickets.length})` : `Held (${heldTickets.length})`}
                  </span>
                </button>
              )}
              {todaySalesSummary.count > 0 && (
                <button
                  type="button"
                  onClick={() => setCurrentTab('orders')}
                  className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[11px] font-extrabold flex items-center gap-1.5 hover:bg-emerald-100 transition-colors"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>{isAr ? `سجل اليوم (${todaySalesSummary.count})` : `Today (${todaySalesSummary.count})`}</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Stock limit alert if user tries to exceed stock */}
            {stockLimitNotice && (
              <div
                role="alert"
                className="px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-extrabold text-center shadow-md animate-in fade-in duration-150"
              >
                {stockLimitNotice}
              </div>
            )}

            {/* Visual hint for staff on long-press */}
            <div className="flex items-center justify-between px-1 pb-1 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-semibold">{isAr ? 'العناصر المضافة' : 'Cart Items'} ({cart.length})</span>
              <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-900/40">
                <Tag className="w-3 h-3 shrink-0" />
                {t.long_press_hint}
              </span>
            </div>

            {cart.map((item) => {
              const isWeighted =
                item.unitType === 'kg' ||
                item.unitType === 'gram' ||
                item.unitType === 'liter';
              const step =
                item.unitType === 'gram' ? 10 : isWeighted ? 0.25 : 1;
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

                      {/* Wholesale / Semi-Wholesale Automatic Tier Feedback */}
                      {!item.isPriceOverridden &&
                        item.appliedPriceTier &&
                        item.appliedPriceTier !== 'retail' && (
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[10px]">
                            <span className="font-extrabold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                              {item.appliedPriceTier === 'wholesale'
                                ? isAr
                                  ? 'سعر الجملة التلقائي'
                                  : 'Prix Gros Auto'
                                : isAr
                                ? 'نصف الجملة التلقائي'
                                : 'Demi-Gros Auto'}
                            </span>
                            {item.baseRetailPrice !== undefined &&
                              item.baseRetailPrice > item.price && (
                                <span className="text-slate-400 line-through font-mono tabular-nums">
                                  {item.baseRetailPrice.toFixed(2)} {currencySymbol}
                                </span>
                              )}
                          </div>
                        )}

                      <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                        {item.price.toFixed(2)} {currencySymbol}{' '}
                        {isWeighted
                          ? `/ ${
                              item.unitType === 'gram'
                                ? isAr
                                  ? 'غ'
                                  : 'g'
                                : item.unitType === 'kg'
                                ? isAr
                                  ? 'كغ'
                                  : 'kg'
                                : isAr
                                ? 'لتر'
                                : 'L'
                            }`
                          : ''}
                        {item.unitType === 'kg' && item.quantity > 0 && item.quantity < 1 && (
                          <span className="mx-1 text-amber-600 dark:text-amber-400 font-bold">
                            ({Math.round(item.quantity * 1000)} {isAr ? 'غ' : 'g'})
                          </span>
                        )}
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
                      {editingQtyId === item.id ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          autoFocus
                          value={editingQtyDraft}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setEditingQtyDraft(e.target.value)}
                          onBlur={() => commitInlineQuantity(item)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitInlineQuantity(item);
                            } else if (e.key === 'Escape') {
                              setEditingQtyId(null);
                            }
                          }}
                          className="w-12 h-6 text-center font-bold text-xs tabular-nums bg-white dark:bg-slate-900 border border-emerald-500 rounded-md text-slate-900 dark:text-white focus:outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingQtyId(item.id);
                            setEditingQtyDraft(String(item.quantity));
                          }}
                          className="min-w-10 px-1.5 h-6 rounded-md text-center font-bold text-xs tabular-nums text-slate-900 dark:text-white hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-text whitespace-nowrap"
                          title={isAr ? 'اضغط لتعديل الكمية مباشرة' : 'Click to edit quantity'}
                        >
                          {item.quantity}
                          {item.unitType === 'gram'
                            ? isAr
                              ? ' غ'
                              : ' g'
                            : item.unitType === 'kg'
                            ? isAr
                              ? ' كغ'
                              : ' kg'
                            : ''}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const targetProd = products.find((p) => p.id === item.productId);
                          if (targetProd) {
                            const totalInCart = cart
                              .filter((ci) => ci.productId === item.productId)
                              .reduce((sum, ci) => sum + ci.quantity, 0);
                            if (totalInCart + step > targetProd.stock) {
                              playSound('error');
                              setStockLimitNotice(
                                isAr
                                  ? `نفذ - ${item.productName} ما بقاش`
                                  : isFr
                                  ? `Rupture de stock - ${item.productNameEn || item.productName}`
                                  : `Out of stock - ${item.productNameEn || item.productName}`
                              );
                              if (stockNoticeTimerRef.current) window.clearTimeout(stockNoticeTimerRef.current);
                              stockNoticeTimerRef.current = window.setTimeout(() => setStockLimitNotice(null), 2600);
                              return;
                            }
                          }
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

            {(() => {
              const tierSavings = cart.reduce((sum, ci) => {
                if (
                  !ci.isPriceOverridden &&
                  ci.appliedPriceTier &&
                  ci.appliedPriceTier !== 'retail' &&
                  ci.baseRetailPrice !== undefined &&
                  ci.baseRetailPrice > ci.price
                ) {
                  return sum + (ci.baseRetailPrice - ci.price) * ci.quantity;
                }
                return sum;
              }, 0);
              if (tierSavings <= 0.005) return null;
              return (
                <div className="flex items-center justify-between text-blue-700 dark:text-blue-400 font-semibold">
                  <span>{isAr ? 'توفير تسعيرة الجملة' : 'Économie Prix Gros'}</span>
                  <span className="font-mono font-bold tabular-nums">
                    -{tierSavings.toFixed(2)} {currencySymbol}
                  </span>
                </div>
              );
            })()}

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

          {/* 1-Tap Quick Checkout Buttons (خلص كاش / سجل في الكريدي) */}
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <button
              type="button"
              onClick={handleInstantCashCheckout}
              className="py-3 px-3 rounded-xl font-black text-sm text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
              title={isAr ? 'دفع نقدي فوري (F8)' : 'Quick Cash (F8)'}
            >
              <Banknote className="w-4 h-4 shrink-0" />
              <span>{isAr ? 'خلص كاش' : isFr ? 'Cash Rapide' : 'Quick Cash'}</span>
              <kbd className="hidden xl:inline-block px-1 py-0.5 text-[9px] font-mono rounded bg-emerald-700/80 text-emerald-100">F8</kbd>
            </button>

            <button
              type="button"
              onClick={handleInstantCreditCheckout}
              className="py-3 px-3 rounded-xl font-black text-sm text-white bg-amber-600 hover:bg-amber-700 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-md shadow-amber-600/20"
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              <span>{isAr ? 'سجل في الكريدي' : isFr ? 'À Crédit' : 'Save Credit'}</span>
            </button>
          </div>

          {/* Full Detailed Checkout Button (Split / Card / Change / Loyalty) */}
          <button
            type="button"
            onClick={onOpenCheckout}
            className="w-full py-2.5 px-4 rounded-xl font-extrabold text-xs sm:text-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 active:scale-[0.99] transition-all flex items-center justify-between"
            title={isAr ? 'فتح الدفع المفصل (F9)' : 'Detailed Checkout (F9)'}
          >
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{isAr ? 'دفع مفصل / طرق أخرى (بطاقة، نقط...)' : t.charge}</span>
              <kbd className="hidden xl:inline-block px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">F9</kbd>
            </div>
            <span className="tabular-nums font-mono text-sm font-black tracking-wide text-emerald-700 dark:text-emerald-400">
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

      {/* Quick Credit Customer Selection / Creation Modal */}
      {showQuickCreditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-500" />
                <span>{isAr ? 'تسجيل الفاتورة في الكريدي' : 'Record Credit Sale'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowQuickCreditModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between text-xs font-black">
              <span className="text-amber-800 dark:text-amber-300">{isAr ? 'مبلغ الكريدي:' : 'Credit Amount:'}</span>
              <span className="font-mono text-amber-700 dark:text-amber-300">
                {cartGrandTotal.toFixed(2)} {currencySymbol}
              </span>
            </div>

            {customers.length > 0 && (
              <div className="space-y-1.5">
                <input
                  type="text"
                  value={quickCreditSearch}
                  onChange={(e) => setQuickCreditSearch(e.target.value)}
                  placeholder={isAr ? 'ابحث عن زبون مسجل...' : 'Search existing customer...'}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {customers
                    .filter((c) => {
                      const q = quickCreditSearch.trim().toLowerCase();
                      if (!q) return true;
                      return c.name.toLowerCase().includes(q) || c.phone.includes(q);
                    })
                    .slice(0, 8)
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(c);
                          setShowQuickCreditModal(false);
                          setPendingQuickCredit(true);
                        }}
                        className="w-full px-3 py-2 text-xs text-start rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/50 border border-slate-200 dark:border-slate-700 flex items-center justify-between transition-colors"
                      >
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">{c.name}</div>
                          <div className="text-[10px] text-slate-400">{c.phone}</div>
                        </div>
                        <span className="text-[11px] font-black text-amber-600 dark:text-amber-400">
                          {isAr ? 'سجل عليه ➔' : 'Select'}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            <form onSubmit={handleConfirmQuickCreditNewCustomer} className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400">
                {isAr ? 'أو سجل زبون جديد فوراً:' : 'Or create quick customer:'}
              </div>
              <input
                type="text"
                required
                value={quickCreditCustName}
                onChange={(e) => setQuickCreditCustName(e.target.value)}
                placeholder={isAr ? 'اسم الزبون (مثال: الحاج محمد)' : 'Customer name'}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
              <input
                type="tel"
                value={quickCreditCustPhone}
                onChange={(e) => setQuickCreditCustPhone(e.target.value)}
                placeholder={isAr ? 'رقم الهاتف (اختياري)' : 'Phone (optional)'}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl font-black text-xs text-white bg-amber-600 hover:bg-amber-700 transition-colors"
              >
                {isAr ? 'حفظ الزبون وتسجيل الكريدي' : 'Save & Record Credit'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
