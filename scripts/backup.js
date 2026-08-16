#!/usr/bin/env node
/**
 * `npm run backup`
 *
 * Validates data/board.json and rewrites it through the store, which snapshots
 * the current file into data/backups/ and normalizes formatting. Useful as a
 * "commit" step after editing the file directly.
 */

import { readBoard, writeBoard } from '../server/store.js';

const board = await readBoard();
const result = await writeBoard(board);

if (!result.ok) {
  console.error(`\n  Refused to back up — board.json is invalid:\n`);
  for (const e of result.errors) console.error(`    - ${e}`);
  console.error('');
  process.exit(1);
}

console.log(`\n  Snapshot created: ${result.backup ?? '(none — file was new)'}`);
console.log('  board.json reformatted to canonical layout\n');
