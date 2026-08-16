#!/usr/bin/env node
/**
 * `npm run validate`
 *
 * Checks data/board.json against the schema and the referential-integrity
 * rules. Run this after editing the file by hand or with an AI agent.
 * Exits non-zero with precise messages if anything is wrong.
 */

import { readFileSync } from 'node:fs';
import { BOARD_FILE } from '../server/paths.js';
import { validateBoard } from '../server/validate.js';

let board;
try {
  board = JSON.parse(readFileSync(BOARD_FILE, 'utf8'));
} catch (err) {
  console.error(`\n  Could not parse data/board.json\n  ${err.message}\n`);
  process.exit(1);
}

const { ok, errors } = validateBoard(board);

if (ok) {
  console.log(
    `\n  data/board.json is valid` +
      `\n    ${board.projects.length} projects` +
      `\n    ${(board.tags ?? []).length} tags` +
      `\n    ${board.stories.length} stories` +
      `\n    ${board.tasks.length} tasks\n`,
  );
  process.exit(0);
}

console.error(`\n  data/board.json has ${errors.length} problem(s):\n`);
for (const e of errors) console.error(`    - ${e}`);
console.error('');
process.exit(1);
