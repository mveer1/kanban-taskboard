/**
 * Board data endpoints.
 *
 *   GET    /api/board            whole board
 *   PUT    /api/board            replace whole board (the client autosave path)
 *   GET    /api/backups          list snapshots
 *   POST   /api/backups/restore  { name } -> roll back
 *   POST   /api/validate         check a candidate board without writing
 *
 * The client keeps the full board in memory and PUTs it on a debounce, so
 * per-record CRUD routes are intentionally absent — one write path means one
 * place where validation, backup, and atomic replace happen.
 */

import { Router } from 'express';
import { readBoard, writeBoard, listBackups, restoreBackup } from '../store.js';
import { validateBoard } from '../validate.js';

export const boardRouter = Router();

boardRouter.get('/board', async (_req, res) => {
  try {
    res.json(await readBoard());
  } catch (err) {
    res.status(500).json({ error: `Could not read board.json: ${err.message}` });
  }
});

boardRouter.put('/board', async (req, res) => {
  const result = await writeBoard(req.body);
  if (!result.ok) {
    return res.status(422).json({ error: 'Validation failed', errors: result.errors });
  }
  res.json({ ok: true, backup: result.backup });
});

boardRouter.post('/validate', (req, res) => {
  const { ok, errors } = validateBoard(req.body);
  res.status(ok ? 200 : 422).json({ ok, errors });
});

boardRouter.get('/backups', async (_req, res) => {
  res.json(await listBackups());
});

boardRouter.post('/backups/restore', async (req, res) => {
  const result = await restoreBackup(String(req.body?.name ?? ''));
  if (!result.ok) return res.status(422).json({ error: 'Restore failed', errors: result.errors });
  res.json({ ok: true });
});
