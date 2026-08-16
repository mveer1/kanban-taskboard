# Task Board

A three-tier task tracker — **Projects → Stories → Tasks** — on a Kanban
board with four columns: New, Active, Hold / Later, Done.

Runs two ways from one codebase:

- **Locally**, where your data is a single readable JSON file rather than a
  database, so both you and an AI assistant can edit it directly in a text editor.
- **Hosted** on GitHub Pages with Firebase Auth and Firestore, with real accounts
  and shared workspaces. See **[DEPLOYMENT.md](DEPLOYMENT.md)**.

```
Projects   Data Platform, Analytics, Personal, Growth, Health
  Stories  multi-day work items, linkable to each other, with progress and estimates
    Tasks  daily checklist items inside a story
```

---

## Quick start

```bash
npm install
npm run dev
```

Then open **http://localhost:5173**.

That starts two processes: the API on `:4310` and the Vite dev server on `:5173`,
which proxies `/api` to the API. If port 4310 is taken, the API exits with a message
telling you to run `API_PORT=4311 npm run dev`.

On first run, `data/board.json` and `data/settings.json` are created from the
committed `*.example.json` seeds. Both are git-ignored — they hold your actual
tasks, and this repo is meant to be publishable.

For a production-style run on a single port:

```bash
npm start        # builds, then serves the app and API from http://localhost:4310
```

---

## The two backends

The build picks a persistence backend with `VITE_DATA_BACKEND`. Both implement one
interface (`src/data/types.ts`), so no component knows which is active.

| | `local` (default) | `firebase` |
|---|---|---|
| Data lives in | `data/board.json` | a Firestore document per workspace |
| Identity | mock profile in `settings.json` | Google / GitHub / email / guest |
| Users, boards | one, one | many, many — with owner/editor/viewer roles |
| Live updates | SSE when the file changes | Firestore snapshots |
| Hosting | Express | any static host, e.g. GitHub Pages |
| Editable by hand or AI | **yes** | no |

Both run the *same* validation code (`shared/boardIntegrity.js`), and
`tests/validation-parity.test.js` asserts they agree rule-for-rule — so a board
from one loads in the other.

The local mode is not a stub or a fallback: it is the mode that keeps the data
file directly editable, which is the whole reason the file format exists.

---

## Where your data lives

| File | Contents |
|---|---|
| `data/board.json` | **The source of truth** in local mode. Projects, tags, stories, tasks. |
| `data/settings.json` | Profile, per-column density, theme, retention. |
| `data/schema.json` | JSON Schema that every write is checked against, on both backends. |
| `data/backups/` | Automatic snapshot of the previous file on every save. |
| `data/*.example.json` | Committed seeds, copied on first run. |

### Editing the file by hand

`data/board.json` is written in a stable, diff-friendly layout: one line per task,
one block per story, fields always in the same order. You can edit it in place.

```bash
npm run validate     # checks structure and cross-references, with specific errors
```

**If the app is open while you edit, it reloads automatically** — the server watches
the file and pushes changes to the browser over Server-Sent Events. No refresh, no
restart.

The one rule that catches people out: a `done` item must have a `completedAt` date,
and anything not `done` must not have one. `npm run validate` will tell you which
record is wrong.

---

## Using the board

**Three ways to see a story**, so dense columns stay scannable:

| View | When you see it |
|---|---|
| Compact tile | Columns set to `compact` density — id, title, progress, due date |
| Normal card | Columns set to `normal` — adds description, tags, links, and the task list |
| Detail modal | Click any card — everything, plus editable notes and relationships |

Density is per column, configured in Settings. The default shows full cards in New
and Active, tiles in Hold and Done.

**Adding a story** — three ways, depending on where you already are:

| Control | Behaviour |
|---|---|
| `+` in a column header | Opens the editor with **that column's status** preselected |
| `+ Add a story` in an empty column | Same, and doubles as the empty-state hint |
| `+ Story` in the top bar, or `n` | Opens the editor starting in New |

Creating straight into Done is fine — the completion date is stamped for you.

**Right-click anything on the board** for its actions, so the common ones do not
need a trip through a dialog:

| Right-click on | You get |
|---|---|
| A story card | Open, edit, add task, duplicate, move to another column, copy id, delete |
| A task row | Edit, duplicate, mark another status, copy id, delete |
| A column header | New story here, switch density, expand / collapse all task lists |

**Duplicate** copies a story and its tasks. It copies what describes the work —
title, description, project, priority, estimate, tags — and drops what records
its history: links and notes. A duplicate that inherited links would silently add
edges to the dependency graph, and one that inherited notes would carry an
activity log describing something that never happened to it.

**Deleting** asks first, and the dialog offers **Don't ask again**. Taking it
switches the matching toggle off under Settings → Confirmations, where you can
switch it back on. Story and task deletion are tracked separately — silencing
task deletion does not silence story deletion, which also removes that story's
tasks and any links pointing at it.

**Relationships** between stories use four link types. You record a link once and the
opposite side is shown automatically on the other story.

| Type | Inverse shown on the target | Blocks work? |
|---|---|---|
| `blocks` | Blocked by | yes |
| `precedes` | Follows | yes |
| `duplicate-of` | Duplicated by | no |
| `related` | Related to | no |

A story with an unfinished `blocks` or `precedes` link pointing at it is marked
**blocked** and outlined in red until the blocker is done.

**Projects and tags** are the two classification layers. Projects own stories and
have a color. Tags are shared labels that stories *and* tasks can carry — manage both
from the top bar or Settings → Taxonomy. Renaming a tag rewrites every item that uses
it; deleting one strips it from every item.

**Saving** is automatic and debounced. The badge in the top bar reads Saving… then
Saved. If the write is rejected, the edit is rolled back and a toast explains
why, so the board never shows a state that cannot be stored.

**Workspaces** (hosted mode only) appear as a picker in the top bar. Each has its
own board and its own members. Owners invite by email and assign a role; editors
change everything on the board; viewers get a read-only board with the write
controls hidden. Invitations arrive in the same picker.

If two people save at once the second save is refused rather than applied — a
whole-board write would discard the first person's changes rather than merge
them. The board refreshes to their version and the badge says so.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `n` | New story |
| `t` | New task in the first visible story |
| `/` | Focus search |
| `b` | Go to Board |
| `g` | Go to Insights (graph) |
| `,` | Go to Settings |
| `p` | Manage projects |
| `l` | Manage tags (labels) |
| `e` | Expand all task lists |
| `c` | Collapse all task lists |
| `x` | Clear all filters |
| `Esc` | Close dialogs |

Disable them in Settings → Keyboard shortcuts.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API + Vite dev server together (local backend) |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run build:pages` | Build the Firebase-backed static bundle |
| `npm start` | Build, then serve everything from the API port |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Re-run tests on change |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check` | Typecheck, test, and build — run before calling a change done |
| `npm run validate` | Check `data/board.json` |
| `npm run backup` | Take a manual snapshot |

---

## How your data is protected

Every save passes through four steps in `server/store.js`, in this order:

1. **Validate** — schema plus cross-reference checks. An invalid write is refused
   before anything is touched.
2. **Back up** — the current file is copied to `data/backups/`, oldest pruned past
   the retention limit (default 30).
3. **Write atomically** — to a temp file, `fsync`, then rename over the original. An
   interrupted save cannot leave a half-written file.
4. **Format canonically** — so the diff of a change is the change itself.

Snapshots are listed in Settings → Data with one-click restore.

There is also a guard against stale clients: a request that *omits* a collection
leaves that collection alone, while an explicit empty array still clears it. Without
it, an old browser tab could silently erase the tag registry it had never heard of.

---

## Tests

```bash
npm test
```

161 tests across six suites:

| Suite | Covers |
|---|---|
| `tests/validate.test.js` | Every rejection rule — bad enums, broken references, `completedAt` agreement |
| `tests/format.test.js` | The serializer is lossless, idempotent, and stably ordered |
| `tests/selectors.test.ts` | Derived logic — blocking, progress, stats, filtering, tags, dates |
| `tests/api.test.js` | Live HTTP round-trips, including that a rejected write leaves the file byte-identical |
| `tests/validation-parity.test.js` | The two backends reach identical verdicts, message for message |
| `tests/settings.test.ts` | Settings survive a missing field; id minting stays unique within one commit |

The API suite starts its own server on a spare port and restores the data file when
it finishes, so running tests never disturbs your board.

---

## Architecture

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the full technical picture,
**[DEPLOYMENT.md](DEPLOYMENT.md)** for hosting and the security model, and
**[AI_GUIDE.md](AI_GUIDE.md)** for a short "change X, edit Y" orientation map.

Built with React 18, TypeScript, Vite, Express, Firebase, Chart.js, D3, and
SortableJS.
