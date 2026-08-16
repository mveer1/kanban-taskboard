import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { BOARD_FILE, DATA_DIR } from '../server/paths.js';

/**
 * Integration tests against a real server process.
 *
 * These cover what unit tests cannot: that a rejected write leaves the file
 * untouched, that an accepted write lands on disk, and that a stale client
 * cannot silently erase a collection it does not know about.
 *
 * The suite starts its own server on a spare port and installs its own fixture,
 * so it neither depends on nor disturbs the real board. The original file is
 * restored byte-for-byte when it finishes.
 */

const PORT = 4399;
const BASE = `http://127.0.0.1:${PORT}`;

/** Known-good board the assertions rely on. Must contain at least one of each
 *  record type and two tags, so ordering and registry behaviour are observable. */
const FIXTURE = {
  meta: { version: 3, updated: '2026-01-01', idPrefixes: { project: 'p-', story: 'S-', task: 'T-' } },
  projects: [{ id: 'p-fix', label: 'Fixture', color: '#a78bfa', description: null }],
  tags: [
    { label: 'alpha', color: '#93c5fd', description: null },
    { label: 'beta', color: '#fca5a5', description: null },
  ],
  stories: [
    {
      id: 'S-1',
      title: 'Fixture story',
      description: null,
      status: 'active',
      project: 'p-fix',
      priority: 'high',
      due: null,
      estimate: 5,
      tags: ['alpha'],
      links: [],
      notes: [],
      created: '2026-01-01',
      completedAt: null,
    },
  ],
  tasks: [
    {
      id: 'T-1',
      storyId: 'S-1',
      title: 'Fixture task',
      description: null,
      status: 'new',
      priority: 'medium',
      due: null,
      estimate: 2,
      tags: ['beta'],
      notes: [],
      created: '2026-01-01',
      completedAt: null,
    },
  ],
};

let server;
let original = null;

const api = async (path, init) => {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
};

const getBoard = async () => (await api('/api/board')).body;
const onDisk = async () => JSON.parse(await readFile(BOARD_FILE, 'utf8'));

beforeAll(async () => {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    original = await readFile(BOARD_FILE, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      original = null;
    } else {
      throw err;
    }
  }
  // Install the fixture so assertions do not depend on the user's real board.
  await writeFile(BOARD_FILE, `${JSON.stringify(FIXTURE, null, 2)}\n`, 'utf8');
  process.env.API_PORT = String(PORT);
  ({ server } = await import('../server/index.js'));
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}, 20_000);

afterAll(async () => {
  // Restore the file byte-for-byte so the suite leaves no trace.
  if (original !== null) {
    await writeFile(BOARD_FILE, original, 'utf8');
  } else {
    await rm(BOARD_FILE, { force: true });
  }
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
});

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const { status, body } = await api('/api/health');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});

describe('GET /api/board', () => {
  it('returns the board with every collection', async () => {
    const { status, body } = await api('/api/board');
    expect(status).toBe(200);
    expect(body).toHaveProperty('meta');
    expect(Array.isArray(body.projects)).toBe(true);
    expect(Array.isArray(body.tags)).toBe(true);
    expect(Array.isArray(body.stories)).toBe(true);
    expect(Array.isArray(body.tasks)).toBe(true);
  });

  it('matches what is on disk', async () => {
    expect(await getBoard()).toEqual(await onDisk());
  });
});

describe('PUT /api/board — rejection leaves the file untouched', () => {
  it('rejects a board that breaks referential integrity', async () => {
    const before = await readFile(BOARD_FILE, 'utf8');
    const board = await getBoard();
    board.tasks[0].storyId = 'S-does-not-exist';

    const { status, body } = await api('/api/board', {
      method: 'PUT',
      body: JSON.stringify(board),
    });

    expect(status).toBe(422);
    expect(body.errors.join(' ')).toMatch(/missing story/);
    expect(await readFile(BOARD_FILE, 'utf8')).toBe(before);
  });

  it('rejects a schema violation', async () => {
    const before = await readFile(BOARD_FILE, 'utf8');
    const board = await getBoard();
    board.stories[0].status = 'archived';

    const { status } = await api('/api/board', { method: 'PUT', body: JSON.stringify(board) });

    expect(status).toBe(422);
    expect(await readFile(BOARD_FILE, 'utf8')).toBe(before);
  });

  it('rejects a done item with no completion date', async () => {
    const board = await getBoard();
    const open = board.tasks.find((t) => t.status !== 'done');
    open.status = 'done';
    open.completedAt = null;

    const { status, body } = await api('/api/board', {
      method: 'PUT',
      body: JSON.stringify(board),
    });

    expect(status).toBe(422);
    expect(body.errors.join(' ')).toMatch(/completedAt/);
  });

  it('rejects a non-object body at the parser', async () => {
    // express.json runs in strict mode, so a bare JSON scalar never reaches
    // the route and comes back as a 400 rather than a validation failure.
    const { status } = await api('/api/board', { method: 'PUT', body: '"not a board"' });
    expect(status).toBe(400);
  });

  it('rejects an object that is not a board', async () => {
    const { status, body } = await api('/api/board', {
      method: 'PUT',
      body: JSON.stringify({ nonsense: true }),
    });
    expect(status).toBe(422);
    expect(body.errors.length).toBeGreaterThan(0);
  });
});

describe('PUT /api/board — accepted writes', () => {
  it('persists a valid change and backs up the previous file', async () => {
    const board = await getBoard();
    board.stories[0].title = 'Renamed by integration test';

    const { status, body } = await api('/api/board', {
      method: 'PUT',
      body: JSON.stringify(board),
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.backup).toBeTruthy();
    expect((await onDisk()).stories[0].title).toBe('Renamed by integration test');
  });

  it('writes the file in canonical format, not as the client sent it', async () => {
    const board = await getBoard();
    // Send tags out of order; the server sorts them on write.
    board.tags = [...board.tags].reverse();

    await api('/api/board', { method: 'PUT', body: JSON.stringify(board) });

    const labels = (await onDisk()).tags.map((t) => t.label);
    expect(labels).toEqual([...labels].sort());
  });
});

describe('PUT /api/board — stale client protection', () => {
  it('preserves the tag registry when a client omits it entirely', async () => {
    // A client built before tags existed would otherwise wipe the registry.
    const board = await getBoard();
    const expected = board.tags.length;
    expect(expected).toBeGreaterThan(0);
    delete board.tags;

    const { status } = await api('/api/board', { method: 'PUT', body: JSON.stringify(board) });

    expect(status).toBe(200);
    expect((await onDisk()).tags).toHaveLength(expected);
  });

  it('still allows an explicit clear with an empty array', async () => {
    // Omission means "I don't know about this"; [] means "make it empty".
    const board = await getBoard();
    board.tags = [];

    const { status } = await api('/api/board', { method: 'PUT', body: JSON.stringify(board) });

    expect(status).toBe(200);
    expect((await onDisk()).tags).toEqual([]);
  });
});

describe('POST /api/validate', () => {
  it('reports a valid board without writing', async () => {
    const before = await readFile(BOARD_FILE, 'utf8');
    const { status, body } = await api('/api/validate', {
      method: 'POST',
      body: JSON.stringify(await getBoard()),
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(await readFile(BOARD_FILE, 'utf8')).toBe(before);
  });

  it('reports problems without writing', async () => {
    const before = await readFile(BOARD_FILE, 'utf8');
    const board = await getBoard();
    board.stories[0].project = 'p-nope';

    const { status, body } = await api('/api/validate', {
      method: 'POST',
      body: JSON.stringify(board),
    });

    expect(status).toBe(422);
    expect(body.ok).toBe(false);
    expect(body.errors.length).toBeGreaterThan(0);
    expect(await readFile(BOARD_FILE, 'utf8')).toBe(before);
  });
});

describe('GET /api/backups', () => {
  it('lists backups newest first, with size and timestamp', async () => {
    const { status, body } = await api('/api/backups');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toHaveProperty('name');
    expect(body[0]).toHaveProperty('size');
    expect(body[0]).toHaveProperty('modified');

    const names = body.map((b) => b.name);
    expect(names).toEqual([...names].sort().reverse());
  });
});

describe('GET /api/settings', () => {
  it('returns the settings document', async () => {
    const { status, body } = await api('/api/settings');
    expect(status).toBe(200);
    expect(body).toHaveProperty('profile');
    expect(body).toHaveProperty('board');
  });
});
