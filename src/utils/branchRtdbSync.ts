import {
  Database,
  getDatabase,
  onValue,
  push,
  ref,
  runTransaction,
  set
} from 'firebase/database';
import { activeFirebaseConfig, getFirebaseApp } from '../firebase';
import { safeLocalStorageSet } from './storage';

export type BranchKey = 'sefrou' | 'branche2' | 'branche3';

export interface BranchProductItem {
  id: string;
  name: string;
  stock: number;
  initialStock: number;
  updatedAt: number;
  updatedByDevice?: string;
}

export interface BranchSaleEntry {
  id: string;
  branchKey: BranchKey;
  productId: string;
  productName: string;
  delta: number;
  type: 'sale' | 'restock';
  stockAfter: number;
  deviceId: string;
  deviceName: string;
  timestamp: string;
}

export interface BranchDeviceStatus {
  deviceId: string;
  deviceName: string;
  slotIndex: 1 | 2;
  lastSeen: number;
  lastAction?: string;
}

export interface BranchConfig {
  key: BranchKey;
  labelAr: string;
  shortAr: string;
  posBranchId: string;
  rtdbPath: string;
  accentColor: 'emerald' | 'blue' | 'indigo';
  devices: [
    { id: string; defaultName: string; slotIndex: 1 },
    { id: string; defaultName: string; slotIndex: 2 }
  ];
}

export interface BranchStoreSnapshot {
  branchKey: BranchKey;
  products: Record<string, BranchProductItem>;
  sales: BranchSaleEntry[];
  devices: Record<string, BranchDeviceStatus>;
  lastUpdated: number;
}

export interface BranchSyncState {
  mode: 'rtdb' | 'local';
  rtdbConnected: boolean;
  rtdbUrl: string | null;
  error: string | null;
}

export const BRANCH_CONFIGS: Record<BranchKey, BranchConfig> = {
  sefrou: {
    key: 'sefrou',
    labelAr: 'فرع صفرو',
    shortAr: 'صفرو',
    posBranchId: 'branch-sefrou-main',
    rtdbPath: 'branches/sefrou/products',
    accentColor: 'emerald',
    devices: [
      { id: 'sefrou-dev1', defaultName: 'جهاز صفرو 1', slotIndex: 1 },
      { id: 'sefrou-dev2', defaultName: 'جهاز صفرو 2', slotIndex: 2 }
    ]
  },
  branche2: {
    key: 'branche2',
    labelAr: 'فرع 2',
    shortAr: 'فرع 2',
    posBranchId: 'branch-sefrou-bensffar',
    rtdbPath: 'branches/branche2/products',
    accentColor: 'blue',
    devices: [
      { id: 'branche2-dev1', defaultName: 'جهاز فرع 2 - 1', slotIndex: 1 },
      { id: 'branche2-dev2', defaultName: 'جهاز فرع 2 - 2', slotIndex: 2 }
    ]
  },
  branche3: {
    key: 'branche3',
    labelAr: 'فرع 3',
    shortAr: 'فرع 3',
    posBranchId: 'branch-fes-saada',
    rtdbPath: 'branches/branche3/products',
    accentColor: 'indigo',
    devices: [
      { id: 'branche3-dev1', defaultName: 'جهاز فرع 3 - 1', slotIndex: 1 },
      { id: 'branche3-dev2', defaultName: 'جهاز فرع 3 - 2', slotIndex: 2 }
    ]
  }
};

export const ORDERED_BRANCH_KEYS: BranchKey[] = ['sefrou', 'branche2', 'branche3'];

export const INITIAL_BRANCH_PRODUCT_TEMPLATES: Array<{
  id: string;
  name: string;
  stock: number;
}> = [
  { id: 'aicha', name: 'مطيشة عائشة', stock: 94 },
  { id: 'hommos', name: 'حمص', stock: 50 },
  { id: 'sanida', name: 'سنيدة', stock: 80 },
  { id: 'halib', name: 'حليب', stock: 30 }
];

const LOCAL_STORE_PREFIX = 'kadi_branch_rtdb_v1_';
const ACTIVE_BRANCH_KEY_STORAGE = 'kadi_rtdb_active_branch_key';
const DEVICE_SLOT_PREFIX = 'kadi_rtdb_device_slot_';
const DEVICE_CUSTOM_NAME_PREFIX = 'kadi_rtdb_device_name_';
const RTDB_URL_STORAGE_KEY = 'kadi_rtdb_database_url';
const BROADCAST_CHANNEL_NAME = 'kadi_branch_rtdb_channel_v1';
export const BRANCH_RTDB_CHANGED_EVENT = 'kadi:branch-rtdb-changed';

export function buildDefaultProductsMap(): Record<string, BranchProductItem> {
  const now = Date.now();
  const map: Record<string, BranchProductItem> = {};
  for (const tpl of INITIAL_BRANCH_PRODUCT_TEMPLATES) {
    map[tpl.id] = {
      id: tpl.id,
      name: tpl.name,
      stock: tpl.stock,
      initialStock: tpl.stock,
      updatedAt: now
    };
  }
  return map;
}

export function getBranchKeyFromPosBranchId(posBranchId: string): BranchKey {
  if (posBranchId === 'branch-sefrou-bensffar') return 'branche2';
  if (posBranchId === 'branch-fes-saada') return 'branche3';
  return 'sefrou';
}

export function getSavedBranchKey(): BranchKey {
  try {
    const raw = localStorage.getItem(ACTIVE_BRANCH_KEY_STORAGE);
    if (raw === 'sefrou' || raw === 'branche2' || raw === 'branche3') {
      return raw;
    }
  } catch {
    // ignore
  }
  return 'sefrou';
}

export function saveBranchKey(key: BranchKey): void {
  safeLocalStorageSet(ACTIVE_BRANCH_KEY_STORAGE, key);
}

export function getDeviceSlotForBranch(branchKey: BranchKey): {
  deviceId: string;
  deviceName: string;
  slotIndex: 1 | 2;
} {
  const cfg = BRANCH_CONFIGS[branchKey];
  let slotId = cfg.devices[0].id;
  try {
    const saved = localStorage.getItem(`${DEVICE_SLOT_PREFIX}${branchKey}`);
    if (saved && cfg.devices.some((d) => d.id === saved)) {
      slotId = saved;
    }
  } catch {
    // ignore
  }
  const slot = cfg.devices.find((d) => d.id === slotId) || cfg.devices[0];
  let customName = slot.defaultName;
  try {
    const savedName = localStorage.getItem(`${DEVICE_CUSTOM_NAME_PREFIX}${slot.id}`);
    if (savedName && savedName.trim()) {
      customName = savedName.trim().slice(0, 48);
    }
  } catch {
    // ignore
  }
  return {
    deviceId: slot.id,
    deviceName: customName,
    slotIndex: slot.slotIndex
  };
}

export function saveDeviceSlotForBranch(
  branchKey: BranchKey,
  deviceId: string,
  customName?: string
): { deviceId: string; deviceName: string; slotIndex: 1 | 2 } {
  const cfg = BRANCH_CONFIGS[branchKey];
  const slot = cfg.devices.find((d) => d.id === deviceId) || cfg.devices[0];
  safeLocalStorageSet(`${DEVICE_SLOT_PREFIX}${branchKey}`, slot.id);
  if (typeof customName === 'string' && customName.trim()) {
    safeLocalStorageSet(`${DEVICE_CUSTOM_NAME_PREFIX}${slot.id}`, customName.trim().slice(0, 48));
  }
  return getDeviceSlotForBranch(branchKey);
}

export function isValidRtdbUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  return /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.(firebaseio\.com|firebasedatabase\.app)\/?$/i.test(
    trimmed
  );
}

export function extractRtdbDbNameFromInput(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  // Match Firebase Console URL: https://console.firebase.google.com/project/<proj>/database/<dbName>/data...
  const consoleMatch = trimmed.match(
    /console\.firebase\.google\.com\/project\/[^/]+\/database\/([a-z0-9-]+)/i
  );
  if (consoleMatch?.[1]) return consoleMatch[1];
  // Match direct RTDB host
  const directMatch = trimmed.match(
    /^https:\/\/([a-z0-9-]+)(?:\.[a-z0-9-]+)*\.(?:firebaseio\.com|firebasedatabase\.app)/i
  );
  if (directMatch?.[1]) return directMatch[1];
  return null;
}

export function buildCandidateRtdbUrls(dbNameOrProjectId: string): string[] {
  const clean = dbNameOrProjectId.trim().replace(/\/+$/, '');
  const dbName = clean.endsWith('-default-rtdb') ? clean : `${clean}-default-rtdb`;
  return [
    `https://${dbName}.firebaseio.com`,
    `https://${dbName}.europe-west1.firebasedatabase.app`,
    `https://${dbName}.asia-southeast1.firebasedatabase.app`
  ];
}

async function probeSingleRtdbUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`${url.replace(/\/+$/, '')}/.json?shallow=true`, {
      method: 'GET',
      signal: controller.signal
    });
    window.clearTimeout(timer);
    // 200 (public/data) or 401/403 (rules require auth) prove this regional RTDB instance exists; 404 means wrong region
    return res.status === 200 || res.status === 401 || res.status === 403;
  } catch {
    return false;
  }
}

export async function resolveAndSaveRtdbUrlFromInput(
  rawInput: string
): Promise<{ url: string | null; error?: string }> {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    setConfiguredRtdbUrl(null);
    return { url: null };
  }
  if (isValidRtdbUrl(trimmed)) {
    const clean = trimmed.replace(/\/+$/, '');
    setConfiguredRtdbUrl(clean);
    return { url: clean };
  }
  const dbName = extractRtdbDbNameFromInput(trimmed);
  if (dbName) {
    const candidates = buildCandidateRtdbUrls(dbName);
    for (const candidate of candidates) {
      if (await probeSingleRtdbUrl(candidate)) {
        setConfiguredRtdbUrl(candidate);
        return { url: candidate };
      }
    }
    // Default to US endpoint if offline during probe
    setConfiguredRtdbUrl(candidates[0]);
    return { url: candidates[0] };
  }
  return {
    url: null,
    error:
      'الرابط خاصو يكون بحال: https://kadi-pos-default-rtdb.firebaseio.com أو .firebasedatabase.app'
  };
}

export async function detectAndConnectProjectRtdb(projectId?: string): Promise<string | null> {
  const existing = getConfiguredRtdbUrl();
  if (existing) return existing;
  const pid = (projectId || activeFirebaseConfig.projectId || '').trim();
  if (!pid) return null;

  const candidates = buildCandidateRtdbUrls(pid);
  for (const candidate of candidates) {
    if (await probeSingleRtdbUrl(candidate)) {
      setConfiguredRtdbUrl(candidate);
      return candidate;
    }
  }
  return null;
}

export function getConfiguredRtdbUrl(): string | null {
  try {
    const saved = localStorage.getItem(RTDB_URL_STORAGE_KEY);
    if (isValidRtdbUrl(saved)) return saved!.trim().replace(/\/+$/, '');
  } catch {
    // ignore
  }
  const envUrl = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_FIREBASE_DATABASE_URL;
  if (isValidRtdbUrl(envUrl)) return envUrl!.trim().replace(/\/+$/, '');

  const cfgUrl = (activeFirebaseConfig as Record<string, unknown>).databaseURL;
  if (typeof cfgUrl === 'string' && isValidRtdbUrl(cfgUrl)) {
    return cfgUrl.trim().replace(/\/+$/, '');
  }
  return null;
}

export function setConfiguredRtdbUrl(url: string | null): void {
  try {
    if (!url || !url.trim()) {
      localStorage.removeItem(RTDB_URL_STORAGE_KEY);
    } else if (isValidRtdbUrl(url)) {
      localStorage.setItem(RTDB_URL_STORAGE_KEY, url.trim().replace(/\/+$/, ''));
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(BRANCH_RTDB_CHANGED_EVENT));
    }
  } catch {
    // ignore
  }
}

function getRtdbInstance(): Database | null {
  const url = getConfiguredRtdbUrl();
  if (!url) return null;
  try {
    return getDatabase(getFirebaseApp(), url);
  } catch {
    return null;
  }
}

export function loadLocalBranchSnapshot(branchKey: BranchKey): BranchStoreSnapshot {
  const storageKey = `${LOCAL_STORE_PREFIX}${branchKey}`;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<BranchStoreSnapshot>;
      if (parsed && parsed.products && typeof parsed.products === 'object') {
        const defaultDevices: Record<string, BranchDeviceStatus> = {};
        BRANCH_CONFIGS[branchKey].devices.forEach((d) => {
          defaultDevices[d.id] = {
            deviceId: d.id,
            deviceName: d.defaultName,
            slotIndex: d.slotIndex,
            lastSeen: parsed.devices?.[d.id]?.lastSeen || 0,
            lastAction: parsed.devices?.[d.id]?.lastAction
          };
        });
        return {
          branchKey,
          products: parsed.products,
          sales: Array.isArray(parsed.sales) ? parsed.sales : [],
          devices: { ...defaultDevices, ...(parsed.devices || {}) },
          lastUpdated: Number(parsed.lastUpdated) || Date.now()
        };
      }
    }
  } catch {
    // fallback to defaults
  }

  const defaultDevices: Record<string, BranchDeviceStatus> = {};
  BRANCH_CONFIGS[branchKey].devices.forEach((d) => {
    defaultDevices[d.id] = {
      deviceId: d.id,
      deviceName: d.defaultName,
      slotIndex: d.slotIndex,
      lastSeen: 0
    };
  });

  const initial: BranchStoreSnapshot = {
    branchKey,
    products: buildDefaultProductsMap(),
    sales: [],
    devices: defaultDevices,
    lastUpdated: Date.now()
  };
  saveLocalBranchSnapshot(initial);
  return initial;
}

function broadcastSnapshot(snapshot: BranchStoreSnapshot): void {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      ch.postMessage({ type: 'BRANCH_UPDATE', branchKey: snapshot.branchKey, snapshot });
      ch.close();
    }
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(BRANCH_RTDB_CHANGED_EVENT, {
        detail: { branchKey: snapshot.branchKey }
      })
    );
  }
}

export function saveLocalBranchSnapshot(snapshot: BranchStoreSnapshot, broadcast = false): void {
  safeLocalStorageSet(`${LOCAL_STORE_PREFIX}${snapshot.branchKey}`, JSON.stringify(snapshot));
  if (broadcast) {
    broadcastSnapshot(snapshot);
  }
}

function normalizeRtdbProducts(
  rawProducts: unknown
): Record<string, BranchProductItem> {
  if (!rawProducts || typeof rawProducts !== 'object') {
    return buildDefaultProductsMap();
  }
  const out: Record<string, BranchProductItem> = {};
  Object.entries(rawProducts as Record<string, unknown>).forEach(([id, val]) => {
    if (!val || typeof val !== 'object') return;
    const item = val as Partial<BranchProductItem>;
    out[id] = {
      id: item.id || id,
      name: typeof item.name === 'string' && item.name.trim() ? item.name : id,
      stock: typeof item.stock === 'number' && Number.isFinite(item.stock) ? Math.max(0, item.stock) : 0,
      initialStock: typeof item.initialStock === 'number' ? item.initialStock : 0,
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
      updatedByDevice: item.updatedByDevice
    };
  });
  return Object.keys(out).length > 0 ? out : buildDefaultProductsMap();
}

function normalizeRtdbSales(rawSales: unknown): BranchSaleEntry[] {
  if (!rawSales || typeof rawSales !== 'object') return [];
  const entries = Array.isArray(rawSales)
    ? rawSales
    : Object.values(rawSales as Record<string, unknown>);
  return entries
    .filter((x): x is BranchSaleEntry => !!x && typeof x === 'object' && 'productName' in x)
    .sort((a, b) => Date.parse(b.timestamp || '') - Date.parse(a.timestamp || ''))
    .slice(0, 120);
}

export function subscribeBranchData(
  branchKey: BranchKey,
  onSnapshot: (snapshot: BranchStoreSnapshot) => void,
  onSyncState: (state: BranchSyncState) => void
): () => void {
  let active = true;
  let current = loadLocalBranchSnapshot(branchKey);
  onSnapshot(current);

  const rtdbUrl = getConfiguredRtdbUrl();
  const rtdb = getRtdbInstance();

  if (!rtdb || !rtdbUrl) {
    onSyncState({
      mode: 'local',
      rtdbConnected: false,
      rtdbUrl: null,
      error: null
    });
  } else {
    onSyncState({
      mode: 'rtdb',
      rtdbConnected: false,
      rtdbUrl,
      error: null
    });
  }

  // Listen to cross-tab BroadcastChannel + localStorage + same-tab events
  let ch: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      ch = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      ch.onmessage = (event) => {
        if (!active) return;
        const msg = event.data as {
          type?: string;
          branchKey?: BranchKey;
          snapshot?: BranchStoreSnapshot;
        };
        if (msg?.type === 'BRANCH_UPDATE' && msg.branchKey === branchKey && msg.snapshot) {
          current = msg.snapshot;
          saveLocalBranchSnapshot(current, false);
          onSnapshot(current);
        }
      };
    } catch {
      ch = null;
    }
  }

  const handleStorage = (evt: StorageEvent) => {
    if (!active) return;
    if (evt.key === `${LOCAL_STORE_PREFIX}${branchKey}`) {
      current = loadLocalBranchSnapshot(branchKey);
      onSnapshot(current);
    }
  };

  const handleCustom = (evt: Event) => {
    if (!active) return;
    const detail = (evt as CustomEvent<{ branchKey?: BranchKey }>).detail;
    if (!detail?.branchKey || detail.branchKey === branchKey) {
      current = loadLocalBranchSnapshot(branchKey);
      onSnapshot(current);
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(BRANCH_RTDB_CHANGED_EVENT, handleCustom);

  // Firebase Realtime Database live listeners on branches/{branchKey}/...
  const unsubFns: Array<() => void> = [];
  if (rtdb && rtdbUrl) {
    const productsRef = ref(rtdb, `branches/${branchKey}/products`);
    const salesRef = ref(rtdb, `branches/${branchKey}/sales`);
    const devicesRef = ref(rtdb, `branches/${branchKey}/devices`);

    const unsubProducts = onValue(
      productsRef,
      (snap) => {
        if (!active) return;
        if (!snap.exists()) {
          // Seed initial products into RTDB path branches/{branchKey}/products
          const seedMap = current.products || buildDefaultProductsMap();
          void set(productsRef, seedMap)
            .then(() => {
              if (!active) return;
              onSyncState({
                mode: 'rtdb',
                rtdbConnected: true,
                rtdbUrl,
                error: null
              });
            })
            .catch((err: unknown) => {
              if (!active) return;
              const msg = err instanceof Error ? err.message : 'تعذر الكتابة في Firebase Realtime Database';
              onSyncState({
                mode: 'rtdb',
                rtdbConnected: false,
                rtdbUrl,
                error: msg
              });
            });
          return;
        }
        const normalized = normalizeRtdbProducts(snap.val());
        current = {
          ...current,
          products: normalized,
          lastUpdated: Date.now()
        };
        saveLocalBranchSnapshot(current, false);
        onSnapshot(current);
        onSyncState({
          mode: 'rtdb',
          rtdbConnected: true,
          rtdbUrl,
          error: null
        });
      },
      (err) => {
        if (!active) return;
        onSyncState({
          mode: 'rtdb',
          rtdbConnected: false,
          rtdbUrl,
          error: err.message || 'تعذر الاتصال بـ Firebase Realtime Database'
        });
      }
    );
    unsubFns.push(unsubProducts);

    const unsubSales = onValue(salesRef, (snap) => {
      if (!active) return;
      const salesList = normalizeRtdbSales(snap.val());
      current = {
        ...current,
        sales: salesList,
        lastUpdated: Date.now()
      };
      saveLocalBranchSnapshot(current, false);
      onSnapshot(current);
    });
    unsubFns.push(unsubSales);

    const unsubDevices = onValue(devicesRef, (snap) => {
      if (!active) return;
      const val = snap.val();
      if (val && typeof val === 'object') {
        current = {
          ...current,
          devices: { ...current.devices, ...(val as Record<string, BranchDeviceStatus>) },
          lastUpdated: Date.now()
        };
        saveLocalBranchSnapshot(current, false);
        onSnapshot(current);
      }
    });
    unsubFns.push(unsubDevices);
  }

  return () => {
    active = false;
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(BRANCH_RTDB_CHANGED_EVENT, handleCustom);
    if (ch) ch.close();
    unsubFns.forEach((fn) => fn());
  };
}

export async function adjustBranchProductStock(params: {
  branchKey: BranchKey;
  productId: string;
  delta: 1 | -1;
  deviceId: string;
  deviceName: string;
}): Promise<{ success: boolean; newStock: number; error?: string }> {
  const { branchKey, productId, delta, deviceId, deviceName } = params;
  const snapshot = loadLocalBranchSnapshot(branchKey);
  const existing = snapshot.products[productId];
  if (!existing) {
    return { success: false, newStock: 0, error: 'المنتوج ما كاينش فهاد الفرع' };
  }

  if (delta < 0 && existing.stock <= 0) {
    return {
      success: false,
      newStock: 0,
      error: `❌ ${existing.name} تسالا (المخزون: 0)`
    };
  }

  const now = Date.now();
  const nextStock = Math.max(0, existing.stock + delta);
  const entry: BranchSaleEntry = {
    id: `bs-${now}-${Math.random().toString(36).slice(2, 6)}`,
    branchKey,
    productId,
    productName: existing.name,
    delta,
    type: delta < 0 ? 'sale' : 'restock',
    stockAfter: nextStock,
    deviceId,
    deviceName,
    timestamp: new Date(now).toISOString()
  };

  const slot =
    BRANCH_CONFIGS[branchKey].devices.find((d) => d.id === deviceId)?.slotIndex || 1;

  const updatedSnapshot: BranchStoreSnapshot = {
    ...snapshot,
    products: {
      ...snapshot.products,
      [productId]: {
        ...existing,
        stock: nextStock,
        updatedAt: now,
        updatedByDevice: deviceName
      }
    },
    sales: [entry, ...snapshot.sales].slice(0, 120),
    devices: {
      ...snapshot.devices,
      [deviceId]: {
        deviceId,
        deviceName,
        slotIndex: slot,
        lastSeen: now,
        lastAction: `${delta < 0 ? 'بيع -1' : 'زيد +1'} · ${existing.name}`
      }
    },
    lastUpdated: now
  };

  saveLocalBranchSnapshot(updatedSnapshot, true);

  // Sync atomically to Firebase Realtime Database if configured
  const rtdb = getRtdbInstance();
  if (rtdb) {
    try {
      const productRef = ref(rtdb, `branches/${branchKey}/products/${productId}`);
      await runTransaction(productRef, (currentNode) => {
        const base =
          currentNode && typeof currentNode === 'object'
            ? (currentNode as BranchProductItem)
            : existing;
        const currStock = typeof base.stock === 'number' ? base.stock : existing.stock;
        const computed = delta < 0 ? Math.max(0, currStock + delta) : currStock + delta;
        return {
          ...base,
          stock: computed,
          updatedAt: now,
          updatedByDevice: deviceName
        };
      });

      await push(ref(rtdb, `branches/${branchKey}/sales`), entry);
      await set(ref(rtdb, `branches/${branchKey}/devices/${deviceId}`), {
        deviceId,
        deviceName,
        slotIndex: slot,
        lastSeen: now,
        lastAction: `${delta < 0 ? 'بيع -1' : 'زيد +1'} · ${existing.name}`
      });
    } catch {
      // Local + BroadcastChannel state already updated cleanly
    }
  }

  return { success: true, newStock: nextStock };
}

export async function addBranchProduct(params: {
  branchKey: BranchKey;
  name: string;
  stock: number;
  deviceId: string;
  deviceName: string;
}): Promise<{ success: boolean; error?: string }> {
  const cleanName = params.name.trim();
  if (!cleanName) {
    return { success: false, error: 'كتب سميت المنتوج أولا' };
  }
  const safeStock = Math.max(0, Math.round(Number(params.stock) || 0));
  const id = `prod_${Date.now().toString(36)}`;
  const now = Date.now();
  const snapshot = loadLocalBranchSnapshot(params.branchKey);

  const newItem: BranchProductItem = {
    id,
    name: cleanName,
    stock: safeStock,
    initialStock: safeStock,
    updatedAt: now,
    updatedByDevice: params.deviceName
  };

  const nextSnapshot: BranchStoreSnapshot = {
    ...snapshot,
    products: {
      ...snapshot.products,
      [id]: newItem
    },
    lastUpdated: now
  };
  saveLocalBranchSnapshot(nextSnapshot, true);

  const rtdb = getRtdbInstance();
  if (rtdb) {
    try {
      await set(ref(rtdb, `branches/${params.branchKey}/products/${id}`), newItem);
    } catch {
      // ignore if offline
    }
  }

  return { success: true };
}

export async function resetBranchToDefaults(branchKey: BranchKey): Promise<void> {
  const snapshot = loadLocalBranchSnapshot(branchKey);
  const defaults = buildDefaultProductsMap();
  const next: BranchStoreSnapshot = {
    ...snapshot,
    products: defaults,
    lastUpdated: Date.now()
  };
  saveLocalBranchSnapshot(next, true);

  const rtdb = getRtdbInstance();
  if (rtdb) {
    try {
      await set(ref(rtdb, `branches/${branchKey}/products`), defaults);
    } catch {
      // ignore
    }
  }
}

export async function clearBranchSalesLog(branchKey: BranchKey): Promise<void> {
  const snapshot = loadLocalBranchSnapshot(branchKey);
  const next: BranchStoreSnapshot = {
    ...snapshot,
    sales: [],
    lastUpdated: Date.now()
  };
  saveLocalBranchSnapshot(next, true);

  const rtdb = getRtdbInstance();
  if (rtdb) {
    try {
      await set(ref(rtdb, `branches/${branchKey}/sales`), null);
    } catch {
      // ignore
    }
  }
}

export async function pingBranchDevicePresence(
  branchKey: BranchKey,
  deviceId: string,
  deviceName: string
): Promise<void> {
  const now = Date.now();
  const slot =
    BRANCH_CONFIGS[branchKey].devices.find((d) => d.id === deviceId)?.slotIndex || 1;
  const snapshot = loadLocalBranchSnapshot(branchKey);
  const prevDev = snapshot.devices[deviceId];
  const nextDev: BranchDeviceStatus = {
    deviceId,
    deviceName,
    slotIndex: slot,
    lastSeen: now,
    lastAction: prevDev?.lastAction || 'متصل الآن'
  };
  const next: BranchStoreSnapshot = {
    ...snapshot,
    devices: {
      ...snapshot.devices,
      [deviceId]: nextDev
    },
    lastUpdated: now
  };
  saveLocalBranchSnapshot(next, true);

  const rtdb = getRtdbInstance();
  if (rtdb) {
    try {
      await set(ref(rtdb, `branches/${branchKey}/devices/${deviceId}`), nextDev);
    } catch {
      // ignore
    }
  }
}
