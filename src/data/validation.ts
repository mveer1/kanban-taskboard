import Ajv from 'ajv';
import schema from '../../data/schema.json';
import { validateBoardWith, type ValidationResult } from '@shared/boardIntegrity.js';
import type { Board } from '@/types/board';

/**
 * Client-side board validation.
 *
 * In `local` mode the Express server is the write gate and this is a redundant
 * (but useful) pre-check. In `firebase` mode there is no server in the write
 * path, so this IS the gate: Firestore rules can enforce shape and ownership but
 * cannot express cross-record integrity like "every task points at a real story"
 * without a read per record.
 *
 * The rules live in shared/boardIntegrity.js and are the same code the server
 * runs, so the two backends cannot drift on what "valid" means.
 */

const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

export function validateBoard(board: Board | unknown): ValidationResult {
  return validateBoardWith(board, validateSchema);
}
