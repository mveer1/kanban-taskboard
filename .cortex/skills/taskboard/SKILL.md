---
name: taskboard
description: "Reads and writes the local Task Board app (Projects -> Stories -> Tasks) stored in taskboard/data/board.json. Use when the user wants to add, update, complete, reprioritize, link, tag, delete, or query stories and tasks; capture a todo; check what is overdue or blocked; or bulk-import work items into the board. Writes go through the validated API so the data file can never be corrupted. Triggers: new story, add a task, create a story, add a story, new todo, put it on my board, mark done, mark complete, what's on my board, what's overdue, what's blocked, update my board, my task board, taskboard, kanban board, log this work"
---

# Task Board Read / Write

## Scope

Provides the safe read and write protocol for the local Task Board application. All
mutations go through the app's validating API so that schema violations, broken
references, and inconsistent completion state are rejected before they can reach the
data file.

**Use this skill when** the user wants to inspect or change the contents of their
board — stories, tasks, projects, or tags.

**Do NOT use this skill for** summarizing the day's work (use `workday-summary`),
starting the day or scoring board hygiene (use `workday-startup`),
changing application behavior, styling, or components (edit `src/` and read
`ARCHITECTURE.md`), or Azure DevOps work items (use the `ado-*` skills).

## Environment

| Setting | Value |
|---|---|
| App root | `taskboard/` |
| Source of truth | `taskboard/data/board.json` |
| API base (dev and prod) | `http://localhost:4310/api` |
| Health probe | `GET http://localhost:4310/api/health` → `{"ok":true,"port":4310}` |
| Start API only | `npm run dev:api` from `taskboard/`, in the background |
| Start API + UI | `npm run dev` from `taskboard/`, in the background |
| Web UI (dev) | `http://localhost:5173` |
| Preferred write path | `PUT /api/board` — validates, backs up, writes atomically |
| Fallback write path | Edit `data/board.json`, then `npm run validate` |
| Never write | `data/backups/` |

The API alone is enough for this skill; the UI does not need to be open.

## Data model

```
Board { meta, projects[], tags[], stories[], tasks[] }

Project  { id: "p-<slug>", label, color: "#rrggbb", description }
TagDef   { label, color: "#rrggbb", description }
Story    { id: "S-<n>", title, description, status, project, priority,
           due, estimate, tags[], links[], notes[], created, completedAt }
Task     { id: "T-<n>", storyId, title, description, status, priority,
           due, estimate, tags[], notes[], created, completedAt }

StoryLink { type, target }        Note { date, text }
```

| Field | Allowed values |
|---|---|
| `status` | `new` · `active` · `hold` · `done` |
| `priority` | `high` · `medium` · `low` |
| `links[].type` | `blocks` · `precedes` · `duplicate-of` · `related` |
| dates (`due`, `created`, `completedAt`, `notes[].date`) | `YYYY-MM-DD` or `null` |
| colors | `#rrggbb` |

A **story** is a multi-day outcome. A **task** is a step inside one story and must
name its parent with `storyId`. Unknown keys are rejected — do not invent fields.

## Workflow

```text
Task Board Progress:
- [ ] Step 0: Ensure the API server is running
- [ ] Step 1: Read the current board
- [ ] Step 2: Resolve the target records
- [ ] Step 3: Build the next board in memory
- [ ] Step 4: Write it back and confirm
- [ ] Step 5: Report what changed
```

Use [EXAMPLES.md](EXAMPLES.md) as the regression scenarios for this workflow.

### Step 0: Ensure the API server is running

Probe before anything else. Writes must go through the validated API, so a running
server is a precondition, not a convenience.

```bash
curl -s -m 2 http://localhost:4310/api/health
```

| Result | Action |
|---|---|
| `{"ok":true,...}` | Server is up. Continue to Step 1. |
| connection refused, empty, or timeout | Start it, as below. |

To start it, run this from `taskboard/` **in the background** — it is a long-running
process and will block the session if run in the foreground:

```bash
npm run dev:api
```

Use `npm run dev` instead only when the user also wants the browser UI. Then re-probe
`/api/health` every second for up to 15 seconds. Continue on the first `ok`.

Handle these failures explicitly rather than falling straight through to the file:

| Symptom | Meaning | Action |
|---|---|---|
| `Cannot find module` / missing `node_modules` | dependencies not installed | run `npm install` from `taskboard/`, then start again |
| `EADDRINUSE` on 4310 | another process holds the port | do **not** kill it; report the conflict and offer `API_PORT=4311 npm run dev:api`, using the new port for every call afterwards |
| health never returns `ok` within 15s | server failed to boot | report the server's own stderr verbatim and use the fallback write path |

**Never kill or restart a server that is already answering the health probe** — the user
may have it open in a browser. **Leave the server running** when the task is done; do not
shut down a process the user will keep using.

Only after a start attempt has genuinely failed may you use the fallback write path in
Step 4. Say plainly that the API could not be started and that the write skipped
validation and backup.

### Step 1: Read the current board

```bash
curl -s http://localhost:4310/api/board
```

This should now succeed. If it does not, the server died after the health probe — return
to Step 0 rather than silently editing the file.

**Always read immediately before writing.** The user may be editing in the browser,
and a write replaces the whole document — a stale read silently discards their
changes.

### Step 2: Resolve the target records

Match what the user named against real records before changing anything.

- Prefer an exact id (`S-4`, `T-12`, `p-data`) when the user gives one.
- Otherwise match case-insensitively on `title`, then on a distinctive substring.
- If two or more records match, or none do, **stop and ask** which one. Never guess
  between candidates and never silently create a record the user meant to update.

When creating a record, mint the id by taking the highest existing numeric suffix in
that collection and adding one. **Never reuse a freed id** — if `S-2` was deleted and
`S-7` exists, the next story is `S-8`. Deleted ids may still be referenced in notes.

A new task needs a parent story. If the user did not name one, either match an
obvious existing story or ask. Do not invent a story to hold it without saying so.

### Step 3: Build the next board in memory

Start from the object read in Step 1 and change only what is needed. Keep every other
field byte-identical.

**Status and completion must agree.** This is the rule that rejects most writes:

| Target status | `completedAt` |
|---|---|
| `done` | today's date, `YYYY-MM-DD` |
| `new`, `active`, `hold` | `null` |

When re-marking an already-done item as done, keep its original `completedAt`.

**Defaults for a new record**, unless the user specified otherwise:

```json
{ "description": "<generated>", "status": "new", "priority": "medium", "due": null,
  "estimate": null, "tags": [], "notes": [], "created": "<today>",
  "completedAt": null }
```

**Every new story and task gets a description.** Do not leave `description` null on
creation. If the user gave one, use their wording. Otherwise write one or two plain
sentences restating the title as an outcome, using only what the user actually said plus
unambiguous context already on the board (the parent story's title, the project label).

A generated description must not add facts: no invented deadlines, owners, systems,
numbers, or acceptance criteria. If the title is too thin to expand without guessing,
write the minimal restatement rather than inventing detail — `"Set up Oneplan for the
DSS project."` is right; `"Configure Oneplan in Azure and migrate existing plans."` is
not, unless the user said so. Prefer describing intent over method.

This applies to creation only. Never overwrite an existing non-null description while
updating other fields, and do not backfill descriptions on records the user did not ask
you to touch.

Stories also need `project` and `links: []`. Use the user's stated project; if they
have exactly one project, use it; otherwise ask rather than assigning arbitrarily.

**Relationships are stored once, on the source story only.** To record that `S-1`
blocks `S-2`, append `{ "type": "blocks", "target": "S-2" }` to `S-1.links`. Do not
add a reciprocal entry to `S-2` — the inverse is derived and displayed automatically.
A story may never link to itself.

**Tags are labels, not ids.** Add the string to `tags[]`. Registering it in `tags[]`
at board level is optional and only supplies a colour — an unregistered label is
legal and renders neutral grey. When registering, give a pastel `#rrggbb`.

**Renaming a tag means rewriting every reference:** the registry entry plus the label
in every story's and task's `tags[]`, in the same write. Deleting a tag means
stripping it from every item too. A half-done rename leaves orphaned labels.

**Story array order is the display order** within its column. Appending a story puts
it at the bottom; insert at an index to place it higher.

Deleting a story means deleting its tasks and removing any links that target it.
Deleting a project requires that no story references it.

### Step 4: Write it back and confirm

```bash
curl -s -X PUT http://localhost:4310/api/board \
  -H 'content-type: application/json' \
  --data-binary @next-board.json
```

Send the **whole** board. Write the payload to a temporary file and use
`--data-binary @file` rather than inlining JSON in a shell argument — PowerShell
mangles inline JSON quoting.

| Response | Meaning | Action |
|---|---|---|
| `200 {"ok":true,...}` | Written, previous version snapshotted | Continue to Step 5 |
| `422 {"errors":[...]}` | Rejected; file untouched | Read the errors, fix the payload, retry once |
| `400` | Body was not a JSON object | Fix the payload |
| connection refused | server died mid-task | Return to Step 0 and restart it; use the fallback path only if it will not come back |

A `422` is informative, not a failure to hide — it lists every problem at once.
Report the messages verbatim if a retry does not resolve them.

To check a payload without writing it, `POST /api/validate` with the same body.

**Fallback path only when the API could not be started** (Step 0 exhausted): edit
`taskboard/data/board.json`, then run `npm run validate` from `taskboard/` and fix
anything it reports. This path skips the automatic backup, so make one first with
`npm run backup`.

If the app is open in a browser, a file edit is picked up automatically over SSE. No
refresh needed.

### Step 5: Report what changed

State the ids and titles of every record created, updated, or deleted, and the fields
that changed. Do not paste the whole board back at the user.

## Rules

- **Never touch the board before the health probe.** Confirm the server is up, or start
  it, before reading or writing.
- **Never kill, restart, or shut down a healthy server**, and never leave the session
  having stopped one the user was using.
- **Never write without reading first.** A whole-document PUT built on a stale read
  discards concurrent browser edits.
- **Never bypass validation.** Do not hand-edit `data/board.json` while the API is
  reachable; use the API so the write is validated, backed up, and atomic.
- **Never edit `data/backups/`.** It is the recovery path. Restore through
  `POST /api/backups/restore` or Settings → Data.
- **Never omit a collection you intend to keep, and never send `[]` unless clearing
  is intended.** Omitting a key preserves what is on disk; `[]` erases it.
- **Never set `status` without setting `completedAt` to match.**
- **Never reuse a deleted id.**
- **Never add a reciprocal link.** One record per relationship.
- **Never invent data.** Do not fill in a due date, estimate, or project the user did
  not give. `null` and `[]` are correct answers.
- **Always write a description for a new story or task**, generated from the title and
  stated context when the user did not supply one, and adding no facts they did not give.
  Never overwrite an existing description as a side effect of another change.
- **Ask before destructive or ambiguous action:** deleting a story with tasks,
  deleting a project or tag that is in use, clearing a collection, or acting on a
  name that matches more than one record.
- **Report a rejected write honestly**, with the server's own error messages.

## Related Skills
- **workday-summary**: read-only end-of-day briefing built from this same board.
- **workday-startup**: read-only start-of-day briefing and hygiene score built from this
  same board; delegates any status change back here.
- **ado-workitems**: the equivalent read/write flow for Azure DevOps work items,
  which are tracked separately from this personal board.
