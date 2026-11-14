import { getApps, initializeApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.send'
];

export const BACKUP_FOLDER_NAME = 'Kadi POS Backups';

let appInstance: FirebaseApp | null = null;
function getFirebaseApp(): FirebaseApp {
  if (!appInstance) {
    const existing = getApps();
    appInstance = existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
  }
  return appInstance;
}

const provider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({ prompt: 'consent' });

// Strictly in-memory OAuth access token cache (never stored in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export interface GoogleDriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export const initGoogleWorkspaceAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthCleared?: () => void
) => {
  const auth = getAuth(getFirebaseApp());
  return onAuthStateChanged(auth, (user) => {
    if (user && cachedAccessToken) {
      onAuthSuccess?.(user, cachedAccessToken);
    } else if (!user) {
      cachedAccessToken = null;
      onAuthCleared?.();
    } else if (!isSigningIn && !cachedAccessToken) {
      onAuthCleared?.();
    }
  });
};

export const signInWithGoogleWorkspace = async (): Promise<{
  user: User;
  accessToken: string;
}> => {
  const auth = getAuth(getFirebaseApp());
  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('لم يتم استلام رمز الوصول من Google Auth');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getWorkspaceAccessToken = (): string | null => cachedAccessToken;

export const getCurrentWorkspaceUser = (): User | null => {
  try {
    return getAuth(getFirebaseApp()).currentUser;
  } catch {
    return null;
  }
};

export const signOutGoogleWorkspace = async (): Promise<void> => {
  const auth = getAuth(getFirebaseApp());
  cachedAccessToken = null;
  await auth.signOut();
};

async function requireToken(): Promise<string> {
  if (!cachedAccessToken) {
    throw new Error('AUTH_REQUIRED');
  }
  return cachedAccessToken;
}

async function driveFetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await requireToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {})
    }
  });

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('AUTH_EXPIRED');
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Drive API error (${res.status}): ${errBody || res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export async function ensureKadiDriveFolder(preferredId?: string): Promise<string> {
  if (preferredId) {
    try {
      const check = await driveFetchJson<{ id: string; trashed?: boolean }>(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(preferredId)}?fields=id,trashed`
      );
      if (check?.id && !check.trashed) {
        return check.id;
      }
    } catch {
      // Folder may no longer exist or be accessible; create/search below
    }
  }

  const q = encodeURIComponent(
    `name='${BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const search = await driveFetchJson<{ files?: { id: string }[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`
  );

  if (search.files && search.files.length > 0) {
    return search.files[0].id;
  }

  const created = await driveFetchJson<{ id: string }>(
    'https://www.googleapis.com/drive/v3/files?fields=id',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: BACKUP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder'
      })
    }
  );
  return created.id;
}

export async function listDriveFolderFiles(folderId: string): Promise<GoogleDriveFileItem[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const data = await driveFetchJson<{ files?: GoogleDriveFileItem[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&pageSize=30&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)`
  );
  return data.files || [];
}

export async function uploadFileToDriveFolder(params: {
  folderId: string;
  filename: string;
  content: string | Blob;
  mimeType: string;
}): Promise<GoogleDriveFileItem> {
  const token = await requireToken();
  const metadata = {
    name: params.filename,
    parents: [params.folderId]
  };

  const boundary = `kadi_pos_boundary_${Date.now()}`;
  const contentBlob =
    params.content instanceof Blob
      ? params.content
      : new Blob([params.content], { type: params.mimeType });

  const multipartBody = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: ${params.mimeType}\r\n\r\n`,
      contentBlob,
      `\r\n--${boundary}--`
    ],
    { type: `multipart/related; boundary=${boundary}` }
  );

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartBody
    }
  );

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('AUTH_EXPIRED');
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Drive upload failed (${res.status}): ${errText}`);
  }

  return res.json() as Promise<GoogleDriveFileItem>;
}

export async function downloadDriveFileText(fileId: string): Promise<string> {
  const token = await requireToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('AUTH_EXPIRED');
  }
  if (!res.ok) {
    throw new Error(`Failed to download Drive file (${res.status})`);
  }
  return res.text();
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  const token = await requireToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('AUTH_EXPIRED');
  }
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete Drive file (${res.status})`);
  }
}

function encodeBase64UrlUtf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeRfc2047Subject(subject: string): string {
  const bytes = new TextEncoder().encode(subject);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

export async function sendGmailHtmlMessage(params: {
  to: string;
  subject: string;
  htmlBody: string;
}): Promise<{ id: string }> {
  const token = await requireToken();
  const mime = [
    `To: ${params.to.trim()}`,
    `Subject: ${encodeRfc2047Subject(params.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    btoa(
      Array.from(new TextEncoder().encode(params.htmlBody))
        .map((b) => String.fromCharCode(b))
        .join('')
    )
  ].join('\r\n');

  const raw = encodeBase64UrlUtf8(mime);

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw })
  });

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('AUTH_EXPIRED');
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gmail send error (${res.status}): ${errText}`);
  }

  return res.json() as Promise<{ id: string }>;
}
