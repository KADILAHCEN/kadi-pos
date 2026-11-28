import React, { useMemo, useState } from 'react';
import { usePos } from '../../context/PosContext';
import { getLocalTodayYMD } from '../../utils/expenses';
import { exportShopEarWholesalePdf, ShopEarWholesalePdfItem } from '../../utils/exportReports';
import { SupplierInvoice } from '../../types';
import {
  Ear,
  Mic,
  Plus,
  Moon,
  ClipboardList,
  MessageCircle,
  CheckCircle2,
  PackageCheck,
  Copy,
  Check,
  Download,
  Printer,
  Trash2,
  AlertTriangle,
  Phone,
  FileDown,
  Mail,
  Calculator,
  Truck,
  Compass,
  TrendingUp,
  ArrowUpDown,
  Boxes
} from 'lucide-react';

interface AggregatedShopEarItem {
  normalizedName: string;
  itemName: string;
  productId?: string;
  estimatedUnitPrice: number;
  estimatedUnitCost: number;
  todayCount: number;
  weekCount: number;
  totalPendingCount: number;
  waitingCustomersCount: number;
  missedRevenueWeek: number;
  lastRequestedAt: string;
  inCatalogStock: number | null;
  supplierHint: string;
}

interface PricingDraft {
  wholesaleCost: number;
  sellPrice: number;
}

interface ReplenishmentSuggestion {
  key: string;
  itemName: string;
  productId?: string;
  supplierName: string;
  supplierPhone?: string;
  currentStock: number;
  lowStockThreshold: number;
  dailyVelocity: number;
  daysCoverLeft: number | null;
  missedWeekCount: number;
  stockoutEventsCount: number;
  idealOrderQty: number;
  unitCost: number;
  estimatedOrderCost: number;
  urgency: 'critical' | 'high' | 'normal';
  reason: string;
}

interface MarketRadarTrend {
  rank: number;
  itemName: string;
  normalizedName: string;
  productId?: string;
  weekCount: number;
  todayCount: number;
  missedRevenueWeek: number;
  suggestedSuppliers: string[];
  estimatedMarginPct: number;
  urgencyLabel: string;
}

const PRICING_STORAGE_KEY = 'kadi_pos_shop_ear_pricing_v1';

const normalizePhoneForWa = (rawPhone: string): string | null => {
  const digits = rawPhone.replace(/[^\d+]/g, '');
  if (!digits) return null;
  let cleaned = digits.replace(/^\+/, '');
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('0') && cleaned.length >= 9) {
    cleaned = `212${cleaned.slice(1)}`;
  }
  return cleaned.length >= 8 ? cleaned : null;
};

const getRelativeDayLabel = (iso: string, isAr: boolean): string => {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return isAr ? 'مؤخراً' : 'recently';
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const targetStart = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  ).getTime();
  const diffDays = Math.round((todayStart - targetStart) / 86400000);
  if (diffDays <= 0) return isAr ? 'اليوم' : 'today';
  if (diffDays === 1) return isAr ? 'البارح' : 'yesterday';
  return isAr ? `منذ ${diffDays} أيام` : `${diffDays} days ago`;
};

const matchPotentialSuppliers = (
  itemName: string,
  invoices: SupplierInvoice[],
  isAr: boolean
): string[] => {
  const lower = itemName.toLowerCase();
  const matchedFromInvoices = invoices
    .filter(
      (inv) =>
        (inv.notes && inv.notes.toLowerCase().includes(lower)) ||
        inv.supplierName.toLowerCase().includes(lower)
    )
    .map((inv) => inv.supplierName);

  const uniqueInvoiceSuppliers = Array.from(new Set(matchedFromInvoices));
  const categoryMatches: string[] = [];

  if (/(حليب|لبن|ياغورت|رايبي|جبن|فرماج|زبدة|milk|danone|yogurt|lait)/.test(lower)) {
    categoryMatches.push(
      isAr ? 'موزع الحليب ومشتقاته (سنطرال / جودة / كوباك)' : 'Dairy Distributor'
    );
  }
  if (/(كوكا|بيبسي|فانتا|سبرايت|عصير|ماء|سيدي علي|والماس|soda|juice|water|boisson)/.test(lower)) {
    categoryMatches.push(
      isAr ? 'مستودع المشروبات الغازية والمياه' : 'Beverages Wholesaler'
    );
  }
  if (/(شاي|أتاي|قهوة|سكر|زيت|دقيق|طماطم|أرز|مقرونة|عدس|فاصوليا|tea|sugar|oil|flour)/.test(lower)) {
    categoryMatches.push(
      isAr ? 'تاجر جملة المواد الغذائية الأساسية (درب عمر / سوق الجملة)' : 'Dry Groceries Wholesaler'
    );
  }
  if (/(جافيل|أومو|تيد|صابون|شامبو|نظافة|منظف|حفاضات|بامبرز|detergent|soap|clean)/.test(lower)) {
    categoryMatches.push(
      isAr ? 'مورد مواد التنظيف والعناية الشخصية' : 'Cleaning & Care Supplier'
    );
  }
  if (/(بيمو|شوكولا|بسكويت|حلوة|علكة|شيبس|كيك|chocolate|biscuit|snack)/.test(lower)) {
    categoryMatches.push(
      isAr ? 'موزع البسكويت والحلويات (بيمو / أولي)' : 'Snacks & Confectionery Distributor'
    );
  }
  if (/(خبز|كرواصة|مسمن|بيض|دجاج|لاندون|كاشير|bread|egg)/.test(lower)) {
    categoryMatches.push(
      isAr ? 'موزع المخبز والبيض واللحوم المحولة' : 'Fresh & Bakery Supplier'
    );
  }

  if (categoryMatches.length === 0) {
    categoryMatches.push(
      isAr ? 'سوق الجملة العام / المورد المعتمد' : 'General Wholesale Market'
    );
  }

  return Array.from(new Set([...uniqueInvoiceSuppliers, ...categoryMatches])).slice(0, 3);
};

export const ShopEarView: React.FC = () => {
  const {
    shopEarRequests,
    addShopEarRequest,
    markShopEarItemArrived,
    markShopEarNotified,
    deleteShopEarRequest,
    clearNotifiedShopEarRequests,
    products,
    orders,
    stockMovements,
    supplierInvoices,
    settings,
    currencySymbol,
    language
  } = usePos();

  const isAr = language === 'ar';
  const todayYMD = getLocalTodayYMD();
  const currentHour = new Date().getHours();
  const isEvening = currentHour >= 18 || currentHour < 5;

  const [copiedWholesale, setCopiedWholesale] = useState(false);
  const [pdfFeedback, setPdfFeedback] = useState<string | null>(null);
  const [inlinePhones, setInlinePhones] = useState<Record<string, string>>({});
  const [restockQuantities, setRestockQuantities] = useState<Record<string, number>>({});
  const [logFilter, setLogFilter] = useState<'all' | 'pending' | 'arrived' | 'notified'>('all');
  const [highDemandOnly, setHighDemandOnly] = useState(false);
  const [wholesaleSortBy, setWholesaleSortBy] = useState<'demand' | 'margin'>('demand');

  const [pricingOverrides, setPricingOverrides] = useState<Record<string, PricingDraft>>(() => {
    try {
      const saved = localStorage.getItem(PRICING_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const updateItemPricing = (
    normalizedName: string,
    field: 'wholesaleCost' | 'sellPrice',
    value: number,
    fallbackCost: number,
    fallbackSell: number
  ) => {
    setPricingOverrides((prev) => {
      const current = prev[normalizedName] || {
        wholesaleCost: fallbackCost,
        sellPrice: fallbackSell
      };
      const updated = {
        ...prev,
        [normalizedName]: {
          ...current,
          [field]: Math.max(0, value)
        }
      };
      try {
        localStorage.setItem(PRICING_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ignore storage limits
      }
      return updated;
    });
  };

  // 7-day and 30-day boundary timestamps
  const sevenDaysAgoMs = useMemo(() => Date.now() - 7 * 86400000, []);
  const thirtyDaysAgoMs = useMemo(() => Date.now() - 30 * 86400000, []);

  // Aggregate demand by product/item name
  const aggregatedDemand = useMemo<AggregatedShopEarItem[]>(() => {
    const map = new Map<string, AggregatedShopEarItem>();

    shopEarRequests.forEach((req) => {
      const reqMs = new Date(req.requestedAt).getTime();
      const isToday = req.dateKey === todayYMD;
      const isThisWeek = !Number.isNaN(reqMs) && reqMs >= sevenDaysAgoMs;

      const matchedProd =
        (req.productId ? products.find((p) => p.id === req.productId) : undefined) ||
        products.find((p) => p.name.trim().toLowerCase() === req.itemName.trim().toLowerCase());

      const unitPrice = req.estimatedUnitPrice ?? matchedProd?.price ?? 0;
      const unitCost = matchedProd?.costPrice ?? (unitPrice > 0 ? Number((unitPrice * 0.78).toFixed(2)) : 0);

      const existing = map.get(req.normalizedName);
      if (existing) {
        if (req.status === 'pending') {
          existing.totalPendingCount += 1;
          if (req.customerName || req.customerPhone) existing.waitingCustomersCount += 1;
        }
        if (isToday && req.status !== 'notified') existing.todayCount += 1;
        if (isThisWeek && req.status !== 'notified') {
          existing.weekCount += 1;
          existing.missedRevenueWeek = Number(
            (existing.missedRevenueWeek + unitPrice).toFixed(2)
          );
        }
        if (req.requestedAt > existing.lastRequestedAt) {
          existing.lastRequestedAt = req.requestedAt;
        }
        if (!existing.productId && matchedProd) {
          existing.productId = matchedProd.id;
          existing.inCatalogStock = matchedProd.stock;
        }
        if (existing.estimatedUnitPrice <= 0 && unitPrice > 0) {
          existing.estimatedUnitPrice = unitPrice;
          existing.estimatedUnitCost = unitCost;
        }
      } else {
        const suppliers = matchPotentialSuppliers(req.itemName, supplierInvoices, isAr);
        map.set(req.normalizedName, {
          normalizedName: req.normalizedName,
          itemName: req.itemName,
          productId: req.productId || matchedProd?.id,
          estimatedUnitPrice: unitPrice,
          estimatedUnitCost: unitCost,
          todayCount: isToday && req.status !== 'notified' ? 1 : 0,
          weekCount: isThisWeek && req.status !== 'notified' ? 1 : 0,
          totalPendingCount: req.status === 'pending' ? 1 : 0,
          waitingCustomersCount:
            req.status === 'pending' && (req.customerName || req.customerPhone) ? 1 : 0,
          missedRevenueWeek: isThisWeek && req.status !== 'notified' ? unitPrice : 0,
          lastRequestedAt: req.requestedAt,
          inCatalogStock: matchedProd ? matchedProd.stock : null,
          supplierHint: suppliers[0] || ''
        });
      }
    });

    return Array.from(map.values()).sort(
      (a, b) =>
        b.totalPendingCount - a.totalPendingCount ||
        b.weekCount - a.weekCount ||
        b.todayCount - a.todayCount
    );
  }, [shopEarRequests, products, supplierInvoices, todayYMD, sevenDaysAgoMs, isAr]);

  // Wholesale sheet items enriched with live profit margin calculator metrics
  const wholesaleRows = useMemo(() => {
    const base = aggregatedDemand.filter((item) => {
      if (item.totalPendingCount <= 0) return false;
      if (highDemandOnly) {
        return Math.max(item.weekCount, item.totalPendingCount) >= 2 || item.todayCount >= 1;
      }
      return true;
    });

    const enriched = base.map((it) => {
      const defaultQty = Math.max(6, Math.max(it.weekCount, it.totalPendingCount) * 2);
      const qtyInput = restockQuantities[it.normalizedName] ?? defaultQty;

      const defaultSell = it.estimatedUnitPrice > 0 ? it.estimatedUnitPrice : 10;
      const defaultCost =
        it.estimatedUnitCost > 0
          ? it.estimatedUnitCost
          : Number((defaultSell * 0.78).toFixed(2));

      const override = pricingOverrides[it.normalizedName];
      const sellPrice = override?.sellPrice ?? defaultSell;
      const wholesaleCost = override?.wholesaleCost ?? defaultCost;

      const unitProfit = Math.max(0, Number((sellPrice - wholesaleCost).toFixed(2)));
      const marginPct = sellPrice > 0 ? Math.round((unitProfit / sellPrice) * 100) : 0;
      const expectedTotalProfit = Number((unitProfit * qtyInput).toFixed(2));

      return {
        ...it,
        qtyInput,
        sellPrice,
        wholesaleCost,
        unitProfit,
        marginPct,
        expectedTotalProfit
      };
    });

    return enriched.sort((a, b) => {
      if (wholesaleSortBy === 'margin') {
        return (
          b.expectedTotalProfit - a.expectedTotalProfit ||
          b.marginPct - a.marginPct ||
          b.weekCount - a.weekCount
        );
      }
      return (
        b.totalPendingCount - a.totalPendingCount ||
        b.weekCount - a.weekCount ||
        b.expectedTotalProfit - a.expectedTotalProfit
      );
    });
  }, [
    aggregatedDemand,
    highDemandOnly,
    restockQuantities,
    pricingOverrides,
    wholesaleSortBy
  ]);

  // =========================================================================
  // SMART REPLENISHMENT PREDICTOR ("تنبؤ التوريد الذكي حسب المورد")
  // Analyzes 30d sales velocity, historical stockouts & Shop Ear demand
  // =========================================================================
  const replenishmentBySupplier = useMemo(() => {
    const prodSales30d = new Map<string, number>();
    orders.forEach((o) => {
      if (o.status !== 'completed') return;
      const ms = new Date(o.date).getTime();
      if (Number.isNaN(ms) || ms < thirtyDaysAgoMs) return;
      o.items.forEach((it) => {
        prodSales30d.set(it.productId, (prodSales30d.get(it.productId) || 0) + it.quantity);
      });
    });

    const prodStockoutEvents = new Map<string, number>();
    stockMovements.forEach((mv) => {
      if (mv.newStock <= 0 && mv.quantityChange < 0) {
        prodStockoutEvents.set(mv.productId, (prodStockoutEvents.get(mv.productId) || 0) + 1);
      }
    });

    const shopEarByProductId = new Map<string, AggregatedShopEarItem>();
    const unmatchedShopEar: AggregatedShopEarItem[] = [];
    aggregatedDemand.forEach((it) => {
      if (it.totalPendingCount <= 0 && it.weekCount <= 0) return;
      if (it.productId) {
        shopEarByProductId.set(it.productId, it);
      } else {
        unmatchedShopEar.push(it);
      }
    });

    const suggestions: ReplenishmentSuggestion[] = [];

    // 1. Catalog products that are out of stock, low stock, or frequently stocked out / requested
    products.forEach((p) => {
      const sold30 = prodSales30d.get(p.id) || 0;
      const dailyVelocity = sold30 / 30;
      const ear = shopEarByProductId.get(p.id);
      const missedWeekCount = ear?.weekCount || ear?.totalPendingCount || 0;
      const stockoutEvents = prodStockoutEvents.get(p.id) || 0;
      const daysCoverLeft =
        dailyVelocity > 0.05 ? Number((p.stock / dailyVelocity).toFixed(1)) : null;

      const isAtRisk =
        p.stock <= 0 ||
        p.stock <= p.lowStockThreshold ||
        missedWeekCount > 0 ||
        (daysCoverLeft !== null && daysCoverLeft <= 7);

      if (!isAtRisk) return;

      // Ideal order for 14 days safety coverage + missed customer demand buffer - current stock
      const demandBuffer = Math.ceil(dailyVelocity * 14) + missedWeekCount * 2;
      const thresholdTarget = Math.max(p.lowStockThreshold * 2, 8);
      const idealOrderQty = Math.max(4, Math.max(demandBuffer, thresholdTarget) - Math.max(0, p.stock));

      const matchedSuppliers = matchPotentialSuppliers(p.name, supplierInvoices, isAr);
      const supplierName = matchedSuppliers[0];
      const matchedInv = supplierInvoices.find((inv) => inv.supplierName === supplierName);

      const urgency: ReplenishmentSuggestion['urgency'] =
        p.stock <= 0 || missedWeekCount >= 2
          ? 'critical'
          : (daysCoverLeft !== null && daysCoverLeft <= 4) || p.stock <= p.lowStockThreshold
          ? 'high'
          : 'normal';

      const reasonParts: string[] = [];
      if (p.stock <= 0) reasonParts.push(isAr ? 'نفاد تام من المخزون (0)' : 'Out of stock (0)');
      else if (daysCoverLeft !== null)
        reasonParts.push(
          isAr ? `يكفي لـ ${daysCoverLeft} يوم فقط` : `${daysCoverLeft}d cover left`
        );
      if (missedWeekCount > 0)
        reasonParts.push(
          isAr ? `${missedWeekCount} طلبات ضائعة هذا الأسبوع` : `${missedWeekCount} missed reqs`
        );
      if (stockoutEvents > 0)
        reasonParts.push(
          isAr ? `تكرر النفاد ${stockoutEvents} مرات` : `${stockoutEvents} historical stockouts`
        );

      suggestions.push({
        key: `prod:${p.id}`,
        itemName: p.name,
        productId: p.id,
        supplierName,
        supplierPhone: matchedInv?.supplierPhone,
        currentStock: p.stock,
        lowStockThreshold: p.lowStockThreshold,
        dailyVelocity: Number(dailyVelocity.toFixed(2)),
        daysCoverLeft,
        missedWeekCount,
        stockoutEventsCount: stockoutEvents,
        idealOrderQty,
        unitCost: p.costPrice,
        estimatedOrderCost: Number((idealOrderQty * p.costPrice).toFixed(2)),
        urgency,
        reason: reasonParts.join(' · ') || (isAr ? 'مقترح لتفادي الانقطاع' : 'Prevent stockout')
      });
    });

    // 2. Unmatched Shop Ear items requested by customers
    unmatchedShopEar.forEach((it) => {
      const suppliers = matchPotentialSuppliers(it.itemName, supplierInvoices, isAr);
      const supplierName = suppliers[0];
      const matchedInv = supplierInvoices.find((inv) => inv.supplierName === supplierName);
      const demand = Math.max(it.weekCount, it.totalPendingCount);
      const idealOrderQty = Math.max(6, demand * 3);
      const override = pricingOverrides[it.normalizedName];
      const unitCost =
        override?.wholesaleCost ??
        (it.estimatedUnitCost > 0
          ? it.estimatedUnitCost
          : Number(((it.estimatedUnitPrice || 10) * 0.78).toFixed(2)));

      suggestions.push({
        key: `ear:${it.normalizedName}`,
        itemName: it.itemName,
        supplierName,
        supplierPhone: matchedInv?.supplierPhone,
        currentStock: 0,
        lowStockThreshold: 2,
        dailyVelocity: Number((demand / 7).toFixed(2)),
        daysCoverLeft: 0,
        missedWeekCount: demand,
        stockoutEventsCount: demand,
        idealOrderQty,
        unitCost,
        estimatedOrderCost: Number((idealOrderQty * unitCost).toFixed(2)),
        urgency: demand >= 3 ? 'critical' : 'high',
        reason: isAr
          ? `غير مسجل بالمخزون · ${demand} طلبات من الزبناء (ودن الحانوت)`
          : `Unstocked · ${demand} customer requests`
      });
    });

    // Group suggestions by supplier
    const groupMap = new Map<
      string,
      {
        supplierName: string;
        supplierPhone?: string;
        items: ReplenishmentSuggestion[];
        totalOrderQty: number;
        totalEstimatedCost: number;
        criticalCount: number;
      }
    >();

    suggestions
      .sort((a, b) => {
        const rank = { critical: 0, high: 1, normal: 2 };
        if (rank[a.urgency] !== rank[b.urgency]) return rank[a.urgency] - rank[b.urgency];
        return b.missedWeekCount - a.missedWeekCount || b.dailyVelocity - a.dailyVelocity;
      })
      .forEach((sg) => {
        const prev = groupMap.get(sg.supplierName);
        if (prev) {
          prev.items.push(sg);
          prev.totalOrderQty += sg.idealOrderQty;
          prev.totalEstimatedCost = Number(
            (prev.totalEstimatedCost + sg.estimatedOrderCost).toFixed(2)
          );
          if (sg.urgency === 'critical') prev.criticalCount += 1;
        } else {
          groupMap.set(sg.supplierName, {
            supplierName: sg.supplierName,
            supplierPhone: sg.supplierPhone,
            items: [sg],
            totalOrderQty: sg.idealOrderQty,
            totalEstimatedCost: sg.estimatedOrderCost,
            criticalCount: sg.urgency === 'critical' ? 1 : 0
          });
        }
      });

    return Array.from(groupMap.values()).sort(
      (a, b) => b.criticalCount - a.criticalCount || b.items.length - a.items.length
    );
  }, [
    products,
    orders,
    stockMovements,
    supplierInvoices,
    aggregatedDemand,
    pricingOverrides,
    thirtyDaysAgoMs,
    isAr
  ]);

  // =========================================================================
  // WEEKLY MARKET TRENDS RADAR ("رادار اتجاهات السوق الأسبوعي — أكثر 5 سلع طلباً")
  // =========================================================================
  const weeklyMarketRadar = useMemo<MarketRadarTrend[]>(() => {
    const candidates = aggregatedDemand
      .filter((it) => it.weekCount > 0 || it.totalPendingCount > 0)
      .slice(0, 5);

    return candidates.map((it, idx) => {
      const demandCount = Math.max(it.weekCount, it.totalPendingCount);
      const override = pricingOverrides[it.normalizedName];
      const sell = override?.sellPrice ?? (it.estimatedUnitPrice > 0 ? it.estimatedUnitPrice : 10);
      const cost =
        override?.wholesaleCost ??
        (it.estimatedUnitCost > 0 ? it.estimatedUnitCost : Number((sell * 0.78).toFixed(2)));
      const marginPct = sell > 0 ? Math.max(0, Math.round(((sell - cost) / sell) * 100)) : 22;

      return {
        rank: idx + 1,
        itemName: it.itemName,
        normalizedName: it.normalizedName,
        productId: it.productId,
        weekCount: demandCount,
        todayCount: it.todayCount,
        missedRevenueWeek: it.missedRevenueWeek,
        suggestedSuppliers: matchPotentialSuppliers(it.itemName, supplierInvoices, isAr),
        estimatedMarginPct: marginPct,
        urgencyLabel:
          demandCount >= 4
            ? isAr
              ? 'طلب مرتفع جداً'
              : 'Very High Demand'
            : demandCount >= 2
            ? isAr
              ? 'نمو سريع'
              : 'Fast Growing'
            : isAr
            ? 'فرصة جديدة'
            : 'Emerging Trend'
      };
    });
  }, [aggregatedDemand, supplierInvoices, pricingOverrides, isAr]);

  // Nightly summary highlights
  const nightlySummaryItems = useMemo(
    () =>
      aggregatedDemand
        .filter((it) => it.todayCount > 0 || it.weekCount > 0)
        .sort((a, b) => b.todayCount - a.todayCount || b.weekCount - a.weekCount)
        .slice(0, 6),
    [aggregatedDemand]
  );

  const totalTodayRequests = useMemo(
    () => shopEarRequests.filter((r) => r.dateKey === todayYMD).length,
    [shopEarRequests, todayYMD]
  );

  const totalWeekRequests = useMemo(
    () =>
      shopEarRequests.filter((r) => {
        const ms = new Date(r.requestedAt).getTime();
        return !Number.isNaN(ms) && ms >= sevenDaysAgoMs;
      }).length,
    [shopEarRequests, sevenDaysAgoMs]
  );

  const totalEstimatedLostRevenue = useMemo(
    () =>
      Number(
        nightlySummaryItems.reduce((s, it) => s + it.missedRevenueWeek, 0).toFixed(2)
      ),
    [nightlySummaryItems]
  );

  const totalWholesaleExpectedProfit = useMemo(
    () =>
      Number(
        wholesaleRows.reduce((s, row) => s + row.expectedTotalProfit, 0).toFixed(2)
      ),
    [wholesaleRows]
  );

  // Arrived items ready to notify waiting customers via WhatsApp
  const arrivedReadyToNotify = useMemo(() => {
    return shopEarRequests.filter((req) => {
      if (req.status === 'arrived') return true;
      if (req.status === 'pending' && req.productId) {
        const prod = products.find((p) => p.id === req.productId);
        if (prod && prod.stock > 0) return true;
      }
      return false;
    });
  }, [shopEarRequests, products]);

  const filteredLog = useMemo(() => {
    return shopEarRequests.filter((r) => {
      if (logFilter === 'all') return true;
      return r.status === logFilter;
    });
  }, [shopEarRequests, logFilter]);

  const buildWholesaleSheetText = (): string => {
    const storeName = settings.storeName || 'الحانوت';
    const header = `📝 ورقة ودن الحانوت - قائمة تسوق الجملة (${storeName})`;
    const dateLine = `📅 التاريخ: ${todayYMD}${highDemandOnly ? ' | تصفية: الأكثر طلباً فقط' : ''}`;
    const divider = `--------------------------------`;
    if (wholesaleRows.length === 0) {
      return `${header}\n${dateLine}\n${divider}\nما كاين حتى نقص مسجل دابا.`;
    }
    const lines = wholesaleRows.map((it, idx) => {
      return `${idx + 1}. ${it.itemName} — الطلب: ${it.weekCount || it.totalPendingCount} (${it.todayCount} اليوم) | الكمية المقترحة: ${it.qtyInput} | ربح متوقع: +${it.expectedTotalProfit.toFixed(0)} ${currencySymbol} (${it.marginPct}%) | المورد: ${it.supplierHint}`;
    });
    const footer = `\n💰 إجمالي الربح المتوقع من هذه الورقة: +${totalWholesaleExpectedProfit.toFixed(2)} ${currencySymbol}`;
    return [header, dateLine, divider, ...lines, footer].join('\n');
  };

  const mailtoWholesaleHref = useMemo(() => {
    const storeName = settings.storeName || 'Kadi POS';
    const subject = isAr
      ? `قائمة تسوق الجملة — ودن الحانوت (${storeName}) · ${todayYMD}`
      : `Shop Ear Wholesale List (${storeName}) · ${todayYMD}`;
    return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
      buildWholesaleSheetText()
    )}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wholesaleRows, highDemandOnly, todayYMD, settings.storeName, currencySymbol, isAr]);

  const handleCopyWholesale = async () => {
    try {
      await navigator.clipboard.writeText(buildWholesaleSheetText());
      setCopiedWholesale(true);
      window.setTimeout(() => setCopiedWholesale(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDownloadWholesale = () => {
    const txt = buildWholesaleSheetText();
    const blob = new Blob([`\uFEFF${txt}`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `warqat-wden-lhanout-${todayYMD}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportWholesalePdf = () => {
    const pdfItems: ShopEarWholesalePdfItem[] = wholesaleRows.map((row) => ({
      itemName: row.itemName,
      todayCount: row.todayCount,
      weekCount: row.weekCount || row.totalPendingCount,
      recommendedQty: row.qtyInput,
      wholesaleUnitCost: row.wholesaleCost,
      suggestedSellPrice: row.sellPrice,
      expectedTotalProfit: row.expectedTotalProfit,
      marginPct: row.marginPct,
      supplierHint: row.supplierHint
    }));

    const filename = exportShopEarWholesalePdf({
      items: pdfItems,
      settings,
      currencySymbol,
      language,
      highDemandOnly
    });
    setPdfFeedback(
      isAr ? `تم إنشاء ملف PDF للجملة: ${filename}` : `Exported PDF: ${filename}`
    );
    window.setTimeout(() => setPdfFeedback(null), 4000);
  };

  const openQuickModal = () => {
    window.dispatchEvent(new CustomEvent('kadi:open-shop-ear-modal'));
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-3 sm:p-6 space-y-5">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
            <Ear className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {isAr ? 'ودن الحانوت — السلعة المطلوبة وتوريد الجملة' : 'Shop Ear — Missing Items & Replenishment'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {isAr
                ? 'سجل أي سلعة سول عليها زبون · ورقة الجملة مع حاسبة الهامش الربحي · تنبؤ التوريد الذكي · رادار اتجاهات السوق.'
                : 'Voice/manual missed item logging · Wholesale sheet with margin calculator · Smart replenishment · Market radar.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={openQuickModal}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs sm:text-sm font-black flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <Mic className="w-4 h-4" />
            <span>{isAr ? 'زر ودن الحانوت (+ بالصوت أو الكتابة)' : 'Log Missing Item'}</span>
          </button>
        </div>
      </div>

      {pdfFeedback && (
        <div className="px-4 py-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{pdfFeedback}</span>
        </div>
      )}

      {/* Top 4 KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
            {isAr ? 'سولو عليها اليوم' : 'Asked Today'}
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white mt-1.5">
            {totalTodayRequests}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr ? 'طلبات مسجلة اليوم' : 'Requests logged today'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
            {isAr ? 'هاد السيمانة (7 أيام)' : 'This Week (7d)'}
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1.5">
            {totalWeekRequests}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr ? `${wholesaleRows.length} أصناف خاصهم يجيو` : `${wholesaleRows.length} distinct items`}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
            {isAr ? 'ربح متوقع إلى جبتيها' : 'Expected Wholesale Profit'}
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1.5">
            +{totalWholesaleExpectedProfit.toFixed(0)} {currencySymbol}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr ? 'بناءً على حاسبة الهامش الربحي' : 'From margin calculator'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
            {isAr ? 'فلوس ضايعة تقديرياً' : 'Est. Missed Sales'}
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-1.5">
            {totalEstimatedLostRevenue.toFixed(0)} {currencySymbol}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr ? `${arrivedReadyToNotify.length} جاهزة لإشعار الواتساب` : `${arrivedReadyToNotify.length} ready to notify`}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* WHATSAPP BACK-IN-STOCK NOTIFICATIONS */}
      {/* ===================================================================== */}
      {arrivedReadyToNotify.length > 0 && (
        <section className="bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-800 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-black text-emerald-950 dark:text-emerald-200 flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>
                  {isAr
                    ? 'صيفط ليه مني تجيبها — رجّع الزبون عندك'
                    : 'Back in Stock — Send WhatsApp to Customers'}
                </span>
              </h2>
              <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
                {isAr
                  ? 'هاد السلع راه ولاو متوفرين، صيفط رسالة واتساب جاهزة للزبناء اللي سولو عليهم.'
                  : 'These requested items are now stocked. Notify waiting customers with 1 tap.'}
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-black font-mono tabular-nums">
              {arrivedReadyToNotify.length}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {arrivedReadyToNotify.map((req) => {
              const custDisplay = req.customerName || (isAr ? 'الزبون' : 'Customer');
              const whenLabel = getRelativeDayLabel(req.requestedAt, isAr);
              const activePhone =
                inlinePhones[req.id] !== undefined ? inlinePhones[req.id] : req.customerPhone || '';
              const waPhone = normalizePhoneForWa(activePhone);
              const waText = isAr
                ? `السلام ${custDisplay}، راه جات ديك السلعة اللي سولتي عليها (${req.itemName})، أجي خودها من ${
                    settings.storeName || 'المحل'
                  }. مرحبا بيك!`
                : `Bonjour ${custDisplay}, l'article que vous avez demandé (${req.itemName}) est maintenant disponible chez ${
                    settings.storeName || 'notre boutique'
                  } !`;

              return (
                <div
                  key={req.id}
                  className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/80 rounded-xl p-3.5 flex flex-col justify-between gap-3"
                >
                  <div>
                    <p className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white leading-relaxed">
                      {isAr
                        ? `${custDisplay} سول على "${req.itemName}" ${whenLabel} و ما لقاهاش، واش نصيفط ليه بلي راه جات؟`
                        : `${custDisplay} asked for "${req.itemName}" ${whenLabel} and didn't find it. Notify via WhatsApp?`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="relative flex-1 min-w-[140px]">
                      <Phone className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-2.5 pointer-events-none" />
                      <input
                        type="tel"
                        value={activePhone}
                        onChange={(e) =>
                          setInlinePhones((prev) => ({ ...prev, [req.id]: e.target.value }))
                        }
                        placeholder="06XXXXXXXX"
                        className="w-full ps-8 pe-2.5 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-slate-900 dark:text-white"
                      />
                    </div>

                    {waPhone ? (
                      <a
                        href={`https://wa.me/${waPhone}?text=${encodeURIComponent(waText)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => markShopEarNotified(req.id, activePhone)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>{isAr ? 'صيفط ليه واتساب' : 'Send WhatsApp'}</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => markShopEarNotified(req.id)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold whitespace-nowrap"
                      >
                        {isAr ? 'تم الإخبار يدوياً' : 'Mark Notified'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* WEEKLY MARKET TRENDS RADAR ("رادار اتجاهات السوق الأسبوعي") */}
      {/* ===================================================================== */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Compass className="w-5 h-5 text-amber-500" />
              <span>
                {isAr
                  ? 'رادار اتجاهات السوق الأسبوعي — أكثر 5 سلع طلباً وغير متوفرة'
                  : 'Weekly Market Trends Radar — Top 5 Unavailable Demand'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isAr
                ? 'تحليل ذكي لأعلى 5 سلع طلبها الزبناء هاد الأسبوع وما لقاوهاش، مع اقتراح الموردين المحتملين والهامش الربحي.'
                : 'Weekly Top 5 most-requested unavailable items paired with likely wholesale suppliers.'}
            </p>
          </div>
          <span className="text-xs font-bold text-amber-700 dark:text-amber-300 font-mono tabular-nums whitespace-nowrap">
            {isAr ? 'تحديث أسبوعي حي (7 أيام)' : 'Live 7-Day Radar'}
          </span>
        </div>

        {weeklyMarketRadar.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            {isAr
              ? 'مازال ما كايناش طلبات كافية هاد الأسبوع لرسم رادار السوق. سجل طلبات الزبناء بزر «ودن الحانوت».'
              : 'Not enough weekly Shop Ear logs yet for the Market Radar.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            {weeklyMarketRadar.map((trend) => (
              <div
                key={trend.normalizedName}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex flex-col justify-between gap-2.5"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black font-mono tabular-nums text-amber-600 dark:text-amber-400">
                      #{trend.rank}
                    </span>
                    <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                      {trend.urgencyLabel}
                    </span>
                  </div>
                  <div className="text-sm font-black text-slate-900 dark:text-white leading-snug">
                    {trend.itemName}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                    {isAr
                      ? `${trend.weekCount} طلب هاد السيمانة · ربح ~${trend.estimatedMarginPct}%`
                      : `${trend.weekCount} weekly reqs · ~${trend.estimatedMarginPct}% margin`}
                  </div>
                  {trend.missedRevenueWeek > 0 && (
                    <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400 font-mono tabular-nums">
                      {isAr ? 'مبيعات ضائعة:' : 'Missed:'} {trend.missedRevenueWeek.toFixed(0)} {currencySymbol}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-700/70 space-y-1">
                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Truck className="w-3 h-3 shrink-0" />
                    <span>{isAr ? 'المورد المقترح:' : 'Suggested Supplier:'}</span>
                  </div>
                  <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 leading-tight">
                    {trend.suggestedSuppliers[0]}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* WHOLESALE SHOPPING SHEET + MARGIN CALCULATOR + PDF & EMAIL */}
      {/* ===================================================================== */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-amber-500" />
              <span>
                {isAr
                  ? 'ورقة ودن الحانوت — قائمة تسوق الجملة وحاسبة الهامش الربحي'
                  : 'Shop Ear Wholesale Sheet & Expected Margin Calculator'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isAr
                ? 'أدخل سعر الجملة التقريبي وسعر البيع المقترح باش ترتب الأولويات حسب أعلى ربح، ومن بعد صدّر القائمة PDF أو أرسلها بالإيميل.'
                : 'Enter estimated wholesale cost and retail price to prioritize high-margin items, then export to PDF or Email.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* High demand filter toggle */}
            <button
              type="button"
              onClick={() => setHighDemandOnly((v) => !v)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors whitespace-nowrap ${
                highDemandOnly
                  ? 'bg-amber-500 border-amber-500 text-slate-950'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
              }`}
            >
              {isAr
                ? highDemandOnly
                  ? 'الأكثر طلباً فقط ✓'
                  : 'تصفية: الأكثر طلباً'
                : highDemandOnly
                ? 'High Demand Only ✓'
                : 'Filter: High Demand'}
            </button>

            {/* Sort toggle: demand vs margin */}
            <button
              type="button"
              onClick={() =>
                setWholesaleSortBy((s) => (s === 'demand' ? 'margin' : 'demand'))
              }
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-amber-500" />
              <span>
                {wholesaleSortBy === 'margin'
                  ? isAr
                    ? 'الترتيب: أعلى هامش ربح'
                    : 'Sort: Highest Margin'
                  : isAr
                  ? 'الترتيب: الأكثر طلباً'
                  : 'Sort: Top Demand'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleExportWholesalePdf}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>{isAr ? 'تصدير PDF للجملة' : 'Wholesale PDF'}</span>
            </button>

            <a
              href={mailtoWholesaleHref}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>{isAr ? 'إرسال بالإيميل' : 'Send Email'}</span>
            </a>

            <button
              type="button"
              onClick={() => void handleCopyWholesale()}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
            >
              {copiedWholesale ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedWholesale ? (isAr ? 'تم النسخ' : 'Copied') : isAr ? 'نسخ' : 'Copy'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadWholesale}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>TXT</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isAr ? 'طباعة' : 'Print'}</span>
            </button>
          </div>
        </div>

        {/* Profit Margin Calculator Summary Strip */}
        {wholesaleRows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs">
            <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
              <Calculator className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                {isAr
                  ? `حاسبة الهامش الربحي: ${wholesaleRows.length} أصناف جاهزة للشراء من الجملة`
                  : `Margin Calculator: ${wholesaleRows.length} wholesale items`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
              <span className="text-slate-600 dark:text-slate-300">
                {isAr ? 'رأس مال الجملة:' : 'Cost:'}{' '}
                <strong className="text-slate-900 dark:text-white">
                  {wholesaleRows
                    .reduce((s, r) => s + r.wholesaleCost * r.qtyInput, 0)
                    .toFixed(0)}{' '}
                  {currencySymbol}
                </strong>
              </span>
              <span className="text-emerald-700 dark:text-emerald-400 font-black">
                {isAr ? 'صافي الربح المتوقع:' : 'Expected Net Profit:'} +
                {totalWholesaleExpectedProfit.toFixed(0)} {currencySymbol}
              </span>
            </div>
          </div>
        )}

        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3 font-bold text-start">{isAr ? 'السلعة والمورد' : 'Item & Supplier'}</th>
                <th className="py-2.5 px-3 font-bold text-end">{isAr ? 'الطلب (7أ)' : '7d Req'}</th>
                <th className="py-2.5 px-3 font-bold text-end">{isAr ? 'الكمية' : 'Qty'}</th>
                <th className="py-2.5 px-3 font-bold text-end">{isAr ? 'ثمن الجملة' : 'Buy Cost'}</th>
                <th className="py-2.5 px-3 font-bold text-end">{isAr ? 'ثمن البيع' : 'Sell Price'}</th>
                <th className="py-2.5 px-3 font-bold text-end">{isAr ? 'الربح المتوقع (الهامش)' : 'Expected Profit'}</th>
                <th className="py-2.5 px-3 font-bold text-end">{isAr ? 'مني تجيبها' : 'Restock'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {wholesaleRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 dark:text-slate-400">
                    {isAr
                      ? 'ورقة الجملة خاوية حسب التصفية المختارة — كل السلع المطلوبة متوفرة.'
                      : 'Wholesale list is empty for the active filter.'}
                  </td>
                </tr>
              ) : (
                wholesaleRows.map((it) => (
                  <tr key={it.normalizedName} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900 dark:text-white">{it.itemName}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {it.supplierHint}
                        {it.waitingCustomersCount > 0 &&
                          ` · ${it.waitingCustomersCount} ${isAr ? 'زبون كيتسنى' : 'waiting'}`}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-end font-mono font-black tabular-nums text-amber-600 dark:text-amber-400">
                      {it.weekCount || it.totalPendingCount}
                      <div className="text-[10px] font-normal text-slate-500">
                        {it.todayCount} {isAr ? 'اليوم' : 'td'}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-end">
                      <input
                        type="number"
                        min="1"
                        value={it.qtyInput}
                        onChange={(e) =>
                          setRestockQuantities((prev) => ({
                            ...prev,
                            [it.normalizedName]: Math.max(1, Number(e.target.value) || 1)
                          }))
                        }
                        className="w-14 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-end font-mono tabular-nums text-xs text-slate-900 dark:text-white"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-end">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={it.wholesaleCost}
                        onChange={(e) =>
                          updateItemPricing(
                            it.normalizedName,
                            'wholesaleCost',
                            Number(e.target.value) || 0,
                            it.wholesaleCost,
                            it.sellPrice
                          )
                        }
                        className="w-16 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-end font-mono tabular-nums text-xs text-slate-900 dark:text-white"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-end">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={it.sellPrice}
                        onChange={(e) =>
                          updateItemPricing(
                            it.normalizedName,
                            'sellPrice',
                            Number(e.target.value) || 0,
                            it.wholesaleCost,
                            it.sellPrice
                          )
                        }
                        className="w-16 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-end font-mono tabular-nums text-xs text-slate-900 dark:text-white"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-end font-mono tabular-nums">
                      <div className="font-black text-emerald-600 dark:text-emerald-400">
                        +{it.expectedTotalProfit.toFixed(0)} {currencySymbol}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        {it.marginPct}% ({isAr ? 'هامش' : 'margin'} +{it.unitProfit.toFixed(1)})
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-end">
                      <button
                        type="button"
                        onClick={() =>
                          markShopEarItemArrived(it.itemName, it.productId, it.qtyInput)
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors whitespace-nowrap"
                      >
                        <PackageCheck className="w-3.5 h-3.5" />
                        <span>{isAr ? 'جبتها من الجملة' : 'Arrived'}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* SMART REPLENISHMENT PREDICTOR ("تنبؤ التوريد الذكي حسب المورد") */}
      {/* ===================================================================== */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Boxes className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>
                {isAr
                  ? 'تنبؤ التوريد الذكي حسب المورد لتفادي نفاد المخزون'
                  : 'Smart Replenishment Predictor by Supplier'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isAr
                ? 'حساب الكميات المثالية للطلب من كل مورد بناءً على سرعة البيع التاريخية (30 يوم)، حالات نفاد المخزون، وطلبات «ودن الحانوت».'
                : 'Ideal supplier order quantities computed from 30d sales velocity, stockout events, and Shop Ear missed requests.'}
            </p>
          </div>
          <span className="text-xs font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400">
            {isAr
              ? `${replenishmentBySupplier.length} مورد مقترح`
              : `${replenishmentBySupplier.length} suppliers`}
          </span>
        </div>

        {replenishmentBySupplier.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            {isAr
              ? 'مخزون المحل متوازن دابا! ما كاين حتى منتج قريب ينفد أو ناقص.'
              : 'Inventory is healthy right now with no predicted stockouts.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {replenishmentBySupplier.map((sup) => (
              <div
                key={sup.supplierName}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3 pb-2.5 border-b border-slate-200 dark:border-slate-700/80">
                  <div>
                    <div className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Truck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span>{sup.supplierName}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {sup.items.length} {isAr ? 'أصناف مقترح طلبها' : 'items to order'} ·{' '}
                      <span className="font-mono tabular-nums">
                        {isAr ? 'إجمالي الوحدات:' : 'Units:'} {sup.totalOrderQty}
                      </span>
                      {sup.supplierPhone ? ` · ${sup.supplierPhone}` : ''}
                    </div>
                  </div>
                  <div className="text-end shrink-0">
                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      {isAr ? 'كلفة التوريد' : 'Est. Order Cost'}
                    </div>
                    <div className="text-sm font-black font-mono tabular-nums text-slate-900 dark:text-white">
                      {sup.totalEstimatedCost.toFixed(0)} {currencySymbol}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {sup.items.map((item) => (
                    <div
                      key={item.key}
                      className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white truncate">
                            {item.itemName}
                          </span>
                          <span
                            className={`text-[10px] font-bold ${
                              item.urgency === 'critical'
                                ? 'text-rose-600 dark:text-rose-400'
                                : item.urgency === 'high'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {item.urgency === 'critical'
                              ? isAr
                                ? 'حرج'
                                : 'Critical'
                              : item.urgency === 'high'
                              ? isAr
                                ? 'مرتفع'
                                : 'High'
                              : isAr
                              ? 'وقائي'
                              : 'Buffer'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {item.reason}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-end font-mono tabular-nums">
                          <div className="text-xs font-black text-blue-600 dark:text-blue-400">
                            +{item.idealOrderQty} {isAr ? 'وحدة' : 'u'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {isAr ? `الحالي: ${item.currentStock}` : `Stock: ${item.currentStock}`}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            markShopEarItemArrived(item.itemName, item.productId, item.idealOrderQty)
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-amber-400 text-white dark:text-slate-950 hover:opacity-90 text-[11px] font-bold whitespace-nowrap"
                        >
                          {isAr ? 'توريد الآن' : 'Restock'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* NIGHTLY LOSS SUMMARY ("التطبيق يجمع و يقول ليك في الليل") */}
      {/* ===================================================================== */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Moon className="w-5 h-5 text-indigo-500" />
              <span>
                {isAr
                  ? isEvening
                    ? 'حصيلة الليل — السلعة اللي كتخسرك فلوس و نتا ما جايبش الخبار'
                    : 'التقرير التجميعي (اليوم و السيمانة) — السلعة اللي كتخسرك فلوس'
                  : 'Nightly Summary — Missed Demand Costing You Sales'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isAr
                ? 'التطبيق كيجمع الطلبات طيلة النهار والسيمانة باش تعرف بالضبط شنو كيضيع ليك من المبيعات.'
                : 'Aggregated daily and 7-day missed requests so nothing slips through the cracks.'}
            </p>
          </div>
        </div>

        {nightlySummaryItems.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            {isAr
              ? 'مازال ما تسجلات حتى سلعة مطلوبة. أي زبون سول على حاجة ما كايناش، ضغط على «زر ودن الحانوت».'
              : 'No missed item requests logged yet. Tap the Shop Ear button whenever a customer asks for an item.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {nightlySummaryItems.map((it) => (
              <div
                key={it.normalizedName}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-slate-900 dark:text-white">
                    {it.itemName}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      addShopEarRequest({
                        itemName: it.itemName,
                        productId: it.productId,
                        estimatedUnitPrice: it.estimatedUnitPrice || undefined,
                        inputSource: 'manual'
                      })
                    }
                    className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200 text-amber-800 dark:text-amber-300 text-[11px] font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+1</span>
                  </button>
                </div>

                {it.todayCount > 0 && (
                  <p className="text-xs font-bold text-rose-700 dark:text-rose-400">
                    {isAr
                      ? `اليوم ${it.todayCount} ديال الناس سولو على "${it.itemName}" و ما لقاوهاش.`
                      : `Today ${it.todayCount} people asked for "${it.itemName}" and didn't find it.`}
                  </p>
                )}

                <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                  {isAr
                    ? `هاد السيمانة ${it.weekCount} واحد سول على "${it.itemName}"، و نتا ما جبتيهاش.`
                    : `This week ${it.weekCount} asked for "${it.itemName}" and it wasn't restocked.`}
                </p>

                <p className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span>
                    {isAr
                      ? 'هاد السلعة هي اللي كتخسرك فلوس و نتا ما جايبش الخبار'
                      : 'This item is silently costing you lost revenue'}
                    {it.missedRevenueWeek > 0
                      ? ` (${it.missedRevenueWeek.toFixed(0)} ${currencySymbol})`
                      : ''}
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* FULL REQUESTS LOG */}
      {/* ===================================================================== */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span>
              {isAr ? 'سجل طلبات ودن الحانوت' : 'Requests Log'} ({filteredLog.length})
            </span>
          </h2>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: isAr ? 'الكل' : 'All' },
                { id: 'pending', label: isAr ? 'مطلوبة للجملة' : 'Pending' },
                { id: 'arrived', label: isAr ? 'جات (كتسنى الواتساب)' : 'Arrived' },
                { id: 'notified', label: isAr ? 'تم إخبار الزبون' : 'Notified' }
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLogFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                  logFilter === tab.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {tab.label}
              </button>
            ))}

            {shopEarRequests.some((r) => r.status === 'notified') && (
              <button
                type="button"
                onClick={() => clearNotifiedShopEarRequests()}
                className="px-2.5 py-1 rounded-lg text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                {isAr ? 'مسح المُخبرين' : 'Clear Notified'}
              </button>
            )}
          </div>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
          {filteredLog.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              {isAr ? 'لا توجد طلبات في هذا التصنيف' : 'No entries in this filter'}
            </div>
          ) : (
            filteredLog.map((req) => (
              <div
                key={req.id}
                className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white">{req.itemName}</span>
                    <span
                      className={`text-[11px] font-bold ${
                        req.status === 'arrived'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : req.status === 'notified'
                          ? 'text-slate-500 dark:text-slate-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      ·{' '}
                      {req.status === 'arrived'
                        ? isAr
                          ? 'جات من الجملة'
                          : 'Arrived'
                        : req.status === 'notified'
                        ? isAr
                          ? 'تم إخبار الزبون'
                          : 'Notified'
                        : isAr
                        ? 'مطلوبة'
                        : 'Pending'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {req.customerName ? `${req.customerName} · ` : ''}
                    {getRelativeDayLabel(req.requestedAt, isAr)} ·{' '}
                    <span className="font-mono tabular-nums">
                      {new Date(req.requestedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                    {req.inputSource === 'voice' ? ` · ${isAr ? 'بالصوت' : 'Voice'}` : ''}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {req.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => markShopEarItemArrived(req.itemName, req.productId)}
                      className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold hover:bg-emerald-100"
                      title={isAr ? 'تحديد أنها وصلت' : 'Mark arrived'}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteShopEarRequest(req.id)}
                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    title={isAr ? 'حذف' : 'Delete'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
