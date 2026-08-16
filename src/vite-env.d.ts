/// <reference types="vite/client" />

/** Injected by vite.config.ts at build time. */
declare const __BUILD_TIME__: string;

/**
 * Environment contract. Every one of these is public once built — the bundle is
 * shipped to the browser. Access control lives in firestore.rules, not here.
 */
interface ImportMetaEnv {
  /** `local` talks to the Node API; `firebase` talks to Firestore. */
  readonly VITE_DATA_BACKEND?: 'local' | 'firebase';
  readonly VITE_BASE?: string;

  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;

  readonly VITE_FIREBASE_USE_EMULATORS?: string;
  readonly VITE_FIREBASE_EMULATOR_HOST?: string;
  readonly VITE_FIREBASE_AUTH_EMULATOR_PORT?: string;
  readonly VITE_FIREBASE_FIRESTORE_EMULATOR_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
