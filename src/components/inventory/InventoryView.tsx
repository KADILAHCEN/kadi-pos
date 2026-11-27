import React, { useState } from 'react';
import { usePos } from '../../context/PosContext';
import { getT } from '../../utils/translations';
import { Product, UnitType } from '../../types';
import { AddProductModal } from '../pos/AddProductModal';
import { ImportProductsModal } from './ImportProductsModal';
import {
  Layers,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  History,
  TrendingUp,
  Download,
  Upload,
  Edit2,
  Trash2,
  X,
  PackagePlus,
  Scale,
  Sparkles,
  FileSpreadsheet,
  Calendar,
  Camera,
  SlidersHorizontal,
  CheckSquare,
  Pencil,
  Clock,
  Send,
  PackageX,
  Barcode,
  PackageOpen,
  Smartphone
} from 'lucide-react';
import { AddCategoryModal } from './AddCategoryModal';
import { BulkUpdateModal } from './BulkUpdateModal';
import { EditProductModal } from '../pos/EditProductModal';
import { RetailProductSearchSelect } from '../pos/RetailProductSearchSelect';
import { BarcodeScannerModal } from '../pos/BarcodeScannerModal';
import { ExportCatalogGmailModal } from './ExportCatalogGmailModal';
import { ShelfLabelPrintModal } from './ShelfLabelPrintModal';
import { StocktakePanel } from './StocktakePanel';
import { bluetoothScanner } from '../../utils/bluetoothScanner';
import { playSound } from '../../utils/audio';
import {
  exportInventoryToExcel,
  exportInventoryToPdf,
  exportReplenishmentPoToExcel,
  exportReplenishmentPoToPdf,
  ReplenishmentOrderLine
} from '../../utils/exportReports';
import { ScanLine, FileText, Brain, ShoppingCart, CheckCircle2, Mail, ClipboardCheck, Truck, Copy, Check } from 'lucide-react';
import { SupplierInvoice } from '../../types';

const resolveProductSupplier = (
  product: Product,
  categoryName: string,
  invoices: SupplierInvoice[],
  isAr: boolean
): { supplierName: string; supplierPhone?: string; source: 'invoice' | 'category' } => {
  const prodNameLower = product.name.trim().toLowerCase();
  const prodEnLower = (product.nameEn || '').trim().toLowerCase();

  for (let i = invoices.length - 1; i >= 0; i--) {
    const inv = invoices[i];
    const inItems = inv.itemsSummary?.some((it) => {
      const itName = it.productName.trim().toLowerCase();
      return (
        itName.includes(prodNameLower) ||
        prodNameLower.includes(itName) ||
        (prodEnLower && itName.includes(prodEnLower))
      );
    });
    const inNotes = inv.notes && inv.notes.toLowerCase().includes(prodNameLower);
    if (inItems || inNotes) {
      return {
        supplierName: inv.supplierName,
        supplierPhone: inv.supplierPhone,
        source: 'invoice'
      };
    }
  }

  const combined = `${prodNameLower} ${prodEnLower} ${categoryName.toLowerCase()}`;
  if (/(حليب|لبن|ياغورت|رايبي|جبن|فرماج|زبدة|أجبان|milk|danone|yogurt|lait|dairy)/.test(combined)) {
    return {
      supplierName: isAr ? 'موزع الحليب ومشتقاته (سنطرال / جودة / كوباك)' : 'Dairy Distributor',
      source: 'category'
    };
  }
  if (/(كوكا|بيبسي|فانتا|سبرايت|عصير|ماء|سيدي علي|والماس|مشروب|soda|juice|water|boisson|drink|beverage)/.test(combined)) {
    return {
      supplierName: isAr ? 'مستودع المشروبات الغازية والمياه' : 'Beverages Wholesaler',
      source: 'category'
    };
  }
  if (/(شاي|أتاي|قهوة|سكر|زيت|دقيق|طماطم|أرز|مقرونة|عدس|فاصوليا|سميد|كسكس|tea|sugar|oil|flour|grocery|أغذية)/.test(combined)) {
    return {
      supplierName: isAr ? 'تاجر جملة المواد الغذائية الأساسية (درب عمر / سوق الجملة)' : 'Dry Groceries Wholesaler',
      source: 'category'
    };
  }
  if (/(جافيل|أومو|تيد|صابون|شامبو|نظافة|منظف|حفاضات|بامبرز|detergent|soap|clean|hygiene)/.test(combined)) {
    return {
      supplierName: isAr ? 'مورد مواد التنظيف والعناية الشخصية' : 'Cleaning & Care Supplier',
      source: 'category'
    };
  }
  if (/(بيمو|شوكولا|بسكويت|حلوة|علكة|شيبس|كيك|chocolate|biscuit|snack|حلويات)/.test(combined)) {
    return {
      supplierName: isAr ? 'موزع البسكويت والحلويات (بيمو / أولي)' : 'Snacks & Confectionery Distributor',
      source: 'category'
    };
  }
  if (/(خبز|كرواصة|مسمن|بيض|دجاج|لاندون|كاشير|مخبز|bread|egg|bakery)/.test(combined)) {
    return {
      supplierName: isAr ? 'موزع المخبز والبيض واللحوم المحولة' : 'Fresh & Bakery Supplier',
      source: 'category'
    };
  }

  return {
    supplierName: isAr ? 'سوق الجملة العام / المورد المعتمد' : 'General Wholesale Supplier',
    source: 'category'
  };
};

export const InventoryView: React.FC = () => {
  const {
    products,
    categories,
    addProduct,
    updateProduct,
    deleteProduct,
    adjustStock,
    addProductBatch,
    unpackBoxProduct,
    seedLargeCatalogDemo,
    stockMovements,
    expiringSoonProducts,
    criticalLowStockProducts,
    orders,
    supplierInvoices,
    settings,
    setCurrentTab,
    exportDatabaseJson,
    currencySymbol,
    language
  } = usePos();

  const t = getT(language);
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  type SortField = 'name' | 'stock' | 'price' | 'costPrice' | 'margin';
  type SortOrder = 'asc' | 'desc';

  const [activeTab, setActiveTab] = useState<'catalog' | 'stocktake' | 'movements' | 'ai_prediction'>('catalog');

  React.useEffect(() => {
    const handleOpenStocktake = () => setActiveTab('stocktake');
    const handleOpenSmartPlanning = () => {
      setActiveTab('ai_prediction');
      setAiSubView('supplier_po');
    };
    const handleInvoiceScanned = (evt: Event) => {
      const detail = (evt as CustomEvent<{ message?: string }>).detail;
      if (detail?.message) {
        setProductToast(detail.message);
        setTimeout(() => setProductToast(null), 4500);
      }
    };
    window.addEventListener('kadi:open-stocktake', handleOpenStocktake);
    window.addEventListener('kadi:open-smart-planning', handleOpenSmartPlanning);
    window.addEventListener('kadi:purchase-invoice-completed', handleInvoiceScanned);
    return () => {
      window.removeEventListener('kadi:open-stocktake', handleOpenStocktake);
      window.removeEventListener('kadi:open-smart-planning', handleOpenSmartPlanning);
      window.removeEventListener('kadi:purchase-invoice-completed', handleInvoiceScanned);
    };
  }, []);
  const [selectedPoIds, setSelectedPoIds] = useState<Set<string>>(new Set());
  const [poTargetDays, setPoTargetDays] = useState<number>(14);
  const [aiSubView, setAiSubView] = useState<'supplier_po' | 'forecast_table'>('supplier_po');
  const [onlyNeedsReorder, setOnlyNeedsReorder] = useState<boolean>(false);
  const [copiedSupplierKey, setCopiedSupplierKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCat, setSelectedCat] = useState('all');
  const [selectedUnit, setSelectedUnit] = useState<string>('all');
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [onlyOutOfStock, setOnlyOutOfStock] = useState(false);
  const [onlyExpiring, setOnlyExpiring] = useState(false);
  const [onlyStagnant, setOnlyStagnant] = useState(false);
  const [sortField, setSortField] = useState<SortField>('stock');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [tablePage, setTablePage] = useState<number>(1);
  const pageSize = 50;

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [categoryModalTab, setCategoryModalTab] = useState<'create' | 'manage'>('manage');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showCatalogGmailModal, setShowCatalogGmailModal] = useState(false);
  const [showLabelPrintModal, setShowLabelPrintModal] = useState(false);
  const [labelPrintInitialProducts, setLabelPrintInitialProducts] = useState<Product[] | undefined>(undefined);
  const [unpackModalProduct, setUnpackModalProduct] = useState<Product | null>(null);
  const [unpackBoxesCount, setUnpackBoxesCount] = useState<string>('1');
  const [unpackChildId, setUnpackChildId] = useState<string>('');
  const [unpackUnitsPerBox, setUnpackUnitsPerBox] = useState<string>('');
  const [showSeedDemoConfirm, setShowSeedDemoConfirm] = useState(false);
  const [selectedProductForAdjust, setSelectedProductForAdjust] = useState<Product | null>(null);
  const [productToast, setProductToast] = useState<string | null>(null);
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);

  // Listen for Bluetooth HID barcode scanner while on Stock screen
  React.useEffect(() => {
    bluetoothScanner.init({
      enabled: settings.bluetoothScannerEnabled ?? true
    });

    const unsubScan = bluetoothScanner.onScan((payload) => {
      if (bluetoothScanner.getActiveScope() !== null) return;
      const clean = payload.barcode.trim();
      const matched = products.find(
        (p) => p.barcode === clean || p.sku.toLowerCase() === clean.toLowerCase()
      );

      if (matched) {
        if (settings.bluetoothSoundFeedback !== false) playSound('beep');
        setActiveTab('catalog');
        setSelectedCat('all');
        setSelectedUnit('all');
        setOnlyLowStock(false);
        setOnlyOutOfStock(false);
        setOnlyExpiring(false);
        setOnlyStagnant(false);
        setSearchQuery(matched.barcode || matched.name);
        setHighlightedProductId(matched.id);
        setProductToast(
          isAr
            ? `🔊 بيب! تلقات فـ المخزون: ${matched.name} (${matched.stock} ${matched.unitType})`
            : `🔊 Found in stock: ${matched.name} (${matched.stock})`
        );
        setTimeout(() => setProductToast(null), 3200);
        setTimeout(() => setHighlightedProductId((prev) => (prev === matched.id ? null : prev)), 4000);
      } else {
        playSound('error');
        window.dispatchEvent(
          new CustomEvent('kadi:open-quick-new-barcode', {
            detail: { barcode: clean, sourceContext: 'inventory' }
          })
        );
      }
    });

    const handleQuickCreated = (evt: Event) => {
      const detail = (evt as CustomEvent<{
        product?: Product;
        sourceContext?: string;
      }>).detail;
      if (detail?.sourceContext !== 'inventory' || !detail.product) return;
      const created = detail.product;
      setActiveTab('catalog');
      setSelectedCat('all');
      setSelectedUnit('all');
      setOnlyLowStock(false);
      setOnlyOutOfStock(false);
      setOnlyExpiring(false);
      setOnlyStagnant(false);
      setSearchQuery(created.barcode || created.name);
      setHighlightedProductId(created.id);
      setProductToast(
        isAr
          ? `✅ تسجلات "${created.name}" وتحفظ الباركود فـ المخزون!`
          : `✅ Saved "${created.name}" to inventory!`
      );
      setTimeout(() => setProductToast(null), 3500);
    };

    window.addEventListener('kadi:quick-barcode-product-created', handleQuickCreated);
    return () => {
      unsubScan();
      window.removeEventListener('kadi:quick-barcode-product-created', handleQuickCreated);
    };
  }, [products, settings.bluetoothScannerEnabled, settings.bluetoothSoundFeedback, isAr]);

  // Multi-Product Selection
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  // Adjust Stock Form State
  const [adjustQty, setAdjustQty] = useState<number>(10);
  const [adjustType, setAdjustType] = useState<'restock' | 'waste' | 'audit_adjustment'>('restock');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [adjustBatchExpiry, setAdjustBatchExpiry] = useState<string>('');

  // Overall Inventory Value & Profit Margin Calculations
  const inventoryMetrics = React.useMemo(() => {
    let totalCostVal = 0;
    let totalRetailVal = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    products.forEach((p) => {
      totalCostVal += p.costPrice * p.stock;
      totalRetailVal += p.price * p.stock;
      if (p.stock <= 0) {
        outOfStockCount++;
      }
      if (p.stock <= p.lowStockThreshold) {
        lowStockCount++;
      }
    });

    const expectedGrossProfit = totalRetailVal - totalCostVal;
    const avgMarginPercent = totalRetailVal > 0 ? (expectedGrossProfit / totalRetailVal) * 100 : 0;

    return {
      totalProducts: products.length,
      totalCostVal: Number(totalCostVal.toFixed(2)),
      totalRetailVal: Number(totalRetailVal.toFixed(2)),
      expectedGrossProfit: Number(expectedGrossProfit.toFixed(2)),
      avgMarginPercent: Number(avgMarginPercent.toFixed(1)),
      lowStockCount,
      outOfStockCount
    };
  }, [products]);

  // Smart Replenishment & AI Stock Planning (30-day velocity, Reorder Point, & Supplier Grouping)
  const aiPredictions = React.useMemo(() => {
    const completedOrders = orders.filter((o) => o.status === 'completed');
    const thirtyDaysAgoMs = Date.now() - 30 * 86_400_000;
    const recent30dOrders = completedOrders.filter((o) => {
      const tMs = new Date(o.date).getTime();
      return !isNaN(tMs) && tMs >= thirtyDaysAgoMs;
    });

    const sold30dByProduct = new Map<string, number>();
    recent30dOrders.forEach((o) => {
      o.items.forEach((it) => {
        sold30dByProduct.set(it.productId, (sold30dByProduct.get(it.productId) || 0) + it.quantity);
      });
    });

    const categoryMap = new Map(categories.map((c) => [c.id, isAr ? c.name : c.nameEn || c.name]));

    return products
      .map((p) => {
        const soldLast30d = sold30dByProduct.get(p.id) || 0;
        const dailyVelocity = soldLast30d / 30;
        const safetyBuffer = Math.max(2, Math.round(p.lowStockThreshold * 0.5));
        const reorderPoint = Math.max(
          5,
          p.lowStockThreshold,
          Math.ceil(dailyVelocity * 5) + safetyBuffer
        );
        const isBelowFive = p.stock < 5;
        const needsReorder = isBelowFive || p.stock <= reorderPoint;

        const daysToZero =
          p.stock <= 0
            ? 0
            : dailyVelocity > 0
            ? Math.floor(p.stock / dailyVelocity)
            : null;
        const estimatedZeroDate =
          daysToZero !== null
            ? new Date(Date.now() + daysToZero * 86_400_000).toISOString().slice(0, 10)
            : null;
        const isCriticalThreshold =
          p.stock <= 0 || isBelowFive || (p.lowStockThreshold > 0 && p.stock <= p.lowStockThreshold * 0.2);
        const isBelowMin = isBelowFive || p.stock <= p.lowStockThreshold;

        const targetStock = Math.max(
          Math.ceil(dailyVelocity * poTargetDays),
          reorderPoint * 2,
          10
        );
        const recommendedQty = Math.max(0, Math.ceil(targetStock - p.stock));
        const estimatedCost = Number((recommendedQty * p.costPrice).toFixed(2));

        const urgency: 'critical' | 'warning' | 'healthy' =
          p.stock <= 0 || isBelowFive || isCriticalThreshold || (daysToZero !== null && daysToZero <= 5)
            ? 'critical'
            : needsReorder || isBelowMin || (daysToZero !== null && daysToZero <= 14)
            ? 'warning'
            : 'healthy';

        const catName = categoryMap.get(p.categoryId) || '';
        const supplierInfo = resolveProductSupplier(p, catName, supplierInvoices, isAr);

        return {
          product: p,
          totalSold: soldLast30d,
          soldLast30d,
          dailyVelocity,
          reorderPoint,
          isBelowFive,
          needsReorder,
          daysToZero,
          estimatedZeroDate,
          isCriticalThreshold,
          isBelowMin,
          recommendedQty,
          estimatedCost,
          urgency,
          supplierName: supplierInfo.supplierName,
          supplierPhone: supplierInfo.supplierPhone,
          supplierSource: supplierInfo.source
        };
      })
      .sort((a, b) => {
        if (a.needsReorder !== b.needsReorder) return a.needsReorder ? -1 : 1;
        const rank = { critical: 0, warning: 1, healthy: 2 };
        if (rank[a.urgency] !== rank[b.urgency]) return rank[a.urgency] - rank[b.urgency];
        const aDays = a.daysToZero ?? 9999;
        const bDays = b.daysToZero ?? 9999;
        if (aDays !== bDays) return aDays - bDays;
        return b.dailyVelocity - a.dailyVelocity;
      });
  }, [products, categories, orders, supplierInvoices, poTargetDays, isAr]);

  // Stagnant stock detector: stock > 0 with 0 completed sales in last 30 days
  const stagnantProductIds = React.useMemo(() => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentSoldIds = new Set<string>();
    orders.forEach((o) => {
      if (o.status !== 'completed') return;
      const tMs = new Date(o.date).getTime();
      if (!isNaN(tMs) && tMs >= thirtyDaysAgo) {
        o.items.forEach((it) => recentSoldIds.add(it.productId));
      }
    });
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.stock > 0 && !recentSoldIds.has(p.id)) {
        set.add(p.id);
      }
    });
    return set;
  }, [products, orders]);

  // Reset page when filters or sorting change
  React.useEffect(() => {
    setTablePage(1);
  }, [searchQuery, selectedCat, selectedUnit, onlyLowStock, onlyOutOfStock, onlyExpiring, onlyStagnant, sortField, sortOrder]);

  // Handle header sort click
  const handleSortClick = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'name' || field === 'stock' ? 'asc' : 'desc');
    }
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return (
        <ArrowUpDown className="w-3 h-3 text-slate-400 dark:text-slate-500 opacity-40 group-hover:opacity-100 transition-opacity shrink-0" />
      );
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
    );
  };

  // High-capacity memoized filtering & sorting for 2,000+ items
  const filteredProducts = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const list = products.filter((p) => {
      const matchesCat = selectedCat === 'all' || p.categoryId === selectedCat;
      const matchesUnit = selectedUnit === 'all' || p.unitType === selectedUnit;
      const matchesLow = !onlyLowStock || p.stock <= p.lowStockThreshold;
      const matchesOutOfStock = !onlyOutOfStock || p.stock <= 0;
      const matchesStagnant = !onlyStagnant || stagnantProductIds.has(p.id);

      let matchesExpiring = true;
      if (onlyExpiring) {
        if (!p.expiryDate) {
          matchesExpiring = false;
        } else {
          const exp = new Date(p.expiryDate);
          matchesExpiring = !isNaN(exp.getTime()) && exp.getTime() - today.getTime() <= 30 * 24 * 3600 * 1000;
        }
      }

      if (!matchesCat || !matchesUnit || !matchesLow || !matchesOutOfStock || !matchesExpiring || !matchesStagnant) return false;
      if (!query) return true;

      return (
        p.name.toLowerCase().includes(query) ||
        p.nameEn.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query) ||
        p.barcode.toLowerCase().includes(query)
      );
    });

    // Apply sorting
    return list.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'stock') {
        comparison = a.stock - b.stock;
      } else if (sortField === 'price') {
        comparison = a.price - b.price;
      } else if (sortField === 'costPrice') {
        comparison = a.costPrice - b.costPrice;
      } else if (sortField === 'margin') {
        const marginA = a.price > 0 ? (a.price - a.costPrice) / a.price : 0;
        const marginB = b.price > 0 ? (b.price - b.costPrice) / b.price : 0;
        comparison = marginA - marginB;
      } else {
        const nameA = isAr ? a.name : a.nameEn;
        const nameB = isAr ? b.name : b.nameEn;
        comparison = nameA.localeCompare(nameB, isAr ? 'ar' : 'en', { sensitivity: 'base' });
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [products, selectedCat, selectedUnit, onlyLowStock, onlyOutOfStock, onlyExpiring, onlyStagnant, stagnantProductIds, searchQuery, sortField, sortOrder, isAr]);

  const totalPages = Math.ceil(filteredProducts.length / pageSize) || 1;
  const paginatedProducts = React.useMemo(() => {
    const start = (tablePage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, tablePage, pageSize]);

  // Selected products array for bulk update modal
  const selectedProductsList = React.useMemo(() => {
    return products.filter((p) => selectedProductIds.has(p.id));
  }, [products, selectedProductIds]);

  const isAllPageSelected =
    paginatedProducts.length > 0 &&
    paginatedProducts.every((p) => selectedProductIds.has(p.id));

  const toggleSelectProduct = (id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectPage = () => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (isAllPageSelected) {
        paginatedProducts.forEach((p) => next.delete(p.id));
      } else {
        paginatedProducts.forEach((p) => next.add(p.id));
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedProductIds(new Set(filteredProducts.map((p) => p.id)));
  };

  const clearSelection = () => {
    setSelectedProductIds(new Set());
  };

  const handleApplyAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForAdjust) return;

    const delta = adjustType === 'waste' ? -Math.abs(adjustQty) : Math.abs(adjustQty);
    const reasonText = adjustReason.trim() || (adjustType === 'restock' ? 'توريد كمية جديدة' : adjustType === 'waste' ? 'هدر وتالف' : 'تعديل جرد يدوي');

    adjustStock(selectedProductForAdjust.id, delta, reasonText, adjustType);
    if (adjustType === 'restock' && delta > 0 && adjustBatchExpiry.trim()) {
      addProductBatch(
        selectedProductForAdjust.id,
        {
          quantity: delta,
          expiryDate: adjustBatchExpiry.trim(),
          costPrice: selectedProductForAdjust.costPrice
        },
        { skipStockIncrement: true }
      );
    }
    setShowAdjustModal(false);
    setSelectedProductForAdjust(null);
    setAdjustReason('');
    setAdjustBatchExpiry('');
  };

  // CSV Export
  const exportCsv = () => {
    const headers = ['ID', 'Name', 'NameEn', 'SKU', 'Barcode', 'Unit', 'CostPrice', 'Price', 'Stock', 'Threshold'];
    const rows = products.map((p) => [
      p.id,
      `"${p.name}"`,
      `"${p.nameEn}"`,
      p.sku,
      p.barcode,
      p.unitType,
      p.costPrice,
      p.price,
      p.stock,
      p.lowStockThreshold
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `kadi_pos_inventory_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getUnitName = (u?: string) => {
    switch (u) {
      case 'kg':
        return t.unit_kg;
      case 'gram':
        return t.unit_gram;
      case 'liter':
        return t.unit_liter;
      case 'box':
        return t.unit_box;
      default:
        return t.unit_piece;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto lg:overflow-hidden bg-slate-50 dark:bg-slate-950 p-3 sm:p-6">
      {productToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-emerald-600 text-white rounded-xl shadow-xl text-xs font-extrabold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <span>{productToast}</span>
        </div>
      )}

      {/* Always-Visible Top Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3 sm:mb-4 shrink-0">
        <div>
          <h2 className="text-base sm:text-xl font-black text-slate-900 dark:text-white">
            {isAr ? 'إدارة المخزون والسلع والأصناف' : isFr ? 'Inventaire, Produits & Catégories' : 'Inventory, Products & Categories'}
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {isAr ? 'إضافة السلع والأصناف ومراقبة الرصيد وحركات التوريد' : 'Add items, organize categories, and track stock movements'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0 px-3.5 py-2 text-xs font-extrabold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center justify-center gap-1.5 shadow-xs whitespace-nowrap"
          >
            <PackagePlus className="w-4 h-4 shrink-0" />
            <span>{isAr ? '+ إضافة سلعة' : t.add_product}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCategoryModalTab('create');
              setShowAddCategoryModal(true);
            }}
            className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0 px-3.5 py-2 text-xs font-extrabold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center justify-center gap-1.5 shadow-xs whitespace-nowrap"
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span>{isAr ? '+ إضافة صنف' : '+ Add Category'}</span>
          </button>
        </div>
      </div>

      {/* Top Banner KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3.5 mb-4 sm:mb-6 shrink-0">
        <div className="p-4 rounded-2xl bg-indigo-50/75 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/70 shadow-2xs">
          <div className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
            {isAr ? 'قيمة المخزون (سعر التكلفة)' : 'Stock Cost Value'}
          </div>
          <div className="text-xl font-black text-indigo-950 dark:text-white mt-1 tabular-nums">
            {inventoryMetrics.totalCostVal.toFixed(2)} {currencySymbol}
          </div>
          <div className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80 mt-1">
            {inventoryMetrics.totalProducts} {isAr ? 'صنف مختلف' : 'distinct products'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-blue-50/75 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/70 shadow-2xs">
          <div className="text-xs font-bold text-blue-700 dark:text-blue-300">
            {isAr ? 'القيمة البيعية للمخزون' : 'Retail Stock Value'}
          </div>
          <div className="text-xl font-black text-blue-950 dark:text-white mt-1 tabular-nums">
            {inventoryMetrics.totalRetailVal.toFixed(2)} {currencySymbol}
          </div>
          <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold mt-1">
            +{inventoryMetrics.expectedGrossProfit.toFixed(2)} {currencySymbol} {t.profit}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800/70 shadow-2xs">
          <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
            {isAr ? 'متوسط نسبة هامش الربح' : 'Avg Profit Margin'}
          </div>
          <div className="text-xl font-black text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums">
            {inventoryMetrics.avgMarginPercent}%
          </div>
          <div className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 mt-1">
            {isAr ? 'عائد الربح على المبيعات' : 'Return on sales'}
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border shadow-2xs ${
            inventoryMetrics.lowStockCount > 0
              ? 'bg-amber-50/80 dark:bg-amber-950/35 border-amber-200 dark:border-amber-800/70'
              : 'bg-emerald-50/60 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-800/70'
          }`}
        >
          <div
            className={`text-xs font-bold ${
              inventoryMetrics.lowStockCount > 0
                ? 'text-amber-800 dark:text-amber-300'
                : 'text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {isAr ? 'تنبيهات انخفاض المخزون' : 'Low Stock Alerts'}
          </div>
          <div
            className={`text-xl font-black mt-1 tabular-nums ${
              inventoryMetrics.lowStockCount > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {inventoryMetrics.lowStockCount}
          </div>
          <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 flex items-center justify-between gap-2">
            <span>
              {inventoryMetrics.lowStockCount > 0 ? (isAr ? 'أصناف تحتاج إعادة طلب' : 'Reorder needed') : (isAr ? 'المخزون متوازن' : 'Stock healthy')}
            </span>
            {inventoryMetrics.outOfStockCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('catalog');
                  setOnlyOutOfStock((prev) => !prev);
                  setOnlyLowStock(false);
                  setOnlyStagnant(false);
                }}
                className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black hover:bg-red-700 transition-colors"
                title={isAr ? 'اضغط لعرض المنتجات النافدة (0)' : 'Show out-of-stock (0)'}
              >
                {isAr ? `${inventoryMetrics.outOfStockCount} نفذت (0)` : `${inventoryMetrics.outOfStockCount} out (0)`}
              </button>
            )}
          </div>
        </div>

        <div
          onClick={() => setOnlyExpiring(!onlyExpiring)}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs ${
            onlyExpiring
              ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 ring-2 ring-rose-400'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-300'
          }`}
          title={isAr ? 'انقر لتصفية المنتجات قريبة الصلاحية' : 'Click to filter expiring products'}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'تنبيهات تاريخ الصلاحية' : 'Expiry Alerts'}
            </span>
            <Calendar className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1 tabular-nums">
            {expiringSoonProducts.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {expiringSoonProducts.length > 0
              ? (isAr ? 'أصناف قريبة أو منتهية الصلاحية' : 'Expiring within 30 days')
              : (isAr ? 'جميع التواريخ صالحة' : 'All dates healthy')}
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 min-h-[480px] lg:min-h-0 flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Navigation Tabs & Actions Toolbar */}
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          {/* Segmented Control (Tabs) */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto max-w-full">
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
                activeTab === 'catalog'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>{t.catalog_tab}</span>
            </button>
            <button
              onClick={() => setActiveTab('stocktake')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
                activeTab === 'stocktake'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
              }`}
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>{isAr ? 'جرد المخزون الحقيقي' : 'Stocktake'}</span>
            </button>
            <button
              onClick={() => setActiveTab('movements')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
                activeTab === 'movements'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <History className="w-4 h-4" />
              <span>{t.movements_tab}</span>
              <span className="px-1.5 py-0.2 text-[10px] bg-emerald-600 text-white rounded-full">
                {stockMovements.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('ai_prediction')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
                activeTab === 'ai_prediction'
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Brain className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>{isAr ? 'التخطيط الذكي وقائمة الشراء' : 'Smart Planning & PO'}</span>
              {aiPredictions.filter((r) => r.needsReorder).length > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] bg-rose-600 text-white rounded-full font-black font-mono tabular-nums">
                  {aiPredictions.filter((r) => r.needsReorder).length}
                </span>
              )}
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Open Dedicated Phone Invoice OCR View */}
            <button
              type="button"
              onClick={() => setCurrentTab('invoice_ocr')}
              className="px-4 py-2 text-xs font-black rounded-xl bg-teal-600 hover:bg-teal-700 text-white transition-colors flex items-center gap-1.5 shadow-xs shrink-0 whitespace-nowrap"
              title={
                isAr
                  ? 'إدخال صورة الفاتورة من الهاتف أو الألبوم وقراءتها مباشرة'
                  : 'Upload or snap invoice photo from phone (OCR)'
              }
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>{isAr ? 'فاتورة من الهاتف (OCR)' : 'Phone Invoice OCR'}</span>
            </button>

            {/* Scan Purchase Invoice via Phone Camera (تصوير فاتورة الشراء) */}
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(new CustomEvent('kadi:open-purchase-invoice-scanner'))
              }
              className="px-4 py-2 text-xs font-black rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 transition-colors flex items-center gap-1.5 shadow-xs shrink-0 whitespace-nowrap"
              title={
                isAr
                  ? 'صور فاتورة الشراء بالهاتف (رسمية ICE للأرشيف أو نوار للمخزون فقط)'
                  : 'Scan purchase invoice photo (Official ICE or Stock-Only)'
              }
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{isAr ? 'تصوير فاتورة شراء' : 'Scan Purchase Invoice'}</span>
            </button>

            {/* Manual Invoice Entry & Save (إدخال معلومات الفاتورة وتسجيلها يدوياً) */}
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('kadi:open-purchase-invoice-scanner', {
                    detail: { defaultMode: 'official_ice', manualEntry: true }
                  })
                )
              }
              className="px-4 py-2 text-xs font-black rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center gap-1.5 shadow-xs shrink-0 whitespace-nowrap"
              title={
                isAr
                  ? 'إدخال معلومات الفاتورة والمورد والسلع وتسجيلها يدوياً'
                  : 'Enter & save purchase invoice details manually'
              }
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{isAr ? 'إدخال فاتورة وتسجيلها' : 'Enter & Save Invoice'}</span>
            </button>

            {/* Add Product (إضافة منتوج) */}
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 shadow-xs shrink-0"
              title={isAr ? 'إضافة سلعة جديدة بالاسم والباركود والمخزون' : 'Add new item'}
            >
              <PackagePlus className="w-3.5 h-3.5" />
              <span>{isAr ? '+ إضافة سلعة' : t.add_product}</span>
            </button>

            {/* Categories Management (إدارة وإلغاء الأصناف) */}
            <button
              onClick={() => {
                setCategoryModalTab('create');
                setShowAddCategoryModal(true);
              }}
              className="px-3.5 py-2 text-xs font-bold rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 transition-colors flex items-center gap-1.5 shadow-2xs shrink-0 whitespace-nowrap"
              title={isAr ? 'إضافة صنف جديد أو إدارة وإلغاء الأصناف' : 'Manage & Add Categories'}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{isAr ? '+ إضافة وإدارة الأصناف' : '+ Add / Manage Categories'}</span>
            </button>

            <button
              onClick={() => setShowSeedDemoConfirm(true)}
              className="px-3 py-2 text-xs font-bold rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-100 transition-colors flex items-center gap-1.5 shadow-2xs"
              title={isAr ? 'توليد واختبار أكثر من 2000 منتج مغربي فوراً' : 'Generate 2,000+ products demo'}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              <span>{isAr ? '+2000 صنف' : '+2000 Items'}</span>
            </button>

            <button
              onClick={() => setShowImportModal(true)}
              className="px-3 py-2 text-xs font-bold rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-400 transition-colors flex items-center gap-1.5 shadow-2xs"
              title={isAr ? 'استيراد آلاف المنتجات من ملف إكسل أو CSV' : 'Import products from Excel / CSV'}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isAr ? 'استيراد إكسل / CSV' : 'Import Excel / CSV'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const filename = exportInventoryToExcel(products, categories, currencySymbol, language);
                setProductToast(isAr ? `📊 تم تصدير المخزون إكسل: ${filename}` : `📊 Exported Excel: ${filename}`);
                setTimeout(() => setProductToast(null), 3500);
              }}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{isAr ? 'تصدير إكسل' : 'Excel'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const filename = exportInventoryToPdf({
                  products,
                  settings,
                  currencySymbol,
                  language
                });
                setProductToast(isAr ? `📄 تم تصدير جرد المخزون PDF: ${filename}` : `📄 Exported PDF: ${filename}`);
                setTimeout(() => setProductToast(null), 3500);
              }}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 text-blue-700 dark:text-blue-300 transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{isAr ? 'تصدير PDF' : 'PDF'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setLabelPrintInitialProducts(undefined);
                setShowLabelPrintModal(true);
              }}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 transition-colors flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
              title={isAr ? 'طباعة ملصقات الأسعار والباركود للرفوف (A4 أو 80mm/58mm)' : 'Print Shelf Price & Barcode Labels'}
            >
              <Barcode className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{isAr ? 'ملصقات الباركود' : 'Shelf Labels'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCatalogGmailModal(true)}
              className="px-3 py-2 text-xs font-black rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-700 dark:text-rose-300 transition-colors flex items-center gap-1.5 shadow-2xs"
              title={isAr ? 'تسجيل السلع وصورها وثمنها في ملف وإرساله إلى Gmail' : 'Export catalog with images & prices to Gmail'}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>{isAr ? 'ملف السلع والصور ➔ Gmail' : 'Catalog + Photos ➔ Gmail'}</span>
            </button>

            <button
              onClick={exportCsv}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isAr ? 'تصدير CSV' : 'Export CSV'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                exportDatabaseJson();
                setProductToast(isAr ? '💾 تم تحميل النسخة الاحتياطية JSON بنجاح' : '💾 JSON backup downloaded');
                setTimeout(() => setProductToast(null), 3200);
              }}
              className="px-3 py-2 text-xs font-black rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 transition-colors flex items-center gap-1.5 shadow-2xs shrink-0"
              title={isAr ? 'تحميل نسخة احتياطية كاملة لجميع البيانات والسلع' : 'Download full JSON backup'}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isAr ? 'تحميل نسخة احتياطية' : 'Download Backup'}</span>
            </button>

            {selectedProductIds.size > 0 && (
              <button
                onClick={() => setShowBulkModal(true)}
                className="px-3.5 py-2 text-xs font-bold rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 transition-all flex items-center gap-1.5 shadow-xs"
                title={isAr ? `تعديل جماعي لـ ${selectedProductIds.size} منتج محدد` : `Bulk edit ${selectedProductIds.size} items`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>{isAr ? `تعديل جماعي (${selectedProductIds.size})` : `Bulk Edit (${selectedProductIds.size})`}</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab 1.5: Physical Stocktake Panel */}
        {activeTab === 'stocktake' && <StocktakePanel />}

        {/* Tab 1: Product Catalog Table */}
        {activeTab === 'catalog' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Filter toolbar */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 bg-slate-50/50 dark:bg-slate-900/50">
              {/* Search + Camera Barcode Scanner */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute right-3 rtl:right-3 rtl:left-auto left-3 rtl:right-auto top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.search_placeholder}
                  className="w-full py-2 ps-9 pe-10 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
                <button
                  type="button"
                  onClick={() => setShowBarcodeScanner(true)}
                  className="absolute end-2 top-1/2 -translate-y-1/2 p-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 transition-colors"
                  title={isAr ? 'البحث بالباركود عبر الكاميرا' : 'Search by camera barcode'}
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowBarcodeScanner(true)}
                className="py-2 px-3 text-xs font-bold rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white border border-slate-700/60 transition-colors flex items-center gap-1.5 shrink-0"
                title={isAr ? 'فتح الماسح الضوئي بالكاميرا للبحث في المخزون' : 'Scan Barcode with Camera'}
              >
                <ScanLine className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isAr ? 'ماسح الكاميرا' : 'Camera Scan'}</span>
              </button>

              {/* Category filter */}
              <select
                value={selectedCat}
                onChange={(e) => setSelectedCat(e.target.value)}
                className="py-2 px-3 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300"
              >
                <option value="all">{t.all_categories}</option>
                {categories.filter((c) => c.id !== 'cat-all').map((c) => (
                  <option key={c.id} value={c.id}>
                    {isAr ? c.name : c.nameEn}
                  </option>
                ))}
              </select>

              {/* Unit Type filter: حبة، كيلو، لتر */}
              <select
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                className="py-2 px-3 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300"
              >
                <option value="all">{isAr ? 'جميع الوحدات' : 'All Units'}</option>
                <option value="piece">{t.unit_piece}</option>
                <option value="kg">{t.unit_kg}</option>
                <option value="gram">{t.unit_gram}</option>
                <option value="liter">{t.unit_liter}</option>
                <option value="box">{t.unit_box}</option>
              </select>

              {/* Only Low Stock Toggle */}
              <button
                type="button"
                onClick={() => {
                  const next = !onlyLowStock;
                  setOnlyLowStock(next);
                  if (next) setOnlyOutOfStock(false);
                }}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-colors flex items-center gap-1.5 ${
                  onlyLowStock
                    ? 'bg-amber-500 border-amber-500 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{isAr ? 'المخزون المنخفض فقط' : 'Low stock only'}</span>
              </button>

              {/* Only Out of Stock (Quantity = 0) Toggle for Restocking */}
              <button
                type="button"
                onClick={() => {
                  const next = !onlyOutOfStock;
                  setOnlyOutOfStock(next);
                  if (next) {
                    setOnlyLowStock(false);
                    setOnlyStagnant(false);
                  }
                }}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-colors flex items-center gap-1.5 ${
                  onlyOutOfStock
                    ? 'bg-red-600 border-red-600 text-white shadow-2xs'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-red-300'
                }`}
                title={
                  isAr
                    ? 'عرض المنتجات التي نفذت تماماً (الكمية = 0) لتسهيل إعادة الطلب'
                    : 'Show completely out-of-stock products (Quantity = 0) for restocking'
                }
              >
                <PackageX className="w-3.5 h-3.5" />
                <span>{isAr ? 'نفذت تماماً (0)' : isFr ? 'Rupture totale (0)' : 'Out of stock (0)'}</span>
                {inventoryMetrics.outOfStockCount > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-black tabular-nums ${
                      onlyOutOfStock
                        ? 'bg-white text-red-600'
                        : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                    }`}
                  >
                    {inventoryMetrics.outOfStockCount}
                  </span>
                )}
              </button>

              {/* Only Expiring Toggle */}
              <button
                type="button"
                onClick={() => setOnlyExpiring(!onlyExpiring)}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-colors flex items-center gap-1.5 ${
                  onlyExpiring
                    ? 'bg-rose-500 border-rose-500 text-white shadow-2xs'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>{isAr ? 'قريبة الصلاحية' : 'Expiring soon'}</span>
                {expiringSoonProducts.length > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${onlyExpiring ? 'bg-white text-rose-600' : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'}`}>
                    {expiringSoonProducts.length}
                  </span>
                )}
              </button>

              {/* Stagnant Products (+30 days unsold) Toggle */}
              <button
                type="button"
                onClick={() => {
                  const next = !onlyStagnant;
                  setOnlyStagnant(next);
                  if (next) setOnlyOutOfStock(false);
                }}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-colors flex items-center gap-1.5 ${
                  onlyStagnant
                    ? 'bg-violet-600 border-violet-600 text-white shadow-2xs'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
                title={isAr ? 'السلع المتوفرة في المخزون ولم تُبع منذ 30 يوماً' : 'Products in stock with 0 sales in last 30 days'}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{isAr ? 'سلع راكدة +30 يوم' : 'Stagnant +30d'}</span>
                {stagnantProductIds.size > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${onlyStagnant ? 'bg-white text-violet-700' : 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300'}`}>
                    {stagnantProductIds.size}
                  </span>
                )}
              </button>

              {/* Sort selector dropdown for managers */}
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs shadow-2xs">
                <ArrowUpDown className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-slate-500 dark:text-slate-400 font-semibold shrink-0 hidden sm:inline">
                  {isAr ? 'الترتيب:' : 'Sort:'}
                </span>
                <select
                  value={`${sortField}_${sortOrder}`}
                  onChange={(e) => {
                    const [field, order] = e.target.value.split('_') as [SortField, SortOrder];
                    setSortField(field);
                    setSortOrder(order);
                  }}
                  className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value="stock_asc">{isAr ? 'المخزون: من الأقل للأعلى (نواقص)' : 'Stock: Low to High'}</option>
                  <option value="stock_desc">{isAr ? 'المخزون: من الأعلى للأقل (فائض)' : 'Stock: High to Low'}</option>
                  <option value="name_asc">{isAr ? 'الاسم: أ - ي (أبجدي)' : 'Name: A to Z'}</option>
                  <option value="name_desc">{isAr ? 'الاسم: ي - أ (تنازلي)' : 'Name: Z to A'}</option>
                  <option value="price_asc">{isAr ? 'سعر البيع: من الأقل للأعلى' : 'Price: Low to High'}</option>
                  <option value="price_desc">{isAr ? 'سعر البيع: من الأعلى للأقل' : 'Price: High to Low'}</option>
                  <option value="costPrice_desc">{isAr ? 'سعر التكلفة: الأعلى تكلفة' : 'Cost: High to Low'}</option>
                  <option value="margin_desc">{isAr ? 'هامش الربح: الأعلى ربحية' : 'Margin: High to Low'}</option>
                </select>
              </div>
            </div>

            {/* Bulk Selection Summary Bar */}
            {selectedProductIds.size > 0 && (
              <div className="mx-4 my-2.5 p-3 bg-slate-900 text-white dark:bg-slate-800 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3 border border-slate-700/80 animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-xs">
                    {selectedProductIds.size}
                  </div>
                  <div>
                    <span className="text-xs font-bold block">
                      {isAr
                        ? `تم تحديد ${selectedProductIds.size} منتج للعمليات الجماعية`
                        : `${selectedProductIds.size} products selected for bulk actions`}
                    </span>
                    {selectedProductIds.size < filteredProducts.length && (
                      <button
                        type="button"
                        onClick={selectAllFiltered}
                        className="text-[11px] font-semibold text-emerald-400 hover:underline"
                      >
                        {isAr
                          ? `تحديد كافة نتائج التصفية (${filteredProducts.length} منتج)`
                          : `Select all filtered (${filteredProducts.length} items)`}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="px-3 py-1.5 text-xs font-bold text-slate-300 hover:text-white transition-colors"
                  >
                    {isAr ? 'إلغاء التحديد' : 'Deselect All'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLabelPrintInitialProducts(selectedProductsList);
                      setShowLabelPrintModal(true);
                    }}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-slate-700 hover:bg-slate-600 text-white transition-colors shadow-sm flex items-center gap-1.5"
                  >
                    <Barcode className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{isAr ? `طباعة ملصقات (${selectedProductIds.size})` : `Print Labels (${selectedProductIds.size})`}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBulkModal(true)}
                    className="px-4 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm flex items-center gap-1.5"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>{isAr ? 'تعديل جماعي للأسعار والمخزون' : 'Bulk Edit Prices & Stock'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left rtl:text-right border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800/80 backdrop-blur-xs text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllPageSelected}
                        onChange={toggleSelectPage}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                        title={isAr ? 'تحديد كل الصفحة' : 'Select all on page'}
                      />
                    </th>
                    <th
                      onClick={() => handleSortClick('name')}
                      className="py-3 px-4 cursor-pointer select-none group hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                      title={isAr ? 'انقر للترتيب حسب اسم المنتج' : 'Click to sort by product name'}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{t.product_name}</span>
                        {renderSortIndicator('name')}
                      </div>
                    </th>
                    <th className="py-3 px-3">{t.unit_type}</th>
                    <th
                      onClick={() => handleSortClick('costPrice')}
                      className="py-3 px-3 font-mono cursor-pointer select-none group hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                      title={isAr ? 'انقر للترتيب حسب سعر التكلفة' : 'Click to sort by cost price'}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{t.cost}</span>
                        {renderSortIndicator('costPrice')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSortClick('price')}
                      className="py-3 px-3 font-mono cursor-pointer select-none group hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                      title={isAr ? 'انقر للترتيب حسب سعر البيع' : 'Click to sort by price'}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{t.price}</span>
                        {renderSortIndicator('price')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSortClick('margin')}
                      className="py-3 px-3 cursor-pointer select-none group hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                      title={isAr ? 'انقر للترتيب حسب هامش الربح' : 'Click to sort by profit margin'}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{t.profit_margin}</span>
                        {renderSortIndicator('margin')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSortClick('stock')}
                      className="py-3 px-3 cursor-pointer select-none group hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                      title={isAr ? 'انقر للترتيب حسب مستوى المخزون (نواقص وفائض)' : 'Click to sort by stock level'}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{t.stock_qty}</span>
                        {renderSortIndicator('stock')}
                      </div>
                    </th>
                    <th className="py-3 px-3">{isAr ? 'تاريخ الصلاحية' : 'Expiry Date'}</th>
                    <th className="py-3 px-4 text-center">{t.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-900 dark:text-slate-100">
                  {paginatedProducts.map((p) => {
                    const unitProfit = p.price - p.costPrice;
                    const marginPercent = p.price > 0 ? ((unitProfit / p.price) * 100).toFixed(1) : '0';
                    const isBelowFive = p.stock > 0 && p.stock < 5;
                    const isLow = p.stock > 0 && (isBelowFive || p.stock <= p.lowStockThreshold);
                    const isOut = p.stock <= 0;
                    const isSelected = selectedProductIds.has(p.id);

                    let expiryBadge = null;
                    if (p.expiryDate) {
                      const exp = new Date(p.expiryDate);
                      if (!isNaN(exp.getTime())) {
                        const todayTime = new Date().setHours(0, 0, 0, 0);
                        const expTime = exp.setHours(0, 0, 0, 0);
                        const diffDays = Math.round((expTime - todayTime) / (1000 * 60 * 60 * 24));
                        if (diffDays < 0) {
                          expiryBadge = (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300 dark:border-rose-800" title={p.expiryDate}>
                              <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                              <span>{isAr ? 'منتهي الصلاحية' : 'Expired'}</span>
                            </span>
                          );
                        } else if (diffDays <= 30) {
                          expiryBadge = (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800 animate-pulse" title={p.expiryDate}>
                              <Calendar className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>{isAr ? `ينتهي خلال ${diffDays} يوم` : `${diffDays}d left`}</span>
                            </span>
                          );
                        } else {
                          expiryBadge = (
                            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              {p.expiryDate}
                            </span>
                          );
                        }
                      }
                    }

                    const isHighlighted = highlightedProductId === p.id;
                    return (
                      <tr
                        key={p.id}
                        className={`transition-colors ${
                          isHighlighted
                            ? 'bg-emerald-100/90 dark:bg-emerald-950/70 ring-2 ring-inset ring-emerald-500'
                            : isSelected
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/40'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectProduct(p.id)}
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div
                            onClick={() => setEditingProduct(p)}
                            className="flex items-center gap-3 cursor-pointer group/item"
                            title={isAr ? 'انقر لتعديل بيانات المنتج' : 'Click to edit product'}
                          >
                            {p.image ? (
                              <img
                                src={p.image}
                                alt={p.name}
                                referrerPolicy="no-referrer"
                                className="w-10 h-10 object-cover rounded-xl border border-slate-200 dark:border-slate-700 shrink-0 group-hover/item:border-emerald-500 transition-colors"
                              />
                            ) : (
                              <div
                                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shrink-0 text-xs group-hover/item:ring-2 ring-emerald-500 transition-all"
                                style={{ backgroundColor: p.color || '#059669' }}
                              >
                                {p.name.slice(0, 2)}
                              </div>
                            )}
                            <div>
                              <div className="font-bold text-slate-900 dark:text-white group-hover/item:text-emerald-600 dark:group-hover/item:text-emerald-400 transition-colors flex flex-wrap items-center gap-1.5">
                                <span>{isAr ? p.name : p.nameEn}</span>
                                <Pencil className="w-3 h-3 text-slate-400 opacity-0 group-hover/item:opacity-100 transition-opacity" />
                                {stagnantProductIds.has(p.id) && (
                                  <span className="px-1.5 py-0.2 rounded-md text-[10px] font-black bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                                    {isAr ? 'راكد +30 يوم' : 'Stagnant +30d'}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                SKU: {p.sku} · {p.barcode}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300">
                            {getUnitName(p.unitType)}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                          {p.costPrice.toFixed(2)} {currencySymbol}
                        </td>
                        <td className="py-3 px-3 font-mono font-extrabold tabular-nums text-slate-900 dark:text-white">
                          {p.price.toFixed(2)} {currencySymbol}
                        </td>
                        <td className="py-3 px-3">
                          {(() => {
                            const marginNum = Number(marginPercent);
                            const profitColor =
                              unitProfit < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : marginNum < 15
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400';
                            return (
                              <div>
                                <span className={`font-extrabold tabular-nums ${profitColor}`}>
                                  {unitProfit >= 0 ? '+' : ''}
                                  {marginPercent}%
                                </span>
                                <div className={`text-[10px] font-semibold tabular-nums ${profitColor}`}>
                                  {unitProfit >= 0 ? '+' : ''}
                                  {unitProfit.toFixed(2)} {currencySymbol}
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`px-2.5 py-1 text-xs font-bold rounded-lg tabular-nums ${
                                isOut
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                                  : isLow
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                              }`}
                            >
                              {p.stock} {getUnitName(p.unitType)}
                            </span>
                            {p.stock < 5 && (
                              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-rose-600 text-white">
                                {isAr ? 'قل من 5!' : '< 5!'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          {expiryBadge || <span className="text-slate-300 dark:text-slate-600">-</span>}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingProduct(p)}
                              className="p-1.5 text-slate-600 hover:text-emerald-600 dark:text-slate-300 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded-lg transition-colors"
                              title={isAr ? 'تعديل بيانات المنتج (الاسم، السعر، الفئة، الصورة، الباركود)' : 'Edit Product'}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setLabelPrintInitialProducts([p]);
                                setShowLabelPrintModal(true);
                              }}
                              className="p-1.5 text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-lg transition-colors"
                              title={isAr ? 'طباعة ملصق الثمن والباركود' : 'Print Shelf Label'}
                            >
                              <Barcode className="w-3.5 h-3.5" />
                            </button>
                            {p.unitType === 'box' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setUnpackModalProduct(p);
                                  setUnpackBoxesCount('1');
                                  setUnpackChildId(p.boxChildProductId || '');
                                  setUnpackUnitsPerBox(String(p.unitsPerBox || 24));
                                }}
                                className="px-2 py-1 text-[11px] font-black rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 hover:bg-amber-100 border border-amber-200 dark:border-amber-800/70 transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                                title={isAr ? 'فك الكرتون / الصندوق وتحويله إلى وحدات بيع' : 'Unpack Box to Pieces'}
                              >
                                <PackageOpen className="w-3 h-3" />
                                <span>{isAr ? 'فك كرتون' : 'Unpack'}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                adjustStock(p.id, 10, isAr ? 'توريد سريع (+10)' : 'Quick restock (+10)', 'restock');
                                setProductToast(isAr ? `✅ تزادت +10 لـ "${p.name}"` : `✅ Added +10 to "${p.name}"`);
                                setTimeout(() => setProductToast(null), 2200);
                              }}
                              className="px-2 py-1 text-[11px] font-black rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 hover:bg-sky-100 transition-colors"
                              title={isAr ? 'زيادة سريعة +10 للمخزون' : 'Quick +10 stock'}
                            >
                              +10
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                adjustStock(p.id, 50, isAr ? 'توريد سريع (+50)' : 'Quick restock (+50)', 'restock');
                                setProductToast(isAr ? `✅ تزادت +50 لـ "${p.name}"` : `✅ Added +50 to "${p.name}"`);
                                setTimeout(() => setProductToast(null), 2200);
                              }}
                              className="px-2 py-1 text-[11px] font-black rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition-colors"
                              title={isAr ? 'زيادة سريعة +50 للمخزون' : 'Quick +50 stock'}
                            >
                              +50
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProductForAdjust(p);
                                setShowAdjustModal(true);
                              }}
                              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 transition-colors"
                              title={t.adjust_stock}
                            >
                              {isAr ? 'تعديل / توريد' : 'Adjust'}
                            </button>
                            {stagnantProductIds.has(p.id) && (
                              <button
                                type="button"
                                onClick={() => setCurrentTab('remote_sales')}
                                className="px-2 py-1 text-[11px] font-bold rounded-lg bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 hover:bg-violet-100 transition-colors inline-flex items-center gap-1"
                                title={isAr ? 'ترويج المنتج الراكد في صحيفة العروض والبيع عن بعد' : 'Promote in Remote Sales Flyer'}
                              >
                                <Send className="w-3 h-3" />
                                <span>{isAr ? 'ترويج' : 'Promote'}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => deleteProduct(p.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                              title={isAr ? 'حذف' : 'Delete'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Footer for 2,000+ products */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between text-xs font-semibold">
              <div className="text-slate-500 dark:text-slate-400">
                {isAr
                  ? `يُعرض ${(tablePage - 1) * pageSize + 1} - ${Math.min(tablePage * pageSize, filteredProducts.length)} من إجمالي ${filteredProducts.length} منتج`
                  : `Showing ${(tablePage - 1) * pageSize + 1} - ${Math.min(tablePage * pageSize, filteredProducts.length)} of ${filteredProducts.length} items`}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                    disabled={tablePage === 1}
                    className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-100 text-slate-700 dark:text-slate-300 font-bold"
                  >
                    {isAr ? '← السابق' : '← Prev'}
                  </button>

                  <span className="px-2 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {tablePage} / {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
                    disabled={tablePage === totalPages}
                    className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-100 text-slate-700 dark:text-slate-300 font-bold"
                  >
                    {isAr ? 'التالي →' : 'Next →'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Stock Movement Audit Log */}
        {activeTab === 'movements' && (
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left rtl:text-right border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800/80 backdrop-blur-xs text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-3 px-4">{t.date_time}</th>
                  <th className="py-3 px-4">{t.product_name}</th>
                  <th className="py-3 px-3">{t.movement_type}</th>
                  <th className="py-3 px-3">{t.quantity_changed}</th>
                  <th className="py-3 px-3">{t.new_balance}</th>
                  <th className="py-3 px-4">{t.reason}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-900 dark:text-slate-100 font-medium">
                {stockMovements.map((mov) => {
                  const isPositive = mov.quantityChange > 0;
                  return (
                    <tr key={mov.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                        {new Date(mov.date).toLocaleDateString()} {new Date(mov.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        {mov.productName}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            mov.type === 'sale'
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                              : mov.type === 'restock'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                          }`}
                        >
                          {mov.type === 'sale'
                            ? t.movement_sale
                            : mov.type === 'restock'
                            ? t.movement_restock
                            : mov.type === 'waste'
                            ? t.movement_waste
                            : t.movement_audit}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold tabular-nums">
                        <span className={isPositive ? 'text-emerald-600' : 'text-rose-600'}>
                          {isPositive ? `+${mov.quantityChange}` : mov.quantityChange} {getUnitName(mov.unit)}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {mov.newStock} {getUnitName(mov.unit)}
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {mov.reason || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Smart Inventory Planning (30d Velocity + ROP + Auto Purchase List by Supplier) */}
        {activeTab === 'ai_prediction' && (() => {
          const buildPoLines = (subset: typeof aiPredictions): ReplenishmentOrderLine[] =>
            subset
              .filter((r) => r.recommendedQty > 0)
              .map((r) => ({
                productId: r.product.id,
                productName: isAr ? r.product.name : r.product.nameEn || r.product.name,
                sku: r.product.sku,
                currentStock: r.product.stock,
                dailyVelocity: r.dailyVelocity,
                daysLeft: r.daysToZero,
                recommendedQty: r.recommendedQty,
                unitCost: r.product.costPrice,
                estimatedTotal: r.estimatedCost,
                unitType: getUnitName(r.product.unitType)
              }));

          const reorderItems = aiPredictions.filter((r) => r.needsReorder && r.recommendedQty > 0);
          const selectedRows =
            selectedPoIds.size > 0
              ? aiPredictions.filter((r) => selectedPoIds.has(r.product.id))
              : reorderItems;
          const poLines = buildPoLines(selectedRows);
          const totalPoBudget = poLines.reduce((s, l) => s + l.estimatedTotal, 0);
          const urgentCount = aiPredictions.filter((r) => r.urgency === 'critical').length;
          const needsReorderCount = reorderItems.length;

          // Group items near stockout (stock <= reorderPoint) automatically by supplier
          const supplierGroupsMap = new Map<
            string,
            {
              supplierName: string;
              supplierPhone?: string;
              supplierSource: 'invoice' | 'category';
              items: typeof aiPredictions;
              totalUnits: number;
              estimatedCost: number;
              criticalCount: number;
            }
          >();

          reorderItems.forEach((row) => {
            const key = row.supplierName;
            const existing = supplierGroupsMap.get(key);
            if (!existing) {
              supplierGroupsMap.set(key, {
                supplierName: row.supplierName,
                supplierPhone: row.supplierPhone,
                supplierSource: row.supplierSource,
                items: [row],
                totalUnits: row.recommendedQty,
                estimatedCost: row.estimatedCost,
                criticalCount: row.urgency === 'critical' ? 1 : 0
              });
            } else {
              existing.items.push(row);
              existing.totalUnits += row.recommendedQty;
              existing.estimatedCost = Number((existing.estimatedCost + row.estimatedCost).toFixed(2));
              if (row.urgency === 'critical') existing.criticalCount += 1;
              if (!existing.supplierPhone && row.supplierPhone) {
                existing.supplierPhone = row.supplierPhone;
              }
            }
          });

          const supplierGroups = Array.from(supplierGroupsMap.values()).sort((a, b) => {
            if (b.criticalCount !== a.criticalCount) return b.criticalCount - a.criticalCount;
            return b.estimatedCost - a.estimatedCost;
          });

          const displayedTableRows = onlyNeedsReorder
            ? aiPredictions.filter((r) => r.needsReorder)
            : aiPredictions;

          const copySupplierPo = async (group: (typeof supplierGroups)[number]) => {
            const linesText = [
              `📦 ${isAr ? 'طلبية شراء تلقائية للمورد' : 'Auto Purchase Order'}: ${group.supplierName}`,
              `${isAr ? 'التاريخ' : 'Date'}: ${new Date().toLocaleDateString(isAr ? 'ar-MA' : 'en-US')}`,
              '------------------------',
              ...group.items.map(
                (it, i) =>
                  `${i + 1}. ${it.product.name} — ${isAr ? 'الطلب' : 'Qty'}: ${it.recommendedQty} ${getUnitName(it.product.unitType)} (${isAr ? 'الباقي' : 'Stock'}: ${it.product.stock} | ROP: ${it.reorderPoint})`
              ),
              '------------------------',
              `${isAr ? 'التكلفة التقديرية' : 'Est. Total'}: ${group.estimatedCost.toFixed(2)} ${currencySymbol}`
            ].join('\n');
            try {
              await navigator.clipboard.writeText(linesText);
              setCopiedSupplierKey(group.supplierName);
              setTimeout(() => setCopiedSupplierKey(null), 2500);
            } catch {
              // ignore clipboard errors
            }
          };

          return (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Top Smart Planning Toolbar */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-indigo-50/40 dark:bg-indigo-950/20 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                    <Brain className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                      {isAr
                        ? 'التخطيط الذكي للمخزون — معدل بيع آخر 30 يوم ونقطة إعادة الطلب (ROP)'
                        : 'Smart Inventory Planning — 30-Day Velocity & Reorder Points'}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      {isAr
                        ? `${needsReorderCount} سلع وصلت لنقطة إعادة الطلب (${urgentCount} حرجة) موزعة على ${supplierGroups.length} موردين · التكلفة التقديرية: ${totalPoBudget.toFixed(2)} ${currencySymbol}`
                        : `${needsReorderCount} items at/below ROP (${urgentCount} critical) across ${supplierGroups.length} suppliers · Est. PO: ${totalPoBudget.toFixed(2)} ${currencySymbol}`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* View Switcher: Auto Purchase List by Supplier vs Full 30d Velocity Table */}
                  <div className="inline-flex bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setAiSubView('supplier_po')}
                      className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-colors ${
                        aiSubView === 'supplier_po'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <Truck className="w-3.5 h-3.5" />
                      <span>{isAr ? `قائمة الشراء حسب المورد (${supplierGroups.length})` : `By Supplier (${supplierGroups.length})`}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiSubView('forecast_table')}
                      className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-colors ${
                        aiSubView === 'forecast_table'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>{isAr ? 'معدل 30 يوم ونقطة إعادة الطلب' : '30d Rate & ROP Table'}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1 text-xs font-bold">
                    <span className="text-slate-500">{isAr ? 'تغطية لـ:' : 'Cover:'}</span>
                    {[7, 14, 30].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setPoTargetDays(d)}
                        className={`px-2 py-0.5 rounded-lg font-mono ${
                          poTargetDays === d
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {d} {isAr ? 'ي' : 'd'}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={poLines.length === 0}
                    onClick={() => {
                      const fname = exportReplenishmentPoToPdf({
                        lines: poLines,
                        settings,
                        currencySymbol,
                        language
                      });
                      setProductToast(
                        isAr
                          ? `🧾 تم توليد أمر الشراء التعويضي PDF: ${fname}`
                          : `🧾 Generated Replenishment PO PDF: ${fname}`
                      );
                      setTimeout(() => setProductToast(null), 4000);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-xs"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>{isAr ? 'تصدير كل الطلبيات PDF' : 'All POs PDF'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={poLines.length === 0}
                    onClick={() => {
                      const fname = exportReplenishmentPoToExcel(poLines, currencySymbol, language);
                      setProductToast(
                        isAr
                          ? `📊 تم توليد أمر الشراء التعويضي Excel: ${fname}`
                          : `📊 Generated Replenishment PO Excel: ${fname}`
                      );
                      setTimeout(() => setProductToast(null), 4000);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-xs"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>{isAr ? 'Excel' : 'PO Excel'}</span>
                  </button>
                </div>
              </div>

              {/* Alert Banner for Smart Stock < 5 in Simple Hanout Darija */}
              {aiPredictions.some((r) => r.isBelowFive) && (() => {
                const belowFiveList = aiPredictions.filter((r) => r.isBelowFive);
                return (
                  <div className="px-4 py-2.5 bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-900 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="p-1.5 rounded-xl bg-rose-600 text-white shrink-0">
                        <AlertTriangle className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <span className="font-black text-rose-800 dark:text-rose-200">
                          {isAr
                            ? `تنبيه المخزون الذكي (< 5): كاين ${belowFiveList.length} سلع بقى فيها قل من 5 حبات!`
                            : `Smart Stock Alert (< 5): ${belowFiveList.length} items have less than 5 units left!`}
                        </span>
                        <span className="hidden md:inline text-rose-700 dark:text-rose-300 ms-2 font-semibold">
                          {belowFiveList
                            .slice(0, 4)
                            .map((r) => `${r.product.name} (${r.product.stock})`)
                            .join(' · ')}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAiSubView('forecast_table');
                        setOnlyNeedsReorder(true);
                      }}
                      className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] shrink-0"
                    >
                      {isAr ? 'شوف السلع اللي < 5' : 'View < 5 Items'}
                    </button>
                  </div>
                );
              })()}

              {/* View A: Auto Purchase List Grouped by Supplier */}
              {aiSubView === 'supplier_po' ? (
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Summary Cards Strip */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                      <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        {isAr ? 'سلع وصلت لنقطة إعادة الطلب' : 'Items At/Below ROP'}
                      </div>
                      <div className="text-xl font-black font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-1">
                        {needsReorderCount}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                      <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        {isAr ? 'عدد الموردين المطلوبين' : 'Active Suppliers in PO'}
                      </div>
                      <div className="text-xl font-black font-mono tabular-nums text-indigo-600 dark:text-indigo-400 mt-1">
                        {supplierGroups.length}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                      <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        {isAr ? `مجموع الوحدات (تغطية ${poTargetDays} يوم)` : `Total Units (${poTargetDays}d cover)`}
                      </div>
                      <div className="text-xl font-black font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                        {supplierGroups.reduce((s, g) => s + g.totalUnits, 0)}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                      <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        {isAr ? 'ميزانية الشراء التقديرية' : 'Estimated Purchase Total'}
                      </div>
                      <div className="text-xl font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                        {supplierGroups.reduce((s, g) => s + g.estimatedCost, 0).toFixed(2)} {currencySymbol}
                      </div>
                    </div>
                  </div>

                  {supplierGroups.length === 0 ? (
                    <div className="p-8 rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 text-center space-y-2">
                      <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                      <h4 className="text-sm font-black text-slate-900 dark:text-white">
                        {isAr ? 'ممتاز! جميع السلع فوق نقطة إعادة الطلب حالياً' : 'All products are above their reorder points'}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {isAr
                          ? 'ملي تقرب شي سلعة تسالي (توصل لنقطة إعادة الطلب المحسوبة من بيع آخر 30 يوم)، غادي تبان ليك هنا أوتوماتيكياً مرتبة حسب كل مورد.'
                          : 'Products approaching stockout based on 30-day velocity automatically appear here grouped by supplier.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setAiSubView('forecast_table')}
                        className="mt-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
                      >
                        {isAr ? 'عرض جدول معدل البيع ونقطة إعادة الطلب لجميع السلع' : 'View Full 30-Day Velocity Table'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {supplierGroups.map((group) => (
                        <div
                          key={group.supplierName}
                          className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs"
                        >
                          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0">
                                <Truck className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-sm font-black text-slate-900 dark:text-white">
                                    {group.supplierName}
                                  </h4>
                                  <span
                                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                                      group.supplierSource === 'invoice'
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                        : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                                    }`}
                                  >
                                    {group.supplierSource === 'invoice'
                                      ? isAr
                                        ? 'مورد مسجل من الفواتير'
                                        : 'Matched from Invoices'
                                      : isAr
                                      ? 'تصنيف جملة تلقائي'
                                      : 'Auto Category Supplier'}
                                  </span>
                                  {group.criticalCount > 0 && (
                                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                      {group.criticalCount} {isAr ? 'حرج' : 'Critical'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                                  {group.items.length} {isAr ? 'سلع' : 'items'} · {group.totalUnits}{' '}
                                  {isAr ? 'وحدة للطلب' : 'units'} ·{' '}
                                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                    {group.estimatedCost.toFixed(2)} {currencySymbol}
                                  </span>
                                  {group.supplierPhone ? ` · 📞 ${group.supplierPhone}` : ''}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => copySupplierPo(group)}
                                className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
                              >
                                {copiedSupplierKey === group.supplierName ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>{isAr ? 'تم النسخ' : 'Copied'}</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>{isAr ? 'نسخ الطلبية' : 'Copy PO'}</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  const lines = buildPoLines(group.items);
                                  const fname = exportReplenishmentPoToPdf({
                                    lines,
                                    settings: {
                                      ...settings,
                                      storeName: `${settings.storeName} — ${group.supplierName}`
                                    },
                                    currencySymbol,
                                    language
                                  });
                                  setProductToast(
                                    isAr
                                      ? `🧾 تم تصدير طلبية "${group.supplierName}": ${fname}`
                                      : `🧾 Exported PO for ${group.supplierName}: ${fname}`
                                  );
                                  setTimeout(() => setProductToast(null), 3500);
                                }}
                                className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>PDF</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  group.items.forEach((it) => {
                                    adjustStock(
                                      it.product.id,
                                      it.recommendedQty,
                                      `توريد تلقائي لمورد: ${group.supplierName}`,
                                      'restock'
                                    );
                                  });
                                  setProductToast(
                                    isAr
                                      ? `✅ تم توريد جميع سلع "${group.supplierName}" (${group.items.length} سلع) للمخزون`
                                      : `✅ Restocked all ${group.items.length} items from ${group.supplierName}`
                                  );
                                  setTimeout(() => setProductToast(null), 4000);
                                }}
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{isAr ? 'توريد الكل للمورد' : 'Restock Supplier'}</span>
                              </button>
                            </div>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-start border-collapse text-xs">
                              <thead className="bg-slate-50/70 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                <tr>
                                  <th className="py-2 px-3 text-start">{isAr ? 'السلعة' : 'Product'}</th>
                                  <th className="py-2 px-3 text-center">{isAr ? 'المخزون الحالي' : 'Stock'}</th>
                                  <th className="py-2 px-3 text-center">{isAr ? 'نقطة إعادة الطلب (ROP)' : 'Reorder Point'}</th>
                                  <th className="py-2 px-3 text-center">{isAr ? 'معدل بيع 30 يوم' : '30d Rate'}</th>
                                  <th className="py-2 px-3 text-center">{isAr ? 'الكمية للطلب' : 'Order Qty'}</th>
                                  <th className="py-2 px-3 text-end">{isAr ? 'التكلفة التقديرية' : 'Est. Cost'}</th>
                                  <th className="py-2 px-3 text-center">{isAr ? 'توريد سريع' : 'Restock'}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {group.items.map((row) => (
                                  <tr key={row.product.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                    <td className="py-2.5 px-3">
                                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                        <span>{row.product.name}</span>
                                        {row.urgency === 'critical' && (
                                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-600 text-white">
                                            {isAr ? 'حرج' : 'CRITICAL'}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] font-mono text-slate-400">{row.product.sku}</div>
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-mono font-black tabular-nums text-rose-600 dark:text-rose-400">
                                      {row.product.stock} {getUnitName(row.product.unitType)}
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-mono font-bold tabular-nums text-amber-700 dark:text-amber-300">
                                      {row.reorderPoint} {getUnitName(row.product.unitType)}
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-mono tabular-nums text-slate-600 dark:text-slate-300">
                                      <div>{row.dailyVelocity.toFixed(2)}/{isAr ? 'يوم' : 'd'}</div>
                                      <div className="text-[10px] text-slate-400">({row.soldLast30d} / 30{isAr ? 'ي' : 'd'})</div>
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-mono font-black tabular-nums text-indigo-700 dark:text-indigo-300">
                                      +{row.recommendedQty}
                                    </td>
                                    <td className="py-2.5 px-3 text-end font-mono font-bold tabular-nums text-slate-800 dark:text-slate-200">
                                      {row.estimatedCost.toFixed(2)} {currencySymbol}
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          adjustStock(
                                            row.product.id,
                                            row.recommendedQty,
                                            `توريد قائمة شراء المورد (${group.supplierName})`,
                                            'restock'
                                          );
                                          setProductToast(
                                            isAr
                                              ? `✅ تم توريد +${row.recommendedQty} لمنتج "${row.product.name}"`
                                              : `✅ Restocked +${row.recommendedQty} for ${row.product.name}`
                                          );
                                          setTimeout(() => setProductToast(null), 3000);
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black inline-flex items-center gap-1"
                                      >
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span>+{row.recommendedQty}</span>
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* View B: Full 30-Day Velocity & Reorder Point Table */
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setOnlyNeedsReorder(false)}
                        className={`px-3 py-1 rounded-lg font-bold ${
                          !onlyNeedsReorder
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {isAr ? `جميع السلع (${aiPredictions.length})` : `All (${aiPredictions.length})`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOnlyNeedsReorder(true)}
                        className={`px-3 py-1 rounded-lg font-bold ${
                          onlyNeedsReorder
                            ? 'bg-rose-600 text-white'
                            : 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                        }`}
                      >
                        {isAr ? `قريبة تسالي / ≤ نقطة إعادة الطلب (${needsReorderCount})` : `At/Below ROP (${needsReorderCount})`}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const urgentIds = new Set(reorderItems.map((r) => r.product.id));
                        setSelectedPoIds(urgentIds);
                      }}
                      className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50"
                    >
                      {isAr ? 'تحديد كل التي وصلت لنقطة إعادة الطلب' : 'Select All Below ROP'}
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-start border-collapse text-xs">
                      <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="py-3 px-3 text-center w-10">#</th>
                          <th className="py-3 px-4 text-start">{isAr ? 'المنتج والمورد' : 'Product & Supplier'}</th>
                          <th className="py-3 px-3 text-center">{isAr ? 'الرصيد الحالي' : 'Stock'}</th>
                          <th className="py-3 px-3 text-center">{isAr ? 'معدل البيع (آخر 30 يوم)' : '30d Sales Rate'}</th>
                          <th className="py-3 px-3 text-center">{isAr ? 'نقطة إعادة الطلب (ROP)' : 'Reorder Point'}</th>
                          <th className="py-3 px-3 text-center">{isAr ? 'توقع النفاد' : 'Est. Stockout'}</th>
                          <th className="py-3 px-3 text-center">{isAr ? `طلبية مقترحة (${poTargetDays} ي)` : `Suggested Qty (${poTargetDays}d)`}</th>
                          <th className="py-3 px-3 text-end">{isAr ? 'التكلفة التقديرية' : 'Est. Cost'}</th>
                          <th className="py-3 px-4 text-center">{isAr ? 'توريد فوري' : 'Quick Restock'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {displayedTableRows.map((row) => {
                          const isChecked = selectedPoIds.has(row.product.id);
                          return (
                            <tr
                              key={row.product.id}
                              className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                                row.urgency === 'critical'
                                  ? 'bg-rose-50/40 dark:bg-rose-950/15'
                                  : row.needsReorder
                                  ? 'bg-amber-50/30 dark:bg-amber-950/10'
                                  : ''
                              }`}
                            >
                              <td className="py-3 px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    setSelectedPoIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(row.product.id)) next.delete(row.product.id);
                                      else next.add(row.product.id);
                                      return next;
                                    });
                                  }}
                                  className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                                />
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                  <span>{row.product.name}</span>
                                  {row.needsReorder && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-500 text-slate-950">
                                      {isAr ? 'في قائمة الشراء' : 'IN PO'}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                  <span className="font-mono">{row.product.sku}</span> · {row.supplierName}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-center font-mono font-black tabular-nums">
                                <span
                                  className={
                                    row.urgency === 'critical'
                                      ? 'text-rose-600'
                                      : row.urgency === 'warning'
                                      ? 'text-amber-600'
                                      : 'text-emerald-600'
                                  }
                                >
                                  {row.product.stock} {getUnitName(row.product.unitType)}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center font-mono tabular-nums text-slate-700 dark:text-slate-300">
                                <div className="font-bold">{row.dailyVelocity.toFixed(2)} / {isAr ? 'يوم' : 'd'}</div>
                                <div className="text-[10px] text-slate-400">
                                  {row.soldLast30d} {isAr ? 'فآخر 30 يوم' : 'in 30d'}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-center font-mono tabular-nums">
                                <span
                                  className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                                    row.needsReorder
                                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                  }`}
                                >
                                  {row.reorderPoint} {getUnitName(row.product.unitType)}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center">
                                {row.daysToZero === null ? (
                                  <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-bold">
                                    {isAr ? 'سحب بطيء' : 'Slow'}
                                  </span>
                                ) : row.daysToZero === 0 ? (
                                  <span className="px-2 py-0.5 rounded-lg bg-rose-600 text-white text-[10px] font-black">
                                    {isAr ? 'نفد (0 ي)' : 'Out (0d)'}
                                  </span>
                                ) : (
                                  <div className="inline-flex flex-col items-center">
                                    <span
                                      className={`px-2 py-0.5 rounded-lg text-[10px] font-black font-mono ${
                                        row.daysToZero <= 5
                                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                          : row.daysToZero <= 14
                                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                      }`}
                                    >
                                      {isAr ? `بعد ${row.daysToZero} ي` : `${row.daysToZero}d`}
                                    </span>
                                    <span className="text-[9px] font-mono text-slate-400 mt-0.5">
                                      {row.estimatedZeroDate}
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3 text-center font-mono font-black text-indigo-700 dark:text-indigo-300 tabular-nums">
                                {row.recommendedQty > 0 ? `+${row.recommendedQty}` : '0'}
                              </td>
                              <td className="py-3 px-3 text-end font-mono font-bold tabular-nums text-slate-700 dark:text-slate-300">
                                {row.estimatedCost.toFixed(2)} {currencySymbol}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {row.recommendedQty > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      adjustStock(
                                        row.product.id,
                                        row.recommendedQty,
                                        `توريد تعويضي بناءً على نقطة إعادة الطلب (${row.supplierName})`,
                                        'restock'
                                      );
                                      setProductToast(
                                        isAr
                                          ? `✅ تم توريد +${row.recommendedQty} لمنتج "${row.product.name}"`
                                          : `✅ Restocked +${row.recommendedQty} for ${row.product.name}`
                                      );
                                      setTimeout(() => setProductToast(null), 3000);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black inline-flex items-center gap-1"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>+{row.recommendedQty}</span>
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-emerald-600 font-bold">
                                    {isAr ? 'مكتفي ✓' : 'OK ✓'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Add Product Modal (Loyverse Style) */}
      <AddProductModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        defaultCategoryId={selectedCat === 'all' ? undefined : selectedCat}
        onProductAdded={(newProd) => {
          setSelectedCat('all');
          setSearchQuery('');
          setOnlyLowStock(false);
          setOnlyExpiring(false);
          setTablePage(1);
          setProductToast(isAr ? `✅ تمت إضافة سلعة "${newProd.name}" إلى المخزون بنجاح!` : `✅ Added "${newProd.name}" successfully!`);
          setTimeout(() => setProductToast(null), 3500);
        }}
      />

      {/* Adjust Stock Modal */}
      {showAdjustModal && selectedProductForAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form
            onSubmit={handleApplyAdjustment}
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                  {t.adjust_stock}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {selectedProductForAdjust.name} ({isAr ? 'الرصيد الحالي' : 'Current'}: {selectedProductForAdjust.stock} {getUnitName(selectedProductForAdjust.unitType)})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdjustModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {t.movement_type}
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'restock' as const, label: t.movement_restock },
                  { id: 'waste' as const, label: t.movement_waste },
                  { id: 'audit_adjustment' as const, label: t.movement_audit },
                ].map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setAdjustType(type.id)}
                    className={`py-2 text-[11px] font-bold rounded-xl border transition-colors ${
                      adjustType === type.id
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {isAr ? 'الكمية المراد تعديلها' : 'Quantity'} ({getUnitName(selectedProductForAdjust.unitType)})
                </label>
                {selectedProductForAdjust.stock > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustType('waste');
                      setAdjustQty(selectedProductForAdjust.stock);
                    }}
                    className="px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/60 text-[10px] font-extrabold text-rose-700 dark:text-rose-300 hover:bg-rose-200"
                  >
                    {isAr ? 'تصفير المخزون (0)' : 'Set to 0'}
                  </button>
                )}
              </div>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={adjustQty}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setAdjustQty(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-lg font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {t.reason}
              </label>
              <input
                type="text"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder={isAr ? 'رقم فاتورة المورد، سبب التلف، جرد...' : 'Supplier invoice #, damage reason...'}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            {adjustType === 'restock' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  {isAr ? 'تاريخ صلاحية الدفعة الجديدة (FEFO - اختياري)' : 'New Batch Expiry Date (FEFO - Optional)'}
                </label>
                <input
                  type="date"
                  value={adjustBatchExpiry}
                  onChange={(e) => setAdjustBatchExpiry(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-2xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm"
            >
              {isAr ? 'تأكيد التعديل وتسجيل الحركة' : 'Confirm Movement'}
            </button>
          </form>
        </div>
      )}

      {/* Bulk Product & Stock Excel/CSV Import Modal */}
      <ImportProductsModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
      />

      {/* Edit Product Modal */}
      <EditProductModal
        product={editingProduct}
        isOpen={!!editingProduct}
        onClose={() => setEditingProduct(null)}
      />

      {/* Category Modal with Camera, Phone Upload, and Category Deletion/Management */}
      <AddCategoryModal
        isOpen={showAddCategoryModal}
        onClose={() => setShowAddCategoryModal(false)}
        initialTab={categoryModalTab}
      />

      {/* Multi-Product Bulk Update Modal (Prices & Stock) */}
      <BulkUpdateModal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        selectedProducts={selectedProductsList}
        onSuccess={() => {
          clearSelection();
        }}
      />

      {/* Camera Barcode Scanner Modal for Inventory Search */}
      {showBarcodeScanner && (
        <BarcodeScannerModal
          mode="field"
          title={isAr ? 'البحث عن منتج في المخزون بالكاميرا' : 'Scan Barcode to Search Inventory'}
          onClose={() => setShowBarcodeScanner(false)}
          onScanned={(code) => {
            const clean = code.trim();
            const matched = products.find(
              (p) => p.barcode === clean || p.sku.toLowerCase() === clean.toLowerCase()
            );
            setSelectedCat('all');
            setSelectedUnit('all');
            setOnlyLowStock(false);
            setOnlyExpiring(false);
            if (matched) {
              if (settings.bluetoothSoundFeedback !== false) playSound('beep');
              setSearchQuery(matched.barcode || clean);
              setHighlightedProductId(matched.id);
              setProductToast(
                isAr
                  ? `🔊 بيب! تلقات فـ المخزون: ${matched.name}`
                  : `📷 Found: ${matched.name}`
              );
              setTimeout(() => setProductToast(null), 3000);
            } else {
              playSound('error');
              setShowBarcodeScanner(false);
              window.dispatchEvent(
                new CustomEvent('kadi:open-quick-new-barcode', {
                  detail: { barcode: clean, sourceContext: 'inventory' }
                })
              );
            }
          }}
        />
      )}

      {/* Export Products, Images & Prices to File / Gmail Modal */}
      <ExportCatalogGmailModal
        isOpen={showCatalogGmailModal}
        onClose={() => setShowCatalogGmailModal(false)}
        selectedProducts={selectedProductsList}
      />

      {showSeedDemoConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs"
          onClick={() => setShowSeedDemoConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  {isAr ? 'توليد كتالوج تجريبي (+2000 صنف)' : 'Generate 2,000+ Demo Items'}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  {isAr
                    ? 'هل تريد توليد كتالوج ضخم يحتوي على أكثر من 2000 صنف غذائي مغربي متنوع لاختبار سعة وسرعة النظام؟'
                    : 'Generate 2,000+ Moroccan grocery items to test catalog speed and capacity?'}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowSeedDemoConfirm(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSeedDemoConfirm(false);
                  seedLargeCatalogDemo(2000);
                }}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-extrabold shadow-xs"
              >
                {isAr ? 'توليد +2000 صنف' : 'Generate 2,000+'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ShelfLabelPrintModal
        isOpen={showLabelPrintModal}
        onClose={() => setShowLabelPrintModal(false)}
        initialProducts={labelPrintInitialProducts}
      />

      {unpackModalProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs"
          onClick={() => setUnpackModalProduct(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const boxesVal = parseFloat(unpackBoxesCount) || 0;
              const unitsVal = parseFloat(unpackUnitsPerBox) || 0;
              const res = unpackBoxProduct(
                unpackModalProduct.id,
                boxesVal,
                unpackChildId || undefined,
                unitsVal > 0 ? unitsVal : undefined
              );
              setProductToast(res.message);
              setTimeout(() => setProductToast(null), 4000);
              if (res.success) {
                setUnpackModalProduct(null);
              }
            }}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                  <PackageOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900 dark:text-white">
                    {isAr ? 'فك الكرتون إلى حبات' : 'Unpack Box to Pieces'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {unpackModalProduct.name} ({isAr ? `المتوفر: ${unpackModalProduct.stock}` : `Stock: ${unpackModalProduct.stock}`})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUnpackModalProduct(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'عدد الكراتين المراد فكها' : 'Boxes to Unpack'}
                </label>
                <input
                  type="number"
                  min="1"
                  max={Math.max(1, unpackModalProduct.stock)}
                  step="1"
                  required
                  value={unpackBoxesCount}
                  onChange={(e) => setUnpackBoxesCount(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono font-black bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'عدد الحبات داخل الكرتون' : 'Pieces per Box'}
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={unpackUnitsPerBox}
                  onChange={(e) => setUnpackUnitsPerBox(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono font-black bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? 'منتج الحبة / التجزئة المستهدف' : 'Target Piece Product'}
              </label>
              <RetailProductSearchSelect
                products={products}
                value={unpackChildId}
                onChange={setUnpackChildId}
                excludeProductId={unpackModalProduct.id}
                currencySymbol={currencySymbol}
                isAr={isAr}
                required
                placeholder={
                  isAr
                    ? 'ابحث عن منتج الحبة لإضافة الكمية إليه...'
                    : 'Search target retail piece product...'
                }
                inputClassName="w-full ps-8 pe-7 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-colors"
              />
            </div>

            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
              <span>{isAr ? 'الكمية المضافة للحبة:' : 'Units added to piece:'}</span>
              <span className="font-mono font-black text-sm tabular-nums">
                +{(Math.max(0, parseFloat(unpackBoxesCount) || 0) * Math.max(0, parseFloat(unpackUnitsPerBox) || 0))}
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setUnpackModalProduct(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={!unpackChildId || unpackModalProduct.stock <= 0}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 text-xs font-black flex items-center gap-1.5"
              >
                <PackageOpen className="w-4 h-4" />
                <span>{isAr ? 'تأكيد فك الكرتون' : 'Confirm Unpack'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
