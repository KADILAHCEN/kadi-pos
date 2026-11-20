import React, { useState, useMemo } from 'react';
import { Product } from '../../types';
import { usePos } from '../../context/PosContext';
import {
  X,
  Layers,
  DollarSign,
  Boxes,
  TrendingUp,
  Percent,
  Plus,
  Minus,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { playSound } from '../../utils/audio';

interface BulkUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProducts: Product[];
  onSuccess?: () => void;
}

export const BulkUpdateModal: React.FC<BulkUpdateModalProps> = ({
  isOpen,
  onClose,
  selectedProducts,
  onSuccess
}) => {
  const { bulkUpdateProducts, currencySymbol, language } = usePos();
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  // Toggle sections
  const [applyPriceUpdate, setApplyPriceUpdate] = useState<boolean>(true);
  const [applyStockUpdate, setApplyStockUpdate] = useState<boolean>(false);

  // Price adjustment controls
  const [priceTarget, setPriceTarget] = useState<'price' | 'costPrice' | 'both'>('price');
  const [priceAction, setPriceAction] = useState<
    'set_fixed' | 'increase_fixed' | 'decrease_fixed' | 'increase_percent' | 'decrease_percent'
  >('increase_fixed');
  const [priceValue, setPriceValue] = useState<number>(5);

  // Stock adjustment controls
  const [stockAction, setStockAction] = useState<'add' | 'subtract' | 'set_fixed'>('add');
  const [stockValueInput, setStockValueInput] = useState<string>('10');
  const parsedStockVal = parseFloat(stockValueInput.replace(',', '.'));
  const stockValue = Number.isFinite(parsedStockVal) && parsedStockVal >= 0 ? parsedStockVal : 0;
  const [stockReason, setStockReason] = useState<string>('');

  if (!isOpen || selectedProducts.length === 0) return null;

  // Sample preview on the first selected product
  const previewSample = useMemo(() => {
    const sample = selectedProducts[0];
    if (!sample) return null;

    let newPrice = sample.price;
    let newCostPrice = sample.costPrice;

    if (applyPriceUpdate) {
      const calcPrice = (curr: number) => {
        let val = curr;
        if (priceAction === 'set_fixed') {
          val = priceValue;
        } else if (priceAction === 'increase_fixed') {
          val = curr + priceValue;
        } else if (priceAction === 'decrease_fixed') {
          val = Math.max(0, curr - priceValue);
        } else if (priceAction === 'increase_percent') {
          val = curr * (1 + priceValue / 100);
        } else if (priceAction === 'decrease_percent') {
          val = Math.max(0, curr * (1 - priceValue / 100));
        }
        return Number(val.toFixed(2));
      };

      if (priceTarget === 'price' || priceTarget === 'both') {
        newPrice = calcPrice(sample.price);
      }
      if (priceTarget === 'costPrice' || priceTarget === 'both') {
        newCostPrice = calcPrice(sample.costPrice);
      }
    }

    let newStock = sample.stock;
    let stockDelta = 0;
    if (applyStockUpdate) {
      if (stockAction === 'add') {
        stockDelta = stockValue;
        newStock = sample.stock + stockValue;
      } else if (stockAction === 'subtract') {
        stockDelta = -Math.min(sample.stock, stockValue);
        newStock = Math.max(0, sample.stock - stockValue);
      } else if (stockAction === 'set_fixed') {
        stockDelta = stockValue - sample.stock;
        newStock = stockValue;
      }
    }

    return {
      name: sample.name,
      currentPrice: sample.price,
      newPrice,
      currentCost: sample.costPrice,
      newCostPrice,
      currentStock: sample.stock,
      newStock,
      stockDelta,
      unit: sample.unitType
    };
  }, [selectedProducts, applyPriceUpdate, applyStockUpdate, priceTarget, priceAction, priceValue, stockAction, stockValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyPriceUpdate && !applyStockUpdate) {
      alert(isAr ? 'يرجى تفعيل خيار تعديل الأسعار أو المخزون على الأقل.' : 'Please select at least one update option (Price or Stock).');
      return;
    }

    const updates = selectedProducts.map((p) => {
      const changes: Partial<Product> = {};
      let stockDelta = 0;

      // Price calculation
      if (applyPriceUpdate) {
        const calcPrice = (curr: number) => {
          let val = curr;
          if (priceAction === 'set_fixed') {
            val = priceValue;
          } else if (priceAction === 'increase_fixed') {
            val = curr + priceValue;
          } else if (priceAction === 'decrease_fixed') {
            val = Math.max(0, curr - priceValue);
          } else if (priceAction === 'increase_percent') {
            val = curr * (1 + priceValue / 100);
          } else if (priceAction === 'decrease_percent') {
            val = Math.max(0, curr * (1 - priceValue / 100));
          }
          return Number(val.toFixed(2));
        };

        if (priceTarget === 'price' || priceTarget === 'both') {
          changes.price = calcPrice(p.price);
        }
        if (priceTarget === 'costPrice' || priceTarget === 'both') {
          changes.costPrice = calcPrice(p.costPrice);
        }
      }

      // Stock calculation
      if (applyStockUpdate) {
        if (stockAction === 'add') {
          stockDelta = stockValue;
          changes.stock = p.stock + stockValue;
        } else if (stockAction === 'subtract') {
          const delta = Math.min(p.stock, stockValue);
          stockDelta = -delta;
          changes.stock = Math.max(0, p.stock - stockValue);
        } else if (stockAction === 'set_fixed') {
          stockDelta = stockValue - p.stock;
          changes.stock = stockValue;
        }
      }

      const defaultReason = stockDelta > 0
        ? (isAr ? 'توريد كميات إضافية (تعديل جماعي)' : 'Bulk Restock')
        : (isAr ? 'تعديل أو جرد جماعي' : 'Bulk Adjustment');

      return {
        id: p.id,
        changes,
        stockDelta: applyStockUpdate ? stockDelta : 0,
        reason: stockReason.trim() || defaultReason
      };
    });

    bulkUpdateProducts(updates);
    playSound('beep');

    if (onSuccess) {
      onSuccess();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                {isAr ? 'تعديل جماعي للمنتجات المحددة' : 'Bulk Product Update'}
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                {isAr
                  ? `تطبيق التحديث المتزامن على ${selectedProducts.length} منتج محدد`
                  : `Apply synchronized updates to ${selectedProducts.length} selected products`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selected Items Badges Strip */}
        <div className="px-5 py-2.5 bg-slate-100/60 dark:bg-slate-800/30 border-b border-slate-200/60 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-[11px]">
          <span className="font-bold text-slate-500 shrink-0">
            {isAr ? 'الأصناف:' : 'Items:'}
          </span>
          {selectedProducts.slice(0, 5).map((p) => (
            <span
              key={p.id}
              className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold truncate max-w-[140px] shrink-0 shadow-2xs"
            >
              {p.name}
            </span>
          ))}
          {selectedProducts.length > 5 && (
            <span className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold shrink-0">
              +{selectedProducts.length - 5} {isAr ? 'منتجات أخرى' : 'more'}
            </span>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Section 1: Price Updates */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              applyPriceUpdate
                ? 'bg-white dark:bg-slate-900 border-emerald-300 dark:border-emerald-800 shadow-sm ring-1 ring-emerald-500/10'
                : 'bg-slate-50/50 dark:bg-slate-800/20 border-slate-200 dark:border-slate-800 opacity-75'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={applyPriceUpdate}
                  onChange={(e) => setApplyPriceUpdate(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                />
                <span className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  {isAr ? 'تعديل الأسعار جماعياً' : 'Bulk Price Update'}
                </span>
              </label>
              <span className="text-[11px] font-bold text-slate-400">
                {applyPriceUpdate ? (isAr ? 'مُفعّل' : 'Enabled') : (isAr ? 'مُعطّل' : 'Disabled')}
              </span>
            </div>

            {applyPriceUpdate && (
              <div className="mt-4 space-y-3.5 animate-in fade-in">
                {/* Target Price Type */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                    {isAr ? 'الأسعار المستهدفة بالتعديل:' : 'Target Price Type:'}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'price' as const, label: isAr ? 'سعر البيع فقط' : 'Retail Price Only' },
                      { id: 'costPrice' as const, label: isAr ? 'سعر التكلفة فقط' : 'Cost Price Only' },
                      { id: 'both' as const, label: isAr ? 'سعر البيع والتكلفة معاً' : 'Both Prices' }
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setPriceTarget(t.id)}
                        className={`py-1.5 px-2 text-xs font-bold rounded-xl border transition-colors ${
                          priceTarget === t.id
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Price Action Type */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                    {isAr ? 'طريقة احتساب السعر الجديد:' : 'Action Type:'}
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {[
                      { id: 'increase_fixed' as const, label: isAr ? `+ زيادة ثابتة (${currencySymbol})` : `+ Add (${currencySymbol})` },
                      { id: 'decrease_fixed' as const, label: isAr ? `- خفض ثابت (${currencySymbol})` : `- Discount (${currencySymbol})` },
                      { id: 'increase_percent' as const, label: isAr ? '+ زيادة مئوية (%)' : '+ Increase (%)' },
                      { id: 'decrease_percent' as const, label: isAr ? '- تخفيض مئوي (%)' : '- Discount (%)' },
                      { id: 'set_fixed' as const, label: isAr ? `تعيين سعر موحد (${currencySymbol})` : `Set Exact (${currencySymbol})` }
                    ].map((act) => (
                      <button
                        key={act.id}
                        type="button"
                        onClick={() => setPriceAction(act.id)}
                        className={`py-1.5 px-2 text-[11px] font-bold rounded-xl border transition-colors ${
                          priceAction === act.id
                            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-2xs'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {act.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Price Input Value */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    {priceAction.includes('percent')
                      ? (isAr ? 'النسبة المئوية (%)' : 'Percentage (%)')
                      : (isAr ? `القيمة (${currencySymbol})` : `Amount (${currencySymbol})`)}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      required={applyPriceUpdate}
                      value={priceValue}
                      onChange={(e) => setPriceValue(parseFloat(e.target.value) || 0)}
                      className="w-full py-2.5 px-4 font-mono font-bold text-base bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    />
                    <span className="absolute right-3 rtl:right-auto rtl:left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      {priceAction.includes('percent') ? '%' : currencySymbol}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Stock Updates */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              applyStockUpdate
                ? 'bg-white dark:bg-slate-900 border-blue-300 dark:border-blue-800 shadow-sm ring-1 ring-blue-500/10'
                : 'bg-slate-50/50 dark:bg-slate-800/20 border-slate-200 dark:border-slate-800 opacity-75'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={applyStockUpdate}
                  onChange={(e) => setApplyStockUpdate(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <span className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Boxes className="w-4 h-4 text-blue-600" />
                  {isAr ? 'تعديل المخزون جماعياً' : 'Bulk Stock Update'}
                </span>
              </label>
              <span className="text-[11px] font-bold text-slate-400">
                {applyStockUpdate ? (isAr ? 'مُفعّل' : 'Enabled') : (isAr ? 'مُعطّل' : 'Disabled')}
              </span>
            </div>

            {applyStockUpdate && (
              <div className="mt-4 space-y-3.5 animate-in fade-in">
                {/* Stock Action Type */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                    {isAr ? 'نوع حركة المخزون:' : 'Stock Action:'}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'add' as const, label: isAr ? '+ إضافة توريد للمخزون' : '+ Add Stock (Restock)' },
                      { id: 'subtract' as const, label: isAr ? '- خصم كمية (هدر / تسوية)' : '- Subtract Stock' },
                      { id: 'set_fixed' as const, label: isAr ? '= تعيين كمية موحدة' : '= Set Exact Stock' }
                    ].map((act) => (
                      <button
                        key={act.id}
                        type="button"
                        onClick={() => setStockAction(act.id)}
                        className={`py-2 px-2 text-[11px] font-bold rounded-xl border transition-colors ${
                          stockAction === act.id
                            ? 'bg-blue-600 border-blue-600 text-white shadow-2xs'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {act.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stock Quantity Value */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                      {isAr ? 'الكمية المراد تطبيقها على كل صنف' : 'Quantity Per Product'}
                    </label>
                    <button
                      type="button"
                      onClick={() => setStockValueInput('0')}
                      className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-[10px] font-extrabold text-slate-700 dark:text-slate-200"
                    >
                      0
                    </button>
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required={applyStockUpdate}
                    value={stockValueInput}
                    placeholder="0"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setStockValueInput(e.target.value)}
                    onBlur={() => {
                      if (stockValueInput.trim() === '') setStockValueInput('0');
                    }}
                    className="w-full py-2.5 px-4 font-mono font-bold text-base bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>

                {/* Stock Reason Note */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    {isAr ? 'سبب التعديل والتوريد (لتسجيله في سجل الحركات)' : 'Reason / Note (Audit log):'}
                  </label>
                  <input
                    type="text"
                    value={stockReason}
                    onChange={(e) => setStockReason(e.target.value)}
                    placeholder={isAr ? 'مثال: توريد شحنة جديدة من المورد، جرد موسمي...' : 'e.g., Weekly supplier delivery, stock audit...'}
                    className="w-full py-2 px-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Live Preview Sample */}
          {previewSample && (applyPriceUpdate || applyStockUpdate) && (
            <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60">
              <div className="flex items-center gap-2 text-xs font-extrabold text-amber-900 dark:text-amber-200 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>{isAr ? 'معاينة حية للنتائج (على الصنف الأول كمثال):' : 'Live Preview (first item):'}</span>
              </div>
              <div className="text-xs font-bold text-slate-900 dark:text-white mb-1.5 truncate">
                {previewSample.name}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                {applyPriceUpdate && (
                  <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-amber-200/60 dark:border-amber-900/40">
                    <span className="text-slate-500 font-semibold">{isAr ? 'السعر:' : 'Price:'} </span>
                    <span className="line-through text-slate-400 tabular-nums">
                      {previewSample.currentPrice.toFixed(2)}
                    </span>
                    <span className="font-extrabold text-emerald-600 mx-1 tabular-nums">
                      ➔ {previewSample.newPrice.toFixed(2)} {currencySymbol}
                    </span>
                  </div>
                )}
                {applyStockUpdate && (
                  <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-amber-200/60 dark:border-amber-900/40">
                    <span className="text-slate-500 font-semibold">{isAr ? 'المخزون:' : 'Stock:'} </span>
                    <span className="line-through text-slate-400 tabular-nums">
                      {previewSample.currentStock}
                    </span>
                    <span className="font-extrabold text-blue-600 mx-1 tabular-nums">
                      ➔ {previewSample.newStock} ({previewSample.stockDelta >= 0 ? `+${previewSample.stockDelta}` : previewSample.stockDelta})
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Footer Submit */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 transition-colors"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={!applyPriceUpdate && !applyStockUpdate}
              className="px-6 py-2.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white shadow-sm transition-all flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isAr
                  ? `تطبيق التعديل على ${selectedProducts.length} منتج`
                  : `Apply Updates to ${selectedProducts.length} Items`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
