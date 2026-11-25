import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Download,
  History,
  Minus,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  AlertTriangle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { usePos } from '../../context/PosContext';
import { BarcodeScannerModal } from '../pos/BarcodeScannerModal';
import { StocktakeSessionRecord } from '../../types';
import { safeLocalStorageSet } from '../../utils/storage';

const DRAFT_STORAGE_KEY = 'kadi_pos_stocktake_draft_v1';

type StocktakeFilterMode = 'all' | 'uncounted' | 'variance' | 'matched';

export const StocktakePanel: React.FC = () => {
  const {
    products,
    categories,
    stocktakeHistory,
    applyStocktakeSession,
    currencySymbol,
    language
  } = usePos();

  const isAr = language === 'ar';

  const [countsDraft, setCountsDraft] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [sessionNote, setSessionNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCat, setSelectedCat] = useState('all');
  const [filterMode, setFilterMode] = useState<StocktakeFilterMode>('all');
  const [showScanner, setShowScanner] = useState(false);
  const [scanStep, setScanStep] = useState<1 | 5 | 10 | 12>(1);
  const [lastScannedProductId, setLastScannedProductId] = useState<string | null>(null);
  const [confirmApplyOpen, setConfirmApplyOpen] = useState(false);
  const [lastCompletedSession, setLastCompletedSession] = useState<StocktakeSessionRecord | null>(null);
  const [scanBanner, setScanBanner] = useState<{
    text: string;
    isError?: boolean;
    unknownCode?: string;
  } | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  useEffect(() => {
    safeLocalStorageSet(DRAFT_STORAGE_KEY, JSON.stringify(countsDraft));
  }, [countsDraft]);

  useEffect(() => {
    const onQuickCreated = (evt: Event) => {
      const detail = (evt as CustomEvent<{ product?: { id: string; name: string; stock: number }; sourceContext?: string }>).detail;
      if (detail?.sourceContext !== 'inventory' || !detail.product) return;
      const created = detail.product;
      setCountsDraft((prev) => ({
        ...prev,
        [created.id]: Math.max(scanStep, created.stock || scanStep)
      }));
      setLastScannedProductId(created.id);
      setScanBanner({
        text: isAr
          ? `✅ تمت إضافة "${created.name}" للمخزون وعدّها في الجرد`
          : `✅ Added "${created.name}" & counted in stocktake`
      });
    };
    window.addEventListener('kadi:quick-barcode-product-created', onQuickCreated);
    return () => window.removeEventListener('kadi:quick-barcode-product-created', onQuickCreated);
  }, [isAr, scanStep]);

  const setProductCount = (productId: string, value: number) => {
    const clean = Math.max(0, Number(value.toFixed(2)));
    setCountsDraft((prev) => ({ ...prev, [productId]: clean }));
  };

  const clearProductCount = (productId: string) => {
    setCountsDraft((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const fillRemainingAsSystemMatch = () => {
    setCountsDraft((prev) => {
      const next = { ...prev };
      products.forEach((p) => {
        if (next[p.id] === undefined) {
          next[p.id] = p.stock;
        }
      });
      return next;
    });
  };

  const resetDraft = () => {
    setCountsDraft({});
    setNotesDraft({});
    setSessionNote('');
    setConfirmApplyOpen(false);
  };

  const handleBarcodeScanned = (code: string) => {
    const clean = code.trim().toLowerCase();
    const matched = products.find(
      (p) => p.barcode.toLowerCase() === clean || p.sku.toLowerCase() === clean
    );
    if (!matched) {
      setScanBanner({
        text: isAr ? `⚠️ هذا الباركود غير موجود في السلع: ${code}` : `⚠️ Barcode not found: ${code}`,
        isError: true,
        unknownCode: code.trim()
      });
      return;
    }

    const currentVal = countsDraft[matched.id] ?? 0;
    const nextVal = Number((currentVal + scanStep).toFixed(2));
    setProductCount(matched.id, nextVal);
    setLastScannedProductId(matched.id);
    setScanBanner({
      text: isAr
        ? `📷 تم عدّ +${scanStep} لـ "${matched.name}" (العدّ الحالي: ${nextVal})`
        : `📷 Counted +${scanStep} for "${matched.name}" (Total: ${nextVal})`
    });
    window.setTimeout(() => setScanBanner(null), 4000);
  };

  const lastScannedProduct = useMemo(
    () => (lastScannedProductId ? products.find((p) => p.id === lastScannedProductId) || null : null),
    [lastScannedProductId, products]
  );

  // Summary Metrics
  const summary = useMemo(() => {
    let countedItems = 0;
    let matchedItems = 0;
    let discrepancyItems = 0;
    let shrinkageUnits = 0;
    let shrinkageValue = 0;
    let surplusUnits = 0;
    let surplusValue = 0;
    let realCostValuation = 0;
    let realRetailValuation = 0;

    products.forEach((p) => {
      const counted = countsDraft[p.id];
      const effectiveQty = counted !== undefined ? counted : p.stock;
      realCostValuation += effectiveQty * p.costPrice;
      realRetailValuation += effectiveQty * p.price;

      if (counted !== undefined) {
        countedItems += 1;
        const diff = Number((counted - p.stock).toFixed(2));
        if (diff === 0) {
          matchedItems += 1;
        } else {
          discrepancyItems += 1;
          const diffVal = Number((diff * p.costPrice).toFixed(2));
          if (diff < 0) {
            shrinkageUnits += Math.abs(diff);
            shrinkageValue += Math.abs(diffVal);
          } else {
            surplusUnits += diff;
            surplusValue += diffVal;
          }
        }
      }
    });

    return {
      totalProducts: products.length,
      countedItems,
      uncountedItems: products.length - countedItems,
      matchedItems,
      discrepancyItems,
      shrinkageUnits: Number(shrinkageUnits.toFixed(2)),
      shrinkageValue: Number(shrinkageValue.toFixed(2)),
      surplusUnits: Number(surplusUnits.toFixed(2)),
      surplusValue: Number(surplusValue.toFixed(2)),
      netVarianceValue: Number((surplusValue - shrinkageValue).toFixed(2)),
      realCostValuation: Number(realCostValuation.toFixed(2)),
      realRetailValuation: Number(realRetailValuation.toFixed(2))
    };
  }, [products, countsDraft]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCat !== 'all' && p.categoryId !== selectedCat) return false;
      if (q) {
        const hit =
          p.name.toLowerCase().includes(q) ||
          (p.nameEn || '').toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q);
        if (!hit) return false;
      }

      const counted = countsDraft[p.id];
      if (filterMode === 'uncounted') return counted === undefined;
      if (filterMode === 'matched') return counted !== undefined && counted === p.stock;
      if (filterMode === 'variance') return counted !== undefined && counted !== p.stock;
      return true;
    });
  }, [products, searchQuery, selectedCat, filterMode, countsDraft]);

  const handleConfirmApply = () => {
    const entries = Object.entries(countsDraft).map(([productId, countedStock]) => ({
      productId,
      countedStock,
      note: notesDraft[productId]
    }));
    if (entries.length === 0) return;

    const session = applyStocktakeSession(
      entries,
      sessionNote.trim() || (isAr ? 'جرد المخزون الحقيقي بالمحل' : 'Physical Shop Stocktake')
    );
    setLastCompletedSession(session);
    resetDraft();
  };

  const exportStocktakeCsv = () => {
    const headers = [
      isAr ? 'اسم السلعة' : 'Product',
      'SKU',
      isAr ? 'الباركود' : 'Barcode',
      isAr ? 'الوحدة' : 'Unit',
      isAr ? 'المسجل بالنظام' : 'System Stock',
      isAr ? 'الجرد الحقيقي' : 'Counted Stock',
      isAr ? 'الفرق' : 'Variance',
      isAr ? 'ثمن الشراء' : 'Cost',
      isAr ? 'قيمة الفرق' : 'Variance Value',
      isAr ? 'ملاحظة' : 'Note'
    ];

    const rows = products.map((p) => {
      const counted = countsDraft[p.id];
      const variance = counted !== undefined ? Number((counted - p.stock).toFixed(2)) : 0;
      const varianceVal = counted !== undefined ? Number((variance * p.costPrice).toFixed(2)) : 0;
      return [
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.sku}"`,
        `"${p.barcode}"`,
        p.unitType,
        p.stock,
        counted !== undefined ? counted : '',
        counted !== undefined ? variance : '',
        p.costPrice.toFixed(2),
        counted !== undefined ? varianceVal.toFixed(2) : '',
        `"${(notesDraft[p.id] || '').replace(/"/g, '""')}"`
      ].join(',');
    });

    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stocktake_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-5 space-y-5">
      {/* Banner after completing stocktake */}
      {lastCompletedSession && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-black text-emerald-900 dark:text-emerald-200">
                {isAr
                  ? `✅ تم اعتماد الجرد الحقيقي (${lastCompletedSession.sessionNumber}) وتحديث أرصدة الحانوت!`
                  : `✅ Stocktake ${lastCompletedSession.sessionNumber} Applied!`}
              </div>
              <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                {isAr
                  ? `تم جرد ${lastCompletedSession.totalCountedItems} صنف (${lastCompletedSession.discrepancyItemsCount} بها تعديل) · القيمة الحقيقية للمخزون الآن بالتكلفة: ${lastCompletedSession.totalRealStockCostValue.toFixed(2)} ${currencySymbol}`
                  : `Counted ${lastCompletedSession.totalCountedItems} items · Real cost value: ${lastCompletedSession.totalRealStockCostValue.toFixed(2)} ${currencySymbol}`}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLastCompletedSession(null)}
            className="px-3 py-1 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
          >
            {isAr ? 'إخفاء' : 'Dismiss'}
          </button>
        </div>
      )}

      {scanBanner && (
        <div
          className={`p-3 rounded-2xl text-xs font-black flex flex-wrap items-center justify-between gap-2 ${
            scanBanner.isError
              ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
          }`}
        >
          <span>{scanBanner.text}</span>
          {scanBanner.unknownCode && (
            <button
              type="button"
              onClick={() => {
                setShowScanner(false);
                window.dispatchEvent(
                  new CustomEvent('kadi:open-quick-new-barcode', {
                    detail: { barcode: scanBanner.unknownCode, sourceContext: 'inventory' }
                  })
                );
              }}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black"
            >
              {isAr ? '+ إضافة سلعة جديدة بهذا الباركود' : '+ Quick Add Product'}
            </button>
          )}
        </div>
      )}

      {/* Top Real Shop Inventory Valuation & Variance KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            {isAr ? 'تقدم الجرد الحقيقي' : 'Stocktake Progress'}
          </div>
          <div className="text-xl font-black font-mono tabular-nums text-slate-900 dark:text-white mt-1">
            {summary.countedItems} / {summary.totalProducts}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {isAr
              ? `${summary.matchedItems} مطابق · ${summary.discrepancyItems} به فرق · ${summary.uncountedItems} متبقي`
              : `${summary.matchedItems} matched · ${summary.discrepancyItems} varied`}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60">
          <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
            {isAr ? 'القيمة الحقيقية للمخزون في الحانوت' : 'Real Shop Stock Valuation'}
          </div>
          <div className="text-xl font-black font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
            {summary.realCostValuation.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}{' '}
            {currencySymbol}
          </div>
          <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-1 tabular-nums">
            {isAr ? 'بسعر البيع:' : 'Retail:'}{' '}
            {summary.realRetailValuation.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}{' '}
            {currencySymbol}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60">
          <div className="text-[11px] font-bold text-rose-700 dark:text-rose-300">
            {isAr ? 'العجز / الناقص المكتشف في الجرد' : 'Detected Shortage'}
          </div>
          <div className="text-xl font-black font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-1">
            -{summary.shrinkageValue.toFixed(2)} {currencySymbol}
          </div>
          <div className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-1 tabular-nums">
            {isAr ? `${summary.shrinkageUnits} وحدة ناقصة عن النظام` : `${summary.shrinkageUnits} units short`}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60">
          <div className="text-[11px] font-bold text-blue-700 dark:text-blue-300">
            {isAr ? 'الفائض المكتشف / صافي الفرق' : 'Surplus / Net Variance'}
          </div>
          <div className="text-xl font-black font-mono tabular-nums text-blue-600 dark:text-blue-400 mt-1">
            +{summary.surplusValue.toFixed(2)} {currencySymbol}
          </div>
          <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 font-bold tabular-nums">
            {isAr ? 'صافي الفرق:' : 'Net:'}{' '}
            <span
              className={
                summary.netVarianceValue === 0
                  ? 'text-emerald-600'
                  : summary.netVarianceValue > 0
                  ? 'text-blue-600'
                  : 'text-rose-600'
              }
            >
              {summary.netVarianceValue > 0 ? '+' : ''}
              {summary.netVarianceValue.toFixed(2)} {currencySymbol}
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar: Search, Camera Barcode Count, Filters, Bulk Helpers */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isAr
                  ? 'ابحث باسم السلعة أو الباركود للعدّ السريع...'
                  : 'Search product or barcode to count...'
              }
              className="w-full ps-9 pe-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl p-1">
            <span className="text-[10px] font-black text-slate-500 px-1.5">
              {isAr ? 'خطوة المسح:' : 'Step:'}
            </span>
            {([1, 5, 10, 12] as const).map((stepVal) => (
              <button
                key={stepVal}
                type="button"
                onClick={() => setScanStep(stepVal)}
                className={`px-2 py-1 rounded-lg text-[11px] font-black font-mono tabular-nums transition-colors ${
                  scanStep === stepVal
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                ×{stepVal}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowScanner(true)}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 shadow-2xs transition-colors"
          >
            <Camera className="w-4 h-4" />
            <span>
              {isAr
                ? `مسح متتالي بالكاميرا (+${scanStep})`
                : `Continuous Cam Scan (+${scanStep})`}
            </span>
          </button>

          <select
            value={selectedCat}
            onChange={(e) => setSelectedCat(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200"
          >
            <option value="all">{isAr ? 'جميع الفئات' : 'All Categories'}</option>
            {categories
              .filter((c) => c.id !== 'cat-all')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>

          <button
            type="button"
            onClick={fillRemainingAsSystemMatch}
            className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-bold flex items-center gap-1.5 transition-colors"
            title={
              isAr
                ? 'تعيين كل السلع غير المعدودة كـ مطابقة للنظام ثم تعديل السلع التي بها فرق فقط'
                : 'Prefill remaining items with system stock'
            }
          >
            <PackageCheck className="w-4 h-4" />
            <span>{isAr ? 'اعتبار الباقي مطابقاً للنظام' : 'Match Remaining'}</span>
          </button>

          <button
            type="button"
            onClick={exportStocktakeCsv}
            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>{isAr ? 'ورقة الجرد CSV' : 'Export Sheet'}</span>
          </button>

          {summary.countedItems > 0 && (
            <button
              type="button"
              onClick={resetDraft}
              className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 hover:bg-rose-100 text-xs font-bold flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isAr ? 'تصفير العدّ' : 'Reset'}</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: isAr ? `الكل (${products.length})` : `All (${products.length})` },
                { id: 'uncounted', label: isAr ? `لم يُجرد بعد (${summary.uncountedItems})` : `Uncounted (${summary.uncountedItems})` },
                { id: 'variance', label: isAr ? `به فرق (${summary.discrepancyItems})` : `With Variance (${summary.discrepancyItems})` },
                { id: 'matched', label: isAr ? `مطابق ✓ (${summary.matchedItems})` : `Matched (${summary.matchedItems})` }
              ] as { id: StocktakeFilterMode; label: string }[]
            ).map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilterMode(chip.id)}
                className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-colors ${
                  filterMode === chip.id
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={sessionNote}
              onChange={(e) => setSessionNote(e.target.value)}
              placeholder={isAr ? 'ملاحظة جلسة الجرد (مثلاً: جرد نهاية اليوم)...' : 'Stocktake note...'}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs w-56 outline-none"
            />
            <button
              type="button"
              disabled={summary.countedItems === 0}
              onClick={() => setConfirmApplyOpen(true)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>
                {isAr
                  ? `اعتماد الجرد وتحديث المخزون (${summary.countedItems})`
                  : `Apply Stocktake (${summary.countedItems})`}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Inline Confirmation Panel before updating inventory */}
      {confirmApplyOpen && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-black text-amber-950 dark:text-amber-100">
                {isAr
                  ? `تأكيد اعتماد الجرد الفعلي لـ ${summary.countedItems} سلعة؟`
                  : `Confirm updating ${summary.countedItems} items?`}
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                {isAr
                  ? `سيتم استبدال الكميات المسجلة بالكميات الحقيقية اللي عدّيتها في الحانوت (${summary.discrepancyItems} سلعة بها فرق، صافي قيمة الفرق: ${summary.netVarianceValue > 0 ? '+' : ''}${summary.netVarianceValue.toFixed(2)} ${currencySymbol}).`
                  : `System stock will be updated to counted quantities (${summary.discrepancyItems} variances).`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmApplyOpen(false)}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              {isAr ? 'تراجع' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleConfirmApply}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm"
            >
              <Check className="w-4 h-4" />
              <span>{isAr ? 'نعم، اعتمد المخزون الحقيقي الآن' : 'Confirm & Update Stock'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Quick Mobile Card for Last Scanned Product */}
      {lastScannedProduct && (
        <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/35 border border-indigo-200 dark:border-indigo-800 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-black text-indigo-600 dark:text-indigo-400">
              {isAr ? 'آخر سلعة ممسوحة في الجرد:' : 'Last Scanned Item:'}
            </div>
            <div className="text-sm font-black text-slate-900 dark:text-white truncate">
              {lastScannedProduct.name}
            </div>
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
              {isAr ? 'في النظام:' : 'System:'} {lastScannedProduct.stock} ·{' '}
              {isAr ? 'العدّ الحالي:' : 'Counted:'}{' '}
              <span className="text-indigo-700 dark:text-indigo-300 font-black">
                {countsDraft[lastScannedProduct.id] ?? 0}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const cur = countsDraft[lastScannedProduct.id] ?? 0;
                setProductCount(lastScannedProduct.id, Math.max(0, cur - 5));
              }}
              className="min-h-[40px] px-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-black font-mono"
            >
              -5
            </button>
            <button
              type="button"
              onClick={() => {
                const cur = countsDraft[lastScannedProduct.id] ?? 0;
                setProductCount(lastScannedProduct.id, Math.max(0, cur - 1));
              }}
              className="min-h-[40px] px-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-black font-mono"
            >
              -1
            </button>
            <button
              type="button"
              onClick={() => {
                const cur = countsDraft[lastScannedProduct.id] ?? 0;
                setProductCount(lastScannedProduct.id, cur + 1);
              }}
              className="min-h-[40px] px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black font-mono"
            >
              +1
            </button>
            <button
              type="button"
              onClick={() => {
                const cur = countsDraft[lastScannedProduct.id] ?? 0;
                setProductCount(lastScannedProduct.id, cur + 5);
              }}
              className="min-h-[40px] px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black font-mono"
            >
              +5
            </button>
            <button
              type="button"
              onClick={() => setProductCount(lastScannedProduct.id, lastScannedProduct.stock)}
              className="min-h-[40px] px-3 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold"
            >
              {isAr ? 'مطابق' : 'Match'}
            </button>
          </div>
        </div>
      )}

      {/* Counting Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
          <table className="w-full text-start text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-extrabold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-3 px-4 text-start">{isAr ? 'السلعة' : 'Product'}</th>
                <th className="py-3 px-3 text-center">{isAr ? 'في النظام' : 'System'}</th>
                <th className="py-3 px-3 text-center">{isAr ? 'العدّ الحقيقي في الحانوت' : 'Actual in Shop'}</th>
                <th className="py-3 px-3 text-center">{isAr ? 'الفرق' : 'Variance'}</th>
                <th className="py-3 px-3 text-center">{isAr ? 'قيمة الفرق' : 'Value Diff'}</th>
                <th className="py-3 px-4 text-start">{isAr ? 'ملاحظة / سبب الفرق' : 'Note'}</th>
                <th className="py-3 px-3 text-center">{isAr ? 'إجراء سريع' : 'Quick'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    {isAr ? 'لا توجد سلع مطابقة لهذا الفلتر' : 'No matching items'}
                  </td>
                </tr>
              ) : (
                filteredProducts.slice(0, 150).map((p) => {
                  const counted = countsDraft[p.id];
                  const isCounted = counted !== undefined;
                  const variance = isCounted ? Number((counted - p.stock).toFixed(2)) : 0;
                  const varianceVal = isCounted ? Number((variance * p.costPrice).toFixed(2)) : 0;

                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors ${
                        !isCounted
                          ? 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          : variance === 0
                          ? 'bg-emerald-50/40 dark:bg-emerald-950/15'
                          : variance < 0
                          ? 'bg-rose-50/50 dark:bg-rose-950/20'
                          : 'bg-blue-50/50 dark:bg-blue-950/20'
                      }`}
                    >
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2.5">
                          {p.image ? (
                            <img
                              src={p.image}
                              alt={p.name}
                              className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 text-[10px] font-bold shrink-0">
                              {p.name.slice(0, 2)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                              {p.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {p.barcode || p.sku} · {isAr ? 'التكلفة:' : 'Cost:'} {p.costPrice.toFixed(2)} {currencySymbol}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono font-bold tabular-nums text-slate-700 dark:text-slate-300">
                        {p.stock}
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const base = isCounted ? counted : p.stock;
                              setProductCount(p.id, Math.max(0, base - 1));
                            }}
                            className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200"
                            title="-1"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>

                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={isCounted ? counted : ''}
                            placeholder={String(p.stock)}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '') {
                                clearProductCount(p.id);
                              } else {
                                setProductCount(p.id, parseFloat(val) || 0);
                              }
                            }}
                            className={`w-20 px-2 py-1.5 rounded-xl border text-center font-mono font-black text-xs outline-none focus:ring-2 focus:ring-emerald-500 ${
                              isCounted
                                ? 'bg-white dark:bg-slate-950 border-emerald-400 dark:border-emerald-700 text-slate-900 dark:text-white'
                                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                            }`}
                          />

                          <button
                            type="button"
                            onClick={() => {
                              const base = isCounted ? counted : p.stock;
                              setProductCount(p.id, base + 1);
                            }}
                            className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200"
                            title="+1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono font-black tabular-nums">
                        {!isCounted ? (
                          <span className="text-slate-400 text-[11px]">—</span>
                        ) : variance === 0 ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px]">
                            {isAr ? 'مقاد ✓' : 'Match ✓'}
                          </span>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] ${
                              variance < 0
                                ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                                : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                            }`}
                          >
                            {variance > 0 ? `+${variance}` : variance}
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono font-bold tabular-nums">
                        {!isCounted || variance === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span className={varianceVal < 0 ? 'text-rose-600' : 'text-blue-600'}>
                            {varianceVal > 0 ? '+' : ''}
                            {varianceVal.toFixed(2)} {currencySymbol}
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-4">
                        <input
                          type="text"
                          value={notesDraft[p.id] || ''}
                          onChange={(e) =>
                            setNotesDraft((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          placeholder={isAr ? 'سبب الفرق (اختياري)...' : 'Reason...'}
                          className="w-full min-w-[130px] px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-800 dark:text-slate-200 outline-none"
                        />
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => setProductCount(p.id, p.stock)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                            isCounted && counted === p.stock
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {isAr ? 'مطابق' : 'Match'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Past Stocktake History */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 font-extrabold text-xs text-slate-900 dark:text-white">
            <History className="w-4 h-4 text-emerald-600" />
            <span>{isAr ? 'سجل جلسات الجرد السابقة' : 'Past Stocktake Sessions'}</span>
          </div>
          <span className="text-[11px] font-bold text-slate-400">
            {stocktakeHistory.length} {isAr ? 'جلسة' : 'sessions'}
          </span>
        </div>

        {stocktakeHistory.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            {isAr
              ? 'لم يتم اعتماد أي جلسة جرد فعلي بعد. أدخل الكميات الحقيقية أعلاه ثم اضغط "اعتماد الجرد".'
              : 'No completed stocktake sessions yet.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {stocktakeHistory.map((sess) => {
              const isExpanded = expandedHistoryId === sess.id;
              return (
                <div key={sess.id} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white font-mono text-[11px] font-black">
                        {sess.sessionNumber}
                      </span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {new Date(sess.date).toLocaleString('ar-MA')}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        · {sess.conductedBy}
                      </span>
                      {sess.notes && (
                        <span className="text-[11px] text-slate-500 italic">({sess.notes})</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="font-bold text-slate-600 dark:text-slate-300">
                        {sess.totalCountedItems} {isAr ? 'صنف' : 'items'} ({sess.discrepancyItemsCount}{' '}
                        {isAr ? 'بها فرق' : 'varied'})
                      </span>
                      <span
                        className={`font-mono font-black ${
                          sess.netVarianceValue === 0
                            ? 'text-emerald-600'
                            : sess.netVarianceValue < 0
                            ? 'text-rose-600'
                            : 'text-blue-600'
                        }`}
                      >
                        {sess.netVarianceValue > 0 ? '+' : ''}
                        {sess.netVarianceValue.toFixed(2)} {currencySymbol}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedHistoryId(isExpanded ? null : sess.id)
                        }
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1"
                      >
                        <span>{isAr ? 'التفاصيل' : 'Details'}</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="text-[10px] text-slate-500 bg-slate-50 dark:bg-slate-800/50">
                          <tr>
                            <th className="py-1.5 px-3 text-start">{isAr ? 'السلعة' : 'Item'}</th>
                            <th className="py-1.5 px-2 text-center">{isAr ? 'النظام' : 'System'}</th>
                            <th className="py-1.5 px-2 text-center">{isAr ? 'الحقيقي' : 'Counted'}</th>
                            <th className="py-1.5 px-2 text-center">{isAr ? 'الفرق' : 'Diff'}</th>
                            <th className="py-1.5 px-2 text-center">{isAr ? 'قيمة الفرق' : 'Value'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {sess.items
                            .filter((it) => it.variance !== 0)
                            .map((it) => (
                              <tr key={it.productId}>
                                <td className="py-1.5 px-3 font-bold text-slate-800 dark:text-slate-200">
                                  {it.productName}
                                </td>
                                <td className="py-1.5 px-2 text-center font-mono">{it.systemStock}</td>
                                <td className="py-1.5 px-2 text-center font-mono font-bold">
                                  {it.countedStock}
                                </td>
                                <td
                                  className={`py-1.5 px-2 text-center font-mono font-black ${
                                    it.variance < 0 ? 'text-rose-600' : 'text-blue-600'
                                  }`}
                                >
                                  {it.variance > 0 ? `+${it.variance}` : it.variance}
                                </td>
                                <td
                                  className={`py-1.5 px-2 text-center font-mono font-bold ${
                                    it.varianceValue < 0 ? 'text-rose-600' : 'text-blue-600'
                                  }`}
                                >
                                  {it.varianceValue > 0 ? '+' : ''}
                                  {it.varianceValue.toFixed(2)} {currencySymbol}
                                </td>
                              </tr>
                            ))}
                          {sess.items.every((it) => it.variance === 0) && (
                            <tr>
                              <td colSpan={5} className="py-3 text-center text-emerald-600 font-bold">
                                <PackageCheck className="w-4 h-4 inline me-1" />
                                {isAr ? 'جميع الأصناف المعدودة كانت مطابقة 100%' : 'All counted items matched 100%'}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showScanner && (
        <BarcodeScannerModal
          mode="field"
          allowContinuous={true}
          defaultContinuous={true}
          title={
            isAr
              ? `جرد مستمر بالكاميرا (+${scanStep} عند كل مسح)`
              : `Continuous Stocktake (+${scanStep} per scan)`
          }
          onClose={() => setShowScanner(false)}
          onScanned={handleBarcodeScanned}
        />
      )}
    </div>
  );
};
