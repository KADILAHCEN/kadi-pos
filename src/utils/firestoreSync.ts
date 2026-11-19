import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Unsubscribe
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import {
  ConnectedDeviceInfo,
  EmergencyOpeningSession,
  FirestoreCashState,
  Order,
  Product,
  Shift
} from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { safeLocalStorageSet } from './storage';

export const FIRESTORE_COLLECTION = 'kadi_pos';
export const FIRESTORE_STORE_DOC_ID = 'store';
export const STORE_DOC_PATH = `${FIRESTORE_COLLECTION}/${FIRESTORE_STORE_DOC_ID}`;

const DEVICE_ID_STORAGE_KEY = 'kadi_pos_device_id';
const DEVICE_NAME_STORAGE_KEY = 'kadi_pos_device_name';
const LOCAL_CLOUD_BACKUP_KEY = 'kadi_pos_cloud_backup_v1';
const PENDING_SYNC_ACTIVITY_KEY = 'kadi_pos_cloud_pending_activity';

export interface LocalStoreSyncPayload {
  products: Product[];
  sales: Order[];
  cash: FirestoreCashState;
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

export function saveLocalCloudBackup(payload: LocalStoreSyncPayload): void {
  try {
    const compact: LocalStoreSyncPayload = {
      products: payload.products.slice(0, 2500),
      sales: payload.sales.slice(0, 600),
      cash: {
        currentShift: payload.cash.currentShift,
        shiftsHistory: payload.cash.shiftsHistory.slice(0, 150),
        emergencySessions: payload.cash.emergencySessions.slice(0, 100)
      },
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
      cash: parsed.cash,
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

/**
 * Ensures outgoing document complies strictly with 1MB Firestore document limit and rule caps:
 * - products <= 2500 (strips huge inline base64 images > 4KB to keep doc compact; local IndexedDB keeps full images)
 * - sales <= 500 most recent orders
 * - shiftsHistory <= 120 most recent shifts
 */
export function compactStoreForFirestore(
  payload: LocalStoreSyncPayload
): LocalStoreSyncPayload {
  const compactProducts = payload.products.slice(0, 2400).map((p) => {
    const clean = { ...p };
    if (typeof clean.image === 'string' && clean.image.startsWith('data:') && clean.image.length > 4000) {
      delete clean.image;
    }
    return stripUndefinedDeep(clean);
  });

  const compactSales = payload.sales.slice(0, 500).map((o) => stripUndefinedDeep({ ...o }));

  const compactCash: FirestoreCashState = {
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
    emergencySessions: payload.cash.emergencySessions.slice(0, 80).map((e) => stripUndefinedDeep(e))
  };

  return {
    products: compactProducts,
    sales: compactSales,
    cash: compactCash,
    lastUpdated: Number(payload.lastUpdated) || Date.now(),
    updatedBy: String(payload.updatedBy || 'device').slice(0, 160)
  };
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
 * - Unions products by ID, resolving collisions by item `updatedAt` or store `lastUpdated` (preserving local inline images).
 * - Unions sales orders by ID so parallel checkouts on multiple devices are ALL preserved.
 * - Unions cash drawer shifts, transactions, and emergency sessions without dropping concurrent entries.
 */
export function mergePosStoreData(
  local: LocalStoreSyncPayload,
  remote: LocalStoreSyncPayload
): LocalStoreSyncPayload {
  const remoteIsNewerStore = (remote.lastUpdated || 0) >= (local.lastUpdated || 0);

  // 1. Merge Products by ID
  const localProductMap = new Map<string, Product>();
  local.products.forEach((p) => localProductMap.set(p.id, p));

  const mergedProductsMap = new Map<string, Product>();
  local.products.forEach((p) => mergedProductsMap.set(p.id, p));

  remote.products.forEach((rp) => {
    const lp = localProductMap.get(rp.id);
    if (!lp) {
      mergedProductsMap.set(rp.id, rp);
      return;
    }
    const localTs = lp.updatedAt || local.lastUpdated || 0;
    const remoteTs = rp.updatedAt || remote.lastUpdated || 0;
    const winner = remoteTs > localTs ? rp : remoteTs < localTs ? lp : remoteIsNewerStore ? rp : lp;
    // Preserve high-res local image if Firestore payload stripped base64
    const preservedImage = winner.image || lp.image || rp.image;
    mergedProductsMap.set(
      rp.id,
      preservedImage ? { ...winner, image: preservedImage } : winner
    );
  });

  // 2. Merge Sales Orders by ID (never drop sales created on other devices)
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
    // Ensure refund status isn't accidentally reverted by stale snapshot
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

  return {
    products: Array.from(mergedProductsMap.values()),
    sales: mergedSales,
    cash: {
      currentShift: mergedCurrentShift,
      shiftsHistory: Array.from(shiftHistoryMap.values()).sort(
        (a, b) => Date.parse(b.openedAt || '') - Date.parse(a.openedAt || '')
      ),
      emergencySessions: Array.from(emgMap.values()).sort(
        (a, b) => Date.parse(b.openedAt || '') - Date.parse(a.openedAt || '')
      )
    },
    lastUpdated: Math.max(local.lastUpdated || 0, remote.lastUpdated || 0),
    updatedBy: remoteIsNewerStore ? remote.updatedBy : local.updatedBy
  };
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

export function subscribeStoreSyncDoc(
  onRemoteData: (docData: FirestoreStoreDocument | null, meta: { fromCache: boolean }) => void,
  onSyncError: (errMsg: string) => void
): Unsubscribe {
  const ref = doc(db, FIRESTORE_COLLECTION, FIRESTORE_STORE_DOC_ID);
  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        onRemoteData(null, { fromCache: snapshot.metadata.fromCache });
        return;
      }
      const data = snapshot.data() as Partial<FirestoreStoreDocument>;
      const parsed: FirestoreStoreDocument = {
        products: Array.isArray(data.products) ? data.products : [],
        sales: Array.isArray(data.sales) ? data.sales : [],
        cash: data.cash && typeof data.cash === 'object'
          ? (data.cash as FirestoreCashState)
          : ({} as FirestoreCashState),
        lastUpdated: Number(data.lastUpdated) || 0,
        updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : '',
        devices: sanitizeDevicesMap(data.devices),
        ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : '',
        ownerEmail: typeof data.ownerEmail === 'string' ? data.ownerEmail : '',
        allowedEmails: Array.isArray(data.allowedEmails)
          ? data.allowedEmails.filter((e): e is string => typeof e === 'string').slice(0, 20)
          : []
      };
      onRemoteData(parsed, { fromCache: snapshot.metadata.fromCache });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, STORE_DOC_PATH);
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
}): Promise<FirestoreStoreDocument> {
  const {
    user,
    localPayload,
    cachedRemoteDoc,
    deviceId,
    deviceName,
    cashierName,
    activityLabel,
    online = true
  } = params;

  const storeRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_STORE_DOC_ID);
  let baseRemote = cachedRemoteDoc;

  if (!baseRemote) {
    try {
      const snap = await getDoc(storeRef);
      if (snap.exists()) {
        const d = snap.data() as Partial<FirestoreStoreDocument>;
        baseRemote = {
          products: Array.isArray(d.products) ? d.products : [],
          sales: Array.isArray(d.sales) ? d.sales : [],
          cash: (d.cash || {}) as FirestoreCashState,
          lastUpdated: Number(d.lastUpdated) || 0,
          updatedBy: typeof d.updatedBy === 'string' ? d.updatedBy : '',
          devices: sanitizeDevicesMap(d.devices),
          ownerUid: typeof d.ownerUid === 'string' ? d.ownerUid : user.uid,
          ownerEmail: typeof d.ownerEmail === 'string' ? d.ownerEmail : user.email || '',
          allowedEmails: Array.isArray(d.allowedEmails) ? d.allowedEmails : []
        };
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, STORE_DOC_PATH);
    }
  }

  const merged = baseRemote
    ? mergePosStoreData(localPayload, baseRemote)
    : localPayload;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const compact = compactStoreForFirestore({
    ...merged,
    lastUpdated: Math.max(nowMs, merged.lastUpdated || 0),
    updatedBy: `${deviceId} · ${cashierName}`.slice(0, 160)
  });

  const existingDevices = sanitizeDevicesMap(baseRemote?.devices);
  // Keep max 48 devices (trim oldest if over cap)
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
    lastUpdated: compact.lastUpdated,
    updatedBy: compact.updatedBy,
    devices: nextDevices,
    ownerUid: baseRemote?.ownerUid || user.uid,
    ownerEmail: baseRemote?.ownerEmail || user.email || '',
    allowedEmails: (baseRemote?.allowedEmails || []).slice(0, 20),
    serverSyncedAt: serverTimestamp()
  };

  try {
    await setDoc(storeRef, docToWrite, { merge: false });
    clearPendingCloudSyncFlag();
    return docToWrite;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, STORE_DOC_PATH);
  }
}

export async function updateDeviceRegistryOnly(params: {
  user: User;
  cachedRemoteDoc: FirestoreStoreDocument;
  nextDevices: Record<string, ConnectedDeviceInfo>;
  nextAllowedEmails?: string[];
  deviceId: string;
  cashierName: string;
  activityLabel: string;
}): Promise<void> {
  const { cachedRemoteDoc } = params;
  const storeRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_STORE_DOC_ID);
  const nowMs = Date.now();
  const payload = {
    products: cachedRemoteDoc.products,
    sales: cachedRemoteDoc.sales,
    cash: cachedRemoteDoc.cash,
    lastUpdated: Math.max(nowMs, cachedRemoteDoc.lastUpdated || 0),
    updatedBy: `${params.deviceId} · ${params.cashierName}`.slice(0, 160),
    devices: params.nextDevices,
    ownerUid: cachedRemoteDoc.ownerUid || params.user.uid,
    ownerEmail: cachedRemoteDoc.ownerEmail || params.user.email || '',
    allowedEmails: (params.nextAllowedEmails ?? cachedRemoteDoc.allowedEmails ?? []).slice(0, 20),
    serverSyncedAt: serverTimestamp()
  };
  try {
    await setDoc(storeRef, payload, { merge: false });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, STORE_DOC_PATH);
  }
}
