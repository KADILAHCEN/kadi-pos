import React, { useMemo, useState } from 'react';
import { Product } from '../../types';
import { usePos } from '../../context/PosContext';
import { Scale, X, Check } from 'lucide-react';

interface ScaleModalProps {
  product: Product;
  remainingStock?: number;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
}

type ScaleInputMode = 'kg' | 'gram' | 'liter' | 'ml' | 'amount';

export const ScaleModal: React.FC<ScaleModalProps> = ({
  product,
  remainingStock,
  onClose,
  onConfirm
}) => {
  const { currencySymbol, language } = usePos();
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const unitType = product.unitType;
  const isGramBase = unitType === 'gram';
  const isKgBase = unitType === 'kg';
  const isLiterBase = unitType === 'liter';

  const baseUnitShort = isGramBase
    ? isAr
      ? 'غ'
      : 'g'
    : isKgBase
    ? isAr
      ? 'كغ'
      : 'kg'
    : isAr
    ? 'لتر'
    : 'L';

  const baseUnitFull = isGramBase
    ? isAr
      ? 'غرام (غ)'
      : isFr
      ? 'Gramme (g)'
      : 'Gram (g)'
    : isKgBase
    ? isAr
      ? 'كيلو (كغ)'
      : 'kg'
    : isAr
    ? 'لتر (ل)'
    : 'Liter';

  const [inputMode, setInputMode] = useState<ScaleInputMode>(() =>
    isGramBase ? 'gram' : isLiterBase ? 'liter' : 'kg'
  );
  const [inputStr, setInputStr] = useState<string>(() =>
    isGramBase ? '100' : '0.5'
  );

  const modeOptions = useMemo(() => {
    if (isGramBase || isKgBase) {
      return [
        {
          id: 'gram' as ScaleInputMode,
          label: isAr ? 'بالغرام (غ)' : isFr ? 'Grammes (g)' : 'Grams (g)'
        },
        {
          id: 'kg' as ScaleInputMode,
          label: isAr ? 'بالكيلو (كغ)' : isFr ? 'Kilo (kg)' : 'Kilogram (kg)'
        },
        {
          id: 'amount' as ScaleInputMode,
          label: isAr ? `بالثمن (${currencySymbol})` : `Par Prix (${currencySymbol})`
        }
      ];
    }
    return [
      {
        id: 'liter' as ScaleInputMode,
        label: isAr ? 'باللتر (L)' : 'Liter (L)'
      },
      {
        id: 'ml' as ScaleInputMode,
        label: isAr ? 'بالمليلتر (ml)' : 'Milliliter (ml)'
      },
      {
        id: 'amount' as ScaleInputMode,
        label: isAr ? `بالثمن (${currencySymbol})` : `By Price (${currencySymbol})`
      }
    ];
  }, [isGramBase, isKgBase, isAr, isFr, currencySymbol]);

  const activeInputUnitLabel = useMemo(() => {
    switch (inputMode) {
      case 'gram':
        return isAr ? 'غ' : 'g';
      case 'kg':
        return isAr ? 'كغ' : 'kg';
      case 'liter':
        return isAr ? 'لتر' : 'L';
      case 'ml':
        return isAr ? 'مل' : 'ml';
      case 'amount':
        return currencySymbol;
    }
  }, [inputMode, isAr, currencySymbol]);

  const rawNumericInput = parseFloat(inputStr) || 0;

  // Convert whatever the cashier typed into the product's base stock quantity
  const stockQuantity = useMemo(() => {
    if (rawNumericInput <= 0) return 0;
    if (inputMode === 'amount') {
      if (product.price <= 0) return 0;
      const computed = rawNumericInput / product.price;
      return isGramBase
        ? Number(computed.toFixed(2))
        : Number(computed.toFixed(3));
    }
    if (isGramBase) {
      if (inputMode === 'gram') return Number(rawNumericInput.toFixed(2));
      if (inputMode === 'kg') return Number((rawNumericInput * 1000).toFixed(2));
      return Number(rawNumericInput.toFixed(2));
    }
    if (isKgBase) {
      if (inputMode === 'gram') return Number((rawNumericInput / 1000).toFixed(3));
      return Number(rawNumericInput.toFixed(3));
    }
    // Liter base
    if (inputMode === 'ml') return Number((rawNumericInput / 1000).toFixed(3));
    return Number(rawNumericInput.toFixed(3));
  }, [rawNumericInput, inputMode, product.price, isGramBase, isKgBase]);

  const totalPrice =
    inputMode === 'amount'
      ? Number(rawNumericInput.toFixed(2))
      : Number((stockQuantity * product.price).toFixed(2));
  const totalCost = Number((stockQuantity * product.costPrice).toFixed(2));
  const profit = Number((totalPrice - totalCost).toFixed(2));
  const profitMarginPercent =
    totalPrice > 0 ? Number(((profit / totalPrice) * 100).toFixed(1)) : 0;

  const exceedsStock =
    remainingStock !== undefined && stockQuantity > remainingStock;

  // Equivalent readout for clarity (e.g., 0.250 kg <=> 250 غ)
  const secondaryEquivalentLabel = useMemo(() => {
    if (stockQuantity <= 0) return '';
    if (isKgBase) {
      const gramsVal = Math.round(stockQuantity * 1000);
      if (inputMode === 'gram') {
        return `= ${stockQuantity.toFixed(3)} ${isAr ? 'كغ' : 'kg'}`;
      }
      if (inputMode === 'amount') {
        return `${stockQuantity.toFixed(3)} ${isAr ? 'كغ' : 'kg'} · ${gramsVal} ${isAr ? 'غ' : 'g'}`;
      }
      return `= ${gramsVal} ${isAr ? 'غ' : 'g'}`;
    }
    if (isGramBase) {
      if (inputMode === 'kg') {
        return `= ${stockQuantity} ${isAr ? 'غ' : 'g'}`;
      }
      if (inputMode === 'amount') {
        return `= ${stockQuantity} ${isAr ? 'غ' : 'g'} (${(stockQuantity / 1000).toFixed(3)} ${isAr ? 'كغ' : 'kg'})`;
      }
      if (stockQuantity >= 1000) {
        return `= ${(stockQuantity / 1000).toFixed(3)} ${isAr ? 'كغ' : 'kg'}`;
      }
      return '';
    }
    if (isLiterBase) {
      if (inputMode === 'ml') {
        return `= ${stockQuantity.toFixed(3)} ${isAr ? 'لتر' : 'L'}`;
      }
      if (inputMode === 'amount') {
        return `= ${stockQuantity.toFixed(3)} ${isAr ? 'لتر' : 'L'} (${Math.round(stockQuantity * 1000)} ${isAr ? 'مل' : 'ml'})`;
      }
      return `= ${Math.round(stockQuantity * 1000)} ${isAr ? 'مل' : 'ml'}`;
    }
    return '';
  }, [stockQuantity, isKgBase, isGramBase, isLiterBase, inputMode, isAr]);

  const presets = useMemo(() => {
    if (inputMode === 'gram') {
      return isGramBase
        ? [5, 10, 20, 50, 100, 150, 250, 500]
        : [50, 100, 150, 200, 250, 400, 500, 750];
    }
    if (inputMode === 'kg') {
      return [0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 5.0];
    }
    if (inputMode === 'ml') {
      return [100, 200, 250, 330, 500, 750, 1000, 1500];
    }
    if (inputMode === 'liter') {
      return [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 5.0];
    }
    return [5, 10, 15, 20, 30, 50, 100, 200];
  }, [inputMode, isGramBase]);

  const handleModeSwitch = (nextMode: ScaleInputMode) => {
    if (nextMode === inputMode) return;
    // Smart conversion when switching modes so entered weight stays consistent
    if (stockQuantity > 0) {
      if (nextMode === 'gram') {
        const g = isGramBase ? stockQuantity : Math.round(stockQuantity * 1000);
        setInputStr(String(g));
      } else if (nextMode === 'kg') {
        const kg = isGramBase ? Number((stockQuantity / 1000).toFixed(3)) : stockQuantity;
        setInputStr(String(kg));
      } else if (nextMode === 'ml') {
        setInputStr(String(Math.round(stockQuantity * 1000)));
      } else if (nextMode === 'liter') {
        setInputStr(String(Number(stockQuantity.toFixed(3))));
      } else if (nextMode === 'amount') {
        setInputStr(String(Math.max(1, Math.round(totalPrice))));
      }
    } else {
      setInputStr(
        nextMode === 'gram'
          ? '100'
          : nextMode === 'ml'
          ? '250'
          : nextMode === 'amount'
          ? '10'
          : '0.5'
      );
    }
    setInputMode(nextMode);
  };

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
    if (stockQuantity > 0) {
      onConfirm(stockQuantity);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 dark:text-white text-base truncate">
                {isAr ? product.name : product.nameEn}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {product.price.toFixed(2)} {currencySymbol} / {baseUnitFull}
                {remainingStock !== undefined && (
                  <span className="mx-1.5">
                    · {isAr ? 'المتوفر:' : 'Stock:'} {remainingStock} {baseUnitShort}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-3.5">
          {/* Segmented Unit Mode Switcher (Gram / Kg / Price) */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {modeOptions.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleModeSwitch(m.id)}
                className={`py-2 px-2 rounded-lg text-xs font-extrabold transition-colors whitespace-nowrap ${
                  inputMode === m.id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Digital Scale Screen */}
          <div className="p-4 rounded-xl bg-slate-900 text-white text-center shadow-inner">
            <div className="text-[11px] text-slate-400 font-medium mb-1">
              {inputMode === 'amount'
                ? isAr
                  ? `المبلغ المطلوب (${currencySymbol})`
                  : `Requested Amount (${currencySymbol})`
                : isAr
                ? 'الوزن / الكمية المدخلة'
                : 'Entered Weight / Quantity'}
            </div>
            <div className="text-4xl font-extrabold font-mono tracking-wider tabular-nums text-emerald-400">
              {inputStr || '0'}{' '}
              <span className="text-lg text-slate-300 font-sans">{activeInputUnitLabel}</span>
            </div>

            {secondaryEquivalentLabel && (
              <div className="mt-1 text-xs font-mono font-bold text-amber-300 tabular-nums">
                {secondaryEquivalentLabel}
              </div>
            )}

            {/* Calculations breakdown */}
            <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-around text-xs">
              <div>
                <div className="text-slate-400">{isAr ? 'السعر المطلوب' : 'Price'}</div>
                <div className="font-bold text-base text-white tabular-nums font-mono">
                  {totalPrice.toFixed(2)} {currencySymbol}
                </div>
              </div>
              <div className="h-6 w-px bg-slate-800" />
              <div>
                <div className="text-slate-400">{isAr ? 'التكلفة' : 'Cost'}</div>
                <div className="font-semibold text-slate-300 tabular-nums font-mono">
                  {totalCost.toFixed(2)} {currencySymbol}
                </div>
              </div>
              <div className="h-6 w-px bg-slate-800" />
              <div>
                <div className="text-slate-400">{isAr ? 'الربح ونسبته' : 'Profit & Margin'}</div>
                <div className="font-bold text-emerald-400 tabular-nums font-mono">
                  +{profit.toFixed(2)} ({profitMarginPercent}%)
                </div>
              </div>
            </div>
          </div>

          {exceedsStock && (
            <div className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold text-center">
              {isAr
                ? `الكمية المطلوبة (${stockQuantity} ${baseUnitShort}) أكبر من المتوفر في المخزون (${remainingStock} ${baseUnitShort})`
                : `Requested (${stockQuantity} ${baseUnitShort}) exceeds remaining stock (${remainingStock} ${baseUnitShort})`}
            </div>
          )}

          {/* Presets */}
          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
              {inputMode === 'gram'
                ? isAr
                  ? 'أوزان سريعة بالغرام:'
                  : 'Quick Grams:'
                : inputMode === 'amount'
                ? isAr
                  ? 'مبالغ سريعة:'
                  : 'Quick Amounts:'
                : isAr
                ? 'أوزان / كميات شائعة:'
                : 'Quick Presets:'}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {presets.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setInputStr(val.toString())}
                  className={`py-1.5 px-2 text-xs font-bold font-mono tabular-nums rounded-lg border transition-colors whitespace-nowrap ${
                    inputStr === val.toString()
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {val} {activeInputUnitLabel}
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
            disabled={stockQuantity <= 0 || exceedsStock}
            className="w-full py-3 px-4 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <Check className="w-5 h-5" />
            <span className="font-mono tabular-nums">
              {isAr ? 'إضافة إلى الفاتورة' : 'Add to Order'} · {totalPrice.toFixed(2)} {currencySymbol}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
