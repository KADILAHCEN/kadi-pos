import React, { useMemo, useState } from 'react';
import { usePos } from '../../context/PosContext';
import { getLocalTodayYMD } from '../../utils/expenses';
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
  Phone
} from 'lucide-react';

interface AggregatedShopEarItem {
  normalizedName: string;
  itemName: string;
  productId?: string;
  estimatedUnitPrice: number;
  todayCount: number;
  weekCount: number;
  totalPendingCount: number;
  waitingCustomersCount: number;
  missedRevenueWeek: number;
  lastRequestedAt: string;
  inCatalogStock: number | null;
}

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

export const ShopEarView: React.FC = () => {
  const {
    shopEarRequests,
    addShopEarRequest,
    markShopEarItemArrived,
    markShopEarNotified,
    deleteShopEarRequest,
    clearNotifiedShopEarRequests,
    products,
    settings,
    currencySymbol,
    language
  } = usePos();

  const isAr = language === 'ar';
  const todayYMD = getLocalTodayYMD();
  const currentHour = new Date().getHours();
  const isEvening = currentHour >= 18 || currentHour < 5;

  const [copiedWholesale, setCopiedWholesale] = useState(false);
  const [inlinePhones, setInlinePhones] = useState<Record<string, string>>({});
  const [restockQuantities, setRestockQuantities] = useState<Record<string, number>>({});
  const [logFilter, setLogFilter] = useState<'all' | 'pending' | 'arrived' | 'notified'>('all');

  // 7-day boundary timestamp
  const sevenDaysAgoMs = useMemo(() => Date.now() - 7 * 86400000, []);

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
        }
      } else {
        map.set(req.normalizedName, {
          normalizedName: req.normalizedName,
          itemName: req.itemName,
          productId: req.productId || matchedProd?.id,
          estimatedUnitPrice: unitPrice,
          todayCount: isToday && req.status !== 'notified' ? 1 : 0,
          weekCount: isThisWeek && req.status !== 'notified' ? 1 : 0,
          totalPendingCount: req.status === 'pending' ? 1 : 0,
          waitingCustomersCount:
            req.status === 'pending' && (req.customerName || req.customerPhone) ? 1 : 0,
          missedRevenueWeek: isThisWeek && req.status !== 'notified' ? unitPrice : 0,
          lastRequestedAt: req.requestedAt,
          inCatalogStock: matchedProd ? matchedProd.stock : null
        });
      }
    });

    return Array.from(map.values()).sort(
      (a, b) =>
        b.totalPendingCount - a.totalPendingCount ||
        b.weekCount - a.weekCount ||
        b.todayCount - a.todayCount
    );
  }, [shopEarRequests, products, todayYMD, sevenDaysAgoMs]);

  // Wholesale sheet items (pending items requested this week or still pending)
  const wholesaleItems = useMemo(
    () => aggregatedDemand.filter((item) => item.totalPendingCount > 0),
    [aggregatedDemand]
  );

  // Nightly summary highlights (today >= 1 OR week >= 1 unfulfilled)
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
    const header = `📝 ورقة ودن الحانوت - جيب هاد السلعة المطلوبة (${storeName})`;
    const dateLine = `📅 التاريخ: ${todayYMD}`;
    const divider = `--------------------------------`;
    if (wholesaleItems.length === 0) {
      return `${header}\n${dateLine}\n${divider}\nما كاين حتى نقص مسجل دابا.`;
    }
    const lines = wholesaleItems.map((it, idx) => {
      const qtySuggest = Math.max(2, it.weekCount * 2);
      return `${idx + 1}. ${it.itemName} — سولو عليها ${it.weekCount || it.totalPendingCount} هاد السيمانة (${it.todayCount} اليوم) | مقترح تجيب: ${qtySuggest}`;
    });
    return [header, dateLine, divider, ...lines].join('\n');
  };

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
              {isAr ? 'ودن الحانوت — السلعة المطلوبة' : 'Shop Ear — Requested Missing Items'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {isAr
                ? 'سجل أي سلعة سول عليها زبون وما لقاهاش · حصيلة الليل · ورقة الجملة الجاهزة · إشعار الزبناء بالواتساب مني تجي.'
                : 'Log customer requests by voice or search · Evening loss report · Wholesale sheet · WhatsApp back-in-stock.'}
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
            {isAr ? `${wholesaleItems.length} أصناف خاصهم يجيو` : `${wholesaleItems.length} distinct items`}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
            {isAr ? 'سلع جات (كتسنى الواتساب)' : 'Arrived (Notify Ready)'}
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1.5">
            {arrivedReadyToNotify.length}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr ? 'زبناء ترجعهم للمحل' : 'Ready to bring back'}
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
            {isAr ? 'من السلع اللي سول عليها الناس' : 'From tracked prices'}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SECTION 4 ACTIONABLE FIRST: صيفط ليه مني تجيبها (WHATSAPP BACK-IN-STOCK) */}
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
      {/* SECTION 2: NIGHTLY LOSS SUMMARY ("التطبيق يجمع و يقول ليك في الليل") */}
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
      {/* SECTION 3: WHOLESALE SHOPPING SHEET ("ورقة ودن الحانوت - جيب هاد السلعة المطلوبة") */}
      {/* ===================================================================== */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-amber-500" />
              <span>
                {isAr
                  ? 'ورقة ودن الحانوت - جيب هاد السلعة المطلوبة'
                  : 'Shop Ear Wholesale Sheet — Items to Buy'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isAr
                ? 'هادشي هو اللي سولو عليه الزبناء و ما لقيتوش هاد السيمانة، جيبو معاك من الجملة باش ما تنساش وما تشريش حاجة ما بغاها حد.'
                : 'Exact customer-requested items to pick up at wholesale so you never forget or overbuy dead stock.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleCopyWholesale()}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"
            >
              {copiedWholesale ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedWholesale ? (isAr ? 'تم النسخ' : 'Copied') : isAr ? 'نسخ الورقة' : 'Copy List'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadWholesale}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isAr ? 'تحميل TXT' : 'Download'}</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isAr ? 'طباعة' : 'Print'}</span>
            </button>
          </div>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3 font-bold text-start">{isAr ? 'السلعة المطلوبة' : 'Requested Item'}</th>
                <th className="py-2.5 px-3 font-bold text-end">{isAr ? 'اليوم' : 'Today'}</th>
                <th className="py-2.5 px-3 font-bold text-end">{isAr ? 'هاد السيمانة' : '7 Days'}</th>
                <th className="py-2.5 px-3 font-bold text-end">{isAr ? 'مقترح تجيب' : 'Suggested Qty'}</th>
                <th className="py-2.5 px-3 font-bold text-end">{isAr ? 'مني تجيبها من الجملة' : 'Restock Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {wholesaleItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 dark:text-slate-400">
                    {isAr ? 'ورقة الجملة خاوية دابا — كل السلع المطلوبة متوفرة.' : 'Wholesale list is empty right now.'}
                  </td>
                </tr>
              ) : (
                wholesaleItems.map((it) => {
                  const defaultQty = Math.max(6, it.weekCount * 2);
                  const qtyInput = restockQuantities[it.normalizedName] ?? defaultQty;
                  return (
                    <tr key={it.normalizedName} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">{it.itemName}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {it.waitingCustomersCount > 0
                            ? isAr
                              ? `${it.waitingCustomersCount} زبون كيتسنى إشعار واتساب`
                              : `${it.waitingCustomersCount} customer(s) waiting`
                            : isAr
                            ? 'طلب عام من الزبناء'
                            : 'Walk-in customer demand'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                        {it.todayCount}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono font-black tabular-nums text-amber-600 dark:text-amber-400">
                        {it.weekCount || it.totalPendingCount}
                      </td>
                      <td className="py-2.5 px-3 text-end">
                        <input
                          type="number"
                          min="1"
                          value={qtyInput}
                          onChange={(e) =>
                            setRestockQuantities((prev) => ({
                              ...prev,
                              [it.normalizedName]: Math.max(1, Number(e.target.value) || 1)
                            }))
                          }
                          className="w-16 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-end font-mono text-xs text-slate-900 dark:text-white"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-end">
                        <button
                          type="button"
                          onClick={() =>
                            markShopEarItemArrived(it.itemName, it.productId, qtyInput)
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors whitespace-nowrap"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          <span>{isAr ? 'جبتها من الجملة' : 'Arrived'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* FULL REQUESTS LOG */}
      {/* ===================================================================== */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
            {isAr ? 'سجل طلبات ودن الحانوت' : 'Requests Log'} ({filteredLog.length})
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
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        req.status === 'arrived'
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : req.status === 'notified'
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      }`}
                    >
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
