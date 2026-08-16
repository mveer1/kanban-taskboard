/**
 * The only module that touches data/board.json.
 *
 * Safety contract:
 *   1. Every write is validated first (server/validate.js). Invalid data is rejected.
 *   2. The previous file is copied to data/backups/ before being replaced.
 *   3. Writes are atomic: tmp file -> fsync -> rename. A crash cannot truncate.
 *   4. Output uses a stable key order and a fixed layout, so diffs stay small
 *      and hand/AI edits to the file are easy to make and review.
 */

import { promises as fs, existsSync, watch } from 'node:fs';
import { join } from 'node:path';
import {
  BOARD_FILE,
  SETTINGS_FILE,
  BACKUP_DIR,
  DATA_DIR,
  BOARD_SEED_FILE,
  SETTINGS_SEED_FILE,
} from './paths.js';
import { validateBoard } from './validate.js';

/* ------------------------------------------------------------------ *
 * Stable serializer
 * ------------------------------------------------------------------ */

// Fixed field order. Keeps diffs minimal regardless of in-memory key order.
const PROJECT_KEYS = ['id', 'label', 'color', 'description'];
const TAG_KEYS = ['label', 'color', 'description'];
const STORY_KEYS = [
  'id', 'title', 'description', 'status', 'project', 'priority',
  'due', 'estimate', 'tags', 'links', 'notes', 'created', 'completedAt',
];
const TASK_KEYS = [
  'id', 'storyId', 'title', 'description', 'status', 'priority',
  'due', 'estimate', 'tags', 'notes', 'created', 'completedAt',
];

const j = (v) => (Array.isArray(v) ? inlineArray(v) : JSON.stringify(v ?? null));

/** `["a", "b"]` — JSON.stringify omits the space after commas. */
function inlineArray(arr) {
  return arr.length === 0 ? '[]' : `[${arr.map((v) => JSON.stringify(v)).join(', ')}]`;
}

/** `{ "a": 1, "b": 2 }` on a single line, fields in the given order. */
function inlineObject(obj, keys) {
  const parts = keys
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}: ${j(obj[k])}`);
  return `{ ${parts.join(', ')} }`;
}

/** A story: multi-line, with nested links/notes one per line. */
function storyBlock(s, indent) {
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 2);
  const deep = ' '.repeat(indent + 4);
  const lines = [];

  for (const k of STORY_KEYS) {
    if (s[k] === undefined) continue;

    if (k === 'links' || k === 'notes') {
      const arr = s[k] ?? [];
      if (arr.length === 0) {
        lines.push(`${inner}${JSON.stringify(k)}: []`);
      } else {
        const keys = k === 'links' ? ['type', 'target'] : ['date', 'text'];
        const items = arr.map((o) => `${deep}${inlineObject(o, keys)}`).join(',\n');
        lines.push(`${inner}${JSON.stringify(k)}: [\n${items}\n${inner}]`);
      }
    } else if (k === 'tags') {
      lines.push(`${inner}${JSON.stringify(k)}: ${inlineArray(s[k] ?? [])}`);
    } else {
      lines.push(`${inner}${JSON.stringify(k)}: ${j(s[k])}`);
    }
  }

  return `${pad}{\n${lines.join(',\n')}\n${pad}}`;
}

/**
 * Serialize the whole board. Tasks are one per line (they are small and read
 * like a table); stories are expanded because they carry nested data.
 */
export function formatBoard(board) {
  const meta = {
    version: board.meta?.version ?? 3,
    updated: new Date().toISOString().slice(0, 10),
    idPrefixes: board.meta?.idPrefixes ?? { project: 'p-', story: 'S-', task: 'T-' },
  };

  const projects = board.projects
    .map((p) => `    ${inlineObject(p, PROJECT_KEYS)}`)
    .join(',\n');

  // Registry is written alphabetically so the file stays easy to scan.
  const tags = [...(board.tags ?? [])]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((t) => `    ${inlineObject(t, TAG_KEYS)}`)
    .join(',\n');

  const stories = board.stories.map((s) => storyBlock(s, 4)).join(',\n');

  // Group tasks by story with a blank line between groups, matching card order.
  const taskLines = [];
  const seen = new Set();
  const orderedStoryIds = board.stories.map((s) => s.id);
  const groups = [...orderedStoryIds, null];

  for (const sid of groups) {
    const group = board.tasks.filter((t) =>
      sid === null ? !orderedStoryIds.includes(t.storyId) : t.storyId === sid,
    );
    if (group.length === 0) continue;
    if (taskLines.length > 0) taskLines.push('');
    for (const t of group) {
      seen.add(t.id);
      taskLines.push(`    ${inlineObject(t, TASK_KEYS)}`);
    }
  }

  const tasksBody = taskLines
    .map((line, i) => {
      if (line === '') return '';
      const isLast = taskLines.slice(i + 1).every((l) => l === '');
      return isLast ? line : `${line},`;
    })
    .join('\n');

  /** `"key": []` when empty, otherwise a multi-line block. */
  const section = (key, body, trailingComma) => {
    const comma = trailingComma ? ',' : '';
    return body.trim() === ''
      ? [`  ${JSON.stringify(key)}: []${comma}`]
      : [`  ${JSON.stringify(key)}: [`, body, `  ]${comma}`];
  };

  return [
    '{',
    `  "meta": ${JSON.stringify(meta, null, 2).split('\n').join('\n  ')},`,
    '',
    ...section('projects', projects, true),
    '',
    ...section('tags', tags, true),
    '',
    ...section('stories', stories, true),
    '',
    ...section('tasks', tasksBody, false),
    '}',
    '',
  ].join('\n');
}

/* ------------------------------------------------------------------ *
 * Atomic write + backups
 * ------------------------------------------------------------------ */

/** Set on every write so the file watcher can ignore our own changes. */
let lastSelfWrite = 0;

async function ensureDirs() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

async function pruneBackups(retention) {
  const files = (await fs.readdir(BACKUP_DIR))
    .filter((f) => f.startsWith('board.') && f.endsWith('.json'))
    .sort()
    .reverse();
  for (const stale of files.slice(retention)) {
    await fs.unlink(join(BACKUP_DIR, stale)).catch(() => {});
  }
}

async function backupCurrent(retention) {
  if (!existsSync(BOARD_FILE)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = join(BACKUP_DIR, `board.${stamp}.json`);
  await fs.copyFile(BOARD_FILE, dest);
  await pruneBackups(retention);
  return dest;
}

/** tmp -> fsync -> rename. The rename is atomic on both NTFS and POSIX. */
async function atomicWrite(file, text) {
  const tmp = `${file}.tmp`;
  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(text, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, file);
  lastSelfWrite = Date.now();
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export async function readBoard() {
  const text = await fs.readFile(BOARD_FILE, 'utf8');
  return JSON.parse(text);
}

/**
 * Create data/board.json and data/settings.json from the committed seeds if they
 * are missing.
 *
 * Both are git-ignored, because they hold personal data and this repo is meant to
 * be publishable. Without this a fresh clone would start the server against files
 * that do not exist and fail on the first read.
 *
 * Existing files are never touched.
 */
export async function ensureDataFiles() {
  await ensureDirs();
  const seeded = [];

  for (const [target, seed, label] of [
    [BOARD_FILE, BOARD_SEED_FILE, 'board.json'],
    [SETTINGS_FILE, SETTINGS_SEED_FILE, 'settings.json'],
  ]) {
    if (existsSync(target) || !existsSync(seed)) continue;
    await fs.copyFile(seed, target);
    seeded.push(label);
  }

  if (seeded.length > 0) {
    console.log(`[store] created ${seeded.join(' and ')} from the committed seed files`);
  }
  return seeded;
}

/**
 * Validate, back up, then atomically replace data/board.json.
 * @returns {{ ok: true, backup: string|null } | { ok: false, errors: string[] }}
 */
export async function writeBoard(board) {
  // A client that predates a collection would otherwise silently wipe it.
  // Omitting a key preserves what is on disk; sending an empty array clears it.
  const incoming = await preserveOmittedCollections(board);

  const { ok, errors } = validateBoard(incoming);
  if (!ok) return { ok: false, errors };

  await ensureDirs();
  const settings = await readSettings().catch(() => null);
  const retention = settings?.data?.backupRetention ?? 30;

  const backup = await backupCurrent(retention);
  await atomicWrite(BOARD_FILE, formatBoard(incoming));
  return { ok: true, backup };
}

/** Collections a write may omit without meaning "delete everything". */
const OPTIONAL_COLLECTIONS = ['tags'];

async function preserveOmittedCollections(board) {
  if (board === null || typeof board !== 'object') return board;
  if (OPTIONAL_COLLECTIONS.every((key) => board[key] !== undefined)) return board;

  const current = await readBoard().catch(() => null);
  if (!current) return board;

  const merged = { ...board };
  for (const key of OPTIONAL_COLLECTIONS) {
    if (merged[key] === undefined && current[key] !== undefined) {
      merged[key] = current[key];
      console.warn(`[store] write omitted "${key}" — preserved ${current[key].length} existing entr(ies)`);
    }
  }
  return merged;
}

export async function readSettings() {
  const text = await fs.readFile(SETTINGS_FILE, 'utf8');
  return JSON.parse(text);
}

export async function writeSettings(settings) {
  await atomicWrite(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`);
  return { ok: true };
}

export async function listBackups() {
  await ensureDirs();
  const files = (await fs.readdir(BACKUP_DIR))
    .filter((f) => f.startsWith('board.') && f.endsWith('.json'))
    .sort()
    .reverse();
  return Promise.all(
    files.map(async (name) => {
      const stat = await fs.stat(join(BACKUP_DIR, name));
      return { name, size: stat.size, modified: stat.mtime.toISOString() };
    }),
  );
}

export async function restoreBackup(name) {
  if (!/^board\.[\w-]+\.json$/.test(name)) {
    return { ok: false, errors: ['Invalid backup name'] };
  }
  const src = join(BACKUP_DIR, name);
  if (!existsSync(src)) return { ok: false, errors: ['Backup not found'] };
  const board = JSON.parse(await fs.readFile(src, 'utf8'));
  return writeBoard(board);
}

/**
 * Watch data/ for external edits to board.json — i.e. someone (or an AI agent)
 * editing the file directly — and invoke `onChange` so the server can push a
 * reload to connected clients. Our own writes are filtered out.
 */
export function watchBoardFile(onChange) {
  let timer = null;
  const watcher = watch(DATA_DIR, (_event, filename) => {
    if (filename !== 'board.json') return;
    if (Date.now() - lastSelfWrite < 800) return; // our own write
    clearTimeout(timer);
    timer = setTimeout(onChange, 250);
  });
  return () => watcher.close();
}
