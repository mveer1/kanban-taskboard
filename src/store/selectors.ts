import type {
  Board,
  Filters,
  Priority,
  ResolvedLink,
  Status,
  Story,
  TagDef,
  Task,
} from '@/types/board';
import { LINK_BY_TYPE } from '@/config/links';
import { STATUS_ORDER } from '@/config/columns';

/**
 * Pure derived reads over the board. No React, no side effects — everything
 * here is a function of `board` plus arguments, so it is trivially testable.
 */

/**
 * Today as YYYY-MM-DD in the *local* calendar.
 *
 * Deliberately not `toISOString()`, which returns the UTC date: east of UTC
 * that reports yesterday until the offset passes, which would stamp
 * `completedAt` a day early and make items due today look due tomorrow.
 */
export const today = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/* ------------------------------------------------------------------ *
 * Lookups
 * ------------------------------------------------------------------ */

export const findStory = (board: Board, id: string) =>
  board.stories.find((s) => s.id === id);

export const findTask = (board: Board, id: string) =>
  board.tasks.find((t) => t.id === id);

export const findProject = (board: Board, id: string) =>
  board.projects.find((p) => p.id === id);

/* ------------------------------------------------------------------ *
 * Tags
 *
 * The registry (board.tags) is keyed by label and supplies color and
 * description. Items reference tags by label, and a label that is not in the
 * registry is still valid — it just renders neutral. These helpers are the only
 * place that distinction is interpreted.
 * ------------------------------------------------------------------ */

export const findTag = (board: Board, label: string): TagDef | undefined =>
  board.tags?.find((t) => t.label === label);

/** Registry color for a label, or undefined when unregistered. */
export const tagColor = (board: Board, label: string): string | undefined =>
  findTag(board, label)?.color;

/** How many stories and tasks carry this label. */
export function tagUsage(board: Board, label: string): number {
  const inStories = board.stories.filter((s) => (s.tags ?? []).includes(label)).length;
  const inTasks = board.tasks.filter((t) => (t.tags ?? []).includes(label)).length;
  return inStories + inTasks;
}

/** Labels used on items but absent from the registry. */
export function unregisteredTags(board: Board): string[] {
  const registered = new Set((board.tags ?? []).map((t) => t.label));
  return usedTags(board).filter((l) => !registered.has(l));
}

/** Distinct labels actually applied to stories or tasks, sorted. */
export function usedTags(board: Board): string[] {
  const set = new Set<string>();
  for (const s of board.stories) for (const t of s.tags ?? []) set.add(t);
  for (const t of board.tasks) for (const x of t.tags ?? []) set.add(x);
  return [...set].sort();
}

/**
 * Every label worth offering in a picker or filter: the registry plus any
 * in-use label that is not registered yet. Sorted, deduplicated.
 */
export function allTags(board: Board): string[] {
  const set = new Set<string>((board.tags ?? []).map((t) => t.label));
  for (const l of usedTags(board)) set.add(l);
  return [...set].sort();
}

export const tasksOfStory = (board: Board, storyId: string) =>
  board.tasks.filter((t) => t.storyId === storyId);

/** Next free id in a series, e.g. nextId('S-', stories) -> "S-9". */
export function nextId(prefix: string, items: Array<{ id: string }>): string {
  const max = items.reduce((acc, item) => {
    const m = /(\d+)$/.exec(item.id);
    return m ? Math.max(acc, Number(m[1])) : acc;
  }, 0);
  return `${prefix}${max + 1}`;
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

/** Days until `date`. Negative = overdue. Null when no date. */
export function daysUntil(date?: string | null): number | null {
  if (!date) return null;
  const ms = new Date(`${date}T00:00:00`).getTime() - new Date(`${today()}T00:00:00`).getTime();
  return Math.round(ms / 86_400_000);
}

export function dueState(date?: string | null, status?: Status): '' | 'soon' | 'over' {
  if (!date || status === 'done') return '';
  const d = daysUntil(date)!;
  if (d < 0) return 'over';
  if (d <= 3) return 'soon';
  return '';
}

export function dueLabel(date?: string | null, status?: Status): string {
  if (!date) return '';
  if (status === 'done') return date;
  const d = daysUntil(date)!;
  if (d < 0) return `${date} · ${Math.abs(d)}d late`;
  if (d === 0) return `${date} · today`;
  if (d <= 3) return `${date} · ${d}d`;
  return date;
}

/* ------------------------------------------------------------------ *
 * Links and blocking
 * ------------------------------------------------------------------ */

/**
 * Links pointing *at* this story, derived by scanning other stories'
 * outgoing links. This is why a relationship is only ever stored once.
 */
export function inboundLinks(board: Board, storyId: string): ResolvedLink[] {
  const out: ResolvedLink[] = [];
  for (const s of board.stories) {
    for (const l of s.links ?? []) {
      if (l.target !== storyId) continue;
      out.push({
        type: l.type,
        otherId: s.id,
        direction: 'in',
        label: LINK_BY_TYPE[l.type]?.inverse ?? l.type,
      });
    }
  }
  return out;
}

export function outboundLinks(story: Story): ResolvedLink[] {
  return (story.links ?? []).map((l) => ({
    type: l.type,
    otherId: l.target,
    direction: 'out' as const,
    label: LINK_BY_TYPE[l.type]?.label ?? l.type,
  }));
}

/** Both directions, outgoing first. */
export function allLinks(board: Board, story: Story): ResolvedLink[] {
  return [...outboundLinks(story), ...inboundLinks(board, story.id)];
}

/**
 * Ids of unfinished stories that gate this one. A story is gated by an
 * inbound `blocks` or `precedes` link whose source is not yet done.
 */
export function blockerIds(board: Board, storyId: string): string[] {
  return inboundLinks(board, storyId)
    .filter((l) => LINK_BY_TYPE[l.type]?.blocking)
    .filter((l) => findStory(board, l.otherId)?.status !== 'done')
    .map((l) => l.otherId);
}

export const isBlocked = (board: Board, story: Story): boolean =>
  story.status !== 'done' && blockerIds(board, story.id).length > 0;

/* ------------------------------------------------------------------ *
 * Progress and rollups
 * ------------------------------------------------------------------ */

export interface Progress {
  done: number;
  total: number;
  pct: number;
}

export function storyProgress(board: Board, storyId: string): Progress {
  const tasks = tasksOfStory(board, storyId);
  const done = tasks.filter((t) => t.status === 'done').length;
  return {
    done,
    total: tasks.length,
    pct: tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100),
  };
}

export const sumEstimates = (items: Array<{ estimate?: number | null }>): number =>
  items.reduce((acc, i) => acc + (i.estimate ?? 0), 0);

export interface BoardStats {
  stories: number;
  storiesDone: number;
  tasks: number;
  tasksDone: number;
  openPoints: number;
  donePoints: number;
  overdue: number;
  blocked: number;
  byStatus: Record<Status, number>;
}

/** Headline numbers for the stats panel. Scoped to the stories passed in. */
export function computeStats(board: Board, stories: Story[]): BoardStats {
  const ids = new Set(stories.map((s) => s.id));
  const tasks = board.tasks.filter((t) => ids.has(t.storyId));

  const byStatus = Object.fromEntries(
    STATUS_ORDER.map((s) => [s, stories.filter((x) => x.status === s).length]),
  ) as Record<Status, number>;

  const overdueStories = stories.filter(
    (s) => s.status !== 'done' && dueState(s.due, s.status) === 'over',
  ).length;
  const overdueTasks = tasks.filter(
    (t) => t.status !== 'done' && dueState(t.due, t.status) === 'over',
  ).length;

  return {
    stories: stories.length,
    storiesDone: stories.filter((s) => s.status === 'done').length,
    tasks: tasks.length,
    tasksDone: tasks.filter((t) => t.status === 'done').length,
    openPoints: sumEstimates(stories.filter((s) => s.status !== 'done')),
    donePoints: sumEstimates(stories.filter((s) => s.status === 'done')),
    overdue: overdueStories + overdueTasks,
    blocked: stories.filter((s) => isBlocked(board, s)).length,
    byStatus,
  };
}

/** Open vs done points per project, for the stats bar chart. */
export function pointsByProject(board: Board, stories: Story[]) {
  return board.projects.map((p) => {
    const mine = stories.filter((s) => s.project === p.id);
    return {
      project: p,
      open: sumEstimates(mine.filter((s) => s.status !== 'done')),
      done: sumEstimates(mine.filter((s) => s.status === 'done')),
    };
  });
}

/** Cumulative tasks completed per day, for the trend line. */
export function completionTrend(board: Board, stories: Story[]) {
  const ids = new Set(stories.map((s) => s.id));
  const dates = board.tasks
    .filter((t) => ids.has(t.storyId) && t.status === 'done' && t.completedAt)
    .map((t) => t.completedAt as string)
    .sort();

  const counts = new Map<string, number>();
  for (const d of dates) counts.set(d, (counts.get(d) ?? 0) + 1);

  let running = 0;
  return [...counts.entries()].map(([date, n]) => {
    running += n;
    return { date, completed: n, cumulative: running };
  });
}

/* ------------------------------------------------------------------ *
 * Filtering
 * ------------------------------------------------------------------ */

function matchesSearch(board: Board, story: Story, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const project = findProject(board, story.project);
  const inStory = [
    story.id,
    story.title,
    story.description ?? '',
    project?.label ?? '',
    ...(story.tags ?? []),
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
  if (inStory) return true;

  // Searching also matches a story when one of its tasks matches.
  return tasksOfStory(board, story.id).some((t) =>
    [t.id, t.title, t.description ?? '', ...(t.tags ?? [])]
      .join(' ')
      .toLowerCase()
      .includes(q),
  );
}

/** Apply all filter facets. An empty facet means "no constraint". */
export function filterStories(board: Board, filters: Filters): Story[] {
  return board.stories.filter((s) => {
    if (filters.projects.length && !filters.projects.includes(s.project)) return false;
    if (filters.priorities.length && !filters.priorities.includes(s.priority)) return false;

    if (filters.tags.length) {
      const own = new Set<string>(s.tags ?? []);
      for (const t of tasksOfStory(board, s.id)) for (const x of t.tags ?? []) own.add(x);
      if (!filters.tags.some((t) => own.has(t))) return false;
    }

    return matchesSearch(board, s, filters.search);
  });
}

export const storiesInColumn = (stories: Story[], status: Status): Story[] =>
  stories.filter((s) => s.status === status);

export const hasActiveFilters = (f: Filters): boolean =>
  f.projects.length > 0 || f.priorities.length > 0 || f.tags.length > 0 || f.search.trim() !== '';

export const EMPTY_FILTERS: Filters = { projects: [], priorities: [], tags: [], search: '' };

/* ------------------------------------------------------------------ *
 * Status transitions
 * ------------------------------------------------------------------ */

/**
 * Apply a status change, keeping `completedAt` consistent with `status`.
 * The server rejects a done item without a completion date, so this is the
 * single place status is allowed to change.
 */
export function withStatus<T extends Story | Task>(item: T, status: Status): T {
  return {
    ...item,
    status,
    completedAt: status === 'done' ? (item.completedAt ?? today()) : null,
  };
}

export const priorityRank = (p: Priority): number =>
  ({ high: 0, medium: 1, low: 2 })[p];
