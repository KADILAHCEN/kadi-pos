import React, { useState } from 'react';
import { Product } from '../../types';
import { usePos } from '../../context/PosContext';
import { Scale, X, Check, Calculator, ArrowRight, ArrowLeft } from 'lucide-react';

interface ScaleModalProps {
  product: Product;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
}

export const ScaleModal: React.FC<ScaleModalProps> = ({ product, onClose, onConfirm }) => {
  const { currencySymbol, language } = usePos();
  const isAr = language === 'ar';
  const isKg = product.unitType === 'kg';
  const unitLabel = isKg ? (isAr ? 'كيلو (كغ)' : 'kg') : (isAr ? 'لتر (ل)' : 'Liter');

  const [inputStr, setInputStr] = useState<string>('0.5');

  const quantity = parseFloat(inputStr) || 0;
  const totalPrice = Number((quantity * product.price).toFixed(2));
  const totalCost = Number((quantity * product.costPrice).toFixed(2));
  const profit = Number((totalPrice - totalCost).toFixed(2));
  const profitMarginPercent = totalPrice > 0 ? Number(((profit / totalPrice) * 100).toFixed(1)) : 0;

  const presets = isKg
    ? [0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 5.0]
    : [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 5.0];

  const handleKeyClick = (val: string) => {
    if (val === 'C') {
      setInputStr('0');
      return;
    }
    if (val === 'BS') {
      setInputStr((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
      return;
    }
    if (val === '.') {
      if (!inputStr.includes('.')) {
        setInputStr((prev) => prev + '.');
      }
      return;
    }
    setInputStr((prev) => (prev === '0' ? val : prev + val));
  };

  const handleConfirm = () => {
    if (quantity > 0) {
      onConfirm(quantity);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                {isAr ? product.name : product.nameEn}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAr ? 'وزن / كمية السلعة' : 'Weight / Volume scale'} · {product.price.toFixed(2)} {currencySymbol} / {unitLabel}
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

        {/* Weight & Value Display */}
        <div className="p-5 space-y-4">
          <div className="p-4 rounded-xl bg-slate-900 text-white text-center shadow-inner">
            <div className="text-xs text-slate-400 font-medium mb-1">
              {isAr ? 'الكمية المدخلة' : 'Entered Quantity'} ({unitLabel})
            </div>
            <div className="text-4xl font-extrabold font-mono tracking-wider tabular-nums text-emerald-400">
              {inputStr || '0'} <span className="text-lg text-slate-300 font-sans">{isKg ? (isAr ? 'كغ' : 'kg') : (isAr ? 'لتر' : 'L')}</span>
            </div>

            {/* Calculations breakdown */}
            <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-around text-xs">
              <div>
                <div className="text-slate-400">{isAr ? 'السعر المطلوب' : 'Price'}</div>
                <div className="font-bold text-base text-white tabular-nums">
                  {totalPrice.toFixed(2)} {currencySymbol}
                </div>
              </div>
              <div className="h-6 w-px bg-slate-800" />
              <div>
                <div className="text-slate-400">{isAr ? 'التكلفة' : 'Cost'}</div>
                <div className="font-semibold text-slate-300 tabular-nums">
                  {totalCost.toFixed(2)} {currencySymbol}
                </div>
              </div>
              <div className="h-6 w-px bg-slate-800" />
              <div>
                <div className="text-slate-400">{isAr ? 'الربح ونسبته' : 'Profit & Margin'}</div>
                <div className="font-bold text-emerald-400 tabular-nums">
                  +{profit.toFixed(2)} ({profitMarginPercent}%)
                </div>
              </div>
            </div>
          </div>

          {/* Presets */}
          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
              {isAr ? 'أوزان / كميات شائعة:' : 'Quick Presets:'}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {presets.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setInputStr(val.toString())}
                  className={`py-1.5 px-2 text-xs font-semibold rounded-lg border transition-colors ${
                    inputStr === val.toString()
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {val} {isKg ? (isAr ? 'كغ' : 'kg') : (isAr ? 'لتر' : 'L')}
                </button>
              ))}
            </div>
          </div>

          {/* Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'BS'].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleKeyClick(key)}
                className={`py-2.5 text-base font-bold rounded-xl transition-colors active:scale-95 ${
                  key === 'BS'
                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100'
                    : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white'
                }`}
              >
                {key === 'BS' ? (isAr ? 'مسح' : 'Del') : key}
              </button>
            ))}
          </div>

          {/* Confirm Button */}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={quantity <= 0}
            className="w-full py-3 px-4 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-2 shadow-sm"
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
