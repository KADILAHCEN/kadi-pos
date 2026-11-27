import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Unsubscribe
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import {
  Category,
  ConnectedDeviceInfo,
  CreditTransaction,
  Customer,
  EmergencyOpeningSession,
  Expense,
  FirestoreCashState,
  Order,
  Product,
  Shift,
  SupplierInvoice,
  SupplierProfile
} from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { safeLocalStorageSet } from './storage';
import { RemiseBoxData, RemiseHistoryEntry, RemiseWallet } from './remiseVault';

export const FIRESTORE_COLLECTION = 'kadi_pos';
export const FIRESTORE_STORE_DOC_ID = 'store';
export const STORE_DOC_PATH = `${FIRESTORE_COLLECTION}/${FIRESTORE_STORE_DOC_ID}`;

const ACTIVE_STORE_DOC_KEY = 'kadi_pos_active_store_doc_v1';
const DEVICE_ID_STORAGE_KEY = 'kadi_pos_device_id';
const DEVICE_NAME_STORAGE_KEY = 'kadi_pos_device_name';
const LOCAL_CLOUD_BACKUP_KEY = 'kadi_pos_cloud_backup_v1';
const PENDING_SYNC_ACTIVITY_KEY = 'kadi_pos_cloud_pending_activity';
const DELETED_PRODUCTS_TOMBSTONE_KEY = 'kadi_pos_deleted_products_v1';
const KNOWN_CLOUD_PRODUCT_IDS_KEY = 'kadi_pos_known_cloud_product_ids_v1';

export function isValidStoreDocIdString(id: string): boolean {
  const clean = (id || '').trim();
  return clean === 'store' || /^store_[a-zA-Z0-9_\-]{6,96}$/.test(clean);
}

export function getCustomStoreDocId(): string | null {
  try {
    const raw = localStorage.getItem(ACTIVE_STORE_DOC_KEY);
    if (raw && isValidStoreDocIdString(raw)) {
      return raw.trim();
    }
    return null;
  } catch {
    return null;
  }
}

export function setCustomStoreDocId(docId: string | null): void {
  try {
    if (!docId || !docId.trim()) {
      localStorage.removeItem(ACTIVE_STORE_DOC_KEY);
      return;
    }
    const clean = docId.trim();
    if (isValidStoreDocIdString(clean)) {
      safeLocalStorageSet(ACTIVE_STORE_DOC_KEY, clean);
    }
  } catch {
    // ignore
  }
}

export function resolveActiveStoreDocId(userUid?: string | null): string {
  const custom = getCustomStoreDocId();
  if (custom) return custom;
  if (userUid && /^[a-zA-Z0-9_\-]{6,96}$/.test(userUid)) {
    return `store_${userUid}`;
  }
  return FIRESTORE_STORE_DOC_ID;
}

// Devices with no heartbeat within this window are treated as idle/offline in counts
export const DEVICE_ACTIVE_WINDOW_MS = 5 * 60 * 1000;

export interface DeletedProductTombstones {
  byId: Record<string, number>;
  byBarcode: Record<string, number>;
}

export interface MergeStoreOptions {
  previouslySyncedProductIds?: Set<string>;
  locallyDeleted?: DeletedProductTombstones;
}

export interface LocalStoreSyncPayload {
  products: Product[];
  sales: Order[];
  cash: FirestoreCashState;
  customers?: Customer[];
  creditTransactions?: CreditTransaction[];
  categories?: Category[];
  expenses?: Expense[];
  supplierInvoices?: SupplierInvoice[];
  suppliers?: SupplierProfile[];
  remiseBox?: RemiseBoxData;
  lastUpdated: number;
  updatedBy: string;
}

export interface FirestoreStoreDocument extends LocalStoreSyncPayload {
  devices: Record<string, ConnectedDeviceInfo>;
  ownerUid: string;
  ownerEmail: string;
  allowedEmails: string[];
  serverSyncedAt?: unknown;
}

export function formatFriendlySyncError(rawError: string | null | undefined, isAr = true): string {
  if (!rawError) return '';
  let message = rawError;
  try {
    const parsed = JSON.parse(rawError) as { error?: string; authInfo?: { email?: string | null } };
    if (parsed && typeof parsed.error === 'string') {
      message = parsed.error;
    }
  } catch {
    // plain text error
  }

  const lower = message.toLowerCase();
  if (lower.includes('permission') || lower.includes('insufficient permissions')) {
    return isAr
      ? 'حساب Google الحالي غير مصرح له بالوصول إلى بيانات هذا المتجر. ادخل بنفس حساب المالك أو أضف هذا البريد في قائمة المصرح لهم من جهاز المالك.'
      : 'Permission denied: sign in with the store owner account or authorize this Google email on the owner device.';
  }
  if (lower.includes('offline') || lower.includes('unavailable') || lower.includes('network')) {
    return isAr
      ? 'تعذر الوصول إلى السحابة مؤقتاً (الاتصال ضعيف أو مقطوع). التغييرات محفوظة محلياً وستُرفع تلقائياً عند استقرار الإنترنت.'
      : 'Cloud unreachable right now. Changes are saved locally and will sync automatically when online.';
  }
  if (lower.includes('quota')) {
    return isAr
      ? 'تم تجاوز الحد اليومي المجاني لعمليات Firestore السحابية.'
      : 'Firestore daily free quota exceeded.';
  }
  if (lower.includes('maximum allowed size') || lower.includes('too large')) {
    return isAr
      ? 'حجم البيانات كبير جداً للمزامنة الفورية — تم ضغط النسخة السحابية وتحتاج لإعادة المحاولة.'
      : 'Sync payload exceeded document size limit; retry with compacted snapshot.';
  }
  if (lower.includes('popup-closed-by-user') || lower.includes('cancelled-popup-request')) {
    return isAr ? 'تم إغلاق نافذة تسجيل الدخول بـ Google قبل إكمال الربط.' : 'Google sign-in popup was closed.';
  }
  return message;
}

export function getShortDevicePlatform(): string {
  if (typeof navigator === 'undefined') return 'POS Terminal';
  const ua = navigator.userAgent || '';
  let os = 'Desktop';
  if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';

  return `${os} · ${browser}`;
}

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && /^[a-zA-Z0-9_-]{6,64}$/.test(existing)) {
      return existing;
    }
    const generated = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `dev_${Date.now().toString(36)}`;
  }
}

export function getStoredDeviceName(deviceId?: string): string {
  try {
    const saved = localStorage.getItem(DEVICE_NAME_STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim().slice(0, 64);
  } catch {
    // ignore
  }
  const idSuffix = (deviceId || getOrCreateDeviceId()).slice(-4).toUpperCase();
  return `${getShortDevicePlatform()} #${idSuffix}`;
}

export function saveStoredDeviceName(name: string): string {
  const clean = name.trim().slice(0, 64) || getStoredDeviceName();
  safeLocalStorageSet(DEVICE_NAME_STORAGE_KEY, clean);
  return clean;
}

function sanitizeDailyVisitorsMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const entries = Object.entries(raw as Record<string, unknown>)
    .filter(([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === 'number' && Number.isFinite(v) && v >= 0)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 90)
    .map(([k, v]) => [k, Math.round(v as number)]);
  return Object.fromEntries(entries);
}

export function saveLocalCloudBackup(payload: LocalStoreSyncPayload): void {
  try {
    const compact: LocalStoreSyncPayload = {
      products: payload.products.slice(0, 2500),
      sales: payload.sales.slice(0, 600),
      cash: {
        currentShift: payload.cash.currentShift,
        shiftsHistory: payload.cash.shiftsHistory.slice(0, 150),
        emergencySessions: payload.cash.emergencySessions.slice(0, 100),
        dailyVisitorsByDate: sanitizeDailyVisitorsMap(payload.cash.dailyVisitorsByDate)
      },
      customers: Array.isArray(payload.customers) ? payload.customers.slice(0, 1000) : undefined,
      creditTransactions: Array.isArray(payload.creditTransactions)
        ? payload.creditTransactions.slice(0, 1000)
        : undefined,
      categories: Array.isArray(payload.categories) ? payload.categories.slice(0, 200) : undefined,
      expenses: Array.isArray(payload.expenses) ? payload.expenses.slice(0, 400) : undefined,
      supplierInvoices: Array.isArray(payload.supplierInvoices)
        ? payload.supplierInvoices.slice(0, 300)
        : undefined,
      suppliers: Array.isArray(payload.suppliers) ? payload.suppliers.slice(0, 200) : undefined,
      remiseBox: payload.remiseBox
        ? {
            wallets: payload.remiseBox.wallets || {},
            history: Array.isArray(payload.remiseBox.history)
              ? payload.remiseBox.history.slice(0, 250)
              : []
          }
        : undefined,
      lastUpdated: payload.lastUpdated,
      updatedBy: payload.updatedBy
    };
    safeLocalStorageSet(LOCAL_CLOUD_BACKUP_KEY, JSON.stringify(compact));
  } catch {
    // ignore storage quota errors
  }
}

export function loadLocalCloudBackup(): LocalStoreSyncPayload | null {
  try {
    const raw = localStorage.getItem(LOCAL_CLOUD_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalStoreSyncPayload>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.products) || !Array.isArray(parsed.sales) || !parsed.cash) {
      return null;
    }
    return {
      products: parsed.products,
      sales: parsed.sales,
      cash: {
        ...parsed.cash,
        dailyVisitorsByDate: sanitizeDailyVisitorsMap(parsed.cash.dailyVisitorsByDate)
      },
      customers: Array.isArray(parsed.customers) ? parsed.customers : undefined,
      creditTransactions: Array.isArray(parsed.creditTransactions)
        ? parsed.creditTransactions
        : undefined,
      categories: Array.isArray(parsed.categories) ? parsed.categories : undefined,
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : undefined,
      supplierInvoices: Array.isArray(parsed.supplierInvoices) ? parsed.supplierInvoices : undefined,
      suppliers: Array.isArray(parsed.suppliers) ? parsed.suppliers : undefined,
      remiseBox:
        parsed.remiseBox && typeof parsed.remiseBox === 'object'
          ? {
              wallets:
                parsed.remiseBox.wallets && typeof parsed.remiseBox.wallets === 'object'
                  ? parsed.remiseBox.wallets
                  : {},
              history: Array.isArray(parsed.remiseBox.history) ? parsed.remiseBox.history : []
            }
          : undefined,
      lastUpdated: Number(parsed.lastUpdated) || 0,
      updatedBy: typeof parsed.updatedBy === 'string' ? parsed.updatedBy : ''
    };
  } catch {
    return null;
  }
}

export function setPendingCloudSyncFlag(activity: string): void {
  safeLocalStorageSet(PENDING_SYNC_ACTIVITY_KEY, activity || 'تعديلات أوفلاين');
}

export function getPendingCloudSyncFlag(): string | null {
  try {
    return localStorage.getItem(PENDING_SYNC_ACTIVITY_KEY);
  } catch {
    return null;
  }
}

export function clearPendingCloudSyncFlag(): void {
  try {
    localStorage.removeItem(PENDING_SYNC_ACTIVITY_KEY);
  } catch {
    // ignore
  }
}

const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function loadDeletedProductTombstones(): DeletedProductTombstones {
  try {
    const raw = localStorage.getItem(DELETED_PRODUCTS_TOMBSTONE_KEY);
    if (!raw) return { byId: {}, byBarcode: {} };
    const parsed = JSON.parse(raw) as Partial<DeletedProductTombstones>;
    const cutoff = Date.now() - TOMBSTONE_TTL_MS;
    const byId: Record<string, number> = {};
    const byBarcode: Record<string, number> = {};

    if (parsed.byId && typeof parsed.byId === 'object') {
      Object.entries(parsed.byId).forEach(([k, v]) => {
        if (typeof v === 'number' && v >= cutoff) byId[k] = v;
      });
    }
    if (parsed.byBarcode && typeof parsed.byBarcode === 'object') {
      Object.entries(parsed.byBarcode).forEach(([k, v]) => {
        if (typeof v === 'number' && v >= cutoff) byBarcode[k] = v;
      });
    }
    return { byId, byBarcode };
  } catch {
    return { byId: {}, byBarcode: {} };
  }
}

export function recordDeletedProductTombstone(
  productId: string,
  barcode?: string
): DeletedProductTombstones {
  const current = loadDeletedProductTombstones();
  const now = Date.now();
  if (productId) {
    current.byId[productId] = now;
  }
  const cleanBarcode = (barcode || '').trim().toLowerCase();
  if (cleanBarcode) {
    current.byBarcode[cleanBarcode] = now;
  }

  const trimMap = (rec: Record<string, number>): Record<string, number> => {
    const entries = Object.entries(rec).sort((a, b) => b[1] - a[1]).slice(0, 500);
    return Object.fromEntries(entries);
  };

  const next: DeletedProductTombstones = {
    byId: trimMap(current.byId),
    byBarcode: trimMap(current.byBarcode)
  };
  safeLocalStorageSet(DELETED_PRODUCTS_TOMBSTONE_KEY, JSON.stringify(next));
  return next;
}

export function clearDeletedProductTombstone(productId?: string, barcode?: string): void {
  const current = loadDeletedProductTombstones();
  let changed = false;
  if (productId && productId in current.byId) {
    delete current.byId[productId];
    changed = true;
  }
  const cleanBarcode = (barcode || '').trim().toLowerCase();
  if (cleanBarcode && cleanBarcode in current.byBarcode) {
    delete current.byBarcode[cleanBarcode];
    changed = true;
  }
  if (changed) {
    safeLocalStorageSet(DELETED_PRODUCTS_TOMBSTONE_KEY, JSON.stringify(current));
  }
}

export function loadKnownCloudProductIds(): Set<string> {
  try {
    const raw = localStorage.getItem(KNOWN_CLOUD_PRODUCT_IDS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export function saveKnownCloudProductIds(productIds: Iterable<string>): void {
  try {
    const list = Array.from(new Set(productIds)).slice(0, 2600);
    safeLocalStorageSet(KNOWN_CLOUD_PRODUCT_IDS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

/**
 * Recursively strips `undefined` properties because Firestore rejects undefined values.
 */
function stripUndefinedDeep<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (input !== null && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(input as Record<string, unknown>).forEach(([k, v]) => {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    });
    return out as T;
  }
  return input;
}

function estimatePayloadBytes(obj: unknown): number {
  try {
    const json = JSON.stringify(obj);
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(json).length;
    }
    return json.length * 2;
  } catch {
    return 0;
  }
}

/**
 * Ensures outgoing document complies strictly with 1MB Firestore document limit and rule caps:
 * - products <= 2400 (strips huge inline base64 images to keep doc compact; local IndexedDB keeps full images)
 * - sales <= 500 most recent orders
 * - shiftsHistory <= 120 most recent shifts
 * - dynamically trims older history/sales if UTF-8 payload nears 780KB
 */
export function compactStoreForFirestore(
  payload: LocalStoreSyncPayload
): LocalStoreSyncPayload {
  let compactProducts = payload.products.slice(0, 2400).map((p) => {
    const clean = { ...p };
    if (typeof clean.image === 'string' && clean.image.startsWith('data:') && clean.image.length > 2500) {
      delete clean.image;
    }
    return stripUndefinedDeep(clean);
  });

  let compactSales = payload.sales.slice(0, 500).map((o) => stripUndefinedDeep({ ...o }));

  let compactCash: FirestoreCashState = {
    currentShift: stripUndefinedDeep({
      ...payload.cash.currentShift,
      cashTransactions: (payload.cash.currentShift.cashTransactions || []).slice(0, 200)
    }),
    shiftsHistory: payload.cash.shiftsHistory.slice(0, 120).map((s) =>
      stripUndefinedDeep({
        ...s,
        cashTransactions: (s.cashTransactions || []).slice(0, 100)
      })
    ),
    emergencySessions: payload.cash.emergencySessions.slice(0, 80).map((e) => stripUndefinedDeep(e)),
    dailyVisitorsByDate: sanitizeDailyVisitorsMap(payload.cash.dailyVisitorsByDate)
  };

  let compactCustomers = Array.isArray(payload.customers)
    ? payload.customers.slice(0, 950).map((c) => stripUndefinedDeep({ ...c }))
    : undefined;

  let compactCreditTx = Array.isArray(payload.creditTransactions)
    ? payload.creditTransactions.slice(0, 950).map((tx) => stripUndefinedDeep({ ...tx }))
    : undefined;

  const compactCategories = Array.isArray(payload.categories)
    ? payload.categories.slice(0, 180).map((cat) => {
        const clean = { ...cat };
        if (typeof clean.image === 'string' && clean.image.startsWith('data:') && clean.image.length > 2500) {
          delete clean.image;
        }
        return stripUndefinedDeep(clean);
      })
    : undefined;

  let compactExpenses = Array.isArray(payload.expenses)
    ? payload.expenses.slice(0, 380).map((e) => stripUndefinedDeep({ ...e }))
    : undefined;

  let compactSupplierInvoices = Array.isArray(payload.supplierInvoices)
    ? payload.supplierInvoices.slice(0, 280).map((inv) => stripUndefinedDeep({ ...inv }))
    : undefined;

  let compactSuppliers = Array.isArray(payload.suppliers)
    ? payload.suppliers.slice(0, 190).map((sup) => stripUndefinedDeep({ ...sup }))
    : undefined;

  let compactRemiseBox: RemiseBoxData | undefined = payload.remiseBox
    ? {
        wallets: Object.fromEntries(
          Object.entries(payload.remiseBox.wallets || {})
            .slice(0, 90)
            .map(([k, v]) => [k, stripUndefinedDeep({ ...v })])
        ),
        history: Array.isArray(payload.remiseBox.history)
          ? payload.remiseBox.history.slice(0, 250).map((h) => stripUndefinedDeep({ ...h }))
          : []
      }
    : undefined;

  const buildResult = (): LocalStoreSyncPayload => {
    const res: LocalStoreSyncPayload = {
      products: compactProducts,
      sales: compactSales,
      cash: compactCash,
      lastUpdated: Number(payload.lastUpdated) || Date.now(),
      updatedBy: String(payload.updatedBy || 'device').slice(0, 160)
    };
    if (compactCustomers) res.customers = compactCustomers;
    if (compactCreditTx) res.creditTransactions = compactCreditTx;
    if (compactCategories) res.categories = compactCategories;
    if (compactExpenses) res.expenses = compactExpenses;
    if (compactSupplierInvoices) res.supplierInvoices = compactSupplierInvoices;
    if (compactSuppliers) res.suppliers = compactSuppliers;
    if (compactRemiseBox) res.remiseBox = compactRemiseBox;
    return res;
  };

  let result = buildResult();
  const MAX_SAFE_BYTES = 780_000;

  if (estimatePayloadBytes(result) > MAX_SAFE_BYTES) {
    // Stage 1: Strip any remaining inline data images & bulky QR strings from older orders
    compactProducts = compactProducts.map((p) => {
      if (typeof p.image === 'string' && p.image.startsWith('data:')) {
        const { image: _omit, ...rest } = p;
        return rest as Product;
      }
      return p;
    });
    compactSales = compactSales.slice(0, 250).map((o) => {
      const { zatcaQrString: _qr, ...rest } = o;
      return rest as Order;
    });
    compactCash = {
      ...compactCash,
      shiftsHistory: compactCash.shiftsHistory.slice(0, 40),
      emergencySessions: compactCash.emergencySessions.slice(0, 30)
    };
    if (compactCreditTx) compactCreditTx = compactCreditTx.slice(0, 450);
    if (compactExpenses) compactExpenses = compactExpenses.slice(0, 220);
    if (compactSupplierInvoices) compactSupplierInvoices = compactSupplierInvoices.slice(0, 150);
    if (compactSuppliers) compactSuppliers = compactSuppliers.slice(0, 150);
    if (compactRemiseBox) {
      compactRemiseBox = {
        ...compactRemiseBox,
        history: compactRemiseBox.history.slice(0, 120)
      };
    }
    result = buildResult();
  }

  if (estimatePayloadBytes(result) > MAX_SAFE_BYTES) {
    // Stage 2: Tighter bounds for huge catalogs (2,000+ demo products)
    compactSales = compactSales.slice(0, 100);
    compactCash = {
      ...compactCash,
      shiftsHistory: compactCash.shiftsHistory.slice(0, 15),
      emergencySessions: compactCash.emergencySessions.slice(0, 10)
    };
    if (compactCustomers) compactCustomers = compactCustomers.slice(0, 500);
    if (compactCreditTx) compactCreditTx = compactCreditTx.slice(0, 200);
    if (compactExpenses) compactExpenses = compactExpenses.slice(0, 100);
    if (compactSupplierInvoices) {
      compactSupplierInvoices = compactSupplierInvoices.slice(0, 80).map((inv) => {
        const { itemsSummary: _sum, ...rest } = inv;
        return rest as SupplierInvoice;
      });
    }
    if (compactSuppliers) compactSuppliers = compactSuppliers.slice(0, 100);
    if (compactRemiseBox) {
      compactRemiseBox = {
        ...compactRemiseBox,
        history: compactRemiseBox.history.slice(0, 60)
      };
    }
    result = buildResult();
  }

  while (estimatePayloadBytes(result) > MAX_SAFE_BYTES && compactProducts.length > 200) {
    compactProducts = compactProducts.slice(0, Math.floor(compactProducts.length * 0.8));
    result = buildResult();
  }

  return result;
}

function getItemTimestamp(item: { updatedAt?: number; syncedAt?: string; date?: string }): number {
  if (typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt)) {
    return item.updatedAt;
  }
  if (typeof item.syncedAt === 'string') {
    const ms = Date.parse(item.syncedAt);
    if (Number.isFinite(ms)) return ms;
  }
  if (typeof item.date === 'string') {
    const ms = Date.parse(item.date);
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

/**
 * Concurrent conflict-resolution merge:
 * Never blindly deletes another device's items when 2+ devices edit simultaneously.
 * - Unions products, sales, cash, customers, creditTransactions, and categories by ID.
 */
export function mergePosStoreData(
  local: LocalStoreSyncPayload,
  remote: LocalStoreSyncPayload,
  options?: MergeStoreOptions
): LocalStoreSyncPayload {
  const remoteIsNewerStore = (remote.lastUpdated || 0) >= (local.lastUpdated || 0);
  const tombstones = options?.locallyDeleted ?? loadDeletedProductTombstones();
  const knownCloudIds = options?.previouslySyncedProductIds;

  // 1. Merge Products by ID (respecting both local deletions & remote deletions)
  const localProductMap = new Map<string, Product>();
  local.products.forEach((p) => localProductMap.set(p.id, p));

  const remoteProductMap = new Map<string, Product>();
  remote.products.forEach((p) => remoteProductMap.set(p.id, p));

  const mergedProductsMap = new Map<string, Product>();

  remote.products.forEach((rp) => {
    const cleanBc = (rp.barcode || '').trim().toLowerCase();
    const localDelTs = Math.max(
      tombstones.byId[rp.id] || 0,
      cleanBc ? tombstones.byBarcode[cleanBc] || 0 : 0
    );
    const remoteItemTs = rp.updatedAt || remote.lastUpdated || 0;
    if (localDelTs > 0 && localDelTs >= remoteItemTs) {
      return;
    }

    const lp = localProductMap.get(rp.id);
    if (!lp) {
      mergedProductsMap.set(rp.id, rp);
      return;
    }
    const localTs = lp.updatedAt || local.lastUpdated || 0;
    const remoteTs = rp.updatedAt || remote.lastUpdated || 0;
    const winner = remoteTs > localTs ? rp : remoteTs < localTs ? lp : remoteIsNewerStore ? rp : lp;
    const preservedImage = winner.image || lp.image || rp.image;
    mergedProductsMap.set(
      rp.id,
      preservedImage ? { ...winner, image: preservedImage } : winner
    );
  });

  local.products.forEach((lp) => {
    if (mergedProductsMap.has(lp.id) || remoteProductMap.has(lp.id)) return;

    const cleanBc = (lp.barcode || '').trim().toLowerCase();
    const localDelTs = Math.max(
      tombstones.byId[lp.id] || 0,
      cleanBc ? tombstones.byBarcode[cleanBc] || 0 : 0
    );
    if (localDelTs > 0) return;

    if (knownCloudIds && knownCloudIds.has(lp.id)) {
      return;
    }

    const lpTs = lp.updatedAt || 0;
    if (lpTs > 0 && (remote.lastUpdated || 0) > lpTs && knownCloudIds && knownCloudIds.size > 0) {
      return;
    }

    mergedProductsMap.set(lp.id, lp);
  });

  // 2. Merge Sales Orders by ID
  const mergedSalesMap = new Map<string, Order>();
  local.sales.forEach((o) => mergedSalesMap.set(o.id, o));

  remote.sales.forEach((ro) => {
    const lo = mergedSalesMap.get(ro.id);
    if (!lo) {
      mergedSalesMap.set(ro.id, ro);
      return;
    }
    const localTs = getItemTimestamp(lo) || local.lastUpdated || 0;
    const remoteTs = getItemTimestamp(ro) || remote.lastUpdated || 0;
    const winner = remoteTs > localTs ? ro : remoteTs < localTs ? lo : remoteIsNewerStore ? ro : lo;
    if (
      (lo.status !== 'completed' || ro.status !== 'completed') &&
      winner.status === 'completed'
    ) {
      const refundedVer = ro.status !== 'completed' ? ro : lo;
      mergedSalesMap.set(ro.id, refundedVer);
    } else {
      mergedSalesMap.set(ro.id, winner);
    }
  });

  const mergedSales = Array.from(mergedSalesMap.values()).sort(
    (a, b) => Date.parse(b.date || '') - Date.parse(a.date || '')
  );

  // 3. Merge Cash Shifts & Transactions
  const shiftHistoryMap = new Map<string, Shift>();
  const addShiftToMap = (s: Shift, storeTs: number) => {
    const prev = shiftHistoryMap.get(s.id);
    if (!prev) {
      shiftHistoryMap.set(s.id, s);
      return;
    }
    const txMap = new Map<string, Shift['cashTransactions'][number]>();
    (prev.cashTransactions || []).forEach((t) => txMap.set(t.id, t));
    (s.cashTransactions || []).forEach((t) => txMap.set(t.id, t));
    const prevTs = prev.updatedAt || (prev.closedAt ? Date.parse(prev.closedAt) : 0);
    const curTs = s.updatedAt || (s.closedAt ? Date.parse(s.closedAt) : storeTs);
    const base = curTs >= prevTs ? s : prev;
    shiftHistoryMap.set(s.id, {
      ...base,
      cashTransactions: Array.from(txMap.values()).sort(
        (a, b) => Date.parse(b.date || '') - Date.parse(a.date || '')
      )
    });
  };
  (local.cash.shiftsHistory || []).forEach((s) => addShiftToMap(s, local.lastUpdated));
  (remote.cash.shiftsHistory || []).forEach((s) => addShiftToMap(s, remote.lastUpdated));

  const localShift = local.cash.currentShift;
  const remoteShift = remote.cash.currentShift;
  let mergedCurrentShift: Shift;

  if (localShift && remoteShift) {
    if (localShift.id === remoteShift.id) {
      const txMap = new Map<string, Shift['cashTransactions'][number]>();
      (localShift.cashTransactions || []).forEach((t) => txMap.set(t.id, t));
      (remoteShift.cashTransactions || []).forEach((t) => txMap.set(t.id, t));
      const lTs = localShift.updatedAt || local.lastUpdated || 0;
      const rTs = remoteShift.updatedAt || remote.lastUpdated || 0;
      const winner =
        remoteShift.status === 'closed' && localShift.status !== 'closed'
          ? remoteShift
          : localShift.status === 'closed' && remoteShift.status !== 'closed'
          ? localShift
          : rTs >= lTs
          ? remoteShift
          : localShift;
      mergedCurrentShift = {
        ...winner,
        cashTransactions: Array.from(txMap.values()).sort(
          (a, b) => Date.parse(b.date || '') - Date.parse(a.date || '')
        )
      };
    } else {
      const localOpened = Date.parse(localShift.openedAt || '') || 0;
      const remoteOpened = Date.parse(remoteShift.openedAt || '') || 0;
      if (remoteOpened >= localOpened) {
        mergedCurrentShift = remoteShift;
        if (localShift.status === 'closed') addShiftToMap(localShift, local.lastUpdated);
      } else {
        mergedCurrentShift = localShift;
        if (remoteShift.status === 'closed') addShiftToMap(remoteShift, remote.lastUpdated);
      }
    }
  } else {
    mergedCurrentShift = remoteShift || localShift;
  }

  // Merge Emergency Sessions by ID
  const emgMap = new Map<string, EmergencyOpeningSession>();
  (local.cash.emergencySessions || []).forEach((e) => emgMap.set(e.id, e));
  (remote.cash.emergencySessions || []).forEach((e) => {
    const prev = emgMap.get(e.id);
    if (!prev) {
      emgMap.set(e.id, e);
    } else {
      const pick =
        e.status === 'closed' && prev.status !== 'closed'
          ? e
          : (e.ordersCount || 0) >= (prev.ordersCount || 0)
          ? e
          : prev;
      emgMap.set(e.id, pick);
    }
  });

  // Merge Daily Visitors by Date (newer store wins per date key, union across dates, capped to 90 days)
  const localVisitors = sanitizeDailyVisitorsMap(local.cash.dailyVisitorsByDate);
  const remoteVisitors = sanitizeDailyVisitorsMap(remote.cash.dailyVisitorsByDate);
  const mergedVisitorsRaw: Record<string, number> = {};
  const allVisitorDates = new Set([
    ...Object.keys(localVisitors),
    ...Object.keys(remoteVisitors)
  ]);
  allVisitorDates.forEach((dateKey) => {
    const hasL = Object.prototype.hasOwnProperty.call(localVisitors, dateKey);
    const hasR = Object.prototype.hasOwnProperty.call(remoteVisitors, dateKey);
    if (hasL && hasR) {
      mergedVisitorsRaw[dateKey] = remoteIsNewerStore
        ? remoteVisitors[dateKey]
        : localVisitors[dateKey];
    } else if (hasR) {
      mergedVisitorsRaw[dateKey] = remoteVisitors[dateKey];
    } else if (hasL) {
      mergedVisitorsRaw[dateKey] = localVisitors[dateKey];
    }
  });
  const mergedVisitors = sanitizeDailyVisitorsMap(mergedVisitorsRaw);

  // 4. Merge Credit Transactions by ID
  let mergedCreditTx: CreditTransaction[] | undefined;
  if (Array.isArray(local.creditTransactions) || Array.isArray(remote.creditTransactions)) {
    const txMap = new Map<string, CreditTransaction>();
    (local.creditTransactions || []).forEach((tx) => txMap.set(tx.id, tx));
    (remote.creditTransactions || []).forEach((tx) => txMap.set(tx.id, tx));
    mergedCreditTx = Array.from(txMap.values()).sort(
      (a, b) => Date.parse(b.date || '') - Date.parse(a.date || '')
    );
  }

  // 5. Merge Customers by ID (using per-customer updatedAt / store recency)
  let mergedCustomers: Customer[] | undefined;
  if (Array.isArray(local.customers) || Array.isArray(remote.customers)) {
    const custMap = new Map<string, Customer>();
    (local.customers || []).forEach((c) => custMap.set(c.id, c));
    (remote.customers || []).forEach((rc) => {
      const lc = custMap.get(rc.id);
      if (!lc) {
        custMap.set(rc.id, rc);
        return;
      }
      const lTs = lc.updatedAt || local.lastUpdated || 0;
      const rTs = rc.updatedAt || remote.lastUpdated || 0;
      const winner = rTs > lTs ? rc : rTs < lTs ? lc : remoteIsNewerStore ? rc : lc;
      custMap.set(rc.id, winner);
    });
    mergedCustomers = Array.from(custMap.values());
  }

  // 6. Merge Categories by ID (preserving local image if remote stripped base64)
  let mergedCategories: Category[] | undefined;
  if (Array.isArray(local.categories) || Array.isArray(remote.categories)) {
    const catMap = new Map<string, Category>();
    (local.categories || []).forEach((c) => catMap.set(c.id, c));
    (remote.categories || []).forEach((rc) => {
      const lc = catMap.get(rc.id);
      if (!lc) {
        catMap.set(rc.id, rc);
        return;
      }
      const winner = remoteIsNewerStore ? rc : lc;
      const preservedImage = winner.image || lc.image || rc.image;
      catMap.set(rc.id, preservedImage ? { ...winner, image: preservedImage } : winner);
    });
    mergedCategories = Array.from(catMap.values());
  }

  // 7. Merge Expenses by ID
  let mergedExpenses: Expense[] | undefined;
  if (Array.isArray(local.expenses) || Array.isArray(remote.expenses)) {
    const expMap = new Map<string, Expense>();
    (local.expenses || []).forEach((e) => expMap.set(e.id, e));
    (remote.expenses || []).forEach((re) => {
      const le = expMap.get(re.id);
      if (!le) {
        expMap.set(re.id, re);
        return;
      }
      const lTs = le.updatedAt || Date.parse(le.createdAt || '') || local.lastUpdated || 0;
      const rTs = re.updatedAt || Date.parse(re.createdAt || '') || remote.lastUpdated || 0;
      const winner = rTs > lTs ? re : rTs < lTs ? le : remoteIsNewerStore ? re : le;
      expMap.set(re.id, winner);
    });
    mergedExpenses = Array.from(expMap.values()).sort(
      (a, b) => Date.parse(b.createdAt || b.date || '') - Date.parse(a.createdAt || a.date || '')
    );
  }

  // 8. Merge Supplier Invoices by ID (preferring latest update or higher paidAmount when timestamps tie)
  let mergedSupplierInvoices: SupplierInvoice[] | undefined;
  if (Array.isArray(local.supplierInvoices) || Array.isArray(remote.supplierInvoices)) {
    const invMap = new Map<string, SupplierInvoice>();
    (local.supplierInvoices || []).forEach((inv) => invMap.set(inv.id, inv));
    (remote.supplierInvoices || []).forEach((ri) => {
      const li = invMap.get(ri.id);
      if (!li) {
        invMap.set(ri.id, ri);
        return;
      }
      const lTs = li.updatedAt || Date.parse(li.createdAt || '') || local.lastUpdated || 0;
      const rTs = ri.updatedAt || Date.parse(ri.createdAt || '') || remote.lastUpdated || 0;
      const winner =
        rTs > lTs
          ? ri
          : rTs < lTs
          ? li
          : (ri.paidAmount || 0) > (li.paidAmount || 0)
          ? ri
          : (li.paidAmount || 0) > (ri.paidAmount || 0)
          ? li
          : remoteIsNewerStore
          ? ri
          : li;
      invMap.set(ri.id, winner);
    });
    mergedSupplierInvoices = Array.from(invMap.values()).sort(
      (a, b) => Date.parse(b.createdAt || b.date || '') - Date.parse(a.createdAt || a.date || '')
    );
  }

  // 9. Merge Suppliers Directory by ID
  let mergedSuppliers: SupplierProfile[] | undefined;
  if (Array.isArray(local.suppliers) || Array.isArray(remote.suppliers)) {
    const supMap = new Map<string, SupplierProfile>();
    (local.suppliers || []).forEach((s) => supMap.set(s.id, s));
    (remote.suppliers || []).forEach((rs) => {
      const ls = supMap.get(rs.id);
      if (!ls) {
        supMap.set(rs.id, rs);
        return;
      }
      const lTs = Date.parse(ls.updatedAt || ls.createdAt || '') || local.lastUpdated || 0;
      const rTs = Date.parse(rs.updatedAt || rs.createdAt || '') || remote.lastUpdated || 0;
      const winner = rTs > lTs ? rs : rTs < lTs ? ls : remoteIsNewerStore ? rs : ls;
      supMap.set(rs.id, winner);
    });
    mergedSuppliers = Array.from(supMap.values());
  }

  // 10. Merge Remise Box wallets & history by ID/timestamp
  let mergedRemiseBox: RemiseBoxData | undefined;
  if (local.remiseBox || remote.remiseBox) {
    const localWallets = local.remiseBox?.wallets || {};
    const remoteWallets = remote.remiseBox?.wallets || {};
    const mergedWallets: Record<string, RemiseWallet> = { ...localWallets };
    Object.entries(remoteWallets).forEach(([company, rw]) => {
      const lw = mergedWallets[company];
      if (!lw) {
        mergedWallets[company] = rw;
        return;
      }
      const lTs = Date.parse(lw.updatedAt || '') || local.lastUpdated || 0;
      const rTs = Date.parse(rw.updatedAt || '') || remote.lastUpdated || 0;
      const winner = rTs > lTs ? rw : rTs < lTs ? lw : remoteIsNewerStore ? rw : lw;
      mergedWallets[company] = {
        ...winner,
        vendors: { ...(lw.vendors || {}), ...(rw.vendors || {}) },
        vendorCodes: { ...(lw.vendorCodes || {}), ...(rw.vendorCodes || {}) },
        goal: winner.goal ?? lw.goal ?? rw.goal
      };
    });

    const histMap = new Map<string, RemiseHistoryEntry>();
    (local.remiseBox?.history || []).forEach((h) => histMap.set(h.id, h));
    (remote.remiseBox?.history || []).forEach((h) => {
      if (!histMap.has(h.id)) histMap.set(h.id, h);
    });
    const mergedHistory = Array.from(histMap.values()).sort(
      (a, b) => Date.parse(b.date || '') - Date.parse(a.date || '')
    );

    mergedRemiseBox = {
      wallets: mergedWallets,
      history: mergedHistory
    };
  }

  const out: LocalStoreSyncPayload = {
    products: Array.from(mergedProductsMap.values()),
    sales: mergedSales,
    cash: {
      currentShift: mergedCurrentShift,
      shiftsHistory: Array.from(shiftHistoryMap.values()).sort(
        (a, b) => Date.parse(b.openedAt || '') - Date.parse(a.openedAt || '')
      ),
      emergencySessions: Array.from(emgMap.values()).sort(
        (a, b) => Date.parse(b.openedAt || '') - Date.parse(a.openedAt || '')
      ),
      dailyVisitorsByDate: mergedVisitors
    },
    lastUpdated: Math.max(local.lastUpdated || 0, remote.lastUpdated || 0),
    updatedBy: remoteIsNewerStore ? remote.updatedBy : local.updatedBy
  };

  if (mergedCustomers) out.customers = mergedCustomers;
  if (mergedCreditTx) out.creditTransactions = mergedCreditTx;
  if (mergedCategories) out.categories = mergedCategories;
  if (mergedExpenses) out.expenses = mergedExpenses;
  if (mergedSupplierInvoices) out.supplierInvoices = mergedSupplierInvoices;
  if (mergedSuppliers) out.suppliers = mergedSuppliers;
  if (mergedRemiseBox) out.remiseBox = mergedRemiseBox;

  return out;
}

export function sanitizeDevicesMap(
  rawDevices: unknown
): Record<string, ConnectedDeviceInfo> {
  if (!rawDevices || typeof rawDevices !== 'object' || Array.isArray(rawDevices)) {
    return {};
  }
  const out: Record<string, ConnectedDeviceInfo> = {};
  Object.entries(rawDevices as Record<string, unknown>)
    .slice(0, 48)
    .forEach(([key, val]) => {
      if (!val || typeof val !== 'object') return;
      const d = val as Partial<ConnectedDeviceInfo>;
      out[key] = {
        deviceId: typeof d.deviceId === 'string' ? d.deviceId.slice(0, 64) : key.slice(0, 64),
        deviceName: typeof d.deviceName === 'string' ? d.deviceName.slice(0, 64) : key,
        userAgent: typeof d.userAgent === 'string' ? d.userAgent.slice(0, 64) : 'POS',
        cashierName: typeof d.cashierName === 'string' ? d.cashierName.slice(0, 64) : 'كاشير',
        lastActivity: typeof d.lastActivity === 'string' ? d.lastActivity.slice(0, 120) : 'متصل',
        lastSyncAt:
          typeof d.lastSyncAt === 'string' ? d.lastSyncAt : new Date().toISOString(),
        lastUpdatedMs: Number(d.lastUpdatedMs) || 0,
        online: d.online !== false
      };
    });
  return out;
}

function parseRemoteDocData(
  data: Partial<FirestoreStoreDocument>,
  fallbackOwnerUid = '',
  fallbackOwnerEmail = ''
): FirestoreStoreDocument {
  return {
    products: Array.isArray(data.products) ? data.products : [],
    sales: Array.isArray(data.sales) ? data.sales : [],
    cash:
      data.cash && typeof data.cash === 'object'
        ? {
            ...(data.cash as FirestoreCashState),
            dailyVisitorsByDate: sanitizeDailyVisitorsMap(
              (data.cash as FirestoreCashState).dailyVisitorsByDate
            )
          }
        : ({} as FirestoreCashState),
    customers: Array.isArray(data.customers) ? data.customers : undefined,
    creditTransactions: Array.isArray(data.creditTransactions)
      ? data.creditTransactions
      : undefined,
    categories: Array.isArray(data.categories) ? data.categories : undefined,
    expenses: Array.isArray(data.expenses) ? data.expenses : undefined,
    supplierInvoices: Array.isArray(data.supplierInvoices) ? data.supplierInvoices : undefined,
    suppliers: Array.isArray(data.suppliers) ? data.suppliers : undefined,
    remiseBox:
      data.remiseBox && typeof data.remiseBox === 'object'
        ? {
            wallets:
              data.remiseBox.wallets && typeof data.remiseBox.wallets === 'object'
                ? data.remiseBox.wallets
                : {},
            history: Array.isArray(data.remiseBox.history) ? data.remiseBox.history : []
          }
        : undefined,
    lastUpdated: Number(data.lastUpdated) || 0,
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : '',
    devices: sanitizeDevicesMap(data.devices),
    ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : fallbackOwnerUid,
    ownerEmail: typeof data.ownerEmail === 'string' ? data.ownerEmail : fallbackOwnerEmail,
    allowedEmails: Array.isArray(data.allowedEmails)
      ? data.allowedEmails.filter((e): e is string => typeof e === 'string').slice(0, 20)
      : []
  };
}

export function subscribeStoreSyncDoc(
  onRemoteData: (
    docData: FirestoreStoreDocument | null,
    meta: { fromCache: boolean; hasPendingWrites: boolean }
  ) => void,
  onSyncError: (errMsg: string) => void,
  storeDocId: string = FIRESTORE_STORE_DOC_ID
): Unsubscribe {
  const targetDocId = isValidStoreDocIdString(storeDocId) ? storeDocId : FIRESTORE_STORE_DOC_ID;
  const targetPath = `${FIRESTORE_COLLECTION}/${targetDocId}`;
  const ref = doc(db, FIRESTORE_COLLECTION, targetDocId);
  return onSnapshot(
    ref,
    { includeMetadataChanges: true },
    (snapshot) => {
      const meta = {
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites
      };
      if (!snapshot.exists()) {
        onRemoteData(null, meta);
        return;
      }
      const parsed = parseRemoteDocData(snapshot.data() as Partial<FirestoreStoreDocument>);
      onRemoteData(parsed, meta);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, targetPath);
      } catch (wrapped) {
        onSyncError(wrapped instanceof Error ? wrapped.message : String(error));
      }
    }
  );
}

export async function pushMergedStoreToFirestore(params: {
  user: User;
  localPayload: LocalStoreSyncPayload;
  cachedRemoteDoc: FirestoreStoreDocument | null;
  deviceId: string;
  deviceName: string;
  cashierName: string;
  activityLabel: string;
  online?: boolean;
  storeDocId?: string;
}): Promise<FirestoreStoreDocument> {
  const {
    user,
    localPayload,
    cachedRemoteDoc,
    deviceId,
    deviceName,
    cashierName,
    activityLabel,
    online = true,
    storeDocId
  } = params;

  const targetDocId =
    storeDocId && isValidStoreDocIdString(storeDocId)
      ? storeDocId
      : resolveActiveStoreDocId(user.uid);
  const targetPath = `${FIRESTORE_COLLECTION}/${targetDocId}`;
  const storeRef = doc(db, FIRESTORE_COLLECTION, targetDocId);

  try {
    const written = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(storeRef);
      const baseRemote = snap.exists()
        ? parseRemoteDocData(
            snap.data() as Partial<FirestoreStoreDocument>,
            user.uid,
            user.email || ''
          )
        : cachedRemoteDoc;

      const knownCloudIds = loadKnownCloudProductIds();
      if (baseRemote) {
        baseRemote.products.forEach((p) => knownCloudIds.add(p.id));
      }

      const merged = baseRemote
        ? mergePosStoreData(localPayload, baseRemote, {
            previouslySyncedProductIds: knownCloudIds,
            locallyDeleted: loadDeletedProductTombstones()
          })
        : localPayload;

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const compact = compactStoreForFirestore({
        ...merged,
        lastUpdated: Math.max(nowMs, merged.lastUpdated || 0),
        updatedBy: `${deviceId} · ${cashierName}`.slice(0, 160)
      });

      const existingDevices = sanitizeDevicesMap(baseRemote?.devices);
      // Keep max 45 other devices sorted by most recent activity
      const deviceEntries = Object.entries(existingDevices)
        .filter(([k]) => k !== deviceId)
        .sort((a, b) => (b[1].lastUpdatedMs || 0) - (a[1].lastUpdatedMs || 0))
        .slice(0, 45);

      const nextDevices: Record<string, ConnectedDeviceInfo> = Object.fromEntries(deviceEntries);
      nextDevices[deviceId] = {
        deviceId,
        deviceName: deviceName.slice(0, 64),
        userAgent: getShortDevicePlatform().slice(0, 64),
        cashierName: cashierName.slice(0, 64),
        lastActivity: activityLabel.slice(0, 120),
        lastSyncAt: nowIso,
        lastUpdatedMs: nowMs,
        online
      };

      const docToWrite: FirestoreStoreDocument = {
        products: compact.products,
        sales: compact.sales,
        cash: compact.cash,
        ...(compact.customers ? { customers: compact.customers } : {}),
        ...(compact.creditTransactions ? { creditTransactions: compact.creditTransactions } : {}),
        ...(compact.categories ? { categories: compact.categories } : {}),
        ...(compact.expenses ? { expenses: compact.expenses } : {}),
        ...(compact.supplierInvoices ? { supplierInvoices: compact.supplierInvoices } : {}),
        ...(compact.suppliers ? { suppliers: compact.suppliers } : {}),
        ...(compact.remiseBox ? { remiseBox: compact.remiseBox } : {}),
        lastUpdated: compact.lastUpdated,
        updatedBy: compact.updatedBy,
        devices: nextDevices,
        ownerUid: baseRemote?.ownerUid || user.uid,
        ownerEmail: baseRemote?.ownerEmail || user.email || '',
        allowedEmails: (baseRemote?.allowedEmails || []).slice(0, 20),
        serverSyncedAt: serverTimestamp()
      };

      transaction.set(storeRef, docToWrite, { merge: false });
      return docToWrite;
    });

    saveKnownCloudProductIds(written.products.map((p) => p.id));
    clearPendingCloudSyncFlag();
    return written;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, targetPath);
  }
}

export async function updateDeviceRegistryOnly(params: {
  user: User;
  cachedRemoteDoc?: FirestoreStoreDocument | null;
  nextDevices?: Record<string, ConnectedDeviceInfo>;
  transformDevices?: (
    latestDevices: Record<string, ConnectedDeviceInfo>
  ) => Record<string, ConnectedDeviceInfo>;
  nextAllowedEmails?: string[];
  deviceId: string;
  cashierName: string;
  activityLabel: string;
  storeDocId?: string;
}): Promise<FirestoreStoreDocument> {
  const targetDocId =
    params.storeDocId && isValidStoreDocIdString(params.storeDocId)
      ? params.storeDocId
      : resolveActiveStoreDocId(params.user.uid);
  const targetPath = `${FIRESTORE_COLLECTION}/${targetDocId}`;
  const storeRef = doc(db, FIRESTORE_COLLECTION, targetDocId);
  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(storeRef);
      const base = snap.exists()
        ? parseRemoteDocData(
            snap.data() as Partial<FirestoreStoreDocument>,
            params.user.uid,
            params.user.email || ''
          )
        : params.cachedRemoteDoc;

      if (!base) {
        throw new Error('لا توجد بيانات متجر سحابية بعد لتحديث الأجهزة.');
      }

      const latestDevices = sanitizeDevicesMap(base.devices);
      const computedDevices = params.transformDevices
        ? params.transformDevices(latestDevices)
        : params.nextDevices ?? latestDevices;

      const nowMs = Date.now();
      const payload: FirestoreStoreDocument = {
        products: base.products,
        sales: base.sales,
        cash: base.cash,
        ...(base.customers ? { customers: base.customers } : {}),
        ...(base.creditTransactions ? { creditTransactions: base.creditTransactions } : {}),
        ...(base.categories ? { categories: base.categories } : {}),
        ...(base.expenses ? { expenses: base.expenses } : {}),
        ...(base.supplierInvoices ? { supplierInvoices: base.supplierInvoices } : {}),
        ...(base.suppliers ? { suppliers: base.suppliers } : {}),
        ...(base.remiseBox ? { remiseBox: base.remiseBox } : {}),
        lastUpdated: Math.max(nowMs, base.lastUpdated || 0),
        updatedBy: `${params.deviceId} · ${params.cashierName}`.slice(0, 160),
        devices: sanitizeDevicesMap(computedDevices),
        ownerUid: base.ownerUid || params.user.uid,
        ownerEmail: base.ownerEmail || params.user.email || '',
        allowedEmails: (params.nextAllowedEmails ?? base.allowedEmails ?? [])
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 20),
        serverSyncedAt: serverTimestamp()
      };

      transaction.set(storeRef, payload, { merge: false });
      return payload;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, targetPath);
  }
}

export async function fetchRemoteStoreOnce(
  storeDocId: string = FIRESTORE_STORE_DOC_ID
): Promise<FirestoreStoreDocument | null> {
  const targetDocId = isValidStoreDocIdString(storeDocId) ? storeDocId : FIRESTORE_STORE_DOC_ID;
  const targetPath = `${FIRESTORE_COLLECTION}/${targetDocId}`;
  const storeRef = doc(db, FIRESTORE_COLLECTION, targetDocId);
  try {
    const snap = await getDoc(storeRef);
    if (!snap.exists()) return null;
    return parseRemoteDocData(snap.data() as Partial<FirestoreStoreDocument>);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, targetPath);
  }
}
