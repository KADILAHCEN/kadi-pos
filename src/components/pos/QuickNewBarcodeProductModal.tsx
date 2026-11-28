import React, { useEffect, useRef, useState } from 'react';
import { usePos } from '../../context/PosContext';
import { Product } from '../../types';
import { bluetoothScanner } from '../../utils/bluetoothScanner';
import { playSound } from '../../utils/audio';
import { lookupProductByBarcode } from '../../utils/openFoodFacts';
import { Barcode, CheckCircle2, Globe, Loader2, PackagePlus, Search, Sparkles, X } from 'lucide-react';
import { PriceAlertAdvisor } from '../alerts/PriceAlertAdvisor';
import { parseMoroccanNumber, recordPriceAlert, sanitizeDecimalInput } from '../../utils/priceAlerts';

export type QuickBarcodeSourceContext = 'pos' | 'inventory' | 'invoice' | 'price_checker' | 'global';

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
  const { categories, addProduct, currencySymbol, settings, language, isOnline } = usePos();
  const isAr = language === 'ar';

  const defaultCatId =
    categories.find((c) => c.id !== 'cat-all')?.id || categories[0]?.id || 'cat-1';

  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [price, setPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [stock, setStock] = useState('10');
  const [unitType, setUnitType] = useState<'piece' | 'kg' | 'gram' | 'liter' | 'box'>('piece');
  const [categoryId, setCategoryId] = useState(defaultCatId);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [foundImageUrl, setFoundImageUrl] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<'idle' | 'searching' | 'found' | 'not_found' | 'offline'>('idle');
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const userEditedNameRef = useRef(false);
  const activeLookupAbortRef = useRef<AbortController | null>(null);

  const runOpenFoodFactsLookup = async (code: string, forceOverwriteName = false) => {
    const cleanCode = code.trim();
    if (!cleanCode) {
      setLookupStatus('idle');
      setLookupMessage(isAr ? 'كتب الباركود أولا' : 'Enter barcode first');
      return;
    }

    if (cleanCode.length < 6) {
      setLookupStatus('not_found');
      setLookupMessage(isAr ? 'باركود قصير بزاف، كتب الاسم يدوي' : 'Barcode too short — enter name manually');
      return;
    }

    activeLookupAbortRef.current?.abort();
    const controller = new AbortController();
    activeLookupAbortRef.current = controller;

    setIsLookingUp(true);
    setLookupStatus('searching');
    setLookupMessage(
      isOnline
        ? isAr
          ? 'كنقلب في Open Food / Beauty / Products...'
          : 'Searching Open Food, Beauty & Products...'
        : isAr
        ? 'كنقلب في الذاكرة المحلية (أوفلاين)...'
        : 'Checking offline IndexedDB cache...'
    );

    const res = await lookupProductByBarcode(cleanCode, controller.signal);
    if (controller.signal.aborted) return;

    setIsLookingUp(false);

    if (res.found) {
      setLookupStatus('found');
      const srcTag = res.fromCache
        ? isAr
          ? 'من الذاكرة أوفلاين'
          : 'Offline Cache'
        : res.sourceLabel || 'OpenFacts';
      setLookupMessage(isAr ? `لقيتو (${srcTag}): ${res.name}` : `Found (${srcTag}): ${res.name}`);
      if (forceOverwriteName || !userEditedNameRef.current) {
        setName(res.name);
        setNameEn(res.nameEn || res.name);
      }
      if (res.imageUrl) {
        setFoundImageUrl(res.imageUrl);
      }
      if (settings.bluetoothSoundFeedback !== false) {
        playSound('click');
      }
      return;
    }

    if (res.offline) {
      setLookupStatus('offline');
      setLookupMessage(isAr ? 'أوفلاين ومامسجلش فـ IndexedDB — كتب الاسم وحفظ عادي' : 'Offline — enter name & price manually');
      return;
    }

    setLookupStatus('not_found');
    setLookupMessage(
      res.error
        ? isAr
          ? 'تعذر البحث دابا، كتب الاسم يدوي'
          : 'Lookup unavailable — enter name manually'
        : isAr
        ? 'ما لقيتوش فـ 3 قواعد، كتب الاسم يدوي'
        : 'Not found in Food/Beauty/Products DBs — enter manually'
    );
  };

  useEffect(() => {
    if (!isOpen) {
      activeLookupAbortRef.current?.abort();
      bluetoothScanner.popScope('new_barcode_modal');
      return;
    }

    bluetoothScanner.pushScope('new_barcode_modal');
    userEditedNameRef.current = false;
    setName('');
    setNameEn('');
    setPrice('');
    setCostPrice('');
    setStock(sourceContext === 'pos' ? '10' : '1');
    setCategoryId(defaultCatId);
    setErrorMsg(null);
    setFoundImageUrl('');
    setIsLookingUp(false);
    setLookupStatus('idle');
    setLookupMessage(null);

    const timer = window.setTimeout(() => {
      nameInputRef.current?.focus();
    }, 80);

    const cleanCode = scannedBarcode.trim();
    if (cleanCode.length >= 6) {
      void runOpenFoodFactsLookup(cleanCode, false);
    }

    return () => {
      window.clearTimeout(timer);
      activeLookupAbortRef.current?.abort();
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
    const rawStockNum = parseFloat(stock.replace(',', '.'));
    const parsedStock = Number.isFinite(rawStockNum) && rawStockNum >= 0 ? rawStockNum : 0;
    const cleanCode = scannedBarcode.trim();

    const result = addProduct({
      name: cleanName,
      nameEn: nameEn.trim() || cleanName,
      sku: cleanCode.length > 0 ? `BC-${cleanCode.slice(-6)}` : `SKU-${Date.now().toString().slice(-5)}`,
      barcode: cleanCode,
      price: Number(cleanPrice.toFixed(2)),
      costPrice: finalCost,
      categoryId,
      unitType,
      stock: parsedStock,
      lowStockThreshold: 5,
      color: '#10B981',
      image: foundImageUrl || '',
      hasVariants: false
    });

    if (!result.success || !result.product) {
      setErrorMsg(
        result.message ||
          (isAr ? 'تعذر حفظ السلعة، تحقق من الباركود' : 'Could not save product')
      );
      return;
    }

    if (finalCost > 0 && cleanPrice <= finalCost) {
      recordPriceAlert({
        productId: result.product.id,
        productName: result.product.name,
        costPrice: finalCost,
        sellPrice: Number(cleanPrice.toFixed(2)),
        type: cleanPrice < finalCost ? 'loss' : 'zero_profit'
      });
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
          {/* Scanned Barcode Badge + OpenFoodFacts Lookup */}
          <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-bold">
                <Barcode className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{isAr ? 'الباركود المقروء:' : 'Scanned Barcode:'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-black text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-900 px-3 py-1 rounded-xl border border-slate-300 dark:border-slate-600 select-all">
                  {scannedBarcode}
                </span>
                <button
                  type="button"
                  disabled={isLookingUp}
                  onClick={() => void runOpenFoodFactsLookup(scannedBarcode, true)}
                  className="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-[11px] flex items-center gap-1 shadow-2xs transition-colors"
                  title={isAr ? 'جلب اسم وصورة المنتوج من OpenFoodFacts' : 'Lookup product on OpenFoodFacts'}
                >
                  {isLookingUp ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <Search className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{isAr ? 'قلب' : 'Lookup'}</span>
                </button>
              </div>
            </div>

            {lookupMessage && (
              <div
                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border ${
                  lookupStatus === 'found'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                    : lookupStatus === 'searching'
                    ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                    : 'bg-slate-200/70 dark:bg-slate-700/60 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {foundImageUrl ? (
                    <img
                      src={foundImageUrl}
                      alt={name || scannedBarcode}
                      className="w-7 h-7 rounded-lg object-cover border border-emerald-300 shrink-0 bg-white"
                    />
                  ) : lookupStatus === 'searching' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <Globe className="w-3.5 h-3.5 shrink-0 opacity-80" />
                  )}
                  <span className="truncate">{lookupMessage}</span>
                </div>
                {foundImageUrl && (
                  <button
                    type="button"
                    onClick={() => setFoundImageUrl('')}
                    className="p-0.5 rounded-md hover:bg-emerald-200/60 dark:hover:bg-emerald-900/60 shrink-0"
                    title={isAr ? 'إزالة الصورة' : 'Remove image'}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
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
                userEditedNameRef.current = true;
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
                type="text"
                inputMode="decimal"
                required
                data-barcode-allow-input="true"
                value={price}
                onChange={(e) => {
                  setPrice(sanitizeDecimalInput(e.target.value));
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
                type="text"
                inputMode="decimal"
                data-barcode-allow-input="true"
                value={costPrice}
                onChange={(e) => setCostPrice(sanitizeDecimalInput(e.target.value))}
                placeholder={isAr ? 'اختياري' : 'Optional'}
                className="w-full px-3.5 py-2.5 text-base font-mono font-bold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <PriceAlertAdvisor
            costPrice={parseMoroccanNumber(costPrice)}
            sellPrice={parseMoroccanNumber(price)}
            currencySymbol={currencySymbol}
            isAr={isAr}
            onApplyChoice={(patch) => {
              if (typeof patch.price === 'number') setPrice(String(patch.price));
              if (typeof patch.costPrice === 'number') setCostPrice(String(patch.costPrice));
            }}
          />

          {/* Stock & Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block font-bold text-slate-600 dark:text-slate-400">
                  {isAr ? 'الكمية فـ المخزون' : 'Initial Stock'}
                </label>
                <button
                  type="button"
                  onClick={() => setStock('0')}
                  className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-[10px] font-extrabold text-slate-700 dark:text-slate-200"
                >
                  0
                </button>
              </div>
              <input
                type="number"
                step="any"
                min="0"
                data-barcode-allow-input="true"
                value={stock}
                placeholder="0"
                onFocus={(e) => e.target.select()}
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

          <div>
            <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1.5">
              {isAr ? 'وحدة القياس والبيع' : 'Selling Unit'}
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {(
                [
                  { id: 'piece', label: isAr ? 'حبة' : 'Pc' },
                  { id: 'gram', label: isAr ? 'غرام' : 'g' },
                  { id: 'kg', label: isAr ? 'كيلو' : 'Kg' },
                  { id: 'liter', label: isAr ? 'لتر' : 'L' },
                  { id: 'box', label: isAr ? 'كرتون' : 'Box' }
                ] as const
              ).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setUnitType(u.id)}
                  className={`py-1.5 rounded-xl border text-[11px] font-bold transition-colors ${
                    unitType === u.id
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {u.label}
                </button>
              ))}
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
