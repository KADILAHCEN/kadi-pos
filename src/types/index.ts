export type CurrencyCode = 'SAR' | 'MAD' | 'USD' | 'EUR' | 'AED' | 'KWD';

export type UnitType = 'piece' | 'kg' | 'liter' | 'box';

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  date: string;
  type: 'sale' | 'restock' | 'waste' | 'audit_adjustment' | 'refund';
  quantityChange: number;
  previousStock: number;
  newStock: number;
  unit: UnitType;
  costPerUnit: number;
  reason?: string;
  orderNumber?: string;
}

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  price: number;
  costPrice?: number;
  stock: number;
}

export interface ProductModifier {
  id: string;
  name: string;
  price: number;
}

export interface Product {
  id: string;
  name: string;
  nameEn: string;
  sku: string;
  barcode: string;
  categoryId: string;
  price: number;
  costPrice: number;
  stock: number;
  lowStockThreshold: number;
  unitType: UnitType; // 'piece' (حبة), 'kg' (كيلو), 'liter' (لتر), 'box' (كرتون)
  image?: string;
  color?: string;
  taxExempt?: boolean;
  hasVariants?: boolean;
  variants?: ProductVariant[];
  availableModifiers?: ProductModifier[];
  branchStocks?: Record<string, number>; // Specific stock allocated per branch ID
  expiryDate?: string; // YYYY-MM-DD تاريخ انتهاء الصلاحية
}

export interface Branch {
  id: string;
  name: string;
  nameEn: string;
  code: string; // e.g. "SEF-01", "SEF-02", "FES-01"
  city: string;
  address: string;
  phone: string;
  managerName: string;
  isMain: boolean;
  status: 'active' | 'inactive';
  createdAt: string;
  syncStatus?: 'synced' | 'syncing' | 'pending';
  lastSyncAt?: string;
}

export interface BranchTransfer {
  id: string;
  transferNumber: string; // e.g. "TR-101"
  date: string;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: UnitType;
  status: 'completed' | 'in_transit' | 'cancelled';
  notes?: string;
  createdBy: string;
}

export interface Category {
  id: string;
  name: string;
  nameEn: string;
  image?: string;
  iconName?: string;
  color?: string;
}

export interface SelectedModifier {
  id: string;
  name: string;
  price: number;
}

export interface CartItem {
  id: string; // unique cart item id (e.g. product.id + variantId + modifiers)
  productId: string;
  productName: string;
  productNameEn: string;
  sku: string;
  barcode: string;
  price: number;
  originalPrice?: number;
  isPriceOverridden?: boolean;
  priceOverrideReason?: string;
  costPrice: number;
  quantity: number;
  unitType?: UnitType;
  variantId?: string;
  variantName?: string;
  modifiers?: SelectedModifier[];
  itemDiscount?: {
    type: 'percent' | 'fixed';
    value: number;
  };
  note?: string;
  image?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  points: number;
  balance: number; // for credit / on-account purchases (الكريدي)
  tier: 'Silver' | 'Gold' | 'Platinum';
  totalSpent: number;
  ordersCount: number;
  creditLimit?: number; // سقف الكريدي الأقصى
  createdAt: string;
  notes?: string;
}

export interface CreditTransaction {
  id: string;
  customerId: string;
  customerName: string;
  type: 'debt' | 'payment'; // 'debt' = تقييد كريدي جديد, 'payment' = تسديد وخلاص
  amount: number;
  date: string; // ISO string
  notes?: string;
  receiptNumber?: string;
  previousBalance: number;
  newBalance: number;
  recordedBy?: string;
}

export type PaymentMethod = 'cash' | 'card' | 'apple_pay' | 'split' | 'credit';

export interface SplitPaymentDetail {
  cash?: number;
  card?: number;
  applePay?: number;
}

export interface OrderItem {
  productId: string;
  productName: string;
  price: number;
  costPrice: number;
  quantity: number;
  unitType?: UnitType;
  variantName?: string;
  modifiers?: string[];
  total: number;
  discount: number;
}

export interface Order {
  id: string;
  orderNumber: string; // e.g. #KD-1001
  date: string;
  items: OrderItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  costTotal: number;
  profitTotal: number;
  paymentMethod: PaymentMethod;
  splitDetails?: SplitPaymentDetail;
  amountTendered?: number;
  changeAmount?: number;
  cashierName: string;
  customerId?: string;
  customerName?: string;
  pointsEarned?: number;
  pointsRedeemed?: number;
  status: 'completed' | 'refunded' | 'partially_refunded';
  refundedAmount?: number;
  note?: string;
  zatcaQrString?: string;
  branchId?: string;
  branchName?: string;
  syncStatus?: 'synced' | 'pending_sync' | 'syncing';
  createdOffline?: boolean;
  syncedAt?: string;
  deliveryFee?: number;
  deliveryZoneName?: string;
  remoteOrderId?: string;
  customerPhone?: string;
  customerAddress?: string;
  isEmergencyOvertime?: boolean;
  emergencySessionId?: string;
}

export interface OfflineSaleQueueItem {
  id: string; // matches order.id
  order: Order;
  queuedAt: string;
  attempts: number;
  status: 'pending' | 'syncing' | 'failed';
  lastAttemptAt?: string;
  error?: string;
}

export interface HeldTicket {
  id: string;
  title: string; // e.g. "طاولة 4" or "عميل أحمد"
  date: string;
  items: CartItem[];
  customerId?: string;
  customerName?: string;
  note?: string;
}

export interface CashTransaction {
  id: string;
  date: string;
  type: 'pay_in' | 'pay_out';
  amount: number;
  reason: string;
  cashierName: string;
}

export interface Shift {
  id: string;
  shiftNumber: number;
  cashierName: string;
  openedAt: string;
  closedAt?: string;
  startingCash: number;
  status: 'open' | 'closed';
  cashTransactions: CashTransaction[];
  actualCashCounted?: number;
  expectedCash?: number;
  discrepancy?: number;
  totalCashSales?: number;
  totalCardSales?: number;
  totalApplePaySales?: number;
  totalCreditSales?: number;
  totalRefunds?: number;
  grossSales?: number;
  netSales?: number;
  taxesCollected?: number;
  totalCostOfGoods?: number;
  grossProfit?: number;
  totalExpenses?: number;
  netProfit?: number;
  creditCollectionsCash?: number;
  includedCreditInExpectedCash?: boolean;
  denominationBreakdown?: Record<string, number>;
  closingNotes?: string;
  retainedFloatForNextDay?: number;
  merchantWithdrawnCash?: number;
}

export interface EmergencyOpeningSession {
  id: string;
  openedAt: string;
  closedAt?: string;
  status: 'open' | 'closed';
  openedBy: string;
  note?: string;
  ordersCount: number;
  totalSales: number;
  cashSales: number;
  creditSales: number;
  customerKeys: string[];
  dateKey: string;
}

export interface ShopEarRequest {
  id: string;
  itemName: string;
  normalizedName: string;
  productId?: string;
  estimatedUnitPrice?: number;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  requestedAt: string;
  dateKey: string;
  inputSource: 'manual' | 'voice' | 'catalog';
  status: 'pending' | 'arrived' | 'notified';
  arrivedAt?: string;
  notifiedAt?: string;
  notes?: string;
}

export type UserRole = 'manager' | 'cashier' | 'courier';

export interface AppUser {
  id: string;
  name: string;
  role: UserRole;
  pin: string; // 4-digit PIN e.g. '1234'
  avatar?: string;
  active: boolean;
  createdAt: string;
}

export type ThemeMode = 'light' | 'dark' | 'auto_system' | 'auto_time';

export interface AppPalette {
  id: string;
  name: string;
  nameEn?: string;
  isBuiltIn?: boolean;
  primaryColor: string;
  accentColor: string;
  darkBgColor: string;
  darkCardColor: string;
  preferredMode?: 'keep' | 'dark' | 'light';
  createdAt?: string;
}

export interface StoreSettings {
  storeName: string;
  storeNameEn: string;
  taxNumber: string;
  commercialRegistration: string;
  phone: string;
  email: string;
  address: string;
  currency: CurrencyCode;
  currencySymbol: string;
  taxRate: number; // e.g. 15 for 15%
  receiptHeaderMsg?: string;
  showReceiptHeaderMsg?: boolean;
  receiptFooterMsg: string;
  showReceiptFooterMsg?: boolean;
  enableSoundEffects: boolean;
  enableCameraScanner: boolean;
  theme: 'light' | 'dark';
  themeMode?: ThemeMode; // 'light' | 'dark' | 'auto_system' | 'auto_time'
  activePaletteId?: string;
  customPalettes?: AppPalette[];
  language: 'ar' | 'fr' | 'en';
  receiptPaperWidth: '80mm' | '58mm';
  printerName: string;
  printerConnectionType: 'browser_dialog' | 'bluetooth' | 'network';
  autoPrintOnCheckout: boolean;
  printCustomerCopy: boolean;
  managerPin?: string;
  protectInventoryWithPin?: boolean;
  protectSettingsWithPin?: boolean;
  // Bluetooth Barcode Scanner (HID Mode) Settings
  bluetoothScannerEnabled?: boolean;
  bluetoothScannerMode?: 'hid_auto' | 'hid_strict' | 'web_bluetooth';
  bluetoothInterKeyDelayMs?: number;
  bluetoothSuffixKey?: 'Enter' | 'Tab' | 'Any';
  bluetoothAutoAddToCart?: boolean;
  bluetoothSoundFeedback?: boolean;
  bluetoothVibrationFeedback?: boolean;
  // Zakat al-Tijarah (زكاة التجارة ونصاب 85g ذهب)
  goldPricePerGram?: number;
  zakatCashOnHand?: number;
  zakatPayableDebts?: number;
  zakatValuationBasis?: 'cost' | 'retail';
  zakatIncludeReceivables?: boolean;
  // Remote Sales & WhatsApp Catalog Settings
  whatsappBusinessPhone?: string;
  publicAppUrl?: string;
  // Backup & Snapshot Tracking
  lastBackupAt?: string;
  autoBackupEnabled?: boolean;
  // CPU Tax & CNSS Settings (ضرائبي CPU)
  cpuSettings?: CpuTaxSettings;
  // Monthly Profit Target (الهدف الشهري للأرباح)
  monthlyProfitTarget?: number;
  // Store Branding Logo (base64 Data URL)
  storeLogo?: string;
  // Google Workspace Drive & Scheduled Gmail Reports
  scheduledReportEnabled?: boolean;
  scheduledReportFrequency?: 'daily' | 'weekly';
  scheduledReportEmail?: string;
  scheduledReportAutoDrive?: boolean;
  lastScheduledReportSentAt?: string;
  driveBackupFolderId?: string;
  // Low-Stock Push & Visual Alerts Settings
  enableLowStockPushNotifications?: boolean;
  enableLowStockVisualAlerts?: boolean;
  enableLowStockAudioAlert?: boolean;
  // Anti-Theft & Loss Prevention Alert Settings (تنبيه السرقة وحماية الصندوق والمخزون)
  theftAlertSettings?: TheftAlertSettings;
  // Custom Icons & Colors per POS Navigation Tab
  tabCustomizations?: Record<string, { icon?: string; color?: string }>;
}

export type TheftAlertCategory =
  | 'cash_discrepancy'
  | 'suspicious_payout'
  | 'suspicious_refund'
  | 'price_tampering'
  | 'stock_shrinkage'
  | 'cart_void'
  | 'manual_panic';

export interface TheftAlertSettings {
  enabled: boolean;
  enableSirenSound: boolean;
  enablePushNotification: boolean;
  requireManagerPinToDismiss: boolean;
  cashShortageThreshold: number;
  suspiciousPayoutThreshold: number;
  suspiciousRefundThreshold: number;
  highDiscountPercentThreshold: number;
  stockShrinkageUnitsThreshold: number;
  cartVoidAmountThreshold: number;
}

export interface TheftAlertItem {
  id: string;
  category: TheftAlertCategory;
  severity: 'critical' | 'high' | 'medium';
  title: string;
  description: string;
  amountAtRisk?: number;
  actorName: string;
  actorRole: UserRole;
  branchName?: string;
  timestamp: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolutionNote?: string;
}

export interface LowStockAlertItem {
  productId: string;
  name: string;
  stock: number;
  threshold: number;
  unitType?: string;
  severity: 'out_of_stock' | 'critical' | 'low';
  triggeredAt: string;
}

export type ActivityLogCategory =
  | 'auth_login'
  | 'sale_large'
  | 'inventory_major'
  | 'settings_change'
  | 'credit_ledger'
  | 'system';

export interface ActivityLogItem {
  id: string;
  timestamp: string; // ISO string
  category: ActivityLogCategory;
  title: string;
  description: string;
  actor: string;
  actorRole: UserRole;
  severity?: 'info' | 'warning' | 'success';
  amount?: number;
  metadata?: {
    orderNumber?: string;
    productName?: string;
    quantityChange?: number;
    previousStock?: number;
    newStock?: number;
    details?: string;
  };
}

export type ExpenseCategory =
  | 'rent' // كراء
  | 'electricity' // كهرباء
  | 'transport' // نقل
  | 'merchandise' // شراء بضاعة
  | 'other'; // أخرى

export interface Expense {
  id: string;
  name: string;
  amount: number;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  notes?: string;
  recordedBy?: string;
  branchId?: string;
  createdAt: string;
}

// =========================
// Remote Sales & WhatsApp Orders (البيع عن بعد وطلبات واتساب)
// =========================
export interface DeliveryZone {
  id: string;
  name: string;
  fee: number;
  active: boolean;
  estimatedMinutes?: number;
}

export type RemoteOrderStatus = 'new' | 'on_the_way' | 'delivered' | 'rejected';

export interface RemoteOrderItem {
  productId: string;
  productName: string;
  price: number;
  costPrice: number;
  quantity: number;
  total: number;
  image?: string;
}

export interface RemoteOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  deliveryZoneId: string;
  deliveryZoneName: string;
  deliveryFee: number;
  items: RemoteOrderItem[];
  itemsSubtotal: number;
  grandTotal: number;
  status: RemoteOrderStatus;
  notes?: string;
  linkedOrderId?: string;
  linkedOrderNumber?: string;
  source: 'catalog_link' | 'whatsapp_manual' | 'storefront';
  assignedCourierName?: string;
  collectedOnDelivery?: boolean;
  deliveredAt?: string;
}

// =========================
// Supplier Purchase Invoices (فواتير الموردين ومشتريات السلعة)
// =========================
export interface SupplierInvoiceItemSnapshot {
  productName: string;
  quantity: number;
  unitCost: number;
  unitType?: UnitType;
}

export interface SupplierInvoice {
  id: string;
  supplierName: string;
  supplierPhone?: string;
  supplierIce?: string;
  invoiceType?: 'official_ice' | 'informal_noir';
  invoiceNumber: string;
  date: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  totalAmount: number;
  paidAmount: number;
  status: 'unpaid' | 'partial' | 'paid';
  notes?: string;
  itemsCount?: number;
  itemsSummary?: SupplierInvoiceItemSnapshot[];
  scannedViaCamera?: boolean;
  recordedBy?: string;
  createdAt: string;
}

// =========================
// Moroccan CPU Tax, AMO & CNSS Retirement (ضرائبي CPU)
// =========================
export interface CpuCnssBracket {
  id: string;
  label: string;
  minAnnualTax: number; // الحد الأدنى للضريبة السنوية (د.م)
  maxAnnualTax: number | null; // الحد الأقصى (null = مفتوح)
  monthlyAmo: number; // بريم الصحة الشهري (د.م)
}

export type CpuQuarterId = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export interface CpuQuarterRecord {
  id: string; // e.g. "2026-Q1"
  year: number;
  quarter: CpuQuarterId;
  turnover: number; // رقم المعاملات في التريمستر
  calculatedTax: number; // الضريبة = رقم المعاملات × معامل المهنة% × نسبة الضريبة%
  monthlyAmo: number; // بريم الصحة الشهري
  quarterlyAmo: number; // بريم الصحة للتريمستر (3 أشهر)
  retirementEnabled: boolean; // التقاعد اختياري
  monthlyRetirement: number; // AMO × معامل التقاعد
  quarterlyRetirement: number; // التقاعد للتريمستر (3 أشهر)
  totalDue: number; // الضريبة + AMO للتريمستر + التقاعد للتريمستر
  status: 'unpaid' | 'paid';
  paidAt?: string;
  dueDate: string; // YYYY-MM-DD
  retirementDaysCredited: number; // 90 يوم عند الدفع مع تفعيل التقاعد
  notes?: string;
}

export interface CpuTaxSettings {
  taxRatePct: number; // 10%
  professionCoeffPct: number; // 6%
  retirementCoeff: number; // 1.57
  retirementEnabled: boolean;
  priorAccumulatedDays: number; // أيام CNSS السابقة قبل النظام
  alertDaysBeforeDue: number; // تنبيه قبل 7 أيام من الدفع
  annualPatenteTax?: number; // الرسم المهني السنوي (الباتنتا في السنة - د.م)
  cnssBrackets: CpuCnssBracket[];
}

// =========================
// Physical Inventory Stocktake (جرد المخزون الحقيقي)
// =========================
export interface StocktakeRecordItem {
  productId: string;
  productName: string;
  sku: string;
  unitType: UnitType;
  systemStock: number;
  countedStock: number;
  variance: number; // countedStock - systemStock
  costPrice: number;
  varianceValue: number; // variance * costPrice
  note?: string;
}

export interface StocktakeSessionRecord {
  id: string;
  sessionNumber: string;
  date: string;
  conductedBy: string;
  branchId?: string;
  branchName?: string;
  totalCatalogProducts: number;
  totalCountedItems: number;
  discrepancyItemsCount: number;
  totalShrinkageUnits: number;
  totalShrinkageValue: number;
  totalSurplusUnits: number;
  totalSurplusValue: number;
  netVarianceValue: number;
  totalRealStockCostValue: number;
  totalRealStockRetailValue: number;
  notes?: string;
  items: StocktakeRecordItem[];
}

