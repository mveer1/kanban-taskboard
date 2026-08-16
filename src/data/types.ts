import type { Board, Settings } from '@/types/board';

/**
 * THE PERSISTENCE CONTRACT.
 *
 * The app has two backends and the UI must not know which one it is talking to:
 *
 *   local    — the Node/Express API in server/, writing data/board.json. Keeps
 *              the file hand- and AI-editable, which is the original design goal.
 *   firebase — Firestore documents, so the app can be hosted as static files on
 *              GitHub Pages with no server of our own.
 *
 * Everything the UI needs is expressed here. Adding a third backend (Supabase,
 * an API of your own) means implementing this interface and nothing else.
 */

/** Which backend implementations exist. */
export type BackendId = 'local' | 'firebase';

/**
 * A board plus the revision it was read at.
 *
 * `rev` is how concurrent edits are detected. A save submits the revision it
 * started from; if the stored revision has moved on, someone else wrote first
 * and the save is refused rather than silently clobbering their change. The
 * local backend has a single writer and reports `rev: 0` throughout.
 */
export interface BoardSnapshot {
  board: Board;
  rev: number;
}

export type SaveOutcome =
  /** Written. `rev` is the new revision to base the next save on. */
  | { status: 'saved'; rev: number; backup: string | null }
  /** Rejected by validation. Nothing was written. */
  | { status: 'invalid'; errors: string[] }
  /** Someone else wrote first. `latest` is their board, already re-read. */
  | { status: 'conflict'; latest: BoardSnapshot };

export interface BackupEntry {
  /** Opaque identifier passed back to `restoreBackup`. */
  name: string;
  size: number;
  /** ISO timestamp. */
  modified: string;
}

/**
 * What a backend can do. The UI reads these instead of checking which backend
 * is active, so a capability can be added without hunting for `if (firebase)`.
 */
export interface Capabilities {
  /** Real sign-in, so the app should gate on a session and offer sign-out. */
  auth: boolean;
  /** Multiple boards with members, so the workspace switcher is meaningful. */
  workspaces: boolean;
  /** Point-in-time snapshots that can be listed and restored. */
  backups: boolean;
  /** Pushes external changes, so the UI does not have to poll. */
  realtime: boolean;
  /** Settings are stored per signed-in user rather than in a shared file. */
  perUserSettings: boolean;
  /** The data lives in a file the user can open in an editor. */
  fileBacked: boolean;
}

/** What changed, so the store can decide whether to re-read. */
export type ChangeEvent = { source: 'external' | 'self' };

export interface DataSource {
  readonly backend: BackendId;
  readonly capabilities: Capabilities;
  /** Human-readable location of the data, shown in Settings. */
  readonly describe: string;

  getBoard(): Promise<BoardSnapshot>;
  /**
   * Replace the whole board. Validates first; a rejected save writes nothing.
   * @param baseRev the revision the caller's board was read at
   */
  saveBoard(board: Board, baseRev: number): Promise<SaveOutcome>;

  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;

  listBackups(): Promise<BackupEntry[]>;
  /** Snapshots are re-validated on restore, so a corrupt one cannot be reinstated. */
  restoreBackup(name: string): Promise<void>;

  /** Subscribe to changes made outside this tab. Returns an unsubscribe fn. */
  subscribe(onChange: (event: ChangeEvent) => void): () => void;

  /**
   * Push user preferences that the backend itself needs. Only backends that own
   * their retention policy implement it — the local server reads settings.json
   * directly and ignores this.
   */
  configure?(options: { backupRetention?: number }): void;
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export type DataErrorKind =
  | 'validation'
  | 'conflict'
  | 'permission'
  | 'not-found'
  | 'network'
  | 'config'
  | 'unknown';

/**
 * One error type across both backends, so components never branch on whether a
 * failure came from an HTTP status or a Firestore error code.
 */
export class DataError extends Error {
  constructor(
    message: string,
    readonly kind: DataErrorKind = 'unknown',
    readonly errors: string[] = [],
  ) {
    super(message);
    this.name = 'DataError';
  }

  /** Messages to show the user: the detail list if present, else the summary. */
  get messages(): string[] {
    return this.errors.length > 0 ? this.errors : [this.message];
  }
}

/* ------------------------------------------------------------------ *
 * Workspaces (firebase backend only)
 * ------------------------------------------------------------------ */

/**
 * Roles are ordered: owner > editor > viewer. Enforced twice — in the UI for
 * clarity and in firestore.rules for actual security.
 */
export type MemberRole = 'owner' | 'editor' | 'viewer';

export const ROLE_RANK: Record<MemberRole, number> = { viewer: 1, editor: 2, owner: 3 };

/** True if `role` is at least as privileged as `required`. */
export function roleAtLeast(role: MemberRole | null, required: MemberRole): boolean {
  return role !== null && ROLE_RANK[role] >= ROLE_RANK[required];
}

export interface WorkspaceMember {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: MemberRole;
}

export interface Workspace {
  id: string;
  name: string;
  ownerUid: string;
  /** The caller's own role, resolved at read time. */
  role: MemberRole;
  memberCount: number;
  /** ISO timestamp, or null while the server timestamp is still pending. */
  updatedAt: string | null;
}

export interface PendingInvite {
  /** Lower-cased email, which is also the document id. */
  email: string;
  role: MemberRole;
  workspaceId: string;
  workspaceName: string;
  invitedBy: string | null;
}
