import React, { useEffect, useRef, useState } from 'react';
import { usePos } from '../../context/PosContext';
import { Product } from '../../types';
import { bluetoothScanner } from '../../utils/bluetoothScanner';
import { playSound } from '../../utils/audio';
import { Barcode, CheckCircle2, PackagePlus, Sparkles, X } from 'lucide-react';

export type QuickBarcodeSourceContext = 'pos' | 'inventory' | 'invoice' | 'global';

interface QuickNewBarcodeProductModalProps {
  isOpen: boolean;
  scannedBarcode: string;
  sourceContext: QuickBarcodeSourceContext;
  onClose: () => void;
  onProductSaved: (product: Product) => void;
}

export const QuickNewBarcodeProductModal: React.FC<QuickNewBarcodeProductModalProps> = ({
  isOpen,
  scannedBarcode,
  sourceContext,
  onClose,
  onProductSaved
}) => {
  const { categories, addProduct, currencySymbol, settings, language } = usePos();
  const isAr = language === 'ar';

  const defaultCatId =
    categories.find((c) => c.id !== 'cat-all')?.id || categories[0]?.id || 'cat-1';

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [stock, setStock] = useState('10');
  const [categoryId, setCategoryId] = useState(defaultCatId);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      bluetoothScanner.popScope('new_barcode_modal');
      return;
    }

    bluetoothScanner.pushScope('new_barcode_modal');
    setName('');
    setPrice('');
    setCostPrice('');
    setStock(sourceContext === 'pos' ? '10' : '1');
    setCategoryId(defaultCatId);
    setErrorMsg(null);

    const timer = window.setTimeout(() => {
      nameInputRef.current?.focus();
    }, 80);

    return () => {
      window.clearTimeout(timer);
      bluetoothScanner.popScope('new_barcode_modal');
    };
  }, [isOpen, scannedBarcode, sourceContext, defaultCatId]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanPrice = parseFloat(price);

    if (!cleanName) {
      setErrorMsg(isAr ? 'عافاك دخل إسم السلعة' : 'Please enter product name');
      nameInputRef.current?.focus();
      return;
    }

    if (isNaN(cleanPrice) || cleanPrice <= 0) {
      setErrorMsg(isAr ? 'عافاك دخل ثمن البيع الصحيح' : 'Please enter a valid price');
      return;
    }

    const parsedCost = parseFloat(costPrice);
    const finalCost =
      !isNaN(parsedCost) && parsedCost >= 0
        ? parsedCost
        : Number((cleanPrice * 0.78).toFixed(2));
    const parsedStock = Math.max(0, parseFloat(stock) || 0);
    const cleanCode = scannedBarcode.trim();

    const result = addProduct({
      name: cleanName,
      nameEn: cleanName,
      sku: cleanCode.length > 0 ? `BC-${cleanCode.slice(-6)}` : `SKU-${Date.now().toString().slice(-5)}`,
      barcode: cleanCode,
      price: Number(cleanPrice.toFixed(2)),
      costPrice: finalCost,
      categoryId,
      unitType: 'piece',
      stock: sourceContext === 'pos' ? Math.max(1, parsedStock) : parsedStock,
      lowStockThreshold: 5,
      color: '#10B981',
      image: '',
      hasVariants: false
    });

    if (!result.success || !result.product) {
      setErrorMsg(
        result.message ||
          (isAr ? 'تعذر حفظ السلعة، تحقق من الباركود' : 'Could not save product')
      );
      return;
    }

    if (settings.bluetoothSoundFeedback !== false) {
      playSound('beep');
    }

    onProductSaved(result.product);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-amber-50/90 dark:bg-amber-950/40 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-sm">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-slate-900 dark:text-white text-sm sm:text-base truncate">
                {isAr ? 'سلعة جديدة - دخل اسمها و ثمنها' : 'New Product - Enter Name & Price'}
              </h3>
              <p className="text-[11px] text-amber-800 dark:text-amber-300 font-bold">
                {isAr
                  ? 'هاد الباركود جديد، سجلو دابا باش المرة الجاية يخرج أوتوماتيك'
                  : 'New barcode — save it once to auto-fill next time'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-500 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800"
            title={isAr ? 'إلغاء' : 'Cancel'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Scanned Barcode Badge */}
          <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-bold">
              <Barcode className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{isAr ? 'الباركود المقروء:' : 'Scanned Barcode:'}</span>
            </div>
            <span className="font-mono font-black text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-900 px-3 py-1 rounded-xl border border-slate-300 dark:border-slate-600 select-all">
              {scannedBarcode}
            </span>
          </div>

          {errorMsg && (
            <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold">
              {errorMsg}
            </div>
          )}

          {/* Product Name */}
          <div>
            <label className="block font-black text-slate-800 dark:text-slate-200 mb-1.5">
              {isAr ? 'إسم السلعة *' : 'Product Name *'}
            </label>
            <input
              ref={nameInputRef}
              type="text"
              required
              data-barcode-allow-input="true"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder={isAr ? 'مثال: كوكا كولا 1 لتر، بيمو، حليب سنطرال...' : 'e.g. Coca Cola 1L'}
              className="w-full px-3.5 py-2.5 text-sm font-bold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Sale Price & Cost Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-black text-slate-800 dark:text-slate-200 mb-1.5">
                {isAr ? `ثمن البيع (${currencySymbol}) *` : `Sale Price (${currencySymbol}) *`}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.1"
                required
                data-barcode-allow-input="true"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 text-base font-mono font-black rounded-xl bg-slate-50 dark:bg-slate-800 border border-emerald-400 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                {isAr ? `ثمن الشراء (${currencySymbol})` : `Cost Price (${currencySymbol})`}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                data-barcode-allow-input="true"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder={isAr ? 'اختياري' : 'Optional'}
                className="w-full px-3.5 py-2.5 text-base font-mono font-bold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Stock & Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                {isAr ? 'الكمية فـ المخزون' : 'Initial Stock'}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                data-barcode-allow-input="true"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full px-3.5 py-2 text-sm font-mono font-bold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                {isAr ? 'الصنف / الفئة' : 'Category'}
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              >
                {categories
                  .filter((c) => c.id !== 'cat-all')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {isAr ? c.name : c.nameEn}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Offline assurance note */}
          <div className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
            <span>
              {sourceContext === 'pos'
                ? isAr
                  ? 'غادي تتحفظ فالسلع + تتزاد نيشان للسلة مع صوت "بيب" (بلا أنترنت)'
                  : 'Saves offline & adds straight to Cart with beep'
                : sourceContext === 'invoice'
                ? isAr
                  ? 'غادي تتحفظ فالسلع + تتزاد نيشان للفاتورة (بلا أنترنت)'
                  : 'Saves offline & adds row straight to Invoice'
                : isAr
                ? 'غادي تتحفظ فالسلع والباركود للمرات الجاية (بلا أنترنت)'
                : 'Saves barcode offline to catalog for future scans'}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black flex items-center gap-2 shadow-sm transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {sourceContext === 'pos'
                  ? isAr
                    ? 'حفظ وزيد للسلة'
                    : 'Save & Add to Cart'
                  : sourceContext === 'invoice'
                  ? isAr
                    ? 'حفظ وزيد للفاتورة'
                    : 'Save & Add to Invoice'
                  : isAr
                  ? 'حفظ السلعة والباركود'
                  : 'Save Product & Barcode'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
