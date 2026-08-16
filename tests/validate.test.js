import { describe, expect, it } from 'vitest';
import { validateBoard } from '../server/validate.js';

/**
 * Tests for the write-rejection boundary.
 *
 * Every rule here is something that, if it slipped through, would corrupt
 * data/board.json. These are the guarantees the app relies on.
 */

/** Minimal valid board; spread over it to construct focused failures. */
const base = () => ({
  meta: { version: 3 },
  projects: [{ id: 'p-a', label: 'A', color: '#a78bfa' }],
  tags: [{ label: 'bug', color: '#fca5a5' }],
  stories: [
    {
      id: 'S-1',
      title: 'Story one',
      status: 'active',
      project: 'p-a',
      priority: 'high',
      links: [],
      notes: [],
      tags: [],
    },
  ],
  tasks: [
    { id: 'T-1', storyId: 'S-1', title: 'Task one', status: 'new', priority: 'low', tags: [] },
  ],
});

const errorsFor = (mutate) => {
  const board = base();
  mutate(board);
  return validateBoard(board).errors;
};

describe('validateBoard — accepts valid input', () => {
  it('accepts a minimal well-formed board', () => {
    expect(validateBoard(base())).toEqual({ ok: true, errors: [] });
  });

  it('accepts a board with no tag registry', () => {
    const board = base();
    delete board.tags;
    expect(validateBoard(board).ok).toBe(true);
  });

  it('accepts empty collections', () => {
    expect(
      validateBoard({ meta: { version: 3 }, projects: [], tags: [], stories: [], tasks: [] }).ok,
    ).toBe(true);
  });
});

describe('validateBoard — rejects malformed input', () => {
  it('rejects a non-object', () => {
    expect(validateBoard(null).ok).toBe(false);
    expect(validateBoard('nope').ok).toBe(false);
  });

  it('rejects an unknown status', () => {
    const errors = errorsFor((b) => {
      b.stories[0].status = 'archived';
    });
    expect(errors.join(' ')).toMatch(/status/);
  });

  it('rejects an unknown priority', () => {
    expect(errorsFor((b) => { b.tasks[0].priority = 'urgent'; }).length).toBeGreaterThan(0);
  });

  it('rejects an unknown link type', () => {
    expect(
      errorsFor((b) => { b.stories[0].links = [{ type: 'relates', target: 'S-1' }]; }).length,
    ).toBeGreaterThan(0);
  });

  it('rejects a malformed id', () => {
    expect(errorsFor((b) => { b.stories[0].id = 'story-1'; }).length).toBeGreaterThan(0);
    expect(errorsFor((b) => { b.projects[0].id = 'Data'; }).length).toBeGreaterThan(0);
  });

  it('rejects a non-ISO date', () => {
    expect(errorsFor((b) => { b.stories[0].due = '08/29/2026'; }).length).toBeGreaterThan(0);
  });

  it('rejects a malformed color', () => {
    expect(errorsFor((b) => { b.projects[0].color = 'violet'; }).length).toBeGreaterThan(0);
    expect(errorsFor((b) => { b.tags[0].color = '#fff'; }).length).toBeGreaterThan(0);
  });

  it('rejects unknown properties', () => {
    expect(errorsFor((b) => { b.stories[0].assignee = 'someone'; }).length).toBeGreaterThan(0);
  });

  it('rejects a missing required field', () => {
    expect(errorsFor((b) => { delete b.stories[0].title; }).length).toBeGreaterThan(0);
  });

  it('rejects an empty title', () => {
    expect(errorsFor((b) => { b.stories[0].title = ''; }).length).toBeGreaterThan(0);
  });
});

describe('validateBoard — referential integrity', () => {
  it('rejects a story pointing at a missing project', () => {
    const errors = errorsFor((b) => { b.stories[0].project = 'p-ghost'; });
    expect(errors).toContain('Story S-1 references missing project "p-ghost"');
  });

  it('rejects a task pointing at a missing story', () => {
    const errors = errorsFor((b) => { b.tasks[0].storyId = 'S-404'; });
    expect(errors).toContain('Task T-1 references missing story "S-404"');
  });

  it('rejects a link to a missing story', () => {
    const errors = errorsFor((b) => {
      b.stories[0].links = [{ type: 'blocks', target: 'S-99' }];
    });
    expect(errors).toContain('Story S-1 has a "blocks" link to missing story "S-99"');
  });

  it('rejects a self-link', () => {
    const errors = errorsFor((b) => {
      b.stories[0].links = [{ type: 'blocks', target: 'S-1' }];
    });
    expect(errors).toContain('Story S-1 links to itself');
  });

  it('rejects duplicate ids', () => {
    expect(errorsFor((b) => { b.stories.push({ ...b.stories[0] }); })).toContain(
      'Duplicate story id: S-1',
    );
    expect(errorsFor((b) => { b.tasks.push({ ...b.tasks[0] }); })).toContain(
      'Duplicate task id: T-1',
    );
    expect(errorsFor((b) => { b.projects.push({ ...b.projects[0] }); })).toContain(
      'Duplicate project id: p-a',
    );
  });

  it('rejects a duplicate tag label (registry is keyed by label)', () => {
    const errors = errorsFor((b) => { b.tags.push({ label: 'bug', color: '#93c5fd' }); });
    expect(errors).toContain('Duplicate tag label: "bug"');
  });

  it('allows an item tag that is not in the registry', () => {
    // The registry is deliberately loose — unregistered labels render neutral.
    const board = base();
    board.stories[0].tags = ['not-registered'];
    expect(validateBoard(board).ok).toBe(true);
  });
});

describe('validateBoard — completedAt must agree with status', () => {
  it('rejects a done story without completedAt', () => {
    const errors = errorsFor((b) => { b.stories[0].status = 'done'; });
    expect(errors).toContain('Story S-1 is done but has no completedAt date');
  });

  it('rejects a done task without completedAt', () => {
    const errors = errorsFor((b) => { b.tasks[0].status = 'done'; });
    expect(errors).toContain('Task T-1 is done but has no completedAt date');
  });

  it('rejects a non-done story carrying completedAt', () => {
    const errors = errorsFor((b) => { b.stories[0].completedAt = '2026-08-01'; });
    expect(errors).toContain('Story S-1 is not done but has completedAt "2026-08-01"');
  });

  it('accepts a done item with completedAt', () => {
    const board = base();
    board.stories[0].status = 'done';
    board.stories[0].completedAt = '2026-08-01';
    board.tasks[0].status = 'done';
    board.tasks[0].completedAt = '2026-08-01';
    expect(validateBoard(board).ok).toBe(true);
  });
});

describe('validateBoard — reports every problem at once', () => {
  it('collects multiple independent failures', () => {
    const errors = errorsFor((b) => {
      b.stories[0].project = 'p-ghost';
      b.stories[0].links = [{ type: 'blocks', target: 'S-77' }];
      b.tasks[0].storyId = 'S-404';
      b.tasks[0].status = 'done';
    });
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });
});
