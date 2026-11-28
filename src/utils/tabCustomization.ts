import type { LucideIcon } from 'lucide-react';
import {
  Store,
  Layers,
  Receipt,
  Clock,
  Users,
  Wallet,
  Send,
  Landmark,
  TrendingUp,
  Sparkles,
  Settings,
  Bell,
  ShoppingBag,
  Package,
  Tag,
  BarChart3,
  CreditCard,
  Calculator,
  Coins,
  Star,
  Heart,
  Zap,
  Shield,
  Smartphone,
  Printer,
  BookOpen,
  Boxes,
  Truck,
  FileText,
  PieChart,
  Briefcase,
  Award,
  Ear,
  Compass,
  Home,
  LayoutGrid
} from 'lucide-react';

export type TabIconKey =
  | 'store'
  | 'layers'
  | 'receipt'
  | 'clock'
  | 'users'
  | 'wallet'
  | 'send'
  | 'landmark'
  | 'trending_up'
  | 'sparkles'
  | 'settings'
  | 'bell'
  | 'shopping_bag'
  | 'package'
  | 'tag'
  | 'bar_chart'
  | 'credit_card'
  | 'calculator'
  | 'coins'
  | 'star'
  | 'heart'
  | 'zap'
  | 'shield'
  | 'smartphone'
  | 'printer'
  | 'book_open'
  | 'boxes'
  | 'truck'
  | 'file_text'
  | 'pie_chart'
  | 'briefcase'
  | 'award'
  | 'ear'
  | 'compass'
  | 'home'
  | 'layout_grid';

export type TabColorKey =
  | 'emerald'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'rose'
  | 'amber'
  | 'orange'
  | 'teal'
  | 'cyan'
  | 'slate';

export interface TabIconOption {
  key: TabIconKey;
  labelAr: string;
  labelEn: string;
  icon: LucideIcon;
}

export const TAB_ICON_OPTIONS: TabIconOption[] = [
  { key: 'layout_grid', labelAr: 'خريطة الأقسام', labelEn: 'Store Map', icon: LayoutGrid },
  { key: 'home', labelAr: 'الرئيسية / المحال', labelEn: 'Home', icon: Home },
  { key: 'store', labelAr: 'متجر', labelEn: 'Store', icon: Store },
  { key: 'shopping_bag', labelAr: 'سلة تسوق', labelEn: 'Shopping Bag', icon: ShoppingBag },
  { key: 'layers', labelAr: 'طبقات / مخزون', labelEn: 'Inventory', icon: Layers },
  { key: 'boxes', labelAr: 'صناديق', labelEn: 'Boxes', icon: Boxes },
  { key: 'package', labelAr: 'طرد / سلعة', labelEn: 'Package', icon: Package },
  { key: 'receipt', labelAr: 'فاتورة', labelEn: 'Receipt', icon: Receipt },
  { key: 'file_text', labelAr: 'مستند', labelEn: 'Document', icon: FileText },
  { key: 'clock', labelAr: 'ساعة / وردية', labelEn: 'Clock', icon: Clock },
  { key: 'users', labelAr: 'عملاء', labelEn: 'Customers', icon: Users },
  { key: 'book_open', labelAr: 'كناش / دفتر', labelEn: 'Ledger', icon: BookOpen },
  { key: 'credit_card', labelAr: 'بطاقة', labelEn: 'Card', icon: CreditCard },
  { key: 'wallet', labelAr: 'محفظة', labelEn: 'Wallet', icon: Wallet },
  { key: 'coins', labelAr: 'نقود', labelEn: 'Coins', icon: Coins },
  { key: 'send', labelAr: 'إرسال / توصيل', labelEn: 'Send', icon: Send },
  { key: 'truck', labelAr: 'شاحنة', labelEn: 'Delivery', icon: Truck },
  { key: 'landmark', labelAr: 'بنك / ضريبة', labelEn: 'Bank / Tax', icon: Landmark },
  { key: 'calculator', labelAr: 'حاسبة', labelEn: 'Calculator', icon: Calculator },
  { key: 'trending_up', labelAr: 'أرباح', labelEn: 'Growth', icon: TrendingUp },
  { key: 'bar_chart', labelAr: 'إحصائيات', labelEn: 'Bar Chart', icon: BarChart3 },
  { key: 'pie_chart', labelAr: 'نسب', labelEn: 'Pie Chart', icon: PieChart },
  { key: 'sparkles', labelAr: 'ذكاء اصطناعي', labelEn: 'AI Sparkles', icon: Sparkles },
  { key: 'zap', labelAr: 'سريع', labelEn: 'Zap', icon: Zap },
  { key: 'bell', labelAr: 'جرس / تنبيه', labelEn: 'Bell', icon: Bell },
  { key: 'shield', labelAr: 'حماية', labelEn: 'Shield', icon: Shield },
  { key: 'tag', labelAr: 'تسعير', labelEn: 'Tag', icon: Tag },
  { key: 'star', labelAr: 'نجمة', labelEn: 'Star', icon: Star },
  { key: 'heart', labelAr: 'مفضل', labelEn: 'Heart', icon: Heart },
  { key: 'award', labelAr: 'وسام', labelEn: 'Award', icon: Award },
  { key: 'briefcase', labelAr: 'عمل', labelEn: 'Briefcase', icon: Briefcase },
  { key: 'ear', labelAr: 'ودن الحانوت', labelEn: 'Shop Ear', icon: Ear },
  { key: 'compass', labelAr: 'رادار السوق', labelEn: 'Market Radar', icon: Compass },
  { key: 'smartphone', labelAr: 'هاتف', labelEn: 'Phone', icon: Smartphone },
  { key: 'printer', labelAr: 'طابعة', labelEn: 'Printer', icon: Printer },
  { key: 'settings', labelAr: 'إعدادات', labelEn: 'Settings', icon: Settings }
];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  TAB_ICON_OPTIONS.map((item) => [item.key, item.icon])
);

export interface TabColorPreset {
  id: TabColorKey;
  labelAr: string;
  labelEn: string;
  swatchHex: string;
  activeNavClass: string;
  iconTintClass: string;
  softCardClass: string;
  badgeSolidClass: string;
  mobileActiveTextClass: string;
  mobileActiveBgClass: string;
  ringClass: string;
}

export const TAB_COLOR_PRESETS: Record<TabColorKey, TabColorPreset> = {
  emerald: {
    id: 'emerald',
    labelAr: 'أخضر زمردي',
    labelEn: 'Emerald',
    swatchHex: '#059669',
    activeNavClass:
      'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-700/60 font-bold',
    iconTintClass: 'text-emerald-600 dark:text-emerald-400',
    softCardClass:
      'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300',
    badgeSolidClass: 'bg-emerald-600 text-white',
    mobileActiveTextClass: 'text-emerald-600 dark:text-emerald-400',
    mobileActiveBgClass: 'bg-emerald-50 dark:bg-emerald-950/60',
    ringClass: 'ring-2 ring-emerald-500/40'
  },
  blue: {
    id: 'blue',
    labelAr: 'أزرق ملكي',
    labelEn: 'Royal Blue',
    swatchHex: '#2563eb',
    activeNavClass:
      'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-700/60 font-bold',
    iconTintClass: 'text-blue-600 dark:text-blue-400',
    softCardClass:
      'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800/70 text-blue-700 dark:text-blue-300',
    badgeSolidClass: 'bg-blue-600 text-white',
    mobileActiveTextClass: 'text-blue-600 dark:text-blue-400',
    mobileActiveBgClass: 'bg-blue-50 dark:bg-blue-950/60',
    ringClass: 'ring-2 ring-blue-500/40'
  },
  indigo: {
    id: 'indigo',
    labelAr: 'نيلي عميق',
    labelEn: 'Indigo',
    swatchHex: '#4f46e5',
    activeNavClass:
      'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-700/60 font-bold',
    iconTintClass: 'text-indigo-600 dark:text-indigo-400',
    softCardClass:
      'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800/70 text-indigo-700 dark:text-indigo-300',
    badgeSolidClass: 'bg-indigo-600 text-white',
    mobileActiveTextClass: 'text-indigo-600 dark:text-indigo-400',
    mobileActiveBgClass: 'bg-indigo-50 dark:bg-indigo-950/60',
    ringClass: 'ring-2 ring-indigo-500/40'
  },
  violet: {
    id: 'violet',
    labelAr: 'بنفسجي',
    labelEn: 'Violet',
    swatchHex: '#7c3aed',
    activeNavClass:
      'bg-violet-50 dark:bg-violet-950/70 text-violet-700 dark:text-violet-300 border border-violet-200/80 dark:border-violet-700/60 font-bold',
    iconTintClass: 'text-violet-600 dark:text-violet-400',
    softCardClass:
      'bg-violet-50 dark:bg-violet-950/50 border-violet-200 dark:border-violet-800/70 text-violet-700 dark:text-violet-300',
    badgeSolidClass: 'bg-violet-600 text-white',
    mobileActiveTextClass: 'text-violet-600 dark:text-violet-400',
    mobileActiveBgClass: 'bg-violet-50 dark:bg-violet-950/60',
    ringClass: 'ring-2 ring-violet-500/40'
  },
  rose: {
    id: 'rose',
    labelAr: 'وردي قرمزي',
    labelEn: 'Rose',
    swatchHex: '#e11d48',
    activeNavClass:
      'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-700/60 font-bold',
    iconTintClass: 'text-rose-600 dark:text-rose-400',
    softCardClass:
      'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/70 text-rose-700 dark:text-rose-300',
    badgeSolidClass: 'bg-rose-600 text-white',
    mobileActiveTextClass: 'text-rose-600 dark:text-rose-400',
    mobileActiveBgClass: 'bg-rose-50 dark:bg-rose-950/60',
    ringClass: 'ring-2 ring-rose-500/40'
  },
  amber: {
    id: 'amber',
    labelAr: 'ذهبي عنبري',
    labelEn: 'Amber',
    swatchHex: '#d97706',
    activeNavClass:
      'bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-700/60 font-bold',
    iconTintClass: 'text-amber-600 dark:text-amber-400',
    softCardClass:
      'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/70 text-amber-800 dark:text-amber-300',
    badgeSolidClass: 'bg-amber-600 text-white',
    mobileActiveTextClass: 'text-amber-600 dark:text-amber-400',
    mobileActiveBgClass: 'bg-amber-50 dark:bg-amber-950/60',
    ringClass: 'ring-2 ring-amber-500/40'
  },
  orange: {
    id: 'orange',
    labelAr: 'برتقالي',
    labelEn: 'Orange',
    swatchHex: '#ea580c',
    activeNavClass:
      'bg-orange-50 dark:bg-orange-950/70 text-orange-700 dark:text-orange-300 border border-orange-200/80 dark:border-orange-700/60 font-bold',
    iconTintClass: 'text-orange-600 dark:text-orange-400',
    softCardClass:
      'bg-orange-50 dark:bg-orange-950/50 border-orange-200 dark:border-orange-800/70 text-orange-700 dark:text-orange-300',
    badgeSolidClass: 'bg-orange-600 text-white',
    mobileActiveTextClass: 'text-orange-600 dark:text-orange-400',
    mobileActiveBgClass: 'bg-orange-50 dark:bg-orange-950/60',
    ringClass: 'ring-2 ring-orange-500/40'
  },
  teal: {
    id: 'teal',
    labelAr: 'تركواز',
    labelEn: 'Teal',
    swatchHex: '#0d9488',
    activeNavClass:
      'bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border border-teal-200/80 dark:border-teal-700/60 font-bold',
    iconTintClass: 'text-teal-600 dark:text-teal-400',
    softCardClass:
      'bg-teal-50 dark:bg-teal-950/50 border-teal-200 dark:border-teal-800/70 text-teal-700 dark:text-teal-300',
    badgeSolidClass: 'bg-teal-600 text-white',
    mobileActiveTextClass: 'text-teal-600 dark:text-teal-400',
    mobileActiveBgClass: 'bg-teal-50 dark:bg-teal-950/60',
    ringClass: 'ring-2 ring-teal-500/40'
  },
  cyan: {
    id: 'cyan',
    labelAr: 'سماوي',
    labelEn: 'Cyan',
    swatchHex: '#0891b2',
    activeNavClass:
      'bg-cyan-50 dark:bg-cyan-950/70 text-cyan-700 dark:text-cyan-300 border border-cyan-200/80 dark:border-cyan-700/60 font-bold',
    iconTintClass: 'text-cyan-600 dark:text-cyan-400',
    softCardClass:
      'bg-cyan-50 dark:bg-cyan-950/50 border-cyan-200 dark:border-cyan-800/70 text-cyan-700 dark:text-cyan-300',
    badgeSolidClass: 'bg-cyan-600 text-white',
    mobileActiveTextClass: 'text-cyan-600 dark:text-cyan-400',
    mobileActiveBgClass: 'bg-cyan-50 dark:bg-cyan-950/60',
    ringClass: 'ring-2 ring-cyan-500/40'
  },
  slate: {
    id: 'slate',
    labelAr: 'رمادي أنيق',
    labelEn: 'Slate',
    swatchHex: '#475569',
    activeNavClass:
      'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 font-bold',
    iconTintClass: 'text-slate-600 dark:text-slate-300',
    softCardClass:
      'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200',
    badgeSolidClass: 'bg-slate-700 text-white',
    mobileActiveTextClass: 'text-slate-900 dark:text-white',
    mobileActiveBgClass: 'bg-slate-100 dark:bg-slate-800',
    ringClass: 'ring-2 ring-slate-500/40'
  }
};

export interface PosTabDefinition {
  id:
    | 'store_map'
    | 'home_summary'
    | 'pos'
    | 'branch_stock'
    | 'bourse'
    | 'inventory'
    | 'invoice_ocr'
    | 'orders'
    | 'shifts'
    | 'customers'
    | 'expenses'
    | 'remise_box'
    | 'remote_sales'
    | 'cpu_tax'
    | 'analytics'
    | 'customers_peak'
    | 'shop_ear'
    | 'market_radar'
    | 'dream'
    | 'ai_assistant'
    | 'alerts'
    | 'settings';
  labelAr: string;
  labelFr: string;
  labelEn: string;
  shortLabelAr: string;
  shortLabelFr: string;
  shortLabelEn: string;
  defaultIcon: TabIconKey;
  defaultColor: TabColorKey;
  showInTopNav?: boolean;
}

export const FOCUSED_CASHIER_TAB_IDS: ReadonlySet<PosTabDefinition['id']> = new Set([
  'store_map',
  'home_summary',
  'pos',
  'customers',
  'orders',
  'shifts',
  'inventory',
  'alerts',
  'settings'
]);

export const POS_TAB_CATALOG: PosTabDefinition[] = [
  {
    id: 'store_map',
    labelAr: 'خريطة المحال (21 قسم)',
    labelFr: 'Carte Boutique (21)',
    labelEn: 'Store Map (21)',
    shortLabelAr: 'الخريطة',
    shortLabelFr: 'Carte',
    shortLabelEn: 'Map',
    defaultIcon: 'layout_grid',
    defaultColor: 'orange',
    showInTopNav: true
  },
  {
    id: 'home_summary',
    labelAr: 'فين مشى المحال',
    labelFr: 'Bilan Boutique',
    labelEn: 'Shop Pulse',
    shortLabelAr: 'فين مشى المحال',
    shortLabelFr: 'Accueil',
    shortLabelEn: 'Home',
    defaultIcon: 'home',
    defaultColor: 'emerald',
    showInTopNav: true
  },
  {
    id: 'pos',
    labelAr: 'نقطة البيع',
    labelFr: 'Caisse POS',
    labelEn: 'POS Register',
    shortLabelAr: 'البيع',
    shortLabelFr: 'Caisse',
    shortLabelEn: 'POS',
    defaultIcon: 'store',
    defaultColor: 'emerald',
    showInTopNav: true
  },
  {
    id: 'branch_stock',
    labelAr: 'مخزون الفروع',
    labelFr: 'Stock Branches',
    labelEn: 'Branch Stock',
    shortLabelAr: 'الفروع',
    shortLabelFr: 'Branches',
    shortLabelEn: 'Branches',
    defaultIcon: 'boxes',
    defaultColor: 'emerald',
    showInTopNav: true
  },
  {
    id: 'bourse',
    labelAr: 'بورصة الحانوت',
    labelFr: 'Bourse Hanout',
    labelEn: 'Bourse Hanout',
    shortLabelAr: 'البورصة',
    shortLabelFr: 'Bourse',
    shortLabelEn: 'Bourse',
    defaultIcon: 'trending_up',
    defaultColor: 'emerald',
    showInTopNav: true
  },
  {
    id: 'inventory',
    labelAr: 'إدارة المخزون والتتبع',
    labelFr: 'Inventaire & Stock',
    labelEn: 'Inventory & Stock',
    shortLabelAr: 'المخزون',
    shortLabelFr: 'Stock',
    shortLabelEn: 'Stock',
    defaultIcon: 'layers',
    defaultColor: 'blue',
    showInTopNav: true
  },
  {
    id: 'invoice_ocr',
    labelAr: 'تصوير الفاتورة للمخزون (OCR)',
    labelFr: 'Scan Facture OCR',
    labelEn: 'Invoice OCR',
    shortLabelAr: 'فاتورة OCR',
    shortLabelFr: 'Facture OCR',
    shortLabelEn: 'Invoice OCR',
    defaultIcon: 'file_text',
    defaultColor: 'emerald',
    showInTopNav: true
  },
  {
    id: 'orders',
    labelAr: 'الفواتير والمبيعات',
    labelFr: 'Factures',
    labelEn: 'Receipts',
    shortLabelAr: 'الفواتير',
    shortLabelFr: 'Ventes',
    shortLabelEn: 'Receipts',
    defaultIcon: 'receipt',
    defaultColor: 'teal',
    showInTopNav: true
  },
  {
    id: 'shifts',
    labelAr: 'الورديات والصندوق',
    labelFr: 'Caisse & Shifts',
    labelEn: 'Shifts & Cash',
    shortLabelAr: 'الصندوق',
    shortLabelFr: 'Caisse',
    shortLabelEn: 'Shifts',
    defaultIcon: 'clock',
    defaultColor: 'amber',
    showInTopNav: true
  },
  {
    id: 'customers',
    labelAr: 'كناش الكريدي والعملاء',
    labelFr: 'Carnet Crédit',
    labelEn: 'Credit Ledger & Customers',
    shortLabelAr: 'الكريدي',
    shortLabelFr: 'Crédit',
    shortLabelEn: 'Credit',
    defaultIcon: 'users',
    defaultColor: 'indigo',
    showInTopNav: true
  },
  {
    id: 'expenses',
    labelAr: 'المصاريف',
    labelFr: 'Dépenses',
    labelEn: 'Expenses',
    shortLabelAr: 'المصاريف',
    shortLabelFr: 'Dépenses',
    shortLabelEn: 'Expenses',
    defaultIcon: 'wallet',
    defaultColor: 'rose',
    showInTopNav: true
  },
  {
    id: 'remise_box',
    labelAr: 'صندوق الريميز',
    labelFr: 'Caisse Remises',
    labelEn: 'Remise Box',
    shortLabelAr: 'الريميز',
    shortLabelFr: 'Remises',
    shortLabelEn: 'Remise',
    defaultIcon: 'coins',
    defaultColor: 'emerald',
    showInTopNav: true
  },
  {
    id: 'remote_sales',
    labelAr: 'البيع عن بعد',
    labelFr: 'Vente à distance',
    labelEn: 'Remote & WA',
    shortLabelAr: 'عن بعد',
    shortLabelFr: 'Distance',
    shortLabelEn: 'Remote',
    defaultIcon: 'send',
    defaultColor: 'cyan',
    showInTopNav: true
  },
  {
    id: 'cpu_tax',
    labelAr: 'ضرائبي CPU',
    labelFr: 'Impôt CPU',
    labelEn: 'CPU Tax',
    shortLabelAr: 'الضرائب',
    shortLabelFr: 'CPU',
    shortLabelEn: 'CPU Tax',
    defaultIcon: 'landmark',
    defaultColor: 'orange',
    showInTopNav: true
  },
  {
    id: 'analytics',
    labelAr: 'التقارير والأرباح',
    labelFr: 'Rapports & Profits',
    labelEn: 'Analytics & Profit',
    shortLabelAr: 'الأرباح',
    shortLabelFr: 'Rapports',
    shortLabelEn: 'Reports',
    defaultIcon: 'trending_up',
    defaultColor: 'emerald',
    showInTopNav: true
  },
  {
    id: 'customers_peak',
    labelAr: 'الزبناء و الذروة',
    labelFr: 'Clients & Pics',
    labelEn: 'Customers & Peak',
    shortLabelAr: 'الذروة',
    shortLabelFr: 'Pics',
    shortLabelEn: 'Peak',
    defaultIcon: 'bar_chart',
    defaultColor: 'amber',
    showInTopNav: true
  },
  {
    id: 'shop_ear',
    labelAr: 'ودن الحانوت',
    labelFr: 'Demandes Clients',
    labelEn: 'Shop Ear',
    shortLabelAr: 'ودن الحانوت',
    shortLabelFr: 'Demandes',
    shortLabelEn: 'Shop Ear',
    defaultIcon: 'ear',
    defaultColor: 'orange',
    showInTopNav: true
  },
  {
    id: 'market_radar',
    labelAr: 'رادار اتجاهات السوق',
    labelFr: 'Radar Marché',
    labelEn: 'Market Radar',
    shortLabelAr: 'رادار السوق',
    shortLabelFr: 'Radar',
    shortLabelEn: 'Radar',
    defaultIcon: 'compass',
    defaultColor: 'amber',
    showInTopNav: true
  },
  {
    id: 'dream',
    labelAr: 'الحلم ديال المحال',
    labelFr: 'Mon Rêve',
    labelEn: 'Shop Dream',
    shortLabelAr: 'الحلم',
    shortLabelFr: 'Rêve',
    shortLabelEn: 'Dream',
    defaultIcon: 'star',
    defaultColor: 'amber',
    showInTopNav: true
  },
  {
    id: 'ai_assistant',
    labelAr: 'مساعد الذكاء الاصطناعي',
    labelFr: 'Assistant IA',
    labelEn: 'AI Assistant',
    shortLabelAr: 'الذكاء',
    shortLabelFr: 'IA',
    shortLabelEn: 'AI',
    defaultIcon: 'sparkles',
    defaultColor: 'violet',
    showInTopNav: true
  },
  {
    id: 'alerts',
    labelAr: 'مركز التنبيهات',
    labelFr: 'Alertes',
    labelEn: 'Alerts Center',
    shortLabelAr: 'التنبيهات',
    shortLabelFr: 'Alertes',
    shortLabelEn: 'Alerts',
    defaultIcon: 'bell',
    defaultColor: 'amber',
    showInTopNav: false
  },
  {
    id: 'settings',
    labelAr: 'الإعدادات',
    labelFr: 'Paramètres',
    labelEn: 'Settings',
    shortLabelAr: 'الإعدادات',
    shortLabelFr: 'Réglages',
    shortLabelEn: 'Settings',
    defaultIcon: 'settings',
    defaultColor: 'slate',
    showInTopNav: true
  }
];

export function resolveTabVisual(
  tabId: string,
  customizations?: Record<string, { icon?: string; color?: string }>
) {
  const def = POS_TAB_CATALOG.find((t) => t.id === tabId) || POS_TAB_CATALOG[0];
  const custom = customizations?.[tabId];
  const iconKey = (custom?.icon && ICON_MAP[custom.icon] ? custom.icon : def.defaultIcon) as TabIconKey;
  const IconComponent = ICON_MAP[iconKey] || Store;
  const colorKey = (
    custom?.color && TAB_COLOR_PRESETS[custom.color as TabColorKey]
      ? custom.color
      : def.defaultColor
  ) as TabColorKey;
  const colorPreset = TAB_COLOR_PRESETS[colorKey] || TAB_COLOR_PRESETS.emerald;

  return {
    definition: def,
    iconKey,
    IconComponent,
    colorKey,
    colorPreset
  };
}
