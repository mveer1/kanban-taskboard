import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/auth/AuthContext';
import { isFirebaseBackend } from '@/data/backend';
import {
  acceptInvite as acceptInviteDoc,
  createWorkspace as createWorkspaceDoc,
  declineInvite as declineInviteDoc,
  deleteWorkspace as deleteWorkspaceDoc,
  listMyInvites,
  listWorkspaces,
  readLastWorkspaceId,
  rememberUser,
  renameWorkspace as renameWorkspaceDoc,
} from '@/data/workspaces';
import type { MemberRole, PendingInvite, Workspace } from '@/data/types';

/**
 * Which workspace is open, and the list to choose from.
 *
 * Local mode has exactly one board and no membership, so this reports a single
 * synthetic workspace. Everything downstream — the switcher, the role badge, the
 * read-only guards — works off this context rather than checking the backend, so
 * there is one code path.
 *
 * The active id is mirrored into localStorage as well as the user document:
 * localStorage makes the choice survive a refresh with no round trip, and the
 * user document makes it follow the account to another device.
 */

const STORAGE_KEY = 'taskboard.workspace';

/** Stand-in for local mode, where the file is the workspace. */
const LOCAL_WORKSPACE: Workspace = {
  id: 'local',
  name: 'Local board',
  ownerUid: 'local',
  role: 'owner',
  memberCount: 1,
  updatedAt: null,
};

interface WorkspaceContextValue {
  loading: boolean;
  error: string | null;
  workspaces: Workspace[];
  active: Workspace | null;
  /** The signed-in user's role in the active workspace. */
  role: MemberRole | null;
  /** False for viewers — every mutating control checks this. */
  canEdit: boolean;
  invites: PendingInvite[];

  select(id: string): void;
  create(name: string): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  acceptInvite(workspaceId: string): Promise<void>;
  declineInvite(workspaceId: string): Promise<void>;
  refresh(): Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>(
    isFirebaseBackend ? [] : [LOCAL_WORKSPACE],
  );
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [activeId, setActiveId] = useState<string | null>(isFirebaseBackend ? null : 'local');
  const [loading, setLoading] = useState(isFirebaseBackend);
  const [error, setError] = useState<string | null>(null);

  const uid = user?.uid ?? null;

  /**
   * Load the membership list and settle on an active workspace.
   *
   * Order of preference: the id already open, the last one used on this device,
   * the last one recorded on the account, then the first available. A user with
   * no workspaces at all gets one created — landing on an empty switcher with no
   * board would be a dead end.
   */
  const refresh = useCallback(async () => {
    if (!isFirebaseBackend || !user) return;
    setLoading(true);
    try {
      const [list, pending] = await Promise.all([
        listWorkspaces(user.uid),
        listMyInvites(user.email).catch((err) => {
          console.warn('[workspaces] listMyInvites failed:', err);
          return [];
        }),
      ]);
      setInvites(pending);
      setError(null);

      if (list.length === 0) {
        // Anonymous sessions get a scratch workspace; named users get one titled
        // after them, which reads better in the switcher.
        const label = user.isAnonymous
          ? 'Guest workspace'
          : `${(user.displayName || user.email || 'My').split(/[\s@]/)[0]}'s workspace`;
        const id = await createWorkspaceDoc(user, label);
        const createdWorkspace: Workspace = {
          id,
          name: label,
          ownerUid: user.uid,
          role: 'owner',
          memberCount: 1,
          updatedAt: new Date().toISOString(),
        };
        const created = await listWorkspaces(user.uid).catch(() => []);
        setWorkspaces(created.length > 0 && created.some((w) => w.id === id) ? created : [createdWorkspace, ...created]);
        setActiveId(id);
        return;
      }

      setWorkspaces(list);
      const remembered =
        window.localStorage.getItem(STORAGE_KEY) ?? (await readLastWorkspaceId(user.uid));
      const preferred = [activeId, remembered].find((id) => id && list.some((w) => w.id === id));
      setActiveId(preferred ?? list[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
    // `activeId` is intentionally not a dependency: it is read as a preference
    // for which workspace to keep open, not as a trigger. Including it would
    // re-run the whole load on every switch.
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isFirebaseBackend) return;
    if (!uid) {
      // Signed out: drop everything so the next session cannot see stale state.
      setWorkspaces([]);
      setActiveId(null);
      setInvites([]);
      setLoading(false);
      return;
    }
    void refresh();
  }, [uid, refresh]);

  /* Persist the choice, on this device and on the account. */
  useEffect(() => {
    if (!isFirebaseBackend || !activeId || !user) return;
    window.localStorage.setItem(STORAGE_KEY, activeId);
    void rememberUser(user, activeId);
  }, [activeId, user]);

  const active = useMemo(
    () => workspaces.find((w) => w.id === activeId) ?? null,
    [workspaces, activeId],
  );

  const value = useMemo<WorkspaceContextValue>(() => {
    const role = active?.role ?? null;

    return {
      loading,
      error,
      workspaces,
      active,
      role,
      canEdit: role === 'owner' || role === 'editor',
      invites,

      select: (id) => setActiveId(id),

      create: async (name) => {
        if (!user) return;
        const id = await createWorkspaceDoc(user, name);
        const createdWorkspace: Workspace = {
          id,
          name: name.trim() || 'My workspace',
          ownerUid: user.uid,
          role: 'owner',
          memberCount: 1,
          updatedAt: new Date().toISOString(),
        };
        const list = await listWorkspaces(user.uid).catch(() => []);
        setWorkspaces(list.length > 0 && list.some((w) => w.id === id) ? list : [createdWorkspace, ...list]);
        setActiveId(id);
      },

      rename: async (id, name) => {
        await renameWorkspaceDoc(id, name);
        setWorkspaces((prev) => prev.map((w) => (w.id === id ? { ...w, name } : w)));
      },

      remove: async (id) => {
        if (!user) return;
        await deleteWorkspaceDoc(id);
        const list = await listWorkspaces(user.uid);
        setWorkspaces(list);
        if (activeId === id) setActiveId(list[0]?.id ?? null);
      },

      acceptInvite: async (workspaceId) => {
        if (!user) return;
        await acceptInviteDoc(user, workspaceId);
        setInvites((prev) => prev.filter((i) => i.workspaceId !== workspaceId));
        setWorkspaces(await listWorkspaces(user.uid));
        setActiveId(workspaceId);
      },

      declineInvite: async (workspaceId) => {
        if (!user?.email) return;
        await declineInviteDoc(user.email, workspaceId);
        setInvites((prev) => prev.filter((i) => i.workspaceId !== workspaceId));
      },

      refresh,
    };
  }, [loading, error, workspaces, active, activeId, invites, user, refresh]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaces(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspaces must be used inside <WorkspaceProvider>');
  return ctx;
}
