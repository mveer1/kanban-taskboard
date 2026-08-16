import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** Shared path constants so server/ and scripts/ agree on where data lives. */
const here = dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = join(here, '..');
export const DATA_DIR = join(ROOT_DIR, 'data');
export const BACKUP_DIR = join(DATA_DIR, 'backups');
export const DIST_DIR = join(ROOT_DIR, 'dist');

export const BOARD_FILE = join(DATA_DIR, 'board.json');
export const SETTINGS_FILE = join(DATA_DIR, 'settings.json');

/**
 * Seeds, committed to the repo. board.json and settings.json are git-ignored —
 * they are personal data, and publishing the repo should not publish your tasks —
 * so a fresh clone has neither. `ensureDataFiles()` in store.js copies these on
 * first start.
 */
export const BOARD_SEED_FILE = join(DATA_DIR, 'board.example.json');
export const SETTINGS_SEED_FILE = join(DATA_DIR, 'settings.example.json');
