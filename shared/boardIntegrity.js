/**
 * Board validation, shared by the Node server and the browser bundle.
 *
 * This module is deliberately dependency-free and environment-free: no `node:fs`,
 * no DOM. Callers supply a compiled JSON Schema validator, because the two
 * environments obtain the schema differently — the server reads
 * data/schema.json from disk, the browser imports it as a module.
 *
 * Why it is shared: in `local` mode the Express layer is the write gate, but in
 * `firebase` mode the client writes straight to Firestore and there is no server
 * to reject bad data. Firestore rules can check shape cheaply but cannot express
 * cross-record integrity (rule 3-6 below). Running the identical checks in the
 * client keeps one definition of "valid board" across both backends.
 *
 * @typedef {{ ok: boolean, errors: string[] }} ValidationResult
 */

/**
 * Cross-record rules a JSON Schema cannot express:
 *  1. ids are unique within their collection
 *  2. tag labels are unique in the registry
 *  3. every task points at a real story
 *  4. every story points at a real project
 *  5. every link points at a real story, and never at itself
 *  6. a done item has a completedAt; a non-done item does not
 *
 * All problems are collected rather than thrown one at a time, so a
 * hand-edited file can be fixed in a single pass.
 *
 * @param {any} board
 * @returns {string[]}
 */
export function checkIntegrity(board) {
  const errors = [];

  const projectIds = new Set();
  const storyIds = new Set();
  const taskIds = new Set();

  for (const p of board.projects) {
    if (projectIds.has(p.id)) errors.push(`Duplicate project id: ${p.id}`);
    projectIds.add(p.id);
  }

  // Tags are keyed by label, so the label must be unique in the registry.
  const tagLabels = new Set();
  for (const t of board.tags ?? []) {
    if (tagLabels.has(t.label)) errors.push(`Duplicate tag label: "${t.label}"`);
    tagLabels.add(t.label);
  }

  for (const s of board.stories) {
    if (storyIds.has(s.id)) errors.push(`Duplicate story id: ${s.id}`);
    storyIds.add(s.id);
  }
  for (const t of board.tasks) {
    if (taskIds.has(t.id)) errors.push(`Duplicate task id: ${t.id}`);
    taskIds.add(t.id);
  }

  for (const s of board.stories) {
    if (!projectIds.has(s.project)) {
      errors.push(`Story ${s.id} references missing project "${s.project}"`);
    }
    for (const l of s.links ?? []) {
      if (l.target === s.id) errors.push(`Story ${s.id} links to itself`);
      else if (!storyIds.has(l.target)) {
        errors.push(`Story ${s.id} has a "${l.type}" link to missing story "${l.target}"`);
      }
    }
    if (s.status === 'done' && !s.completedAt) {
      errors.push(`Story ${s.id} is done but has no completedAt date`);
    }
    if (s.status !== 'done' && s.completedAt) {
      errors.push(`Story ${s.id} is not done but has completedAt "${s.completedAt}"`);
    }
  }

  for (const t of board.tasks) {
    if (!storyIds.has(t.storyId)) {
      errors.push(`Task ${t.id} references missing story "${t.storyId}"`);
    }
    if (t.status === 'done' && !t.completedAt) {
      errors.push(`Task ${t.id} is done but has no completedAt date`);
    }
    if (t.status !== 'done' && t.completedAt) {
      errors.push(`Task ${t.id} is not done but has completedAt "${t.completedAt}"`);
    }
  }

  return errors;
}

/**
 * Run both validation layers.
 *
 * @param {any} board
 * @param {(data: any) => boolean & { errors?: Array<{ instancePath?: string, message?: string }> }} validateSchema
 *   A compiled Ajv validator for data/schema.json.
 * @returns {ValidationResult}
 */
export function validateBoardWith(board, validateSchema) {
  if (board === null || typeof board !== 'object') {
    return { ok: false, errors: ['Board data must be a JSON object'] };
  }

  const errors = [];

  if (!validateSchema(board)) {
    for (const e of validateSchema.errors ?? []) {
      errors.push(`schema ${e.instancePath || '/'} ${e.message}`);
    }
  }

  // Integrity checks index into these arrays, so only run once they exist.
  if (
    Array.isArray(board.projects) &&
    Array.isArray(board.stories) &&
    Array.isArray(board.tasks)
  ) {
    errors.push(...checkIntegrity(board));
  }

  return { ok: errors.length === 0, errors };
}
