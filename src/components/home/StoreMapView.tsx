import React, { useMemo, useState } from 'react';
import { AppTabId, usePos } from '../../context/PosContext';
import {
  BarChart3,
  Bell,
  Boxes,
  Calculator,
  Clock,
  Coins,
  Compass,
  CreditCard,
  Ear,
  FileText,
  Home,
  Landmark,
  Layers,
  Lock,
  Package,
  Receipt,
  Search,
  Send,
  Settings,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  X
} from 'lucide-react';
import { getLocalTodayYMD } from '../../utils/expenses';

interface StoreMapViewProps {
  onSelectSection: (tab: AppTabId) => void;
}

type PillarKey = 'goods' | 'money' | 'numbers';

interface MapSectionItem {
  id: string;
  tab: AppTabId;
  titleAr: string;
  titleFr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleFr: string;
  subtitleEn: string;
  keywords: string;
  pillar: PillarKey;
  icon: React.FC<{ className?: string }>;
  metric?: string;
}

export const StoreMapView: React.FC<StoreMapViewProps> = ({ onSelectSection }) => {
  const {
    products,
    orders,
    customers,
    branches,
    expenses,
    currentShift,
    lowStockProducts,
    expiringSoonProducts,
    remoteOrders,
    shopEarRequests,
    cpuRecords,
    cart,
    currencySymbol,
    settings,
    language,
    isTabProtected
  } = usePos();

  const [searchQuery, setSearchQuery] = useState('');
  const isAr = language === 'ar';
  const isFr = language === 'fr';
  const todayYMD = getLocalTodayYMD();

  const liveMetrics = useMemo(() => {
    const todayOrders = orders.filter((o) => {
      if (o.status !== 'completed') return false;
      const d = (o.date || '').slice(0, 10);
      return d === todayYMD;
    });
    const todaySales = todayOrders.reduce((s, o) => s + (Number(o.grandTotal) || 0), 0);

    const creditTotal = customers.reduce((s, c) => s + Math.max(0, Number(c.balance) || 0), 0);
    const pendingRemote = remoteOrders.filter((r) => r.status === 'new').length;
    const pendingEar = shopEarRequests.filter((r) => r.status === 'pending').length;
    const alertsCount = lowStockProducts.length + expiringSoonProducts.length;
    const unpaidCpu = cpuRecords
      .filter((r) => r.status === 'unpaid')
      .reduce((s, r) => s + (Number(r.totalDue) || 0), 0);

    return {
      productsCount: products.length,
      branchesCount: branches.length,
      todayOrdersCount: todayOrders.length,
      todaySales,
      creditTotal,
      customersCount: customers.length,
      expensesCount: expenses.length,
      pendingRemote,
      pendingEar,
      alertsCount,
      unpaidCpu,
      cartQty: cart.reduce((s, i) => s + i.quantity, 0),
      shiftCash: Number(currentShift.startingCash || 0)
    };
  }, [
    orders,
    todayYMD,
    customers,
    remoteOrders,
    shopEarRequests,
    lowStockProducts.length,
    expiringSoonProducts.length,
    cpuRecords,
    products.length,
    branches.length,
    expenses.length,
    cart,
    currentShift.startingCash
  ]);

  const sections: MapSectionItem[] = useMemo(
    () => [
      // Pillar 1: السلعة والمخزون (7 sections - Green)
      {
        id: 'sec-inventory',
        tab: 'inventory',
        titleAr: 'المخزون والمنتجات والجرد',
        titleFr: 'Stock, Produits & Inventaire',
        titleEn: 'Inventory & Stocktake',
        subtitleAr: 'السلعة، الجرد، وتعديل الأسعار',
        subtitleFr: 'Articles, inventaire et prix',
        subtitleEn: 'Products, stocktake & prices',
        keywords: 'المخزون المنتجات الجرد السلعة stock products inventory',
        pillar: 'goods',
        icon: Layers,
        metric: `${liveMetrics.productsCount} ${isAr ? 'صنف' : 'items'}`
      },
      {
        id: 'sec-bourse',
        tab: 'bourse',
        titleAr: 'البورصة',
        titleFr: 'Bourse Hanout',
        titleEn: 'Store Bourse',
        subtitleAr: 'مراقبة الأثمنة وهوامش الربح',
        subtitleFr: 'Suivi des prix et marges',
        subtitleEn: 'Price & margin index',
        keywords: 'البورصة الأسعار الأثمنة bourse prices',
        pillar: 'goods',
        icon: TrendingUp
      },
      {
        id: 'sec-branches',
        tab: 'branch_stock',
        titleAr: 'الفروع',
        titleFr: 'Branches',
        titleEn: 'Branches',
        subtitleAr: 'مخزون الفروع والتحويلات',
        subtitleFr: 'Stock des dépôts et transferts',
        subtitleEn: 'Multi-branch stock transfers',
        keywords: 'الفروع التحويلات branches transfers',
        pillar: 'goods',
        icon: Boxes,
        metric: `${liveMetrics.branchesCount} ${isAr ? 'فروع' : 'branches'}`
      },
      {
        id: 'sec-expenses',
        tab: 'expenses',
        titleAr: 'الموردين والمصاريف',
        titleFr: 'Fournisseurs & Dépenses',
        titleEn: 'Suppliers & Expenses',
        subtitleAr: 'فواتير الموردين ومصاريف المحال',
        subtitleFr: 'Factures fournisseurs et charges',
        subtitleEn: 'Supplier bills & store expenses',
        keywords: 'الموردين المصاريف الديون suppliers expenses',
        pillar: 'goods',
        icon: Truck,
        metric: `${liveMetrics.expensesCount}`
      },
      {
        id: 'sec-purchases',
        tab: 'invoice_ocr',
        titleAr: 'المشتريات (فاتورة OCR)',
        titleFr: 'Achats & Facture OCR',
        titleEn: 'Purchases (OCR)',
        subtitleAr: 'تصوير فواتير الشراء وإدخال السلعة',
        subtitleFr: 'Scanner factures d’achat',
        subtitleEn: 'Scan supplier purchase invoices',
        keywords: 'المشتريات فاتورة تصوير الشراء purchases ocr',
        pillar: 'goods',
        icon: FileText
      },
      {
        id: 'sec-shop-ear',
        tab: 'shop_ear',
        titleAr: 'طلبات الزبناء (ودن الحانوت)',
        titleFr: 'Demandes Clients',
        titleEn: 'Shop Ear Requests',
        subtitleAr: 'السلعة اللي كيسولو عليها الكليان',
        subtitleFr: 'Produits demandés introuvables',
        subtitleEn: 'Missed items & wishlist',
        keywords: 'ودن الحانوت طلبات ناقصة shop ear',
        pillar: 'goods',
        icon: Ear,
        metric: liveMetrics.pendingEar > 0 ? `${liveMetrics.pendingEar}` : undefined
      },
      {
        id: 'sec-radar',
        tab: 'market_radar',
        titleAr: 'رادار السوق',
        titleFr: 'Radar Marché',
        titleEn: 'Market Radar',
        subtitleAr: 'توقعات الطلب والسلعة الرائجة',
        subtitleFr: 'Tendances et demande',
        subtitleEn: 'Demand & restock radar',
        keywords: 'رادار السوق اتجاهات الطلب market radar',
        pillar: 'goods',
        icon: Compass
      },

      // Pillar 2: البيع والفلوس (7 sections - Orange)
      {
        id: 'sec-pos',
        tab: 'pos',
        titleAr: 'البيع (نقطة البيع)',
        titleFr: 'Caisse & Vente',
        titleEn: 'POS Register',
        subtitleAr: 'الكيسة، السلة، والباركود',
        subtitleFr: 'Encaissement et panier',
        subtitleEn: 'Sell, scan & checkout',
        keywords: 'البيع نقطة البيع الكيسة السلة pos sell',
        pillar: 'money',
        icon: Store,
        metric:
          liveMetrics.cartQty > 0
            ? `${liveMetrics.cartQty} ${isAr ? 'في السلة' : 'in cart'}`
            : undefined
      },
      {
        id: 'sec-orders',
        tab: 'orders',
        titleAr: 'الفواتير والمبيعات',
        titleFr: 'Factures & Ventes',
        titleEn: 'Receipts & Orders',
        subtitleAr: 'سجل التوصيلات والإرجاع',
        subtitleFr: 'Historique tickets et retours',
        subtitleEn: 'Sales history & refunds',
        keywords: 'الفواتير المبيعات التوصيلات orders receipts',
        pillar: 'money',
        icon: Receipt,
        metric: `${liveMetrics.todayOrdersCount} ${isAr ? 'اليوم' : 'today'}`
      },
      {
        id: 'sec-shifts',
        tab: 'shifts',
        titleAr: 'الصندوق والورديات',
        titleFr: 'Caisse & Shifts',
        titleEn: 'Cash Box & Shifts',
        subtitleAr: 'حساب الصندوق وفتح/إغلاق اليوم',
        subtitleFr: 'Fonds de caisse et clôture',
        subtitleEn: 'Drawer balance & EOD close',
        keywords: 'الصندوق الورديات الفلوس الكيسة shifts cash',
        pillar: 'money',
        icon: Clock,
        metric: currentShift.status === 'open' ? (isAr ? 'مفتوح' : 'Open') : isAr ? 'مغلق' : 'Closed'
      },
      {
        id: 'sec-customers',
        tab: 'customers',
        titleAr: 'الكريدي والزبائن والديون',
        titleFr: 'Crédit & Clients',
        titleEn: 'Credit Ledger & Customers',
        subtitleAr: 'كناش الكريدي، النقاط، وسداد الديون',
        subtitleFr: 'Carnet crédit, points et dettes',
        subtitleEn: 'Credit book, points & debts',
        keywords: 'الكريدي الزبائن الديون كناش النقاط customers credit debt',
        pillar: 'money',
        icon: Users,
        metric:
          liveMetrics.creditTotal > 0
            ? `${liveMetrics.creditTotal.toFixed(0)} ${currencySymbol}`
            : `${liveMetrics.customersCount}`
      },
      {
        id: 'sec-remise',
        tab: 'remise_box',
        titleAr: 'الرميز (صندوق الرميز)',
        titleFr: 'Caisse Remises',
        titleEn: 'Remise Box',
        subtitleAr: 'تتبع الريميز والهدايا من الشركات',
        subtitleFr: 'Suivi remises fournisseurs',
        subtitleEn: 'Supplier rebate tracking',
        keywords: 'الرميز صندوق الرميز شركات remise',
        pillar: 'money',
        icon: Coins
      },
      {
        id: 'sec-remote',
        tab: 'remote_sales',
        titleAr: 'البيع عن بعد',
        titleFr: 'Vente à distance',
        titleEn: 'Remote & WhatsApp',
        subtitleAr: 'طلبات الواتساب والتوصيل',
        subtitleFr: 'Commandes WhatsApp & livraison',
        subtitleEn: 'WhatsApp orders & delivery',
        keywords: 'البيع عن بعد واتساب توصيل remote whatsapp',
        pillar: 'money',
        icon: Send,
        metric: liveMetrics.pendingRemote > 0 ? `${liveMetrics.pendingRemote}` : undefined
      },
      {
        id: 'sec-ai',
        tab: 'ai_assistant',
        titleAr: 'المساعد الذكي',
        titleFr: 'Assistant IA',
        titleEn: 'AI Assistant',
        subtitleAr: 'استشارات المحال وتحليل سريع',
        subtitleFr: 'Conseils et analyse rapide',
        subtitleEn: 'Smart store assistant',
        keywords: 'المساعد الذكي ذكاء ai assistant',
        pillar: 'money',
        icon: Sparkles
      },

      // Pillar 3: الأرقام والتقارير (7 sections - Blue)
      {
        id: 'sec-home-summary',
        tab: 'home_summary',
        titleAr: 'فين مشى المحال',
        titleFr: 'Bilan Boutique',
        titleEn: 'Shop Pulse',
        subtitleAr: 'عدد الداخلين، نسبة الشراء، والخلاصة',
        subtitleFr: 'Visiteurs, conversion et bilan',
        subtitleEn: 'Visitors, conversion & pulse',
        keywords: 'فين مشى المحال الداخلين الخلاصة pulse visitors',
        pillar: 'numbers',
        icon: Home,
        metric: `${liveMetrics.todaySales.toFixed(0)} ${currencySymbol}`
      },
      {
        id: 'sec-peak',
        tab: 'customers_peak',
        titleAr: 'الذروة وأوقات الزبناء',
        titleFr: 'Clients & Pics',
        titleEn: 'Peak Hours & Clients',
        subtitleAr: 'ساعات الذروة والزبناء الأوفياء',
        subtitleFr: 'Heures de pointe et fidélité',
        subtitleEn: 'Peak hours & loyal clients',
        keywords: 'الذروة الساعات الزبناء الأوفياء peak',
        pillar: 'numbers',
        icon: BarChart3
      },
      {
        id: 'sec-analytics',
        tab: 'analytics',
        titleAr: 'الأرباح والتقارير والإحصائيات',
        titleFr: 'Profits & Rapports',
        titleEn: 'Profits & Reports',
        subtitleAr: 'صافي الربح، المداخيل، والرسوم',
        subtitleFr: 'Bénéfice net et statistiques',
        subtitleEn: 'Net profit, charts & KPIs',
        keywords: 'الأرباح التقارير الإحصائيات analytics profit reports',
        pillar: 'numbers',
        icon: Calculator
      },
      {
        id: 'sec-cpu',
        tab: 'cpu_tax',
        titleAr: 'الضرائب CPU',
        titleFr: 'Impôt CPU',
        titleEn: 'CPU Tax',
        subtitleAr: 'حساب الضريبة المساهمة المهنية',
        subtitleFr: 'Calcul impôt CPU & CNSS',
        subtitleEn: 'CPU tax & declarations',
        keywords: 'الضرائب الضريبة cpu tax cnss',
        pillar: 'numbers',
        icon: Landmark,
        metric:
          liveMetrics.unpaidCpu > 0
            ? `${liveMetrics.unpaidCpu.toFixed(0)} ${currencySymbol}`
            : undefined
      },
      {
        id: 'sec-dream',
        tab: 'dream',
        titleAr: 'الأهداف وحلم المحال',
        titleFr: 'Objectifs & Rêve',
        titleEn: 'Goals & Shop Dream',
        subtitleAr: 'تتبع الأهداف وحاسبة هامش الربح',
        subtitleFr: 'Objectifs et calculateur marge',
        subtitleEn: 'Targets & margin calculator',
        keywords: 'الأهداف الحلم هامش الربح goals dream',
        pillar: 'numbers',
        icon: Star
      },
      {
        id: 'sec-alerts',
        tab: 'alerts',
        titleAr: 'التنبيهات والصلاحية',
        titleFr: 'Alertes & Expiration',
        titleEn: 'Alerts Center',
        subtitleAr: 'نقص المخزون، الصلاحية، والأمان',
        subtitleFr: 'Ruptures, péremption et sécurité',
        subtitleEn: 'Low stock, expiry & alerts',
        keywords: 'التنبيهات الصلاحية النقص alerts',
        pillar: 'numbers',
        icon: Bell,
        metric: liveMetrics.alertsCount > 0 ? `${liveMetrics.alertsCount}` : undefined
      },
      {
        id: 'sec-settings',
        tab: 'settings',
        titleAr: 'الإعدادات والنسخ الاحتياطي',
        titleFr: 'Paramètres & Sauvegarde',
        titleEn: 'Settings & Backup',
        subtitleAr: 'المحال، الطابعة، السحابة والصور',
        subtitleFr: 'Boutique, imprimante et sauvegarde',
        subtitleEn: 'Store, printer, cloud & backup',
        keywords: 'الإعدادات النسخ الاحتياطي الصور الطابعة settings backup',
        pillar: 'numbers',
        icon: Settings
      }
    ],
    [liveMetrics, currencySymbol, currentShift.status, isAr]
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    if (!normalizedQuery) return sections;
    return sections.filter((s) => {
      const haystack = `${s.titleAr} ${s.titleFr} ${s.titleEn} ${s.subtitleAr} ${s.keywords}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [sections, normalizedQuery]);

  const goodsList = filteredSections.filter((s) => s.pillar === 'goods');
  const moneyList = filteredSections.filter((s) => s.pillar === 'money');
  const numbersList = filteredSections.filter((s) => s.pillar === 'numbers');

  const getTitle = (item: MapSectionItem) =>
    isAr ? item.titleAr : isFr ? item.titleFr : item.titleEn;
  const getSubtitle = (item: MapSectionItem) =>
    isAr ? item.subtitleAr : isFr ? item.subtitleFr : item.subtitleEn;

  const renderSectionButton = (
    item: MapSectionItem,
    accentHoverClass: string,
    iconBoxClass: string
  ) => {
    const Icon = item.icon;
    const protectedRoute = isTabProtected(item.tab);
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onSelectSection(item.tab)}
        className={`w-full min-h-[54px] px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 ${accentHoverClass} flex items-center justify-between gap-3 text-start transition-colors active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBoxClass}`}
          >
            <Icon className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {getTitle(item)}
              </span>
              {protectedRoute && (
                <Lock className="w-3 h-3 text-amber-500 shrink-0" aria-hidden="true" />
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {getSubtitle(item)}
            </p>
          </div>
        </div>

        {item.metric && (
          <span className="text-xs font-mono font-bold tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
            {item.metric}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 transition-colors">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Hero Hub: Center Emblem + Title + Quick Search */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Circular Orange Hub Emblem */}
            <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-start">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-[6px] border-orange-500 bg-white dark:bg-slate-900 flex flex-col items-center justify-center shrink-0 shadow-xs">
                <ShoppingCart className="w-7 h-7 text-orange-600 dark:text-orange-400 mb-1" />
                <span className="text-base font-black text-slate-900 dark:text-white leading-tight">
                  {isAr ? 'المحال ديالي' : isFr ? 'Ma Boutique' : 'My Shop'}
                </span>
                <span className="text-[11px] font-mono font-bold tabular-nums text-orange-600 dark:text-orange-400 mt-0.5">
                  {isAr ? '21 قسم' : '21 Modules'}
                </span>
              </div>

              <div className="space-y-1.5">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {isAr
                    ? 'خريطة المحال ديالي — 21 قسم لتسيير متجر البقالة'
                    : isFr
                    ? 'Carte de ma boutique — 21 modules de gestion'
                    : 'My Store Map — 21 Grocery Management Modules'}
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  {settings.storeName}
                  <span className="mx-2" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                    {isAr
                      ? `مبيعات اليوم: ${liveMetrics.todaySales.toFixed(2)} ${currencySymbol}`
                      : `Today: ${liveMetrics.todaySales.toFixed(2)} ${currencySymbol}`}
                  </span>
                  <span className="mx-2" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono tabular-nums">
                    {liveMetrics.productsCount} {isAr ? 'منتج' : 'items'}
                  </span>
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isAr
                    ? 'منظم و واضح و سهل الاستخدام — اضغط على أي قسم لفتحه مباشرة'
                    : isFr
                    ? 'Organisé, clair et simple — cliquez sur un module pour l’ouvrir'
                    : 'Organized, clear and easy to use — tap any section to open it'}
                </p>
              </div>
            </div>

            {/* Quick Filter Search */}
            <div className="w-full md:w-72 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={isAr ? 'قلب على أي قسم (كريدي، ضرائب، جرد)...' : 'Filter 21 sections...'}
                  className="w-full min-h-[44px] ps-9 pe-9 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-orange-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label={isAr ? 'مسح البحث' : 'Clear search'}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 absolute end-1.5 top-1/2 -translate-y-1/2"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Empty filter state */}
        {filteredSections.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
              {isAr ? `لا يوجد قسم مطابق لـ "${searchQuery}"` : `No sections matching "${searchQuery}"`}
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold whitespace-nowrap"
            >
              {isAr ? 'عرض جميع الأقسام (21)' : 'Show All 21 Sections'}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Two Main Side-by-Side Pillars: السلعة (Green) & البيع والفلوس (Orange) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Pillar 1: السلعة والمخزون (Green) */}
              {goodsList.length > 0 && (
                <section className="space-y-2.5">
                  <div className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2 font-black text-sm">
                      <Package className="w-4.5 h-4.5 shrink-0" />
                      <span>{isAr ? 'السلعة والمخزون' : isFr ? 'Stock & Marchandises' : 'Goods & Inventory'}</span>
                    </div>
                    <span className="text-xs font-mono tabular-nums font-bold opacity-90">
                      {goodsList.length} {isAr ? 'أقسام' : 'sections'}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {goodsList.map((item) =>
                      renderSectionButton(
                        item,
                        'hover:border-emerald-400 dark:hover:border-emerald-600 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20',
                        'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                      )
                    )}
                  </div>
                </section>
              )}

              {/* Pillar 2: البيع والفلوس (Orange) */}
              {moneyList.length > 0 && (
                <section className="space-y-2.5">
                  <div className="px-4 py-2.5 rounded-xl bg-orange-500 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2 font-black text-sm">
                      <Wallet className="w-4.5 h-4.5 shrink-0" />
                      <span>{isAr ? 'البيع والفلوس' : isFr ? 'Ventes & Argent' : 'Sales & Cash'}</span>
                    </div>
                    <span className="text-xs font-mono tabular-nums font-bold opacity-90">
                      {moneyList.length} {isAr ? 'أقسام' : 'sections'}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {moneyList.map((item) =>
                      renderSectionButton(
                        item,
                        'hover:border-orange-400 dark:hover:border-orange-600 hover:bg-orange-50/40 dark:hover:bg-orange-950/20',
                        'bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300'
                      )
                    )}
                  </div>
                </section>
              )}
            </div>

            {/* Pillar 3: الأرقام والتقارير (Blue Full-Width Strip) */}
            {numbersList.length > 0 && (
              <section className="space-y-2.5">
                <div className="px-4 py-2.5 rounded-xl bg-blue-600 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2 font-black text-sm">
                    <CreditCard className="w-4.5 h-4.5 shrink-0" />
                    <span>{isAr ? 'الأرقام والتقارير' : isFr ? 'Chiffres & Rapports' : 'Numbers & Reports'}</span>
                  </div>
                  <span className="text-xs font-mono tabular-nums font-bold opacity-90">
                    {numbersList.length} {isAr ? 'أقسام' : 'sections'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                  {numbersList.map((item) =>
                    renderSectionButton(
                      item,
                      'hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50/40 dark:hover:bg-blue-950/20',
                      'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                    )
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
