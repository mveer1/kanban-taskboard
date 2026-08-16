import type { BackendId, DataSource } from './types';
import { createLocalDataSource } from './local';
import { isFirebaseConfigured, missingFirebaseConfig } from '@/lib/firebase';

/**
 * Which backend is active, decided once at build time.
 *
 * `VITE_DATA_BACKEND=local` keeps the Node API and data/board.json, which is
 * what `npm run dev` uses so the file stays hand- and AI-editable.
 * `VITE_DATA_BACKEND=firebase` is what the GitHub Pages build ships, since Pages
 * serves static files only and cannot host the Express API.
 *
 * The default is `local`: a fresh clone with no .env.local should run the way it
 * always has rather than fail against an unconfigured Firebase project.
 */

export const BACKEND: BackendId =
  import.meta.env.VITE_DATA_BACKEND === 'firebase' ? 'firebase' : 'local';

export const isFirebaseBackend = BACKEND === 'firebase';

/**
 * True when the app is ready to serve requests. The firebase backend also needs
 * real credentials — without them the UI shows a setup screen instead of
 * throwing on the first Firestore call.
 */
export function backendReady(): boolean {
  return BACKEND === 'local' || isFirebaseConfigured();
}

/** Env var names still holding placeholders. Empty when fully configured. */
export function backendConfigProblems(): string[] {
  return BACKEND === 'firebase' ? missingFirebaseConfig() : [];
}

/**
 * The local backend needs no session and no workspace, so it can be built once
 * and shared. The Firestore one is created per (user, workspace) pair and is
 * therefore built in `useDataSource`.
 */
let localSingleton: DataSource | null = null;

export function localDataSource(): DataSource {
  localSingleton ??= createLocalDataSource();
  return localSingleton;
}
