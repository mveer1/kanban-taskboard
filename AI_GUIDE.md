# AI guide to this codebase

Orientation for an agent (or a returning human) making changes here. Read this
before editing. For the full technical picture see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## The one thing to know

**In local mode, `data/board.json` is the source of truth.** The app is a view over
it. To change *data*, edit that file. To change *behavior*, edit `src/`.

After editing `data/board.json` directly:

```bash
npm run validate     # fails loudly with specific errors if anything is wrong
```

If the app is running, it picks up your file edit automatically over SSE — you do
not need to restart or refresh anything.

The file does not exist in a fresh clone (it is git-ignored, because it holds real
tasks). `npm run dev` creates it from `data/board.example.json` on first start.

### The second backend

There is also a hosted mode (`VITE_DATA_BACKEND=firebase`) that stores the board in
Firestore for GitHub Pages. **It has no editable file**, so the workflow above does
not apply to it. Local mode is the default and is what the `.cortex` taskboard
skills use; nothing in this guide changes because the second backend exists, with
one exception — see "Validation lives in two places" below.

---

## Want to change X? Edit Y.

| Goal | File |
|---|---|
| Add / edit / delete a story, task, project, or tag | `data/board.json` |
| Change a preference (density, theme, profile) | `data/settings.json` |
| Add a **board column** / status | `src/config/columns.ts`, then `Status` in `src/types/board.ts`, then the `status` enum in `data/schema.json` |
| Add a **link type** | `src/config/links.ts`, then `LinkType` in `src/types/board.ts`, then `linkType` in `data/schema.json` |
| Add / change **project colors** | `src/config/palette.ts` |
| Add / recolor / rename a **tag** | `data/board.json` (`tags`), or the Tags dialog in the app |
| Change column accent colors | `src/config/columns.ts` (`accent`) |
| Add a **field** to a story or task | `src/types/board.ts` → `data/schema.json` → the relevant editor in `src/components/editors/` → the key lists in `server/store.js` |
| Change validation rules | **`shared/boardIntegrity.js`** — shared by both backends. Not `server/validate.js`, which only supplies the schema |
| Change how the JSON file is formatted | `server/store.js` (`formatBoard`) |
| Add an API endpoint | `server/routes/`, mounted in `server/index.js` |
| Add or change a **persistence backend** | `src/data/` — implement `DataSource` from `types.ts`, register in `backend.ts` |
| Change how the board is read/written in hosted mode | `src/data/firebase.ts` |
| Change **who can do what** | `firestore.rules` — the real boundary. UI gating in `WorkspaceContext.canEdit` is cosmetic |
| Change workspace / membership behavior | `src/data/workspaces.ts` + `src/store/WorkspaceContext.tsx` |
| Change sign-in options or error copy | `src/auth/AuthContext.tsx`, UI in `src/auth/LoginScreen.tsx` |
| Change derived logic (blocked, progress, filtering, stats) | `src/store/selectors.ts` |
| Change how edits are saved | `src/store/BoardContext.tsx` |
| Change which modal is open / filter state | `src/store/UiContext.tsx` |
| Restyle the compact tile | `src/components/cards/StoryCardCompact.tsx` + `StoryCard.css` |
| Restyle the normal card | `src/components/cards/StoryCardNormal.tsx` + `StoryCard.css` |
| Restyle the detail modal | `src/components/cards/StoryDetailModal.tsx` + its CSS |
| Add a chart | `src/components/stats/`, register it in `StatsPanel.tsx` |
| Change the dependency graph | `src/components/graph/DependencyGraph.tsx` |
| Add a keyboard shortcut | the `hotkeys` array in `src/App.tsx` |
| Add a **right-click menu** to something | `useContextMenu()` from `src/components/ui/ContextMenu.tsx` — pass an item array, do not build another popover |
| Change the story or task menu items | `src/components/cards/useItemMenus.tsx` — shared by both card views and the detail modal |
| Add a **confirmable destructive action** | `useConfirm()` from `src/components/ui/Confirm.tsx`. Add a key to `ConfirmKey` + `CONFIRM_LABELS` + `Settings.confirmations` to make it silenceable |
| Add a setting | `Settings` in `src/types/board.ts`, `starterSettings` **and `normalizeSettings`** in `src/data/starter.ts`, `data/settings.example.json`, and `src/components/settings/SettingsPage.tsx` |
| Change colors, radii, spacing | `src/styles/tokens.css` — never hardcode a hex in component CSS |
| Change hosting or deployment | `.github/workflows/deploy-pages.yml`, `vite.config.ts` (`base`), `DEPLOYMENT.md` |

---

## Data model contract

Defined once in **`src/types/board.ts`**, mirrored in **`data/schema.json`**.
Change both together or writes will be rejected.

```
Project  p-<slug>   { id, label, color, description? }
TagDef              { label, color, description? }
Story    S-<n>      { id, title, description, status, project, priority,
                      due, estimate, tags, links, notes, created, completedAt }
Task     T-<n>      { id, storyId, title, description, status, priority,
                      due, estimate, tags, notes, created, completedAt }
```

`status` ∈ `new | active | hold | done` · `priority` ∈ `high | medium | low`
`links[].type` ∈ `blocks | precedes | duplicate-of | related`
Dates are `YYYY-MM-DD` strings, or `null`.

---

## Invariants the app enforces

A write is **rejected** if any of these break. They are checked in
`shared/boardIntegrity.js`, which both backends run:

1. Ids are unique within their collection, and match their prefix pattern.
2. Tag labels are unique within `tags`.
3. Every `task.storyId` refers to an existing story.
4. Every `story.project` refers to an existing project.
5. Every `link.target` refers to an existing story, and never to the story itself.
6. **A `done` item has a `completedAt` date; a non-`done` item does not.**
   Use `withStatus()` from `src/store/selectors.ts` to change status — it keeps
   these two fields consistent. Do not set `status` directly.

Rule 6 is the most common cause of a rejected write when editing JSON by hand.

Note what is *not* enforced: an item may carry a tag that is absent from the `tags`
registry. That is deliberate — unregistered labels render neutral so you can add
`"tags": ["spike"]` by hand without registering it first.

### Validation lives in two places, deliberately

The *rules* live once, in `shared/boardIntegrity.js`. What differs is who runs them:

- local mode — `server/validate.js`, before touching the file
- hosted mode — `src/data/validation.ts`, in the browser, because there is no
  server in that write path

**Never fix a rule in one place only.** `tests/validation-parity.test.js` asserts
the two produce identical error messages and will fail if they drift.

---

## Architectural rules

- **Only `server/store.js` touches the data files.** Routes call the store; nothing
  else reads or writes `data/`.
- **Only `src/api/client.ts` calls `fetch`.** Components never talk to the network.
- **Components go through `DataSource`, never a backend directly.** If you need a
  new capability, add it to `src/data/types.ts` and implement it in both backends —
  do not import `firebase/firestore` from a component.
- **Check capabilities, not the backend.** `source.capabilities.backups` rather than
  `backend === 'local'`. There are flags for backups, workspaces, realtime,
  per-user settings, and file-backed storage.
- **One write path.** The client writes the whole board on a debounce. There are no
  per-record endpoints, so validation, backup, and atomic replace happen in exactly
  one place.
- **`selectors.ts` is pure.** No React, no side effects — a function of `board` plus
  arguments. Put derived logic there, not in components.
- **Inverse links are derived, never stored.** `inboundLinks()` scans other stories.
  Adding a reciprocal record would double-count and drift.
- **Config over code.** Columns, link types, and the palette are data in
  `src/config/`. Adding a status or link type should not require touching components.
- **SortableJS is DOM-mutating.** `useSortableColumn.ts` reverts its DOM change in
  `onEnd` and lets React re-render from state. Do not remove that revert — the
  board will desync from the data.
- **Renaming a tag rewrites references.** `renameTag()` updates the registry entry
  and every story and task that uses the label, in one commit. Deleting a tag
  strips it from every item. Do not edit the registry without doing both.
- **Omitting a collection preserves it.** A PUT without a `tags` key leaves the
  registry alone; `"tags": []` clears it. See `preserveOmittedCollections` in
  `server/store.js`.
- **Mutations are guarded twice.** `commit()` in `BoardContext` no-ops for viewers,
  and `firestore.rules` refuses their writes. Keep both — the UI guard is for
  clarity, the rule is for security.
- **Never call `window.confirm`.** Use `useConfirm()`, which is themed and can
  carry "don't ask again". The native dialog cannot do either.
- **Settings are not schema-validated.** A stored settings object may predate any
  field, so every new group must be added to `normalizeSettings` — otherwise a
  read crashes on `undefined.someFlag`. Covered by `tests/settings.test.ts`.
- **Minting several ids in one commit needs an accumulator.** `nextId` reads the
  max suffix from the list you hand it, so calling it twice against the same
  unchanged array returns the same id. See `duplicateStory`.

---

## Gotchas

- **`noUnusedLocals` is on.** An unused import fails `npm run build`.
- **`data/backups/` fills up.** Retention is in `data/settings.json` (`backupRetention`).
- **Two dev processes.** `npm run dev` runs the API and Vite together via
  `concurrently`. A stale API on :4310 will make the API half fail to start with a
  clear message; kill it or use `API_PORT`.
- **`meta.updated`** is rewritten on every save. Ignore it in diffs.
- **Story order matters.** Position in the `stories` array is the display order
  within a column.
- **Three aliases must stay in sync.** `@` and `@shared` are declared in
  `tsconfig.json`, `vite.config.ts`, *and* `vitest.config.ts`. Adding one to only
  two of the three passes typecheck and fails at build or test time.
- **`data/board.json` and `data/settings.json` are git-ignored.** Edit the
  `*.example.json` seeds if you want a change to reach a fresh clone.

---

## Verifying a change

```bash
npm run check        # typecheck + 161 tests + production bundle
npm run validate     # data file is well-formed and internally consistent
```

For UI changes, load `http://localhost:5173` and confirm: the four columns render
with their accent colors, per-column density matches Settings, clicking a card
opens the detail modal, and the top-bar badge reaches "Saved" after an edit.

If you touched `src/data/`, `src/auth/`, or anything in the provider chain, also
build the other backend — it compiles code the default build tree-shakes past:

```bash
npm run build:pages
```
