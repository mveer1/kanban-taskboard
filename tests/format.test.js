import { describe, expect, it } from 'vitest';
import { formatBoard } from '../server/store.js';
import { validateBoard } from '../server/validate.js';

/**
 * Tests for the canonical serializer.
 *
 * formatBoard is what makes data/board.json safe to hand-edit: output must be
 * valid JSON, semantically identical to the input, stably ordered, and laid out
 * predictably so diffs stay small.
 */

const board = () => ({
  meta: { version: 3, updated: '2020-01-01', idPrefixes: { story: 'S-' } },
  projects: [
    { id: 'p-b', label: 'Bee', color: '#93c5fd', description: null },
    { id: 'p-a', label: 'Ay', color: '#a78bfa', description: 'First' },
  ],
  tags: [
    { label: 'zeta', color: '#fcd34d', description: null },
    { label: 'alpha', color: '#6ee7b7', description: 'First tag' },
  ],
  stories: [
    {
      id: 'S-1',
      title: 'With "quotes" and \\backslash',
      description: 'Line one.\nLine two.',
      status: 'active',
      project: 'p-a',
      priority: 'high',
      due: '2026-08-29',
      estimate: 21,
      tags: ['alpha', 'zeta'],
      links: [{ type: 'blocks', target: 'S-2' }],
      notes: [{ date: '2026-08-06', text: 'A note — with em dash' }],
      created: '2026-08-04',
      completedAt: null,
    },
    {
      id: 'S-2',
      title: 'Second',
      description: null,
      status: 'new',
      project: 'p-b',
      priority: 'low',
      due: null,
      estimate: null,
      tags: [],
      links: [],
      notes: [],
      created: '2026-08-05',
      completedAt: null,
    },
  ],
  tasks: [
    { id: 'T-2', storyId: 'S-2', title: 'B', status: 'new', priority: 'low', tags: [], notes: [] },
    { id: 'T-1', storyId: 'S-1', title: 'A', status: 'new', priority: 'high', tags: ['alpha'], notes: [] },
  ],
});

const roundTrip = (input) => JSON.parse(formatBoard(input));

describe('formatBoard — output is valid and lossless', () => {
  it('emits parseable JSON', () => {
    expect(() => JSON.parse(formatBoard(board()))).not.toThrow();
  });

  it('preserves every record', () => {
    const out = roundTrip(board());
    expect(out.projects).toHaveLength(2);
    expect(out.tags).toHaveLength(2);
    expect(out.stories).toHaveLength(2);
    expect(out.tasks).toHaveLength(2);
  });

  it('preserves nested links and notes', () => {
    const out = roundTrip(board());
    expect(out.stories[0].links).toEqual([{ type: 'blocks', target: 'S-2' }]);
    expect(out.stories[0].notes).toEqual([
      { date: '2026-08-06', text: 'A note — with em dash' },
    ]);
  });

  it('escapes quotes, backslashes, and newlines correctly', () => {
    const out = roundTrip(board());
    expect(out.stories[0].title).toBe('With "quotes" and \\backslash');
    expect(out.stories[0].description).toBe('Line one.\nLine two.');
  });

  it('preserves nulls rather than dropping the key', () => {
    const out = roundTrip(board());
    expect(out.stories[1].description).toBeNull();
    expect(out.stories[1].due).toBeNull();
    expect(out.stories[1].estimate).toBeNull();
    expect(out.stories[1].completedAt).toBeNull();
  });

  it('survives a second pass unchanged (idempotent)', () => {
    const once = formatBoard(board());
    const twice = formatBoard(JSON.parse(once));
    expect(twice).toBe(once);
  });

  it('produces output that passes validation', () => {
    expect(validateBoard(roundTrip(board())).ok).toBe(true);
  });
});

describe('formatBoard — stable, reviewable layout', () => {
  it('writes story fields in a fixed order', () => {
    const keys = Object.keys(roundTrip(board()).stories[0]);
    expect(keys).toEqual([
      'id', 'title', 'description', 'status', 'project', 'priority',
      'due', 'estimate', 'tags', 'links', 'notes', 'created', 'completedAt',
    ]);
  });

  it('writes task fields in a fixed order', () => {
    const keys = Object.keys(roundTrip(board()).tasks[0]);
    expect(keys.slice(0, 6)).toEqual([
      'id', 'storyId', 'title', 'status', 'priority', 'tags',
    ]);
  });

  it('reorders keys into canonical order regardless of input order', () => {
    const shuffled = board();
    const s = shuffled.stories[0];
    shuffled.stories[0] = { priority: s.priority, title: s.title, id: s.id, ...s };
    expect(Object.keys(roundTrip(shuffled).stories[0])[0]).toBe('id');
  });

  it('sorts the tag registry alphabetically', () => {
    expect(roundTrip(board()).tags.map((t) => t.label)).toEqual(['alpha', 'zeta']);
  });

  it('keeps project order as authored (order is meaningful)', () => {
    expect(roundTrip(board()).projects.map((p) => p.id)).toEqual(['p-b', 'p-a']);
  });

  it('keeps story order as authored (order drives column position)', () => {
    expect(roundTrip(board()).stories.map((s) => s.id)).toEqual(['S-1', 'S-2']);
  });

  it('groups tasks under their parent story', () => {
    // Input order is T-2 then T-1; output groups by story order (S-1 first).
    expect(roundTrip(board()).tasks.map((t) => t.id)).toEqual(['T-1', 'T-2']);
  });

  it('writes one line per task and one block per story', () => {
    const text = formatBoard(board());
    const taskLines = text
      .split('\n')
      .filter((l) => l.trim().startsWith('{ "id": "T-'));
    expect(taskLines).toHaveLength(2);
  });

  it('stamps meta.updated with today', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(roundTrip(board()).meta.updated).toBe(today);
  });
});

describe('formatBoard — empty collections', () => {
  const empty = {
    meta: { version: 3 },
    projects: [],
    tags: [],
    stories: [],
    tasks: [],
  };

  it('renders empty arrays inline without blank lines', () => {
    const text = formatBoard(empty);
    expect(text).toContain('"projects": []');
    expect(text).toContain('"tags": []');
    expect(text).toContain('"stories": []');
    expect(text).toContain('"tasks": []');
    expect(text).not.toMatch(/\[\n\n/);
  });

  it('stays valid JSON when everything is empty', () => {
    expect(() => JSON.parse(formatBoard(empty))).not.toThrow();
  });

  it('handles a missing tag registry', () => {
    const noTags = { ...empty };
    delete noTags.tags;
    expect(JSON.parse(formatBoard(noTags)).tags).toEqual([]);
  });

  it('handles an orphan task whose story is absent from the list', () => {
    // Defensive: the serializer must not silently drop records.
    const orphan = {
      ...empty,
      tasks: [
        { id: 'T-9', storyId: 'S-gone', title: 'Orphan', status: 'new', priority: 'low' },
      ],
    };
    expect(JSON.parse(formatBoard(orphan)).tasks).toHaveLength(1);
  });
});
