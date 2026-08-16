/**
 * User settings endpoints — data/settings.json.
 *
 *   GET /api/settings
 *   PUT /api/settings
 *
 * Settings are separate from board data so preferences can never corrupt the
 * task records, and so a future multi-user version can scope this file per user.
 */

import { Router } from 'express';
import { readSettings, writeSettings } from '../store.js';

export const settingsRouter = Router();

settingsRouter.get('/settings', async (_req, res) => {
  try {
    res.json(await readSettings());
  } catch (err) {
    res.status(500).json({ error: `Could not read settings.json: ${err.message}` });
  }
});

settingsRouter.put('/settings', async (req, res) => {
  const body = req.body;
  if (body === null || typeof body !== 'object') {
    return res.status(422).json({ error: 'Settings must be an object' });
  }
  await writeSettings(body);
  res.json({ ok: true });
});
