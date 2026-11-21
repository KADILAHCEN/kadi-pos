import React, { useEffect, useMemo, useState } from 'react';
import { usePos } from '../../context/PosContext';
import {
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Bell,
  BellRing,
  Calendar,
  CheckCircle2,
  Coins,
  Landmark,
  Layers,
  PackageCheck,
  PackagePlus,
  Plus,
  Scale,
  ShieldAlert,
  Trash2,
  Wrench
} from 'lucide-react';
import { Product } from '../../types';
import { PriceAlertAdvisor } from './PriceAlertAdvisor';
import {
  auditOldStockPrices,
  clearPriceAlerts,
  loadPriceAlerts,
  markPriceAlertFixed,
  OldStockPriceIssue,
  PRICE_ALERTS_CHANGED_EVENT,
  PriceAlertLogEntry,
  parseMoroccanNumber,
  recordPriceAlert
} from '../../utils/priceAlerts';

type AlertsFilterTab = 'all' | 'price_alerts' | 'low_stock' | 'expiring' | 'zakat' | 'cpu' | 'theft';

export const AlertsView: React.FC = () => {
  const {
    setCurrentTab,
    products,
    categories,
    addProduct,
    updateProduct,
    lowStockProducts,
    criticalLowStockProducts,
    expiringSoonProducts,
    adjustStock,
    notificationPermission,
    requestNotificationPermission,
    triggerTestStockAlert,
    zakatSummary,
    currencySymbol,
    cpuAlerts,
    markCpuQuarterPaid,
    unresolvedTheftAlerts,
    isSirenActive,
    language
  } = usePos();

  const isAr = language === 'ar';
  const isFr = language === 'fr';
  const [activeFilter, setActiveFilter] = useState<AlertsFilterTab>('all');
  const [restockedIds, setRestockedIds] = useState<Record<string, boolean>>({});

  // Quick Price Alert & Product Entry State (Non-blocking: ما كيمنعش، غير كيعلمك)
  const [quickName, setQuickName] = useState('');
  const [quickCostInput, setQuickCostInput] = useState('');
  const [quickPriceInput, setQuickPriceInput] = useState('');
  const [quickFeedback, setQuickFeedback] = useState<{ type: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [priceAlertLogs, setPriceAlertLogs] = useState<PriceAlertLogEntry[]>(() => loadPriceAlerts());
  const [oldStockFixedNotice, setOldStockFixedNotice] = useState<string | null>(null);

  useEffect(() => {
    const syncLogs = () => setPriceAlertLogs(loadPriceAlerts());
    window.addEventListener(PRICE_ALERTS_CHANGED_EVENT, syncLogs);
    window.addEventListener('storage', syncLogs);
    return () => {
      window.removeEventListener(PRICE_ALERTS_CHANGED_EVENT, syncLogs);
      window.removeEventListener('storage', syncLogs);
    };
  }, []);

  const oldStockIssues = useMemo(() => auditOldStockPrices(products), [products]);
  const priceAlertsCount = oldStockIssues.length + priceAlertLogs.length;

  const quickCostNum = parseMoroccanNumber(quickCostInput);
  const quickPriceNum = parseMoroccanNumber(quickPriceInput);

  const handleQuickPriceSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = quickName.trim();
    if (!cleanName) {
      setQuickFeedback({
        type: 'err',
        text: isAr ? '⚠️ كتب سميت المنتوج أولا' : 'Please enter product name first'
      });
      return;
    }

    const defaultCat = categories.find((c) => c.id !== 'cat-all')?.id || categories[0]?.id || 'cat-1';
    const finalSell = Number(quickPriceNum.toFixed(2));
    const finalCost = Number(quickCostNum.toFixed(2));
    const autoBarcode = `628${Date.now().toString().slice(-9)}`;

    const res = addProduct({
      name: cleanName,
      nameEn: cleanName,
      sku: `SKU-${autoBarcode.slice(-4)}`,
      barcode: autoBarcode,
      categoryId: defaultCat,
      price: finalSell,
      costPrice: finalCost,
      stock: 10,
      lowStockThreshold: 5,
      unitType: 'piece',
      color: '#10B981',
      hasVariants: false
    });

    if (!res.success || !res.product) {
      setQuickFeedback({
        type: 'err',
        text: res.message || (isAr ? 'تعذر إضافة المنتوج' : 'Could not save product')
      });
      return;
    }

    // Never blocks saving: record alert when selling at loss or zero profit
    if (finalCost > 0 && finalSell <= finalCost) {
      recordPriceAlert({
        productId: res.product.id,
        productName: cleanName,
        costPrice: finalCost,
        sellPrice: finalSell,
        type: finalSell < finalCost ? 'loss' : 'zero_profit'
      });
      setQuickFeedback({
        type: 'warn',
        text: isAr
          ? `⚠️ تسجل "${cleanName}" بالرغم من الخسارة/بلا ربح — تم تسجيل تنبيه الأثمنة!`
          : `Saved "${cleanName}" with price alert recorded.`
      });
    } else {
      setQuickFeedback({
        type: 'ok',
        text: isAr
          ? `✅ تسجل "${cleanName}" بنجاح (الشراء: ${finalCost} / البيع: ${finalSell} ${currencySymbol})`
          : `Saved "${cleanName}" successfully.`
      });
    }

    setQuickName('');
    setQuickCostInput('');
    setQuickPriceInput('');
  };

  const handleFixSingleOldStock = (issue: OldStockPriceIssue) => {
    updateProduct(issue.product.id, {
      price: issue.suggestedPrice,
      costPrice: issue.suggestedCostPrice
    });
    markPriceAlertFixed(issue.product.id);
    setOldStockFixedNotice(
      isAr
        ? `✅ تم تصحيح "${issue.product.name}" (البيع: ${issue.suggestedPrice} ${currencySymbol})`
        : `Fixed "${issue.product.name}"`
    );
  };

  const handleFixAllOldStock = () => {
    if (oldStockIssues.length === 0) return;
    let fixedCount = 0;
    for (const issue of oldStockIssues) {
      updateProduct(issue.product.id, {
        price: issue.suggestedPrice,
        costPrice: issue.suggestedCostPrice
      });
      markPriceAlertFixed(issue.product.id);
      fixedCount++;
    }
    setOldStockFixedNotice(
      isAr
        ? `🛠️ تم تصحيح ${fixedCount} منتوج في المخزون القديم كامل بوحدو بنجاح!`
        : `Auto-fixed ${fixedCount} old inventory items successfully!`
    );
  };

  const zakatAlertCount = zakatSummary.hasReachedNisab ? 1 : 0;
  const totalAlerts =
    priceAlertsCount +
    lowStockProducts.length +
    expiringSoonProducts.length +
    zakatAlertCount +
    cpuAlerts.length +
    unresolvedTheftAlerts.length;

  const handleQuickRestock = (productId: string) => {
    adjustStock(productId, 20, 'توريد سريع عبر صفحة التنبيهات', 'restock');
    setRestockedIds((prev) => ({ ...prev, [productId]: true }));
  };

  const filterPills: {
    id: AlertsFilterTab;
    label: string;
    count?: number;
    accent: string;
  }[] = [
    {
      id: 'all',
      label: isAr ? 'الكل' : isFr ? 'Tout' : 'All',
      count: totalAlerts,
      accent: 'bg-slate-900 dark:bg-emerald-600 text-white'
    },
    {
      id: 'price_alerts',
      label: isAr ? 'تنبيهات الأثمنة' : isFr ? 'Prix & Pertes' : 'Price Alerts',
      count: priceAlertsCount,
      accent: 'bg-rose-600 text-white'
    },
    {
      id: 'low_stock',
      label: isAr ? 'المخزون' : isFr ? 'Stock' : 'Low Stock',
      count: lowStockProducts.length,
      accent: 'bg-amber-500 text-white'
    },
    {
      id: 'expiring',
      label: isAr ? 'الصلاحية' : isFr ? 'Expiration' : 'Expiry',
      count: expiringSoonProducts.length,
      accent: 'bg-rose-500 text-white'
    },
    {
      id: 'cpu',
      label: isAr ? 'ضرائبي CPU' : 'CPU Tax',
      count: cpuAlerts.length,
      accent: 'bg-indigo-600 text-white'
    },
    {
      id: 'zakat',
      label: isAr ? 'الزكاة' : 'Zakat',
      count: zakatAlertCount,
      accent: 'bg-emerald-600 text-white'
    },
    {
      id: 'theft',
      label: isAr ? 'الأمان' : 'Security',
      count: unresolvedTheftAlerts.length,
      accent: 'bg-rose-700 text-white'
    }
  ];

  const showSection = (key: Exclude<AlertsFilterTab, 'all'>) =>
    activeFilter === 'all' || activeFilter === key;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Page Header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              criticalLowStockProducts.length > 0 || unresolvedTheftAlerts.length > 0 || isSirenActive
                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                : totalAlerts > 0
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            <Bell className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                {isAr ? 'مركز التنبيهات والإشعارات' : isFr ? 'Centre des Alertes' : 'Alerts & Notifications Center'}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 tabular-nums">
                {totalAlerts}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isAr
                ? 'متابعة نواقص المخزون، تواريخ الصلاحية، الزكاة، مواعيد CPU وتنبيهات الأمان داخل التطبيق'
                : 'Track low stock, product expiration dates, Zakat Nisab, CPU deadlines, and security alerts'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {notificationPermission !== 'unsupported' && (
            notificationPermission !== 'granted' ? (
              <button
                type="button"
                onClick={() => void requestNotificationPermission()}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-1.5 transition-colors shadow-2xs whitespace-nowrap"
              >
                <BellRing className="w-4 h-4" />
                <span>{isAr ? '🔔 فعل الإشعارات خارج التطبيق' : 'Enable Push Alerts'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void triggerTestStockAlert()}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-xs font-extrabold flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <BellRing className="w-4 h-4" />
                <span>{isAr ? 'الإشعارات مفعلة ✅ (تجربة)' : 'Push Active (Test)'}</span>
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => setCurrentTab('pos')}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            {isAr ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
            <span>{isAr ? 'العودة لنقطة البيع' : 'Back to POS'}</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3.5">
        <button
          type="button"
          onClick={() => setActiveFilter('price_alerts')}
          className="text-start p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-rose-400 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>{isAr ? 'تنبيه الأثمنة' : 'Price Alerts'}</span>
            <Coins className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-1.5 text-xl font-black text-slate-900 dark:text-white tabular-nums">
            {priceAlertsCount}
          </div>
          <div className="text-[11px] text-rose-600 dark:text-rose-400 font-bold">
            {oldStockIssues.length > 0
              ? isAr
                ? `${oldStockIssues.length} في المخزون`
                : `${oldStockIssues.length} in stock`
              : isAr
              ? 'ما كيمنعش ✓'
              : 'Price watch'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('low_stock')}
          className="text-start p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-400 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>{isAr ? 'نواقص المخزون' : 'Low Stock'}</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-1.5 text-xl font-black text-slate-900 dark:text-white tabular-nums">
            {lowStockProducts.length}
          </div>
          <div className="text-[11px] text-rose-600 dark:text-rose-400 font-bold">
            {criticalLowStockProducts.length > 0
              ? isAr
                ? `${criticalLowStockProducts.length} حرج`
                : `${criticalLowStockProducts.length} critical`
              : isAr
              ? 'متابعة فورية'
              : 'Stock watch'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('expiring')}
          className="text-start p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-rose-400 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>{isAr ? 'قرب انتهاء الصلاحية' : 'Expiring Soon'}</span>
            <Calendar className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-1.5 text-xl font-black text-slate-900 dark:text-white tabular-nums">
            {expiringSoonProducts.length}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {isAr ? 'خلال 30 يوم أو منتهي' : 'Within 30 days'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('cpu')}
          className="text-start p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>{isAr ? 'أقساط CPU' : 'CPU Tax Due'}</span>
            <Landmark className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-1.5 text-xl font-black text-slate-900 dark:text-white tabular-nums">
            {cpuAlerts.length}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {cpuAlerts.length > 0
              ? isAr
                ? 'مستحقة الدفع'
                : 'Due soon'
              : isAr
              ? 'الوضع منتظم'
              : 'All clear'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('zakat')}
          className="text-start p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-400 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>{isAr ? 'زكاة التجارة (2.5%)' : 'Zakat (2.5%)'}</span>
            <Scale className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-1.5 text-xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
            {zakatSummary.zakatDue.toFixed(0)} <span className="text-xs">{currencySymbol}</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {zakatSummary.hasReachedNisab
              ? isAr
                ? 'بلغ النصاب ✓'
                : 'Nisab reached'
              : `${zakatSummary.nisabProgressPct}%`}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('theft')}
          className="col-span-2 sm:col-span-1 text-start p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-rose-500 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>{isAr ? 'الأمان ومراقبة الصندوق' : 'Anti-Theft'}</span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-1.5 text-xl font-black text-slate-900 dark:text-white tabular-nums">
            {unresolvedTheftAlerts.length}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {unresolvedTheftAlerts.length > 0
              ? isAr
                ? 'تتطلب مراجعة'
                : 'Needs review'
              : isAr
              ? 'لا توجد تنبيهات'
              : 'Protected'}
          </div>
        </button>
      </div>

      {/* Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {filterPills.map((pill) => {
          const isActive = activeFilter === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => setActiveFilter(pill.id)}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 transition-all border ${
                isActive
                  ? `${pill.accent} border-transparent shadow-xs`
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span>{pill.label}</span>
              {typeof pill.count === 'number' && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-black tabular-nums ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {pill.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Sections Grid */}
      <div className="space-y-4 sm:space-y-5">
        {/* 0. Price Alerts & Moroccan Price Helper Section */}
        {showSection('price_alerts') && (
          <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-emerald-50/70 dark:bg-emerald-950/30">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <h2 className="text-sm font-black text-slate-900 dark:text-white">
                    {isAr
                      ? 'تنبيه الأثمنة - ما كيمنعش، غير كيعلمك'
                      : 'Price Alerts - Non-blocking Advisor'}
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {isAr
                      ? 'الترجمة بالدرهم والسنتيم والريال، تنبيه البيع بالخسارة، وفحص المخزون القديم'
                      : 'Moroccan currency breakdown, non-blocking loss alerts, and old-stock price audit'}
                  </p>
                </div>
              </div>
              {oldStockIssues.length > 0 && (
                <button
                  type="button"
                  onClick={handleFixAllOldStock}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>
                    {isAr
                      ? `🛠️ صحح المخزون القديم كامل بوحدو (${oldStockIssues.length})`
                      : `Auto-fix All (${oldStockIssues.length})`}
                  </span>
                </button>
              )}
            </div>

            <div className="p-4 sm:p-5 space-y-5 text-xs">
              {/* Quick Non-Blocking Add Product & Price Checker */}
              <form
                onSubmit={handleQuickPriceSave}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-3"
              >
                <div className="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-emerald-600" />
                  <span>
                    {isAr ? '➕ إضافة منتوج سريع وفحص الثمن' : 'Quick Add Product & Price Check'}
                  </span>
                </div>

                {quickFeedback && (
                  <div
                    className={`px-3 py-2 rounded-xl font-bold border ${
                      quickFeedback.type === 'ok'
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                        : quickFeedback.type === 'warn'
                        ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300'
                        : 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {quickFeedback.text}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      {isAr ? 'سميت المنتوج' : 'Product Name'}
                    </label>
                    <input
                      type="text"
                      value={quickName}
                      onChange={(e) => setQuickName(e.target.value)}
                      placeholder={isAr ? 'مثال: بوطاغاز، دانون، سكر...' : 'Product name...'}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      {isAr ? `ثمن الشراء (${currencySymbol})` : `Cost Price (${currencySymbol})`}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={quickCostInput}
                      onChange={(e) => setQuickCostInput(e.target.value)}
                      placeholder={isAr ? 'مثال: 1.30 أو 130' : 'e.g. 1.30'}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm font-mono font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      {isAr ? `ثمن البيع (${currencySymbol})` : `Sell Price (${currencySymbol})`}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={quickPriceInput}
                      onChange={(e) => setQuickPriceInput(e.target.value)}
                      placeholder={isAr ? 'مثال: 11' : 'e.g. 11'}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm font-mono font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <PriceAlertAdvisor
                  costPrice={quickCostNum}
                  sellPrice={quickPriceNum}
                  currencySymbol={currencySymbol}
                  isAr={isAr}
                  onApplyChoice={(patch) => {
                    if (typeof patch.price === 'number') setQuickPriceInput(String(patch.price));
                    if (typeof patch.costPrice === 'number') setQuickCostInput(String(patch.costPrice));
                  }}
                />

                <button
                  type="submit"
                  className="w-full sm:w-auto min-h-[42px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition-colors shadow-2xs"
                >
                  {isAr ? '✅ سجل المنتوج (ما كيمنعش)' : '✅ Save Product'}
                </button>
              </form>

              {/* Old Stock Audit + Recorded Price Alerts Log */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Old Stock Price Audit */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="font-black text-slate-900 dark:text-white">
                      {isAr
                        ? `📦 المخزون القديم (${oldStockIssues.length} مشكل)`
                        : `📦 Old Stock Audit (${oldStockIssues.length})`}
                    </span>
                    {oldStockIssues.length > 0 && (
                      <button
                        type="button"
                        onClick={handleFixAllOldStock}
                        className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-[11px] font-black transition-colors"
                      >
                        {isAr ? 'صحح الكل' : 'Fix All'}
                      </button>
                    )}
                  </div>

                  {oldStockFixedNotice && (
                    <div className="mx-3 mt-3 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-bold text-[11px]">
                      {oldStockFixedNotice}
                    </div>
                  )}

                  {oldStockIssues.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 flex flex-col items-center gap-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 opacity-75" />
                      <span>
                        {isAr
                          ? 'جميع أثمنة المخزون الحالي سليمة ومربحة!'
                          : 'All inventory product prices are healthy!'}
                      </span>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                      {oldStockIssues.map((issue) => (
                        <div
                          key={issue.product.id}
                          className="p-3 flex items-center justify-between gap-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        >
                          <div className="min-w-0">
                            <div className="font-black text-slate-900 dark:text-white truncate">
                              {issue.product.name}
                            </div>
                            <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                              {issue.message}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleFixSingleOldStock(issue)}
                            className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-[11px] font-black shrink-0 transition-colors"
                          >
                            {issue.fixLabel}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Price Alert History Log */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="font-black text-slate-900 dark:text-white">
                      {isAr
                        ? `📋 سجل التنبيهات (${priceAlertLogs.length})`
                        : `📋 Price Alert Log (${priceAlertLogs.length})`}
                    </span>
                    {priceAlertLogs.length > 0 && (
                      <button
                        type="button"
                        onClick={() => clearPriceAlerts()}
                        className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>{isAr ? 'مسح السجل' : 'Clear'}</span>
                      </button>
                    )}
                  </div>

                  {priceAlertLogs.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 flex flex-col items-center gap-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 opacity-75" />
                      <span>
                        {isAr ? 'ما كاين حتى تنبيه مسجل دابا' : 'No price alerts logged yet'}
                      </span>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                      {priceAlertLogs.map((log) => (
                        <div
                          key={log.id}
                          className="p-3 bg-amber-50/50 dark:bg-amber-950/20 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-black text-slate-900 dark:text-white truncate">
                              ⚠️ {log.productName}
                            </div>
                            <div className="text-[11px] font-bold text-amber-900 dark:text-amber-300 mt-0.5 tabular-nums">
                              {isAr
                                ? `شراء: ${log.costPrice} ${currencySymbol} | بيع: ${log.sellPrice} ${currencySymbol}`
                                : `Cost: ${log.costPrice} | Sell: ${log.sellPrice}`}
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                            {new Date(log.timestamp).toLocaleTimeString(isAr ? 'ar-MA' : 'en-US', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 1. Anti-Theft Section */}
        {showSection('theft') && (unresolvedTheftAlerts.length > 0 || activeFilter === 'theft') && (
          <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-rose-50/70 dark:bg-rose-950/30">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <h2 className="text-sm font-black text-slate-900 dark:text-white">
                  {isAr ? 'تنبيهات الأمان والحماية من الاختلاس' : 'Anti-Theft Security Alerts'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('kadi:open-theft-security'))}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors"
              >
                {isAr ? 'فتح مركز الأمان الكامل' : 'Open Security Center'}
              </button>
            </div>
            {unresolvedTheftAlerts.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 opacity-75" />
                <span>{isAr ? 'لا توجد تنبيهات أمان مفتوحة حالياً' : 'No unresolved theft alerts'}</span>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {unresolvedTheftAlerts.map((al) => (
                  <div
                    key={al.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-600 text-white uppercase">
                          {al.severity}
                        </span>
                        <span className="font-black text-xs sm:text-sm text-slate-900 dark:text-white">
                          {al.title}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                        {al.description}
                      </p>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {al.actorName} · {new Date(al.timestamp).toLocaleString(isAr ? 'ar-MA' : 'en-US')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent('kadi:open-theft-security'))}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold shrink-0"
                    >
                      {isAr ? 'مراجعة' : 'Review'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 2. Low Stock Products Section */}
        {showSection('low_stock') && (
          <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/80 dark:bg-slate-800/40">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-black text-slate-900 dark:text-white">
                  {isAr ? 'تنبيهات انخفاض المخزون' : 'Low Stock Alerts'} ({lowStockProducts.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCurrentTab('inventory')}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{isAr ? 'إدارة المخزون' : 'Manage Inventory'}</span>
              </button>
            </div>

            {lowStockProducts.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                <PackageCheck className="w-9 h-9 text-emerald-500 opacity-75" />
                <span>{isAr ? 'جميع المنتجات فوق الحد الأدنى المحدد' : 'All stock levels are healthy'}</span>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {lowStockProducts.map((p: Product) => {
                  const isBelowFive = p.stock < 5;
                  const isCritical = isBelowFive || (p.lowStockThreshold > 0 && p.stock <= p.lowStockThreshold * 0.2);
                  return (
                    <div
                      key={p.id}
                      className={`p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                        isCritical
                          ? 'bg-rose-50/60 dark:bg-rose-950/25'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white">
                            {p.name}
                          </span>
                          {isBelowFive && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-600 text-white">
                              {isAr ? 'باقي قل من 5 — خاصها كوموند!' : '< 5 Left — Reorder!'}
                            </span>
                          )}
                          {!isBelowFive && isCritical && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-600 text-white">
                              {isAr ? 'حرج < 20%' : 'Critical < 20%'}
                            </span>
                          )}
                          {restockedIds[p.id] && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              {isAr ? 'تم التوريد' : 'Restocked'}
                            </span>
                          )}
                        </div>
                        <div
                          className={`text-xs font-semibold mt-1 tabular-nums ${
                            isCritical
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {isAr ? 'المتبقي:' : 'Remaining:'}{' '}
                          <span className="font-mono font-black">{p.stock}</span> ·{' '}
                          {isAr ? 'حد التنبيه:' : 'Min:'}{' '}
                          <span className="font-mono font-bold">{p.lowStockThreshold}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleQuickRestock(p.id)}
                          className="min-h-[42px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                        >
                          <PackagePlus className="w-3.5 h-3.5" />
                          <span>+20 {isAr ? 'توريد' : 'Restock'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* 3. Expiring Products Section */}
        {showSection('expiring') && (
          <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/80 dark:bg-slate-800/40">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-rose-500" />
                <h2 className="text-sm font-black text-slate-900 dark:text-white">
                  {isAr ? 'تنبيهات تاريخ الصلاحية' : 'Expiry Alerts'} ({expiringSoonProducts.length})
                </h2>
              </div>
            </div>

            {expiringSoonProducts.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                <PackageCheck className="w-9 h-9 text-emerald-500 opacity-75" />
                <span>
                  {isAr ? 'لا توجد منتجات منتهية أو قريبة من انتهاء الصلاحية' : 'No expiring products'}
                </span>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {expiringSoonProducts.map((p: Product) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const exp = p.expiryDate ? new Date(p.expiryDate) : null;
                  const diffDays = exp
                    ? Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                    : 0;
                  const isExpired = diffDays < 0;

                  return (
                    <div
                      key={p.id}
                      className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <div className="min-w-0">
                        <div className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white">
                          {p.name}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                              isExpired
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            {isExpired
                              ? isAr
                                ? 'منتهي الصلاحية'
                                : 'Expired'
                              : isAr
                              ? `ينتهي خلال ${diffDays} يوم`
                              : `${diffDays}d left`}
                          </span>
                          <span className="font-mono text-slate-500 dark:text-slate-400">
                            {p.expiryDate}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setCurrentTab('inventory')}
                        className="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold shrink-0"
                      >
                        {isAr ? 'معاينة في المخزون' : 'Inspect in Inventory'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* 4. CPU Tax & Zakat Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {showSection('cpu') && (
            <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs flex flex-col">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/80 dark:bg-slate-800/40">
                <div className="flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <h2 className="text-sm font-black text-slate-900 dark:text-white">
                    {isAr ? 'تنبيهات ضرائبي CPU' : 'CPU Tax Payment Alerts'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentTab('cpu_tax')}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {isAr ? 'فتح الصفحة' : 'Open CPU'}
                </button>
              </div>

              {cpuAlerts.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2 flex-1 justify-center">
                  <CheckCircle2 className="w-9 h-9 text-emerald-500 opacity-75" />
                  <span>
                    {isAr ? 'لا توجد دفعات CPU مستحقة خلال 7 أيام' : 'No CPU payments due within 7 days'}
                  </span>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {cpuAlerts.map((al) => (
                    <div
                      key={al.recordId}
                      className="p-4 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-black text-slate-900 dark:text-white tabular-nums">
                          CPU {al.year}-{al.quarter} · {al.totalDue.toFixed(2)} {currencySymbol}
                        </div>
                        <div
                          className={`text-xs font-bold mt-0.5 ${
                            al.isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {al.isOverdue
                            ? isAr
                              ? `متأخر بـ ${Math.abs(al.daysLeft)} يوم`
                              : `Overdue ${Math.abs(al.daysLeft)}d`
                            : isAr
                            ? `باقي ${al.daysLeft} يوم للدفع (${al.dueDate})`
                            : `${al.daysLeft}d left (${al.dueDate})`}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => markCpuQuarterPaid(al.recordId, true)}
                        className="min-h-[42px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shrink-0"
                      >
                        {isAr ? 'لقد دفعت' : 'Mark Paid'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {showSection('zakat') && (
            <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs flex flex-col">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/80 dark:bg-slate-800/40">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h2 className="text-sm font-black text-slate-900 dark:text-white">
                    {isAr ? 'متابعة زكاة التجارة (نصاب 85 جم ذهب)' : 'Zakat Tracker (85g Gold Nisab)'}
                  </h2>
                </div>
                <span className="font-mono text-xs font-black text-amber-600 dark:text-amber-400 tabular-nums">
                  {zakatSummary.nisabProgressPct}%
                </span>
              </div>

              <div className="p-4 sm:p-5 space-y-3 text-xs flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="font-black text-slate-900 dark:text-white">
                    {zakatSummary.hasReachedNisab
                      ? isAr
                        ? '✅ تم تجاوز نصاب 85 جم ذهب — الزكاة واجبة'
                        : '✅ 85g Gold Nisab Exceeded'
                      : isAr
                      ? '⏳ لم يبلغ الوعاء النصاب بعد'
                      : '⏳ Below 85g Gold Nisab'}
                  </div>

                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all"
                      style={{ width: `${Math.min(100, zakatSummary.nisabProgressPct)}%` }}
                    />
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2 tabular-nums">
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">
                        {isAr ? 'الوعاء الزكوي:' : 'Zakatable Base:'}
                      </span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {zakatSummary.zakatableBase.toFixed(2)} {currencySymbol}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">
                        {isAr ? 'النصاب (85g ذهب):' : 'Nisab (85g):'}
                      </span>
                      <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                        {zakatSummary.nisabValue.toFixed(2)} {currencySymbol}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {isAr ? 'الزكاة الواجبة (2.5%):' : 'Auto Zakat (2.5%):'}
                      </span>
                      <span className="font-mono font-black text-base text-emerald-600 dark:text-emerald-400">
                        {zakatSummary.zakatDue.toFixed(2)} {currencySymbol}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentTab('analytics')}
                  className="min-h-[44px] w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors"
                >
                  {isAr ? 'فتح حاسبة وتفاصيل الزكاة في التقارير' : 'Open Zakat Calculator in Analytics'}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
