import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Board, Project, Settings, Status, Story, TagDef, Task } from '@/types/board';
import { DataError, type DataSource } from '@/data/types';
import { useDataSource } from '@/data/useDataSource';
import { normalizeSettings } from '@/data/starter';
import { useAuth } from '@/auth/AuthContext';
import { useWorkspaces } from './WorkspaceContext';
import { nextId, today, withStatus } from './selectors';

/**
 * The app's single store.
 *
 * Flow: mutate -> optimistic state update -> debounced save through the active
 * DataSource. If the write is rejected (validation) we surface the errors and
 * re-read, so the UI never diverges from what was actually stored.
 *
 * The store does not know which backend it is talking to. In local mode that
 * write goes to data/board.json through the Node API; in firebase mode it goes to
 * a Firestore document. Two behaviours differ and both are handled here:
 *
 *   - **Revisions.** Firestore reports the revision each read came from and
 *     refuses a save based on a stale one. On conflict we adopt the stored board
 *     rather than overwriting a collaborator, and say so.
 *   - **Settings ownership.** The file backend stores one shared settings file;
 *     Firestore stores them per user, and a first-time user has none, so they are
 *     seeded from the auth session.
 */

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';

interface BoardContextValue {
  board: Board | null;
  settings: Settings | null;
  loading: boolean;
  loadError: string | null;
  saveState: SaveState;
  saveErrors: string[];
  /** Capabilities and location of the active backend, for Settings and gating. */
  source: DataSource | null;
  /** False for workspace viewers; mutations no-op and controls disable. */
  canEdit: boolean;

  /* stories */
  createStory(story: Story): void;
  updateStory(id: string, patch: Partial<Story>): void;
  /** Change status and optionally reposition within the destination column. */
  moveStory(id: string, status: Status, toIndex?: number): void;
  deleteStory(id: string): void;
  /**
   * Copy a story and its tasks. Returns the new story's id, or null if the
   * source is missing or the user cannot edit.
   */
  duplicateStory(id: string): string | null;

  /* tasks */
  createTask(task: Task): void;
  updateTask(id: string, patch: Partial<Task>): void;
  advanceTask(id: string, status: Status): void;
  deleteTask(id: string): void;
  duplicateTask(id: string): string | null;

  /* projects */
  createProject(project: Project): void;
  updateProject(id: string, patch: Partial<Project>): void;
  deleteProject(id: string): void;

  /* tags — keyed by label, so renaming rewrites every reference */
  createTag(tag: TagDef): void;
  updateTagColor(label: string, patch: Partial<Omit<TagDef, 'label'>>): void;
  renameTag(from: string, to: string): void;
  /** Removes the registry entry and strips the label from all items. */
  deleteTag(label: string): void;
  /** Adds an in-use but unregistered label to the registry. */
  registerTag(label: string, color: string): void;

  /* settings */
  updateSettings(patch: Partial<Settings>): void;

  reload(): Promise<void>;
  saveNow(): Promise<void>;
}

const BoardContext = createContext<BoardContextValue | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) {
  const source = useDataSource();
  const { profile: sessionProfile } = useAuth();
  const { canEdit } = useWorkspaces();

  const [board, setBoard] = useState<Board | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveErrors, setSaveErrors] = useState<string[]>([]);

  /** Latest board, readable from timers without stale-closure bugs. */
  const boardRef = useRef<Board | null>(null);
  /** Revision the current board was read at — submitted with every save. */
  const revRef = useRef(0);
  const saveTimer = useRef<number | null>(null);
  /** Suppresses the change notification triggered by our own save. */
  const savingRef = useRef(false);

  const autosaveDelay = settings?.data.autosaveDelayMs ?? 600;

  /* ---------------- load ---------------- */

  const load = useCallback(async () => {
    if (!source) return;
    try {
      const snapshot = await source.getBoard();
      boardRef.current = snapshot.board;
      revRef.current = snapshot.rev;
      setBoard(snapshot.board);

      // A first-time Firestore user has no settings document, and a stored one
      // may predate a field — normalizeSettings covers both.
      const stored = await source.getSettings().catch((err: unknown) => {
        if (err instanceof DataError && err.kind === 'not-found') return null;
        throw err;
      });
      const fallbackProfile = sessionProfile ?? {
        name: 'Task Board',
        email: '',
        initials: 'TB',
        avatarColor: '#6ee7b7',
      };
      const resolved = normalizeSettings(stored, fallbackProfile);
      setSettings(resolved);
      if (!stored) void source.saveSettings(resolved).catch(() => {});

      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [source, sessionProfile]);

  useEffect(() => {
    // A null source means firebase mode without a session or workspace yet;
    // stay in the loading state until useDataSource produces one.
    if (!source) {
      setLoading(true);
      return;
    }
    setLoading(true);
    void load();
  }, [source, load]);

  /* Keep the backend's own knobs in step with user preferences. */
  useEffect(() => {
    if (settings && source?.configure) {
      source.configure({ backupRetention: settings.data.backupRetention });
    }
  }, [settings, source]);

  /* ---------------- save ---------------- */

  const flush = useCallback(async () => {
    const current = boardRef.current;
    if (!current || !source) return;

    savingRef.current = true;
    setSaveState('saving');
    try {
      const outcome = await source.saveBoard(current, revRef.current);

      if (outcome.status === 'saved') {
        revRef.current = outcome.rev;
        setSaveErrors([]);
        setSaveState('saved');
        window.setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500);
        return;
      }

      if (outcome.status === 'conflict') {
        // Someone else wrote first. Their board wins — a whole-board overwrite
        // would erase all of their changes, not merge them. The local edit is
        // reported as lost rather than silently dropped.
        boardRef.current = outcome.latest.board;
        revRef.current = outcome.latest.rev;
        setBoard(outcome.latest.board);
        setSaveErrors([
          'Another session saved first, so your last change was not applied. ' +
            'The board has been refreshed with their version.',
        ]);
        setSaveState('conflict');
        return;
      }

      setSaveErrors(outcome.errors);
      setSaveState('error');
      // The stored board is still the last good state — resync to it.
      await load();
    } catch (err) {
      setSaveErrors(err instanceof DataError ? err.messages : [String(err)]);
      setSaveState('error');
      await load();
    } finally {
      // Leave a gap so the echo of our own write is ignored.
      window.setTimeout(() => {
        savingRef.current = false;
      }, 1200);
    }
  }, [source, load]);

  /** Apply a change locally, then schedule a save. */
  const commit = useCallback(
    (mutate: (draft: Board) => Board) => {
      const current = boardRef.current;
      if (!current) return;
      // Viewers can navigate and filter but not change stored data. Guarded here
      // as well as in the UI so a stray call cannot produce a denied write.
      if (!canEdit) return;

      const next = mutate(current);
      next.meta = { ...next.meta, updated: today() };
      boardRef.current = next;
      setBoard(next);
      setSaveState('dirty');

      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void flush(), autosaveDelay);
    },
    [flush, autosaveDelay, canEdit],
  );

  /* Save pending edits if the tab is closing. */
  useEffect(() => {
    const onHide = () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        void flush();
      }
    };
    window.addEventListener('beforeunload', onHide);
    return () => window.removeEventListener('beforeunload', onHide);
  }, [flush]);

  /* ---------------- external changes ---------------- */

  useEffect(() => {
    if (!source) return;
    return source.subscribe((event) => {
      // Our own write, or an in-flight save whose echo would fight the edit.
      if (event.source === 'self' || savingRef.current) return;
      void load();
    });
  }, [source, load]);

  /* ---------------- mutations ---------------- */

  const value = useMemo<BoardContextValue>(() => {
    const replaceStories = (fn: (list: Story[]) => Story[]) =>
      commit((b) => ({ ...b, stories: fn(b.stories) }));
    const replaceTasks = (fn: (list: Task[]) => Task[]) =>
      commit((b) => ({ ...b, tasks: fn(b.tasks) }));

    return {
      board,
      settings,
      loading,
      loadError,
      saveState,
      saveErrors,
      source,
      canEdit,

      createStory: (story) => replaceStories((list) => [...list, story]),

      updateStory: (id, patch) =>
        replaceStories((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s))),

      moveStory: (id, status, toIndex) =>
        replaceStories((list) => {
          const story = list.find((s) => s.id === id);
          if (!story) return list;

          const updated = withStatus(story, status);
          const others = list.filter((s) => s.id !== id);

          // No position given: keep array order, just change status.
          if (toIndex === undefined) {
            return list.map((s) => (s.id === id ? updated : s));
          }

          // Insert relative to the destination column's members so the visual
          // order the user dropped into is what gets persisted.
          const members = others.filter((s) => s.status === status);
          const anchor = members[toIndex];
          const at = anchor
            ? others.indexOf(anchor)
            : members.length > 0
              ? others.indexOf(members[members.length - 1]) + 1
              : others.length;

          return [...others.slice(0, at), updated, ...others.slice(at)];
        }),

      /** Also drops the story's tasks and any links pointing at it. */
      deleteStory: (id) =>
        commit((b) => ({
          ...b,
          stories: b.stories
            .filter((s) => s.id !== id)
            .map((s) => ({ ...s, links: (s.links ?? []).filter((l) => l.target !== id) })),
          tasks: b.tasks.filter((t) => t.storyId !== id),
        })),

      /**
       * Copy a story and its tasks in one commit.
       *
       * Fields that describe the *work* are copied; fields that record its
       * *history* are not. So links and notes are dropped — a duplicate would
       * otherwise silently add edges to the dependency graph and inherit an
       * activity log describing something that never happened to it. Task
       * statuses are preserved, since a duplicated story is usually a template
       * or a near-identical follow-up.
       */
      duplicateStory: (id) => {
        const current = boardRef.current;
        if (!current || !canEdit) return null;

        const source = current.stories.find((s) => s.id === id);
        if (!source) return null;

        const newId = nextId('S-', current.stories);
        const copy: Story = withStatus(
          {
            ...source,
            id: newId,
            title: `${source.title} (copy)`,
            links: [],
            notes: [],
            created: today(),
            completedAt: null,
          },
          source.status,
        );

        const sourceTasks = current.tasks.filter((t) => t.storyId === id);
        // Ids are minted off a growing list so a story with several tasks does
        // not produce duplicates of the same new id.
        const taskAccumulator = [...current.tasks];
        const copiedTasks = sourceTasks.map((t) => {
          const task: Task = {
            ...t,
            id: nextId('T-', taskAccumulator),
            storyId: newId,
            notes: [],
            created: today(),
          };
          taskAccumulator.push(task);
          return task;
        });

        commit((b) => {
          // Insert directly after the original so the copy appears next to it
          // rather than at the bottom of the column.
          const at = b.stories.findIndex((s) => s.id === id);
          const stories =
            at === -1
              ? [...b.stories, copy]
              : [...b.stories.slice(0, at + 1), copy, ...b.stories.slice(at + 1)];
          return { ...b, stories, tasks: [...b.tasks, ...copiedTasks] };
        });

        return newId;
      },

      createTask: (task) => replaceTasks((list) => [...list, task]),

      updateTask: (id, patch) =>
        replaceTasks((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t))),

      advanceTask: (id, status) =>
        replaceTasks((list) => list.map((t) => (t.id === id ? withStatus(t, status) : t))),

      deleteTask: (id) => replaceTasks((list) => list.filter((t) => t.id !== id)),

      /** Same rule as duplicateStory: copy the work, drop the history. */
      duplicateTask: (id) => {
        const current = boardRef.current;
        if (!current || !canEdit) return null;

        const source = current.tasks.find((t) => t.id === id);
        if (!source) return null;

        const newId = nextId('T-', current.tasks);
        const copy: Task = withStatus(
          {
            ...source,
            id: newId,
            title: `${source.title} (copy)`,
            notes: [],
            created: today(),
            completedAt: null,
          },
          source.status,
        );

        replaceTasks((list) => {
          const at = list.findIndex((t) => t.id === id);
          return at === -1
            ? [...list, copy]
            : [...list.slice(0, at + 1), copy, ...list.slice(at + 1)];
        });

        return newId;
      },

      createProject: (project) => commit((b) => ({ ...b, projects: [...b.projects, project] })),

      updateProject: (id, patch) =>
        commit((b) => ({
          ...b,
          projects: b.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      /** Refused by the UI when the project still owns stories. */
      deleteProject: (id) =>
        commit((b) => ({ ...b, projects: b.projects.filter((p) => p.id !== id) })),

      createTag: (tag) => commit((b) => ({ ...b, tags: [...(b.tags ?? []), tag] })),

      updateTagColor: (label, patch) =>
        commit((b) => ({
          ...b,
          tags: (b.tags ?? []).map((t) => (t.label === label ? { ...t, ...patch } : t)),
        })),

      /**
       * Rename in the registry and rewrite every story/task reference, so the
       * label-keyed model cannot drift. No-ops if `to` is blank or already taken.
       */
      renameTag: (from, to) =>
        commit((b) => {
          const next = to.trim();
          if (!next || next === from) return b;
          if ((b.tags ?? []).some((t) => t.label === next)) return b;

          const swap = (labels?: string[]) =>
            labels?.map((l) => (l === from ? next : l));

          return {
            ...b,
            tags: (b.tags ?? []).map((t) => (t.label === from ? { ...t, label: next } : t)),
            stories: b.stories.map((s) => ({ ...s, tags: swap(s.tags) })),
            tasks: b.tasks.map((t) => ({ ...t, tags: swap(t.tags) })),
          };
        }),

      deleteTag: (label) =>
        commit((b) => {
          const strip = (labels?: string[]) => labels?.filter((l) => l !== label);
          return {
            ...b,
            tags: (b.tags ?? []).filter((t) => t.label !== label),
            stories: b.stories.map((s) => ({ ...s, tags: strip(s.tags) })),
            tasks: b.tasks.map((t) => ({ ...t, tags: strip(t.tags) })),
          };
        }),

      registerTag: (label, color) =>
        commit((b) =>
          (b.tags ?? []).some((t) => t.label === label)
            ? b
            : { ...b, tags: [...(b.tags ?? []), { label, color, description: null }] },
        ),

      updateSettings: (patch) => {
        setSettings((prev) => {
          if (!prev) return prev;
          const next = { ...prev, ...patch };
          void source?.saveSettings(next).catch(() => {});
          return next;
        });
      },

      reload: load,
      saveNow: flush,
    };
  }, [
    board,
    settings,
    loading,
    loadError,
    saveState,
    saveErrors,
    source,
    canEdit,
    commit,
    load,
    flush,
  ]);

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export function useBoardStore(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoardStore must be used inside <BoardProvider>');
  return ctx;
}

/** Narrowed accessor for components that only run once data is loaded. */
export function useBoard(): { board: Board; settings: Settings } {
  const { board, settings } = useBoardStore();
  if (!board || !settings) throw new Error('useBoard used before data loaded');
  return { board, settings };
}
