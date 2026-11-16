import React, { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback, ReactNode } from 'react';
import {
  Product,
  Category,
  CartItem,
  Customer,
  Order,
  OfflineSaleQueueItem,
  Shift,
  StoreSettings,
  HeldTicket,
  CashTransaction,
  PaymentMethod,
  SplitPaymentDetail,
  StockMovement,
  Branch,
  BranchTransfer,
  AppUser,
  ThemeMode,
  ActivityLogItem,
  CreditTransaction,
  Expense,
  DeliveryZone,
  RemoteOrder,
  RemoteOrderStatus,
  CpuQuarterId,
  CpuQuarterRecord,
  CpuTaxSettings,
  SupplierInvoice,
  AppPalette,
  LowStockAlertItem,
  TheftAlertCategory,
  TheftAlertSettings,
  TheftAlertItem,
  StocktakeRecordItem,
  StocktakeSessionRecord
} from '../types';
import {
  initialProducts,
  initialCategories,
  initialCustomers,
  initialCreditTransactions,
  initialSettings,
  initialShift,
  initialBranches,
  initialTransfers,
  initialUsers,
  initialActivityLogs,
  DEFAULT_THEFT_ALERT_SETTINGS
} from '../data/initialData';
import { playSound, startSecuritySiren, stopSecuritySiren } from '../utils/audio';
import { generateZatcaTlvBase64 } from '../utils/zatca';
import {
  saveProductsToIndexedDB,
  loadProductsFromIndexedDB,
  saveOrdersToIndexedDB,
  loadOrdersFromIndexedDB,
  enqueueOfflineSale,
  loadOfflineSalesQueue,
  saveOfflineSalesQueue,
  removeOfflineSaleFromQueue,
  clearOfflineSalesQueue,
  saveExpensesToIndexedDB,
  loadExpensesFromIndexedDB,
  saveRemoteOrdersToIndexedDB,
  loadRemoteOrdersFromIndexedDB,
  saveDeliveryZonesToIndexedDB,
  loadDeliveryZonesFromIndexedDB,
  saveCpuRecordsToIndexedDB,
  loadCpuRecordsFromIndexedDB,
  saveSupplierInvoicesToIndexedDB,
  loadSupplierInvoicesFromIndexedDB,
  safeLocalStorageSet
} from '../utils/storage';
import { getExpenseCategoryLabel } from '../utils/expenses';
import { generate2000MoroccanProducts } from '../utils/catalogGenerator';
import { calculateTradeZakatSummary, ZakatSummary } from '../utils/zakat';
import { DEFAULT_DELIVERY_ZONES, REMOTE_ORDERS_CHANNEL } from '../utils/remoteCatalog';
import {
  DEFAULT_CPU_SETTINGS,
  buildCpuQuarterRecord,
  createInitialCpuRecords,
  getUpcomingCpuAlerts,
  computeRetirementProgress,
  CpuPaymentAlert,
  RetirementProgressSummary
} from '../utils/cpuTax';
import { BUILT_IN_PALETTES, applyPaletteToDocument } from '../utils/palettes';

export type AppTabId =
  | 'pos'
  | 'inventory'
  | 'orders'
  | 'shifts'
  | 'customers'
  | 'expenses'
  | 'remote_sales'
  | 'cpu_tax'
  | 'analytics'
  | 'ai_assistant'
  | 'settings';

interface PosContextType {
  // Navigation & View
  currentTab: AppTabId;
  setCurrentTab: (tab: AppTabId) => void;

  // Settings
  settings: StoreSettings;
  updateSettings: (newSettings: Partial<StoreSettings>) => void;
  currencySymbol: string;
  isDark: boolean;
  toggleTheme: () => void;
  allPalettes: AppPalette[];
  activePalette: AppPalette;
  selectPalette: (paletteId: string) => void;
  createCustomPalette: (palette: Omit<AppPalette, 'id' | 'isBuiltIn' | 'createdAt'>, activate?: boolean) => AppPalette;
  updateCustomPalette: (id: string, updates: Partial<AppPalette>) => void;
  deleteCustomPalette: (id: string) => void;
  language: 'ar' | 'fr' | 'en';
  toggleLanguage: () => void;

  // Users & RBAC Permissions
  users: AppUser[];
  currentUser: AppUser;
  setCurrentUserId: (id: string) => void;
  addUser: (user: Omit<AppUser, 'id' | 'createdAt'>) => void;
  updateUser: (id: string, updated: Partial<AppUser>) => void;
  deleteUser: (id: string) => void;
  verifyManagerPin: (pin: string) => boolean;
  isTabProtected: (tab: string) => boolean;

  // Products & Categories
  products: Product[];
  categories: Category[];
  addCategory: (category: Omit<Category, 'id'>) => Category;
  deleteCategory: (id: string) => boolean;
  updateCategory: (id: string, updated: Partial<Category>) => void;
  addProduct: (product: Omit<Product, 'id'>) => { success: boolean; message?: string; product?: Product };
  updateProduct: (id: string, updated: Partial<Product>) => void;
  bulkUpdateProducts: (
    updates: { id: string; changes: Partial<Product>; stockDelta?: number; reason?: string }[]
  ) => void;
  deleteProduct: (id: string) => void;
  adjustStock: (productId: string, quantityChange: number, reason: string, type?: 'restock' | 'waste' | 'audit_adjustment') => void;
  importProductsBulk: (
    items: Omit<Product, 'id'>[],
    mode: 'merge' | 'append' | 'replace',
    newCategories?: { name: string; nameEn?: string; color?: string }[]
  ) => { added: number; updated: number; categoriesCreated: number };
  seedLargeCatalogDemo: (count?: number) => void;
  stockMovements: StockMovement[];
  stocktakeHistory: StocktakeSessionRecord[];
  applyStocktakeSession: (
    entries: { productId: string; countedStock: number; note?: string }[],
    sessionNote?: string
  ) => StocktakeSessionRecord;
  lowStockProducts: Product[];
  criticalLowStockProducts: Product[];
  expiringSoonProducts: Product[];
  notificationPermission: NotificationPermission | 'unsupported';
  requestNotificationPermission: () => Promise<NotificationPermission | 'unsupported'>;
  activeLowStockToasts: LowStockAlertItem[];
  dismissLowStockToast: (productId: string) => void;
  dismissAllLowStockToasts: () => void;
  triggerTestStockAlert: () => Promise<void>;

  // Cart & Active Ticket
  cart: CartItem[];
  addToCart: (product: Product, variantId?: string, modifiers?: { id: string; name: string; price: number }[], customQuantity?: number) => void;
  updateCartItemQuantity: (cartItemId: string, delta: number) => void;
  setCartItemQuantity: (cartItemId: string, quantity: number) => void;
  removeCartItem: (cartItemId: string) => void;
  clearCart: (markAsVoid?: boolean) => void;
  applyCartItemDiscount: (cartItemId: string, discount: { type: 'percent' | 'fixed'; value: number } | undefined) => void;
  cartItemNote: (cartItemId: string, note: string) => void;
  overrideCartItemPrice: (cartItemId: string, newPrice: number, reason?: string) => void;
  
  // Order Level Discount & Customer
  orderDiscount: { type: 'percent' | 'fixed'; value: number } | null;
  setOrderDiscount: (discount: { type: 'percent' | 'fixed'; value: number } | null) => void;
  selectedCustomer: Customer | null;
  setSelectedCustomer: (customer: Customer | null) => void;

  // Totals & Profit Calculations
  cartSubtotal: number;
  cartDiscountTotal: number;
  cartTaxTotal: number;
  cartGrandTotal: number;
  cartCostTotal: number;
  cartProfitTotal: number;
  cartProfitMarginPercent: number;

  // Checkout & Orders
  orders: Order[];
  completeCheckout: (paymentMethod: PaymentMethod, splitDetails?: SplitPaymentDetail, amountTendered?: number, note?: string) => Order | null;
  recordVoiceSale: (params: {
    customerName: string;
    productName: string;
    priceDirham: number;
    quantity?: number;
    paymentMethod?: 'credit' | 'cash';
    note?: string;
  }) => {
    product: Product;
    createdProduct: boolean;
    customer: Customer;
    createdCustomer: boolean;
    order: Order;
  };
  updateProductPurchaseCostAndRecalculateProfit: (
    productName: string,
    costPriceDirham: number
  ) => {
    product: Product;
    createdProduct: boolean;
    updatedOrdersCount: number;
    unitProfit: number;
    marginPct: number;
  };
  refundOrder: (orderId: string, full: boolean, amount?: number) => void;
  lastCompletedOrder: Order | null;
  setLastCompletedOrder: (order: Order | null) => void;

  // Held Tickets
  heldTickets: HeldTicket[];
  holdCurrentTicket: (title?: string, note?: string) => void;
  restoreHeldTicket: (ticketId: string) => void;
  deleteHeldTicket: (ticketId: string) => void;

  // Customers & Credit Ledger (كناش الكريدي والديون)
  customers: Customer[];
  addCustomer: (customer: Omit<Customer, 'id' | 'points' | 'balance' | 'tier' | 'totalSpent' | 'ordersCount' | 'createdAt'> & { balance?: number }) => Customer;
  updateCustomer: (id: string, updated: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  creditTransactions: CreditTransaction[];
  addCreditDebt: (customerId: string, amount: number, notes?: string, receiptNumber?: string) => { success: boolean; message?: string };
  settleCustomerCredit: (customerId: string, amount: number, notes?: string) => { success: boolean; message?: string };
  updateCreditTransaction: (txId: string, updates: { type?: 'debt' | 'payment'; amount?: number; date?: string; notes?: string; receiptNumber?: string }) => { success: boolean; message?: string };
  deleteCreditTransaction: (txId: string) => { success: boolean; message?: string };
  addCustomCreditEntry: (customerId: string, entry: { type: 'debt' | 'payment'; amount: number; date: string; notes?: string; receiptNumber?: string }) => { success: boolean; message?: string };
  rebuildCustomerCreditLedger: (customerId: string) => void;

  // Shifts
  currentShift: Shift;
  shiftsHistory: Shift[];
  openNewShift: (startingCash: number, cashierName: string) => void;
  closeCurrentShift: (
    actualCashCounted: number,
    options?: {
      closingNotes?: string;
      denominationBreakdown?: Record<string, number>;
      includeCreditCollectionsInExpectedCash?: boolean;
      retainedFloatForNextDay?: number;
      reopenNextShiftWithRetainedFloat?: boolean;
    }
  ) => Shift;
  addCashTransaction: (type: 'pay_in' | 'pay_out', amount: number, reason: string) => void;
  // Multi-Branch Management (إدارة الفروع المتعددة)
  branches: Branch[];
  activeBranchId: string;
  activeBranch: Branch;
  setActiveBranchId: (id: string) => void;
  addBranch: (data: Omit<Branch, 'id' | 'createdAt'>) => void;
  updateBranch: (id: string, updated: Partial<Branch>) => void;
  deleteBranch: (id: string) => void;
  branchTransfers: BranchTransfer[];
  transferStockBetweenBranches: (productId: string, fromBranchId: string, toBranchId: string, quantity: number, notes?: string) => boolean;
  syncBranchData: () => Promise<{ success: boolean; message: string }>;
  isSyncing: boolean;
  lastSyncTime: string;

  // Offline Mode & IndexedDB Sales Sync Engine
  isOnline: boolean;
  offlineSalesQueue: OfflineSaleQueueItem[];
  isSyncingOfflineSales: boolean;
  lastOfflineSyncResult: { syncedCount: number; syncedAt: string } | null;
  syncPendingOfflineSales: () => Promise<{ syncedCount: number }>;

  // Activity Log (سجل النشاطات والعمليات الرقابية)
  activityLogs: ActivityLogItem[];
  addActivityLog: (log: Omit<ActivityLogItem, 'id' | 'timestamp'>) => void;
  clearActivityLogs: () => void;

  // Automatic Trade Zakat Summary (الحساب الآلي لزكاة التجارة عند تجاوز النصاب 85g ذهب)
  zakatSummary: ZakatSummary;

  // Expenses Management (إدارة المصاريف)
  expenses: Expense[];
  addExpense: (data: Omit<Expense, 'id' | 'createdAt'>) => Expense;
  updateExpense: (id: string, updated: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;

  // Remote Sales & WhatsApp Orders (البيع عن بعد وطلبات واتساب)
  deliveryZones: DeliveryZone[];
  addDeliveryZone: (zone: Omit<DeliveryZone, 'id'>) => DeliveryZone;
  updateDeliveryZone: (id: string, updated: Partial<DeliveryZone>) => void;
  deleteDeliveryZone: (id: string) => void;
  remoteOrders: RemoteOrder[];
  createRemoteOrder: (
    data: Omit<RemoteOrder, 'id' | 'orderNumber' | 'createdAt' | 'status'>
  ) => RemoteOrder;
  acceptRemoteOrderToInvoice: (
    remoteOrderId: string,
    paymentMethod?: PaymentMethod
  ) => { success: boolean; order?: Order; message?: string };
  updateRemoteOrderStatus: (remoteOrderId: string, status: RemoteOrderStatus) => void;
  deleteRemoteOrder: (remoteOrderId: string) => void;

  // Moroccan CPU Tax, AMO & CNSS Retirement (ضرائبي CPU)
  cpuSettings: CpuTaxSettings;
  updateCpuSettings: (updated: Partial<CpuTaxSettings>) => void;
  cpuRecords: CpuQuarterRecord[];
  upsertCpuQuarterTurnover: (
    year: number,
    quarter: CpuQuarterId,
    turnover: number,
    retirementEnabled?: boolean,
    notes?: string
  ) => CpuQuarterRecord;
  toggleCpuQuarterRetirement: (recordId: string, enabled: boolean) => void;
  markCpuQuarterPaid: (recordId: string, paid?: boolean) => void;
  deleteCpuQuarterRecord: (recordId: string) => void;
  cpuAlerts: CpuPaymentAlert[];
  retirementProgress: RetirementProgressSummary;

  // Supplier Purchase Invoices (فواتير الموردين ومشتريات السلعة)
  supplierInvoices: SupplierInvoice[];
  addSupplierInvoice: (data: Omit<SupplierInvoice, 'id' | 'createdAt' | 'status'>) => SupplierInvoice;
  paySupplierInvoice: (invoiceId: string, amount: number) => void;
  deleteSupplierInvoice: (invoiceId: string) => void;

  // Courier Delivery Action
  markRemoteOrderDeliveredAndCollected: (remoteOrderId: string, courierName?: string) => void;

  // Snapshot & Backup
  localSnapshotAt: string | null;
  saveLocalSnapshot: () => { success: boolean; timestamp: string };
  restoreLocalSnapshot: () => boolean;

  // Anti-Theft & Loss Prevention Security Center (نظام تنبيه السرقة وحماية الصندوق والمخزون)
  theftAlerts: TheftAlertItem[];
  unresolvedTheftAlerts: TheftAlertItem[];
  activeTheftToasts: TheftAlertItem[];
  isSirenActive: boolean;
  stopActiveSecuritySiren: () => void;
  dismissTheftToast: (alertId: string) => void;
  raiseTheftAlert: (params: {
    category: TheftAlertCategory;
    severity: 'critical' | 'high' | 'medium';
    title: string;
    description: string;
    amountAtRisk?: number;
    playSiren?: boolean;
  }) => TheftAlertItem;
  triggerPanicTheftAlert: (customNote?: string) => TheftAlertItem;
  triggerTestTheftAlert: () => Promise<TheftAlertItem>;
  acknowledgeTheftAlert: (alertId: string, resolutionNote?: string, managerPin?: string) => { success: boolean; message?: string };
  acknowledgeAllTheftAlerts: (managerPin?: string) => { success: boolean; message?: string };
  clearAcknowledgedTheftAlerts: () => void;

  // Utilities
  buildFullBackupObject: () => Record<string, unknown>;
  resetToDemoData: () => void;
  exportDatabaseJson: () => void;
  importDatabaseJson: (jsonStr: string) => boolean;
}

const PosContext = createContext<PosContextType | undefined>(undefined);

export const PosProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Navigation State
  const [currentTab, setCurrentTab] = useState<AppTabId>('pos');

  // Activity Log State (سجل العمليات والنشاطات الرقابية)
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_activity_logs');
      return saved ? JSON.parse(saved) : initialActivityLogs;
    } catch {
      return initialActivityLogs;
    }
  });

  useEffect(() => {
    localStorage.setItem('kadi_pos_activity_logs', JSON.stringify(activityLogs));
  }, [activityLogs]);

  const addActivityLog = (logData: Omit<ActivityLogItem, 'id' | 'timestamp'>) => {
    const newLog: ActivityLogItem = {
      ...logData,
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString()
    };
    setActivityLogs((prev) => [newLog, ...prev.slice(0, 199)]);
  };

  const clearActivityLogs = () => {
    setActivityLogs([]);
    playSound('click');
  };

  // Settings State
  const [settings, setSettings] = useState<StoreSettings>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_settings_v3');
      const parsed: StoreSettings = saved ? JSON.parse(saved) : initialSettings;
      const trueDarkMigrated = localStorage.getItem('kadi_pos_true_dark_v1');
      if (!trueDarkMigrated) {
        const nextSettings: StoreSettings = {
          ...parsed,
          theme: 'dark',
          themeMode: 'dark'
        };
        localStorage.setItem('kadi_pos_true_dark_v1', '1');
        localStorage.setItem('kadi_pos_settings_v3', JSON.stringify(nextSettings));
        return nextSettings;
      }
      return parsed;
    } catch {
      return initialSettings;
    }
  });

  // Auto Dark/Light Mode Calculation
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  const [timeIsDark, setTimeIsDark] = useState<boolean>(() => {
    const hour = new Date().getHours();
    return hour >= 19 || hour < 6;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const checkTime = () => {
      const hour = new Date().getHours();
      setTimeIsDark(hour >= 19 || hour < 6);
    };
    const interval = setInterval(checkTime, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const isDark = useMemo(() => {
    const mode = settings.themeMode || 'dark';
    if (mode === 'light') return false;
    if (mode === 'dark') return true;
    if (mode === 'auto_system') return systemPrefersDark;
    if (mode === 'auto_time') return timeIsDark;
    return settings.theme === 'dark';
  }, [settings.themeMode, settings.theme, systemPrefersDark, timeIsDark]);

  const language = settings.language;

  const allPalettes = useMemo<AppPalette[]>(() => {
    const custom = Array.isArray(settings.customPalettes) ? settings.customPalettes : [];
    return [...BUILT_IN_PALETTES, ...custom];
  }, [settings.customPalettes]);

  const activePalette = useMemo<AppPalette>(() => {
    const targetId = settings.activePaletteId || 'emerald_oled';
    return allPalettes.find((p) => p.id === targetId) || BUILT_IN_PALETTES[0];
  }, [allPalettes, settings.activePaletteId]);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.setAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    root.setAttribute('lang', language);

    applyPaletteToDocument(activePalette, isDark);
  }, [isDark, language, activePalette]);

  const toggleTheme = () => {
    const nextMode = isDark ? 'light' : 'dark';
    updateSettings({ themeMode: nextMode, theme: nextMode });
  };

  const toggleLanguage = () => {
    let nextLang: 'ar' | 'fr' | 'en' = 'ar';
    if (language === 'ar') nextLang = 'fr';
    else if (language === 'fr') nextLang = 'en';
    else nextLang = 'ar';
    updateSettings({ language: nextLang });
  };

  const updateSettings = (newSettings: Partial<StoreSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem('kadi_pos_settings_v3', JSON.stringify(updated));
      return updated;
    });

    if (newSettings.storeName || newSettings.taxNumber || newSettings.currency || newSettings.protectSettingsWithPin !== undefined) {
      addActivityLog({
        category: 'settings_change',
        title: 'تحديث إعدادات المنشأة',
        description: 'تم تعديل وحفظ إعدادات المتجر وبيانات الفوترة والضريبة بنجاح',
        actor: currentUser.name,
        actorRole: currentUser.role,
        severity: 'info'
      });
    }
  };

  const selectPalette = (paletteId: string) => {
    const found = allPalettes.find((p) => p.id === paletteId);
    if (!found) return;
    const patch: Partial<StoreSettings> = { activePaletteId: found.id };
    if (found.preferredMode === 'dark') {
      patch.themeMode = 'dark';
      patch.theme = 'dark';
    } else if (found.preferredMode === 'light') {
      patch.themeMode = 'light';
      patch.theme = 'light';
    }
    updateSettings(patch);
  };

  const createCustomPalette = (
    palette: Omit<AppPalette, 'id' | 'isBuiltIn' | 'createdAt'>,
    activate = true
  ): AppPalette => {
    const created: AppPalette = {
      ...palette,
      id: `pal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      isBuiltIn: false,
      createdAt: new Date().toISOString()
    };
    const existing = Array.isArray(settings.customPalettes) ? settings.customPalettes : [];
    const patch: Partial<StoreSettings> = {
      customPalettes: [...existing, created]
    };
    if (activate) {
      patch.activePaletteId = created.id;
      if (created.preferredMode === 'dark') {
        patch.themeMode = 'dark';
        patch.theme = 'dark';
      } else if (created.preferredMode === 'light') {
        patch.themeMode = 'light';
        patch.theme = 'light';
      }
    }
    updateSettings(patch);
    return created;
  };

  const updateCustomPalette = (id: string, updates: Partial<AppPalette>) => {
    const existing = Array.isArray(settings.customPalettes) ? settings.customPalettes : [];
    const next = existing.map((p) => (p.id === id ? { ...p, ...updates, isBuiltIn: false } : p));
    const patch: Partial<StoreSettings> = { customPalettes: next };
    if (settings.activePaletteId === id && updates.preferredMode) {
      if (updates.preferredMode === 'dark') {
        patch.themeMode = 'dark';
        patch.theme = 'dark';
      } else if (updates.preferredMode === 'light') {
        patch.themeMode = 'light';
        patch.theme = 'light';
      }
    }
    updateSettings(patch);
  };

  const deleteCustomPalette = (id: string) => {
    const existing = Array.isArray(settings.customPalettes) ? settings.customPalettes : [];
    const next = existing.filter((p) => p.id !== id);
    const patch: Partial<StoreSettings> = { customPalettes: next };
    if (settings.activePaletteId === id) {
      patch.activePaletteId = BUILT_IN_PALETTES[0].id;
    }
    updateSettings(patch);
  };

  // User Management & RBAC Permissions
  const [users, setUsers] = useState<AppUser[]>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_users_v3');
      return saved ? JSON.parse(saved) : initialUsers;
    } catch {
      return initialUsers;
    }
  });

  const [currentUserId, setCurrentUserIdState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_current_user_id');
      if (saved && users.some((u) => u.id === saved)) return saved;
      return users[0]?.id || 'user-admin';
    } catch {
      return users[0]?.id || 'user-admin';
    }
  });

  const setCurrentUserId = (id: string) => {
    if (id !== currentUserId) {
      const targetUser = users.find((u) => u.id === id);
      if (targetUser) {
        const roleLabel =
          targetUser.role === 'manager'
            ? 'مدير'
            : targetUser.role === 'courier'
            ? 'موزّع (Livreur)'
            : 'كاشير';
        addActivityLog({
          category: 'auth_login',
          title: `تسجيل دخول: ${targetUser.name}`,
          description: `قام ${targetUser.name} (${roleLabel}) بتسجيل الدخول إلى نقطة البيع`,
          actor: targetUser.name,
          actorRole: targetUser.role,
          severity: 'info'
        });
        if (targetUser.role === 'courier') {
          setCurrentTab('remote_sales');
        }
      }
    }
    setCurrentUserIdState(id);
  };

  useEffect(() => {
    localStorage.setItem('kadi_pos_users_v3', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem('kadi_pos_current_user_id', currentUserId);
  }, [currentUserId]);

  const currentUser = useMemo(() => {
    return users.find((u) => u.id === currentUserId) || users[0] || initialUsers[0];
  }, [users, currentUserId]);

  const addUser = (userData: Omit<AppUser, 'id' | 'createdAt'>) => {
    const newUser: AppUser = {
      ...userData,
      id: `user-${Date.now()}`,
      createdAt: new Date().toISOString().slice(0, 10)
    };
    setUsers((prev) => [...prev, newUser]);
    playSound('success');
  };

  const updateUser = (id: string, updated: Partial<AppUser>) => {
    const existing = users.find((u) => u.id === id);
    const nextName = updated.name !== undefined ? updated.name.trim() || existing?.name || '' : existing?.name;

    setUsers((prev) =>
      prev.map((u) =>
        u.id === id
          ? {
              ...u,
              ...updated,
              name: nextName || u.name
            }
          : u
      )
    );

    if (existing && nextName && existing.name !== nextName) {
      if (currentUserId === id && currentShift.status === 'open') {
        setCurrentShift((prev) => ({
          ...prev,
          cashierName: nextName
        }));
      }
      addActivityLog({
        category: 'settings_change',
        title: `تعديل بيانات المستخدم: ${existing.name} ← ${nextName}`,
        description: `تم تغيير اسم/صلاحيات المستخدم من "${existing.name}" إلى "${nextName}"`,
        actor: currentUser.name,
        actorRole: currentUser.role,
        severity: 'info'
      });
    }

    if (settings.enableSoundEffects) {
      playSound('click');
    }
  };

  const deleteUser = (id: string) => {
    if (users.length <= 1) return;
    setUsers((prev) => prev.filter((u) => u.id !== id));
    if (currentUserId === id) {
      const remaining = users.filter((u) => u.id !== id);
      if (remaining.length > 0) setCurrentUserId(remaining[0].id);
    }
    playSound('click');
  };

  const verifyManagerPin = (pin: string): boolean => {
    const cleanPin = pin.trim();
    if (settings.managerPin && settings.managerPin === cleanPin) return true;
    const manager = users.find((u) => u.role === 'manager' && u.pin === cleanPin);
    return !!manager;
  };

  const isTabProtected = (tab: string): boolean => {
    if (currentUser.role === 'manager') return false;
    if (currentUser.role === 'courier') {
      return tab !== 'remote_sales' && tab !== 'orders';
    }
    if (tab === 'inventory' && settings.protectInventoryWithPin) return true;
    if (tab === 'settings' && settings.protectSettingsWithPin) return true;
    if (currentUser.role === 'cashier' && (tab === 'inventory' || tab === 'settings')) return true;
    return false;
  };

  // Products & Categories
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_products_v3');
      return saved ? JSON.parse(saved) : initialProducts;
    } catch {
      return initialProducts;
    }
  });

  const [categories, setCategories] = useState<Category[]>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_categories_v3');
      return saved ? JSON.parse(saved) : initialCategories;
    } catch {
      return initialCategories;
    }
  });

  useEffect(() => {
    // Check IndexedDB on mount for high-capacity 2000+ catalog
    loadProductsFromIndexedDB().then((dbProducts) => {
      if (dbProducts && dbProducts.length > 0) {
        setProducts(dbProducts);
      }
    });
  }, []);

  useEffect(() => {
    // Persist to IndexedDB (supports 2000+ to 50000+ items without quota limit)
    saveProductsToIndexedDB(products);
    try {
      if (products.length <= 500) {
        localStorage.setItem('kadi_pos_products_v3', JSON.stringify(products));
      }
    } catch {
      // safely skip if quota exceeded
    }
  }, [products]);

  useEffect(() => {
    localStorage.setItem('kadi_pos_categories_v3', JSON.stringify(categories));
  }, [categories]);

  const seedLargeCatalogDemo = (count: number = 2000) => {
    const generated = generate2000MoroccanProducts(count);
    const timestamp = Date.now();
    const newItems: Product[] = generated.map((it, idx) => ({
      ...it,
      id: `prod-bulk-${timestamp}-${idx}`
    }));

    const extendedCats: Category[] = [
      { id: 'cat-all', name: 'الكل', nameEn: 'All' },
      { id: 'cat-oils-grains', name: 'زيوت ومواد الطبخ', nameEn: 'Huiles & Cuisine', color: '#059669' },
      { id: 'cat-tea-sugar', name: 'شاي وسكر ومشروبات', nameEn: 'Thé & Boissons', color: '#2563EB' },
      { id: 'cat-grains-flour', name: 'حبوب ودقيق وقطاني', nameEn: 'Couscous & Farines', color: '#D97706' },
      { id: 'cat-dairy', name: 'ألبان وأجبان', nameEn: 'Produits Laitiers', color: '#DC2626' },
      { id: 'cat-canned', name: 'معلبات ومصبرات', nameEn: 'Conserves & Sauces', color: '#7C3AED' },
      { id: 'cat-biscuits', name: 'بسكويت وحلويات', nameEn: 'Biscuits & Confiserie', color: '#DB2777' },
      { id: 'cat-cleaning', name: 'مواد التنظيف والغسيل', nameEn: 'Produits d’Entretien', color: '#0D9488' },
      { id: 'cat-spices', name: 'توابل وعطارة مغربية', nameEn: 'Épices Marocaines', color: '#B45309' }
    ];

    setCategories(extendedCats);
    setProducts(newItems);
    saveProductsToIndexedDB(newItems);
    playSound('success');
  };

  const addCategory = (catData: Omit<Category, 'id'>): Category => {
    const newCategory: Category = {
      ...catData,
      id: `cat-${Date.now()}`
    };
    setCategories((prev) => [...prev, newCategory]);
    playSound('beep');
    return newCategory;
  };

  const deleteCategory = (id: string): boolean => {
    if (id === 'cat-all') return false;

    // Remaining categories (excluding target and cat-all)
    const remaining = categories.filter((c) => c.id !== id && c.id !== 'cat-all');
    const fallbackCatId = remaining[0]?.id || 'cat-oils-grains';

    // Reassign products from deleted category to fallback category so products are not lost
    setProducts((prev) =>
      prev.map((p) => (p.categoryId === id ? { ...p, categoryId: fallbackCatId } : p))
    );

    setCategories((prev) => prev.filter((c) => c.id !== id));
    playSound('click');
    return true;
  };

  const updateCategory = (id: string, updated: Partial<Category>) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updated } : c))
    );
    playSound('beep');
  };

  const addProduct = (productData: Omit<Product, 'id'>) => {
    if (productData.barcode && productData.barcode.trim()) {
      const cleanBarcode = productData.barcode.trim().toLowerCase();
      const existing = products.find(
        (p) => p.barcode && p.barcode.trim().toLowerCase() === cleanBarcode
      );
      if (existing) {
        playSound('error');
        return {
          success: false,
          message: `تنبيه هام: هذا الباركود (${productData.barcode}) كاين من قبل ومسجل للمنتج: "${existing.name}"!`
        };
      }
    }
    const newProduct: Product = {
      ...productData,
      id: `prod-${Date.now()}`
    };
    setProducts((prev) => [newProduct, ...prev]);
    playSound('beep');
    return { success: true, product: newProduct };
  };

  const updateProduct = (id: string, updated: Partial<Product>) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updated } : p))
    );
  };

  const recordVoiceSale = (params: {
    customerName: string;
    productName: string;
    priceDirham: number;
    quantity?: number;
    paymentMethod?: 'credit' | 'cash';
    note?: string;
  }) => {
    const cleanProdName = params.productName.trim() || 'منتج جديد';
    const cleanCustName = params.customerName.trim() || 'زبون عام';
    const qty = Math.max(1, Number(params.quantity || 1));
    const totalPrice = Math.max(0.01, Number(params.priceDirham));
    const unitPrice = Number((totalPrice / qty).toFixed(2));
    const payMethod: PaymentMethod = params.paymentMethod === 'cash' ? 'cash' : 'credit';
    const nowIso = new Date().toISOString();

    // 1. Find or auto-create Product
    const normProd = cleanProdName.toLowerCase();
    let targetProd = products.find(
      (p) =>
        p.name.trim().toLowerCase() === normProd ||
        p.name.toLowerCase().includes(normProd) ||
        normProd.includes(p.name.trim().toLowerCase())
    );
    let createdProduct = false;

    if (!targetProd) {
      createdProduct = true;
      targetProd = {
        id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        name: cleanProdName,
        nameEn: cleanProdName,
        sku: `VC-${Date.now().toString().slice(-5)}`,
        barcode: '',
        categoryId: categories[0]?.id || 'cat-1',
        price: unitPrice,
        costPrice: 0,
        stock: Math.max(0, 20 - qty),
        lowStockThreshold: 5,
        unitType: 'piece'
      };
      setProducts((prev) => [targetProd!, ...prev]);
    } else {
      const nextStock = Math.max(0, Number((targetProd.stock - qty).toFixed(2)));
      const updatedProd: Product = {
        ...targetProd,
        stock: nextStock,
        price: unitPrice > 0 ? unitPrice : targetProd.price
      };
      setProducts((prev) => prev.map((p) => (p.id === targetProd!.id ? updatedProd : p)));
      targetProd = updatedProd;
    }

    // 2. Find or auto-create Customer
    const normCust = cleanCustName.toLowerCase();
    let targetCust = customers.find(
      (c) =>
        c.name.trim().toLowerCase() === normCust ||
        c.name.toLowerCase().includes(normCust) ||
        normCust.includes(c.name.trim().toLowerCase())
    );
    let createdCustomer = false;

    if (!targetCust) {
      createdCustomer = true;
      const newBalance = payMethod === 'credit' ? Number(totalPrice.toFixed(2)) : 0;
      targetCust = {
        id: `cust-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        name: cleanCustName,
        phone: '',
        points: Math.floor(totalPrice / 10),
        balance: newBalance,
        tier: 'Silver',
        totalSpent: Number(totalPrice.toFixed(2)),
        ordersCount: 1,
        createdAt: nowIso.split('T')[0],
        notes: 'تم إنشاؤه تلقائياً عبر التسجيل الصوتي'
      };
      setCustomers((prev) => [targetCust!, ...prev]);
    } else {
      const nextTotalSpent = Number((targetCust.totalSpent + totalPrice).toFixed(2));
      const nextBal = payMethod === 'credit' ? Number((targetCust.balance + totalPrice).toFixed(2)) : targetCust.balance;
      const nextTier: Customer['tier'] =
        nextTotalSpent >= 3000 ? 'Platinum' : nextTotalSpent >= 1000 ? 'Gold' : targetCust.tier;
      const updatedCust: Customer = {
        ...targetCust,
        totalSpent: nextTotalSpent,
        ordersCount: targetCust.ordersCount + 1,
        points: targetCust.points + Math.floor(totalPrice / 10),
        balance: nextBal,
        tier: nextTier
      };
      setCustomers((prev) => prev.map((c) => (c.id === targetCust!.id ? updatedCust : c)));
      targetCust = updatedCust;
    }

    // 3. Record completed Order
    const orderNum = `#KD-${1000 + orders.length + 1}`;
    const itemCost = Number((targetProd.costPrice * qty).toFixed(2));
    const itemProfit = Number((totalPrice - itemCost).toFixed(2));
    const zatcaQr = generateZatcaTlvBase64(
      settings.storeName,
      settings.taxNumber,
      nowIso,
      totalPrice.toFixed(2),
      '0.00'
    );

    const newOrder: Order = {
      id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      orderNumber: orderNum,
      date: nowIso,
      branchId: activeBranch.id,
      branchName: activeBranch.name,
      items: [
        {
          productId: targetProd.id,
          productName: targetProd.name,
          price: unitPrice,
          costPrice: targetProd.costPrice,
          quantity: qty,
          unitType: targetProd.unitType,
          total: Number(totalPrice.toFixed(2)),
          discount: 0
        }
      ],
      subtotal: Number(totalPrice.toFixed(2)),
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: Number(totalPrice.toFixed(2)),
      costTotal: itemCost,
      profitTotal: itemProfit,
      paymentMethod: payMethod,
      amountTendered: payMethod === 'cash' ? Number(totalPrice.toFixed(2)) : 0,
      changeAmount: 0,
      cashierName: currentShift.cashierName || currentUser.name,
      customerId: targetCust.id,
      customerName: targetCust.name,
      customerPhone: targetCust.phone,
      pointsEarned: Math.floor(totalPrice / 10),
      status: 'completed',
      note: params.note || 'مسجل بالصوت (Kadi Voice)',
      zatcaQrString: zatcaQr,
      syncStatus: 'synced'
    };

    setOrders((prev) => [newOrder, ...prev]);

    // 4. Record Stock Movement
    const mov: StockMovement = {
      id: `mov-${Date.now()}-${targetProd.id}`,
      productId: targetProd.id,
      productName: targetProd.name,
      date: nowIso,
      type: 'sale',
      quantityChange: -qty,
      previousStock: createdProduct ? 20 : targetProd.stock + qty,
      newStock: targetProd.stock,
      unit: targetProd.unitType || 'piece',
      costPerUnit: targetProd.costPrice,
      orderNumber: orderNum,
      reason: `مبيعة صوتية (${targetCust.name})`
    };
    setStockMovements((prev) => [mov, ...prev]);

    // 5. Record CreditTransaction when on credit
    if (payMethod === 'credit') {
      const prevBal = createdCustomer ? 0 : Number((targetCust.balance - totalPrice).toFixed(2));
      const creditTx: CreditTransaction = {
        id: `cred-tx-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        customerId: targetCust.id,
        customerName: targetCust.name,
        type: 'debt',
        amount: Number(totalPrice.toFixed(2)),
        date: nowIso,
        notes: `${cleanProdName} (${qty}) - مسجل بالصوت`,
        receiptNumber: orderNum,
        previousBalance: prevBal,
        newBalance: targetCust.balance,
        recordedBy: currentUser.name
      };
      setCreditTransactions((prev) => [creditTx, ...prev]);
    }

    addActivityLog({
      category: 'credit_ledger',
      title: `تسجيل صوتي: ${targetCust.name} - ${targetProd.name}`,
      description: `أخذ ${targetCust.name} منتج "${targetProd.name}" بمبلغ ${totalPrice.toFixed(2)} ${settings.currencySymbol} (${payMethod === 'credit' ? 'كريدي' : 'نقداً'}).`,
      actor: currentUser.name,
      actorRole: currentUser.role,
      amount: totalPrice,
      severity: 'info'
    });

    playSound('beep');
    return {
      product: targetProd,
      createdProduct,
      customer: targetCust,
      createdCustomer,
      order: newOrder
    };
  };

  const updateProductPurchaseCostAndRecalculateProfit = (
    productName: string,
    costPriceDirham: number
  ) => {
    const cleanName = productName.trim() || 'منتج';
    const norm = cleanName.toLowerCase();
    const cleanCost = Math.max(0, Number(costPriceDirham.toFixed(2)));

    let targetProd = products.find(
      (p) =>
        p.name.trim().toLowerCase() === norm ||
        p.name.toLowerCase().includes(norm) ||
        norm.includes(p.name.trim().toLowerCase())
    );
    let createdProduct = false;

    if (!targetProd) {
      createdProduct = true;
      targetProd = {
        id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        name: cleanName,
        nameEn: cleanName,
        sku: `VC-${Date.now().toString().slice(-5)}`,
        barcode: '',
        categoryId: categories[0]?.id || 'cat-1',
        price: Number((cleanCost * 1.25).toFixed(2)),
        costPrice: cleanCost,
        stock: 20,
        lowStockThreshold: 5,
        unitType: 'piece'
      };
      setProducts((prev) => [targetProd!, ...prev]);
    } else {
      const updated = { ...targetProd, costPrice: cleanCost };
      setProducts((prev) => prev.map((p) => (p.id === targetProd!.id ? updated : p)));
      targetProd = updated;
    }

    // Recalculate profit on existing orders containing this product
    let updatedOrdersCount = 0;
    const prodId = targetProd.id;
    setOrders((prev) =>
      prev.map((ord) => {
        const hasProd = ord.items.some((it) => it.productId === prodId);
        if (!hasProd) return ord;
        updatedOrdersCount += 1;
        const newItems = ord.items.map((it) =>
          it.productId === prodId ? { ...it, costPrice: cleanCost } : it
        );
        const newCostTotal = Number(
          newItems.reduce((s, it) => s + it.costPrice * it.quantity, 0).toFixed(2)
        );
        const newProfitTotal = Number((ord.subtotal - ord.discountTotal - newCostTotal).toFixed(2));
        return {
          ...ord,
          items: newItems,
          costTotal: newCostTotal,
          profitTotal: newProfitTotal
        };
      })
    );

    const unitProfit = Number((targetProd.price - cleanCost).toFixed(2));
    const marginPct = targetProd.price > 0 ? Number(((unitProfit / targetProd.price) * 100).toFixed(1)) : 0;

    playSound('beep');
    return {
      product: targetProd,
      createdProduct,
      updatedOrdersCount,
      unitProfit,
      marginPct
    };
  };

  const bulkUpdateProducts = (
    updates: { id: string; changes: Partial<Product>; stockDelta?: number; reason?: string }[]
  ) => {
    const updateMap = new Map<string, { changes: Partial<Product>; stockDelta?: number; reason?: string }>();
    updates.forEach((u) => updateMap.set(u.id, u));

    const newMovements: StockMovement[] = [];
    const nowIso = new Date().toISOString();

    setProducts((prev) =>
      prev.map((p) => {
        const item = updateMap.get(p.id);
        if (!item) return p;

        const updatedProduct = { ...p, ...item.changes };

        if (item.stockDelta !== undefined && item.stockDelta !== 0) {
          newMovements.push({
            id: `mov-${Date.now()}-${p.id}`,
            productId: p.id,
            productName: p.name,
            date: nowIso,
            type: item.stockDelta > 0 ? 'restock' : 'waste',
            quantityChange: item.stockDelta,
            previousStock: p.stock,
            newStock: updatedProduct.stock,
            unit: p.unitType,
            costPerUnit: updatedProduct.costPrice,
            reason: item.reason || 'تعديل جماعي للمخزون'
          });
        }

        return updatedProduct;
      })
    );

    if (newMovements.length > 0) {
      setStockMovements((prev) => [...newMovements, ...prev]);
    }

    if (updates.length > 0) {
      addActivityLog({
        category: 'inventory_major',
        title: `تعديل جماعي على المخزون والأسعار (${updates.length} منتجات)`,
        description: `قام ${currentUser.name} بتحديث بيانات وأسعار ومخزون ${updates.length} منتج في عملية مجمعة`,
        actor: currentUser.name,
        actorRole: currentUser.role,
        severity: 'info'
      });
    }
  };

  const deleteProduct = (id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  };

  const importProductsBulk = (
    items: Omit<Product, 'id'>[],
    mode: 'merge' | 'append' | 'replace',
    newCats?: { name: string; nameEn?: string; color?: string }[]
  ) => {
    let catsCreated = 0;
    const currentCats = [...categories];

    // 1. Create missing categories if specified
    if (newCats && newCats.length > 0) {
      const addedCategoryObjects: Category[] = [];
      newCats.forEach((cat, idx) => {
        const exists = currentCats.some(
          (c) => c.name.trim().toLowerCase() === cat.name.trim().toLowerCase()
        );
        if (!exists && cat.name.trim()) {
          const newCatObj: Category = {
            id: `cat-import-${Date.now()}-${idx}`,
            name: cat.name.trim(),
            nameEn: cat.nameEn?.trim() || cat.name.trim(),
            color: cat.color || '#059669'
          };
          addedCategoryObjects.push(newCatObj);
          currentCats.push(newCatObj);
          catsCreated++;
        }
      });
      if (addedCategoryObjects.length > 0) {
        setCategories((prev) => [...prev, ...addedCategoryObjects]);
      }
    }

    let addedCount = 0;
    let updatedCount = 0;
    const newMovements: StockMovement[] = [];
    const timestamp = Date.now();

    if (mode === 'replace') {
      const formatted: Product[] = items.map((it, idx) => ({
        ...it,
        id: `prod-import-${timestamp}-${idx}`
      }));
      setProducts(formatted);
      addedCount = formatted.length;

      formatted.forEach((p, idx) => {
        if (p.stock > 0) {
          newMovements.push({
            id: `mov-init-${timestamp}-${idx}`,
            productId: p.id,
            productName: p.name,
            date: new Date().toISOString(),
            type: 'restock',
            quantityChange: p.stock,
            previousStock: 0,
            newStock: p.stock,
            unit: p.unitType,
            costPerUnit: p.costPrice,
            reason: 'استيراد أولي شامل للمخزون من ملف Excel/CSV'
          });
        }
      });
    } else if (mode === 'merge') {
      const updatedList = [...products];

      items.forEach((item, idx) => {
        const existingIdx = updatedList.findIndex(
          (p) =>
            (item.barcode && p.barcode && p.barcode === item.barcode) ||
            (item.sku && p.sku && p.sku.toLowerCase() === item.sku.toLowerCase())
        );

        if (existingIdx !== -1) {
          const existing = updatedList[existingIdx];
          const stockDelta = item.stock - existing.stock;

          updatedList[existingIdx] = {
            ...existing,
            price: item.price > 0 ? item.price : existing.price,
            costPrice: item.costPrice > 0 ? item.costPrice : existing.costPrice,
            stock: item.stock,
            lowStockThreshold: item.lowStockThreshold || existing.lowStockThreshold,
            name: item.name || existing.name,
            categoryId: item.categoryId || existing.categoryId,
            unitType: item.unitType || existing.unitType
          };

          if (stockDelta !== 0) {
            newMovements.push({
              id: `mov-merge-${timestamp}-${idx}`,
              productId: existing.id,
              productName: existing.name,
              date: new Date().toISOString(),
              type: stockDelta > 0 ? 'restock' : 'audit_adjustment',
              quantityChange: stockDelta,
              previousStock: existing.stock,
              newStock: item.stock,
              unit: existing.unitType,
              costPerUnit: item.costPrice || existing.costPrice,
              reason: 'تحديث الرصيد عبر استيراد ملف Excel/CSV'
            });
          }
          updatedCount++;
        } else {
          const newProd: Product = {
            ...item,
            id: `prod-import-${timestamp}-${idx}`
          };
          updatedList.unshift(newProd);
          addedCount++;

          if (newProd.stock > 0) {
            newMovements.push({
              id: `mov-add-${timestamp}-${idx}`,
              productId: newProd.id,
              productName: newProd.name,
              date: new Date().toISOString(),
              type: 'restock',
              quantityChange: newProd.stock,
              previousStock: 0,
              newStock: newProd.stock,
              unit: newProd.unitType,
              costPerUnit: newProd.costPrice,
              reason: 'إضافة صنف جديد عبر استيراد ملف Excel/CSV'
            });
          }
        }
      });

      setProducts(updatedList);
    } else {
      // Append mode
      const appendedList: Product[] = items.map((it, idx) => ({
        ...it,
        id: `prod-app-${timestamp}-${idx}`
      }));
      setProducts((prev) => [...appendedList, ...prev]);
      addedCount = appendedList.length;

      appendedList.forEach((p, idx) => {
        if (p.stock > 0) {
          newMovements.push({
            id: `mov-app-${timestamp}-${idx}`,
            productId: p.id,
            productName: p.name,
            date: new Date().toISOString(),
            type: 'restock',
            quantityChange: p.stock,
            previousStock: 0,
            newStock: p.stock,
            unit: p.unitType,
            costPerUnit: p.costPrice,
            reason: 'إدراج صنف بالمخزون عبر استيراد Excel/CSV'
          });
        }
      });
    }

    if (newMovements.length > 0) {
      setStockMovements((prev) => [...newMovements, ...prev]);
    }

    return { added: addedCount, updated: updatedCount, categoriesCreated: catsCreated };
  };

  // Stock Movements Tracking State
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_stock_movements_v3');
      if (saved) return JSON.parse(saved);
      // Pre-seed some realistic tracking records for Moroccan grocery
      return [
        {
          id: 'mov-1',
          productId: 'prod-1',
          productName: 'زيت زيتون بكر ممتاز وادي سوس (باللتر)',
          date: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
          type: 'restock',
          quantityChange: 30,
          previousStock: 25,
          newStock: 55,
          unit: 'liter',
          costPerUnit: 68,
          reason: 'توريد شحنة زيت زيتون معصرة وادي سوس'
        },
        {
          id: 'mov-2',
          productId: 'prod-7',
          productName: 'دقيق القمح اللين ميمونة فاخر (بالكيلو)',
          date: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
          type: 'restock',
          quantityChange: 100,
          previousStock: 60,
          newStock: 160,
          unit: 'kg',
          costPerUnit: 4.7,
          reason: 'توريد أكياس دقيق ميمونة من المطاحن الكبرى'
        },
        {
          id: 'mov-3',
          productId: 'prod-10',
          productName: 'حليب سنطرال معقم طازج UHT (1 لتر)',
          date: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
          type: 'restock',
          quantityChange: 60,
          previousStock: 30,
          newStock: 90,
          unit: 'liter',
          costPerUnit: 5.8,
          reason: 'تسليم شحنة الحليب الصباحية من موزع سنطرال'
        }
      ];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('kadi_pos_stock_movements', JSON.stringify(stockMovements));
  }, [stockMovements]);

  const [stocktakeHistory, setStocktakeHistory] = useState<StocktakeSessionRecord[]>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_stocktake_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('kadi_pos_stocktake_history', JSON.stringify(stocktakeHistory));
  }, [stocktakeHistory]);

  const adjustStock = (
    productId: string,
    quantityChange: number,
    reason: string,
    type: 'restock' | 'waste' | 'audit_adjustment' = 'audit_adjustment'
  ) => {
    const targetProduct = products.find((p) => p.id === productId);
    const prevStockVal = targetProduct?.stock ?? 0;

    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === productId) {
          const prevStock = p.stock;
          const newStock = Math.max(0, Number((p.stock + quantityChange).toFixed(2)));

          // Record stock movement
          const newMovement: StockMovement = {
            id: `mov-${Date.now()}`,
            productId: p.id,
            productName: p.name,
            date: new Date().toISOString(),
            type,
            quantityChange,
            previousStock: prevStock,
            newStock,
            unit: p.unitType || 'piece',
            costPerUnit: p.costPrice,
            reason
          };
          setStockMovements((mPrev) => [newMovement, ...mPrev]);

          // Document major inventory adjustments in Activity Log
          const isMajor = Math.abs(quantityChange) >= 15 || type === 'waste' || type === 'audit_adjustment';
          if (isMajor) {
            const actionTitle =
              type === 'waste'
                ? `تسجيل إتلاف مخزون (${quantityChange} ${p.unitType || 'وحدة'})`
                : type === 'restock'
                ? `توريد جوهري في المخزون (+${quantityChange} ${p.unitType || 'وحدة'})`
                : `تعديل جردي جوهري (${quantityChange > 0 ? '+' : ''}${quantityChange} ${p.unitType || 'وحدة'})`;

            addActivityLog({
              category: 'inventory_major',
              title: actionTitle,
              description: `${p.name}: تعديل الرصيد بمقدار ${quantityChange > 0 ? '+' : ''}${quantityChange} ${p.unitType || ''} (من ${prevStock} إلى ${newStock}). السبب: ${reason || 'جرد وتعديل مخزني'}`,
              actor: currentUser.name,
              actorRole: currentUser.role,
              severity: type === 'waste' ? 'warning' : 'info',
              metadata: {
                productName: p.name,
                quantityChange,
                previousStock: prevStock,
                newStock,
                details: reason || 'تعديل مخزون يدوي'
              }
            });
          }

          return { ...p, stock: newStock };
        }
        return p;
      })
    );

    const theftCfg = getTheftConfig();
    if (
      theftCfg.enabled &&
      targetProduct &&
      quantityChange < 0 &&
      (type === 'waste' || type === 'audit_adjustment') &&
      Math.abs(quantityChange) >= theftCfg.stockShrinkageUnitsThreshold
    ) {
      const unitsLost = Math.abs(quantityChange);
      const lossValue = Number((unitsLost * targetProduct.costPrice).toFixed(2));
      raiseTheftAlert({
        category: 'stock_shrinkage',
        severity: unitsLost >= theftCfg.stockShrinkageUnitsThreshold * 2 ? 'critical' : 'high',
        title: `تنبيه فقدان / عجز مخزون مفاجئ: ${targetProduct.name}`,
        description: `تم خصم ${unitsLost} ${targetProduct.unitType || 'وحدة'} من "${targetProduct.name}" (من ${prevStockVal} إلى ${Math.max(0, Number((prevStockVal + quantityChange).toFixed(2)))}). السبب المسجل: ${reason || 'غير محدد'}.`,
        amountAtRisk: lossValue,
        playSiren: unitsLost >= theftCfg.stockShrinkageUnitsThreshold * 2
      });
    }
  };

  const applyStocktakeSession = (
    entries: { productId: string; countedStock: number; note?: string }[],
    sessionNote?: string
  ): StocktakeSessionRecord => {
    const nowIso = new Date().toISOString();
    const entryMap = new Map<string, { countedStock: number; note?: string }>();
    entries.forEach((e) => {
      entryMap.set(e.productId, {
        countedStock: Math.max(0, Number(e.countedStock.toFixed(2))),
        note: e.note
      });
    });

    const recordItems: StocktakeRecordItem[] = [];
    const movementsToAdd: StockMovement[] = [];
    let discrepancyItemsCount = 0;
    let totalShrinkageUnits = 0;
    let totalShrinkageValue = 0;
    let totalSurplusUnits = 0;
    let totalSurplusValue = 0;
    let totalRealStockCostValue = 0;
    let totalRealStockRetailValue = 0;

    const updatedProducts = products.map((p) => {
      const countedEntry = entryMap.get(p.id);
      if (!countedEntry) {
        totalRealStockCostValue += p.stock * p.costPrice;
        totalRealStockRetailValue += p.stock * p.price;
        return p;
      }

      const systemStock = p.stock;
      const countedStock = countedEntry.countedStock;
      const variance = Number((countedStock - systemStock).toFixed(2));
      const varianceValue = Number((variance * p.costPrice).toFixed(2));

      totalRealStockCostValue += countedStock * p.costPrice;
      totalRealStockRetailValue += countedStock * p.price;

      if (variance !== 0) {
        discrepancyItemsCount += 1;
        if (variance < 0) {
          totalShrinkageUnits += Math.abs(variance);
          totalShrinkageValue += Math.abs(varianceValue);
        } else {
          totalSurplusUnits += variance;
          totalSurplusValue += varianceValue;
        }

        movementsToAdd.push({
          id: `mov-stk-${Date.now()}-${p.id}`,
          productId: p.id,
          productName: p.name,
          date: nowIso,
          type: 'audit_adjustment',
          quantityChange: variance,
          previousStock: systemStock,
          newStock: countedStock,
          unit: p.unitType || 'piece',
          costPerUnit: p.costPrice,
          reason: countedEntry.note?.trim() || sessionNote?.trim() || 'جرد فعلي للمخزون الحقيقي'
        });
      }

      recordItems.push({
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        unitType: p.unitType,
        systemStock,
        countedStock,
        variance,
        costPrice: p.costPrice,
        varianceValue,
        note: countedEntry.note
      });

      return { ...p, stock: countedStock };
    });

    setProducts(updatedProducts);
    if (movementsToAdd.length > 0) {
      setStockMovements((prev) => [...movementsToAdd, ...prev]);
    }

    const netVarianceValue = Number((totalSurplusValue - totalShrinkageValue).toFixed(2));
    const sessionRecord: StocktakeSessionRecord = {
      id: `stk-${Date.now()}`,
      sessionNumber: `INV-${String(stocktakeHistory.length + 1).padStart(3, '0')}`,
      date: nowIso,
      conductedBy: currentUser.name,
      branchId: activeBranchNameRef.current ? activeBranchId : undefined,
      branchName: activeBranchNameRef.current || undefined,
      totalCatalogProducts: products.length,
      totalCountedItems: entries.length,
      discrepancyItemsCount,
      totalShrinkageUnits: Number(totalShrinkageUnits.toFixed(2)),
      totalShrinkageValue: Number(totalShrinkageValue.toFixed(2)),
      totalSurplusUnits: Number(totalSurplusUnits.toFixed(2)),
      totalSurplusValue: Number(totalSurplusValue.toFixed(2)),
      netVarianceValue,
      totalRealStockCostValue: Number(totalRealStockCostValue.toFixed(2)),
      totalRealStockRetailValue: Number(totalRealStockRetailValue.toFixed(2)),
      notes: sessionNote?.trim() || undefined,
      items: recordItems
    };

    setStocktakeHistory((prev) => [sessionRecord, ...prev.slice(0, 49)]);

    addActivityLog({
      category: 'inventory_major',
      title: `اعتماد جرد المخزون الحقيقي (${sessionRecord.sessionNumber})`,
      description: `تم جرد ${entries.length} صنف (${discrepancyItemsCount} بها فرق). العجز: -${totalShrinkageValue.toFixed(2)} ${settings.currencySymbol} | الفائض: +${totalSurplusValue.toFixed(2)} ${settings.currencySymbol} | القيمة الحقيقية للمخزون بالتكلفة: ${totalRealStockCostValue.toFixed(2)} ${settings.currencySymbol}`,
      actor: currentUser.name,
      actorRole: currentUser.role,
      amount: Math.abs(netVarianceValue),
      severity: totalShrinkageValue > 0 ? 'warning' : 'success'
    });

    const theftCfg = getTheftConfig();
    if (theftCfg.enabled && totalShrinkageUnits >= theftCfg.stockShrinkageUnitsThreshold) {
      raiseTheftAlert({
        category: 'stock_shrinkage',
        severity: totalShrinkageUnits >= theftCfg.stockShrinkageUnitsThreshold * 2 ? 'critical' : 'high',
        title: `عجز مخزون مكتشف أثناء الجرد الفعلي (${sessionRecord.sessionNumber})`,
        description: `كشف الجرد عجزاً بإجمالي ${totalShrinkageUnits.toFixed(2)} وحدة بقيمة ${totalShrinkageValue.toFixed(2)} ${settings.currencySymbol}.`,
        amountAtRisk: Number(totalShrinkageValue.toFixed(2)),
        playSiren: totalShrinkageUnits >= theftCfg.stockShrinkageUnitsThreshold * 2
      });
    }

    if (settings.enableSoundEffects) {
      playSound('success');
    }

    return sessionRecord;
  };

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });

  const [activeLowStockToasts, setActiveLowStockToasts] = useState<LowStockAlertItem[]>([]);

  // Anti-Theft & Loss Prevention State (نظام تنبيه السرقة وحماية الصندوق والمخزون)
  const activeBranchNameRef = useRef<string>('');
  const [theftAlerts, setTheftAlerts] = useState<TheftAlertItem[]>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_theft_alerts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeTheftToasts, setActiveTheftToasts] = useState<TheftAlertItem[]>([]);
  const [isSirenActive, setIsSirenActive] = useState(false);

  useEffect(() => {
    localStorage.setItem('kadi_pos_theft_alerts', JSON.stringify(theftAlerts));
  }, [theftAlerts]);

  useEffect(() => {
    return () => {
      stopSecuritySiren();
    };
  }, []);

  const getTheftConfig = useCallback((): TheftAlertSettings => {
    return {
      ...DEFAULT_THEFT_ALERT_SETTINGS,
      ...(settings.theftAlertSettings || {})
    };
  }, [settings.theftAlertSettings]);

  const stopActiveSecuritySiren = useCallback(() => {
    stopSecuritySiren();
    setIsSirenActive(false);
  }, []);

  const dismissTheftToast = useCallback((alertId: string) => {
    setActiveTheftToasts((prev) => prev.filter((a) => a.id !== alertId));
  }, []);

  const unresolvedTheftAlerts = useMemo(
    () => theftAlerts.filter((a) => !a.acknowledged),
    [theftAlerts]
  );

  const sendTheftPushNotification = useCallback(
    async (alertItem: TheftAlertItem) => {
      const cfg = getTheftConfig();
      if (!cfg.enablePushNotification) return;
      if (typeof window === 'undefined' || !('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      const title = `🚨 تنبيه سرقة / اشتباه: ${alertItem.title}`;
      const body = `${alertItem.description} — المسؤول: ${alertItem.actorName}`;
      const notifOptions: NotificationOptions = {
        body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: `kadi-pos-theft-${alertItem.category}`,
        requireInteraction: true
      };

      try {
        if ('serviceWorker' in navigator) {
          const reg = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 500))
          ]);
          if (reg && 'showNotification' in reg) {
            await reg.showNotification(title, notifOptions);
            return;
          }
        }
        const n = new Notification(title, notifOptions);
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch {
        // Ignore if sandbox prevents notification constructor
      }
    },
    [getTheftConfig]
  );

  const raiseTheftAlert = useCallback(
    (params: {
      category: TheftAlertCategory;
      severity: 'critical' | 'high' | 'medium';
      title: string;
      description: string;
      amountAtRisk?: number;
      playSiren?: boolean;
    }): TheftAlertItem => {
      const cfg = getTheftConfig();
      const newAlert: TheftAlertItem = {
        id: `theft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        category: params.category,
        severity: params.severity,
        title: params.title,
        description: params.description,
        amountAtRisk: params.amountAtRisk,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        branchName: activeBranchNameRef.current || undefined,
        timestamp: new Date().toISOString(),
        acknowledged: false
      };

      setTheftAlerts((prev) => [newAlert, ...prev.slice(0, 149)]);
      setActiveTheftToasts((prev) => [newAlert, ...prev.slice(0, 2)]);

      addActivityLog({
        category: 'system',
        title: `🚨 تنبيه أمان: ${params.title}`,
        description: params.description,
        actor: currentUser.name,
        actorRole: currentUser.role,
        amount: params.amountAtRisk,
        severity: 'warning',
        metadata: {
          details: `فئة التنبيه الأمني: ${params.category}`
        }
      });

      if (cfg.enableSirenSound && (params.playSiren || params.severity === 'critical')) {
        setIsSirenActive(true);
        startSecuritySiren(params.category === 'manual_panic' ? 12000 : 8000, () => {
          setIsSirenActive(false);
        });
      } else if (cfg.enableSirenSound) {
        playSound('alert');
      }

      void sendTheftPushNotification(newAlert);
      return newAlert;
    },
    [getTheftConfig, currentUser.name, currentUser.role, sendTheftPushNotification]
  );

  const triggerPanicTheftAlert = useCallback(
    (customNote?: string): TheftAlertItem => {
      return raiseTheftAlert({
        category: 'manual_panic',
        severity: 'critical',
        title: 'إنذار سرقة فوري من الكاشير / المتجر (SOS)',
        description:
          customNote?.trim() ||
          `تم تفعيل زر إنذار السرقة والطوارئ يدوياً في الفرع (${activeBranchNameRef.current || 'الرئيسي'}). يرجى التدخل الفوري للمدير!`,
        playSiren: true
      });
    },
    [raiseTheftAlert]
  );

  const acknowledgeTheftAlert = useCallback(
    (alertId: string, resolutionNote?: string, managerPin?: string): { success: boolean; message?: string } => {
      const cfg = getTheftConfig();
      if (cfg.requireManagerPinToDismiss) {
        if (!managerPin || !verifyManagerPin(managerPin)) {
          playSound('error');
          return {
            success: false,
            message: 'رمز المدير السري غير صحيح! مطلوب تصريح المدير لإغلاق تنبيه السرقة.'
          };
        }
      }

      const nowIso = new Date().toISOString();
      setTheftAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId
            ? {
                ...a,
                acknowledged: true,
                acknowledgedAt: nowIso,
                acknowledgedBy: currentUser.name,
                resolutionNote: resolutionNote?.trim() || a.resolutionNote
              }
            : a
        )
      );
      setActiveTheftToasts((prev) => prev.filter((a) => a.id !== alertId));
      stopSecuritySiren();
      setIsSirenActive(false);
      playSound('success');
      return { success: true };
    },
    [getTheftConfig, currentUser.name, verifyManagerPin]
  );

  const acknowledgeAllTheftAlerts = useCallback(
    (managerPin?: string): { success: boolean; message?: string } => {
      const cfg = getTheftConfig();
      if (cfg.requireManagerPinToDismiss) {
        if (!managerPin || !verifyManagerPin(managerPin)) {
          playSound('error');
          return {
            success: false,
            message: 'رمز المدير السري غير صحيح! مطلوب تصريح المدير لاعتماد وإغلاق جميع التنبيهات.'
          };
        }
      }
      const nowIso = new Date().toISOString();
      setTheftAlerts((prev) =>
        prev.map((a) =>
          a.acknowledged
            ? a
            : {
                ...a,
                acknowledged: true,
                acknowledgedAt: nowIso,
                acknowledgedBy: currentUser.name
              }
        )
      );
      setActiveTheftToasts([]);
      stopSecuritySiren();
      setIsSirenActive(false);
      playSound('success');
      return { success: true };
    },
    [getTheftConfig, currentUser.name, verifyManagerPin]
  );

  const clearAcknowledgedTheftAlerts = useCallback(() => {
    setTheftAlerts((prev) => prev.filter((a) => !a.acknowledged));
    playSound('click');
  }, []);

  const dismissLowStockToast = useCallback((productId: string) => {
    setActiveLowStockToasts((prev) => prev.filter((item) => item.productId !== productId));
  }, []);

  const dismissAllLowStockToasts = useCallback(() => {
    setActiveLowStockToasts([]);
  }, []);

  const requestNotificationPermission = useCallback(async (): Promise<NotificationPermission | 'unsupported'> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      return 'unsupported';
    }
    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      return perm;
    } catch {
      const currentPerm = Notification.permission;
      setNotificationPermission(currentPerm);
      return currentPerm;
    }
  }, []);

  const triggerTestTheftAlert = useCallback(async (): Promise<TheftAlertItem> => {
    if (notificationPermission === 'default') {
      await requestNotificationPermission();
    }
    return raiseTheftAlert({
      category: 'cash_discrepancy',
      severity: 'high',
      title: 'تنبيه سرقة وحماية تجريبي (فحص الصافرة)',
      description:
        'هذا اختبار لنظام كشف السرقة والاحتيال: عند وجود عجز في الصندوق أو خصم مبالغ فيه أو حذف فاتورة سيتم إطلاق الصافرة والإشعار الفوري.',
      amountAtRisk: 150,
      playSiren: true
    });
  }, [notificationPermission, requestNotificationPermission, raiseTheftAlert]);

  const sendBrowserPushNotification = useCallback(
    async (items: LowStockAlertItem[]) => {
      if (items.length === 0) return;
      if (settings.enableLowStockPushNotifications === false) return;
      if (typeof window === 'undefined' || !('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      const first = items[0];
      const isOut = first.severity === 'out_of_stock';
      const title =
        items.length === 1
          ? isOut
            ? `🚨 نفذت الكمية بالكامل: ${first.name}`
            : `⚠️ تنبيه مخزون منخفض: ${first.name}`
          : `⚠️ تنبيه نفاد مخزون (${items.length} منتجات تحت الحد الأدنى)`;

      const body =
        items.length === 1
          ? `الرصيد المتبقي: ${first.stock} ${first.unitType || ''} (الحد الأدنى للطلب: ${first.threshold}) — اضغط للتوريد أو المتابعة.`
          : `${first.name} (${first.stock}) و ${items.length - 1} أصناف أخرى وصلت للحد الأدنى للطلب.`;

      const notifOptions: NotificationOptions = {
        body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: `kadi-pos-low-stock-${items.length === 1 ? first.productId : 'batch'}`,
        requireInteraction: items.some((i) => i.severity === 'out_of_stock' || i.severity === 'critical')
      };

      try {
        if ('serviceWorker' in navigator) {
          const reg = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 500))
          ]);
          if (reg && 'showNotification' in reg) {
            await reg.showNotification(title, notifOptions);
            return;
          }
        }
        const n = new Notification(title, notifOptions);
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch {
        // Fallback silently if iframe/sandbox restricts native Notification constructor
      }
    },
    [settings.enableLowStockPushNotifications]
  );

  const dispatchLowStockNotifications = useCallback(
    (items: LowStockAlertItem[], options?: { skipPush?: boolean }) => {
      if (items.length === 0) return;

      if (settings.enableLowStockVisualAlerts !== false) {
        setActiveLowStockToasts((prev) => {
          const nextMap = new Map<string, LowStockAlertItem>();
          items.forEach((it) => nextMap.set(it.productId, it));
          prev.forEach((old) => {
            if (!nextMap.has(old.productId)) {
              nextMap.set(old.productId, old);
            }
          });
          return Array.from(nextMap.values()).slice(0, 4);
        });
      }

      if (settings.enableSoundEffects && settings.enableLowStockAudioAlert !== false) {
        playSound('alert');
      }

      if (!options?.skipPush) {
        void sendBrowserPushNotification(items);
      }
    },
    [
      settings.enableLowStockVisualAlerts,
      settings.enableSoundEffects,
      settings.enableLowStockAudioAlert,
      sendBrowserPushNotification
    ]
  );

  const triggerTestStockAlert = useCallback(async () => {
    if (notificationPermission === 'default') {
      await requestNotificationPermission();
    }
    const lowest =
      [...products]
        .filter((p) => p.lowStockThreshold > 0)
        .sort((a, b) => a.stock - b.stock)[0] || products[0];

    const sampleItem: LowStockAlertItem = lowest
      ? {
          productId: lowest.id,
          name: lowest.name,
          stock: Math.min(lowest.stock, Math.max(0, lowest.lowStockThreshold - 1)),
          threshold: lowest.lowStockThreshold || 10,
          unitType: lowest.unitType,
          severity:
            lowest.stock <= 0
              ? 'out_of_stock'
              : lowest.lowStockThreshold > 0 && lowest.stock <= lowest.lowStockThreshold * 0.2
              ? 'critical'
              : 'low',
          triggeredAt: new Date().toISOString()
        }
      : {
          productId: 'test-low-stock',
          name: 'زيت المائدة (تنبيه تجريبي)',
          stock: 3,
          threshold: 10,
          unitType: 'piece',
          severity: 'low',
          triggeredAt: new Date().toISOString()
        };

    dispatchLowStockNotifications([sampleItem]);
  }, [notificationPermission, requestNotificationPermission, products, dispatchLowStockNotifications]);

  // Unified reactive watcher: detects ANY product crossing at/below lowStockThreshold across sales, voice POS, edits, adjustments
  const prevStockSnapshotRef = useRef<Map<string, { stock: number; threshold: number }> | null>(null);
  useEffect(() => {
    const prevMap = prevStockSnapshotRef.current;
    const nextMap = new Map<string, { stock: number; threshold: number }>();

    const crossedItems: LowStockAlertItem[] = [];
    const recoveredIds = new Set<string>();

    products.forEach((p) => {
      nextMap.set(p.id, { stock: p.stock, threshold: p.lowStockThreshold });
      const prev = prevMap?.get(p.id);

      if (p.lowStockThreshold > 0 && p.stock > p.lowStockThreshold) {
        recoveredIds.add(p.id);
      }

      if (!prevMap) return;
      if (!prev) {
        if (p.lowStockThreshold > 0 && p.stock <= p.lowStockThreshold) {
          crossedItems.push({
            productId: p.id,
            name: p.name,
            stock: p.stock,
            threshold: p.lowStockThreshold,
            unitType: p.unitType,
            severity:
              p.stock <= 0
                ? 'out_of_stock'
                : p.stock <= p.lowStockThreshold * 0.2
                ? 'critical'
                : 'low',
            triggeredAt: new Date().toISOString()
          });
        }
        return;
      }

      const wasAboveMin = prev.stock > prev.threshold;
      const isNowAtOrBelowMin = p.lowStockThreshold > 0 && p.stock <= p.lowStockThreshold;
      const droppedToZero = prev.stock > 0 && p.stock <= 0;
      const droppedIntoCritical =
        p.lowStockThreshold > 0 &&
        prev.stock > p.lowStockThreshold * 0.2 &&
        p.stock <= p.lowStockThreshold * 0.2;
      const stockDecreasedWhileLow = isNowAtOrBelowMin && p.stock < prev.stock;

      if ((wasAboveMin && isNowAtOrBelowMin) || droppedToZero || droppedIntoCritical || stockDecreasedWhileLow) {
        crossedItems.push({
          productId: p.id,
          name: p.name,
          stock: p.stock,
          threshold: p.lowStockThreshold,
          unitType: p.unitType,
          severity:
            p.stock <= 0
              ? 'out_of_stock'
              : p.stock <= p.lowStockThreshold * 0.2
              ? 'critical'
              : 'low',
          triggeredAt: new Date().toISOString()
        });
      }
    });

    prevStockSnapshotRef.current = nextMap;

    if (recoveredIds.size > 0) {
      setActiveLowStockToasts((prev) => prev.filter((item) => !recoveredIds.has(item.productId)));
    }

    if (crossedItems.length > 0) {
      dispatchLowStockNotifications(crossedItems);
    }
  }, [products, dispatchLowStockNotifications]);

  const lowStockProducts = useMemo(() => {
    return products.filter((p) => p.lowStockThreshold > 0 && p.stock <= p.lowStockThreshold);
  }, [products]);

  const criticalLowStockProducts = useMemo(() => {
    return products.filter(
      (p) => p.lowStockThreshold > 0 && p.stock <= p.lowStockThreshold * 0.2
    );
  }, [products]);

  const expiringSoonProducts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    return products.filter((p) => {
      if (!p.expiryDate) return false;
      const exp = new Date(p.expiryDate);
      if (isNaN(exp.getTime())) return false;
      return exp.getTime() - today.getTime() <= thirtyDaysMs;
    });
  }, [products]);

  // Cart & Active Ticket
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [orderDiscount, setOrderDiscountState] = useState<{ type: 'percent' | 'fixed'; value: number } | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    localStorage.setItem('kadi_pos_cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = (
    product: Product,
    variantId?: string,
    modifiers?: { id: string; name: string; price: number }[],
    customQuantity?: number
  ) => {
    let effectivePrice = product.price;
    let effectiveCost = product.costPrice;
    let variantName = '';

    if (variantId && product.variants) {
      const v = product.variants.find((item) => item.id === variantId);
      if (v) {
        effectivePrice = v.price;
        effectiveCost = v.costPrice ?? product.costPrice;
        variantName = v.name;
      }
    }

    if (modifiers && modifiers.length > 0) {
      const modTotal = modifiers.reduce((acc, m) => acc + m.price, 0);
      effectivePrice += modTotal;
    }

    // Unique cart id for product + variant + modifiers combination
    const modKey = (modifiers || []).map((m) => m.id).sort().join('_');
    const cartItemId = `${product.id}_${variantId || 'base'}_${modKey}`;
    const initialQty = customQuantity !== undefined ? customQuantity : 1;

    setCart((prev) => {
      const existing = prev.find((item) => item.id === cartItemId);
      if (existing) {
        const step = customQuantity !== undefined ? customQuantity : (product.unitType === 'kg' || product.unitType === 'liter' ? 0.5 : 1);
        const newQty = Number((existing.quantity + step).toFixed(2));
        return prev.map((item) =>
          item.id === cartItemId ? { ...item, quantity: newQty } : item
        );
      }
      const newItem: CartItem = {
        id: cartItemId,
        productId: product.id,
        productName: product.name,
        productNameEn: product.nameEn,
        sku: product.sku,
        barcode: product.barcode,
        price: effectivePrice,
        costPrice: effectiveCost,
        quantity: initialQty,
        unitType: product.unitType,
        variantId,
        variantName: variantName || undefined,
        modifiers,
        image: product.image
      };
      return [...prev, newItem];
    });

    if (settings.enableSoundEffects) {
      playSound('beep');
    }
  };

  const updateCartItemQuantity = (cartItemId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.id === cartItemId) {
            const newQty = Number((item.quantity + delta).toFixed(2));
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null);
    });
    if (settings.enableSoundEffects) {
      playSound('click');
    }
  };

  const setCartItemQuantity = (cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeCartItem(cartItemId);
      return;
    }
    const cleanQty = Number(quantity.toFixed(2));
    setCart((prev) =>
      prev.map((item) => (item.id === cartItemId ? { ...item, quantity: cleanQty } : item))
    );
  };

  const removeCartItem = (cartItemId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== cartItemId));
    if (settings.enableSoundEffects) {
      playSound('click');
    }
  };

  const clearCart = (markAsVoid?: boolean) => {
    if (markAsVoid && cart.length > 0) {
      const theftCfg = getTheftConfig();
      if (theftCfg.enabled && cartGrandTotal >= theftCfg.cartVoidAmountThreshold) {
        raiseTheftAlert({
          category: 'cart_void',
          severity: cartGrandTotal >= theftCfg.cartVoidAmountThreshold * 2 ? 'critical' : 'high',
          title: `إفراغ / إلغاء فاتورة جارية (${cartGrandTotal.toFixed(2)} ${settings.currencySymbol})`,
          description: `تم إلغاء السلة بالكامل قبل إتمام الدفع (${cart.length} أصناف بقيمة إجمالية ${cartGrandTotal.toFixed(2)} ${settings.currencySymbol}).`,
          amountAtRisk: cartGrandTotal,
          playSiren: cartGrandTotal >= theftCfg.cartVoidAmountThreshold * 2
        });
      }
    }
    setCart([]);
    setOrderDiscountState(null);
    setSelectedCustomer(null);
  };

  const setOrderDiscount = (discount: { type: 'percent' | 'fixed'; value: number } | null) => {
    setOrderDiscountState(discount);
    if (discount && discount.value > 0) {
      const theftCfg = getTheftConfig();
      const approxPct =
        discount.type === 'percent'
          ? discount.value
          : cartSubtotal > 0
          ? (discount.value / cartSubtotal) * 100
          : 0;
      const discountAmount =
        discount.type === 'percent'
          ? Number(((cartSubtotal * discount.value) / 100).toFixed(2))
          : discount.value;

      if (theftCfg.enabled && approxPct >= theftCfg.highDiscountPercentThreshold) {
        raiseTheftAlert({
          category: 'price_tampering',
          severity: approxPct >= 50 ? 'critical' : 'high',
          title: `خصم استثنائي مرتفع على الفاتورة (${approxPct.toFixed(0)}%)`,
          description: `تم تطبيق خصم كلي بقيمة ${discountAmount.toFixed(2)} ${settings.currencySymbol} (${approxPct.toFixed(1)}%) — الحد المسموح به قبل التنبيه: ${theftCfg.highDiscountPercentThreshold}%.`,
          amountAtRisk: discountAmount,
          playSiren: approxPct >= 50
        });
      }
    }
  };

  const applyCartItemDiscount = (
    cartItemId: string,
    discount: { type: 'percent' | 'fixed'; value: number } | undefined
  ) => {
    setCart((prev) =>
      prev.map((item) => (item.id === cartItemId ? { ...item, itemDiscount: discount } : item))
    );
  };

  const cartItemNote = (cartItemId: string, note: string) => {
    setCart((prev) =>
      prev.map((item) => (item.id === cartItemId ? { ...item, note } : item))
    );
  };

  const overrideCartItemPrice = (cartItemId: string, newPrice: number, reason?: string) => {
    const cleanPrice = Math.max(0, Number(newPrice.toFixed(2)));
    const targetItem = cart.find((item) => item.id === cartItemId);
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === cartItemId) {
          return {
            ...item,
            price: cleanPrice,
            originalPrice: item.originalPrice !== undefined ? item.originalPrice : item.price,
            isPriceOverridden: true,
            priceOverrideReason: reason || 'تعديل يدوي من المسؤول'
          };
        }
        return item;
      })
    );
    if (targetItem) {
      const theftCfg = getTheftConfig();
      const refPrice = targetItem.originalPrice ?? targetItem.price;
      const dropPct = refPrice > 0 ? ((refPrice - cleanPrice) / refPrice) * 100 : 0;
      const belowCost = cleanPrice < targetItem.costPrice;
      if (
        theftCfg.enabled &&
        (belowCost || dropPct >= theftCfg.highDiscountPercentThreshold)
      ) {
        const riskAmount = Math.max(0, Number(((refPrice - cleanPrice) * targetItem.quantity).toFixed(2)));
        raiseTheftAlert({
          category: 'price_tampering',
          severity: belowCost ? 'critical' : 'high',
          title: belowCost
            ? `تخفيض سعر أقل من التكلفة: ${targetItem.productName}`
            : `تعديل سعر غير معتاد (${dropPct.toFixed(0)}%-) : ${targetItem.productName}`,
          description: `تم تعديل سعر "${targetItem.productName}" من ${refPrice.toFixed(2)} إلى ${cleanPrice.toFixed(2)} ${settings.currencySymbol} (سعر التكلفة: ${targetItem.costPrice.toFixed(2)}). السبب: ${reason || 'بدون مبرر'}.`,
          amountAtRisk: riskAmount,
          playSiren: belowCost
        });
      }
    }
    if (settings.enableSoundEffects) {
      playSound('click');
    }
  };

  // Cart Totals and Profit Margins calculation
  const {
    cartSubtotal,
    cartDiscountTotal,
    cartTaxTotal,
    cartGrandTotal,
    cartCostTotal,
    cartProfitTotal,
    cartProfitMarginPercent
  } = useMemo(() => {
    let subtotal = 0;
    let itemDiscounts = 0;
    let totalCost = 0;

    cart.forEach((item) => {
      const lineBase = item.price * item.quantity;
      subtotal += lineBase;
      totalCost += item.costPrice * item.quantity;

      if (item.itemDiscount) {
        if (item.itemDiscount.type === 'percent') {
          itemDiscounts += (lineBase * item.itemDiscount.value) / 100;
        } else {
          itemDiscounts += Math.min(lineBase, item.itemDiscount.value);
        }
      }
    });

    let orderDiscountAmt = 0;
    const netBeforeOrderDisc = Math.max(0, subtotal - itemDiscounts);
    if (orderDiscount) {
      if (orderDiscount.type === 'percent') {
        orderDiscountAmt = (netBeforeOrderDisc * orderDiscount.value) / 100;
      } else {
        orderDiscountAmt = Math.min(netBeforeOrderDisc, orderDiscount.value);
      }
    }

    const totalDiscount = itemDiscounts + orderDiscountAmt;
    const taxableAmount = Math.max(0, subtotal - totalDiscount);
    const taxRate = settings.taxRate / 100; // e.g. 0.15 for 15%
    const taxTotal = Number((taxableAmount * taxRate).toFixed(2));
    const grandTotal = Number((taxableAmount + taxTotal).toFixed(2));
    
    // Profit Calculation: Net Revenue (excluding tax) minus Total Cost
    const netRevenue = taxableAmount;
    const profitTotal = Number((netRevenue - totalCost).toFixed(2));
    const profitMarginPercent = netRevenue > 0 ? Number(((profitTotal / netRevenue) * 100).toFixed(1)) : 0;

    return {
      cartSubtotal: Number(subtotal.toFixed(2)),
      cartDiscountTotal: Number(totalDiscount.toFixed(2)),
      cartTaxTotal: taxTotal,
      cartGrandTotal: grandTotal,
      cartCostTotal: Number(totalCost.toFixed(2)),
      cartProfitTotal: profitTotal,
      cartProfitMarginPercent: profitMarginPercent
    };
  }, [cart, orderDiscount, settings.taxRate]);

  // Orders State
  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_orders');
      if (saved) return JSON.parse(saved);
      // Pre-seed a couple of realistic recent orders
      const sampleOrders: Order[] = [
        {
          id: 'ord-1001',
          orderNumber: '#KD-1001',
          date: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
          items: [
            {
              productId: 'prod-2',
              productName: 'فلات وايت أسترالي',
              price: 18.0,
              costPrice: 6.0,
              quantity: 2,
              variantName: 'صغير (Small - 6oz)',
              total: 36.0,
              discount: 0
            },
            {
              productId: 'prod-5',
              productName: 'كرواسون زبدة فرنسي فاخر',
              price: 15.0,
              costPrice: 5.0,
              quantity: 1,
              total: 15.0,
              discount: 0
            }
          ],
          subtotal: 51.0,
          discountTotal: 0,
          taxTotal: 7.65,
          grandTotal: 58.65,
          costTotal: 17.0,
          profitTotal: 34.0,
          paymentMethod: 'card',
          cashierName: 'كاشير كادي (المسؤول)',
          customerId: 'cust-1',
          customerName: 'سلطان القحطاني',
          status: 'completed',
          zatcaQrString: ''
        },
        {
          id: 'ord-1002',
          orderNumber: '#KD-1002',
          date: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
          items: [
            {
              productId: 'prod-8',
              productName: 'عطر كادي الخاص (Kadi Signature Oud)',
              price: 240.0,
              costPrice: 95.0,
              quantity: 1,
              variantName: 'عبوة 50 مل (50ml)',
              total: 240.0,
              discount: 0
            }
          ],
          subtotal: 240.0,
          discountTotal: 0,
          taxTotal: 36.0,
          grandTotal: 276.0,
          costTotal: 95.0,
          profitTotal: 145.0,
          paymentMethod: 'apple_pay',
          cashierName: 'كاشير كادي (المسؤول)',
          status: 'completed',
          zatcaQrString: ''
        }
      ];
      return sampleOrders;
    } catch {
      return [];
    }
  });

  const [lastCompletedOrder, setLastCompletedOrder] = useState<Order | null>(null);
  const ordersHydratedRef = useRef(false);

  // Offline Mode & IndexedDB Offline Sales Sync Queue State
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [offlineSalesQueue, setOfflineSalesQueue] = useState<OfflineSaleQueueItem[]>([]);
  const [isSyncingOfflineSales, setIsSyncingOfflineSales] = useState(false);
  const [lastOfflineSyncResult, setLastOfflineSyncResult] = useState<{
    syncedCount: number;
    syncedAt: string;
  } | null>(null);
  const offlineQueueRef = useRef<OfflineSaleQueueItem[]>([]);
  const syncInFlightRef = useRef(false);

  useEffect(() => {
    offlineQueueRef.current = offlineSalesQueue;
  }, [offlineSalesQueue]);

  useEffect(() => {
    safeLocalStorageSet('kadi_pos_orders', JSON.stringify(orders.slice(0, 200)));
    if (ordersHydratedRef.current) {
      void saveOrdersToIndexedDB(orders);
    }
  }, [orders]);

  // Customers State
  const [customers, setCustomers] = useState<Customer[]>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_customers');
      return saved ? JSON.parse(saved) : initialCustomers;
    } catch {
      return initialCustomers;
    }
  });

  useEffect(() => {
    localStorage.setItem('kadi_pos_customers', JSON.stringify(customers));
  }, [customers]);

  // Automatic Real-time Trade Zakat Calculation (حساب آلي عند تجاوز نصاب 85 جم ذهب)
  const zakatSummary = useMemo(() => {
    return calculateTradeZakatSummary(products, customers, settings);
  }, [products, customers, settings]);

  // Credit Ledger (كناش الكريدي والديون)
  const [creditTransactions, setCreditTransactions] = useState<CreditTransaction[]>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_credit_transactions_v1');
      return saved ? JSON.parse(saved) : initialCreditTransactions;
    } catch {
      return initialCreditTransactions;
    }
  });

  useEffect(() => {
    localStorage.setItem('kadi_pos_credit_transactions_v1', JSON.stringify(creditTransactions));
  }, [creditTransactions]);

  const addCustomer = (customerData: Omit<Customer, 'id' | 'points' | 'balance' | 'tier' | 'totalSpent' | 'ordersCount' | 'createdAt'> & { balance?: number }) => {
    const initialBal = customerData.balance ? Math.max(0, Number(Number(customerData.balance).toFixed(2))) : 0;
    const newCust: Customer = {
      ...customerData,
      id: `cust-${Date.now()}`,
      points: 0,
      balance: initialBal,
      tier: 'Silver',
      totalSpent: 0,
      ordersCount: 0,
      createdAt: new Date().toISOString().split('T')[0]
    };
    setCustomers((prev) => [newCust, ...prev]);
    setSelectedCustomer(newCust);

    if (initialBal > 0) {
      const initTx: CreditTransaction = {
        id: `cred-tx-${Date.now()}`,
        customerId: newCust.id,
        customerName: newCust.name,
        type: 'debt',
        amount: initialBal,
        date: new Date().toISOString(),
        notes: customerData.notes || 'رصيد كريدي افتتاحي سابق',
        previousBalance: 0,
        newBalance: initialBal,
        recordedBy: currentUser.name
      };
      setCreditTransactions((prev) => [initTx, ...prev]);
    }

    addActivityLog({
      category: 'credit_ledger',
      title: `تسجيل عميل جديد: ${newCust.name}`,
      description: `تم إضافة ${newCust.name} (هاتف: ${newCust.phone}) برصيد كريدي: ${initialBal} درهم`,
      actor: currentUser.name,
      actorRole: currentUser.role,
      severity: 'info'
    });

    playSound('click');
    return newCust;
  };

  const updateCustomer = (id: string, updated: Partial<Customer>) => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updated } : c))
    );
  };

  const deleteCustomer = (id: string) => {
    const target = customers.find((c) => c.id === id);
    setCustomers((prev) => prev.filter((c) => c.id !== id));
    if (selectedCustomer?.id === id) {
      setSelectedCustomer(null);
    }
    if (target) {
      addActivityLog({
        category: 'credit_ledger',
        title: `حذف حساب العميل: ${target.name}`,
        description: `قام ${currentUser.name} بحذف ملف العميل ${target.name} من النظام`,
        actor: currentUser.name,
        actorRole: currentUser.role,
        severity: 'warning'
      });
    }
    playSound('click');
  };

  const addCreditDebt = (customerId: string, amount: number, notes?: string, receiptNumber?: string) => {
    if (amount <= 0) return { success: false, message: 'المبلغ يجب أن يكون أكبر من 0' };
    const target = customers.find((c) => c.id === customerId);
    if (!target) return { success: false, message: 'العميل غير موجود' };

    const prevBal = target.balance;
    const newBal = Number((prevBal + amount).toFixed(2));

    setCustomers((prev) =>
      prev.map((c) => (c.id === customerId ? { ...c, balance: newBal } : c))
    );

    const newTx: CreditTransaction = {
      id: `cred-tx-${Date.now()}`,
      customerId: target.id,
      customerName: target.name,
      type: 'debt',
      amount,
      date: new Date().toISOString(),
      notes: notes || 'تقييد كريدي جديد على الحساب',
      receiptNumber,
      previousBalance: prevBal,
      newBalance: newBal,
      recordedBy: currentUser.name
    };

    setCreditTransactions((prev) => [newTx, ...prev]);

    addActivityLog({
      category: 'credit_ledger',
      title: `تقييد كريدي جديد: ${target.name}`,
      description: `تم تقييد ${amount} درهم على حساب ${target.name} (${notes || 'بدون ملاحظات'}). الرصيد السابق: ${prevBal} د.م، الجديد: ${newBal} د.م`,
      actor: currentUser.name,
      actorRole: currentUser.role,
      severity: 'info'
    });

    playSound('click');
    return { success: true };
  };

  const settleCustomerCredit = (customerId: string, amount: number, notes?: string) => {
    if (amount <= 0) return { success: false, message: 'مبلغ السداد يجب أن يكون أكبر من 0' };
    const target = customers.find((c) => c.id === customerId);
    if (!target) return { success: false, message: 'العميل غير موجود' };

    const prevBal = target.balance;
    const newBal = Math.max(0, Number((prevBal - amount).toFixed(2)));

    setCustomers((prev) =>
      prev.map((c) => (c.id === customerId ? { ...c, balance: newBal } : c))
    );

    const newTx: CreditTransaction = {
      id: `cred-tx-${Date.now()}`,
      customerId: target.id,
      customerName: target.name,
      type: 'payment',
      amount,
      date: new Date().toISOString(),
      notes: notes || (newBal === 0 ? 'خلاص وتسديد كامل للكريدي' : 'سداد دفعة جزئية من الكريدي'),
      previousBalance: prevBal,
      newBalance: newBal,
      recordedBy: currentUser.name
    };

    setCreditTransactions((prev) => [newTx, ...prev]);

    addActivityLog({
      category: 'credit_ledger',
      title: `تسديد كريدي: ${target.name}`,
      description: `تم استلام ${amount} درهم سداداً من ${target.name}. المتبقي بذمته: ${newBal} درهم`,
      actor: currentUser.name,
      actorRole: currentUser.role,
      severity: 'success'
    });

    playSound('success');
    return { success: true };
  };

  // Chronological Credit Ledger Recalculation & Reconstruction Helper
  const recalculateLedgerForCustomer = (
    customerId: string,
    allTxs: CreditTransaction[]
  ): { updatedTxs: CreditTransaction[]; finalBalance: number } => {
    const custTxs = allTxs
      .filter((tx) => tx.customerId === customerId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const others = allTxs.filter((tx) => tx.customerId !== customerId);

    let running = 0;
    const rebuiltAsc = custTxs.map((tx) => {
      const prevBal = Number(running.toFixed(2));
      if (tx.type === 'debt') {
        running = Number((running + tx.amount).toFixed(2));
      } else {
        running = Math.max(0, Number((running - tx.amount).toFixed(2)));
      }
      return {
        ...tx,
        previousBalance: prevBal,
        newBalance: running
      };
    });

    // Keep newest-first display ordering in creditTransactions state
    const merged = [...[...rebuiltAsc].reverse(), ...others].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    return { updatedTxs: merged, finalBalance: Number(running.toFixed(2)) };
  };

  const rebuildCustomerCreditLedger = (customerId: string) => {
    const { updatedTxs, finalBalance } = recalculateLedgerForCustomer(customerId, creditTransactions);
    setCreditTransactions(updatedTxs);
    setCustomers((prev) =>
      prev.map((c) => (c.id === customerId ? { ...c, balance: finalBalance } : c))
    );
    if (settings.enableSoundEffects) playSound('success');
  };

  const updateCreditTransaction = (
    txId: string,
    updates: {
      type?: 'debt' | 'payment';
      amount?: number;
      date?: string;
      notes?: string;
      receiptNumber?: string;
    }
  ) => {
    const targetTx = creditTransactions.find((tx) => tx.id === txId);
    if (!targetTx) return { success: false, message: 'الحركة غير موجودة' };
    const cleanAmount =
      updates.amount !== undefined ? Math.max(0.01, Number(updates.amount) || 0) : targetTx.amount;
    if (cleanAmount <= 0) return { success: false, message: 'المبلغ يجب أن يكون أكبر من 0' };

    const modifiedList = creditTransactions.map((tx) =>
      tx.id === txId
        ? {
            ...tx,
            type: updates.type ?? tx.type,
            amount: Number(cleanAmount.toFixed(2)),
            date: updates.date ? new Date(updates.date).toISOString() : tx.date,
            notes: updates.notes !== undefined ? updates.notes : tx.notes,
            receiptNumber: updates.receiptNumber !== undefined ? updates.receiptNumber : tx.receiptNumber
          }
        : tx
    );

    const { updatedTxs, finalBalance } = recalculateLedgerForCustomer(targetTx.customerId, modifiedList);
    setCreditTransactions(updatedTxs);
    setCustomers((prev) =>
      prev.map((c) => (c.id === targetTx.customerId ? { ...c, balance: finalBalance } : c))
    );

    addActivityLog({
      category: 'credit_ledger',
      title: `تعديل حركة في الكناش: ${targetTx.customerName}`,
      description: `تم تعديل حركة (${updates.type ?? targetTx.type === 'debt' ? 'دين' : 'تسديد'}) بمبلغ ${cleanAmount.toFixed(2)} ${settings.currencySymbol} وإعادة احتساب الرصيد (${finalBalance.toFixed(2)} ${settings.currencySymbol})`,
      actor: currentUser.name,
      actorRole: currentUser.role,
      severity: 'info'
    });

    if (settings.enableSoundEffects) playSound('click');
    return { success: true };
  };

  const deleteCreditTransaction = (txId: string) => {
    const targetTx = creditTransactions.find((tx) => tx.id === txId);
    if (!targetTx) return { success: false, message: 'الحركة غير موجودة' };

    const filtered = creditTransactions.filter((tx) => tx.id !== txId);
    const { updatedTxs, finalBalance } = recalculateLedgerForCustomer(targetTx.customerId, filtered);
    setCreditTransactions(updatedTxs);
    setCustomers((prev) =>
      prev.map((c) => (c.id === targetTx.customerId ? { ...c, balance: finalBalance } : c))
    );

    addActivityLog({
      category: 'credit_ledger',
      title: `حذف حركة من الكناش: ${targetTx.customerName}`,
      description: `تم حذف حركة بمبلغ ${targetTx.amount.toFixed(2)} ${settings.currencySymbol} وإعادة بناء الرصيد النهائي (${finalBalance.toFixed(2)} ${settings.currencySymbol})`,
      actor: currentUser.name,
      actorRole: currentUser.role,
      severity: 'warning'
    });

    if (settings.enableSoundEffects) playSound('click');
    return { success: true };
  };

  const addCustomCreditEntry = (
    customerId: string,
    entry: {
      type: 'debt' | 'payment';
      amount: number;
      date: string;
      notes?: string;
      receiptNumber?: string;
    }
  ) => {
    const cleanAmount = Math.max(0, Number(entry.amount) || 0);
    if (cleanAmount <= 0) return { success: false, message: 'المبلغ يجب أن يكون أكبر من 0' };
    const target = customers.find((c) => c.id === customerId);
    if (!target) return { success: false, message: 'العميل غير موجود' };

    const newTx: CreditTransaction = {
      id: `cred-tx-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      customerId: target.id,
      customerName: target.name,
      type: entry.type,
      amount: Number(cleanAmount.toFixed(2)),
      date: entry.date ? new Date(entry.date).toISOString() : new Date().toISOString(),
      notes: entry.notes?.trim() || (entry.type === 'debt' ? 'قيد مخصص في الكناش' : 'دفعة مخصصة في الكناش'),
      receiptNumber: entry.receiptNumber?.trim() || undefined,
      previousBalance: 0,
      newBalance: 0,
      recordedBy: currentUser.name
    };

    const { updatedTxs, finalBalance } = recalculateLedgerForCustomer(customerId, [newTx, ...creditTransactions]);
    setCreditTransactions(updatedTxs);
    setCustomers((prev) =>
      prev.map((c) => (c.id === customerId ? { ...c, balance: finalBalance } : c))
    );

    addActivityLog({
      category: 'credit_ledger',
      title: `بناء حركة مخصصة في الكناش: ${target.name}`,
      description: `إدراج حركة ${entry.type === 'debt' ? 'دين' : 'تسديد'} بمبلغ ${cleanAmount.toFixed(2)} ${settings.currencySymbol} بتاريخ ${entry.date.slice(0, 10)} — الرصيد بعد إعادة البناء: ${finalBalance.toFixed(2)} ${settings.currencySymbol}`,
      actor: currentUser.name,
      actorRole: currentUser.role,
      severity: 'info'
    });

    if (settings.enableSoundEffects) playSound('success');
    return { success: true };
  };

  // Multi-Branch Management State (إدارة الفروع المتعددة والمزامنة)
  const [branches, setBranches] = useState<Branch[]>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_branches_v1');
      return saved ? JSON.parse(saved) : initialBranches;
    } catch {
      return initialBranches;
    }
  });

  const [activeBranchId, setActiveBranchIdState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_active_branch_id');
      return saved || 'branch-sefrou-main';
    } catch {
      return 'branch-sefrou-main';
    }
  });

  const [branchTransfers, setBranchTransfers] = useState<BranchTransfer[]>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_branch_transfers');
      return saved ? JSON.parse(saved) : initialTransfers;
    } catch {
      return initialTransfers;
    }
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>(() => {
    try {
      return (
        localStorage.getItem('kadi_pos_last_sync_time') ||
        new Date().toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' })
      );
    } catch {
      return new Date().toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' });
    }
  });

  useEffect(() => {
    localStorage.setItem('kadi_pos_branches_v1', JSON.stringify(branches));
  }, [branches]);

  useEffect(() => {
    localStorage.setItem('kadi_pos_branch_transfers', JSON.stringify(branchTransfers));
  }, [branchTransfers]);

  const activeBranch = useMemo<Branch>(() => {
    const found = branches.find((b) => b.id === activeBranchId);
    return found || branches[0] || initialBranches[0];
  }, [branches, activeBranchId]);

  useEffect(() => {
    activeBranchNameRef.current = activeBranch.name;
  }, [activeBranch.name]);

  const setActiveBranchId = (id: string) => {
    setActiveBranchIdState(id);
    localStorage.setItem('kadi_pos_active_branch_id', id);
    if (settings.enableSoundEffects) {
      playSound('click');
    }
  };

  const addBranch = (data: Omit<Branch, 'id' | 'createdAt'>) => {
    const newBranch: Branch = {
      ...data,
      id: `branch-${Date.now()}`,
      createdAt: new Date().toISOString().slice(0, 10),
      syncStatus: 'synced',
      lastSyncAt: new Date().toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' })
    };
    setBranches((prev) => [...prev, newBranch]);
    if (settings.enableSoundEffects) {
      playSound('success');
    }
  };

  const updateBranch = (id: string, updated: Partial<Branch>) => {
    setBranches((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...updated } : b))
    );
  };

  const deleteBranch = (id: string) => {
    if (branches.length <= 1) return;
    setBranches((prev) => prev.filter((b) => b.id !== id));
    if (activeBranchId === id) {
      const remaining = branches.filter((b) => b.id !== id);
      if (remaining.length > 0) {
        setActiveBranchId(remaining[0].id);
      }
    }
  };

  const transferStockBetweenBranches = (
    productId: string,
    fromBranchId: string,
    toBranchId: string,
    quantity: number,
    notes?: string
  ): boolean => {
    if (quantity <= 0 || fromBranchId === toBranchId) return false;
    const prod = products.find((p) => p.id === productId);
    const fromBranch = branches.find((b) => b.id === fromBranchId);
    const toBranch = branches.find((b) => b.id === toBranchId);
    if (!prod || !fromBranch || !toBranch) return false;

    const transferNum = `TR-${100 + branchTransfers.length + 1}`;
    const newTransfer: BranchTransfer = {
      id: `tr-${Date.now()}`,
      transferNumber: transferNum,
      date: new Date().toISOString(),
      fromBranchId,
      fromBranchName: fromBranch.name,
      toBranchId,
      toBranchName: toBranch.name,
      productId,
      productName: prod.name,
      quantity,
      unit: prod.unitType || 'piece',
      status: 'completed',
      notes: notes || `تحويل مخزون من ${fromBranch.code} إلى ${toBranch.code}`,
      createdBy: currentShift.cashierName || 'المسؤول'
    };

    setBranchTransfers((prev) => [newTransfer, ...prev]);

    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        const currentBranchStocks = p.branchStocks ? { ...p.branchStocks } : {};
        const fromCurrent = currentBranchStocks[fromBranchId] !== undefined ? currentBranchStocks[fromBranchId] : p.stock;
        const toCurrent = currentBranchStocks[toBranchId] !== undefined ? currentBranchStocks[toBranchId] : 0;

        currentBranchStocks[fromBranchId] = Math.max(0, Number((fromCurrent - quantity).toFixed(2)));
        currentBranchStocks[toBranchId] = Number((toCurrent + quantity).toFixed(2));

        return {
          ...p,
          branchStocks: currentBranchStocks
        };
      })
    );

    const movOut: StockMovement = {
      id: `mov-${Date.now()}-tr-out`,
      productId: prod.id,
      productName: prod.name,
      date: new Date().toISOString(),
      type: 'audit_adjustment',
      quantityChange: -quantity,
      previousStock: prod.stock,
      newStock: prod.stock,
      unit: prod.unitType || 'piece',
      costPerUnit: prod.costPrice,
      reason: `تحويل صادر (${transferNum}) إلى ${toBranch.name}`
    };
    setStockMovements((prev) => [movOut, ...prev]);

    if (settings.enableSoundEffects) {
      playSound('success');
    }
    return true;
  };

  const syncBranchData = async (): Promise<{ success: boolean; message: string }> => {
    setIsSyncing(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const nowTime = new Date().toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' });
      setBranches((prev) =>
        prev.map((b) => ({
          ...b,
          syncStatus: 'synced',
          lastSyncAt: nowTime
        }))
      );
      setLastSyncTime(nowTime);
      localStorage.setItem('kadi_pos_last_sync_time', nowTime);
      if (settings.enableSoundEffects) {
        playSound('success');
      }
      return {
        success: true,
        message: 'تمت مزامنة بيانات كافة الفروع والمخزون بنجاح مع السحابة المركزية'
      };
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync all temporarily cached IndexedDB offline sales once connection is restored
  const syncPendingOfflineSales = useCallback(async (): Promise<{ syncedCount: number }> => {
    const queue = offlineQueueRef.current;
    if (queue.length === 0) return { syncedCount: 0 };
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { syncedCount: 0 };
    }
    if (syncInFlightRef.current) {
      return { syncedCount: 0 };
    }

    syncInFlightRef.current = true;
    setIsSyncingOfflineSales(true);

    const pendingIds = new Set(queue.map((item) => item.id));
    const attemptIso = new Date().toISOString();

    // Mark orders and queue items as syncing
    const syncingQueue: OfflineSaleQueueItem[] = queue.map((item) => ({
      ...item,
      status: 'syncing',
      attempts: item.attempts + 1,
      lastAttemptAt: attemptIso
    }));
    setOfflineSalesQueue(syncingQueue);
    offlineQueueRef.current = syncingQueue;
    void saveOfflineSalesQueue(syncingQueue);

    setOrders((prev) =>
      prev.map((o) => (pendingIds.has(o.id) ? { ...o, syncStatus: 'syncing' } : o))
    );

    try {
      // Confirm connectivity with lightweight same-origin reachability check + brief sync window
      try {
        await fetch(`/?_sync_ping=${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
      } catch {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          throw new Error('Offline');
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 450));

      const syncedIso = new Date().toISOString();
      const syncedTimeLabel = new Date().toLocaleTimeString('ar-MA', {
        hour: '2-digit',
        minute: '2-digit'
      });

      for (const item of syncingQueue) {
        await removeOfflineSaleFromQueue(item.id);
      }

      setOfflineSalesQueue((prev) => prev.filter((item) => !pendingIds.has(item.id)));
      offlineQueueRef.current = offlineQueueRef.current.filter((item) => !pendingIds.has(item.id));

      setOrders((prev) =>
        prev.map((o) =>
          pendingIds.has(o.id)
            ? { ...o, syncStatus: 'synced', syncedAt: syncedIso }
            : o
        )
      );

      setBranches((prev) =>
        prev.map((b) => ({ ...b, syncStatus: 'synced', lastSyncAt: syncedTimeLabel }))
      );
      setLastSyncTime(syncedTimeLabel);
      safeLocalStorageSet('kadi_pos_last_sync_time', syncedTimeLabel);

      const syncedCount = syncingQueue.length;
      setLastOfflineSyncResult({ syncedCount, syncedAt: syncedIso });

      addActivityLog({
        category: 'system',
        title: `مزامنة تلقائية للمبيعات المحفوظة أوفلاين (${syncedCount} ${syncedCount === 1 ? 'فاتورة' : 'فواتير'})`,
        description: `تم رفع ومزامنة ${syncedCount} عملية بيع كانت محفوظة مؤقتاً في IndexedDB فور استعادة الاتصال بالإنترنت`,
        actor: currentUser.name,
        actorRole: currentUser.role,
        severity: 'success'
      });

      if (settings.enableSoundEffects) {
        playSound('success');
      }

      return { syncedCount };
    } catch {
      const revertedQueue: OfflineSaleQueueItem[] = syncingQueue.map((item) => ({
        ...item,
        status: 'pending',
        error: 'بانتظار استقرار الاتصال بالإنترنت'
      }));
      setOfflineSalesQueue(revertedQueue);
      offlineQueueRef.current = revertedQueue;
      void saveOfflineSalesQueue(revertedQueue);

      setOrders((prev) =>
        prev.map((o) => (pendingIds.has(o.id) ? { ...o, syncStatus: 'pending_sync' } : o))
      );

      return { syncedCount: 0 };
    } finally {
      setIsSyncingOfflineSales(false);
      syncInFlightRef.current = false;
    }
  }, [currentUser.name, currentUser.role, settings.enableSoundEffects]);

  // Hydrate orders & offline sales queue from IndexedDB on mount + auto-sync if already online
  useEffect(() => {
    let cancelled = false;

    Promise.all([loadOrdersFromIndexedDB(), loadOfflineSalesQueue()]).then(
      ([dbOrders, dbQueue]) => {
        if (cancelled) return;
        if (dbOrders && dbOrders.length > 0) {
          setOrders(dbOrders);
        }
        ordersHydratedRef.current = true;

        if (dbQueue.length > 0) {
          setOfflineSalesQueue(dbQueue);
          offlineQueueRef.current = dbQueue;
          if (typeof navigator === 'undefined' || navigator.onLine) {
            void syncPendingOfflineSales();
          }
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [syncPendingOfflineSales]);

  // Expenses State (إدارة المصاريف: كراء، كهرباء، نقل، شراء بضاعة، أخرى)
  const [expenses, setExpenses] = useState<Expense[]>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_expenses_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const expensesHydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadExpensesFromIndexedDB().then((dbExpenses) => {
      if (cancelled) return;
      if (dbExpenses && dbExpenses.length > 0) {
        setExpenses(dbExpenses);
      }
      expensesHydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    safeLocalStorageSet('kadi_pos_expenses_v1', JSON.stringify(expenses));
    if (expensesHydratedRef.current) {
      void saveExpensesToIndexedDB(expenses);
    }
  }, [expenses]);

  const addExpense = (data: Omit<Expense, 'id' | 'createdAt'>): Expense => {
    const nowIso = new Date().toISOString();
    const newExpense: Expense = {
      ...data,
      name: data.name.trim(),
      amount: Math.max(0, Number(data.amount) || 0),
      date: data.date || nowIso.slice(0, 10),
      recordedBy: data.recordedBy || currentUser.name,
      branchId: data.branchId || activeBranchId,
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: nowIso
    };

    setExpenses((prev) => {
      const next = [newExpense, ...prev];
      void saveExpensesToIndexedDB(next);
      return next;
    });

    const catLabel = getExpenseCategoryLabel(newExpense.category, 'ar');
    addActivityLog({
      category: 'system',
      title: `تسجيل مصروف (${catLabel}): ${newExpense.name}`,
      description: `تم تسجيل مصروف "${newExpense.name}" بمبلغ ${newExpense.amount.toFixed(2)} ${settings.currencySymbol} بتاريخ ${newExpense.date}`,
      actor: currentUser.name,
      actorRole: currentUser.role,
      amount: newExpense.amount,
      severity: 'info'
    });

    if (settings.enableSoundEffects) {
      playSound('click');
    }

    return newExpense;
  };

  const updateExpense = (id: string, updated: Partial<Expense>) => {
    setExpenses((prev) => {
      const next = prev.map((e) =>
        e.id === id
          ? {
              ...e,
              ...updated,
              amount: updated.amount !== undefined ? Math.max(0, Number(updated.amount) || 0) : e.amount
            }
          : e
      );
      void saveExpensesToIndexedDB(next);
      return next;
    });
  };

  const deleteExpense = (id: string) => {
    setExpenses((prev) => {
      const next = prev.filter((e) => e.id !== id);
      void saveExpensesToIndexedDB(next);
      return next;
    });
    if (settings.enableSoundEffects) {
      playSound('click');
    }
  };

  // ==========================================================
  // Supplier Purchase Invoices (فواتير الموردين ومشتريات السلعة)
  // ==========================================================
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_supplier_invoices_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const supplierHydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadSupplierInvoicesFromIndexedDB().then((idbInv) => {
      if (cancelled) return;
      if (idbInv && idbInv.length > 0) {
        setSupplierInvoices(idbInv);
      }
      supplierHydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    safeLocalStorageSet('kadi_pos_supplier_invoices_v1', JSON.stringify(supplierInvoices));
    if (supplierHydratedRef.current) {
      void saveSupplierInvoicesToIndexedDB(supplierInvoices);
    }
  }, [supplierInvoices]);

  const addSupplierInvoice = (
    data: Omit<SupplierInvoice, 'id' | 'createdAt' | 'status'>
  ): SupplierInvoice => {
    const total = Math.max(0, Number(data.totalAmount) || 0);
    const paid = Math.min(total, Math.max(0, Number(data.paidAmount) || 0));
    const status: SupplierInvoice['status'] =
      paid >= total && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    const nowIso = new Date().toISOString();
    const inv: SupplierInvoice = {
      ...data,
      totalAmount: total,
      paidAmount: paid,
      status,
      recordedBy: data.recordedBy || currentUser.name,
      id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: nowIso
    };
    setSupplierInvoices((prev) => {
      const next = [inv, ...prev];
      void saveSupplierInvoicesToIndexedDB(next);
      return next;
    });
    addActivityLog({
      category: 'system',
      title: `فاتورة مورد جديدة (${inv.supplierName})`,
      description: `فاتورة رقم ${inv.invoiceNumber} بمبلغ ${total.toFixed(2)} ${settings.currencySymbol} (المؤدى: ${paid.toFixed(2)})`,
      actor: currentUser.name,
      actorRole: currentUser.role,
      amount: total,
      severity: 'info'
    });
    if (settings.enableSoundEffects) playSound('click');
    return inv;
  };

  const paySupplierInvoice = (invoiceId: string, amount: number) => {
    const clean = Math.max(0, Number(amount) || 0);
    if (clean <= 0) return;
    setSupplierInvoices((prev) => {
      const next = prev.map((inv) => {
        if (inv.id !== invoiceId) return inv;
        const nextPaid = Math.min(inv.totalAmount, Number((inv.paidAmount + clean).toFixed(2)));
        const nextStatus: SupplierInvoice['status'] =
          nextPaid >= inv.totalAmount ? 'paid' : nextPaid > 0 ? 'partial' : 'unpaid';
        return { ...inv, paidAmount: nextPaid, status: nextStatus };
      });
      void saveSupplierInvoicesToIndexedDB(next);
      return next;
    });
    if (settings.enableSoundEffects) playSound('success');
  };

  const deleteSupplierInvoice = (invoiceId: string) => {
    setSupplierInvoices((prev) => {
      const next = prev.filter((i) => i.id !== invoiceId);
      void saveSupplierInvoicesToIndexedDB(next);
      return next;
    });
    if (settings.enableSoundEffects) playSound('click');
  };

  // ==========================================================
  // Remote Sales, Delivery Zones & WhatsApp Orders (البيع عن بعد)
  // ==========================================================
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_delivery_zones_v1');
      return saved ? JSON.parse(saved) : DEFAULT_DELIVERY_ZONES;
    } catch {
      return DEFAULT_DELIVERY_ZONES;
    }
  });
  const deliveryZonesHydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadDeliveryZonesFromIndexedDB().then((idbZones) => {
      if (cancelled) return;
      if (idbZones && idbZones.length > 0) {
        setDeliveryZones(idbZones);
      } else {
        void saveDeliveryZonesToIndexedDB(deliveryZones);
      }
      deliveryZonesHydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    safeLocalStorageSet('kadi_pos_delivery_zones_v1', JSON.stringify(deliveryZones));
    if (deliveryZonesHydratedRef.current) {
      void saveDeliveryZonesToIndexedDB(deliveryZones);
    }
  }, [deliveryZones]);

  const addDeliveryZone = (zone: Omit<DeliveryZone, 'id'>): DeliveryZone => {
    const newZone: DeliveryZone = {
      ...zone,
      name: zone.name.trim(),
      fee: Math.max(0, Number(zone.fee) || 0),
      id: `zone-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
    };
    setDeliveryZones((prev) => [...prev, newZone]);
    if (settings.enableSoundEffects) playSound('click');
    return newZone;
  };

  const updateDeliveryZone = (id: string, updated: Partial<DeliveryZone>) => {
    setDeliveryZones((prev) =>
      prev.map((z) =>
        z.id === id
          ? {
              ...z,
              ...updated,
              fee: updated.fee !== undefined ? Math.max(0, Number(updated.fee) || 0) : z.fee
            }
          : z
      )
    );
  };

  const deleteDeliveryZone = (id: string) => {
    setDeliveryZones((prev) => prev.filter((z) => z.id !== id));
    if (settings.enableSoundEffects) playSound('click');
  };

  const [remoteOrders, setRemoteOrders] = useState<RemoteOrder[]>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_remote_orders_v1');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [
      {
        id: 'rem-demo-1',
        orderNumber: 'WA-1001',
        createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
        customerName: 'خديجة بنعلي',
        customerPhone: '+212661445588',
        customerAddress: 'حي السعادة زنقة 4 رقم 12',
        deliveryZoneId: 'zone-center',
        deliveryZoneName: 'المركز',
        deliveryFee: 5,
        items: [
          {
            productId: 'prod-1',
            productName: 'زيت زيتون واد سوس بكر ممتاز (1 لتر)',
            price: 82.0,
            costPrice: 64.0,
            quantity: 1,
            total: 82.0
          },
          {
            productId: 'prod-4',
            productName: 'شاي أخضر الصويري ممتاز (200g)',
            price: 16.5,
            costPrice: 12.0,
            quantity: 2,
            total: 33.0
          }
        ],
        itemsSubtotal: 115.0,
        grandTotal: 120.0,
        status: 'new',
        notes: 'توصيل قبل المغرب من فضلكم',
        source: 'catalog_link'
      }
    ];
  });
  const remoteOrdersHydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadRemoteOrdersFromIndexedDB().then((idbRemote) => {
      if (cancelled) return;
      if (idbRemote && idbRemote.length > 0) {
        setRemoteOrders(idbRemote);
      } else {
        void saveRemoteOrdersToIndexedDB(remoteOrders);
      }
      remoteOrdersHydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    safeLocalStorageSet('kadi_pos_remote_orders_v1', JSON.stringify(remoteOrders));
    if (remoteOrdersHydratedRef.current) {
      void saveRemoteOrdersToIndexedDB(remoteOrders);
    }
  }, [remoteOrders]);

  // Cross-tab real-time sync for incoming catalog orders (BroadcastChannel + storage event)
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel(REMOTE_ORDERS_CHANNEL);
        bc.onmessage = (ev: MessageEvent) => {
          const payload = ev.data as { type?: string; order?: RemoteOrder } | null;
          if (payload?.type === 'NEW_REMOTE_ORDER' && payload.order) {
            const incoming = payload.order;
            setRemoteOrders((prev) =>
              prev.some((r) => r.id === incoming.id) ? prev : [incoming, ...prev]
            );
          }
        };
      }
    } catch {
      // ignore BroadcastChannel errors
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'kadi_pos_remote_orders_v1' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as RemoteOrder[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRemoteOrders((prev) => {
              const existingIds = new Set(prev.map((r) => r.id));
              const newOnes = parsed.filter((r) => !existingIds.has(r.id));
              return newOnes.length > 0 ? [...newOnes, ...prev] : prev;
            });
          }
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      if (bc) bc.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const createRemoteOrder = (
    data: Omit<RemoteOrder, 'id' | 'orderNumber' | 'createdAt' | 'status'>
  ): RemoteOrder => {
    const newRemote: RemoteOrder = {
      ...data,
      id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      orderNumber: `WA-${1000 + remoteOrders.length + 1}`,
      createdAt: new Date().toISOString(),
      status: 'new'
    };
    setRemoteOrders((prev) => [newRemote, ...prev]);
    if (settings.enableSoundEffects) playSound('success');
    addActivityLog({
      category: 'system',
      title: `طلب جديد عن بعد (${newRemote.orderNumber})`,
      description: `طلب من ${newRemote.customerName} (${newRemote.deliveryZoneName}) بقيمة ${newRemote.grandTotal.toFixed(2)} ${settings.currencySymbol}`,
      actor: newRemote.customerName,
      actorRole: 'cashier',
      amount: newRemote.grandTotal,
      severity: 'info'
    });
    return newRemote;
  };

  const acceptRemoteOrderToInvoice = (
    remoteOrderId: string,
    paymentMethod: PaymentMethod = 'cash'
  ): { success: boolean; order?: Order; message?: string } => {
    const target = remoteOrders.find((r) => r.id === remoteOrderId);
    if (!target) return { success: false, message: 'الطلب غير موجود' };
    if (target.linkedOrderId) {
      const existingOrder = orders.find((o) => o.id === target.linkedOrderId);
      return { success: true, order: existingOrder, message: 'تم تحويل الطلب مسبقاً لفاتورة' };
    }

    const orderDate = new Date().toISOString();
    const orderNum = `#KD-${1000 + orders.length + 1}`;

    const orderItems = target.items.map((it) => {
      const catalogProd = products.find((p) => p.id === it.productId);
      const unitCost = catalogProd ? catalogProd.costPrice : it.costPrice || it.price * 0.72;
      return {
        productId: it.productId,
        productName: it.productName,
        price: it.price,
        costPrice: unitCost,
        quantity: it.quantity,
        total: Number((it.price * it.quantity).toFixed(2)),
        discount: 0
      };
    });

    const subtotal = Number(orderItems.reduce((s, i) => s + i.total, 0).toFixed(2));
    const deliveryFee = Math.max(0, Number(target.deliveryFee) || 0);
    const costTotal = Number(
      orderItems.reduce((s, i) => s + i.costPrice * i.quantity, 0).toFixed(2)
    );
    const taxTotal = 0;
    const grandTotal = Number((subtotal + deliveryFee).toFixed(2));
    const profitTotal = Number((subtotal - costTotal).toFixed(2));

    const zatcaQr = generateZatcaTlvBase64(
      settings.storeName,
      settings.taxNumber,
      orderDate,
      grandTotal.toString(),
      taxTotal.toString()
    );

    const onlineNow = typeof navigator !== 'undefined' ? navigator.onLine : isOnline;

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      orderNumber: orderNum,
      date: orderDate,
      branchId: activeBranch.id,
      branchName: activeBranch.name,
      items: orderItems,
      subtotal,
      discountTotal: 0,
      taxTotal,
      grandTotal,
      costTotal,
      profitTotal,
      paymentMethod,
      amountTendered: grandTotal,
      changeAmount: 0,
      cashierName: currentShift.cashierName || currentUser.name,
      customerName: target.customerName,
      customerPhone: target.customerPhone,
      customerAddress: target.customerAddress,
      deliveryFee,
      deliveryZoneName: target.deliveryZoneName,
      remoteOrderId: target.id,
      status: 'completed',
      note: `طلب عن بعد ${target.orderNumber} · التوصيل: ${target.deliveryZoneName} (${deliveryFee.toFixed(2)} ${settings.currencySymbol})${target.notes ? ` · ${target.notes}` : ''}`,
      zatcaQrString: zatcaQr,
      syncStatus: onlineNow ? 'synced' : 'pending_sync',
      createdOffline: !onlineNow,
      syncedAt: onlineNow ? orderDate : undefined
    };

    setOrders((prev) => [newOrder, ...prev]);

    // Deduct product stock and record stock movements
    setProducts((prev) =>
      prev.map((prod) => {
        const line = orderItems.find((li) => li.productId === prod.id);
        if (!line) return prod;
        const prevStock = prod.stock;
        const newStock = Math.max(0, Number((prod.stock - line.quantity).toFixed(2)));
        const movement: StockMovement = {
          id: `mov-${Date.now()}-${prod.id}`,
          productId: prod.id,
          productName: prod.name,
          date: orderDate,
          type: 'sale',
          quantityChange: -line.quantity,
          previousStock: prevStock,
          newStock,
          unit: prod.unitType || 'piece',
          costPerUnit: prod.costPrice,
          orderNumber: orderNum,
          reason: `تحويل طلب عن بعد ${target.orderNumber} إلى فاتورة ${orderNum}`
        };
        setStockMovements((mPrev) => [movement, ...mPrev]);
        return { ...prod, stock: newStock };
      })
    );

    // Update remote order to link the invoice and move status to on_the_way
    setRemoteOrders((prev) =>
      prev.map((r) =>
        r.id === remoteOrderId
          ? {
              ...r,
              status: r.status === 'new' ? 'on_the_way' : r.status,
              linkedOrderId: newOrder.id,
              linkedOrderNumber: newOrder.orderNumber
            }
          : r
      )
    );

    addActivityLog({
      category: 'sale_large',
      title: `قبول طلب عن بعد ${target.orderNumber} ← ${orderNum}`,
      description: `تم تحويل طلب ${target.customerName} إلى فاتورة ${orderNum} مع إضافة رسوم التوصيل (${deliveryFee.toFixed(2)} ${settings.currencySymbol})`,
      actor: currentUser.name,
      actorRole: currentUser.role,
      amount: grandTotal,
      severity: 'success',
      metadata: { orderNumber: orderNum }
    });

    if (settings.enableSoundEffects) playSound('success');
    return { success: true, order: newOrder };
  };

  const updateRemoteOrderStatus = (remoteOrderId: string, status: RemoteOrderStatus) => {
    setRemoteOrders((prev) =>
      prev.map((r) => (r.id === remoteOrderId ? { ...r, status } : r))
    );
    if (settings.enableSoundEffects) playSound('click');
  };

  const deleteRemoteOrder = (remoteOrderId: string) => {
    setRemoteOrders((prev) => prev.filter((r) => r.id !== remoteOrderId));
    if (settings.enableSoundEffects) playSound('click');
  };

  const markRemoteOrderDeliveredAndCollected = (remoteOrderId: string, courierName?: string) => {
    const nowIso = new Date().toISOString();
    const target = remoteOrders.find((r) => r.id === remoteOrderId);
    const courier = courierName || currentUser.name;
    setRemoteOrders((prev) =>
      prev.map((r) =>
        r.id === remoteOrderId
          ? {
              ...r,
              status: 'delivered',
              collectedOnDelivery: true,
              assignedCourierName: courier,
              deliveredAt: nowIso
            }
          : r
      )
    );
    if (target) {
      addActivityLog({
        category: 'sale_large',
        title: `توصيل وتحصيل طلب عن بعد (${target.orderNumber})`,
        description: `قام الموزّع ${courier} بتسليم طلب ${target.customerName} وتحصيل ${target.grandTotal.toFixed(2)} ${settings.currencySymbol}`,
        actor: courier,
        actorRole: currentUser.role,
        amount: target.grandTotal,
        severity: 'success'
      });
    }
    if (settings.enableSoundEffects) playSound('success');
  };

  // ==========================================================
  // Moroccan CPU Tax, AMO & CNSS Retirement (ضرائبي CPU)
  // ==========================================================
  const cpuSettings: CpuTaxSettings = useMemo(() => {
    return settings.cpuSettings
      ? {
          ...DEFAULT_CPU_SETTINGS,
          ...settings.cpuSettings,
          cnssBrackets:
            settings.cpuSettings.cnssBrackets && settings.cpuSettings.cnssBrackets.length > 0
              ? settings.cpuSettings.cnssBrackets
              : DEFAULT_CPU_SETTINGS.cnssBrackets
        }
      : DEFAULT_CPU_SETTINGS;
  }, [settings.cpuSettings]);

  const [cpuRecords, setCpuRecords] = useState<CpuQuarterRecord[]>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_cpu_records_v1');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return createInitialCpuRecords(DEFAULT_CPU_SETTINGS);
  });
  const cpuHydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadCpuRecordsFromIndexedDB().then((idbRecs) => {
      if (cancelled) return;
      if (idbRecs && idbRecs.length > 0) {
        setCpuRecords(idbRecs);
      } else {
        void saveCpuRecordsToIndexedDB(cpuRecords);
      }
      cpuHydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    safeLocalStorageSet('kadi_pos_cpu_records_v1', JSON.stringify(cpuRecords));
    if (cpuHydratedRef.current) {
      void saveCpuRecordsToIndexedDB(cpuRecords);
    }
  }, [cpuRecords]);

  const updateCpuSettings = (updated: Partial<CpuTaxSettings>) => {
    const nextCpu: CpuTaxSettings = {
      ...cpuSettings,
      ...updated
    };
    updateSettings({ cpuSettings: nextCpu });

    // Recalculate unpaid quarters automatically to stay in sync with new rates/brackets
    setCpuRecords((prev) =>
      prev.map((rec) => {
        if (rec.status === 'paid') return rec;
        return buildCpuQuarterRecord(rec.year, rec.quarter, rec.turnover, nextCpu, {
          retirementEnabled:
            updated.retirementEnabled !== undefined
              ? updated.retirementEnabled
              : rec.retirementEnabled,
          status: rec.status,
          notes: rec.notes
        });
      })
    );
  };

  const upsertCpuQuarterTurnover = (
    year: number,
    quarter: CpuQuarterId,
    turnover: number,
    retirementEnabled?: boolean,
    notes?: string
  ): CpuQuarterRecord => {
    const existing = cpuRecords.find((r) => r.year === year && r.quarter === quarter);
    const retFlag =
      retirementEnabled !== undefined
        ? retirementEnabled
        : existing
        ? existing.retirementEnabled
        : cpuSettings.retirementEnabled;
    const record = buildCpuQuarterRecord(year, quarter, turnover, cpuSettings, {
      retirementEnabled: retFlag,
      status: existing?.status || 'unpaid',
      paidAt: existing?.paidAt,
      notes: notes !== undefined ? notes : existing?.notes
    });

    setCpuRecords((prev) => {
      const idx = prev.findIndex((r) => r.id === record.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = record;
        return copy;
      }
      return [record, ...prev].sort((a, b) => b.year - a.year || b.quarter.localeCompare(a.quarter));
    });

    if (settings.enableSoundEffects) playSound('click');
    return record;
  };

  const toggleCpuQuarterRetirement = (recordId: string, enabled: boolean) => {
    setCpuRecords((prev) =>
      prev.map((rec) => {
        if (rec.id !== recordId) return rec;
        return buildCpuQuarterRecord(rec.year, rec.quarter, rec.turnover, cpuSettings, {
          retirementEnabled: enabled,
          status: rec.status,
          paidAt: rec.paidAt,
          notes: rec.notes
        });
      })
    );
    if (settings.enableSoundEffects) playSound('click');
  };

  const markCpuQuarterPaid = (recordId: string, paid: boolean = true) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    setCpuRecords((prev) =>
      prev.map((rec) => {
        if (rec.id !== recordId) return rec;
        const nextStatus: 'paid' | 'unpaid' = paid ? 'paid' : 'unpaid';
        const nextRec: CpuQuarterRecord = {
          ...rec,
          status: nextStatus,
          paidAt: paid ? todayStr : undefined,
          retirementDaysCredited: paid && rec.retirementEnabled ? 90 : 0
        };
        return nextRec;
      })
    );
    const target = cpuRecords.find((r) => r.id === recordId);
    if (target && paid) {
      addActivityLog({
        category: 'system',
        title: `أداء واجبات CPU للتريمستر ${target.year}-${target.quarter}`,
        description: `تم تأكيد دفع مبلغ ${target.totalDue.toFixed(2)} ${settings.currencySymbol} (الضريبة + AMO${target.retirementEnabled ? ' + التقاعد' : ''})`,
        actor: currentUser.name,
        actorRole: currentUser.role,
        amount: target.totalDue,
        severity: 'success'
      });
    }
    if (settings.enableSoundEffects) playSound('success');
  };

  const deleteCpuQuarterRecord = (recordId: string) => {
    setCpuRecords((prev) => prev.filter((r) => r.id !== recordId));
    if (settings.enableSoundEffects) playSound('click');
  };

  const cpuAlerts = useMemo(
    () => getUpcomingCpuAlerts(cpuRecords, cpuSettings.alertDaysBeforeDue),
    [cpuRecords, cpuSettings.alertDaysBeforeDue]
  );

  const retirementProgress = useMemo(
    () => computeRetirementProgress(cpuRecords, cpuSettings.priorAccumulatedDays),
    [cpuRecords, cpuSettings.priorAccumulatedDays]
  );

  // Listen for browser online / offline events and automatically sync queued offline sales
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (offlineQueueRef.current.length > 0) {
        void syncPendingOfflineSales();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncPendingOfflineSales]);

  // Shifts State
  const [currentShift, setCurrentShift] = useState<Shift>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_current_shift');
      return saved ? JSON.parse(saved) : initialShift;
    } catch {
      return initialShift;
    }
  });

  const [shiftsHistory, setShiftsHistory] = useState<Shift[]>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_shifts_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('kadi_pos_current_shift', JSON.stringify(currentShift));
  }, [currentShift]);

  useEffect(() => {
    localStorage.setItem('kadi_pos_shifts_history', JSON.stringify(shiftsHistory));
  }, [shiftsHistory]);

  const openNewShift = (startingCash: number, cashierName: string) => {
    const newShiftNum = (currentShift?.shiftNumber || 100) + 1;
    const newShift: Shift = {
      id: `shift-${Date.now()}`,
      shiftNumber: newShiftNum,
      cashierName: cashierName || 'كاشير كادي',
      openedAt: new Date().toISOString(),
      startingCash,
      status: 'open',
      cashTransactions: []
    };
    setCurrentShift(newShift);
    if (settings.enableSoundEffects) {
      playSound('drawer');
    }
  };

  const closeCurrentShift = (
    actualCashCounted: number,
    options?: {
      closingNotes?: string;
      denominationBreakdown?: Record<string, number>;
      includeCreditCollectionsInExpectedCash?: boolean;
      retainedFloatForNextDay?: number;
      reopenNextShiftWithRetainedFloat?: boolean;
    }
  ): Shift => {
    // Calculate totals for current shift from orders placed during this shift
    const shiftStartTime = new Date(currentShift.openedAt).getTime();
    const shiftStartDateStr = currentShift.openedAt.slice(0, 10);
    const shiftOrders = orders.filter(
      (o) => new Date(o.date).getTime() >= shiftStartTime && o.status === 'completed'
    );
    const shiftRefundOrders = orders.filter(
      (o) =>
        new Date(o.date).getTime() >= shiftStartTime &&
        (o.status === 'refunded' || o.status === 'partially_refunded')
    );

    let totalCashSales = 0;
    let totalCardSales = 0;
    let totalApplePaySales = 0;
    let totalCreditSales = 0;
    let grossSales = 0;
    let taxesCollected = 0;
    let totalCostOfGoods = 0;

    shiftOrders.forEach((o) => {
      grossSales += o.grandTotal;
      taxesCollected += o.taxTotal;
      totalCostOfGoods += o.costTotal || 0;

      if (o.paymentMethod === 'cash') {
        totalCashSales += o.grandTotal;
      } else if (o.paymentMethod === 'card') {
        totalCardSales += o.grandTotal;
      } else if (o.paymentMethod === 'apple_pay') {
        totalApplePaySales += o.grandTotal;
      } else if (o.paymentMethod === 'credit') {
        totalCreditSales += o.grandTotal;
      } else if (o.paymentMethod === 'split' && o.splitDetails) {
        totalCashSales += o.splitDetails.cash || 0;
        totalCardSales += o.splitDetails.card || 0;
        totalApplePaySales += o.splitDetails.applePay || 0;
      }
    });

    const totalRefunds = shiftRefundOrders.reduce(
      (sum, o) => sum + (o.refundedAmount || o.grandTotal),
      0
    );

    const creditCollectionsCash = creditTransactions
      .filter((tx) => tx.type === 'payment' && new Date(tx.date).getTime() >= shiftStartTime)
      .reduce((sum, tx) => sum + tx.amount, 0);

    const shiftExpenses = expenses
      .filter(
        (e) =>
          new Date(e.createdAt).getTime() >= shiftStartTime ||
          e.date >= shiftStartDateStr
      )
      .reduce((sum, e) => sum + e.amount, 0);

    let payIns = 0;
    let payOuts = 0;
    (currentShift.cashTransactions || []).forEach((tx) => {
      if (tx.type === 'pay_in') payIns += tx.amount;
      if (tx.type === 'pay_out') payOuts += tx.amount;
    });

    const includeCredit = !!options?.includeCreditCollectionsInExpectedCash;
    const expectedCash = Number(
      (
        currentShift.startingCash +
        totalCashSales +
        payIns -
        payOuts +
        (includeCredit ? creditCollectionsCash : 0)
      ).toFixed(2)
    );
    const discrepancy = Number((actualCashCounted - expectedCash).toFixed(2));
    const netSales = Number((grossSales - taxesCollected).toFixed(2));
    const grossProfit = Number((netSales - totalCostOfGoods).toFixed(2));
    const netProfit = Number((grossProfit - shiftExpenses).toFixed(2));
    const retainedFloatForNextDay = Number(
      Math.max(0, options?.retainedFloatForNextDay ?? 0).toFixed(2)
    );
    const merchantWithdrawnCash = Number(
      Math.max(0, actualCashCounted - retainedFloatForNextDay).toFixed(2)
    );

    const closedShift: Shift = {
      ...currentShift,
      status: 'closed',
      closedAt: new Date().toISOString(),
      actualCashCounted,
      expectedCash,
      discrepancy,
      totalCashSales: Number(totalCashSales.toFixed(2)),
      totalCardSales: Number(totalCardSales.toFixed(2)),
      totalApplePaySales: Number(totalApplePaySales.toFixed(2)),
      totalCreditSales: Number(totalCreditSales.toFixed(2)),
      totalRefunds: Number(totalRefunds.toFixed(2)),
      grossSales: Number(grossSales.toFixed(2)),
      netSales,
      taxesCollected: Number(taxesCollected.toFixed(2)),
      totalCostOfGoods: Number(totalCostOfGoods.toFixed(2)),
      grossProfit,
      totalExpenses: Number(shiftExpenses.toFixed(2)),
      netProfit,
      creditCollectionsCash: Number(creditCollectionsCash.toFixed(2)),
      includedCreditInExpectedCash: includeCredit,
      denominationBreakdown: options?.denominationBreakdown,
      closingNotes: options?.closingNotes?.trim() || undefined,
      retainedFloatForNextDay,
      merchantWithdrawnCash
    };

    setShiftsHistory((prev) => [closedShift, ...prev]);

    if (options?.reopenNextShiftWithRetainedFloat) {
      const nextShift: Shift = {
        id: `shift-${Date.now() + 1}`,
        shiftNumber: (currentShift?.shiftNumber || 100) + 1,
        cashierName: currentShift.cashierName || 'كاشير كادي',
        openedAt: new Date().toISOString(),
        startingCash: retainedFloatForNextDay,
        status: 'open',
        cashTransactions: []
      };
      setCurrentShift(nextShift);
    } else {
      setCurrentShift(closedShift);
    }

    addActivityLog({
      category: 'system',
      title: `إغلاق الصندوق آخر النهار (#${currentShift.shiftNumber})`,
      description: `المبيعات: ${grossSales.toFixed(2)} ${settings.currencySymbol} | الربح الصافي: ${netProfit.toFixed(2)} ${settings.currencySymbol} | المتوقع: ${expectedCash.toFixed(2)} | المعدود: ${actualCashCounted.toFixed(2)} (${discrepancy === 0 ? 'مقاد 100%' : discrepancy > 0 ? `فائض +${discrepancy.toFixed(2)}` : `عجز ${discrepancy.toFixed(2)}`}) | فوندو الغد: ${retainedFloatForNextDay.toFixed(2)} | مسحوب التاجر: ${merchantWithdrawnCash.toFixed(2)}`,
      actor: currentUser.name,
      actorRole: currentUser.role,
      amount: netProfit,
      severity: discrepancy < 0 ? 'warning' : 'success'
    });

    const theftCfg = getTheftConfig();
    if (
      theftCfg.enabled &&
      discrepancy < 0 &&
      Math.abs(discrepancy) >= theftCfg.cashShortageThreshold
    ) {
      const shortage = Math.abs(discrepancy);
      raiseTheftAlert({
        category: 'cash_discrepancy',
        severity: 'critical',
        title: `عجز خطير في صندوق الوردية #${currentShift.shiftNumber} (-${shortage.toFixed(2)} ${settings.currencySymbol})`,
        description: `النقد المتوقع: ${expectedCash.toFixed(2)} ${settings.currencySymbol} بينما النقد المعدود الفعلي: ${actualCashCounted.toFixed(2)} ${settings.currencySymbol}. العجز المكتشف: ${shortage.toFixed(2)} ${settings.currencySymbol}.`,
        amountAtRisk: shortage,
        playSiren: true
      });
    }

    if (settings.enableSoundEffects) {
      playSound('drawer');
    }

    return closedShift;
  };

  const addCashTransaction = (type: 'pay_in' | 'pay_out', amount: number, reason: string) => {
    const newTx: CashTransaction = {
      id: `tx-${Date.now()}`,
      date: new Date().toISOString(),
      type,
      amount,
      reason,
      cashierName: currentShift.cashierName
    };

    setCurrentShift((prev) => ({
      ...prev,
      cashTransactions: [...(prev.cashTransactions || []), newTx]
    }));

    const theftCfg = getTheftConfig();
    if (
      theftCfg.enabled &&
      type === 'pay_out' &&
      amount >= theftCfg.suspiciousPayoutThreshold
    ) {
      raiseTheftAlert({
        category: 'suspicious_payout',
        severity: amount >= theftCfg.suspiciousPayoutThreshold * 2 || currentUser.role !== 'manager' ? 'critical' : 'high',
        title: `سحب نقدي كبير من الصندوق (${amount.toFixed(2)} ${settings.currencySymbol})`,
        description: `تم سحب مبلغ ${amount.toFixed(2)} ${settings.currencySymbol} من درج النقود. البيان المسجل: ${reason || 'غير محدد'}.`,
        amountAtRisk: amount,
        playSiren: amount >= theftCfg.suspiciousPayoutThreshold * 2 || currentUser.role !== 'manager'
      });
    }

    if (settings.enableSoundEffects) {
      playSound('drawer');
    }
  };

  // Held Tickets State
  const [heldTickets, setHeldTickets] = useState<HeldTicket[]>(() => {
    try {
      const saved = localStorage.getItem('kadi_pos_held_tickets');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('kadi_pos_held_tickets', JSON.stringify(heldTickets));
  }, [heldTickets]);

  const holdCurrentTicket = (title?: string, note?: string) => {
    if (cart.length === 0) return;

    const defaultTitle = selectedCustomer ? selectedCustomer.name : `طلب معلق #${heldTickets.length + 1}`;
    const newHeld: HeldTicket = {
      id: `held-${Date.now()}`,
      title: title?.trim() || defaultTitle,
      date: new Date().toISOString(),
      items: [...cart],
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name,
      note
    };

    setHeldTickets((prev) => [newHeld, ...prev]);
    clearCart();

    if (settings.enableSoundEffects) {
      playSound('click');
    }
  };

  const restoreHeldTicket = (ticketId: string) => {
    const ticket = heldTickets.find((t) => t.id === ticketId);
    if (!ticket) return;

    setCart(ticket.items);
    if (ticket.customerId) {
      const cust = customers.find((c) => c.id === ticket.customerId);
      if (cust) setSelectedCustomer(cust);
    }
    deleteHeldTicket(ticketId);

    if (settings.enableSoundEffects) {
      playSound('click');
    }
  };

  const deleteHeldTicket = (ticketId: string) => {
    setHeldTickets((prev) => prev.filter((t) => t.id !== ticketId));
  };

  // Checkout Completion
  const completeCheckout = (
    paymentMethod: PaymentMethod,
    splitDetails?: SplitPaymentDetail,
    amountTendered?: number,
    note?: string
  ): Order | null => {
    if (cart.length === 0) return null;

    const orderDate = new Date().toISOString();
    const orderNum = `#KD-${1000 + orders.length + 1}`;

    // Build order items
    const orderItems = cart.map((item) => {
      let lineBase = item.price * item.quantity;
      let lineDiscount = 0;
      if (item.itemDiscount) {
        if (item.itemDiscount.type === 'percent') {
          lineDiscount = (lineBase * item.itemDiscount.value) / 100;
        } else {
          lineDiscount = Math.min(lineBase, item.itemDiscount.value);
        }
      }
      return {
        productId: item.productId,
        productName: item.productName,
        price: item.price,
        costPrice: item.costPrice,
        quantity: item.quantity,
        variantName: item.variantName,
        modifiers: item.modifiers?.map((m) => m.name),
        total: Number((lineBase - lineDiscount).toFixed(2)),
        discount: Number(lineDiscount.toFixed(2))
      };
    });

    // ZATCA TLV Base64 String for Simplified Tax Invoice
    const zatcaQr = generateZatcaTlvBase64(
      settings.storeName,
      settings.taxNumber,
      orderDate,
      cartGrandTotal.toString(),
      cartTaxTotal.toString()
    );

    // Calculate Loyalty Points (1 point per 10 currency spent)
    const pointsEarned = Math.floor(cartGrandTotal / 10);

    const changeAmount = amountTendered && amountTendered > cartGrandTotal ? Number((amountTendered - cartGrandTotal).toFixed(2)) : 0;

    const onlineNow = typeof navigator !== 'undefined' ? navigator.onLine : isOnline;

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      orderNumber: orderNum,
      date: orderDate,
      branchId: activeBranch.id,
      branchName: activeBranch.name,
      items: orderItems,
      subtotal: cartSubtotal,
      discountTotal: cartDiscountTotal,
      taxTotal: cartTaxTotal,
      grandTotal: cartGrandTotal,
      costTotal: cartCostTotal,
      profitTotal: cartProfitTotal,
      paymentMethod,
      splitDetails,
      amountTendered: amountTendered || cartGrandTotal,
      changeAmount,
      cashierName: currentShift.cashierName,
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name,
      customerPhone: selectedCustomer?.phone,
      pointsEarned,
      status: 'completed',
      note,
      zatcaQrString: zatcaQr,
      syncStatus: onlineNow ? 'synced' : 'pending_sync',
      createdOffline: !onlineNow,
      syncedAt: onlineNow ? orderDate : undefined
    };

    // 1. Save order (persisted to IndexedDB + offline sync queue when offline)
    setOrders((prev) => [newOrder, ...prev]);
    setLastCompletedOrder(newOrder);

    if (!onlineNow) {
      const queueItem: OfflineSaleQueueItem = {
        id: newOrder.id,
        order: newOrder,
        queuedAt: orderDate,
        attempts: 0,
        status: 'pending'
      };
      offlineQueueRef.current = [queueItem, ...offlineQueueRef.current];
      setOfflineSalesQueue((prev) => [queueItem, ...prev]);
      void enqueueOfflineSale(queueItem);

      addActivityLog({
        category: 'system',
        title: `تخزين مبيعة أوفلاين في IndexedDB (${orderNum})`,
        description: `تم حفظ الفاتورة ${orderNum} بقيمة ${cartGrandTotal.toFixed(2)} ${settings.currencySymbol} محلياً في IndexedDB وستتم مزامنتها تلقائياً فور عودة الإنترنت`,
        actor: currentShift.cashierName || currentUser.name,
        actorRole: currentUser.role,
        amount: cartGrandTotal,
        severity: 'warning',
        metadata: {
          orderNumber: orderNum,
          details: 'وضع الأوفلاين (IndexedDB Queue)'
        }
      });
    }

    // 2. Deduct inventory stocks and record movements + detect critical <20% stock drops
    const newlyCriticalItems: { name: string; stock: number; threshold: number; unitType?: string }[] = [];
    setProducts((prev) =>
      prev.map((prod) => {
        const cartItemForProd = cart.filter((ci) => ci.productId === prod.id);
        if (cartItemForProd.length === 0) return prod;

        const totalDeduction = cartItemForProd.reduce((sum, ci) => sum + ci.quantity, 0);
        const prevStock = prod.stock;
        const newStock = Math.max(0, Number((prod.stock - totalDeduction).toFixed(2)));

        if (
          prod.lowStockThreshold > 0 &&
          newStock <= prod.lowStockThreshold * 0.2 &&
          prevStock > prod.lowStockThreshold * 0.2
        ) {
          newlyCriticalItems.push({
            name: prod.name,
            stock: newStock,
            threshold: prod.lowStockThreshold,
            unitType: prod.unitType
          });
        }

        // Update branch specific stock
        const currentBranchStocks = prod.branchStocks ? { ...prod.branchStocks } : {};
        const currentBranchStock = currentBranchStocks[activeBranch.id] !== undefined ? currentBranchStocks[activeBranch.id] : prod.stock;
        currentBranchStocks[activeBranch.id] = Math.max(0, Number((currentBranchStock - totalDeduction).toFixed(2)));

        // Record stock sale movement
        const movement: StockMovement = {
          id: `mov-${Date.now()}-${prod.id}`,
          productId: prod.id,
          productName: prod.name,
          date: orderDate,
          type: 'sale',
          quantityChange: -totalDeduction,
          previousStock: prevStock,
          newStock,
          unit: prod.unitType || 'piece',
          costPerUnit: prod.costPrice,
          orderNumber: orderNum,
          reason: `فاتورة بيع ${orderNum} (${activeBranch.code})`
        };
        setStockMovements((mPrev) => [movement, ...mPrev]);

        // Deduct from variants if applicable
        let updatedVariants = prod.variants;
        if (prod.hasVariants && prod.variants) {
          updatedVariants = prod.variants.map((v) => {
            const vCartItem = cartItemForProd.find((ci) => ci.variantId === v.id);
            if (vCartItem) {
              return { ...v, stock: Math.max(0, Number((v.stock - vCartItem.quantity).toFixed(2))) };
            }
            return v;
          });
        }

        return {
          ...prod,
          stock: newStock,
          variants: updatedVariants,
          branchStocks: currentBranchStocks
        };
      })
    );

    if (newlyCriticalItems.length > 0) {
      addActivityLog({
        category: 'inventory_major',
        title: `تنبيه نفاد حرج (< 20%): ${newlyCriticalItems.map((i) => i.name).slice(0, 2).join('، ')}`,
        description: `${newlyCriticalItems.length} منتج وصل إلى أقل من 20% من حد إعادة الطلب بعد الفاتورة ${orderNum}`,
        actor: currentShift.cashierName || currentUser.name,
        actorRole: currentUser.role,
        severity: 'warning'
      });
    }

    // 3. Update customer loyalty points & spend
    if (selectedCustomer) {
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.id === selectedCustomer.id) {
            const newTotalSpent = c.totalSpent + cartGrandTotal;
            const newPoints = c.points + pointsEarned;
            const newOrdersCount = c.ordersCount + 1;
            let tier: 'Silver' | 'Gold' | 'Platinum' = c.tier;
            if (newTotalSpent >= 3000) tier = 'Platinum';
            else if (newTotalSpent >= 1000) tier = 'Gold';

            // If credit payment method, add to customer balance
            const newBalance = paymentMethod === 'credit' ? c.balance + cartGrandTotal : c.balance;

            return {
              ...c,
              totalSpent: Number(newTotalSpent.toFixed(2)),
              points: newPoints,
              ordersCount: newOrdersCount,
              tier,
              balance: Number(newBalance.toFixed(2))
            };
          }
          return c;
        })
      );

      // Record credit ledger transaction if on-account purchase
      if (paymentMethod === 'credit') {
        const prevBal = selectedCustomer.balance;
        const newBal = Number((prevBal + cartGrandTotal).toFixed(2));
        const creditTx: CreditTransaction = {
          id: `cred-tx-${Date.now()}`,
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.name,
          type: 'debt',
          amount: cartGrandTotal,
          date: orderDate,
          notes: `مشتريات على الحساب (فاتورة #${orderNum})`,
          receiptNumber: orderNum,
          previousBalance: prevBal,
          newBalance: newBal,
          recordedBy: currentUser.name
        };
        setCreditTransactions((prev) => [creditTx, ...prev]);
      }
    }

    // 4. Play success register chime
    if (settings.enableSoundEffects) {
      playSound('success');
    }

    // 5. Document large sales (>= 200) in Activity Log
    if (cartGrandTotal >= 200) {
      addActivityLog({
        category: 'sale_large',
        title: `إتمام عملية بيع كبرى (${cartGrandTotal.toFixed(2)} ${settings.currencySymbol})`,
        description: `فاتورة ${orderNum} بقيمة إجمالية ${cartGrandTotal.toFixed(2)} ${settings.currencySymbol} تتضمن ${orderItems.length} صنف/أصناف (${paymentMethod === 'cash' ? 'نقداً' : paymentMethod === 'card' ? 'بطاقة بنكية' : paymentMethod === 'split' ? 'دفع مجزأ' : 'آجل'})`,
        actor: currentShift.cashierName || currentUser.name,
        actorRole: currentUser.role,
        amount: cartGrandTotal,
        severity: 'success',
        metadata: {
          orderNumber: orderNum,
          details: `الفرع: ${activeBranch.name} · العميل: ${selectedCustomer?.name || 'عميل نقدي'}`
        }
      });
    }

    // 6. Clear cart
    clearCart();

    return newOrder;
  };

  const refundOrder = (orderId: string, full: boolean, amount?: number) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    const refundAmount = full ? order.grandTotal : amount || order.grandTotal;

    // 1. Update order status
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id === orderId) {
          return {
            ...o,
            status: full ? 'refunded' : 'partially_refunded',
            refundedAmount: (o.refundedAmount || 0) + refundAmount
          };
        }
        return o;
      })
    );

    // 2. Restore stocks if full refund
    if (full) {
      setProducts((prev) =>
        prev.map((prod) => {
          const item = order.items.find((i) => i.productId === prod.id);
          if (item) {
            return {
              ...prod,
              stock: prod.stock + item.quantity
            };
          }
          return prod;
        })
      );
    }

    // 3. Document refund in Activity Log
    addActivityLog({
      category: 'sale_large',
      title: `استرجاع فاتورة (${refundAmount.toFixed(2)} ${settings.currencySymbol})`,
      description: `تم استرجاع مبلغ ${refundAmount.toFixed(2)} ${settings.currencySymbol} للفاتورة ${order.orderNumber} (${full ? 'استرجاع كامل وإعادة المخزون' : 'استرجاع جزئي'})`,
      actor: currentUser.name,
      actorRole: currentUser.role,
      amount: refundAmount,
      severity: 'warning',
      metadata: {
        orderNumber: order.orderNumber,
        details: full ? 'استرجاع كامل وإعادة المنتجات' : 'استرجاع جزئي'
      }
    });

    if (settings.enableSoundEffects) {
      playSound('drawer');
    }

    const theftCfg = getTheftConfig();
    if (
      theftCfg.enabled &&
      (refundAmount >= theftCfg.suspiciousRefundThreshold ||
        (currentUser.role !== 'manager' && refundAmount > 0))
    ) {
      raiseTheftAlert({
        category: 'suspicious_refund',
        severity:
          refundAmount >= theftCfg.suspiciousRefundThreshold * 2 || currentUser.role !== 'manager'
            ? 'critical'
            : 'high',
        title: `عملية استرجاع فاتورة مشبوهة (${order.orderNumber})`,
        description: `استرجاع بمبلغ ${refundAmount.toFixed(2)} ${settings.currencySymbol} (${full ? 'كامل الفاتورة' : 'جزئي'}) من طرف ${currentUser.name}.`,
        amountAtRisk: refundAmount,
        playSiren: refundAmount >= theftCfg.suspiciousRefundThreshold * 2
      });
    }
  };

  // Reset to Demo Data
  const resetToDemoData = () => {
    localStorage.clear();
    stopSecuritySiren();
    setIsSirenActive(false);

    setProducts(initialProducts);
    setCategories(initialCategories);
    setCustomers(initialCustomers);
    setCreditTransactions(initialCreditTransactions);
    setSettings(initialSettings);
    setCurrentShift(initialShift);
    setBranches(initialBranches);
    setActiveBranchIdState('branch-sefrou-main');
    setBranchTransfers(initialTransfers);
    setCart([]);
    setOrders([]);
    setExpenses([]);
    void saveExpensesToIndexedDB([]);
    setDeliveryZones(DEFAULT_DELIVERY_ZONES);
    void saveDeliveryZonesToIndexedDB(DEFAULT_DELIVERY_ZONES);
    setRemoteOrders([]);
    void saveRemoteOrdersToIndexedDB([]);
    const resetCpu = createInitialCpuRecords(DEFAULT_CPU_SETTINGS);
    setCpuRecords(resetCpu);
    void saveCpuRecordsToIndexedDB(resetCpu);
    setOfflineSalesQueue([]);
    offlineQueueRef.current = [];
    void clearOfflineSalesQueue();
    setHeldTickets([]);
    setSelectedCustomer(null);
    setActivityLogs(initialActivityLogs);
    setTheftAlerts([]);
    setActiveTheftToasts([]);
    setStocktakeHistory([]);
  };

  // Snapshot & Backup Helpers
  const [localSnapshotAt, setLocalSnapshotAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem('kadi_pos_snapshot_at');
    } catch {
      return null;
    }
  });

  const buildFullBackupObject = () => ({
    version: '1.1',
    exportedAt: new Date().toISOString(),
    settings,
    products,
    categories,
    customers,
    creditTransactions,
    orders,
    expenses,
    supplierInvoices,
    deliveryZones,
    remoteOrders,
    cpuRecords,
    branches,
    activeBranchId,
    branchTransfers,
    activityLogs,
    theftAlerts,
    stocktakeHistory,
    shiftsHistory: [currentShift, ...shiftsHistory]
  });

  // Export & Import Database JSON
  const exportDatabaseJson = () => {
    const nowIso = new Date().toISOString();
    const backup = buildFullBackupObject();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kadi_pos_backup_${nowIso.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    updateSettings({ lastBackupAt: nowIso });
    if (settings.enableSoundEffects) playSound('success');
  };

  const importDatabaseJson = (jsonStr: string): boolean => {
    try {
      const data = JSON.parse(jsonStr);
      if (data.products && Array.isArray(data.products)) {
        setProducts(data.products);
      }
      if (data.categories && Array.isArray(data.categories)) {
        setCategories(data.categories);
      }
      if (data.customers && Array.isArray(data.customers)) {
        setCustomers(data.customers);
      }
      if (data.creditTransactions && Array.isArray(data.creditTransactions)) {
        setCreditTransactions(data.creditTransactions);
      }
      if (data.settings) {
        setSettings(data.settings);
      }
      if (data.orders && Array.isArray(data.orders)) {
        setOrders(data.orders);
      }
      if (data.expenses && Array.isArray(data.expenses)) {
        setExpenses(data.expenses);
        void saveExpensesToIndexedDB(data.expenses);
      }
      if (data.supplierInvoices && Array.isArray(data.supplierInvoices)) {
        setSupplierInvoices(data.supplierInvoices);
        void saveSupplierInvoicesToIndexedDB(data.supplierInvoices);
      }
      if (data.deliveryZones && Array.isArray(data.deliveryZones)) {
        setDeliveryZones(data.deliveryZones);
        void saveDeliveryZonesToIndexedDB(data.deliveryZones);
      }
      if (data.remoteOrders && Array.isArray(data.remoteOrders)) {
        setRemoteOrders(data.remoteOrders);
        void saveRemoteOrdersToIndexedDB(data.remoteOrders);
      }
      if (data.cpuRecords && Array.isArray(data.cpuRecords)) {
        setCpuRecords(data.cpuRecords);
        void saveCpuRecordsToIndexedDB(data.cpuRecords);
      }
      if (data.branches && Array.isArray(data.branches)) {
        setBranches(data.branches);
      }
      if (data.branchTransfers && Array.isArray(data.branchTransfers)) {
        setBranchTransfers(data.branchTransfers);
      }
      if (data.activityLogs && Array.isArray(data.activityLogs)) {
        setActivityLogs(data.activityLogs);
      }
      if (data.theftAlerts && Array.isArray(data.theftAlerts)) {
        setTheftAlerts(data.theftAlerts);
      }
      if (data.stocktakeHistory && Array.isArray(data.stocktakeHistory)) {
        setStocktakeHistory(data.stocktakeHistory);
      }
      if (data.activeBranchId && typeof data.activeBranchId === 'string') {
        setActiveBranchIdState(data.activeBranchId);
      }
      return true;
    } catch {
      return false;
    }
  };

  const saveLocalSnapshot = (): { success: boolean; timestamp: string } => {
    const timestamp = new Date().toISOString();
    try {
      const snapshot = buildFullBackupObject();
      safeLocalStorageSet('kadi_pos_local_snapshot_v1', JSON.stringify(snapshot));
      safeLocalStorageSet('kadi_pos_snapshot_at', timestamp);
      setLocalSnapshotAt(timestamp);
      updateSettings({ lastBackupAt: timestamp });
      if (settings.enableSoundEffects) playSound('success');
      return { success: true, timestamp };
    } catch {
      return { success: false, timestamp };
    }
  };

  const restoreLocalSnapshot = (): boolean => {
    try {
      const raw = localStorage.getItem('kadi_pos_local_snapshot_v1');
      if (!raw) return false;
      const ok = importDatabaseJson(raw);
      if (ok && settings.enableSoundEffects) playSound('success');
      return ok;
    } catch {
      return false;
    }
  };

  return (
    <PosContext.Provider
      value={{
        currentTab,
        setCurrentTab,
        settings,
        updateSettings,
        currencySymbol: settings.currencySymbol,
        isDark,
        toggleTheme,
        language,
        toggleLanguage,
        users,
        currentUser,
        setCurrentUserId,
        addUser,
        updateUser,
        deleteUser,
        verifyManagerPin,
        isTabProtected,
        products,
        categories,
        addCategory,
        deleteCategory,
        updateCategory,
        addProduct,
        updateProduct,
        bulkUpdateProducts,
        deleteProduct,
        adjustStock,
        importProductsBulk,
        seedLargeCatalogDemo,
        stockMovements,
        stocktakeHistory,
        applyStocktakeSession,
        lowStockProducts,
        criticalLowStockProducts,
        expiringSoonProducts,
        notificationPermission,
        requestNotificationPermission,
        activeLowStockToasts,
        dismissLowStockToast,
        dismissAllLowStockToasts,
        triggerTestStockAlert,
        cart,
        addToCart,
        updateCartItemQuantity,
        setCartItemQuantity,
        removeCartItem,
        clearCart,
        applyCartItemDiscount,
        cartItemNote,
        overrideCartItemPrice,
        orderDiscount,
        setOrderDiscount,
        selectedCustomer,
        setSelectedCustomer,
        cartSubtotal,
        cartDiscountTotal,
        cartTaxTotal,
        cartGrandTotal,
        cartCostTotal,
        cartProfitTotal,
        cartProfitMarginPercent,
        orders,
        completeCheckout,
        recordVoiceSale,
        updateProductPurchaseCostAndRecalculateProfit,
        refundOrder,
        lastCompletedOrder,
        setLastCompletedOrder,
        heldTickets,
        holdCurrentTicket,
        restoreHeldTicket,
        deleteHeldTicket,
        customers,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        creditTransactions,
        addCreditDebt,
        settleCustomerCredit,
        updateCreditTransaction,
        deleteCreditTransaction,
      addCustomCreditEntry,
        rebuildCustomerCreditLedger,
        currentShift,
        openNewShift,
        closeCurrentShift,
        addCashTransaction,
        shiftsHistory,
        branches,
        activeBranchId,
        activeBranch,
        setActiveBranchId,
        addBranch,
        updateBranch,
        deleteBranch,
        branchTransfers,
        transferStockBetweenBranches,
        syncBranchData,
        isSyncing,
        lastSyncTime,
        isOnline,
        offlineSalesQueue,
        isSyncingOfflineSales,
        lastOfflineSyncResult,
        syncPendingOfflineSales,
        activityLogs,
        addActivityLog,
        clearActivityLogs,
        zakatSummary,
        expenses,
        addExpense,
        updateExpense,
        deleteExpense,
        deliveryZones,
        addDeliveryZone,
        updateDeliveryZone,
        deleteDeliveryZone,
        remoteOrders,
        createRemoteOrder,
        acceptRemoteOrderToInvoice,
        updateRemoteOrderStatus,
        deleteRemoteOrder,
        cpuSettings,
        updateCpuSettings,
        cpuRecords,
        upsertCpuQuarterTurnover,
        toggleCpuQuarterRetirement,
        markCpuQuarterPaid,
        deleteCpuQuarterRecord,
        cpuAlerts,
        retirementProgress,
        supplierInvoices,
        addSupplierInvoice,
        paySupplierInvoice,
        deleteSupplierInvoice,
        markRemoteOrderDeliveredAndCollected,
        allPalettes,
        activePalette,
        selectPalette,
        createCustomPalette,
        updateCustomPalette,
        deleteCustomPalette,
        localSnapshotAt,
        saveLocalSnapshot,
        restoreLocalSnapshot,
        theftAlerts,
        unresolvedTheftAlerts,
        activeTheftToasts,
        isSirenActive,
        stopActiveSecuritySiren,
        dismissTheftToast,
        raiseTheftAlert,
        triggerPanicTheftAlert,
        triggerTestTheftAlert,
        acknowledgeTheftAlert,
        acknowledgeAllTheftAlerts,
        clearAcknowledgedTheftAlerts,
        buildFullBackupObject,
        resetToDemoData,
        exportDatabaseJson,
        importDatabaseJson
      }}
    >
      {children}
    </PosContext.Provider>
  );
};

export const usePos = () => {
  const context = useContext(PosContext);
  if (!context) {
    throw new Error('usePos must be used within a PosProvider');
  }
  return context;
};
