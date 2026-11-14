import React, { useState } from 'react';
import { Product, ProductModifier, ProductVariant } from '../../types';
import { usePos } from '../../context/PosContext';
import { X, Check, Plus, Tag } from 'lucide-react';

interface VariantModalProps {
  product: Product;
  onClose: () => void;
  onConfirm: (variantId?: string, modifiers?: ProductModifier[]) => void;
}

export const VariantModal: React.FC<VariantModalProps> = ({ product, onClose, onConfirm }) => {
  const { currencySymbol, language } = usePos();
  const isAr = language === 'ar';

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | undefined>(
    product.variants && product.variants.length > 0 ? product.variants[0] : undefined
  );

  const [selectedModifiers, setSelectedModifiers] = useState<ProductModifier[]>([]);

  const toggleModifier = (mod: ProductModifier) => {
    setSelectedModifiers((prev) =>
      prev.some((m) => m.id === mod.id)
        ? prev.filter((m) => m.id !== mod.id)
        : [...prev, mod]
    );
  };

  const basePrice = selectedVariant ? selectedVariant.price : product.price;
  const baseCost = selectedVariant ? (selectedVariant.costPrice ?? product.costPrice) : product.costPrice;
  const modsPrice = selectedModifiers.reduce((acc, m) => acc + m.price, 0);
  const totalPrice = Number((basePrice + modsPrice).toFixed(2));
  const profit = Number((totalPrice - baseCost).toFixed(2));
  const profitMarginPercent = totalPrice > 0 ? Number(((profit / totalPrice) * 100).toFixed(1)) : 0;

  const handleConfirm = () => {
    onConfirm(selectedVariant?.id, selectedModifiers);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            {product.image ? (
              <img
                src={product.image}
                alt={product.name}
                referrerPolicy="no-referrer"
                className="w-12 h-12 object-cover rounded-xl border border-slate-200 dark:border-slate-700"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: product.color || '#059669' }}
              >
                <Tag className="w-5 h-5" />
              </div>
            )}
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                {isAr ? product.name : product.nameEn}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAr ? 'اختر الحجم والإضافات' : 'Select variant & modifiers'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Variants (Sizes/Options) */}
          {product.hasVariants && product.variants && product.variants.length > 0 && (
            <div>
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2.5">
                {isAr ? 'الحجم / الخيار:' : 'Size / Variant:'}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {product.variants.map((v) => {
                  const isSelected = selectedVariant?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariant(v)}
                      className={`p-3 rounded-xl border text-left rtl:text-right transition-all flex flex-col justify-between gap-1 ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-600/30'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm">{v.name}</span>
                        {isSelected && <Check className="w-4 h-4 text-emerald-600" />}
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                          {v.price.toFixed(2)} {currencySymbol}
                        </span>
                        <span className="text-[11px]">{isAr ? `متوفر: ${v.stock}` : `Stock: ${v.stock}`}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Modifiers (Add-ons) */}
          {product.availableModifiers && product.availableModifiers.length > 0 && (
            <div>
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2.5">
                {isAr ? 'الإضافات والتعديلات:' : 'Add-ons & Modifiers:'}
              </div>
              <div className="space-y-1.5">
                {product.availableModifiers.map((mod) => {
                  const isChecked = selectedModifiers.some((m) => m.id === mod.id);
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => toggleModifier(mod)}
                      className={`w-full p-2.5 rounded-xl border text-left rtl:text-right transition-all flex items-center justify-between ${
                        isChecked
                          ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center text-xs ${
                            isChecked
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3" />}
                        </div>
                        <span className="text-xs font-medium">{mod.name}</span>
                      </div>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {mod.price > 0 ? `+${mod.price.toFixed(2)} ${currencySymbol}` : (isAr ? 'مجاني' : 'Free')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pricing & Profit preview */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
            <div>
              <div className="text-slate-500 dark:text-slate-400">{isAr ? 'إجمالي السعر' : 'Total Price'}</div>
              <div className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                {totalPrice.toFixed(2)} {currencySymbol}
              </div>
            </div>
            <div className="text-right rtl:text-left">
              <div className="text-slate-500 dark:text-slate-400">{isAr ? 'الربح وهامشه' : 'Profit & Margin'}</div>
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                +{profit.toFixed(2)} ({profitMarginPercent}%)
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full py-3 px-4 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <Check className="w-5 h-5" />
            <span>
              {isAr ? 'إضافة إلى الفاتورة' : 'Add to Order'} · {totalPrice.toFixed(2)} {currencySymbol}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
