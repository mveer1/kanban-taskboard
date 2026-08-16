import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateBoard as validateOnServer } from '../server/validate.js';
import { checkIntegrity, validateBoardWith } from '../shared/boardIntegrity.js';
import { starterBoard, initialsFrom, avatarColorFor } from '../src/data/starter';

/**
 * The two backends must agree on what a valid board is.
 *
 * In `local` mode the Express server rejects bad writes. In `firebase` mode the
 * client writes straight to Firestore and there is no server in the path — the
 * client-side validator IS the gate. If the two ever diverged, a board that the
 * hosted app accepted could be unloadable locally, and vice versa. These tests
 * pin them to the same module.
 */

const schema = JSON.parse(
  readFileSync(join(process.cwd(), 'data', 'schema.json'), 'utf8'),
);
/** Compiled the way src/data/validation.ts compiles it. */
const validateOnClient = (board) =>
  validateBoardWith(board, new Ajv({ allErrors: true, strict: false }).compile(schema));

const base = () => ({
  meta: { version: 3 },
  projects: [{ id: 'p-a', label: 'A', color: '#a78bfa' }],
  tags: [],
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

describe('client and server validation agree', () => {
  const cases = {
    'a valid board': base(),
    'a story pointing at a missing project': (() => {
      const b = base();
      b.stories[0].project = 'p-nope';
      return b;
    })(),
    'a task pointing at a missing story': (() => {
      const b = base();
      b.tasks[0].storyId = 'S-99';
      return b;
    })(),
    'a done story with no completedAt': (() => {
      const b = base();
      b.stories[0].status = 'done';
      return b;
    })(),
    'a non-done story carrying completedAt': (() => {
      const b = base();
      b.stories[0].completedAt = '2026-01-01';
      return b;
    })(),
    'a self-referential link': (() => {
      const b = base();
      b.stories[0].links = [{ type: 'blocks', target: 'S-1' }];
      return b;
    })(),
    'a duplicate story id': (() => {
      const b = base();
      b.stories.push({ ...b.stories[0] });
      return b;
    })(),
    'a bad colour': (() => {
      const b = base();
      b.projects[0].color = 'purple';
      return b;
    })(),
    'an unknown key': (() => {
      const b = base();
      b.stories[0].nope = true;
      return b;
    })(),
    'not an object': 'nope',
    'null': null,
  };

  for (const [label, board] of Object.entries(cases)) {
    it(`reaches the same verdict for ${label}`, () => {
      const server = validateOnServer(board);
      const client = validateOnClient(board);
      expect(client.ok).toBe(server.ok);
      // Same rules, so the same messages — not merely the same pass/fail.
      expect(client.errors.sort()).toEqual(server.errors.sort());
    });
  }
});

describe('checkIntegrity', () => {
  it('collects every problem rather than stopping at the first', () => {
    const board = base();
    board.stories[0].project = 'p-missing';
    board.stories[0].status = 'done';
    board.tasks[0].storyId = 'S-404';

    const errors = checkIntegrity(board);
    expect(errors).toHaveLength(3);
    expect(errors.join('\n')).toContain('p-missing');
    expect(errors.join('\n')).toContain('completedAt');
    expect(errors.join('\n')).toContain('S-404');
  });

  it('treats an absent tag registry as empty, not invalid', () => {
    const board = base();
    delete board.tags;
    expect(checkIntegrity(board)).toEqual([]);
  });
});

describe('starterBoard', () => {
  it('passes validation, so a new workspace can be saved immediately', () => {
    const result = validateOnClient(starterBoard());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('includes a project, because story.project is a required foreign key', () => {
    expect(starterBoard().projects.length).toBeGreaterThan(0);
  });

  it('uses the local calendar date, not the UTC one', () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    expect(starterBoard().meta.updated).toBe(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    );
  });
});

describe('derived identity', () => {
  it('builds initials from a two-part name', () => {
    expect(initialsFrom('Ada Lovelace')).toBe('AL');
  });

  it('falls back to the first two characters of a single word', () => {
    expect(initialsFrom('ada')).toBe('AD');
  });

  it('splits on the separators found in email local parts', () => {
    expect(initialsFrom('ada.lovelace@example.com')).toBe('AL');
  });

  it('never returns an empty string', () => {
    expect(initialsFrom('   ')).toBe('??');
  });

  it('is stable for the same uid and a valid hex colour', () => {
    const first = avatarColorFor('uid-123');
    expect(avatarColorFor('uid-123')).toBe(first);
    expect(first).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
