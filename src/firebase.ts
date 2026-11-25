import { getApps, initializeApp, FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  signInWithPopup,
  signOut,
  User
} from 'firebase/auth';
import {
  Firestore,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  doc,
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

let appInstance: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!appInstance) {
    const existing = getApps();
    appInstance = existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
  }
  return appInstance;
}

function createFirestoreClient(firebaseApp: FirebaseApp): Firestore {
  try {
    return initializeFirestore(
      firebaseApp,
      {
        experimentalForceLongPolling: true,
        localCache: memoryLocalCache()
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
  }
}

export const app = getFirebaseApp();
export const db = createFirestoreClient(app);
export const auth = getAuth(app);
void setPersistence(auth, browserLocalPersistence).catch(() => {});
export const activeFirebaseConfig = firebaseConfig;

const syncGoogleProvider = new GoogleAuthProvider();
syncGoogleProvider.setCustomParameters({ prompt: 'select_account' });

export async function signInWithGoogleForFirestore(): Promise<User> {
  const result = await signInWithPopup(auth, syncGoogleProvider);
  return result.user;
}

export async function signOutFromFirestore(): Promise<void> {
  await signOut(auth);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return;
      }
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        return;
      } catch (retryError) {
        if (
          retryError instanceof Error &&
          retryError.message.includes('the client is offline')
        ) {
          console.error('Please check your Firebase configuration.');
        }
      }
    }
  }
}

void testConnection();
