import React, { useEffect, useMemo, useState } from 'react';
import {
  Barcode,
  Check,
  FileDown,
  Minus,
  Plus,
  Printer,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { usePos } from '../../context/PosContext';
import { Product } from '../../types';
import {
  encodeBarcodeModules,
  exportShelfLabelsPdf,
  printShelfLabelsViaIframe,
  ShelfLabelLayout,
  ShelfLabelPrintItem
} from '../../utils/barcodeLabels';

interface ShelfLabelPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProducts?: Product[];
}

export const ShelfLabelPrintModal: React.FC<ShelfLabelPrintModalProps> = ({
  isOpen,
  onClose,
  initialProducts
}) => {
  const { products, settings, currencySymbol, language } = usePos();
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [selectedItems, setSelectedItems] = useState<ShelfLabelPrintItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [layout, setLayout] = useState<ShelfLabelLayout>('a4_grid');
  const [showStoreName, setShowStoreName] = useState(true);
  const [showWholesalePrice, setShowWholesalePrice] = useState(true);
  const [showSku, setShowSku] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFeedbackMsg(null);
    setSearchQuery('');
    if (initialProducts && initialProducts.length > 0) {
      setSelectedItems(initialProducts.map((p) => ({ product: p, copies: 1 })));
    } else {
      setSelectedItems([]);
    }
  }, [isOpen, initialProducts]);

  const selectedIds = useMemo(() => {
    const s = new Set<string>();
    selectedItems.forEach((it) => s.add(it.product.id));
    return s;
  }, [selectedItems]);

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.nameEn || '').toLowerCase().includes(q) ||
          (p.barcode || '').toLowerCase().includes(q) ||
          (p.sku || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 40);
  }, [products, searchQuery]);

  const totalLabelsCount = useMemo(
    () => selectedItems.reduce((sum, it) => sum + Math.max(1, it.copies), 0),
    [selectedItems]
  );

  const previewProduct = selectedItems[0]?.product || filteredCatalog[0] || null;
  const previewBarcode = useMemo(() => {
    if (!previewProduct) return null;
    const raw = (previewProduct.barcode || previewProduct.sku || previewProduct.id).trim();
    return encodeBarcodeModules(raw);
  }, [previewProduct]);

  if (!isOpen) return null;

  const toggleProduct = (prod: Product) => {
    setSelectedItems((prev) => {
      const exists = prev.some((it) => it.product.id === prod.id);
      if (exists) return prev.filter((it) => it.product.id !== prod.id);
      return [...prev, { product: prod, copies: 1 }];
    });
  };

  const updateCopies = (productId: string, nextCopies: number) => {
    const clamped = Math.max(1, Math.min(200, Math.round(nextCopies) || 1));
    setSelectedItems((prev) =>
      prev.map((it) => (it.product.id === productId ? { ...it, copies: clamped } : it))
    );
  };

  const handleExportPdf = () => {
    if (selectedItems.length === 0) return;
    const file = exportShelfLabelsPdf({
      items: selectedItems,
      settings,
      currencySymbol,
      language,
      layout,
      showStoreName,
      showWholesalePrice,
      showSku
    });
    if (file) {
      setFeedbackMsg(
        isAr ? `تم تحميل ملف PDF: ${file}` : `PDF téléchargé : ${file}`
      );
    }
  };

  const handlePrintNow = () => {
    if (selectedItems.length === 0) return;
    printShelfLabelsViaIframe({
      items: selectedItems,
      settings,
      currencySymbol,
      language,
      layout,
      showStoreName,
      showWholesalePrice,
      showSku
    });
    setFeedbackMsg(isAr ? 'تم إرسال الملصقات للطباعة.' : 'Étiquettes envoyées à l’impression.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/65 backdrop-blur-xs">
      <div className="w-full max-w-4xl max-h-[92vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center shrink-0">
              <Barcode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                {isAr
                  ? 'طباعة ملصقات الرفوف والباركود'
                  : isFr
                  ? 'Étiquettes de Rayon & Codes-barres'
                  : 'Shelf Price & Barcode Labels'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {isAr
                  ? 'إصدار ملصقات EAN-13 و Code-128 بصيغة A4 أو رولو حراري 58mm / 80mm'
                  : 'A4 3×7 ou rouleau thermique 58mm / 80mm'}
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Product Selection */}
          <div className="lg:col-span-7 flex flex-col gap-3 min-h-0">
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    isAr ? 'ابحث باسم السلعة، الباركود أو SKU...' : 'Rechercher produit, code-barres...'
                  }
                  className="w-full ps-9 pe-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  setSelectedItems(filteredCatalog.slice(0, 21).map((p) => ({ product: p, copies: 1 })))
                }
                className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                {isAr ? 'تحديد الكل (أول 21)' : 'Tout (21)'}
              </button>
            </div>

            {/* Searchable catalog list */}
            <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
              {filteredCatalog.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  {isAr ? 'لا توجد سلع مطابقة' : 'Aucun produit trouvé'}
                </div>
              ) : (
                filteredCatalog.map((prod) => {
                  const isPicked = selectedIds.has(prod.id);
                  return (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => toggleProduct(prod)}
                      className={`w-full px-3 py-2 flex items-center justify-between gap-2 text-start text-xs transition-colors ${
                        isPicked
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                            isPicked
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {isPicked && <Check className="w-3 h-3" />}
                        </span>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 dark:text-white truncate">
                            {prod.name}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                            {prod.barcode || prod.sku || prod.id}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono tabular-nums font-bold text-slate-800 dark:text-slate-200 shrink-0">
                        {prod.price.toFixed(2)} {currencySymbol}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Selected queue with copies stepper */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                {isAr
                  ? `قائمة الطباعة (${selectedItems.length} سلع · ${totalLabelsCount} ملصق)`
                  : `File d'impression (${selectedItems.length} produits · ${totalLabelsCount} étiquettes)`}
              </span>
              {selectedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedItems([])}
                  className="text-xs font-bold text-rose-600 hover:text-rose-700"
                >
                  {isAr ? 'إفراغ القائمة' : 'Vider'}
                </button>
              )}
            </div>

            <div className="flex-1 min-h-[150px] max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
              {selectedItems.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  {isAr
                    ? 'اختر سلعة أو أكثر من الأعلى لإضافتها لقائمة الطباعة.'
                    : 'Sélectionnez des produits ci-dessus pour imprimer leurs étiquettes.'}
                </div>
              ) : (
                selectedItems.map(({ product, copies }) => (
                  <div
                    key={product.id}
                    className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 dark:text-white truncate">
                        {product.name}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {product.price.toFixed(2)} {currencySymbol} · {product.barcode || product.sku}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateCopies(product.id, copies - 1)}
                        className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={copies}
                        onChange={(e) => updateCopies(product.id, Number(e.target.value))}
                        className="w-12 py-1 text-center font-mono tabular-nums font-bold text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => updateCopies(product.id, copies + 1)}
                        className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedItems((prev) =>
                            prev.filter((it) => it.product.id !== product.id)
                          )
                        }
                        className="p-1.5 text-rose-500 hover:text-rose-600"
                        aria-label="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Layout Settings & Live Preview */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Layout selector */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                {isAr ? 'مقاس ورق الطباعة' : 'Format de papier'}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'a4_grid', label: isAr ? 'A4 (3×7)' : 'A4 (3×7)' },
                    { id: 'thermal_58', label: '58mm' },
                    { id: 'thermal_80', label: '80mm' }
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setLayout(opt.id)}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap ${
                      layout === opt.id
                        ? 'bg-slate-900 dark:bg-emerald-600 border-slate-900 dark:border-emerald-600 text-white'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2 pt-1 text-xs">
                <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                  <span className="font-semibold">
                    {isAr ? 'إظهار اسم المتجر' : 'Afficher nom du magasin'}
                  </span>
                  <input
                    type="checkbox"
                    checked={showStoreName}
                    onChange={(e) => setShowStoreName(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                  <span className="font-semibold">
                    {isAr ? 'إظهار سعر الجملة (إن وجد)' : 'Afficher prix de gros'}
                  </span>
                  <input
                    type="checkbox"
                    checked={showWholesalePrice}
                    onChange={(e) => setShowWholesalePrice(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                  <span className="font-semibold">
                    {isAr ? 'إظهار رمز SKU أسفل الباركود' : 'Afficher SKU'}
                  </span>
                  <input
                    type="checkbox"
                    checked={showSku}
                    onChange={(e) => setShowSku(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded"
                  />
                </label>
              </div>
            </div>

            {/* Live Label Preview */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                {isAr ? 'معاينة حية للملصق' : 'Aperçu en direct'}
              </div>
              {previewProduct && previewBarcode ? (
                <div className="bg-white text-slate-900 border-2 border-slate-900 rounded-lg p-3 space-y-2 shadow-xs">
                  {showStoreName && (
                    <div className="text-[10px] font-bold text-slate-500 text-center truncate">
                      {settings.storeName || 'Kadi POS'}
                    </div>
                  )}
                  <div className="text-sm font-black text-center text-slate-900 leading-tight line-clamp-2">
                    {previewProduct.name}
                  </div>
                  <div className="bg-slate-100 rounded-md py-1.5 px-2 text-center">
                    <div className="font-mono tabular-nums text-xl font-black text-slate-950">
                      {previewProduct.price.toFixed(2)} {currencySymbol}
                    </div>
                    {showWholesalePrice &&
                      previewProduct.wholesaleMinQty &&
                      previewProduct.wholesalePrice && (
                        <div className="text-[10px] font-bold text-emerald-700">
                          {isAr
                            ? `جملة +${previewProduct.wholesaleMinQty}: ${previewProduct.wholesalePrice.toFixed(2)} ${currencySymbol}`
                            : `Gros +${previewProduct.wholesaleMinQty}: ${previewProduct.wholesalePrice.toFixed(2)} ${currencySymbol}`}
                        </div>
                      )}
                  </div>
                  <div className="pt-1 flex flex-col items-center">
                    <svg
                      viewBox={`0 0 ${previewBarcode.modules.length} 36`}
                      className="w-full max-w-[210px] h-9"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      {Array.from(previewBarcode.modules).map((bit, idx) =>
                        bit === '1' ? (
                          <rect key={idx} x={idx} y={0} width={1} height={36} fill="#0f172a" />
                        ) : null
                      )}
                    </svg>
                    <div className="text-[10px] font-mono font-bold text-slate-700 tracking-wider mt-0.5" dir="ltr">
                      {showSku && previewProduct.sku && previewProduct.sku !== previewBarcode.displayCode
                        ? `${previewBarcode.displayCode} · ${previewProduct.sku}`
                        : previewBarcode.displayCode}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
                  {isAr ? 'اختر سلعة للمعاينة' : 'Sélectionnez un produit'}
                </div>
              )}
            </div>

            {feedbackMsg && (
              <div className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                {feedbackMsg}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex flex-wrap items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
          >
            {isAr ? 'إغلاق' : 'Fermer'}
          </button>
          <button
            type="button"
            disabled={selectedItems.length === 0}
            onClick={handleExportPdf}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 disabled:opacity-45 flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <FileDown className="w-4 h-4" />
            <span>{isAr ? 'تحميل PDF' : 'Télécharger PDF'}</span>
          </button>
          <button
            type="button"
            disabled={selectedItems.length === 0}
            onClick={handlePrintNow}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-45 flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>{isAr ? 'طباعة مباشرة' : 'Imprimer'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
