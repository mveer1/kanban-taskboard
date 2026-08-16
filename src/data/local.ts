import type { Board, Settings } from '@/types/board';
import { api, ApiError, subscribeToBoardChanges } from '@/api/client';
import {
  DataError,
  type BackupEntry,
  type BoardSnapshot,
  type Capabilities,
  type ChangeEvent,
  type DataSource,
  type SaveOutcome,
} from './types';

/**
 * The original file-backed backend, behind the DataSource interface.
 *
 * Nothing about the server or data/board.json changes — this is an adapter, so
 * the local workflow (edit the JSON by hand or with an AI agent, watch the app
 * reload over SSE) keeps working exactly as before.
 *
 * There is one writer, so there is no revision to track: `rev` is always 0 and
 * `baseRev` is ignored. Conflict detection is a Firestore concern.
 */

const CAPABILITIES: Capabilities = {
  auth: false,
  workspaces: false,
  backups: true,
  realtime: true,
  perUserSettings: false,
  fileBacked: true,
};

/** Translate transport failures into the shared error type. */
function toDataError(err: unknown): DataError {
  if (err instanceof ApiError) {
    if (err.status === 422) return new DataError('Validation failed', 'validation', err.errors);
    if (err.status === 404) return new DataError(err.message, 'not-found');
    return new DataError(err.message, 'unknown', err.errors);
  }
  // fetch() rejects with a TypeError when the API is not running.
  return new DataError(
    err instanceof Error ? err.message : String(err),
    'network',
  );
}

export function createLocalDataSource(): DataSource {
  return {
    backend: 'local',
    capabilities: CAPABILITIES,
    describe: 'data/board.json via the local API',

    async getBoard(): Promise<BoardSnapshot> {
      try {
        const board = await api.getBoard();
        // `tags` is optional in the file; normalize so callers never guard.
        board.tags = board.tags ?? [];
        return { board, rev: 0 };
      } catch (err) {
        throw toDataError(err);
      }
    },

    async saveBoard(board: Board): Promise<SaveOutcome> {
      try {
        const res = await api.saveBoard(board);
        return { status: 'saved', rev: 0, backup: res.backup };
      } catch (err) {
        const error = toDataError(err);
        if (error.kind === 'validation') return { status: 'invalid', errors: error.messages };
        throw error;
      }
    },

    async getSettings(): Promise<Settings> {
      try {
        return await api.getSettings();
      } catch (err) {
        throw toDataError(err);
      }
    },

    async saveSettings(settings: Settings): Promise<void> {
      try {
        await api.saveSettings(settings);
      } catch (err) {
        throw toDataError(err);
      }
    },

    async listBackups(): Promise<BackupEntry[]> {
      try {
        return await api.listBackups();
      } catch (err) {
        throw toDataError(err);
      }
    },

    async restoreBackup(name: string): Promise<void> {
      try {
        await api.restoreBackup(name);
      } catch (err) {
        throw toDataError(err);
      }
    },

    subscribe(onChange: (event: ChangeEvent) => void): () => void {
      // The server already filters out echoes of its own writes, so anything
      // that arrives here is a genuine external edit to the file.
      return subscribeToBoardChanges(() => onChange({ source: 'external' }));
    },
  };
}
