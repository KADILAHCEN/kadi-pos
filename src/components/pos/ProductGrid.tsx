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
import { parseScaleBarcode } from '../../utils/scaleBarcode';
import { PriceAlertAdvisor } from '../alerts/PriceAlertAdvisor';
import {
  auditOldStockPrices,
  markPriceAlertFixed,
  OldStockPriceIssue,
  parseMoroccanNumber,
  recordPriceAlert
} from '../../utils/priceAlerts';
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
  Ear,
  Wrench,
  PackageCheck,
  ArrowUpDown
} from 'lucide-react';

interface ProductGridProps {
  onOpenBarcodeScanner: () => void;
}

export const ProductGrid: React.FC<ProductGridProps> = ({ onOpenBarcodeScanner }) => {
  const {
    products,
    categories,
    cart,
    deleteCategory,
    addToCart,
    adjustStock,
    updateProduct,
    deleteProduct,
    currencySymbol,
    language,
    settings,
    setCurrentTab,
    customers,
    shopEarRequests
  } = usePos();

  const cartQtyByProductId = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      map.set(item.productId, Number(((map.get(item.productId) ?? 0) + item.quantity).toFixed(2)));
    }
    return map;
  }, [cart]);

  const getRemainingStock = (prod: Product) => {
    const inCart = cartQtyByProductId.get(prod.id) ?? 0;
    return Math.max(0, Number((prod.stock - inCart).toFixed(2)));
  };

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
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Modals state
  const [scaleProduct, setScaleProduct] = useState<Product | null>(null);
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);

  // Barcode quick test feedback
  const [barcodeToast, setBarcodeToast] = useState<string | null>(null);

  // Quick Expiry filter state (تصفية المنتجات المنتهية أو القريبة من الانتهاء)
  const [showOnlyExpiring, setShowOnlyExpiring] = useState(false);

  // Quick In-Stock filter & Sort state
  const [showOnlyInStock, setShowOnlyInStock] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'lowest_stock' | 'price_asc' | 'price_desc'>('default');

  // Quick Negative / Loss Price filter state (تصفية المنتجات اللي فيها خسارة أو بلا ربح)
  const [showOnlyPriceIssues, setShowOnlyPriceIssues] = useState(false);

  // Quick Price Fix Modal state (نافذة تصحيح الأثمنة السلبية)
  const [quickFixIssue, setQuickFixIssue] = useState<OldStockPriceIssue | null>(null);
  const [quickFixCostInput, setQuickFixCostInput] = useState<string>('');
  const [quickFixPriceInput, setQuickFixPriceInput] = useState<string>('');

  // High-capacity pagination state (handles 2,000+ to 10,000+ items smoothly at 60fps)
  const [visibleCount, setVisibleCount] = useState<number>(36);

  // Quick Restock ("شريت +") modal state
  const [buyModalProduct, setBuyModalProduct] = useState<Product | null>(null);
  const [buyQtyInput, setBuyQtyInput] = useState<string>('');
  const [buyPriceInput, setBuyPriceInput] = useState<string>('');
  const [buyModalError, setBuyModalError] = useState<string | null>(null);
  const buyInputRef = useRef<HTMLInputElement | null>(null);

  // Out-of-stock snackbar toast state
  const [outOfStockToast, setOutOfStockToast] = useState<string | null>(null);
  const outOfStockTimerRef = useRef<number | null>(null);

  // Tactile feedback state for tablet touch animation
  const [tappedProductId, setTappedProductId] = useState<string | null>(null);
  const tapTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
      if (outOfStockTimerRef.current) window.clearTimeout(outOfStockTimerRef.current);
    };
  }, []);

  // Reset pagination when category, search, or filters change
  useEffect(() => {
    setVisibleCount(36);
  }, [selectedCategoryId, searchQuery, showOnlyExpiring, showOnlyPriceIssues, showOnlyInStock, sortBy]);

  // Global "/" or "F2" keyboard shortcut to focus POS search immediately
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const activeEl = document.activeElement as HTMLElement | null;
      const isTyping =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.isContentEditable);

      if (e.key === 'F2' || (e.key === '/' && !isTyping)) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  // Pre-compute category counts in a single O(N) pass instead of filtering inside categories.map
  const categoryCountsMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
    }
    return counts;
  }, [products]);

  // Audit all products for loss / zero-profit / decimal-mismatch price issues
  const priceIssues = useMemo(() => auditOldStockPrices(products), [products]);
  const priceIssuesByProductId = useMemo(() => {
    const map = new Map<string, OldStockPriceIssue>();
    for (const issue of priceIssues) {
      map.set(issue.product.id, issue);
    }
    return map;
  }, [priceIssues]);

  useEffect(() => {
    if (priceIssues.length === 0 && showOnlyPriceIssues) {
      setShowOnlyPriceIssues(false);
    }
  }, [priceIssues.length, showOnlyPriceIssues]);

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

  // Fast memoized filtering & optional sorting across thousands of products
  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const list = products.filter((prod) => {
      const matchesCat = selectedCategoryId === 'cat-all' || prod.categoryId === selectedCategoryId;
      if (!matchesCat) return false;

      if (showOnlyInStock && getRemainingStock(prod) <= 0) {
        return false;
      }

      if (showOnlyPriceIssues && !priceIssuesByProductId.has(prod.id)) {
        return false;
      }

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

    if (sortBy === 'default') return list;

    return [...list].sort((a, b) => {
      if (sortBy === 'lowest_stock') {
        return getRemainingStock(a) - getRemainingStock(b);
      }
      if (sortBy === 'price_asc') {
        return a.price - b.price;
      }
      return b.price - a.price;
    });
  }, [
    products,
    selectedCategoryId,
    searchQuery,
    showOnlyExpiring,
    showOnlyPriceIssues,
    showOnlyInStock,
    sortBy,
    priceIssuesByProductId,
    cartQtyByProductId
  ]);

  const displayedProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleCount);
  }, [filteredProducts, visibleCount]);

  // Listen for Bluetooth Barcode Scanner (HID Mode) while on Sale Screen
  useEffect(() => {
    bluetoothScanner.init({
      enabled: settings.bluetoothScannerEnabled ?? true
    });

    const unsubscribe = bluetoothScanner.onScan((payload: ScannedBarcodePayload) => {
      // Yield if a priority modal (Invoice Scan, Bluetooth Settings, or Quick New Barcode) is open
      if (bluetoothScanner.getActiveScope() !== null) return;
      handleScannedBarcode(payload.barcode, payload.speedMsPerChar);
    });

    return () => {
      unsubscribe();
    };
  }, [products, cartQtyByProductId, settings.bluetoothScannerEnabled, settings.bluetoothSoundFeedback, settings.bluetoothAutoAddToCart]);

  const showNafedSnackBar = (productName: string) => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([30, 40, 30]);
    }
    playSound('error');
    setOutOfStockToast(
      isAr
        ? `نفذ - ${productName} ما بقاش`
        : isFr
        ? `Rupture de stock - ${productName}`
        : `Out of stock - ${productName}`
    );
    if (outOfStockTimerRef.current) window.clearTimeout(outOfStockTimerRef.current);
    outOfStockTimerRef.current = window.setTimeout(() => {
      setOutOfStockToast(null);
    }, 2800);
  };

  const openBuyProductDialog = (prod: Product) => {
    setBuyModalProduct(prod);
    setBuyQtyInput('');
    setBuyPriceInput(String(prod.price));
    setBuyModalError(null);
    window.setTimeout(() => {
      buyInputRef.current?.focus();
    }, 60);
  };

  const handleConfirmBuyProduct = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!buyModalProduct) return;

    const rawQty = parseFloat(buyQtyInput.replace(',', '.'));
    if (!Number.isFinite(rawQty) || rawQty <= 0) {
      setBuyModalError(
        isAr ? 'كتب الكمية' : isFr ? 'Saisissez la quantité' : 'Please enter quantity'
      );
      return;
    }

    const rawPrice = parseFloat(buyPriceInput.replace(',', '.'));
    if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
      setBuyModalError(
        isAr ? 'كتب الثمن الصحيح' : isFr ? 'Saisissez un prix valide' : 'Please enter a valid price'
      );
      return;
    }

    const cleanQty = Number(rawQty.toFixed(2));
    const cleanPrice = Number(rawPrice.toFixed(2));

    adjustStock(
      buyModalProduct.id,
      cleanQty,
      isAr ? 'شراء سريع من شاشة البيع (شريت +)' : 'Quick restock from POS',
      'restock'
    );

    if (Math.abs(cleanPrice - buyModalProduct.price) > 0.001) {
      updateProduct(buyModalProduct.id, { price: cleanPrice });
      if (buyModalProduct.costPrice > 0 && cleanPrice <= buyModalProduct.costPrice) {
        recordPriceAlert({
          productId: buyModalProduct.id,
          productName: buyModalProduct.name,
          costPrice: buyModalProduct.costPrice,
          sellPrice: cleanPrice,
          type: cleanPrice < buyModalProduct.costPrice ? 'loss' : 'zero_profit'
        });
      } else {
        markPriceAlertFixed(buyModalProduct.id);
      }
    }

    if (settings.enableSoundEffects !== false) {
      playSound('success');
    }
    const updatedName = isAr ? buyModalProduct.name : buyModalProduct.nameEn || buyModalProduct.name;
    const newStock = Number((buyModalProduct.stock + cleanQty).toFixed(2));
    setBarcodeToast(
      isAr
        ? `✅ تزادت +${cleanQty} لـ ${updatedName} (المخزون: ${newStock} | الثمن: ${cleanPrice.toFixed(2)} ${currencySymbol})`
        : `✅ +${cleanQty} ${updatedName} (Stock: ${newStock} | Price: ${cleanPrice.toFixed(2)} ${currencySymbol})`
    );
    setTimeout(() => setBarcodeToast(null), 2800);
    setBuyModalProduct(null);
    setBuyQtyInput('');
    setBuyPriceInput('');
    setBuyModalError(null);
  };

  const openQuickFixModal = (issue: OldStockPriceIssue) => {
    setQuickFixIssue(issue);
    setQuickFixCostInput(String(issue.product.costPrice));
    setQuickFixPriceInput(String(issue.product.price));
  };

  const handleConfirmQuickFix = (useSuggested = false) => {
    if (!quickFixIssue) return;
    const nextPrice = useSuggested
      ? quickFixIssue.suggestedPrice
      : Number(parseMoroccanNumber(quickFixPriceInput).toFixed(2));
    const nextCost = useSuggested
      ? quickFixIssue.suggestedCostPrice
      : Number(parseMoroccanNumber(quickFixCostInput).toFixed(2));

    updateProduct(quickFixIssue.product.id, {
      price: nextPrice,
      costPrice: nextCost
    });

    if (nextCost > 0 && nextPrice <= nextCost) {
      recordPriceAlert({
        productId: quickFixIssue.product.id,
        productName: quickFixIssue.product.name,
        costPrice: nextCost,
        sellPrice: nextPrice,
        type: nextPrice < nextCost ? 'loss' : 'zero_profit'
      });
    } else {
      markPriceAlertFixed(quickFixIssue.product.id);
    }

    if (settings.enableSoundEffects !== false) playSound('success');
    setBarcodeToast(
      isAr
        ? `✅ تم تصحيح ثمن "${quickFixIssue.product.name}" إلى ${nextPrice.toFixed(2)} ${currencySymbol}`
        : `✅ Updated "${quickFixIssue.product.name}" to ${nextPrice.toFixed(2)} ${currencySymbol}`
    );
    setTimeout(() => setBarcodeToast(null), 2800);
    setQuickFixIssue(null);
  };

  const handleFixAllLossProducts = () => {
    if (priceIssues.length === 0) return;
    let fixedCount = 0;
    for (const issue of priceIssues) {
      updateProduct(issue.product.id, {
        price: issue.suggestedPrice,
        costPrice: issue.suggestedCostPrice
      });
      markPriceAlertFixed(issue.product.id);
      fixedCount++;
    }
    if (settings.enableSoundEffects !== false) playSound('success');
    setBarcodeToast(
      isAr
        ? `🛠️ تم تصحيح ${fixedCount} منتوجات اللي فيهم خسارة بنجاح!`
        : `🛠️ Fixed ${fixedCount} loss-priced products successfully!`
    );
    setTimeout(() => setBarcodeToast(null), 3200);
    setShowOnlyPriceIssues(false);
  };

  const handleScannedBarcode = (code: string, _speedMs?: number) => {
    const clean = code.trim();
    const scaleParsed = parseScaleBarcode(clean, products, settings.scaleBarcodeConfig);
    if (scaleParsed?.product) {
      const targetProd = scaleParsed.product;
      const remaining = getRemainingStock(targetProd);
      if (remaining <= 0 || scaleParsed.quantity > remaining) {
        showNafedSnackBar(isAr ? targetProd.name : targetProd.nameEn || targetProd.name);
        return;
      }
      if (settings.bluetoothSoundFeedback !== false) {
        playSound('beep');
      }
      addToCart(targetProd, undefined, undefined, scaleParsed.quantity);
      setBarcodeToast(
        isAr
          ? `⚖️ الميزان: ${targetProd.name} (${scaleParsed.quantity.toFixed(3)} ${targetProd.unitType === 'liter' ? 'لتر' : 'كغ'})`
          : `⚖️ Scale: ${targetProd.name} (${scaleParsed.quantity.toFixed(3)})`
      );
      setTimeout(() => setBarcodeToast(null), 2600);
      return;
    }

    const matched = products.find(
      (p) => p.barcode === clean || p.sku.toLowerCase() === clean.toLowerCase()
    );
    if (matched) {
      if (settings.bluetoothAutoAddToCart !== false) {
        if (getRemainingStock(matched) <= 0) {
          handleProductClick(matched);
          return;
        }
        if (settings.bluetoothSoundFeedback !== false) {
          playSound('beep');
        }
        handleProductClick(matched);
      } else {
        if (settings.bluetoothSoundFeedback !== false) {
          playSound('beep');
        }
        setSearchQuery(clean);
      }
      setBarcodeToast(
        isAr ? `🔊 بيب! تزادت للسلة: ${matched.name}` : isFr ? `🔊 Scanné: ${matched.name}` : `🔊 Scanned: ${matched.name}`
      );
      setTimeout(() => setBarcodeToast(null), 2500);
    } else {
      playSound('error');
      setBarcodeToast(
        isAr ? `🆕 سلعة جديدة — دخل اسمها و ثمنها (${clean})` : `🆕 New barcode: ${clean}`
      );
      setTimeout(() => setBarcodeToast(null), 2500);
      window.dispatchEvent(
        new CustomEvent('kadi:open-quick-new-barcode', {
          detail: { barcode: clean, sourceContext: 'pos' }
        })
      );
    }
  };

  const handleProductClick = (product: Product) => {
    const remaining = getRemainingStock(product);
    if (remaining <= 0) {
      showNafedSnackBar(isAr ? product.name : product.nameEn || product.name);
      return;
    }

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

      {/* Out-of-stock red SnackBar */}
      {outOfStockToast && (
        <div
          role="alert"
          className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-red-600 text-white rounded-xl shadow-2xl border border-red-400/50 flex items-center gap-2 text-sm sm:text-base font-extrabold animate-in fade-in slide-in-from-bottom-3 duration-150 whitespace-nowrap max-w-[92vw] truncate"
        >
          <span>{outOfStockToast}</span>
        </div>
      )}

      {/* Compact Search & Narrow Single-Line Add-Product Strip */}
      <div className="flex items-center gap-1.5 mb-1.5 shrink-0">
        <div className="relative flex-1 min-w-[115px]">
          <Search className="absolute right-2.5 rtl:right-2.5 rtl:left-auto left-2.5 rtl:right-auto top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                const rawQ = searchQuery.trim();
                const scaleParsed = parseScaleBarcode(rawQ, products, settings.scaleBarcodeConfig);
                if (scaleParsed?.product) {
                  e.preventDefault();
                  const remaining = getRemainingStock(scaleParsed.product);
                  if (remaining <= 0 || scaleParsed.quantity > remaining) {
                    showNafedSnackBar(isAr ? scaleParsed.product.name : scaleParsed.product.nameEn || scaleParsed.product.name);
                  } else {
                    addToCart(scaleParsed.product, undefined, undefined, scaleParsed.quantity);
                    if (settings.enableSoundEffects !== false) playSound('beep');
                  }
                  setSearchQuery('');
                  return;
                }
                const q = rawQ.toLowerCase();
                const exactMatch = products.find(
                  (p) => p.barcode.toLowerCase() === q || p.sku.toLowerCase() === q
                );
                const target = exactMatch || (filteredProducts.length === 1 ? filteredProducts[0] : null);
                if (target) {
                  e.preventDefault();
                  handleProductClick(target);
                  setSearchQuery('');
                  if (settings.enableSoundEffects !== false) playSound('beep');
                }
              } else if (e.key === 'Escape' && searchQuery) {
                setSearchQuery('');
              }
            }}
            placeholder={isAr ? `${t.search_placeholder} (/ أو F2)` : `${t.search_placeholder} (/ or F2)`}
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
            const catCount =
              cat.id === 'cat-all' ? products.length : (categoryCountsMap.get(cat.id) ?? 0);

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
                      setDeletingCategory(cat);
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

          {/* Quick In-Stock Filter Chip */}
          <button
            type="button"
            onClick={() => setShowOnlyInStock((prev) => !prev)}
            className={`relative h-8 flex items-center gap-1 px-2 rounded-lg border transition-all shrink-0 select-none text-[11px] font-bold whitespace-nowrap ${
              showOnlyInStock
                ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-emerald-400'
            }`}
            title={isAr ? 'عرض السلع المتوفرة في المخزون فقط' : 'Show in-stock items only'}
          >
            <PackageCheck className="w-3 h-3" />
            <span>{isAr ? 'المتوفر فقط' : 'In Stock'}</span>
          </button>

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

          {/* Negative / Loss Price Filter Chip */}
          {priceIssues.length > 0 && (
            <button
              type="button"
              onClick={() => setShowOnlyPriceIssues((prev) => !prev)}
              className={`relative h-8 flex items-center gap-1 px-2 rounded-lg border transition-all shrink-0 select-none text-[11px] font-extrabold whitespace-nowrap ${
                showOnlyPriceIssues
                  ? 'border-rose-600 bg-rose-600 text-white shadow-xs'
                  : 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100'
              }`}
              title={isAr ? 'عرض المنتجات اللي فيهم خسارة أو بلا ربح فقط' : 'Filter loss/zero-profit products'}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>{isAr ? 'أثمنة سلبية' : 'Loss Price'}</span>
              <span className={`px-1 rounded-full text-[9px] font-black tabular-nums ${showOnlyPriceIssues ? 'bg-white text-rose-700' : 'bg-rose-600 text-white'}`}>
                {priceIssues.length}
              </span>
            </button>
          )}

          {/* Compact Sort Selector */}
          <div className="relative h-8 flex items-center shrink-0">
            <ArrowUpDown className="w-3 h-3 text-slate-400 absolute start-2 pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              aria-label={isAr ? 'ترتيب المنتجات' : 'Sort products'}
              className="h-8 ps-6 pe-2 text-[11px] font-bold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="default">{isAr ? 'الترتيب الافتراضي' : 'Default Sort'}</option>
              <option value="lowest_stock">{isAr ? 'الأقل مخزوناً' : 'Lowest Stock'}</option>
              <option value="price_asc">{isAr ? 'الأرخص أولاً' : 'Price: Low-High'}</option>
              <option value="price_desc">{isAr ? 'الأغلى أولاً' : 'Price: High-Low'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bulk Fix Negative / Loss Prices Action Bar on Sales Screen */}
      {priceIssues.length > 0 && (
        <div className="mb-1.5 shrink-0 px-2.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/45 border border-rose-300 dark:border-rose-800/80 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-rose-800 dark:text-rose-200">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>
              {isAr
                ? `كاين ${priceIssues.length} منتج بأثمنة فيها خسارة أو بلا ربح`
                : `${priceIssues.length} products selling at loss or zero profit`}
            </span>
          </div>
          <button
            type="button"
            onClick={handleFixAllLossProducts}
            className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black flex items-center gap-1 shadow-2xs transition-all active:scale-95 whitespace-nowrap"
          >
            <Wrench className="w-3 h-3 shrink-0" />
            <span>
              {isAr
                ? '🛠️ صحح جميع المنتجات اللي فيهم خسارة'
                : `Fix All Loss Products (${priceIssues.length})`}
            </span>
          </button>
        </div>
      )}

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
              const remainingStock = getRemainingStock(prod);
              const isLowStock = remainingStock > 0 && remainingStock <= prod.lowStockThreshold;
              const isOutOfStock = remainingStock <= 0;
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
                        <span className="px-2 py-0.5 text-[11px] font-extrabold bg-red-600 text-white rounded-lg shadow-xs">
                          {isAr ? 'نفذ' : t.stock_out}
                        </span>
                      ) : isLowStock ? (
                        <span className="px-2 py-0.5 text-[11px] font-bold bg-amber-500 text-white rounded-lg shadow-xs tabular-nums">
                          {remainingStock} {getUnitBadge(prod.unitType)}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[11px] font-bold bg-emerald-600 text-white rounded-lg shadow-xs tabular-nums">
                          {remainingStock}
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
                      <div className="text-[10px] text-slate-400 font-mono tracking-tight mb-1.5">
                        {prod.barcode || prod.sku}
                      </div>

                      {/* Stock count (non-faded, bold red/green) + out-of-stock label */}
                      <div className="mb-1.5 flex items-center justify-between gap-1.5 flex-wrap">
                        <span
                          className={`font-bold text-sm sm:text-base tabular-nums ${
                            isOutOfStock
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {isAr ? `المخزون: ${remainingStock}` : `Stock: ${remainingStock}`}
                        </span>
                        {isOutOfStock && (
                          <span className="text-red-600 dark:text-red-400 font-extrabold text-xs sm:text-sm">
                            {isAr ? 'نفذ' : isFr ? 'Épuisé' : 'Out'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Price and Profit Margin % / Negative Price Correction Pill */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-end justify-between gap-1">
                      <div>
                        <div className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white tabular-nums">
                          {prod.price.toFixed(2)}{' '}
                          <span className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
                            {currencySymbol}
                          </span>
                        </div>
                        {prod.wholesaleMinQty && prod.wholesalePrice ? (
                          <div className="text-[10px] font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                            {isAr
                              ? `جملة +${prod.wholesaleMinQty}: ${prod.wholesalePrice.toFixed(2)} ${currencySymbol}`
                              : `WS +${prod.wholesaleMinQty}: ${prod.wholesalePrice.toFixed(2)}`}
                          </div>
                        ) : prod.semiWholesaleMinQty && prod.semiWholesalePrice ? (
                          <div className="text-[10px] font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                            {isAr
                              ? `نصف جملة +${prod.semiWholesaleMinQty}: ${prod.semiWholesalePrice.toFixed(2)} ${currencySymbol}`
                              : `S-WS +${prod.semiWholesaleMinQty}: ${prod.semiWholesalePrice.toFixed(2)}`}
                          </div>
                        ) : null}
                      </div>

                      {/* Profit margin / Loss correction badge */}
                      {(() => {
                        const prodIssue = priceIssuesByProductId.get(prod.id);
                        if (prodIssue) {
                          const isZeroProfit = prodIssue.reason === 'zero_profit';
                          return (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openQuickFixModal(prodIssue);
                              }}
                              className={`px-2 py-0.5 text-[10px] font-black text-white rounded-full shadow-2xs flex items-center gap-1 transition-transform active:scale-95 tabular-nums ${
                                isZeroProfit
                                  ? 'bg-amber-500 hover:bg-amber-600'
                                  : 'bg-rose-600 hover:bg-rose-700'
                              }`}
                              title={prodIssue.message}
                            >
                              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                              <span>
                                {isZeroProfit
                                  ? isAr
                                    ? 'بلا ربح · صلح'
                                    : '0% · Fix'
                                  : isAr
                                  ? `خسارة ${profit.toFixed(1)} · صلح`
                                  : `${profit.toFixed(1)} · Fix`}
                              </span>
                            </button>
                          );
                        }
                        return (
                          <div className="text-right rtl:text-left">
                            <span
                              className="inline-block px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 rounded tabular-nums"
                              title={`${t.cost}: ${prod.costPrice} ${currencySymbol}`}
                            >
                              +{profitMargin}%
                            </span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Quick Restock Button ("شريت +") */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openBuyProductDialog(prod);
                      }}
                      className={`mt-2 w-full py-1.5 px-2.5 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1 transition-all active:scale-95 ${
                        isOutOfStock
                          ? 'border-red-500 text-red-600 dark:text-red-400 bg-red-50/70 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50'
                          : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-slate-50/80 dark:bg-slate-800/60 hover:border-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-400'
                      }`}
                    >
                      <PackagePlus className="w-3.5 h-3.5 shrink-0" />
                      <span>{isAr ? 'شريت +' : isFr ? 'Achat +' : 'Buy +'}</span>
                    </button>
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

      {/* Desktop Bottom Quick Bar inside Main POS View (lg+) */}
      <div className="hidden lg:flex items-center justify-between gap-3 pt-2 mt-1 border-t border-slate-200/80 dark:border-slate-800/80 shrink-0">
        <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold tabular-nums flex items-center gap-2">
          <span>
            {isAr
              ? `${displayedProducts.length} من ${filteredProducts.length} سلعة`
              : `${displayedProducts.length} of ${filteredProducts.length} items`}
          </span>
          <span aria-hidden="true">·</span>
          <span>{isAr ? 'البيع السريع' : 'Quick Sale'}</span>
        </div>

        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('kadi:open-price-checker'))}
          className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-black flex items-center gap-2 shadow-2xs transition-colors active:scale-95 whitespace-nowrap shrink-0"
        >
          <Tag className="w-4 h-4 shrink-0" />
          <span>{isAr ? 'شحال الثمن' : isFr ? 'Vérifier le prix' : 'Price Check'}</span>
        </button>
      </div>

      {/* Digital Scale Modal for kg / liter */}
      {scaleProduct && (
        <ScaleModal
          product={scaleProduct}
          onClose={() => setScaleProduct(null)}
          onConfirm={(qty) => {
            const remaining = getRemainingStock(scaleProduct);
            if (remaining <= 0 || qty > remaining) {
              showNafedSnackBar(isAr ? scaleProduct.name : scaleProduct.nameEn || scaleProduct.name);
              return;
            }
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
            if (getRemainingStock(variantProduct) <= 0) {
              showNafedSnackBar(isAr ? variantProduct.name : variantProduct.nameEn || variantProduct.name);
              return;
            }
            addToCart(variantProduct, varId, mods);
          }}
        />
      )}

      {/* Quick Purchase / Restock Modal ("شريت +") */}
      {buyModalProduct && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setBuyModalProduct(null)}
        >
          <form
            onSubmit={handleConfirmBuyProduct}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {isAr
                    ? `شريت ${buyModalProduct.name}`
                    : isFr
                    ? `Achat : ${buyModalProduct.nameEn || buyModalProduct.name}`
                    : `Restock ${buyModalProduct.nameEn || buyModalProduct.name}`}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                  {isAr ? `المخزون الحالي: ${buyModalProduct.stock}` : `Current stock: ${buyModalProduct.stock}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBuyModalProduct(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {isAr
                  ? 'شحال شريتي؟ - الكمية'
                  : isFr
                  ? 'Quantité achetée ?'
                  : 'Quantity purchased?'}
              </label>
              <input
                ref={buyInputRef}
                type="number"
                step={buyModalProduct.unitType === 'kg' || buyModalProduct.unitType === 'liter' ? '0.1' : '1'}
                min="0.01"
                value={buyQtyInput}
                onChange={(e) => {
                  setBuyQtyInput(e.target.value);
                  if (buyModalError) setBuyModalError(null);
                }}
                placeholder={isAr ? 'مثلاً: 10' : 'e.g. 10'}
                className="w-full px-3.5 py-2.5 text-base font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
              />
              <div className="flex items-center gap-1.5 mt-2">
                {[5, 10, 20, 50].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      const curr = parseFloat(buyQtyInput) || 0;
                      setBuyQtyInput(String(curr + preset));
                      if (buyModalError) setBuyModalError(null);
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 border border-slate-200 dark:border-slate-700 text-xs font-extrabold text-slate-700 dark:text-slate-200 tabular-nums"
                  >
                    +{preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr
                    ? `الثمن الجديد (${currencySymbol})`
                    : isFr
                    ? `Nouveau prix (${currencySymbol})`
                    : `New Price (${currencySymbol})`}
                </label>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {isAr
                    ? `الثمن الحالي: ${buyModalProduct.price.toFixed(2)} ${currencySymbol}`
                    : `Current: ${buyModalProduct.price.toFixed(2)} ${currencySymbol}`}
                </span>
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={buyPriceInput}
                onChange={(e) => {
                  setBuyPriceInput(e.target.value);
                  if (buyModalError) setBuyModalError(null);
                }}
                placeholder={String(buyModalProduct.price)}
                className="w-full px-3.5 py-2.5 text-base font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
              />
            </div>

            {buyModalError && (
              <div
                role="alert"
                className="px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-extrabold flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{buyModalError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setBuyModalProduct(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {isAr ? 'إلغاء' : isFr ? 'Annuler' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm transition-all active:scale-95"
              >
                {isAr ? 'زيد' : isFr ? 'Ajouter' : 'Add'}
              </button>
            </div>
          </form>
        </div>
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

      {/* Quick Negative / Loss Price Correction Modal */}
      {quickFixIssue && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setQuickFixIssue(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {isAr
                    ? `تصحيح ثمن: ${quickFixIssue.product.name}`
                    : `Fix Price: ${quickFixIssue.product.name}`}
                </h3>
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                  {quickFixIssue.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickFixIssue(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? `ثمن الشراء (${currencySymbol})` : `Cost (${currencySymbol})`}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={quickFixCostInput}
                  onChange={(e) => setQuickFixCostInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? `ثمن البيع (${currencySymbol})` : `Sell Price (${currencySymbol})`}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={quickFixPriceInput}
                  onChange={(e) => setQuickFixPriceInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <PriceAlertAdvisor
              costPrice={parseMoroccanNumber(quickFixCostInput)}
              sellPrice={parseMoroccanNumber(quickFixPriceInput)}
              currencySymbol={currencySymbol}
              isAr={isAr}
              onApplyChoice={(patch) => {
                if (typeof patch.price === 'number') setQuickFixPriceInput(String(patch.price));
                if (typeof patch.costPrice === 'number') setQuickFixCostInput(String(patch.costPrice));
              }}
            />

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleConfirmQuickFix(true)}
                className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-sm transition-all active:scale-95"
              >
                {isAr
                  ? `✅ نعم، صحح تلقائياً (${quickFixIssue.fixLabel})`
                  : `✅ Auto-Fix (${quickFixIssue.fixLabel})`}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleConfirmQuickFix(false)}
                  className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-extrabold transition-colors"
                >
                  {isAr ? 'حفظ الأثمنة المكتوبة' : 'Save Entered Prices'}
                </button>
                <button
                  type="button"
                  onClick={() => setQuickFixIssue(null)}
                  className="px-4 min-h-[40px] py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Delete Category Confirmation Modal */}
      {deletingCategory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs"
          onClick={() => setDeletingCategory(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  {isAr ? 'حذف الفئة / الصنف' : 'Delete Category'}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  {isAr
                    ? `هل أنت متأكد من حذف فئة "${deletingCategory.name}"؟ سيتم نقل منتجاتها (${categoryCountsMap.get(deletingCategory.id) ?? 0} منتج) تلقائياً إلى فئة أخرى.`
                    : `Delete category "${deletingCategory.name}"? ${categoryCountsMap.get(deletingCategory.id) ?? 0} products will be safely moved.`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeletingCategory(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteCategory(deletingCategory.id);
                  setSelectedCategoryId('cat-all');
                  setDeletingCategory(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-xs"
              >
                {isAr ? 'تأكيد الحذف' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
