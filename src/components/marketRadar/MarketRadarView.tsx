import React, { useMemo, useState } from 'react';
import { usePos } from '../../context/PosContext';
import { Category, Product, SupplierInvoice } from '../../types';
import { exportMarketRadarWeeklyPdf } from '../../utils/exportReports';
import { getLocalTodayYMD } from '../../utils/expenses';
import { parseMoroccanNumber, sanitizeDecimalInput } from '../../utils/priceAlerts';
import {
  Compass,
  Download,
  Copy,
  Check,
  Mic,
  Search,
  Truck,
  PackagePlus,
  Calendar,
  ArrowUpRight,
  Layers,
  AlertCircle,
  CheckCircle2,
  X
} from 'lucide-react';

interface ClassifiedCategoryResult {
  categoryKey: string;
  categoryLabelAr: string;
  categoryLabelEn: string;
  matchedCatalogCategoryId?: string;
  assumedSuppliersAr: string[];
  assumedSuppliersEn: string[];
}

interface RadarItemAnalysis {
  normalizedName: string;
  itemName: string;
  productId?: string;
  currentStock: number | null;
  isUnavailable: boolean;
  periodCount: number;
  todayCount: number;
  allTimeCount: number;
  waitingCustomersCount: number;
  estimatedUnitPrice: number;
  estimatedUnitCost: number;
  missedRevenue: number;
  estimatedMarginPct: number;
  lastRequestedAt: string;
  classification: ClassifiedCategoryResult;
  suggestedSuppliers: string[];
}

const CATEGORY_TAXONOMY: Array<{
  key: string;
  pattern: RegExp;
  labelAr: string;
  labelEn: string;
  suppliersAr: string[];
  suppliersEn: string[];
}> = [
  {
    key: 'dairy',
    pattern: /(حليب|لبن|ياغورت|رايبي|جبن|فرماج|زبدة|أجبان|دانون|بيرلي|جودة|سنطرال|milk|lait|danone|yogurt|cheese|fromage|beurre)/i,
    labelAr: 'الحليب ومشتقاته والأجبان',
    labelEn: 'Dairy & Cheese',
    suppliersAr: [
      'موزع سنطرال دانون / جودة الجهوي',
      'تعاونية كوباك / الحليب الطري',
      'موزع الأجبان والمبردات المحلي'
    ],
    suppliersEn: ['Centrale Danone / Jaouda Distributor', 'COPAG Dairy Wholesaler']
  },
  {
    key: 'beverages',
    pattern: /(كوكا|بيبسي|فانتا|سبرايت|عصير|ماء|سيدي علي|والماس|مشروب|مونادا|قهوة مثلجة|soda|juice|water|boisson|eau|jus|coca|pepsi|oasis)/i,
    labelAr: 'المشروبات الغازية والمياه والعصائر',
    labelEn: 'Beverages & Bottled Water',
    suppliersAr: [
      'مستودع المشروبات الغازية (كوكاكولا / بيبسي)',
      'موزع المياه المعدنية (سيدي علي / والماس / عين سايس)',
      'تاجر جملة العصائر والمشروبات'
    ],
    suppliersEn: ['Coca-Cola / Pepsi Beverage Depot', 'Mineral Water Distributor']
  },
  {
    key: 'staples',
    pattern: /(شاي|أتاي|قهوة|سكر|زيت|دقيق|طماطم|أرز|مقرونة|كسكس|عدس|فاصوليا|حمص|سميد|عسل|مربى|كونفتير|tea|sugar|oil|huile|farine|sucre|the|cafe|pasta|couscous)/i,
    labelAr: 'المواد الغذائية الأساسية والبقالة',
    labelEn: 'Dry Groceries & Staples',
    suppliersAr: [
      'تاجر جملة المواد الغذائية (درب عمر / سوق الجملة)',
      'موزع الزيوت والسكر والدقيق (لوسيور / كوزيمار)',
      'مستودع الشاي والقهوة والقطاني'
    ],
    suppliersEn: ['Dry Groceries Wholesaler', 'Oils, Sugar & Flour Depot']
  },
  {
    key: 'cleaning',
    pattern: /(جافيل|أومو|تيد|صابون|شامبو|نظافة|منظف|حفاضات|بامبرز|كلينكس|مناديل|سينيال|معجون|أوني|detergent|soap|clean|omo|tide|javel|pampers|shampoo|hygiene)/i,
    labelAr: 'مواد التنظيف والعناية الشخصية',
    labelEn: 'Cleaning & Personal Care',
    suppliersAr: [
      'موزع مواد التنظيف الكبرى (P&G / هنكل / أوني)',
      'تاجر جملة مستلزمات النظافة والحفاضات',
      'مستودع مواد التجميل والنظافة اليومية'
    ],
    suppliersEn: ['P&G / Henkel Cleaning Distributor', 'Hygiene & Paper Goods Wholesaler']
  },
  {
    key: 'snacks',
    pattern: /(بيمو|شوكولا|بسكويت|حلوة|علكة|شيبس|كيك|تيكت|مرندينا|طونيك|نوتيلا|chocolate|biscuit|snack|chips|candy|wafer|gateau)/i,
    labelAr: 'البسكويت والحلويات والمقرمشات',
    labelEn: 'Snacks & Confectionery',
    suppliersAr: [
      'موزع البسكويت والحلويات (بيمو / هنريس / أولي)',
      'تاجر جملة الشوكولاتة والمقرمشات',
      'شركة توزيع السناكس والمواد المدرسية'
    ],
    suppliersEn: ['Bimo / Mondelez Snacks Distributor', 'Confectionery Wholesaler']
  },
  {
    key: 'bakery_fresh',
    pattern: /(خبز|كرواصة|مسمن|بيض|دجاج|لاندون|كاشير|مرتديلا|تونة|سردين|مخبز|bread|egg|oeuf|bakery|thon|sardine|charcuterie)/i,
    labelAr: 'المخبز والبيض والمعلبات واللحوم',
    labelEn: 'Bakery, Eggs & Canned Protein',
    suppliersAr: [
      'موزع البيض الطازج اليومي (الضيعة)',
      'المخبزة المحلية / ممون الحلويات اليومية',
      'موزع اللحوم المحولة والمعلبات (الكاشير والطون)'
    ],
    suppliersEn: ['Daily Egg Farm Distributor', 'Local Bakery & Canned Goods Supplier']
  },
  {
    key: 'spices',
    pattern: /(كمون|إبزار|فلفل|ملح|سكنجبير|خرقوم|زعفران|تحميرة|توابل|بهارات|عطرية|spice|epice|poivre|sel)/i,
    labelAr: 'التوابل والبهارات والمنسمات',
    labelEn: 'Spices & Seasonings',
    suppliersAr: [
      'عطار وتاجر جملة التوابل والبهارات',
      'تعاونية الأعشاب والمنسمات المغربية'
    ],
    suppliersEn: ['Wholesale Spice & Herb Merchant']
  },
  {
    key: 'telecom',
    pattern: /(روشارج|تعبئة|بطاقة|رصيد|إنوي|أورونج|اتصالات|شاحن|كابل|كاسك|recharge|inwi|orange|iam|cable|charger)/i,
    labelAr: 'الاتصالات والتعبئات وإكسسوارات الهاتف',
    labelEn: 'Telecom & Mobile Accessories',
    suppliersAr: [
      'موزع التعبئات والبطاقات (اتصالات / أورونج / إنوي)',
      'مورد إكسسوارات الهواتف والبطاريات'
    ],
    suppliersEn: ['Telecom Top-up Distributor', 'Mobile Accessories Wholesaler']
  }
];

function classifyMissingItem(
  itemName: string,
  matchedProduct: Product | undefined,
  categories: Category[],
  invoices: SupplierInvoice[],
  isAr: boolean
): { classification: ClassifiedCategoryResult; suggestedSuppliers: string[] } {
  const catalogCat = matchedProduct
    ? categories.find((c) => c.id === matchedProduct.categoryId)
    : categories.find((c) => {
        if (c.id === 'cat-all') return false;
        const cLow = `${c.name} ${c.nameEn}`.toLowerCase();
        return itemName
          .toLowerCase()
          .split(/\s+/)
          .some((tok) => tok.length >= 3 && cLow.includes(tok));
      });

  const combinedText = `${itemName} ${catalogCat?.name || ''} ${catalogCat?.nameEn || ''}`;
  const taxMatch = CATEGORY_TAXONOMY.find((rule) => rule.pattern.test(combinedText));

  const classification: ClassifiedCategoryResult = taxMatch
    ? {
        categoryKey: taxMatch.key,
        categoryLabelAr: catalogCat ? `${catalogCat.name} (${taxMatch.labelAr})` : taxMatch.labelAr,
        categoryLabelEn: catalogCat ? `${catalogCat.nameEn} (${taxMatch.labelEn})` : taxMatch.labelEn,
        matchedCatalogCategoryId: catalogCat?.id,
        assumedSuppliersAr: taxMatch.suppliersAr,
        assumedSuppliersEn: taxMatch.suppliersEn
      }
    : {
        categoryKey: catalogCat?.id || 'general',
        categoryLabelAr: catalogCat?.name || 'مواد عامة ومتنوعات الحانوت',
        categoryLabelEn: catalogCat?.nameEn || 'General Grocery',
        matchedCatalogCategoryId: catalogCat?.id,
        assumedSuppliersAr: [
          'تاجر الجملة العام — سوق الجملة القريب',
          'ممون المواد الاستهلاكية السريعة (FMCG)'
        ],
        assumedSuppliersEn: ['General Wholesale Market', 'Local FMCG Distributor']
      };

  const lower = itemName.trim().toLowerCase();
  const fromInvoices = invoices
    .filter(
      (inv) =>
        (inv.notes && inv.notes.toLowerCase().includes(lower)) ||
        inv.itemsSummary?.some((it) => it.productName.toLowerCase().includes(lower))
    )
    .map((inv) => `${inv.supplierName}${inv.supplierPhone ? ` (${inv.supplierPhone})` : ''}`);

  const baseSuppliers = isAr ? classification.assumedSuppliersAr : classification.assumedSuppliersEn;
  const suggestedSuppliers = Array.from(new Set([...fromInvoices, ...baseSuppliers])).slice(0, 3);

  return { classification, suggestedSuppliers };
}

export const MarketRadarView: React.FC = () => {
  const {
    shopEarRequests,
    products,
    categories,
    supplierInvoices,
    addProduct,
    settings,
    currencySymbol,
    language
  } = usePos();

  const isAr = language === 'ar';
  const todayYMD = getLocalTodayYMD();

  const [periodDays, setPeriodDays] = useState<7 | 14 | 0>(7);
  const [availabilityMode, setAvailabilityMode] = useState<'unavailable_only' | 'all_missing'>('unavailable_only');
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedReport, setCopiedReport] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Quick stock-add modal directly from Market Radar
  const [quickStockTarget, setQuickStockTarget] = useState<RadarItemAnalysis | null>(null);
  const [quickSellPrice, setQuickSellPrice] = useState<string>('10');
  const [quickCostPrice, setQuickCostPrice] = useState<string>('7.5');
  const [quickStockQty, setQuickStockQty] = useState<string>('12');

  const cutoffMs = useMemo(
    () => (periodDays > 0 ? Date.now() - periodDays * 86400000 : 0),
    [periodDays]
  );

  // Aggregate customer demand for missing items across the selected window
  const analyzedItems = useMemo<RadarItemAnalysis[]>(() => {
    const map = new Map<
      string,
      {
        normalizedName: string;
        itemName: string;
        productId?: string;
        periodCount: number;
        todayCount: number;
        allTimeCount: number;
        waitingCustomersCount: number;
        estimatedUnitPrice: number;
        estimatedUnitCost: number;
        missedRevenue: number;
        lastRequestedAt: string;
      }
    >();

    shopEarRequests.forEach((req) => {
      const reqMs = new Date(req.requestedAt).getTime();
      const inPeriod = periodDays === 0 || (!Number.isNaN(reqMs) && reqMs >= cutoffMs);

      const matchedProd =
        (req.productId ? products.find((p) => p.id === req.productId) : undefined) ||
        products.find((p) => p.name.trim().toLowerCase() === req.itemName.trim().toLowerCase());

      const unitPrice = req.estimatedUnitPrice ?? matchedProd?.price ?? 0;
      const unitCost =
        matchedProd?.costPrice ?? (unitPrice > 0 ? Number((unitPrice * 0.78).toFixed(2)) : 0);

      const existing = map.get(req.normalizedName);
      if (existing) {
        existing.allTimeCount += 1;
        if (inPeriod) {
          existing.periodCount += 1;
          existing.missedRevenue = Number((existing.missedRevenue + unitPrice).toFixed(2));
        }
        if (req.dateKey === todayYMD) {
          existing.todayCount += 1;
        }
        if (req.status === 'pending' && (req.customerName || req.customerPhone)) {
          existing.waitingCustomersCount += 1;
        }
        if (req.requestedAt > existing.lastRequestedAt) {
          existing.lastRequestedAt = req.requestedAt;
        }
        if (!existing.productId && matchedProd) {
          existing.productId = matchedProd.id;
        }
        if (existing.estimatedUnitPrice <= 0 && unitPrice > 0) {
          existing.estimatedUnitPrice = unitPrice;
          existing.estimatedUnitCost = unitCost;
        }
      } else {
        map.set(req.normalizedName, {
          normalizedName: req.normalizedName,
          itemName: req.itemName,
          productId: req.productId || matchedProd?.id,
          periodCount: inPeriod ? 1 : 0,
          todayCount: req.dateKey === todayYMD ? 1 : 0,
          allTimeCount: 1,
          waitingCustomersCount:
            req.status === 'pending' && (req.customerName || req.customerPhone) ? 1 : 0,
          estimatedUnitPrice: unitPrice,
          estimatedUnitCost: unitCost,
          missedRevenue: inPeriod ? unitPrice : 0,
          lastRequestedAt: req.requestedAt
        });
      }
    });

    const list: RadarItemAnalysis[] = [];
    map.forEach((entry) => {
      if (periodDays > 0 && entry.periodCount <= 0) return;

      const matchedProd =
        (entry.productId ? products.find((p) => p.id === entry.productId) : undefined) ||
        products.find((p) => p.name.trim().toLowerCase() === entry.itemName.trim().toLowerCase());

      const currentStock = matchedProd ? matchedProd.stock : null;
      const isUnavailable = currentStock === null || currentStock <= 0;

      const { classification, suggestedSuppliers } = classifyMissingItem(
        entry.itemName,
        matchedProd,
        categories,
        supplierInvoices,
        isAr
      );

      const sell = entry.estimatedUnitPrice > 0 ? entry.estimatedUnitPrice : 10;
      const cost =
        entry.estimatedUnitCost > 0 ? entry.estimatedUnitCost : Number((sell * 0.78).toFixed(2));
      const marginPct = sell > 0 ? Math.max(0, Math.round(((sell - cost) / sell) * 100)) : 22;

      list.push({
        normalizedName: entry.normalizedName,
        itemName: entry.itemName,
        productId: matchedProd?.id,
        currentStock,
        isUnavailable,
        periodCount: periodDays > 0 ? entry.periodCount : entry.allTimeCount,
        todayCount: entry.todayCount,
        allTimeCount: entry.allTimeCount,
        waitingCustomersCount: entry.waitingCustomersCount,
        estimatedUnitPrice: entry.estimatedUnitPrice,
        estimatedUnitCost: entry.estimatedUnitCost,
        missedRevenue: entry.missedRevenue,
        estimatedMarginPct: marginPct,
        lastRequestedAt: entry.lastRequestedAt,
        classification,
        suggestedSuppliers
      });
    });

    return list.sort(
      (a, b) =>
        b.periodCount - a.periodCount ||
        b.todayCount - a.todayCount ||
        b.missedRevenue - a.missedRevenue
    );
  }, [shopEarRequests, products, categories, supplierInvoices, periodDays, cutoffMs, todayYMD, isAr]);

  // Top 5 most-requested items that are currently UNAVAILABLE in inventory
  const top5UnavailableWeeklyReport = useMemo(
    () => analyzedItems.filter((it) => it.isUnavailable).slice(0, 5),
    [analyzedItems]
  );

  // Category breakdown summary (count of missing requests + assumed supplier per category)
  const categoryBreakdown = useMemo(() => {
    const bucket = new Map<
      string,
      {
        key: string;
        label: string;
        totalRequests: number;
        unavailableItemsCount: number;
        primarySupplier: string;
      }
    >();

    analyzedItems
      .filter((it) => availabilityMode === 'all_missing' || it.isUnavailable)
      .forEach((it) => {
        const label = isAr
          ? it.classification.categoryLabelAr
          : it.classification.categoryLabelEn;
        const prev = bucket.get(it.classification.categoryKey);
        if (prev) {
          prev.totalRequests += it.periodCount;
          if (it.isUnavailable) prev.unavailableItemsCount += 1;
        } else {
          bucket.set(it.classification.categoryKey, {
            key: it.classification.categoryKey,
            label,
            totalRequests: it.periodCount,
            unavailableItemsCount: it.isUnavailable ? 1 : 0,
            primarySupplier: it.suggestedSuppliers[0] || ''
          });
        }
      });

    return Array.from(bucket.values()).sort((a, b) => b.totalRequests - a.totalRequests);
  }, [analyzedItems, availabilityMode, isAr]);

  // Filtered table rows
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return analyzedItems.filter((it) => {
      if (availabilityMode === 'unavailable_only' && !it.isUnavailable) return false;
      if (selectedCategoryKey !== 'all' && it.classification.categoryKey !== selectedCategoryKey) {
        return false;
      }
      if (!q) return true;
      return (
        it.itemName.toLowerCase().includes(q) ||
        it.classification.categoryLabelAr.toLowerCase().includes(q) ||
        it.suggestedSuppliers.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [analyzedItems, availabilityMode, selectedCategoryKey, searchQuery]);

  // KPI totals
  const unavailableCount = useMemo(
    () => analyzedItems.filter((it) => it.isUnavailable).length,
    [analyzedItems]
  );
  const totalPeriodRequests = useMemo(
    () => analyzedItems.reduce((sum, it) => sum + it.periodCount, 0),
    [analyzedItems]
  );
  const totalUnavailableMissedRevenue = useMemo(
    () =>
      Number(
        analyzedItems
          .filter((it) => it.isUnavailable)
          .reduce((sum, it) => sum + it.missedRevenue, 0)
          .toFixed(2)
      ),
    [analyzedItems]
  );

  const periodLabel =
    periodDays === 7
      ? isAr
        ? 'آخر 7 أيام (تقرير أسبوعي)'
        : 'Last 7 Days (Weekly)'
      : periodDays === 14
      ? isAr
        ? 'آخر 14 يوم'
        : 'Last 14 Days'
      : isAr
      ? 'جميع الطلبات المسجلة'
      : 'All Time';

  const maxTop5Freq = Math.max(
    1,
    ...top5UnavailableWeeklyReport.map((item) => item.periodCount)
  );

  const handleGeneratePdf = () => {
    const filename = exportMarketRadarWeeklyPdf({
      topItems: top5UnavailableWeeklyReport.map((it, idx) => ({
        rank: idx + 1,
        itemName: it.itemName,
        categoryLabel: isAr
          ? it.classification.categoryLabelAr
          : it.classification.categoryLabelEn,
        weeklyRequests: it.periodCount,
        todayRequests: it.todayCount,
        stockStatusLabel:
          it.currentStock === null
            ? isAr
              ? 'غير مسجلة بالمخزون'
              : 'Not in catalog'
            : isAr
            ? 'نفدت من المخزون (0)'
            : 'Out of stock (0)',
        missedRevenue: it.missedRevenue,
        suggestedSuppliers: it.suggestedSuppliers
      })),
      totalWeeklyMissingRequests: totalPeriodRequests,
      totalDistinctUnavailable: unavailableCount,
      totalEstimatedLostRevenue: totalUnavailableMissedRevenue,
      periodLabel,
      settings,
      currencySymbol,
      language
    });

    setToastMsg(
      isAr
        ? `تم توليد التقرير الأسبوعي بنجاح: ${filename}`
        : `Weekly report exported: ${filename}`
    );
    window.setTimeout(() => setToastMsg(null), 4000);
  };

  const handleCopyReportText = async () => {
    const storeName = settings.storeName || 'الحانوت';
    const lines = [
      `تقرير رادار اتجاهات السوق الأسبوعي — ${storeName} (${todayYMD})`,
      `أكثر 5 سلع طلباً وغير متوفرة حالياً في المخزون (${periodLabel}):`,
      '----------------------------------------'
    ];

    if (top5UnavailableWeeklyReport.length === 0) {
      lines.push('لا توجد سلع مفقودة غير متوفرة في المخزون خلال هذه الفترة.');
    } else {
      top5UnavailableWeeklyReport.forEach((item, idx) => {
        lines.push(
          `${idx + 1}. ${item.itemName} | التكرار: ${item.periodCount} مرات | التصنيف: ${
            item.classification.categoryLabelAr
          } | المورد المقترح: ${item.suggestedSuppliers[0]}`
        );
      });
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedReport(true);
      window.setTimeout(() => setCopiedReport(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  const openQuickStockModal = (item: RadarItemAnalysis) => {
    const defaultSell = item.estimatedUnitPrice > 0 ? item.estimatedUnitPrice : 10;
    const defaultCost =
      item.estimatedUnitCost > 0
        ? item.estimatedUnitCost
        : Number((defaultSell * 0.78).toFixed(2));
    setQuickStockTarget(item);
    setQuickSellPrice(String(defaultSell));
    setQuickCostPrice(String(defaultCost));
    setQuickStockQty(String(Math.max(6, item.periodCount * 3)));
  };

  const handleSaveQuickProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickStockTarget) return;

    const parsedSell = parseMoroccanNumber(quickSellPrice);
    const sell = parsedSell > 0 ? parsedSell : 10;
    const parsedCost = parseMoroccanNumber(quickCostPrice);
    const cost = quickCostPrice.trim() !== '' ? Math.max(0, parsedCost) : Number((sell * 0.78).toFixed(2));
    const qty = Math.max(1, parseFloat(quickStockQty) || 6);
    const fallbackCat =
      quickStockTarget.classification.matchedCatalogCategoryId ||
      categories.find((c) => c.id !== 'cat-all')?.id ||
      'cat-1';

    const res = addProduct({
      name: quickStockTarget.itemName,
      nameEn: quickStockTarget.itemName,
      sku: `RAD-${Date.now().toString().slice(-5)}`,
      barcode: '',
      price: Number(sell.toFixed(2)),
      costPrice: Number(cost.toFixed(2)),
      categoryId: fallbackCat,
      unitType: 'piece',
      stock: qty,
      lowStockThreshold: 5,
      color: '#D97706',
      image: '',
      hasVariants: false
    });

    if (res.success) {
      setToastMsg(
        isAr
          ? `تمت إضافة "${quickStockTarget.itemName}" للمخزون بكمية ${qty}`
          : `Added "${quickStockTarget.itemName}" to stock (${qty})`
      );
      window.setTimeout(() => setToastMsg(null), 3500);
      setQuickStockTarget(null);
    }
  };

  return (
    <div
      className="flex-1 h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 space-y-6"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {/* Page Header & Top Actions */}
      <header className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
            <Compass className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight text-balance">
              {isAr ? 'رادار اتجاهات السوق' : 'Market Trends Radar'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {isAr
                ? 'تحليل تكرار طلبات الزبناء للسلع المفقودة · تقرير أسبوعي لأكثر 5 سلع طلباً وغير متوفرة · اقتراح الموردين حسب التصنيف'
                : 'Customer missing-item frequency analytics · Weekly Top 5 unavailable items report · Category-based supplier suggestions'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('kadi:open-shop-ear-modal'))}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <Mic className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{isAr ? 'تسجيل طلب مفقود' : 'Log Missing Request'}</span>
          </button>

          <button
            type="button"
            onClick={handleCopyReportText}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            {copiedReport ? (
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Copy className="w-4 h-4 text-slate-500 shrink-0" />
            )}
            <span>
              {copiedReport
                ? isAr
                  ? 'تم النسخ'
                  : 'Copied'
                : isAr
                ? 'نسخ التقرير'
                : 'Copy Report'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleGeneratePdf}
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 dark:hover:bg-amber-400 text-white dark:text-slate-950 text-xs font-black flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>{isAr ? 'توليد تقرير أسبوعي PDF' : 'Export Weekly PDF'}</span>
          </button>
        </div>
      </header>

      {toastMsg && (
        <div className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Period Filter & Summary KPI Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 self-start">
          {[
            { days: 7 as const, label: isAr ? 'التقرير الأسبوعي (7 أيام)' : 'Weekly (7d)' },
            { days: 14 as const, label: isAr ? 'آخر 14 يوم' : '14 Days' },
            { days: 0 as const, label: isAr ? 'كل الفترات' : 'All Time' }
          ].map((opt) => (
            <button
              key={opt.days}
              type="button"
              onClick={() => setPeriodDays(opt.days)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                periodDays === opt.days
                  ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          <span>{periodLabel}</span>
          <span aria-hidden="true">·</span>
          <span>{isAr ? 'محدّث لحظياً من سجل طلبات الزبناء' : 'Live from customer requests'}</span>
        </div>
      </div>

      {/* 4 Single-Elevation KPI Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isAr ? 'مرات طلب السلع المفقودة' : 'Missing Item Requests'}
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white mt-1.5">
            {totalPeriodRequests}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr ? 'إجمالي تكرار سؤال الزبناء' : 'Total repeat asks'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isAr ? 'سلع غير متوفرة بالمخزون' : 'Unavailable SKUs'}
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1.5">
            {unavailableCount}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr ? 'رصيدها 0 أو غير مسجلة' : 'Zero stock or unlisted'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isAr ? 'المبيعات الضائعة التقديرية' : 'Est. Missed Sales'}
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-1.5">
            {totalUnavailableMissedRevenue.toFixed(0)} {currencySymbol}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr ? 'فرص بيع قابلة للاسترجاع' : 'Recoverable revenue'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isAr ? 'التصنيفات والموردون المقترحون' : 'Active Categories'}
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1.5">
            {categoryBreakdown.length}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr ? 'مربوطة بموردين مفترضين' : 'Mapped to wholesale sources'}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* FOCAL ANCHOR: TOP 5 UNAVAILABLE WEEKLY DEMAND REPORT                  */}
      {/* ===================================================================== */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
              {isAr
                ? 'التقرير الأسبوعي: الـ 5 سلع الأكثر طلباً وغير متوفرة حالياً في المخزون'
                : 'Weekly Report: Top 5 Most-Requested Unavailable Items'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isAr
                ? 'مرتبة حسب تكرار طلب الزبناء مع تصنيف كل سلعة واقتراح أسماء الموردين المفترضين لتوريدها فوراً.'
                : 'Ranked by customer request frequency with automatic category & supplier recommendations.'}
            </p>
          </div>
          <div className="text-xs font-mono tabular-nums font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
            {isAr
              ? `أعلى ${top5UnavailableWeeklyReport.length} / 5 أصناف مفقودة`
              : `Top ${top5UnavailableWeeklyReport.length} / 5`}
          </div>
        </div>

        {top5UnavailableWeeklyReport.length === 0 ? (
          <div className="py-10 px-4 text-center space-y-3 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {isAr
                ? 'ما كايناش سلع مفقودة غير متوفرة مسجلة فـ هاد الفترة'
                : 'No unavailable missing item requests logged in this period'}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {isAr
                ? 'ملي يسول شي زبون على سلعة وما يلقاهاش فـ الحانوت، سجلها بزر "ودن الحانوت" باش تطلع هنا أوتوماتيكياً مع اقتراح المورد ديالها.'
                : 'Log customer requests for out-of-stock items to generate your weekly Top 5 radar.'}
            </p>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('kadi:open-shop-ear-modal'))}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black inline-flex items-center gap-1.5"
            >
              <Mic className="w-4 h-4" />
              <span>{isAr ? 'سجل أول طلب مفقود' : 'Log First Missing Request'}</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {top5UnavailableWeeklyReport.map((item, idx) => {
              const barWidthPct = Math.max(12, Math.round((item.periodCount / maxTop5Freq) * 100));
              const catLabel = isAr
                ? item.classification.categoryLabelAr
                : item.classification.categoryLabelEn;

              return (
                <div
                  key={item.normalizedName}
                  className="py-4 first:pt-1 last:pb-1 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center"
                >
                  {/* Rank & Item Details */}
                  <div className="lg:col-span-5 space-y-1">
                    <div className="flex items-baseline gap-2.5">
                      <span className="text-base font-black font-mono tabular-nums text-amber-600 dark:text-amber-400">
                        0{idx + 1}.
                      </span>
                      <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                        {item.itemName}
                      </h3>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                      <span>{catLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-rose-600 dark:text-rose-400">
                        {item.currentStock === null
                          ? isAr
                            ? 'غير مسجلة في المخزون'
                            : 'Not in catalog'
                          : isAr
                          ? 'نفدت من المخزون (0)'
                          : 'Out of stock (0)'}
                      </span>
                      {item.waitingCustomersCount > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {isAr
                              ? `${item.waitingCustomersCount} زبون كيتسناها`
                              : `${item.waitingCustomersCount} waiting`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Frequency Bar & Metrics */}
                  <div className="lg:col-span-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                      <span className="font-black text-slate-900 dark:text-white">
                        {item.periodCount} {isAr ? 'مرة طلب' : 'requests'}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {item.missedRevenue > 0
                          ? `${item.missedRevenue.toFixed(0)} ${currencySymbol}`
                          : `~${item.estimatedMarginPct}% ${isAr ? 'هامش' : 'margin'}`}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 dark:bg-amber-400 rounded-full transition-all duration-300"
                        style={{ width: `${barWidthPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Assumed Suppliers Based on Category */}
                  <div className="lg:col-span-3 space-y-1">
                    <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                      <span>{isAr ? 'الموردون المفترضون المقترحون:' : 'Suggested Suppliers:'}</span>
                    </div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-snug">
                      {item.suggestedSuppliers.join(' · ')}
                    </div>
                  </div>

                  {/* Quick Restock / Add to Catalog CTA */}
                  <div className="lg:col-span-1 flex lg:justify-end">
                    <button
                      type="button"
                      onClick={() => openQuickStockModal(item)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/70 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-black flex items-center gap-1 whitespace-nowrap transition-colors"
                      title={isAr ? 'توفير وإضافة للمخزون' : 'Add to Inventory'}
                    >
                      <PackagePlus className="w-3.5 h-3.5 shrink-0" />
                      <span>{isAr ? 'توريد' : 'Stock'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* CATEGORY INTELLIGENCE & ASSUMED SUPPLIER DIRECTORY                    */}
      {/* ===================================================================== */}
      {categoryBreakdown.length > 0 && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-500" />
                <span>
                  {isAr
                    ? 'توزيع الطلبات المفقودة حسب التصنيف والمورد المفترض'
                    : 'Demand by Category & Assumed Wholesale Supplier'}
                </span>
              </h2>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2.5 px-3 text-start font-bold">
                    {isAr ? 'تصنيف السلع' : 'Category'}
                  </th>
                  <th className="py-2.5 px-3 text-center font-bold">
                    {isAr ? 'أصناف غير متوفرة' : 'Unavailable Items'}
                  </th>
                  <th className="py-2.5 px-3 text-center font-bold">
                    {isAr ? 'إجمالي تكرار الطلبات' : 'Total Requests'}
                  </th>
                  <th className="py-2.5 px-3 text-start font-bold">
                    {isAr ? 'المورد المقترح الرئيسي' : 'Primary Assumed Supplier'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {categoryBreakdown.map((cat) => (
                  <tr
                    key={cat.key}
                    onClick={() =>
                      setSelectedCategoryKey((prev) => (prev === cat.key ? 'all' : cat.key))
                    }
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                      {cat.label}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">
                      {cat.unavailableItemsCount}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono tabular-nums font-black text-amber-600 dark:text-amber-400">
                      {cat.totalRequests}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300">
                      {cat.primarySupplier}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* FULL MISSING DEMAND FREQUENCY EXPLORER                                */}
      {/* ===================================================================== */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <h2 className="text-base font-black text-slate-900 dark:text-white">
            {isAr ? 'سجل تحليل كافة السلع المفقودة والمطلوبة' : 'Complete Missing Items Frequency Ledger'}
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            {/* Availability filter */}
            <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setAvailabilityMode('unavailable_only')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap transition-colors ${
                  availabilityMode === 'unavailable_only'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {isAr ? 'غير المتوفرة فقط' : 'Unavailable Only'}
              </button>
              <button
                type="button"
                onClick={() => setAvailabilityMode('all_missing')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap transition-colors ${
                  availabilityMode === 'all_missing'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {isAr ? 'كل السلع المطلوبة' : 'All Logged'}
              </button>
            </div>

            {selectedCategoryKey !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedCategoryKey('all')}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50"
              >
                {isAr ? 'إلغاء فلتر التصنيف ×' : 'Clear category ×'}
              </button>
            )}

            {/* Search */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'بحث باسم السلعة أو المورد...' : 'Search item or supplier...'}
                className="w-full ps-8 pe-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
            {isAr ? 'ما كاين حتى عنصر كيطابق هاد البحث أو التصفية.' : 'No matching missing items.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2.5 px-3 text-start font-bold">#</th>
                  <th className="py-2.5 px-3 text-start font-bold">{isAr ? 'السلعة' : 'Item'}</th>
                  <th className="py-2.5 px-3 text-start font-bold">{isAr ? 'التصنيف' : 'Category'}</th>
                  <th className="py-2.5 px-3 text-center font-bold">{isAr ? 'حالة المخزون' : 'Stock Status'}</th>
                  <th className="py-2.5 px-3 text-center font-bold">{isAr ? 'التكرار' : 'Freq.'}</th>
                  <th className="py-2.5 px-3 text-end font-bold">{isAr ? 'مبيعات ضائعة' : 'Missed Rev.'}</th>
                  <th className="py-2.5 px-3 text-start font-bold">{isAr ? 'الموردون المفترضون' : 'Assumed Suppliers'}</th>
                  <th className="py-2.5 px-3 text-center font-bold">{isAr ? 'إجراء' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredRows.map((row, i) => (
                  <tr key={row.normalizedName} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-mono tabular-nums text-slate-400">{i + 1}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">{row.itemName}</td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                      {isAr ? row.classification.categoryLabelAr : row.classification.categoryLabelEn}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono tabular-nums">
                      {row.isUnavailable ? (
                        <span className="font-bold text-rose-600 dark:text-rose-400">
                          {row.currentStock === null
                            ? isAr
                              ? 'غير متوفرة'
                              : 'Unlisted'
                            : '0'}
                        </span>
                      ) : (
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {row.currentStock}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono tabular-nums font-black text-amber-600 dark:text-amber-400">
                      {row.periodCount}x
                    </td>
                    <td className="py-2.5 px-3 text-end font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                      {row.missedRevenue > 0 ? `${row.missedRevenue.toFixed(0)} ${currencySymbol}` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                      {row.suggestedSuppliers.slice(0, 2).join(' · ')}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {row.isUnavailable ? (
                        <button
                          type="button"
                          onClick={() => openQuickStockModal(row)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <ArrowUpRight className="w-3 h-3" />
                          <span>{isAr ? 'جيبها للمخزون' : 'Add Stock'}</span>
                        </button>
                      ) : (
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {isAr ? 'متوفرة' : 'In Stock'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Quick Stock-Add Modal from Radar */}
      {quickStockTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveQuickProduct}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-black text-sm text-slate-900 dark:text-white">
                  {isAr ? `توريد وإضافة: ${quickStockTarget.itemName}` : `Stock Item: ${quickStockTarget.itemName}`}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {quickStockTarget.suggestedSuppliers[0]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickStockTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">
                  {isAr ? `ثمن البيع (${currencySymbol})` : 'Sell Price'}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={quickSellPrice}
                  onChange={(e) => setQuickSellPrice(sanitizeDecimalInput(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">
                  {isAr ? `ثمن الجملة (${currencySymbol})` : 'Cost Price'}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={quickCostPrice}
                  onChange={(e) => setQuickCostPrice(sanitizeDecimalInput(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">
                  {isAr ? 'الكمية' : 'Stock Qty'}
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  required
                  value={quickStockQty}
                  onChange={(e) => setQuickStockQty(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuickStockTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black"
              >
                {isAr ? 'حفظ وزيد للمخزون' : 'Save to Inventory'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
