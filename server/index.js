/**
 * Task Board API server.
 *
 * Dev:  `npm run dev`   -> Vite on :5173 proxies /api here on :4310
 * Prod: `npm start`     -> builds the app and serves dist/ + /api from :4310
 *
 * Routes live in server/routes/. All file access goes through server/store.js.
 */

import express from 'express';
import { existsSync } from 'node:fs';
import { boardRouter } from './routes/board.js';
import { settingsRouter } from './routes/settings.js';
import { ensureDataFiles, watchBoardFile } from './store.js';
import { DIST_DIR } from './paths.js';

const PORT = Number(process.env.API_PORT ?? 4310);
const app = express();

// data/board.json is git-ignored, so a fresh clone starts with nothing. Seed it
// before the first request can arrive.
await ensureDataFiles();

app.use(express.json({ limit: '8mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, port: PORT }));
app.use('/api', boardRouter);
app.use('/api', settingsRouter);

/* ------------------------------------------------------------------ *
 * Server-sent events: notify clients when board.json changes on disk.
 *
 * This is what makes the file safely AI-writable while the app is open —
 * edit data/board.json directly and the browser reloads it automatically.
 * ------------------------------------------------------------------ */

const clients = new Set();

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  res.write('retry: 2000\n\n');

  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
});

function broadcast(event, data = {}) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) client.write(payload);
}

watchBoardFile(() => {
  console.log('[store] board.json changed on disk — notifying clients');
  broadcast('board-changed', { at: new Date().toISOString() });
});

/* ------------------------------------------------------------------ *
 * Production static hosting
 * ------------------------------------------------------------------ */

if (process.env.NODE_ENV === 'production') {
  if (existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR));
    // SPA fallback: anything not under /api returns index.html.
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(`${DIST_DIR}/index.html`));
  } else {
    console.warn('[server] dist/ not found — run `npm run build` first.');
  }
}

const server = app.listen(PORT, () => {
  const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  console.log(`[server] Task Board API listening on http://localhost:${PORT} (${mode})`);
  if (mode === 'development') {
    console.log('[server] open the app at http://localhost:5173');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n[server] Port ${PORT} is already in use.` +
        `\n         Another Task Board API is probably running.` +
        `\n         Stop it, or start this one on a different port:` +
        `\n           API_PORT=4311 npm run dev\n`,
    );
    process.exit(1);
  }
  throw err;
});

// Exported so the integration tests can start a server on a spare port and
// shut it down cleanly afterwards.
export { app, server };
