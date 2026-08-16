/**
 * Validation for data/board.json (server side).
 *
 * The rules themselves live in shared/boardIntegrity.js so the Firestore
 * backend enforces exactly the same definition of "valid board" in the browser,
 * where there is no server in the write path. This module only supplies the
 * schema — read from disk — and keeps the historical export surface stable.
 *
 * Two layers:
 *   1. JSON Schema (data/schema.json) — shapes, enums, patterns.
 *   2. Referential integrity — cross-record rules a schema cannot express.
 *
 * A write is rejected if either layer fails, so bad data never reaches disk.
 */

import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './paths.js';
import { validateBoardWith, checkIntegrity } from '../shared/boardIntegrity.js';

const schema = JSON.parse(readFileSync(join(DATA_DIR, 'schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

/**
 * @param {any} board
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateBoard(board) {
  return validateBoardWith(board, validateSchema);
}

// Re-exported for tests and tooling that want the integrity layer alone.
export { checkIntegrity };
