import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
  type Auth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';

/**
 * Firebase initialization.
 *
 * The config values are read from VITE_FIREBASE_* and are baked into the bundle,
 * which is correct and unavoidable for a static site: Firebase web config is
 * public by design. It identifies the project, it does not authorize anything.
 * All access control lives in firestore.rules.
 *
 * A fresh clone has placeholder values, so `isFirebaseConfigured()` exists to
 * let the app render a "finish setup" screen instead of throwing an opaque SDK
 * error on the first call.
 */

const PLACEHOLDER = /^REPLACE_WITH|^$/;

const options: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
};

/** The values that must be real for anything to work. */
const REQUIRED_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'] as const;

/** Env var names, for the setup screen's checklist. */
const ENV_NAMES: Record<(typeof REQUIRED_KEYS)[number], string> = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  appId: 'VITE_FIREBASE_APP_ID',
};

/** Which required values are still missing or still placeholders. */
export function missingFirebaseConfig(): string[] {
  return REQUIRED_KEYS.filter((key) => {
    const value = options[key];
    return typeof value !== 'string' || PLACEHOLDER.test(value);
  }).map((key) => ENV_NAMES[key]);
}

export function isFirebaseConfigured(): boolean {
  return missingFirebaseConfig().length === 0;
}

export const firebaseProjectId = options.projectId ?? 'unconfigured';

/* ------------------------------------------------------------------ *
 * Lazy singletons
 *
 * Created on first use rather than at module load, so importing this file in
 * `local` mode (or in a test) costs nothing and cannot throw.
 * ------------------------------------------------------------------ */

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let analyticsInstance: Analytics | null = null;

const useEmulators = import.meta.env.VITE_FIREBASE_USE_EMULATORS === '1';
const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';

function getApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error(
      `Firebase is not configured. Missing: ${missingFirebaseConfig().join(', ')}. ` +
        'Copy .env.example to .env.local and fill in the values from the Firebase console.',
    );
  }
  if (!app) {
    app = initializeApp(options);
    // Initialize analytics if supported and in browser environment
    if (typeof window !== 'undefined' && options.measurementId) {
      void isSupported()
        .then((supported) => {
          if (supported && app && !analyticsInstance) {
            analyticsInstance = getAnalytics(app);
          }
        })
        .catch(() => {});
    }
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getApp());
    if (useEmulators) {
      const port = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_PORT || '9099';
      connectAuthEmulator(authInstance, `http://${emulatorHost}:${port}`, {
        disableWarnings: true,
      });
    }
    // Survive a reload; the alternative is signing in on every refresh.
    // Failure here is non-fatal — the session just becomes tab-scoped.
    void setPersistence(authInstance, browserLocalPersistence).catch(() => {});
  }
  return authInstance;
}

export function getDb(): Firestore {
  if (!dbInstance) {
    dbInstance = getFirestore(getApp());
    if (useEmulators) {
      const port = Number(import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT || '8080');
      connectFirestoreEmulator(dbInstance, emulatorHost, port);
    }
  }
  return dbInstance;
}

export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (analyticsInstance) return analyticsInstance;
  if (!isFirebaseConfigured() || typeof window === 'undefined' || !options.measurementId) {
    return null;
  }
  try {
    const supported = await isSupported();
    if (supported) {
      analyticsInstance = getAnalytics(getApp());
    }
  } catch {
    // Analytics is optional; fail quietly if adblockers block it
  }
  return analyticsInstance;
}

