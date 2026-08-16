# Architecture

Technical reference for the Task Board. Covers the layering, the data model, the
write pipeline, every enforced invariant, the derived-state layer, the styling
system, the testing strategy, and the reasoning behind the decisions that are not
obvious from the code.

For a task-oriented "where do I change X" table, see [AI_GUIDE.md](AI_GUIDE.md).

---

## 1. Design goals

The app was built around four constraints, in priority order:

1. **The data must be readable and writable by a human or an AI**, not just by the
   app. This ruled out a database and any binary or opaque format, and it drove
   the canonical JSON serializer (§6) and the file-watch reload (§8).
2. **A write must never corrupt the file.** Hence validate-before-write,
   backup-before-write, and atomic replace (§5).
3. **The same data model at three levels** — project, story, task — with real
   relationships between stories, not just labels.
4. **Navigable code.** One responsibility per module, derived logic isolated and
   pure, configuration as data rather than scattered conditionals.

Everything below follows from these.

---

## 2. Process and layer topology

```
┌───────────────────────── browser ──────────────────────────┐
│  React 18 + TypeScript                                     │
│                                                            │
│  components/  ──reads──►  store/selectors.ts  (pure)        │
│       │                        ▲                           │
│       │ mutations              │ derived reads              │
│       ▼                        │                           │
│  store/BoardContext.tsx  ──────┘                           │
│       │  optimistic update, then debounced save             │
│       ▼                                                    │
│  data/  DataSource  ◄── the only I/O boundary in the app    │
│       │                                                    │
│    ┌──┴────────────────┐                                   │
│    ▼                   ▼                                   │
│  local.ts          firebase.ts                             │
│    │ api/client.ts     │ firebase SDK                       │
└────┼───────────────────┼───────────────────────────────────┘
     │ HTTP + SSE        │ Firestore transactions + onSnapshot
     ▼                   ▼
┌─────────────────┐  ┌──────────────────────────────────────┐
│ Node / Express  │  │ Firestore                            │
│ routes/         │  │  workspaces/{id}/state/board         │
│ validate.js     │  │  workspaces/{id}/backups/*           │
│ store.js        │  │  workspaces/{id}/members, invites    │
└────────┬────────┘  │  users/{uid}/prefs/settings          │
         ▼           └──────────────────────────────────────┘
   data/board.json           guarded by firestore.rules
   data/backups/
   data/settings.json
                    ▲
        shared/boardIntegrity.js
        one definition of "valid board", used by both sides
```

Two dev processes for the local backend: the API on `:4310` (`node --watch`) and
Vite on `:5173`, which proxies `/api` to the API. In production one process serves
both — Express hosts `dist/` and the API on `:4310`. The firebase backend needs no
process of ours at all, which is what makes GitHub Pages viable.

### Two backends, one interface

`VITE_DATA_BACKEND` selects the implementation at build time. `DataSource`
(`src/data/types.ts`) is the contract; nothing above it branches on which backend
is active. Where behaviour genuinely differs, it is expressed as a **capability
flag** (`backups`, `workspaces`, `realtime`, `perUserSettings`, `fileBacked`)
that the UI reads, rather than as an `if (firebase)` scattered through
components.

The local backend was kept rather than replaced. It is the only mode in which
`data/board.json` is directly editable, and that property is design goal #1 — a
Firestore-only app would have quietly dropped the requirement the file format
exists to serve.

### Layer rules

These are the constraints that keep the codebase navigable. Each one collapses a
class of possible bugs.

| Rule | Why |
|---|---|
| Only `server/store.js` reads or writes `data/` | One place to get atomicity, backups, and formatting right |
| Only `src/api/client.ts` calls `fetch` | Components cannot invent request shapes or bypass error handling |
| Only `src/data/*` performs I/O; components go through `DataSource` | Adding a backend touches one directory |
| Validation rules live once, in `shared/boardIntegrity.js` | The server and the browser cannot disagree on what is valid |
| Routes contain no logic | They translate HTTP to store calls and back |
| `selectors.ts` is pure — no React, no I/O | Fully testable; derived values cannot drift between components |
| Columns, link types, and the palette are data in `src/config/` | Adding a status or link type does not mean touching components |

---

## 3. Data model

Declared once in TypeScript (`src/types/board.ts`) and mirrored as JSON Schema
(`data/schema.json`). **Both must change together** or writes are rejected — the
schema is the runtime gate, the types are the compile-time gate.

```
Board
├── meta      { version, updated, idPrefixes }
├── projects  [ Project ]
├── tags      [ TagDef ]      ← optional collection
├── stories   [ Story ]
└── tasks     [ Task ]
```

```ts
Project  { id: 'p-<slug>', label, color: '#rrggbb', description? }

TagDef   { label, color: '#rrggbb', description? }

Story    { id: 'S-<n>', title, description, status, project, priority,
           due, estimate, tags: string[], links: StoryLink[],
           notes: Note[], created, completedAt }

Task     { id: 'T-<n>', storyId, title, description, status, priority,
           due, estimate, tags: string[], notes: Note[],
           created, completedAt }

StoryLink { type: LinkType, target: StoryId }
Note      { date, text }

Status    = 'new' | 'active' | 'hold' | 'done'
Priority  = 'high' | 'medium' | 'low'
LinkType  = 'blocks' | 'precedes' | 'duplicate-of' | 'related'
Density   = 'compact' | 'normal'
```

Dates are `YYYY-MM-DD` strings or `null`. There is no time component anywhere —
the domain is day-granular, and storing timestamps would invite timezone bugs for
no benefit.

`additionalProperties: false` throughout: an unknown key is a rejected write, not
a silently ignored one. That is deliberate — a typo in a hand edit should fail
loudly.

### Two classification axes

**Projects own stories.** `story.project` is a required foreign key. Exactly one
project per story. Deleting a project that still has stories is refused twice: the
Project dialog blocks it with a message telling you to reassign first, and if that
were bypassed the write would fail integrity rule 4 and roll back.

**Tags are shared and flat.** Both stories and tasks carry `tags: string[]`, and
the same label can appear on either.

The tag registry is **keyed by label and deliberately loose**:

- `board.tags` supplies colour and description for a label.
- An item may carry a label that is *not* in the registry. It still renders — in
  neutral grey, with a tooltip saying it is unregistered.
- The collection is optional in the schema.

This was chosen over ids-with-foreign-keys because the data file has to stay
hand-editable: adding `tags: ["urgent"]` to a story should just work, without
first minting a tag record and finding its id. The cost of a label key is that a
rename must rewrite every reference — so `renameTag` does exactly that
atomically, in one commit, across the registry, all stories, and all tasks. With
that in place the looseness costs nothing.

`unregisteredTags()` surfaces orphan labels in Settings and the Tags dialog, with
one click to adopt them into the registry.

### Relationships

A story link is stored **once, on the source story only**. The inverse side is
derived at read time by `inboundLinks()`, which scans every other story's links.

Storing both directions would mean two records to keep in sync, and any partial
write would produce a board that disagrees with itself. Deriving is O(stories ×
links) per query — trivially fast at this scale, and impossible to desync.

Each link type declares its inverse and whether it blocks, in
`src/config/links.ts`:

| Type | Inverse | Blocking |
|---|---|---|
| `blocks` | `Blocked by` | yes |
| `precedes` | `Follows` | yes |
| `duplicate-of` | `Duplicated by` | no |
| `related` | `Related to` | no |

A story is **blocked** when it has an inbound blocking link whose source is not
`done`. Blocking is therefore a derived fact — never stored, never stale.

---

## 4. Client state

Four contexts, split by lifetime and dependency. Each depends only on the ones
outside it, which is why `main.tsx` nests them in this order:

**`AuthProvider`** owns the session. In local mode it reports a synthetic session
immediately, so nothing downstream needs to know whether accounts exist.

**`WorkspaceProvider`** owns which board is open, the membership list, and pending
invitations. In local mode it reports one synthetic workspace with role `owner`,
so the read-only guards and the switcher have a single code path.

**`BoardContext`** owns the board, the save lifecycle, and every mutation. All
mutations funnel through one `commit(fn)` helper:

1. Refuse if the user is a viewer — guarded here as well as in the UI, so a stray
   call cannot produce a denied write.
2. Apply `fn` to produce the next board.
3. Set it in React state immediately — the UI is optimistic.
4. Schedule a debounced save (600 ms, configurable).
5. On rejection, roll back and surface the errors; on conflict, adopt the stored
   board and say so.

**`UiContext`** owns ephemeral view state: filters, which stories are expanded,
which dialog is open, the focused story. None of it is persisted; all of it would
be noise in the data file.

### One write path

The client writes the **entire board**. There are no per-record endpoints.

For a file-backed app this is strictly better: validation, backup, formatting, and
atomic replace happen in exactly one place, and the file can never represent a
half-applied change. The payload is a few tens of kilobytes.

On Firestore the same model has a cost that had to be handled rather than
ignored — see §4.1.

### 4.1 Concurrency and revisions

The file backend has one writer, so `rev` is always 0 and ignored. Firestore has
several, and a whole-board write from a stale read would not merge a
collaborator's changes — it would erase them.

So every read carries the revision it came from, and every save submits it:

```
read  →  { board, rev: 7 }
save  →  transaction: stored rev still 7?  →  write rev 8
                      stored rev is 9?     →  refuse, return their board
```

The transaction is in `src/data/firebase.ts`; `firestore.rules` independently
requires `rev` to increase, so a hand-crafted request cannot bypass it either.

A refused save is reported, not hidden: the board is replaced with the stored
version and the badge reads *Refreshed* with an explanation. Losing one debounced
edit is recoverable; silently losing someone else's session of work is not. Real
merging would need per-field writes, which is a different data model.

### Debounced autosave

600 ms after the last change, one save goes out. Rapid edits coalesce. The top bar
reflects `idle → dirty → saving → saved`, plus `error` and `conflict`.

### Status transitions

`withStatus()` in `selectors.ts` is the **only** sanctioned way to change a
status, because `status` and `completedAt` must agree (§5, rule 5). It stamps
`completedAt` when moving to `done`, clears it when moving out, and preserves the
original date when an already-done item is re-marked done. Setting `status`
directly is how you produce a rejected write.

---

## 5. The write pipeline

`writeBoard()` in `server/store.js`, in order:

```
incoming board
   │
   ├─1─►  preserveOmittedCollections()   restore keys the client never sent
   │
   ├─2─►  validateBoard()                Ajv schema, then integrity rules
   │          └── on failure: return errors, touch nothing
   │
   ├─3─►  backupCurrent()                copy current file to data/backups/,
   │                                     prune to backupRetention
   │
   ├─4─►  formatBoard()                  canonical deterministic text
   │
   └─5─►  atomicWrite()                  write .tmp → fsync → rename
```

Nothing is touched until validation passes, so a rejected write is a true no-op.

### Atomic replace

Write to `board.json.tmp`, `fsync` the file descriptor, then `rename` over the
target. `rename` within a filesystem is atomic, so a reader sees either the whole
old file or the whole new one — never a truncated one. The `fsync` is what makes
that guarantee survive a power loss rather than just a process crash.

### Stale-client protection

`preserveOmittedCollections` exists because of a real data loss during
development. A browser tab running code from *before* the tag feature PUT a board
with no `tags` key. The serializer wrote `"tags": []`, and an 18-entry registry
was gone.

The distinction is now explicit:

- **Key omitted** → "I don't know about this collection" → preserve what is on disk.
- **Key present but `[]`** → "make it empty" → honoured.

```js
const OPTIONAL_COLLECTIONS = ['tags'];
```

Any future collection added to that list inherits the protection. Both branches
are covered by tests, because the failure is silent and total.

### Backups

Every accepted write snapshots the previous file to
`data/backups/board.<ISO-timestamp>.json` and prunes to `backupRetention`
(default 30). Restore from Settings → Data, or `POST /api/backups/restore`.

Restore is not a special path — `restoreBackup()` reads the snapshot and hands it
to `writeBoard()`, so it is validated, backed up, and written atomically like any
other write. A corrupt snapshot therefore cannot be reinstated, and restoring is
itself undoable. The requested filename is matched against
`/^board\.[\w-]+\.json$/` before being joined to the backup directory, so a
crafted name cannot escape it.

### Enforced invariants

Two layers. Ajv (`data/schema.json`) covers shape: types, enums, id patterns,
`#rrggbb` colours, `YYYY-MM-DD` dates, no unknown keys. Then
`checkIntegrity()` in `server/validate.js` covers cross-record truth:

1. Ids are unique within their collection.
2. Tag labels are unique in the registry.
3. Every `task.storyId` refers to an existing story.
4. Every `story.project` refers to an existing project.
5. Every `link.target` refers to an existing story, and never to itself.
6. **A `done` item has `completedAt`; a non-`done` item does not.**

All problems are collected and returned together, not thrown one at a time — the
point is to fix a hand-edited file in one pass.

Rule 6 causes most hand-edit rejections. It is enforced because "done" and "when"
being able to disagree would make the completion trend and every done-count
unreliable, and nothing in the UI could repair it.

---

## 6. Canonical serialization

`formatBoard()` hand-writes the JSON instead of using `JSON.stringify(x, null, 2)`.
The reason is diff quality: `stringify` puts every field of every task on its own
line, so changing one title produces a large, unreadable diff, and reading the
file means scrolling.

The format:

- Top-level collections in a fixed order, separated by blank lines.
- Keys within each record in a fixed order (`STORY_KEYS`, `TASK_KEYS`, …),
  regardless of the order the client sent them.
- Projects and tags: **one line per record.**
- Stories: a multi-line block — they carry descriptions, links, and notes.
- Tasks: **one line per record**, grouped under their parent story.
- Short arrays inline: `"tags": ["migration", "pipeline"]`.
- Empty collections inline: `"tags": []`, never an empty multi-line block.
- Tags sorted alphabetically; project, story, and task order preserved.

Consequences that are load-bearing:

- **Idempotent.** Formatting already-formatted output returns identical bytes, so
  a no-op save produces an empty diff.
- **Story array order is display order** within a column. Reordering by drag
  rewrites the array.
- **`meta.updated`** is rewritten on every save — expected noise in a diff.

The serializer is directly tested for validity, losslessness, escaping, key
order, idempotency, and empty-collection handling (§10).

---

## 7. Derived state

`src/store/selectors.ts` holds every value the UI shows but does not store. It is
pure: a function of `board` plus arguments, with no React and no I/O.

| Concern | Functions |
|---|---|
| Lookups | `findStory`, `findTask`, `findProject`, `findTag`, `tasksOfStory` |
| Ids | `nextId` |
| Dates | `today`, `daysUntil`, `dueState`, `dueLabel` |
| Links | `inboundLinks`, `outboundLinks`, `allLinks` |
| Blocking | `blockerIds`, `isBlocked` |
| Rollups | `storyProgress`, `sumEstimates`, `computeStats`, `pointsByProject`, `completionTrend` |
| Filtering | `filterStories`, `storiesInColumn`, `hasActiveFilters` |
| Tags | `tagColor`, `tagUsage`, `usedTags`, `unregisteredTags`, `allTags` |
| Transitions | `withStatus` |

Details worth knowing:

- **`nextId`** takes the max numeric suffix and adds one; it never reuses a freed
  id. Recycling `S-2` after a deletion would make old notes and links ambiguous.
- **`today()` uses the local calendar date, not `toISOString()`.** `toISOString`
  returns the UTC date, so east of UTC it reports *yesterday* for the first hours
  after local midnight — which would stamp the wrong `completedAt` and skew every
  due-date comparison. This was a live bug found by the test suite.
- **`computeStats` and `pointsByProject` take a story list**, not just the board,
  so the stats panel honours active filters.
- **Search matches a story's tasks too.** A story stays visible when one of its
  tasks matches, otherwise searching for a task title would appear to return
  nothing.
- **Tag filtering considers task tags**, so filtering by a tag used only on a task
  still surfaces its story.

---

## 8. Bidirectional editing

The app watches `data/board.json` and pushes changes to connected browsers, which
is what makes direct file editing a first-class workflow rather than something you
do with the app closed.

```
file changed on disk
   └─► fs.watch(DATA_DIR)  filter to board.json
         └─► ignore if within 800 ms of our own write   ← self-write guard
               └─► debounce 250 ms                      ← editors write twice
                     └─► SSE "board" event to all clients
                           └─► client refetches and re-renders
```

Three details make it reliable:

- **Self-write suppression.** `store.js` records `lastSelfWrite`; changes within
  800 ms are the app's own save and are ignored. Without it, every save would
  round-trip back as an external change and could fight with in-flight edits.
- **Debounce.** Many editors write a file as truncate-then-write, firing two
  events. 250 ms collapses them into one reload.
- **Watch the directory, not the file.** The atomic `rename` in step 5 replaces
  the inode, so a file-level watch would go deaf after the first save.

SSE (`GET /api/events`) rather than WebSockets: the traffic is one-way
server-to-client, and SSE reconnects on its own. A 25-second ping keeps
intermediaries from closing an idle connection.

---

## 9. UI structure

### Component tree

```
App
├── Sidebar              nav, counts, profile
├── TopBar               title, actions, save badge, user menu
├── FilterBar            project / priority / tag facets, search
├── Board
│   └── Column ×4        per-column density, SortableJS drag target
│       └── StoryCardCompact | StoryCardNormal
│           └── TaskList → TaskRow
├── StatsPanel           metric tiles + 3 Chart.js charts
├── DependencyGraph      D3 force simulation
├── SettingsPage
└── dialogs              StoryEditor, TaskEditor, StoryDetailModal,
                         ProjectEditor, TagEditor
```

### Three story views

One story, three renderings, because the useful amount of detail differs by
context:

1. **`StoryCardCompact`** — tile: id, title, progress, due. For Hold and Done,
   where you want density.
2. **`StoryCardNormal`** — adds description, tags, links, and the expandable task
   list. For New and Active.
3. **`StoryDetailModal`** — everything, plus editing of relationships and notes.
   Opens on click from either card.

Density is per column (Settings → Card density), so the same board can be dense
where you are only scanning and detailed where you are working.

### SortableJS and React

SortableJS mutates the DOM directly; React expects to own it. `useSortableColumn`
resolves this by **reverting SortableJS's DOM change in `onEnd`** before reporting
the intent, then letting React re-render from state.

Removing that revert leaves two sources of truth for node position, and the board
silently desyncs from the data. The comment in the hook says so, because the code
looks redundant otherwise.

### Charts and graph

Chart.js components are registered once in `chartSetup.ts` rather than at each
call site — registering per component is a common source of duplicate-registration
warnings. Three charts: status doughnut, points-by-project stacked bar, completion
trend line.

The dependency graph is a D3 force simulation over stories as nodes and links as
edges, coloured by link type, with blocked stories marked. D3 owns the SVG
subtree; React only mounts the container and feeds it data.

---

## 10. Styling

Design tokens are CSS custom properties in `src/styles/tokens.css` — colour,
radius, spacing, elevation. Component CSS references tokens; **a hardcoded hex in
component CSS is a bug**. Theme (dark/light/system) and corner radius (sharp/soft/
round) are settings that swap token values, which is only possible because nothing
hardcodes them.

Palette: near-monochrome greys for structure, pastels reserved for meaning —
project colours, tag colours, column accents, priority. Column accents:
New `#93c5fd`, Active `#fcd34d`, Hold `#c4b5fd`, Done `#6ee7b7`.

### The status toggle hover bug

Worth recording because the fix looks like redundant CSS.

`global.css` has a generic `button:hover:not(:disabled)` that repaints background
and border. The task status toggle is a `<button>` whose *entire meaning* is its
fill and border colour — so on hover it turned into an anonymous grey box, and the
state it was showing vanished under the cursor.

Specificity, computed in the browser:

| Selector | Specificity |
|---|---|
| `.status-toggle:hover:not(:disabled)` | `(0,3,0)` |
| `button:hover:not(:disabled)` | `(0,2,1)` |

`(0,3,0)` wins, so the toggle's own hover rule can re-assert its state colours.
The fix routes each state's colours through custom properties:

```css
.status-toggle        { border-color: var(--st-border); background: var(--st-bg); }
.status-toggle:hover:not(:disabled) {
  background:    var(--st-bg, transparent);          /* re-assert, don't inherit */
  border-color:  var(--st-border, var(--border-strong));
  transform:     scale(1.18);                        /* hover = zoom only */
}
.status-toggle.active { --st-border: var(--col-active); --st-bg: #3a2c10; }
.status-toggle.done   { --st-border: var(--col-done);   --st-bg: var(--col-done); }
```

Hover now changes *size only*, never meaning. Using variables avoids writing a
separate hover rule per state.

---

## 11. Testing

161 tests in six files, run with `npm test`.

| File | Tests | Covers |
|---|---|---|
| `tests/validate.test.js` | 25 | Every rejection rule, and that all errors are reported at once |
| `tests/format.test.js` | 20 | Serializer validity, losslessness, escaping, key order, idempotency, empty collections |
| `tests/selectors.test.ts` | 70 | All derived logic: links, blocking, progress, stats, dates, filtering, tags, transitions |
| `tests/api.test.js` | 16 | Live server: rejection leaves the file byte-identical, accepted writes land, stale-client guard, backups |
| `tests/validation-parity.test.js` | 21 | The two backends agree message-for-message; the workspace seed board is valid |
| `tests/settings.test.ts` | 9 | Settings normalization against a missing or partial field; id minting within one commit |

The API suite starts its own server on port 4399, snapshots `board.json`, and
restores it byte-for-byte in `afterAll`, so it can safely assert against real
file contents without disturbing your data.

What is tested where, and why:

- **Rejection paths get as much coverage as success paths.** A validator that
  accepts bad data is worse than no validator.
- **Serializer idempotency is asserted directly**, since a non-idempotent
  formatter would produce diff churn on every save.
- **Both stale-client branches are tested** — omitted key preserves, `[]` clears —
  because getting this wrong destroys data silently.
- **Rejection is asserted to leave the file unchanged**, not merely to return an
  error.
- **Backend parity is asserted on messages, not just pass/fail.** The Firestore
  path has no server to reject a bad write, so if the client validator drifted, the
  hosted app could store a board the local app cannot load. Comparing verdicts
  alone would miss a rule that fires for the wrong reason.
- **Settings normalization is tested against absence.** Settings are the one
  persisted structure with no schema, so a field added later must tolerate a
  stored object that predates it. The failure is a crash on `undefined`, not a
  rejected write, which makes it worth pinning.

Not covered by automated tests:

- **Drag-and-drop**, because native HTML5 drag events cannot be synthesised
  reliably. The shared `moveStory` reducer it calls is covered through the detail
  modal's status control.
- **Firestore adapter and security rules.** Both need the emulator suite
  (`firebase emulators:start`), which is a heavier dependency than the rest of the
  suite carries. The rules are the security boundary, so this is the most valuable
  gap to close — `@firebase/rules-unit-testing` against `firestore.rules` is the
  intended next step.
- **Auth flows**, which need a real or emulated identity provider.

Full check before considering a change done:

```bash
npm run check        # typecheck + 161 tests + production build
npm run validate     # data file integrity
```

---

## 12. API

The local backend's routes, all under `/api`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness |
| `GET` | `/board` | Whole board |
| `PUT` | `/board` | Replace the board — validates, backs up, writes atomically |
| `POST` | `/validate` | Check a board without writing |
| `GET` | `/backups` | Snapshots, newest first, with size and mtime |
| `POST` | `/backups/restore` | Restore a snapshot (itself validated) |
| `GET` | `/settings` | Preferences |
| `PUT` | `/settings` | Replace preferences |
| `GET` | `/events` | SSE stream of external file changes |

Status codes: `200` success, `400` body is not a JSON object (rejected by
`express.json` in strict mode, before validation), `422` validation failed with an
`errors` array, `500` filesystem error.

The firebase backend has no API of ours. The equivalent surface is the Firestore
document layout in §12.1, reached through the SDK and guarded by
`firestore.rules`.

### 12.1 Firestore layout

```
workspaces/{wid}                   name, ownerUid, members{uid:role}, memberUids[]
workspaces/{wid}/state/board       { data: <json string>, rev, updatedAt, updatedBy }
workspaces/{wid}/backups/{id}      { data, rev, size, createdAt, createdBy }
workspaces/{wid}/members/{uid}     email, displayName — display only
workspaces/{wid}/invites/{email}   email, role, workspaceName, invitedBy
users/{uid}                        email, displayName, lastWorkspaceId
users/{uid}/prefs/settings         the Settings object
```

Three decisions in there are not obvious:

**The board is a JSON string, not a nested map.** Firestore would otherwise coerce
the data: it rejects `undefined`, applies its own number and timestamp types, and
does not preserve the difference between a missing key and a null one — which this
schema depends on (`additionalProperties: false`, plus the omitted-vs-empty rule
for `tags` in §5). A string round-trips exactly, and the board is never queried
field-by-field, since every read is the whole board. The cost is that rules cannot
inspect its shape; see §13.1.

**`members` and `memberUids` hold the same information.** The map is
authoritative and is what the rules read. The array exists only so "workspaces I
belong to" can be one `array-contains` query — Firestore cannot query for the
presence of a map key. They are always written in the same operation, so they
cannot drift.

**Invites are keyed by email, not uid.** The invitee may not have an account yet.
Nothing is granted until they accept, and the rules allow a self-grant only at the
role their own invite specifies.

---

## 13. Decisions and trade-offs

| Decision | Alternative | Why this way |
|---|---|---|
| JSON file (local mode) | SQLite, Postgres, cloud | Primary requirement was human- and AI-editable data. A database makes the data opaque to exactly the workflow that mattered most. |
| Keep both backends | Replace the file store with Firestore | Hosting was an addition, not a replacement. Deleting the file store would have dropped design goal #1 and broken the `.cortex` skills that read `data/board.json`. |
| One `DataSource` interface | Branch on the backend at call sites | Components stay backend-agnostic; a third backend touches `src/data/` only. |
| Validation in `shared/` | A copy per backend | Two copies of the rules would drift, and the failure is silent — a board one backend accepts and the other rejects. |
| Board as a JSON string in Firestore | A nested Firestore map | Exact round-trip of a schema that distinguishes absent from null. Costs rule-level shape checks (§13.1). |
| Revision check, refuse on conflict | Last-write-wins, or CRDT merge | Whole-board writes make LWW destructive. Real merging needs per-field writes — a different data model. |
| Whole-board write | Per-record REST | One validated, backed-up, atomic write path. No partially applied state. Payload is tens of KB. |
| Hand-written serializer | `JSON.stringify(x, null, 2)` | Diff readability. One task per line rather than eight. |
| Derived inverse links | Store both directions | Two records cannot desync if only one exists. |
| Tag registry keyed by label | Tag ids + foreign keys | Hand-editability: `tags: ["urgent"]` just works. Rename cost is removed by rewriting all references atomically. |
| Optional `tags` collection | Required | An older or simpler client can still write a valid board. |
| SSE (local) | WebSocket, polling | Traffic is one-way and low-volume; SSE auto-reconnects. |
| `onSnapshot` (firebase) | Polling | Already part of the SDK, and it doubles as the self-write guard via `rev`. |
| Anonymous sign-in offered | Require an account | Lets someone try the board in one click. Mitigated by labelling it as temporary and offering `linkWithCredential` to keep the same uid. |
| Day-granular dates | Timestamps | The domain is days. Timestamps would add timezone bugs for no gain. |
| Local-date `today()` | `toISOString()` | UTC dates are wrong for anyone east of UTC after local midnight. |
| Four React contexts | One store, or Redux | Session, workspace, board, and view state have different lifetimes; splitting them stops filter state leaking into saves and stops the board loading before there is a workspace to load it from. |
| CSS custom properties | Utility classes, CSS-in-JS | Theming and radius settings swap token values with no rebuild. |

### 13.1 The security boundary, stated plainly

`firestore.rules` is the real boundary and is evaluated server-side on every read
and write. It enforces: only members access a workspace, only editors write, only
owners manage membership, an invite grants exactly its stated role, the owner
cannot be removed, and revisions only increase.

It does **not** enforce that the board is well-formed, because the board is an
opaque string (§12.1). So:

- a non-member can do nothing at all
- a member you invited could, with hand-crafted requests, store a malformed board
  in a workspace they already have write access to

Membership is the boundary; shape is a data-quality concern inside it. To close
the gap, a Cloud Function on write running the same `shared/boardIntegrity.js` is
the intended approach — the module is already environment-free for that reason.

### Known limitations

- **No real merge.** Concurrent editors are detected, not reconciled: the second
  save is refused and the board refreshed.
- **No undo beyond snapshots.** Recovery is snapshot restore, not per-action undo.
- **Whole-board writes** would need rethinking at, say, 10k stories. Firestore
  caps a document at 1 MiB; the client refuses at 900 KB with a message rather
  than letting the write fail.
- **`data/backups/` grows** until pruned by `backupRetention`. The Firestore
  equivalent prunes on write.
- **The local API has no auth.** It binds locally and trusts every caller. Do not
  expose it — use the Firebase build for anything reachable from a network.
- **Anonymous sessions are browser-bound.** Clearing site data loses access
  permanently. The UI says so and offers an upgrade path.
- **Rules and auth flows are not covered by automated tests** (§11).

### Built to change

The pieces most likely to need extending, and what it costs:

- **A new status/column** — `src/config/columns.ts`, the `Status` union, the
  schema enum. No component changes.
- **A new link type** — `src/config/links.ts` (declare its inverse and whether it
  blocks), the `LinkType` union, the schema enum.
- **A new field** — types → schema → the relevant editor → the key list in
  `store.js`.
- **A new backend** — implement `DataSource` in `src/data/`, add it to
  `backend.ts`. Nothing above that directory changes.
- **Server-side shape validation** — a Cloud Function importing
  `shared/boardIntegrity.js`.
