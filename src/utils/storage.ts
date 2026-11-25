/**
 * High-Capacity IndexedDB Storage Engine for Kadi POS
 * Unlimited offline client storage capacity for 2,000+ to 50,000+ products,
 * high-res camera photos, stock movements, and receipts.
 */

import {
  Product,
  Category,
  Order,
  Customer,
  Shift,
  StockMovement,
  StoreSettings,
  Branch,
  BranchTransfer,
  HeldTicket,
  CartItem,
  OfflineSaleQueueItem,
  Expense,
  RemoteOrder,
  DeliveryZone,
  CpuQuarterRecord,
  SupplierInvoice,
  CreditTransaction
} from '../types';

const DB_NAME = 'kadi_pos_indexed_db';
const DB_VERSION = 7;

export const STORES = {
  PRODUCTS: 'products',
  CATEGORIES: 'categories',
  ORDERS: 'orders',
  OFFLINE_SALES_QUEUE: 'offline_sales_queue',
  STOCK_MOVEMENTS: 'stock_movements',
  CUSTOMERS: 'customers',
  CREDIT_TRANSACTIONS: 'credit_transactions',
  SHIFTS_HISTORY: 'shifts_history',
  BRANCHES: 'branches',
  BRANCH_TRANSFERS: 'branch_transfers',
  EXPENSES: 'expenses',
  REMOTE_ORDERS: 'remote_orders',
  DELIVERY_ZONES: 'delivery_zones',
  CPU_RECORDS: 'cpu_records',
  SUPPLIER_INVOICES: 'supplier_invoices',
  KEYVAL: 'keyval'
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

export function getDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB is not supported in this environment'));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        const listStores = [
          STORES.PRODUCTS,
          STORES.CATEGORIES,
          STORES.ORDERS,
          STORES.OFFLINE_SALES_QUEUE,
          STORES.STOCK_MOVEMENTS,
          STORES.CUSTOMERS,
          STORES.CREDIT_TRANSACTIONS,
          STORES.SHIFTS_HISTORY,
          STORES.BRANCHES,
          STORES.BRANCH_TRANSFERS,
          STORES.EXPENSES,
          STORES.REMOTE_ORDERS,
          STORES.DELIVERY_ZONES,
          STORES.CPU_RECORDS,
          STORES.SUPPLIER_INVOICES
        ];

        listStores.forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'id' });
          }
        });

        if (!db.objectStoreNames.contains(STORES.KEYVAL)) {
          db.createObjectStore(STORES.KEYVAL);
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('IndexedDB open error:', request.error);
        reject(request.error);
      };
    });
  }

  return dbPromise;
}

/**
 * Save array of entities with 'id' to an object store (clears & batch writes in 1 transaction)
 */
export async function saveList<T extends { id: string }>(
  storeName: string,
  items: T[]
): Promise<boolean> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      store.clear();
      for (const item of items) {
        store.put(item);
      }

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => {
        console.error(`Error saving to store ${storeName}:`, transaction.error);
        reject(transaction.error);
      };
    });
  } catch (err) {
    console.warn(`IndexedDB saveList failed for ${storeName}:`, err);
    return false;
  }
}

/**
 * Load all items from an entity object store
 */
export async function loadList<T>(storeName: string): Promise<T[] | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const raw = request.result;
        const results = Array.isArray(raw)
          ? (raw.filter((item) => item !== null && typeof item === 'object') as T[])
          : [];
        if (results.length > 0) {
          resolve(results);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn(`IndexedDB loadList failed for ${storeName}:`, err);
    return null;
  }
}

/**
 * Set a key-value pair in the KEYVAL store
 */
export async function setKeyVal<T>(key: string, value: T): Promise<boolean> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.KEYVAL], 'readwrite');
      const store = transaction.objectStore(STORES.KEYVAL);
      const request = store.put(value, key);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn(`IndexedDB setKeyVal failed for ${key}:`, err);
    return false;
  }
}

/**
 * Get a key-value pair from the KEYVAL store
 */
export async function getKeyVal<T>(key: string): Promise<T | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.KEYVAL], 'readonly');
      const store = transaction.objectStore(STORES.KEYVAL);
      const request = store.get(key);

      request.onsuccess = () => {
        if (request.result !== undefined) {
          resolve(request.result as T);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn(`IndexedDB getKeyVal failed for ${key}:`, err);
    return null;
  }
}

/**
 * Safe localStorage setter that never crashes if quota is exceeded
 */
export function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    // QuotaExceededError is expected on large catalogs; IndexedDB acts as the authoritative store
  }
}

/**
 * Safe localStorage getter
 */
export function safeLocalStorageGet<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    if (!item) return fallback;
    const parsed = JSON.parse(item);
    if (parsed === null || parsed === undefined) return fallback;
    if (Array.isArray(fallback)) {
      return (Array.isArray(parsed) ? parsed : fallback) as T;
    }
    if (typeof fallback === 'object' && fallback !== null) {
      return (typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback) as T;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

/**
 * Migrate legacy localStorage data into IndexedDB on first load
 */
export async function migrateFromLocalStorage(): Promise<boolean> {
  try {
    const db = await getDB();
    const existingProducts = await loadList<Product>(STORES.PRODUCTS);

    // If products already exist in IndexedDB, migration is complete
    if (existingProducts && existingProducts.length > 0) {
      return true;
    }

    // Attempt migration from legacy localStorage keys
    const lsProducts = safeLocalStorageGet<Product[]>('kadi_pos_products_v3', []);
    if (lsProducts.length > 0) {
      await saveList(STORES.PRODUCTS, lsProducts);
    }

    const lsCategories = safeLocalStorageGet<Category[]>('kadi_pos_categories_v3', []);
    if (lsCategories.length > 0) {
      await saveList(STORES.CATEGORIES, lsCategories);
    }

    const lsOrders = safeLocalStorageGet<Order[]>('kadi_pos_orders', []);
    if (lsOrders.length > 0) {
      await saveList(STORES.ORDERS, lsOrders);
    }

    const lsCustomers = safeLocalStorageGet<Customer[]>('kadi_pos_customers', []);
    if (lsCustomers.length > 0) {
      await saveList(STORES.CUSTOMERS, lsCustomers);
    }

    const lsCreditTxs = safeLocalStorageGet<CreditTransaction[]>('kadi_pos_credit_transactions_v1', []);
    if (lsCreditTxs.length > 0) {
      await saveList(STORES.CREDIT_TRANSACTIONS, lsCreditTxs);
    }

    const lsMovements = safeLocalStorageGet<StockMovement[]>('kadi_pos_stock_movements_v3', []);
    if (lsMovements.length > 0) {
      await saveList(STORES.STOCK_MOVEMENTS, lsMovements);
    }

    const lsBranches = safeLocalStorageGet<Branch[]>('kadi_pos_branches_v1', []);
    if (lsBranches.length > 0) {
      await saveList(STORES.BRANCHES, lsBranches);
    }

    const lsTransfers = safeLocalStorageGet<BranchTransfer[]>('kadi_pos_branch_transfers', []);
    if (lsTransfers.length > 0) {
      await saveList(STORES.BRANCH_TRANSFERS, lsTransfers);
    }

    const lsSettings = safeLocalStorageGet<StoreSettings | null>('kadi_pos_settings_v3', null);
    if (lsSettings) {
      await setKeyVal('settings', lsSettings);
    }

    const lsCurrentShift = safeLocalStorageGet<Shift | null>('kadi_pos_current_shift', null);
    if (lsCurrentShift) {
      await setKeyVal('current_shift', lsCurrentShift);
    }

    const lsShiftsHistory = safeLocalStorageGet<Shift[]>('kadi_pos_shifts_history', []);
    if (lsShiftsHistory.length > 0) {
      await saveList(STORES.SHIFTS_HISTORY, lsShiftsHistory);
    }

    const lsHeld = safeLocalStorageGet<HeldTicket[]>('kadi_pos_held_tickets', []);
    if (lsHeld.length > 0) {
      await setKeyVal('held_tickets', lsHeld);
    }

    const lsCart = safeLocalStorageGet<CartItem[]>('kadi_pos_cart', []);
    if (lsCart.length > 0) {
      await setKeyVal('cart', lsCart);
    }

    return true;
  } catch (err) {
    console.warn('Migration from localStorage to IndexedDB encountered an error:', err);
    return false;
  }
}

/**
 * Get storage estimate (available in modern browsers)
 */
export async function getStorageEstimate(): Promise<{
  quotaMB: number;
  usageMB: number;
  percentage: number;
}> {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const quotaMB = estimate.quota ? Math.round(estimate.quota / (1024 * 1024)) : 0;
      const usageMB = estimate.usage ? Number((estimate.usage / (1024 * 1024)).toFixed(2)) : 0;
      const percentage = quotaMB > 0 ? Number(((usageMB / quotaMB) * 100).toFixed(1)) : 0;
      return { quotaMB, usageMB, percentage };
    } catch {
      return { quotaMB: 1024, usageMB: 5, percentage: 0.5 };
    }
  }
  return { quotaMB: 1024, usageMB: 5, percentage: 0.5 };
}

/**
 * Clear all data in IndexedDB
 */
export async function clearIndexedDB(): Promise<boolean> {
  try {
    const db = await getDB();
    const storeNames = Array.from(db.objectStoreNames);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeNames, 'readwrite');
      storeNames.forEach((name) => {
        transaction.objectStore(name).clear();
      });

      transaction.oncomplete = () => {
        localStorage.clear();
        resolve(true);
      };
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.error('Failed to clear IndexedDB:', err);
    return false;
  }
}

export async function saveProductsToIndexedDB(products: Product[]): Promise<boolean> {
  return saveList(STORES.PRODUCTS, products);
}

export async function loadProductsFromIndexedDB(): Promise<Product[] | null> {
  return loadList<Product>(STORES.PRODUCTS);
}

export async function saveOrdersToIndexedDB(orders: Order[]): Promise<boolean> {
  return saveList(STORES.ORDERS, orders);
}

export async function loadOrdersFromIndexedDB(): Promise<Order[] | null> {
  const rows = await loadList<Order>(STORES.ORDERS);
  if (!rows) return null;
  return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function enqueueOfflineSale(item: OfflineSaleQueueItem): Promise<boolean> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.OFFLINE_SALES_QUEUE], 'readwrite');
      const store = transaction.objectStore(STORES.OFFLINE_SALES_QUEUE);
      store.put(item);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.warn('IndexedDB enqueueOfflineSale failed:', err);
    return false;
  }
}

export async function loadOfflineSalesQueue(): Promise<OfflineSaleQueueItem[]> {
  const rows = await loadList<OfflineSaleQueueItem>(STORES.OFFLINE_SALES_QUEUE);
  if (!rows) return [];
  return rows.sort((a, b) => new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime());
}

export async function saveOfflineSalesQueue(items: OfflineSaleQueueItem[]): Promise<boolean> {
  return saveList(STORES.OFFLINE_SALES_QUEUE, items);
}

export async function removeOfflineSaleFromQueue(orderId: string): Promise<boolean> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.OFFLINE_SALES_QUEUE], 'readwrite');
      const store = transaction.objectStore(STORES.OFFLINE_SALES_QUEUE);
      store.delete(orderId);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.warn('IndexedDB removeOfflineSaleFromQueue failed:', err);
    return false;
  }
}

export async function clearOfflineSalesQueue(): Promise<boolean> {
  return saveList<OfflineSaleQueueItem>(STORES.OFFLINE_SALES_QUEUE, []);
}

export async function saveExpensesToIndexedDB(expenses: Expense[]): Promise<boolean> {
  return saveList(STORES.EXPENSES, expenses);
}

export async function loadExpensesFromIndexedDB(): Promise<Expense[] | null> {
  const rows = await loadList<Expense>(STORES.EXPENSES);
  if (!rows) return null;
  return rows.sort(
    (a, b) =>
      String(b.date || '').localeCompare(String(a.date || '')) ||
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
}

export async function saveRemoteOrdersToIndexedDB(orders: RemoteOrder[]): Promise<boolean> {
  return saveList(STORES.REMOTE_ORDERS, orders);
}

export async function loadRemoteOrdersFromIndexedDB(): Promise<RemoteOrder[] | null> {
  const rows = await loadList<RemoteOrder>(STORES.REMOTE_ORDERS);
  if (!rows) return null;
  return rows.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

export async function saveDeliveryZonesToIndexedDB(zones: DeliveryZone[]): Promise<boolean> {
  return saveList(STORES.DELIVERY_ZONES, zones);
}

export async function loadDeliveryZonesFromIndexedDB(): Promise<DeliveryZone[] | null> {
  return loadList<DeliveryZone>(STORES.DELIVERY_ZONES);
}

export async function saveCpuRecordsToIndexedDB(records: CpuQuarterRecord[]): Promise<boolean> {
  return saveList(STORES.CPU_RECORDS, records);
}

export async function loadCpuRecordsFromIndexedDB(): Promise<CpuQuarterRecord[] | null> {
  const rows = await loadList<CpuQuarterRecord>(STORES.CPU_RECORDS);
  if (!rows) return null;
  return rows.sort(
    (a, b) =>
      (Number(b.year) || 0) - (Number(a.year) || 0) ||
      String(b.quarter || '').localeCompare(String(a.quarter || ''))
  );
}

export async function saveSupplierInvoicesToIndexedDB(invoices: SupplierInvoice[]): Promise<boolean> {
  return saveList(STORES.SUPPLIER_INVOICES, invoices);
}

export async function loadSupplierInvoicesFromIndexedDB(): Promise<SupplierInvoice[] | null> {
  const rows = await loadList<SupplierInvoice>(STORES.SUPPLIER_INVOICES);
  if (!rows) return null;
  return rows.sort(
    (a, b) =>
      String(b.date || '').localeCompare(String(a.date || '')) ||
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
}

export async function saveCustomersToIndexedDB(customers: Customer[]): Promise<boolean> {
  return saveList(STORES.CUSTOMERS, customers);
}

export async function loadCustomersFromIndexedDB(): Promise<Customer[] | null> {
  return loadList<Customer>(STORES.CUSTOMERS);
}

export async function saveCreditTransactionsToIndexedDB(
  txs: CreditTransaction[]
): Promise<boolean> {
  return saveList(STORES.CREDIT_TRANSACTIONS, txs);
}

export async function loadCreditTransactionsFromIndexedDB(): Promise<CreditTransaction[] | null> {
  const rows = await loadList<CreditTransaction>(STORES.CREDIT_TRANSACTIONS);
  if (!rows) return null;
  return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function saveStockMovementsToIndexedDB(movements: StockMovement[]): Promise<boolean> {
  return saveList(STORES.STOCK_MOVEMENTS, movements);
}

export async function loadStockMovementsFromIndexedDB(): Promise<StockMovement[] | null> {
  const rows = await loadList<StockMovement>(STORES.STOCK_MOVEMENTS);
  if (!rows) return null;
  return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}




