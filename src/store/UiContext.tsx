import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Filters, Priority, Status } from '@/types/board';
import { EMPTY_FILTERS } from './selectors';

/**
 * View-only state: which modal is open, what is filtered, which story cards
 * have their task list expanded. Kept separate from BoardContext so opening a
 * dialog never touches persisted data.
 */

export interface StoryEditorTarget {
  /** Undefined means "create new". */
  storyId?: string;
  /**
   * Column to open a new story in. Set by a column's + button so the story
   * lands where the user clicked. Ignored when editing an existing story,
   * whose status is its own.
   */
  status?: Status;
}

export interface TaskEditorTarget {
  taskId?: string;
  /** Required when creating. */
  storyId?: string;
}

interface UiContextValue {
  filters: Filters;
  setSearch(q: string): void;
  toggleProject(id: string): void;
  togglePriority(p: Priority): void;
  toggleTag(t: string): void;
  clearFilters(): void;

  expanded: Record<string, boolean>;
  isExpanded(storyId: string): boolean;
  toggleExpanded(storyId: string): void;
  setAllExpanded(ids: string[], value: boolean): void;

  detailStoryId: string | null;
  openDetail(storyId: string): void;
  closeDetail(): void;

  storyEditor: StoryEditorTarget | null;
  openStoryEditor(target: StoryEditorTarget): void;
  closeStoryEditor(): void;

  taskEditor: TaskEditorTarget | null;
  openTaskEditor(target: TaskEditorTarget): void;
  closeTaskEditor(): void;

  projectEditorOpen: boolean;
  setProjectEditorOpen(open: boolean): void;

  tagEditorOpen: boolean;
  setTagEditorOpen(open: boolean): void;

  /** Workspace members and sharing. Only reachable on backends with workspaces. */
  membersOpen: boolean;
  setMembersOpen(open: boolean): void;

  /** Account dialog — sign-out and upgrading a guest session. */
  accountOpen: boolean;
  setAccountOpen(open: boolean): void;

  /** Id of a story to scroll to and flash, cleared once consumed. */
  focusedStoryId: string | null;
  focusStory(id: string): void;
  clearFocus(): void;
}

const UiContext = createContext<UiContextValue | null>(null);

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [detailStoryId, setDetailStoryId] = useState<string | null>(null);
  const [storyEditor, setStoryEditor] = useState<StoryEditorTarget | null>(null);
  const [taskEditor, setTaskEditor] = useState<TaskEditorTarget | null>(null);
  const [projectEditorOpen, setProjectEditorOpen] = useState(false);
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [focusedStoryId, setFocusedStoryId] = useState<string | null>(null);

  const focusStory = useCallback((id: string) => {
    setDetailStoryId(null);
    setFilters(EMPTY_FILTERS);
    setFocusedStoryId(id);
  }, []);

  const value = useMemo<UiContextValue>(
    () => ({
      filters,
      setSearch: (search) => setFilters((f) => ({ ...f, search })),
      toggleProject: (id) =>
        setFilters((f) => ({ ...f, projects: toggleIn(f.projects, id) })),
      togglePriority: (p) =>
        setFilters((f) => ({ ...f, priorities: toggleIn(f.priorities, p) })),
      toggleTag: (t) => setFilters((f) => ({ ...f, tags: toggleIn(f.tags, t) })),
      clearFilters: () => setFilters(EMPTY_FILTERS),

      expanded,
      isExpanded: (id) => expanded[id] ?? false,
      toggleExpanded: (id) => setExpanded((e) => ({ ...e, [id]: !e[id] })),
      setAllExpanded: (ids, value) =>
        setExpanded(value ? Object.fromEntries(ids.map((id) => [id, true])) : {}),

      detailStoryId,
      openDetail: setDetailStoryId,
      closeDetail: () => setDetailStoryId(null),

      storyEditor,
      openStoryEditor: setStoryEditor,
      closeStoryEditor: () => setStoryEditor(null),

      taskEditor,
      openTaskEditor: setTaskEditor,
      closeTaskEditor: () => setTaskEditor(null),

      projectEditorOpen,
      setProjectEditorOpen,

      tagEditorOpen,
      setTagEditorOpen,

      membersOpen,
      setMembersOpen,

      accountOpen,
      setAccountOpen,

      focusedStoryId,
      focusStory,
      clearFocus: () => setFocusedStoryId(null),
    }),
    [filters, expanded, detailStoryId, storyEditor, taskEditor, projectEditorOpen, tagEditorOpen, membersOpen, accountOpen, focusedStoryId, focusStory],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiContextValue {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used inside <UiProvider>');
  return ctx;
}
