import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { Product } from '../../types';

interface RetailProductSearchSelectProps {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
  excludeProductId?: string;
  currencySymbol: string;
  isAr: boolean;
  placeholder?: string;
  required?: boolean;
  inputClassName?: string;
}

export const RetailProductSearchSelect: React.FC<RetailProductSearchSelectProps> = ({
  products,
  value,
  onChange,
  excludeProductId,
  currencySymbol,
  isAr,
  placeholder,
  required = false,
  inputClassName
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showList, setShowList] = useState(false);

  const retailCandidates = useMemo(
    () =>
      products.filter(
        (p) => p.id !== excludeProductId && p.unitType !== 'box'
      ),
    [products, excludeProductId]
  );

  const selectedProduct = useMemo(
    () => retailCandidates.find((p) => p.id === value) || null,
    [retailCandidates, value]
  );

  useEffect(() => {
    if (selectedProduct) {
      setSearchQuery(selectedProduct.name);
    } else if (!value) {
      setSearchQuery('');
    }
  }, [value, selectedProduct]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowList(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    // If the text matches the currently selected product exactly while closed/opening, show all top items so user can easily switch
    if (!q || (selectedProduct && q === selectedProduct.name.trim().toLowerCase())) {
      return retailCandidates.slice(0, 25);
    }
    return retailCandidates
      .filter((p) => {
        const matchName = p.name.toLowerCase().includes(q);
        const matchNameEn = (p.nameEn || '').toLowerCase().includes(q);
        const matchBarcode = (p.barcode || '').toLowerCase().includes(q);
        const matchSku = (p.sku || '').toLowerCase().includes(q);
        return matchName || matchNameEn || matchBarcode || matchSku;
      })
      .slice(0, 25);
  }, [retailCandidates, searchQuery, selectedProduct]);

  const handleSelect = (product: Product) => {
    onChange(product.id);
    setSearchQuery(product.name);
    setShowList(false);
  };

  const handleClear = () => {
    onChange('');
    setSearchQuery('');
    setShowList(true);
  };

  const defaultInputCls =
    'w-full ps-8 pe-7 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-colors';

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onFocus={() => setShowList(true)}
          onChange={(e) => {
            const nextText = e.target.value;
            setSearchQuery(nextText);
            setShowList(true);
            if (!nextText.trim()) {
              onChange('');
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setShowList(false);
            } else if (e.key === 'Enter' && showList && filteredProducts.length > 0) {
              e.preventDefault();
              handleSelect(filteredProducts[0]);
            }
          }}
          placeholder={
            placeholder ||
            (isAr
              ? 'ابحث بالاسم أو الباركود لاختيار سلعة الحبة...'
              : 'Search retail product by name or barcode...')
          }
          className={inputClassName || defaultInputCls}
        />

        {(selectedProduct || searchQuery) && (
          <button
            type="button"
            onClick={handleClear}
            title={isAr ? 'مسح الاختيار' : 'Clear selection'}
            className="absolute end-1.5 p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {required && (
          <input
            tabIndex={-1}
            aria-hidden="true"
            required
            value={value}
            onChange={() => {}}
            className="sr-only"
          />
        )}
      </div>

      {selectedProduct && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">
            {selectedProduct.name} — {selectedProduct.price.toFixed(2)} {currencySymbol} •{' '}
            {isAr ? `المتوفر: ${selectedProduct.stock}` : `Stock: ${selectedProduct.stock}`}
          </span>
        </div>
      )}

      {showList && (
        <div className="absolute z-40 mt-1 w-full max-h-56 overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl divide-y divide-slate-100 dark:divide-slate-800">
          {filteredProducts.length > 0 ? (
            filteredProducts.map((p) => {
              const isSelected = p.id === value;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelect(p)}
                  className={`w-full px-3 py-2 text-start flex items-center justify-between gap-2 transition-colors ${
                    isSelected
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{p.name}</p>
                    {p.barcode && (
                      <p className="text-[10px] font-mono text-slate-400 truncate">{p.barcode}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {p.price.toFixed(2)} {currencySymbol}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {isAr ? `الرصيد: ${p.stock}` : `Stock: ${p.stock}`}
                    </p>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-3 text-center text-xs text-slate-500 dark:text-slate-400">
              {isAr ? 'لا توجد سلعة تطابق هذا البحث' : 'No matching retail products found'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
