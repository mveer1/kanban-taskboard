export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Compiled Ajv validator shape, narrowed to what this module uses. */
export interface CompiledSchemaValidator {
  (data: unknown): boolean;
  errors?: Array<{ instancePath?: string; message?: string }> | null;
}

/** Cross-record integrity rules. Returns every problem found, not just the first. */
export function checkIntegrity(board: unknown): string[];

/** JSON Schema layer plus integrity layer. */
export function validateBoardWith(
  board: unknown,
  validateSchema: CompiledSchemaValidator,
): ValidationResult;
