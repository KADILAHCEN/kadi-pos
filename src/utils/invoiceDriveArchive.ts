import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  updateDoc,
  where
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  deleteDriveFile,
  ensureKadiInvoicesDriveFolder,
  getWorkspaceAccessToken,
  uploadFileToDriveFolder
} from './googleWorkspace';
import { safeLocalStorageGet, safeLocalStorageSet } from './storage';

export const INVOICE_SCANS_COLLECTION = 'invoice_scans';
const LOCAL_INVOICE_ARCHIVE_CACHE_KEY = 'kadi_pos_invoice_scans_cache_v1';

// Blueprint-synchronized volumetric limits & patterns (firebase-blueprint.json -> InvoiceScan)
export const MAX_DRIVE_FILE_ID_LEN = 256;
export const MAX_DRIVE_FOLDER_ID_LEN = 256;
export const MAX_FILE_NAME_LEN = 256;
export const MAX_MIME_LEN = 120;
export const MAX_WEB_VIEW_LINK_LEN = 512;
export const MAX_INVOICE_NUMBER_LEN = 120;
export const MAX_VENDOR_NAME_LEN = 160;
export const MAX_DATE_LEN = 32;
export const MAX_VENDOR_ICE_LEN = 20;
export const MAX_NOTES_LEN = 500;
export const MAX_UID_LEN = 128;
export const MAX_EMAIL_LEN = 160;
export const VALID_DOC_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

export interface DriveUploadSuccessPayload {
  driveFileId: string;
  driveFolderId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  webViewLink?: string;
}

export interface InvoiceDriveRecord {
  id: string;
  driveFileId: string;
  driveFolderId?: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
  webViewLink?: string;
  invoiceNumber: string;
  vendorName: string;
  date: string;
  invoiceDate?: string;
  vendorIce?: string;
  totalAmount?: number;
  notes?: string;
  userId: string;
  userEmail: string;
  createdAtMs: number;
  updatedAtMs: number;
}

function clampStr(val: string | undefined | null, maxLen: number): string {
  return String(val || '').trim().slice(0, maxLen);
}

function toTimestampMs(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === 'object' && 'toMillis' in raw) {
    const fn = (raw as { toMillis?: () => number }).toMillis;
    if (typeof fn === 'function') {
      const ms = fn.call(raw);
      if (Number.isFinite(ms)) return ms;
    }
  }
  if (typeof raw === 'string') {
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) return ms;
  }
  return Date.now();
}

function parseDocToRecord(id: string, data: Record<string, unknown>): InvoiceDriveRecord {
  const resolvedDate = clampStr(
    (typeof data.date === 'string' ? data.date : (data.invoiceDate as string)) || '',
    MAX_DATE_LEN
  );
  const resolvedUid = clampStr(
    (typeof data.userId === 'string' ? data.userId : (data.ownerUid as string)) || '',
    MAX_UID_LEN
  );
  const resolvedEmail = clampStr(
    (typeof data.userEmail === 'string' ? data.userEmail : (data.ownerEmail as string)) || '',
    MAX_EMAIL_LEN
  );

  return {
    id,
    driveFileId: clampStr(data.driveFileId as string, MAX_DRIVE_FILE_ID_LEN),
    driveFolderId:
      typeof data.driveFolderId === 'string' && data.driveFolderId
        ? clampStr(data.driveFolderId, MAX_DRIVE_FOLDER_ID_LEN)
        : undefined,
    fileName: clampStr(data.fileName as string, MAX_FILE_NAME_LEN) || 'invoice-image',
    mimeType: clampStr(data.mimeType as string, MAX_MIME_LEN) || 'image/jpeg',
    fileSize: typeof data.fileSize === 'number' && data.fileSize >= 0 ? data.fileSize : undefined,
    webViewLink:
      typeof data.webViewLink === 'string' && data.webViewLink
        ? clampStr(data.webViewLink, MAX_WEB_VIEW_LINK_LEN)
        : undefined,
    invoiceNumber: clampStr(data.invoiceNumber as string, MAX_INVOICE_NUMBER_LEN),
    vendorName: clampStr(data.vendorName as string, MAX_VENDOR_NAME_LEN),
    date: resolvedDate,
    invoiceDate: resolvedDate || undefined,
    vendorIce:
      typeof data.vendorIce === 'string' && data.vendorIce
        ? clampStr(data.vendorIce, MAX_VENDOR_ICE_LEN)
        : undefined,
    totalAmount:
      typeof data.totalAmount === 'number' && Number.isFinite(data.totalAmount)
        ? Math.max(0, data.totalAmount)
        : undefined,
    notes:
      typeof data.notes === 'string' && data.notes
        ? clampStr(data.notes, MAX_NOTES_LEN)
        : undefined,
    userId: resolvedUid,
    userEmail: resolvedEmail,
    createdAtMs: toTimestampMs(data.createdAt),
    updatedAtMs: toTimestampMs(data.updatedAt)
  };
}

export function loadCachedInvoiceDriveRecords(): InvoiceDriveRecord[] {
  try {
    const raw = safeLocalStorageGet(LOCAL_INVOICE_ARCHIVE_CACHE_KEY, '');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as InvoiceDriveRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveCachedInvoiceDriveRecords(records: InvoiceDriveRecord[]): void {
  try {
    safeLocalStorageSet(
      LOCAL_INVOICE_ARCHIVE_CACHE_KEY,
      JSON.stringify(records.slice(0, 100))
    );
  } catch {
    // ignore local quota error
  }
}

function upsertLocalCacheRecord(record: InvoiceDriveRecord): void {
  const prev = loadCachedInvoiceDriveRecords();
  const next = [record, ...prev.filter((r) => r.id !== record.id)].sort(
    (a, b) => b.createdAtMs - a.createdAtMs
  );
  saveCachedInvoiceDriveRecords(next);
}

function buildInvoiceUploadFilename(params: {
  originalName?: string;
  invoiceNumber?: string;
  vendorName?: string;
  mimeType: string;
}): string {
  const extFromMime =
    params.mimeType === 'application/pdf'
      ? 'pdf'
      : params.mimeType === 'image/png'
      ? 'png'
      : params.mimeType === 'image/webp'
      ? 'webp'
      : 'jpg';

  const sanitizePart = (s: string) =>
    s
      .trim()
      .replace(/[\\/:*?"<>|#%]+/g, '-')
      .replace(/\s+/g, '_')
      .slice(0, 48);

  const vendorPart = sanitizePart(params.vendorName || '');
  const invPart = sanitizePart(params.invoiceNumber || '');
  const datePart = new Date().toISOString().slice(0, 10);

  if (vendorPart || invPart) {
    const parts = ['KadiPOS_Invoice', vendorPart, invPart, datePart].filter(Boolean);
    return `${parts.join('_')}.${extFromMime}`.slice(0, MAX_FILE_NAME_LEN);
  }

  if (params.originalName && params.originalName.trim()) {
    return clampStr(params.originalName, MAX_FILE_NAME_LEN);
  }

  return `KadiPOS_Invoice_${datePart}_${Date.now().toString().slice(-4)}.${extFromMime}`;
}

export async function uploadInvoiceFileToGoogleDrive(params: {
  fileBlob: Blob;
  originalFileName?: string;
  preferredFolderId?: string;
  invoiceNumber?: string;
  vendorName?: string;
}): Promise<DriveUploadSuccessPayload> {
  const token = getWorkspaceAccessToken();
  if (!token) {
    throw new Error('AUTH_REQUIRED');
  }

  const mimeType =
    clampStr(params.fileBlob.type || 'image/jpeg', MAX_MIME_LEN) || 'image/jpeg';
  const filename = buildInvoiceUploadFilename({
    originalName: params.originalFileName,
    invoiceNumber: params.invoiceNumber,
    vendorName: params.vendorName,
    mimeType
  });

  const folderId = await ensureKadiInvoicesDriveFolder(params.preferredFolderId);
  const driveItem = await uploadFileToDriveFolder({
    folderId,
    filename,
    content: params.fileBlob,
    mimeType
  });

  if (!driveItem.id) {
    throw new Error('Google Drive did not return a file ID');
  }

  const parsedSize = Number(driveItem.size) || params.fileBlob.size || 0;

  return {
    driveFileId: clampStr(driveItem.id, MAX_DRIVE_FILE_ID_LEN),
    driveFolderId: clampStr(folderId, MAX_DRIVE_FOLDER_ID_LEN),
    fileName: clampStr(driveItem.name || filename, MAX_FILE_NAME_LEN),
    mimeType: clampStr(driveItem.mimeType || mimeType, MAX_MIME_LEN),
    fileSize: Math.min(104_857_600, Math.max(0, Math.round(parsedSize))),
    webViewLink: driveItem.webViewLink
      ? clampStr(driveItem.webViewLink, MAX_WEB_VIEW_LINK_LEN)
      : undefined
  };
}

export async function saveInvoiceScanToFirestore(params: {
  driveUpload: DriveUploadSuccessPayload;
  invoiceNumber: string;
  vendorName: string;
  date: string;
  vendorIce?: string;
  totalAmount?: number;
  notes?: string;
}): Promise<InvoiceDriveRecord> {
  const user = auth.currentUser;

  if (!user || !user.emailVerified || !user.email) {
    throw new Error('AUTH_REQUIRED');
  }
  if (!VALID_DOC_ID_REGEX.test(user.uid)) {
    throw new Error('Invalid Firebase UID for invoice scan record');
  }

  const docId = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const docPath = `${INVOICE_SCANS_COLLECTION}/${docId}`;

  const cleanDriveId = clampStr(params.driveUpload.driveFileId, MAX_DRIVE_FILE_ID_LEN);
  const cleanFolderId = clampStr(params.driveUpload.driveFolderId, MAX_DRIVE_FOLDER_ID_LEN);
  const cleanFileName = clampStr(params.driveUpload.fileName, MAX_FILE_NAME_LEN) || 'invoice-image';
  const cleanMime = clampStr(params.driveUpload.mimeType, MAX_MIME_LEN) || 'image/jpeg';
  const cleanWebViewLink = params.driveUpload.webViewLink
    ? clampStr(params.driveUpload.webViewLink, MAX_WEB_VIEW_LINK_LEN)
    : undefined;
  const cleanFileSize = Math.min(
    104_857_600,
    Math.max(0, Math.round(Number(params.driveUpload.fileSize) || 0))
  );
  const cleanInvoiceNum = clampStr(params.invoiceNumber, MAX_INVOICE_NUMBER_LEN);
  const cleanVendorName = clampStr(params.vendorName, MAX_VENDOR_NAME_LEN);
  const cleanDate = clampStr(params.date, MAX_DATE_LEN);
  const cleanIce = clampStr((params.vendorIce || '').replace(/[^0-9]/g, ''), MAX_VENDOR_ICE_LEN);
  const cleanNotes = clampStr(params.notes, MAX_NOTES_LEN);
  const cleanTotal =
    typeof params.totalAmount === 'number' && Number.isFinite(params.totalAmount)
      ? Math.max(0, Number(params.totalAmount.toFixed(2)))
      : undefined;
  const cleanUserEmail = clampStr(user.email, MAX_EMAIL_LEN);

  const firestorePayload: Record<string, unknown> = {
    driveFileId: cleanDriveId,
    driveFolderId: cleanFolderId,
    fileName: cleanFileName,
    mimeType: cleanMime,
    fileSize: cleanFileSize,
    invoiceNumber: cleanInvoiceNum,
    vendorName: cleanVendorName,
    date: cleanDate,
    userId: user.uid,
    userEmail: cleanUserEmail,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  if (cleanWebViewLink) firestorePayload.webViewLink = cleanWebViewLink;
  if (cleanIce) firestorePayload.vendorIce = cleanIce;
  if (cleanTotal !== undefined) firestorePayload.totalAmount = cleanTotal;
  if (cleanNotes) firestorePayload.notes = cleanNotes;

  try {
    await setDoc(doc(db, INVOICE_SCANS_COLLECTION, docId), firestorePayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, docPath);
  }

  const nowMs = Date.now();
  const record: InvoiceDriveRecord = {
    id: docId,
    driveFileId: cleanDriveId,
    driveFolderId: cleanFolderId,
    fileName: cleanFileName,
    mimeType: cleanMime,
    fileSize: cleanFileSize,
    webViewLink: cleanWebViewLink,
    invoiceNumber: cleanInvoiceNum,
    vendorName: cleanVendorName,
    date: cleanDate,
    invoiceDate: cleanDate || undefined,
    vendorIce: cleanIce || undefined,
    totalAmount: cleanTotal,
    notes: cleanNotes || undefined,
    userId: user.uid,
    userEmail: cleanUserEmail,
    createdAtMs: nowMs,
    updatedAtMs: nowMs
  };

  upsertLocalCacheRecord(record);
  return record;
}

export async function updateInvoiceDriveMetadataInFirestore(
  recordId: string,
  patch: {
    invoiceNumber?: string;
    vendorName?: string;
    date?: string;
    vendorIce?: string;
    totalAmount?: number;
    notes?: string;
  }
): Promise<void> {
  if (!VALID_DOC_ID_REGEX.test(recordId)) return;
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const docPath = `${INVOICE_SCANS_COLLECTION}/${recordId}`;
  const updatePayload: Record<string, unknown> = {
    updatedAt: serverTimestamp()
  };

  if (patch.invoiceNumber !== undefined) {
    updatePayload.invoiceNumber = clampStr(patch.invoiceNumber, MAX_INVOICE_NUMBER_LEN);
  }
  if (patch.vendorName !== undefined) {
    updatePayload.vendorName = clampStr(patch.vendorName, MAX_VENDOR_NAME_LEN);
  }
  if (patch.date !== undefined) {
    updatePayload.date = clampStr(patch.date, MAX_DATE_LEN);
  }
  if (patch.vendorIce !== undefined) {
    updatePayload.vendorIce = clampStr(
      patch.vendorIce.replace(/[^0-9]/g, ''),
      MAX_VENDOR_ICE_LEN
    );
  }
  if (patch.totalAmount !== undefined && Number.isFinite(patch.totalAmount)) {
    updatePayload.totalAmount = Math.max(0, Number(patch.totalAmount.toFixed(2)));
  }
  if (patch.notes !== undefined) {
    updatePayload.notes = clampStr(patch.notes, MAX_NOTES_LEN);
  }

  try {
    await updateDoc(doc(db, INVOICE_SCANS_COLLECTION, recordId), updatePayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, docPath);
  }
}

export async function listInvoiceDriveRecordsFromFirestore(
  user: User
): Promise<InvoiceDriveRecord[]> {
  if (!user.emailVerified) return [];
  const q = query(
    collection(db, INVOICE_SCANS_COLLECTION),
    where('userId', '==', user.uid),
    limit(100)
  );
  try {
    const snap = await getDocs(q);
    const records = snap.docs
      .map((d) => parseDocToRecord(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
    saveCachedInvoiceDriveRecords(records);
    return records;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, INVOICE_SCANS_COLLECTION);
  }
}

export function subscribeInvoiceDriveRecords(
  user: User,
  onData: (records: InvoiceDriveRecord[]) => void,
  onError?: (errMessage: string) => void
): Unsubscribe {
  const q = query(
    collection(db, INVOICE_SCANS_COLLECTION),
    where('userId', '==', user.uid),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const records = snap.docs
        .map((d) => parseDocToRecord(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      saveCachedInvoiceDriveRecords(records);
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, INVOICE_SCANS_COLLECTION);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped.message : String(error));
      }
    }
  );
}

export async function deleteInvoiceDriveRecord(params: {
  record: InvoiceDriveRecord;
  alsoDeleteFromDrive: boolean;
}): Promise<void> {
  const { record, alsoDeleteFromDrive } = params;
  if (!VALID_DOC_ID_REGEX.test(record.id)) {
    throw new Error('Invalid invoice scan document ID');
  }

  if (alsoDeleteFromDrive && record.driveFileId) {
    await deleteDriveFile(record.driveFileId);
  }

  const docPath = `${INVOICE_SCANS_COLLECTION}/${record.id}`;
  try {
    await deleteDoc(doc(db, INVOICE_SCANS_COLLECTION, record.id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }

  const next = loadCachedInvoiceDriveRecords().filter((r) => r.id !== record.id);
  saveCachedInvoiceDriveRecords(next);
}
