import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Minus,
  Plus,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { usePos } from '../../context/PosContext';
import { Order, Product } from '../../types';

interface ReturnExchangeModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

export const ReturnExchangeModal: React.FC<ReturnExchangeModalProps> = ({
  order,
  isOpen,
  onClose,
  onSuccess
}) => {
  const { products, currencySymbol, language, processReturnAndExchange } = usePos();
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [returnQtyMap, setReturnQtyMap] = useState<Record<string, number>>({});
  const [replacementItems, setReplacementItems] = useState<{ product: Product; quantity: number }[]>([]);
  const [replacementSearch, setReplacementSearch] = useState('');
  const [settleMethod, setSettleMethod] = useState<'cash' | 'credit' | 'exchange_even'>('cash');
  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !order) return;
    setReturnQtyMap({});
    setReplacementItems([]);
    setReplacementSearch('');
    setSettleMethod(order.paymentMethod === 'credit' ? 'credit' : 'cash');
    setNote('');
    setErrorMsg(null);
  }, [isOpen, order]);

  const availableReplacements = useMemo(() => {
    const q = replacementSearch.trim().toLowerCase();
    return products
      .filter((p) => p.stock > 0)
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.barcode || '').toLowerCase().includes(q) ||
          (p.sku || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 24);
  }, [products, replacementSearch]);

  const returnSummary = useMemo(() => {
    if (!order) return { refundedValue: 0, returnedUnits: 0 };
    let refundedValue = 0;
    let returnedUnits = 0;
    order.items.forEach((it) => {
      const maxRet = Math.max(0, it.quantity - (it.returnedQty || 0));
      const qty = Math.max(0, Math.min(maxRet, returnQtyMap[it.productId] || 0));
      if (qty > 0) {
        const unitEffective = it.quantity > 0 ? it.total / it.quantity : it.price;
        refundedValue += unitEffective * qty;
        returnedUnits += qty;
      }
    });
    return {
      refundedValue: Number(refundedValue.toFixed(2)),
      returnedUnits
    };
  }, [order, returnQtyMap]);

  const replacementValue = useMemo(
    () =>
      Number(
        replacementItems
          .reduce((sum, r) => sum + r.product.price * r.quantity, 0)
          .toFixed(2)
      ),
    [replacementItems]
  );

  // Positive = customer pays extra; Negative = store refunds customer
  const netDifference = Number((replacementValue - returnSummary.refundedValue).toFixed(2));

  useEffect(() => {
    if (Math.abs(netDifference) < 0.01 && returnSummary.returnedUnits > 0) {
      setSettleMethod('exchange_even');
    } else if (settleMethod === 'exchange_even') {
      setSettleMethod(order?.paymentMethod === 'credit' ? 'credit' : 'cash');
    }
  }, [netDifference, returnSummary.returnedUnits, settleMethod, order?.paymentMethod]);

  if (!isOpen || !order) return null;

  const setItemReturnQty = (productId: string, nextQty: number, maxQty: number, isWeight: boolean) => {
    const clean = isWeight
      ? Math.max(0, Math.min(maxQty, Number(nextQty.toFixed(3))))
      : Math.max(0, Math.min(maxQty, Math.round(nextQty)));
    setReturnQtyMap((prev) => ({ ...prev, [productId]: clean }));
  };

  const addReplacement = (prod: Product) => {
    setReplacementItems((prev) => {
      const idx = prev.findIndex((r) => r.product.id === prod.id);
      if (idx >= 0) {
        const nextQty = Math.min(prod.stock, prev[idx].quantity + 1);
        return prev.map((r, i) => (i === idx ? { ...r, quantity: nextQty } : r));
      }
      return [...prev, { product: prod, quantity: Math.min(prod.stock, 1) }];
    });
  };

  const updateReplacementQty = (productId: string, qty: number, maxStock: number) => {
    const clean = Math.max(0, Math.min(maxStock, qty));
    if (clean <= 0) {
      setReplacementItems((prev) => prev.filter((r) => r.product.id !== productId));
    } else {
      setReplacementItems((prev) =>
        prev.map((r) => (r.product.id === productId ? { ...r, quantity: clean } : r))
      );
    }
  };

  const handleConfirm = () => {
    const returnSelections = Object.entries(returnQtyMap)
      .filter(([, qty]) => qty > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));

    if (returnSelections.length === 0 && replacementItems.length === 0) {
      setErrorMsg(
        isAr
          ? 'يرجى تحديد كمية سلعة واحدة على الأقل للإرجاع أو الاستبدال.'
          : 'Sélectionnez au moins un article à retourner ou échanger.'
      );
      return;
    }

    const res = processReturnAndExchange({
      orderId: order.id,
      returnSelections,
      replacementItems,
      settleMethod: Math.abs(netDifference) < 0.01 ? 'exchange_even' : settleMethod,
      note: note.trim() || undefined
    });

    if (!res.success) {
      setErrorMsg(res.message);
      return;
    }

    onSuccess?.(res.message);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/65 backdrop-blur-xs">
      <div className="w-full max-w-4xl max-h-[92vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                {isAr
                  ? `إرجاع جزئي أو استبدال — ${order.orderNumber}`
                  : isFr
                  ? `Retour / Échange — ${order.orderNumber}`
                  : `Return & Exchange — ${order.orderNumber}`}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {(order.customerName || (isAr ? 'عميل نقدي' : 'Comptoir')) +
                  ' · ' +
                  new Date(order.date).toLocaleDateString()}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Section 1: Items to Return from Order */}
            <div className="space-y-2.5">
              <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                {isAr ? '1. السلع المرجعة من الفاتورة' : '1. Articles à retourner'}
              </div>
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                {order.items.map((item) => {
                  const alreadyReturned = item.returnedQty || 0;
                  const maxReturnable = Math.max(0, Number((item.quantity - alreadyReturned).toFixed(3)));
                  const selectedQty = returnQtyMap[item.productId] || 0;
                  const isWeight =
                    item.unitType === 'kg' ||
                    item.unitType === 'gram' ||
                    item.unitType === 'liter';
                  const step =
                    item.unitType === 'gram' ? 10 : isWeight ? 0.25 : 1;

                  return (
                    <div key={item.productId} className="p-3 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          {item.productName}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          {isAr ? 'مباع:' : 'Vendu:'} {item.quantity} ·{' '}
                          {alreadyReturned > 0 && (
                            <span className="text-amber-600 dark:text-amber-400">
                              {isAr ? `مرجع سابقاً: ${alreadyReturned} · ` : `Déjà ret.: ${alreadyReturned} · `}
                            </span>
                          )}
                          {item.price.toFixed(2)} {currencySymbol}
                        </div>
                      </div>
                      {maxReturnable <= 0 ? (
                        <span className="text-[11px] font-bold text-slate-400 shrink-0">
                          {isAr ? 'مرجع بالكامل' : 'Tout retourné'}
                        </span>
                      ) : (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setItemReturnQty(item.productId, selectedQty - step, maxReturnable, isWeight)
                            }
                            className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={maxReturnable}
                            step={isWeight ? '0.01' : '1'}
                            value={selectedQty}
                            onChange={(e) =>
                              setItemReturnQty(
                                item.productId,
                                Number(e.target.value) || 0,
                                maxReturnable,
                                isWeight
                              )
                            }
                            className="w-14 py-1 text-center font-mono tabular-nums font-bold text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setItemReturnQty(item.productId, selectedQty + step, maxReturnable, isWeight)
                            }
                            className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Replacement Items */}
            <div className="space-y-2.5">
              <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                {isAr ? '2. سلع الاستبدال (اختياري)' : '2. Articles de remplacement (optionnel)'}
              </div>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                <input
                  type="text"
                  value={replacementSearch}
                  onChange={(e) => setReplacementSearch(e.target.value)}
                  placeholder={isAr ? 'أضف سلعة بديلة بالاسم أو الباركود...' : 'Ajouter article de remplacement...'}
                  className="w-full ps-9 pe-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div className="max-h-32 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
                {availableReplacements.map((prod) => (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => addReplacement(prod)}
                    className="w-full px-3 py-1.5 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {prod.name}
                    </span>
                    <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-bold shrink-0">
                      + {prod.price.toFixed(2)} {currencySymbol}
                    </span>
                  </button>
                ))}
              </div>

              {replacementItems.length > 0 && (
                <div className="border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 rounded-xl divide-y divide-emerald-100 dark:divide-emerald-900/40">
                  {replacementItems.map(({ product, quantity }) => (
                    <div key={product.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          {product.name}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500">
                          {product.price.toFixed(2)} × {quantity} = {(product.price * quantity).toFixed(2)}{' '}
                          {currencySymbol}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateReplacementQty(product.id, quantity - 1, product.stock)}
                          className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center font-mono tabular-nums font-bold">{quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateReplacementQty(product.id, quantity + 1, product.stock)}
                          className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => updateReplacementQty(product.id, 0, product.stock)}
                          className="p-1 text-rose-500 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Settlement Summary Bar */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <div className="text-slate-500 dark:text-slate-400">
                  {isAr ? 'قيمة المرجوعات' : 'Valeur retournée'}
                </div>
                <div className="font-mono tabular-nums text-base font-black text-rose-600 dark:text-rose-400 mt-0.5">
                  {returnSummary.refundedValue.toFixed(2)} {currencySymbol}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <div className="text-slate-500 dark:text-slate-400">
                  {isAr ? 'قيمة سلع الاستبدال' : 'Valeur remplacement'}
                </div>
                <div className="font-mono tabular-nums text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {replacementValue.toFixed(2)} {currencySymbol}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <div className="text-slate-500 dark:text-slate-400">
                  {netDifference > 0
                    ? isAr
                      ? 'فرق إضافي يؤديه الزبون'
                      : 'Reste à payer par le client'
                    : netDifference < 0
                    ? isAr
                      ? 'مبلغ مسترجع للزبون'
                      : 'Montant à rembourser'
                    : isAr
                    ? 'استبدال متعادل'
                    : 'Échange équilibré'}
                </div>
                <div
                  className={`font-mono tabular-nums text-base font-black mt-0.5 ${
                    netDifference > 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : netDifference < 0
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {Math.abs(netDifference).toFixed(2)} {currencySymbol}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'طريقة تسوية الفرق' : 'Mode de règlement'}
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSettleMethod('cash')}
                    className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold border transition-colors ${
                      settleMethod === 'cash'
                        ? 'bg-slate-900 dark:bg-emerald-600 border-slate-900 dark:border-emerald-600 text-white'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {isAr ? 'نقداً (الصندوق)' : 'Espèces'}
                  </button>
                  {order.customerId && (
                    <button
                      type="button"
                      onClick={() => setSettleMethod('credit')}
                      className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold border transition-colors ${
                        settleMethod === 'credit'
                          ? 'bg-amber-600 border-amber-600 text-white'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {isAr ? 'حساب الكريدي' : 'Compte Crédit'}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'ملاحظة السبب (اختياري)' : 'Motif (optionnel)'}
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={isAr ? 'مثال: تغيير المقاس أو انتهاء الصلاحية...' : 'Ex: échange taille...'}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
          >
            {isAr ? 'إلغاء' : 'Annuler'}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2 rounded-xl text-xs sm:text-sm font-black bg-amber-600 hover:bg-amber-700 text-white transition-colors"
          >
            {isAr ? 'تأكيد الإرجاع والاستبدال' : 'Valider Retour / Échange'}
          </button>
        </div>
      </div>
    </div>
  );
};
