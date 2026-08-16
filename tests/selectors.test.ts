import { describe, expect, it } from 'vitest';
import {
  allLinks,
  allTags,
  blockerIds,
  completionTrend,
  computeStats,
  daysUntil,
  dueLabel,
  dueState,
  filterStories,
  findProject,
  findStory,
  findTask,
  hasActiveFilters,
  inboundLinks,
  isBlocked,
  nextId,
  outboundLinks,
  pointsByProject,
  priorityRank,
  storiesInColumn,
  storyProgress,
  sumEstimates,
  tagColor,
  tagUsage,
  tasksOfStory,
  unregisteredTags,
  usedTags,
  withStatus,
} from '@/store/selectors';
import { EMPTY_FILTERS } from '@/store/selectors';
import type { Board, Story, Task } from '@/types/board';

/**
 * Tests for the derived-state layer.
 *
 * Nothing here touches the network or the filesystem. These functions are the
 * single source of truth for everything the UI shows but does not store:
 * progress, blocking, stats, filtering, and tag usage.
 */

const story = (over: Partial<Story> & Pick<Story, 'id'>): Story => ({
  title: `Story ${over.id}`,
  description: null,
  status: 'new',
  project: 'p-a',
  priority: 'medium',
  due: null,
  estimate: null,
  tags: [],
  links: [],
  notes: [],
  created: '2026-01-01',
  completedAt: null,
  ...over,
});

const task = (over: Partial<Task> & Pick<Task, 'id' | 'storyId'>): Task => ({
  title: `Task ${over.id}`,
  description: null,
  status: 'new',
  priority: 'medium',
  due: null,
  estimate: null,
  tags: [],
  notes: [],
  created: '2026-01-01',
  completedAt: null,
  ...over,
});

/**
 * Fixture shape:
 *   S-1 active  p-a  5pts  high  tags[bug]   blocks -> S-2
 *   S-2 new     p-b  3pts        tags[chore, loose]
 *   S-3 done    p-a  8pts
 *   S-4 hold    p-a  --          precedes -> S-2, related -> S-1
 */
const board = (): Board => ({
  meta: { version: 3 },
  projects: [
    { id: 'p-a', label: 'Alpha', color: '#a78bfa', description: null },
    { id: 'p-b', label: 'Beta', color: '#93c5fd', description: null },
  ],
  tags: [
    { label: 'bug', color: '#fca5a5', description: null },
    { label: 'chore', color: '#93c5fd', description: null },
    { label: 'unused', color: '#6ee7b7', description: null },
  ],
  stories: [
    story({ id: 'S-1', status: 'active', estimate: 5, priority: 'high', tags: ['bug'],
      links: [{ type: 'blocks', target: 'S-2' }] }),
    story({ id: 'S-2', status: 'new', estimate: 3, project: 'p-b', tags: ['chore', 'loose'] }),
    story({ id: 'S-3', status: 'done', estimate: 8, completedAt: '2026-03-02' }),
    story({ id: 'S-4', status: 'hold',
      links: [{ type: 'precedes', target: 'S-2' }, { type: 'related', target: 'S-1' }] }),
  ],
  tasks: [
    task({ id: 'T-1', storyId: 'S-1', status: 'done', completedAt: '2026-03-01', estimate: 2 }),
    task({ id: 'T-2', storyId: 'S-1', status: 'active', estimate: 3, tags: ['bug'] }),
    task({ id: 'T-3', storyId: 'S-1' }),
    task({ id: 'T-4', storyId: 'S-2', status: 'done', completedAt: '2026-03-02' }),
  ],
});

/** A local calendar date N days from today, matching how `today()` formats. */
const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

describe('lookups', () => {
  it('finds records by id', () => {
    const b = board();
    expect(findStory(b, 'S-2')?.id).toBe('S-2');
    expect(findTask(b, 'T-3')?.id).toBe('T-3');
    expect(findProject(b, 'p-b')?.label).toBe('Beta');
  });

  it('returns undefined for a missing id instead of throwing', () => {
    const b = board();
    expect(findStory(b, 'S-99')).toBeUndefined();
    expect(findTask(b, 'T-99')).toBeUndefined();
    expect(findProject(b, 'p-zz')).toBeUndefined();
  });

  it('collects the tasks of one story only', () => {
    expect(tasksOfStory(board(), 'S-1').map((t) => t.id)).toEqual(['T-1', 'T-2', 'T-3']);
    expect(tasksOfStory(board(), 'S-4')).toEqual([]);
  });
});

describe('nextId', () => {
  it('continues from the highest existing number', () => {
    expect(nextId('S-', board().stories)).toBe('S-5');
    expect(nextId('T-', board().tasks)).toBe('T-5');
  });

  it('starts at 1 for an empty collection', () => {
    expect(nextId('S-', [])).toBe('S-1');
  });

  it('does not reuse a number after a gap', () => {
    // Deleting S-2 must not hand out an id that collides with history.
    expect(nextId('S-', [{ id: 'S-1' }, { id: 'S-7' }])).toBe('S-8');
  });
});

describe('links', () => {
  it('reads outbound links off the story itself', () => {
    const s1 = board().stories.find((s) => s.id === 'S-1')!;
    expect(outboundLinks(s1).map((l) => l.otherId)).toEqual(['S-2']);
    expect(outboundLinks(s1)[0].direction).toBe('out');
  });

  it('derives inbound links by scanning other stories', () => {
    // The inverse side of a relationship is never stored — it is computed.
    const inbound = inboundLinks(board(), 'S-2');
    expect(inbound.map((l) => l.otherId).sort()).toEqual(['S-1', 'S-4']);
    expect(inbound.every((l) => l.direction === 'in')).toBe(true);
  });

  it('labels an inbound link with the inverse wording', () => {
    const fromS1 = inboundLinks(board(), 'S-2').find((l) => l.otherId === 'S-1')!;
    expect(fromS1.type).toBe('blocks');
    expect(fromS1.label).toBe('Blocked by');
  });

  it('combines both directions, outgoing first', () => {
    const b = board();
    const s1 = b.stories.find((s) => s.id === 'S-1')!;
    const links = allLinks(b, s1);
    expect(links).toHaveLength(2); // out: blocks S-2. in: related from S-4.
    expect(links[0].direction).toBe('out');
  });

  it('returns nothing for a story with no relationships', () => {
    const b = board();
    const s3 = b.stories.find((s) => s.id === 'S-3')!;
    expect(allLinks(b, s3)).toEqual([]);
  });
});

describe('blocking', () => {
  it('treats unfinished blocks and precedes links as blockers', () => {
    const b = board();
    expect(blockerIds(b, 'S-2').sort()).toEqual(['S-1', 'S-4']);
    expect(isBlocked(b, b.stories.find((s) => s.id === 'S-2')!)).toBe(true);
  });

  it('stops counting a blocker once it is done', () => {
    const b = board();
    const s1 = b.stories.find((s) => s.id === 'S-1')!;
    s1.status = 'done';
    s1.completedAt = '2026-03-05';
    expect(blockerIds(b, 'S-2')).toEqual(['S-4']);
  });

  it('ignores non-blocking link types', () => {
    const b = board();
    // S-4 relates to S-1, which must not block it.
    expect(blockerIds(b, 'S-1')).toEqual([]);
    expect(isBlocked(b, b.stories.find((s) => s.id === 'S-1')!)).toBe(false);
  });

  it('never reports a done story as blocked', () => {
    const b = board();
    const s2 = b.stories.find((s) => s.id === 'S-2')!;
    s2.status = 'done';
    s2.completedAt = '2026-03-06';
    expect(isBlocked(b, s2)).toBe(false);
  });
});

describe('storyProgress', () => {
  it('counts done tasks and derives a percentage', () => {
    expect(storyProgress(board(), 'S-1')).toEqual({ done: 1, total: 3, pct: 33 });
  });

  it('reports 0% rather than NaN for a story with no tasks', () => {
    expect(storyProgress(board(), 'S-4')).toEqual({ done: 0, total: 0, pct: 0 });
  });

  it('reports 100% when every task is done', () => {
    expect(storyProgress(board(), 'S-2')).toEqual({ done: 1, total: 1, pct: 100 });
  });
});

describe('sumEstimates', () => {
  it('adds estimates and treats null as zero', () => {
    expect(sumEstimates([{ estimate: 5 }, { estimate: null }, { estimate: 8 }])).toBe(13);
  });

  it('returns 0 for an empty list', () => {
    expect(sumEstimates([])).toBe(0);
  });
});

describe('computeStats', () => {
  const stats = () => computeStats(board(), board().stories);

  it('counts stories and tasks with their done totals', () => {
    const s = stats();
    expect(s.stories).toBe(4);
    expect(s.storiesDone).toBe(1);
    expect(s.tasks).toBe(4);
    expect(s.tasksDone).toBe(2);
  });

  it('separates open points from done points', () => {
    const s = stats();
    expect(s.openPoints).toBe(8); // S-1 5 + S-2 3 + S-4 null
    expect(s.donePoints).toBe(8); // S-3
  });

  it('counts blocked stories', () => {
    expect(stats().blocked).toBe(1); // S-2 only
  });

  it('breaks the count down by status', () => {
    expect(stats().byStatus).toEqual({ new: 1, active: 1, hold: 1, done: 1 });
  });

  it('counts overdue open stories and tasks together', () => {
    const b = board();
    b.stories.find((s) => s.id === 'S-1')!.due = iso(-5);
    b.tasks.find((t) => t.id === 'T-2')!.due = iso(-2);
    expect(computeStats(b, b.stories).overdue).toBe(2);
  });

  it('does not count a done item as overdue', () => {
    const b = board();
    b.stories.find((s) => s.id === 'S-3')!.due = iso(-30);
    expect(computeStats(b, b.stories).overdue).toBe(0);
  });

  it('narrows to the stories it is given', () => {
    const b = board();
    const only = b.stories.filter((s) => s.id === 'S-1');
    const s = computeStats(b, only);
    expect(s.stories).toBe(1);
    expect(s.tasks).toBe(3); // only S-1's tasks
  });
});

describe('pointsByProject', () => {
  it('splits open and done estimates per project', () => {
    const rows = pointsByProject(board(), board().stories);
    const alpha = rows.find((r) => r.project.id === 'p-a')!;
    const beta = rows.find((r) => r.project.id === 'p-b')!;
    expect(alpha.open).toBe(5); // S-1; S-4 has no estimate
    expect(alpha.done).toBe(8); // S-3
    expect(beta.open).toBe(3);
    expect(beta.done).toBe(0);
  });

  it('includes a project with no stories as zero', () => {
    const b = board();
    const rows = pointsByProject(b, []);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.open === 0 && r.done === 0)).toBe(true);
  });
});

describe('completionTrend', () => {
  it('buckets done tasks by completion date and accumulates', () => {
    const trend = completionTrend(board(), board().stories);
    expect(trend).toEqual([
      { date: '2026-03-01', completed: 1, cumulative: 1 },
      { date: '2026-03-02', completed: 1, cumulative: 2 },
    ]);
  });

  it('ignores tasks that are not done', () => {
    const b = board();
    b.tasks = b.tasks.filter((t) => t.status !== 'done');
    expect(completionTrend(b, b.stories)).toEqual([]);
  });

  it('only counts tasks of the stories in scope', () => {
    const b = board();
    const only = b.stories.filter((s) => s.id === 'S-2');
    expect(completionTrend(b, only)).toEqual([
      { date: '2026-03-02', completed: 1, cumulative: 1 },
    ]);
  });
});

describe('dates', () => {
  it('returns null when there is no date', () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil(undefined)).toBeNull();
  });

  it('counts today as zero days away', () => {
    expect(daysUntil(iso(0))).toBe(0);
  });

  it('returns a negative count for a past date', () => {
    expect(daysUntil(iso(-4))).toBe(-4);
  });

  it('classifies overdue, soon, and neither', () => {
    expect(dueState(iso(-1))).toBe('over');
    expect(dueState(iso(0))).toBe('soon');
    expect(dueState(iso(3))).toBe('soon');
    expect(dueState(iso(30))).toBe('');
  });

  it('never flags a done item, however old the due date', () => {
    expect(dueState(iso(-90), 'done')).toBe('');
  });

  it('returns an empty state when there is no due date', () => {
    expect(dueState(null)).toBe('');
  });

  it('labels lateness and imminence in words', () => {
    expect(dueLabel(iso(-3))).toContain('3d late');
    expect(dueLabel(iso(0))).toContain('today');
    expect(dueLabel(iso(2))).toContain('2d');
  });

  it('shows a plain date for a distant or completed item', () => {
    expect(dueLabel('2099-06-01')).toBe('2099-06-01');
    expect(dueLabel('2020-01-01', 'done')).toBe('2020-01-01');
  });
});

describe('withStatus', () => {
  it('stamps completedAt when moving to done', () => {
    const next = withStatus(story({ id: 'S-1' }), 'done');
    expect(next.status).toBe('done');
    expect(next.completedAt).toBe(iso(0));
  });

  it('clears completedAt when moving out of done', () => {
    const done = story({ id: 'S-1', status: 'done', completedAt: '2026-01-05' });
    expect(withStatus(done, 'active').completedAt).toBeNull();
  });

  it('keeps the original completion date when already done', () => {
    const done = story({ id: 'S-1', status: 'done', completedAt: '2026-01-05' });
    expect(withStatus(done, 'done').completedAt).toBe('2026-01-05');
  });

  it('works the same for tasks', () => {
    const next = withStatus(task({ id: 'T-9', storyId: 'S-1' }), 'done');
    expect(next.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('does not mutate the input', () => {
    const original = story({ id: 'S-1', status: 'new' });
    withStatus(original, 'done');
    expect(original.status).toBe('new');
    expect(original.completedAt).toBeNull();
  });
});

describe('filterStories', () => {
  const run = (over: Partial<typeof EMPTY_FILTERS>) =>
    filterStories(board(), { ...EMPTY_FILTERS, ...over }).map((s) => s.id);

  it('returns everything when no facet is set', () => {
    expect(run({})).toEqual(['S-1', 'S-2', 'S-3', 'S-4']);
  });

  it('filters by project', () => {
    expect(run({ projects: ['p-b'] })).toEqual(['S-2']);
  });

  it('filters by priority', () => {
    expect(run({ priorities: ['high'] })).toEqual(['S-1']);
  });

  it('filters by tag on the story', () => {
    expect(run({ tags: ['chore'] })).toEqual(['S-2']);
  });

  it('keeps a story whose child task carries the tag', () => {
    // "bug" is on S-1 directly and on T-2; either route should match.
    expect(run({ tags: ['bug'] })).toEqual(['S-1']);
  });

  it('treats multiple tags as OR', () => {
    expect(run({ tags: ['chore', 'bug'] })).toEqual(['S-1', 'S-2']);
  });

  it('combines different facets as AND', () => {
    expect(run({ projects: ['p-b'], priorities: ['high'] })).toEqual([]);
  });

  it('searches id, title, and description case-insensitively', () => {
    expect(run({ search: 's-3' })).toEqual(['S-3']);
    expect(run({ search: 'STORY S-4' })).toEqual(['S-4']);
  });

  it('keeps a story when one of its tasks matches the search', () => {
    expect(run({ search: 'Task T-3' })).toEqual(['S-1']);
  });

  it('returns nothing when the search matches nothing', () => {
    expect(run({ search: 'zzzznomatch' })).toEqual([]);
  });

  it('ignores a whitespace-only search', () => {
    expect(run({ search: '   ' })).toHaveLength(4);
  });
});

describe('storiesInColumn', () => {
  it('keeps only the stories of that status', () => {
    const s = board().stories;
    expect(storiesInColumn(s, 'active').map((x) => x.id)).toEqual(['S-1']);
    expect(storiesInColumn(s, 'done').map((x) => x.id)).toEqual(['S-3']);
    expect(storiesInColumn(s, 'hold').map((x) => x.id)).toEqual(['S-4']);
  });

  it('returns an empty list for a status nobody has', () => {
    const s = board().stories.filter((x) => x.status === 'new');
    expect(storiesInColumn(s, 'done')).toEqual([]);
  });
});

describe('hasActiveFilters', () => {
  it('is false for the empty filter set', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it('is false when search is only whitespace', () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, search: '  ' })).toBe(false);
  });

  it('is true when any facet is set', () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, projects: ['p-a'] })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, tags: ['bug'] })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, search: 'x' })).toBe(true);
  });
});

describe('tags', () => {
  it('resolves a registered tag colour', () => {
    expect(tagColor(board(), 'bug')).toBe('#fca5a5');
  });

  it('returns undefined for an unregistered label', () => {
    // Unregistered labels are legal; they just render neutral.
    expect(tagColor(board(), 'loose')).toBeUndefined();
  });

  it('counts usage across both stories and tasks', () => {
    expect(tagUsage(board(), 'bug')).toBe(2); // S-1 and T-2
  });

  it('reports zero for a registered but unused tag', () => {
    expect(tagUsage(board(), 'unused')).toBe(0);
  });

  it('lists distinct labels actually in use, sorted', () => {
    expect(usedTags(board())).toEqual(['bug', 'chore', 'loose']);
  });

  it('lists labels used on items but missing from the registry', () => {
    expect(unregisteredTags(board())).toEqual(['loose']);
  });

  it('unions the registry with in-use labels, sorted and deduplicated', () => {
    expect(allTags(board())).toEqual(['bug', 'chore', 'loose', 'unused']);
  });

  it('handles a board with no registry at all', () => {
    const b = board();
    delete (b as { tags?: unknown }).tags;
    expect(allTags(b)).toEqual(['bug', 'chore', 'loose']);
    expect(tagColor(b, 'bug')).toBeUndefined();
  });
});

describe('priorityRank', () => {
  it('orders high before medium before low', () => {
    expect(priorityRank('high')).toBeLessThan(priorityRank('medium'));
    expect(priorityRank('medium')).toBeLessThan(priorityRank('low'));
  });
});
