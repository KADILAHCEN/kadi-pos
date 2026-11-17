import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Product, ProductModifier, Category } from '../../types';
import { usePos } from '../../context/PosContext';
import { getT } from '../../utils/translations';
import { ScaleModal } from './ScaleModal';
import { VariantModal } from './VariantModal';
import { AddProductModal } from './AddProductModal';
import { EditProductModal } from './EditProductModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { AddCategoryModal } from '../inventory/AddCategoryModal';
import { WeeklyTopProductsWidget } from './WeeklyTopProductsWidget';
import { bluetoothScanner, ScannedBarcodePayload } from '../../utils/bluetoothScanner';
import { playSound } from '../../utils/audio';
import {
  Search,
  Barcode,
  Layers,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Tag,
  Zap,
  PackagePlus,
  Plus,
  Camera,
  Scale,
  Pencil,
  Trash2,
  Calendar,
  ScanLine,
  BookOpen,
  Ear
} from 'lucide-react';

interface ProductGridProps {
  onOpenBarcodeScanner: () => void;
}

export const ProductGrid: React.FC<ProductGridProps> = ({ onOpenBarcodeScanner }) => {
  const {
    products,
    categories,
    deleteCategory,
    addToCart,
    deleteProduct,
    currencySymbol,
    language,
    setCurrentTab,
    customers,
    shopEarRequests
  } = usePos();

  const activeShopEarCount = useMemo(
    () => shopEarRequests.filter((r) => r.status !== 'notified').length,
    [shopEarRequests]
  );

  const totalCreditDebt = useMemo(
    () => customers.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0),
    [customers]
  );

  const t = getT(language);
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('cat-all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [scaleProduct, setScaleProduct] = useState<Product | null>(null);
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);

  // Barcode quick test feedback
  const [barcodeToast, setBarcodeToast] = useState<string | null>(null);

  // Quick Expiry filter state (تصفية المنتجات المنتهية أو القريبة من الانتهاء)
  const [showOnlyExpiring, setShowOnlyExpiring] = useState(false);

  // High-capacity pagination state (handles 2,000+ to 10,000+ items smoothly at 60fps)
  const [visibleCount, setVisibleCount] = useState<number>(36);

  // Tactile feedback state for tablet touch animation
  const [tappedProductId, setTappedProductId] = useState<string | null>(null);
  const tapTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
    };
  }, []);

  // Reset pagination when category, search, or expiry filter changes
  useEffect(() => {
    setVisibleCount(36);
  }, [selectedCategoryId, searchQuery, showOnlyExpiring]);

  // Count expiring soon or expired products
  const expiringCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return products.filter((p) => {
      if (!p.expiryDate) return false;
      const exp = new Date(p.expiryDate);
      if (isNaN(exp.getTime())) return false;
      return exp.getTime() - today.getTime() <= 30 * 24 * 3600 * 1000;
    }).length;
  }, [products]);

  // Fast memoized filtering across thousands of products
  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return products.filter((prod) => {
      const matchesCat = selectedCategoryId === 'cat-all' || prod.categoryId === selectedCategoryId;
      if (!matchesCat) return false;

      // Expiry filter
      if (showOnlyExpiring) {
        if (!prod.expiryDate) return false;
        const exp = new Date(prod.expiryDate);
        if (isNaN(exp.getTime())) return false;
        if (exp.getTime() - today.getTime() > 30 * 24 * 3600 * 1000) return false;
      }

      if (!query) return true;

      return (
        prod.name.toLowerCase().includes(query) ||
        prod.nameEn.toLowerCase().includes(query) ||
        prod.sku.toLowerCase().includes(query) ||
        prod.barcode.toLowerCase().includes(query)
      );
    });
  }, [products, selectedCategoryId, searchQuery, showOnlyExpiring]);

  const displayedProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleCount);
  }, [filteredProducts, visibleCount]);

  // Initialize Bluetooth Barcode Scanner (HID Mode)
  useEffect(() => {
    bluetoothScanner.init();

    const unsubscribe = bluetoothScanner.onScan((payload: ScannedBarcodePayload) => {
      handleScannedBarcode(payload.barcode, payload.speedMsPerChar);
    });

    return () => {
      unsubscribe();
    };
  }, [products]);

  const handleScannedBarcode = (code: string, speedMs?: number) => {
    const matched = products.find(
      (p) => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase()
    );
    if (matched) {
      playSound('beep');
      handleProductClick(matched);
      const speedTag = speedMs ? ` (${speedMs}ms)` : '';
      setBarcodeToast(`${isAr ? 'تم مسح:' : isFr ? 'Scanné:' : 'Scanned:'} ${matched.name}${speedTag}`);
      setTimeout(() => setBarcodeToast(null), 2500);
    } else {
      playSound('error');
      setBarcodeToast(`${isAr ? 'باركود غير معروف:' : 'Code inconnu:'} ${code}`);
      setTimeout(() => setBarcodeToast(null), 2500);
    }
  };

  const handleProductClick = (product: Product) => {
    // Tactile haptic pulse + visual spring micro-feedback for tablet POS use
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(15);
    }
    setTappedProductId(product.id);
    if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
    tapTimerRef.current = window.setTimeout(() => {
      setTappedProductId((curr) => (curr === product.id ? null : curr));
    }, 260);

    // If weighted / volumetric product (kg or liter), open digital scale modal
    if (product.unitType === 'kg' || product.unitType === 'liter') {
      setScaleProduct(product);
      return;
    }

    // If product has size variants or modifiers, open variant selection
    if (product.hasVariants || (product.availableModifiers && product.availableModifiers.length > 0)) {
      setVariantProduct(product);
      return;
    }

    // Otherwise add directly
    addToCart(product);
  };

  const getUnitBadge = (unit?: string) => {
    switch (unit) {
      case 'kg':
        return t.unit_kg;
      case 'liter':
        return t.unit_liter;
      case 'box':
        return t.unit_box;
      default:
        return t.unit_piece;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-100/60 dark:bg-slate-950/60 p-2 sm:p-2.5">
      {/* Barcode scanner toast */}
      {barcodeToast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 bg-slate-900 text-white rounded-xl shadow-xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-top duration-150">
          <Zap className="w-3.5 h-3.5 text-emerald-400" />
          <span>{barcodeToast}</span>
        </div>
      )}

      {/* Compact Search & Narrow Single-Line Add-Product Strip */}
      <div className="flex items-center gap-1.5 mb-1.5 shrink-0">
        <div className="relative flex-1 min-w-[115px]">
          <Search className="absolute right-2.5 rtl:right-2.5 rtl:left-auto left-2.5 rtl:right-auto top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.search_placeholder}
            className="w-full h-8 py-1 ps-8 pe-11 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-900 dark:text-white transition-all shadow-2xs"
          />
          <div className="absolute end-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-0.5 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title={isAr ? 'مسح البحث' : 'Clear search'}
              >
                ×
              </button>
            )}
            <button
              type="button"
              onClick={onOpenBarcodeScanner}
              className="p-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors"
              title={isAr ? 'مسح الباركود بالكاميرا' : 'Scan barcode with camera'}
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Narrow Compact Action Strip */}
        <div className="inline-flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setShowAddProductModal(true)}
            className="h-8 flex items-center justify-center gap-1 px-2 text-[11px] font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-2xs transition-all active:scale-95 whitespace-nowrap shrink-0"
            title={isAr ? 'إضافة سلعة جديدة بالاسم والثمن والصورة' : 'Add New Product'}
          >
            <PackagePlus className="w-3.5 h-3.5 shrink-0" />
            <span>{isAr ? '+ سلعة' : isFr ? '+ Prod.' : '+ Item'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddCategoryModal(true)}
            className="h-8 flex items-center justify-center gap-1 px-2 text-[11px] font-extrabold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-2xs transition-all active:scale-95 whitespace-nowrap shrink-0"
            title={isAr ? 'إضافة صنف أو فئة جديدة' : 'Add New Category'}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>{isAr ? '+ صنف' : isFr ? '+ Cat.' : '+ Cat'}</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('customers')}
            className="h-8 flex items-center justify-center gap-1 px-2 text-[11px] font-extrabold bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-2xs transition-all active:scale-95 whitespace-nowrap shrink-0"
            title={
              isAr
                ? `فتح دفتر الكريدي المغربي (مجموع الكريدي: ${totalCreditDebt.toFixed(2)} ${currencySymbol})`
                : `Open Moroccan Credit Ledger (${totalCreditDebt.toFixed(2)} ${currencySymbol})`
            }
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">{isAr ? 'الكريدي' : isFr ? 'Crédit' : 'Credit'}</span>
          </button>

          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('kadi:open-shop-ear-modal'))}
            className="relative h-8 flex items-center justify-center gap-1 px-2 text-[11px] font-extrabold bg-orange-500 hover:bg-orange-600 text-white rounded-lg shadow-2xs transition-all active:scale-95 whitespace-nowrap shrink-0"
            title={isAr ? 'ودن الحانوت — سجل سلعة سول عليها زبون وما لقيتهاش' : 'Shop Ear — Log Requested Item'}
          >
            <Ear className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline">{isAr ? 'ودن الحانوت' : 'Shop Ear'}</span>
            {activeShopEarCount > 0 && (
              <span className="px-1 py-0.2 rounded-full bg-slate-950 text-white text-[9px] font-black tabular-nums">
                {activeShopEarCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Slim Single-Line Category Chips Strip */}
      <div className="mb-1.5 shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => {
            const isSelected = selectedCategoryId === cat.id;
            const catCount = cat.id === 'cat-all'
              ? products.length
              : products.filter((p) => p.categoryId === cat.id).length;

            return (
              <div
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`relative h-8 flex items-center gap-1.5 px-2 rounded-lg border transition-all shrink-0 select-none overflow-hidden cursor-pointer ${
                  isSelected
                    ? 'border-emerald-600 bg-white dark:bg-slate-900 shadow-xs ring-1 ring-emerald-600/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {cat.image ? (
                  <img
                    src={cat.image}
                    alt={cat.name}
                    referrerPolicy="no-referrer"
                    className="w-5 h-5 object-cover rounded shrink-0 border border-slate-100 dark:border-slate-800"
                  />
                ) : (
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center text-white shrink-0 font-bold"
                    style={{ backgroundColor: cat.color || '#059669' }}
                  >
                    <Layers className="w-3 h-3" />
                  </div>
                )}
                <span className={`text-[11px] font-bold whitespace-nowrap ${isSelected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'}`}>
                  {isAr ? cat.name : (isFr ? (cat.nameEn || cat.name) : cat.nameEn)}
                </span>
                <span className="text-[10px] text-slate-400 font-semibold tabular-nums">
                  ({catCount})
                </span>

                {isSelected && cat.id !== 'cat-all' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const assignedCount = products.filter((p) => p.categoryId === cat.id).length;
                      if (
                        confirm(
                          isAr
                            ? `هل أنت متأكد من حذف وإلغاء فئة "${cat.name}"؟\nسيتم نقل منتجاتها (${assignedCount} منتج) تلقائياً إلى فئة أخرى.`
                            : `Delete category "${cat.name}"? ${assignedCount} products will be moved.`
                        )
                      ) {
                        deleteCategory(cat.id);
                        setSelectedCategoryId('cat-all');
                      }
                    }}
                    className="ms-0.5 p-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors"
                    title={isAr ? `إلغاء وحذف فئة ${cat.name}` : `Delete category ${cat.name}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Quick Expiry Filter Chip */}
          <button
            type="button"
            onClick={() => setShowOnlyExpiring((prev) => !prev)}
            className={`relative h-8 flex items-center gap-1 px-2 rounded-lg border transition-all shrink-0 select-none text-[11px] font-bold whitespace-nowrap ${
              showOnlyExpiring
                ? 'border-amber-500 bg-amber-500 text-white shadow-xs'
                : 'border-amber-200 dark:border-amber-800/80 bg-amber-50/70 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100/60'
            }`}
            title={isAr ? 'تصفية المنتجات المنتهية أو القريبة من انتهاء الصلاحية' : 'Filter Expiring Products'}
          >
            <Calendar className="w-3 h-3" />
            <span>{isAr ? 'الصلاحية' : 'Expiry'}</span>
            {expiringCount > 0 && (
              <span className={`px-1 rounded-full text-[9px] font-black ${showOnlyExpiring ? 'bg-white text-amber-700' : 'bg-amber-500 text-white'}`}>
                {expiringCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Quick Weekly Top 5 Best-Selling Products Dashboard Widget */}
      <WeeklyTopProductsWidget onQuickAddProduct={handleProductClick} />

      {/* Products Grid */}
      <div className="flex-1 overflow-y-auto pr-1 rtl:pr-0 rtl:pl-1 pb-20 lg:pb-2">
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center p-6 text-slate-400">
            <Search className="w-8 h-8 mb-2 stroke-1 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-semibold">{isAr ? 'لا توجد منتجات مطابقة للبحث' : isFr ? 'Aucun article trouvé' : 'No matching products'}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => setShowAddProductModal(true)}
                className="px-3.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs flex items-center gap-1.5 transition-all active:scale-95"
              >
                <PackagePlus className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة هذا الصنف الآن' : 'Add Item Now'}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('kadi:open-shop-ear-modal', {
                      detail: { initialQuery: searchQuery.trim() }
                    })
                  )
                }
                className="px-3.5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl shadow-xs flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Ear className="w-3.5 h-3.5" />
                <span>{isAr ? 'سجلها في ودن الحانوت' : 'Log in Shop Ear'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
            {displayedProducts.map((prod) => {
              const profit = prod.price - prod.costPrice;
              const profitMargin = prod.price > 0 ? ((profit / prod.price) * 100).toFixed(0) : '0';
              const isLowStock = prod.stock > 0 && prod.stock <= prod.lowStockThreshold;
              const isOutOfStock = prod.stock <= 0;
              const isWeighted = prod.unitType === 'kg' || prod.unitType === 'liter';

              // Expiry calculation
              let expiryStatus: { label: string; isExpired: boolean; isWarning: boolean } | null = null;
              if (prod.expiryDate) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const exp = new Date(prod.expiryDate);
                exp.setHours(0, 0, 0, 0);
                if (!isNaN(exp.getTime())) {
                  const diffTime = exp.getTime() - today.getTime();
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  if (diffDays < 0) {
                    expiryStatus = {
                      label: isAr ? `منتهي (${Math.abs(diffDays)}ي)` : isFr ? `Expiré (${Math.abs(diffDays)}j)` : `Expired (${Math.abs(diffDays)}d)`,
                      isExpired: true,
                      isWarning: false
                    };
                  } else if (diffDays <= 30) {
                    expiryStatus = {
                      label: isAr ? `ينتهي بعد ${diffDays} يوم` : isFr ? `${diffDays}j rest.` : `${diffDays}d left`,
                      isExpired: false,
                      isWarning: true
                    };
                  } else {
                    expiryStatus = {
                      label: prod.expiryDate,
                      isExpired: false,
                      isWarning: false
                    };
                  }
                }
              }

              const isJustTapped = tappedProductId === prod.id;
              return (
                <div
                  key={prod.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleProductClick(prod)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleProductClick(prod);
                    }
                  }}
                  className={`group relative flex flex-col justify-between p-2.5 bg-white dark:bg-slate-900 rounded-2xl border transition-all duration-150 text-left rtl:text-right overflow-hidden focus:outline-none cursor-pointer select-none touch-manipulation ${
                    isJustTapped
                      ? 'scale-[0.94] border-emerald-500 ring-2 ring-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/35 shadow-lg shadow-emerald-500/15'
                      : 'border-slate-200 dark:border-slate-800 hover:border-emerald-500/80 dark:hover:border-emerald-500/60 hover:shadow-md active:scale-[0.94] active:ring-2 active:ring-emerald-500/30'
                  }`}
                >
                  {isJustTapped && (
                    <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center bg-emerald-500/10 animate-in fade-in duration-100">
                      <span className="px-2.5 py-1 rounded-full bg-emerald-600 text-white text-[11px] font-black shadow-md flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>+1</span>
                      </span>
                    </div>
                  )}
                  {/* Top Image & Badges */}
                  <div className="relative aspect-4/3 w-full rounded-xl overflow-hidden mb-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-100 dark:border-slate-800">
                    {prod.image ? (
                      <img
                        src={prod.image}
                        alt={prod.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-white"
                        style={{ backgroundColor: prod.color || '#059669' }}
                      >
                        <Tag className="w-6 h-6 opacity-75" />
                      </div>
                    )}

                    {/* Unit tag top-left */}
                    <div className="absolute top-2 left-2 rtl:left-auto rtl:right-2 px-1.5 py-0.5 text-[10px] font-bold bg-slate-900/80 backdrop-blur-xs text-white rounded-md flex items-center gap-1 shadow-xs">
                      {isWeighted && <Scale className="w-2 h-2 text-emerald-400" />}
                      <span>{getUnitBadge(prod.unitType)}</span>
                    </div>

                    {/* Stock status tag top-right */}
                    <div className="absolute top-2 right-2 rtl:right-auto rtl:left-2">
                      {isOutOfStock ? (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-rose-600 text-white rounded-md shadow-xs">
                          {t.stock_out}
                        </span>
                      ) : isLowStock ? (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500 text-white rounded-md shadow-xs">
                          {prod.stock} {getUnitBadge(prod.unitType)}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-600/90 text-white rounded-md shadow-xs">
                          {prod.stock}
                        </span>
                      )}
                    </div>

                    {/* Action Buttons: Edit (Name, Price, Unit, Expiry, Photo) & Delete */}
                    <div className="absolute bottom-2 start-2 flex items-center gap-1 z-10">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingProduct(prod);
                        }}
                        className="p-1 rounded-lg bg-white/95 dark:bg-slate-900/95 hover:bg-emerald-600 hover:text-white text-slate-700 dark:text-slate-200 shadow-sm backdrop-blur-xs transition-all active:scale-90"
                        title={isAr ? 'تعديل الاسم، الثمن، المميزة، الصلاحية والصورة' : 'Edit item & photo'}
                      >
                        <Pencil className="w-3 h-3 stroke-[2]" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingProduct(prod);
                        }}
                        className="p-1 rounded-lg bg-white/95 dark:bg-slate-900/95 hover:bg-rose-600 hover:text-white text-rose-600 dark:text-rose-400 shadow-sm backdrop-blur-xs transition-all active:scale-90"
                        title={isAr ? 'مسح المنتج' : 'Delete Product'}
                      >
                        <Trash2 className="w-3 h-3 stroke-[2]" />
                      </button>
                    </div>

                    {/* Expiry date tag / badge */}
                    {expiryStatus && (
                      <div
                        className={`absolute bottom-2 end-2 px-1.5 py-0.5 rounded-md text-[9px] font-bold flex items-center gap-1 shadow-xs backdrop-blur-xs z-10 ${
                          expiryStatus.isExpired
                            ? 'bg-rose-600/95 text-white ring-1 ring-white/50 animate-pulse'
                            : expiryStatus.isWarning
                            ? 'bg-amber-500/95 text-white ring-1 ring-white/40'
                            : 'bg-slate-900/80 text-slate-200'
                        }`}
                        title={`${isAr ? 'تاريخ الصلاحية' : 'Expiry Date'}: ${prod.expiryDate}`}
                      >
                        <Calendar className="w-2.5 h-2.5 shrink-0" />
                        <span className="tabular-nums font-semibold">{expiryStatus.label}</span>
                      </div>
                    )}
                  </div>

                  {/* Body Content */}
                  <div className="flex-1 flex flex-col justify-between w-full">
                    <div>
                      <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white line-clamp-2 leading-tight mb-1">
                        {isAr ? prod.name : prod.nameEn}
                      </h4>
                      <div className="text-[10px] text-slate-400 font-mono tracking-tight mb-2">
                        {prod.barcode || prod.sku}
                      </div>
                    </div>

                    {/* Price and Profit Margin % */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-end justify-between">
                      <div>
                        <div className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white tabular-nums">
                          {prod.price.toFixed(2)}{' '}
                          <span className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
                            {currencySymbol}
                          </span>
                        </div>
                      </div>

                      {/* Profit margin badge */}
                      <div className="text-right rtl:text-left">
                        <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 rounded tabular-nums" title={`${t.cost}: ${prod.costPrice} ${currencySymbol}`}>
                          +{profitMargin}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Load More Button for 2,000+ products */}
            {filteredProducts.length > visibleCount && (
              <div className="col-span-full py-4 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((prev) => prev + 36)}
                  className="px-6 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs shadow-2xs transition-all active:scale-95 inline-flex items-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>
                    {isAr
                      ? `عرض المزيد (+36 صنف) - يُعرض الآن ${displayedProducts.length} من أصل ${filteredProducts.length} منتج`
                      : `Load More (+36) - Showing ${displayedProducts.length} of ${filteredProducts.length}`}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Digital Scale Modal for kg / liter */}
      {scaleProduct && (
        <ScaleModal
          product={scaleProduct}
          onClose={() => setScaleProduct(null)}
          onConfirm={(qty) => {
            addToCart(scaleProduct, undefined, undefined, qty);
          }}
        />
      )}

      {/* Variant Modal */}
      {variantProduct && (
        <VariantModal
          product={variantProduct}
          onClose={() => setVariantProduct(null)}
          onConfirm={(varId, mods) => {
            addToCart(variantProduct, varId, mods);
          }}
        />
      )}

      {/* Add Item / Product Modal */}
      <AddProductModal
        isOpen={showAddProductModal}
        onClose={() => setShowAddProductModal(false)}
        defaultCategoryId={selectedCategoryId}
        onProductAdded={(newProd) => {
          setSelectedCategoryId('cat-all');
          setSearchQuery('');
          setBarcodeToast(isAr ? `✅ تمت إضافة سلعة "${newProd.name}" بنجاح!` : `Item "${newProd.name}" added successfully!`);
          setTimeout(() => setBarcodeToast(null), 3000);
        }}
        onAddedAndAddToCart={(createdProduct) => {
          handleProductClick(createdProduct);
        }}
      />

      {/* Edit Product Modal (تعديل الاسم والثمن والمميزة والصورة) */}
      <EditProductModal
        product={editingProduct}
        isOpen={!!editingProduct}
        onClose={() => setEditingProduct(null)}
      />

      {/* Delete Product Confirmation Modal (واش متأكد باغي تمسح) */}
      <DeleteConfirmModal
        product={deletingProduct}
        isOpen={!!deletingProduct}
        onClose={() => setDeletingProduct(null)}
        onConfirm={(id) => deleteProduct(id)}
      />

      {/* Add Category Modal (إضافة وإدارة الأصناف) */}
      <AddCategoryModal
        isOpen={showAddCategoryModal}
        onClose={() => setShowAddCategoryModal(false)}
        initialTab="create"
        onCategoryCreated={(cat) => {
          setSelectedCategoryId(cat.id);
          setBarcodeToast(
            isAr
              ? `✅ تمت إضافة صنف "${cat.name}" بنجاح!`
              : `Category "${cat.name}" added successfully!`
          );
          setTimeout(() => setBarcodeToast(null), 3000);
        }}
      />
    </div>
  );
};
