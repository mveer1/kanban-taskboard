import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';
import type { Board, Settings } from '@/types/board';
import { getDb } from '@/lib/firebase';
import { validateBoard } from './validation';
import { starterBoard } from './starter';
import {
  DataError,
  type BackupEntry,
  type BoardSnapshot,
  type Capabilities,
  type ChangeEvent,
  type DataSource,
  type MemberRole,
  type SaveOutcome,
} from './types';

/**
 * The hosted backend: one Firestore document per workspace board.
 *
 * Document layout (see firestore.rules for the matching authorization rules):
 *
 *   workspaces/{wid}                      membership and name
 *   workspaces/{wid}/state/board          { data: <json>, rev, updatedAt, updatedBy }
 *   workspaces/{wid}/backups/{autoId}     { data: <json>, rev, createdAt, createdBy, size }
 *   workspaces/{wid}/members/{uid}        display info for the member list
 *   workspaces/{wid}/invites/{email}      pending invitation
 *   users/{uid}/prefs/settings            this user's preferences, all workspaces
 *
 * Two decisions worth explaining.
 *
 * **The board is stored as a JSON string, not a nested map.** Firestore would
 * otherwise coerce the data: it rejects `undefined`, has its own number and date
 * types, and does not preserve the distinction between a missing key and a null
 * one — which this schema depends on (`additionalProperties: false` plus the
 * omitted-vs-empty rule for `tags`). A string round-trips byte-for-byte, and the
 * board is never queried field-by-field: every read is the whole board anyway.
 * The cost is that security rules cannot inspect shape, so they enforce
 * authorization and the client enforces validity — see `saveBoard` below.
 *
 * **Writes go through a transaction with a revision check.** Unlike the local
 * file backend there really are concurrent writers now, and the whole-board PUT
 * model means a blind write would discard a collaborator's edit wholesale.
 */

const CAPABILITIES: Capabilities = {
  auth: true,
  workspaces: true,
  backups: true,
  realtime: true,
  perUserSettings: true,
  fileBacked: false,
};

/** Firestore's hard limit is 1 MiB per document; stay clear of the edge. */
const MAX_BOARD_BYTES = 900_000;

export const paths = {
  workspace: (wid: string) => `workspaces/${wid}`,
  board: (wid: string) => `workspaces/${wid}/state/board`,
  backups: (wid: string) => `workspaces/${wid}/backups`,
  members: (wid: string) => `workspaces/${wid}/members`,
  invites: (wid: string) => `workspaces/${wid}/invites`,
  userSettings: (uid: string) => `users/${uid}/prefs/settings`,
  user: (uid: string) => `users/${uid}`,
};

/** Firestore error codes mapped onto the shared error type. */
export function toDataError(err: unknown, fallback = 'Firestore request failed'): DataError {
  const code = (err as { code?: string })?.code ?? '';
  const message = err instanceof Error ? err.message : String(err);

  if (code === 'permission-denied') {
    return new DataError(
      'You do not have permission to do that in this workspace.',
      'permission',
    );
  }
  if (code === 'not-found') return new DataError('That record no longer exists.', 'not-found');
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return new DataError('Firestore is unreachable — check your connection.', 'network');
  }
  if (code === 'failed-precondition' && message.includes('index')) {
    return new DataError(
      'A Firestore index is missing. Deploy firestore.indexes.json (see DEPLOYMENT.md).',
      'config',
    );
  }

  if (code === 'invalid-argument' && message.includes('1500 bytes')) {
    return new DataError(
      'Firestore is rejecting the board because the data field is being indexed. ' +
      'Deploy the index exemptions: firebase deploy --only firestore:indexes ' +
      '(see DEPLOYMENT.md step 6).',
      'config',
    );
  }

  return new DataError(message || fallback, 'unknown');
}

/** Firestore timestamps arrive as Timestamp, or null while pending. */
export function isoFrom(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return null;
}

interface BoardDoc {
  /** The whole board, JSON-encoded. See the note above on why it is a string. */
  data?: string;
  /** Monotonic per workspace. Incremented on every accepted write. */
  rev?: number;
  /** `serverTimestamp()` on write, a Timestamp on read. */
  updatedAt?: unknown;
  updatedBy?: string;
}

function parseBoardDoc(raw: BoardDoc | undefined): BoardSnapshot | null {
  if (!raw?.data) return null;
  try {
    const board = JSON.parse(raw.data) as Board;
    board.tags = board.tags ?? [];
    return { board, rev: raw.rev ?? 0 };
  } catch {
    throw new DataError(
      'The stored board is not valid JSON. Restore a snapshot from Settings → Data.',
      'validation',
    );
  }
}

export interface FirestoreSourceOptions {
  workspaceId: string;
  uid: string;
  /** Used to decide whether writes are even attempted. */
  role: MemberRole;
  backupRetention?: number;
}

export function createFirestoreDataSource(options: FirestoreSourceOptions): DataSource {
  const db: Firestore = getDb();
  const { workspaceId, uid, role } = options;
  let backupRetention = options.backupRetention ?? 30;

  const boardRef = doc(db, paths.board(workspaceId)) as DocumentReference<BoardDoc>;
  const settingsRef = doc(db, paths.userSettings(uid));

  /**
   * The revision this tab last wrote. The snapshot listener fires for our own
   * writes too, so this is how an echo is told apart from a collaborator's edit
   * — the equivalent of the local backend's `lastSelfWrite` guard.
   */
  let lastWrittenRev = -1;

  /**
   * Replace the whole board, refusing the write if the stored revision has moved
   * on. Declared as a named function rather than an object method so
   * `restoreBackup` can reuse it without depending on `this`.
   */
  async function saveBoardImpl(board: Board, baseRev: number): Promise<SaveOutcome> {
    if (role === 'viewer') {
      return { status: 'invalid', errors: ['You have read-only access to this workspace.'] };
    }

    // There is no server in this write path, so the client is the gate. These
    // are the same rules the Express backend runs — shared/boardIntegrity.js.
    const { ok, errors } = validateBoard(board);
    if (!ok) return { status: 'invalid', errors };

    const data = JSON.stringify(board);
    const size = new TextEncoder().encode(data).length;
    if (size > MAX_BOARD_BYTES) {
      return {
        status: 'invalid',
        errors: [
          `Board is ${(size / 1024).toFixed(0)} KB, over the ` +
          `${(MAX_BOARD_BYTES / 1024).toFixed(0)} KB per-document limit. ` +
          'Archive or delete completed stories.',
        ],
      };
    }

    try {
      // The transaction returns its findings instead of assigning to outer
      // variables — assignments inside a callback are invisible to the type
      // checker's flow analysis, which would leave them typed as null here.
      const result = await runTransaction(db, async (tx) => {
        const snap = await tx.get(boardRef);
        const stored = snap.data();
        const storedRev = stored?.rev ?? 0;

        // Someone else wrote since we read. Refuse rather than clobber: the
        // whole-board write model means overwriting would discard all of their
        // changes, not merge them.
        if (snap.exists() && storedRev !== baseRev) {
          const latest = parseBoardDoc(stored);
          if (latest) return { kind: 'conflict' as const, latest };
        }

        const nextRev = storedRev + 1;
        tx.set(boardRef, {
          data,
          rev: nextRev,
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        });

        return {
          kind: 'written' as const,
          rev: nextRev,
          previous: stored?.data ? { data: stored.data, rev: storedRev } : null,
        };
      });

      if (result.kind === 'conflict') return { status: 'conflict', latest: result.latest };

      lastWrittenRev = result.rev;

      // Snapshot the superseded version. Deliberately after the commit and
      // deliberately non-fatal: the local backend must back up first because it
      // overwrites the only copy, whereas here a failed snapshot costs
      // recoverability, not the save.
      const backup = result.previous
        ? await writeBackup(db, workspaceId, uid, result.previous, backupRetention).catch((err) => {
          console.warn('[firestore] snapshot failed', err);
          return null;
        })
        : null;

      return { status: 'saved', rev: result.rev, backup };
    } catch (err) {
      if (err instanceof DataError) throw err;
      throw toDataError(err, 'Could not save the board');
    }
  }

  return {
    backend: 'firebase',
    capabilities: CAPABILITIES,
    describe: `Firestore · workspace ${workspaceId}`,

    async getBoard(): Promise<BoardSnapshot> {
      try {
        const snap = await getDoc(boardRef);
        const parsed = parseBoardDoc(snap.data());
        if (parsed) return parsed;

        // First load of a new workspace: seed it so the UI has a project to
        // hang stories off. A viewer cannot write, so they get the seed
        // in-memory only and see an empty board.
        const board = starterBoard();
        if (role !== 'viewer') {
          await setDoc(boardRef, {
            data: JSON.stringify(board),
            rev: 1,
            updatedAt: serverTimestamp(),
            updatedBy: uid,
          });
          lastWrittenRev = 1;
          return { board, rev: 1 };
        }
        return { board, rev: 0 };
      } catch (err) {
        if (err instanceof DataError) throw err;
        throw toDataError(err, 'Could not load the board');
      }
    },

    saveBoard: saveBoardImpl,

    async getSettings(): Promise<Settings> {
      try {
        const snap = await getDoc(settingsRef);
        if (!snap.exists()) throw new DataError('No stored settings', 'not-found');
        return snap.data() as Settings;
      } catch (err) {
        if (err instanceof DataError) throw err;
        throw toDataError(err, 'Could not load settings');
      }
    },

    async saveSettings(settings: Settings): Promise<void> {
      try {
        await setDoc(settingsRef, settings);
      } catch (err) {
        throw toDataError(err, 'Could not save settings');
      }
    },

    async listBackups(): Promise<BackupEntry[]> {
      try {
        const snaps = await getDocs(
          query(collection(db, paths.backups(workspaceId)), orderBy('createdAt', 'desc'), limit(50)),
        );
        return snaps.docs.map((d) => {
          const raw = d.data() as { size?: number; createdAt?: unknown; rev?: number };
          return {
            name: d.id,
            size: raw.size ?? 0,
            modified: isoFrom(raw.createdAt) ?? new Date(0).toISOString(),
          };
        });
      } catch (err) {
        throw toDataError(err, 'Could not list snapshots');
      }
    },

    async restoreBackup(name: string): Promise<void> {
      if (role === 'viewer') {
        throw new DataError('You have read-only access to this workspace.', 'permission');
      }
      try {
        const snap = await getDoc(doc(db, `${paths.backups(workspaceId)}/${name}`));
        if (!snap.exists()) throw new DataError('Snapshot not found', 'not-found');

        const restored = parseBoardDoc(snap.data() as BoardDoc);
        if (!restored) throw new DataError('Snapshot is empty', 'validation');

        // Restore is not a privileged path: the snapshot goes through the same
        // validation and the same revision-checked write as any other save, so a
        // corrupt snapshot cannot be reinstated and a restore is itself undoable.
        const current = await getDoc(boardRef);
        const currentRev = current.data()?.rev ?? 0;
        const outcome = await saveBoardImpl(restored.board, currentRev);
        if (outcome.status === 'invalid') {
          throw new DataError('Snapshot is not valid', 'validation', outcome.errors);
        }
        if (outcome.status === 'conflict') {
          throw new DataError(
            'The board changed while restoring. Try again.',
            'conflict',
          );
        }
      } catch (err) {
        if (err instanceof DataError) throw err;
        throw toDataError(err, 'Could not restore the snapshot');
      }
    },

    subscribe(onChange: (event: ChangeEvent) => void): () => void {
      return onSnapshot(
        boardRef,
        (snap) => {
          const rev = snap.data()?.rev ?? 0;
          // Our own commit echoes back through this listener; ignore it, and
          // ignore anything older than what we wrote (a local cache replay).
          onChange({ source: rev <= lastWrittenRev ? 'self' : 'external' });
        },
        (err) => console.warn('[firestore] board listener stopped', err),
      );
    },

    configure({ backupRetention: retention }) {
      if (typeof retention === 'number' && retention > 0) backupRetention = retention;
    },
  };
}

/**
 * Store the superseded board and prune to the retention limit.
 * Ids are timestamp-based so `orderBy(createdAt)` and id order agree, which
 * makes the list readable in the Firebase console too.
 */
async function writeBackup(
  db: Firestore,
  workspaceId: string,
  uid: string,
  previous: { data: string; rev: number },
  retention: number,
): Promise<string> {
  const id = `board.${new Date().toISOString().replace(/[:.]/g, '-')}`;
  await setDoc(doc(db, `${paths.backups(workspaceId)}/${id}`), {
    data: previous.data,
    rev: previous.rev,
    size: new TextEncoder().encode(previous.data).length,
    createdAt: serverTimestamp(),
    createdBy: uid,
  });

  // Prune oldest-first beyond retention. Failures here are non-fatal: an
  // over-long snapshot list is untidy, not harmful.
  try {
    const all = await getDocs(
      query(collection(db, paths.backups(workspaceId)), orderBy('createdAt', 'desc')),
    );
    const stale = all.docs.slice(retention);
    await Promise.all(stale.map((d) => deleteDoc(d.ref).catch(() => { })));
  } catch (err) {
    console.warn('[firestore] snapshot pruning skipped', err);
  }

  return id;
}
