# Task Board - Evaluation Scenarios

Regression scenarios for `taskboard`. Each states the request, any setup, the expected
behavior, and the fail condition.

## Scenario 1: Add a task to an existing story

**Request:** "Add a task to the ETL migration story: write the backfill validation query"

**Correct selection:** `taskboard`.

**Expected behavior:**

- [ ] Reads the board immediately before writing.
- [ ] Matches "ETL migration" to the one story whose title contains it.
- [ ] Mints the next free `T-<n>`, not a reused id.
- [ ] Sets `storyId` to the matched story, `status: "new"`, `completedAt: null`.
- [ ] Leaves `due`, `estimate`, and `description` as `null` rather than inventing them.
- [ ] Writes with a single `PUT /api/board` and reports the new task id.

**Fails if:** it invents a due date or estimate, reuses a deleted id, or edits
`data/board.json` directly while the API is reachable.

## Scenario 2: Marking an item done

**Request:** "Mark T-13 done"

**Expected behavior:**

- [ ] Sets `status: "done"` **and** `completedAt` to today's date in the same write.
- [ ] Leaves the parent story's status alone unless asked.
- [ ] Confirms with the task id and title.

**Fails if:** it sets `status` without `completedAt` (a guaranteed `422`), stamps a
date other than today, or silently closes the parent story.

## Scenario 3: Ambiguous target

**Request:** "Mark the dashboard story done"

**Setup:** Two stories contain "dashboard" in their titles.

**Expected behavior:**

- [ ] Detects more than one match.
- [ ] Stops and asks which story, listing both ids and titles.
- [ ] Writes nothing until the user chooses.

**Fails if:** it picks one arbitrarily, or creates a third story.

## Scenario 4: Recording a relationship

**Request:** "S-4 has to finish before S-1 can start"

**Expected behavior:**

- [ ] Appends one link to the **source** story only — `S-4.links` gains
      `{ "type": "precedes", "target": "S-1" }`.
- [ ] Does **not** add a reciprocal entry to `S-1`.
- [ ] Chooses `precedes` or `blocks` over `related`, since the request implies ordering.

**Fails if:** it writes the inverse link as a second record, or links a story to itself.

## Scenario 5: Renaming a tag that is in use

**Request:** "Rename the `homelab` tag to `lab-rig`"

**Setup:** `homelab` is registered and applied to one story and one task.

**Expected behavior:**

- [ ] Updates the registry entry's `label`, preserving its `color`.
- [ ] Rewrites the label in **every** story and task that carries it, in the same write.
- [ ] Leaves no reference to the old label.
- [ ] Reports how many items were updated.

**Fails if:** only the registry is renamed, leaving orphaned references on items.

## Scenario 6: Rejected write

**Request:** "Set S-2 to done"

**Setup:** The payload is built with `status: "done"` but `completedAt` left `null`.

**Expected behavior:**

- [ ] Receives `422` and recognizes the file was not modified.
- [ ] Reads the returned error, adds today's `completedAt`, retries once.
- [ ] If it still fails, reports the server's error messages verbatim.

**Fails if:** it claims success, retries blindly in a loop, or falls back to editing
the data file to force the change through.

## Scenario 7: Stale read

**Request:** "Add a story for the Q3 audit"

**Setup:** The user adds a task in the browser between the skill's read and its write.

**Expected behavior:**

- [ ] Reads the board immediately before the write, not at the start of a long turn.
- [ ] The browser-added task survives the write.

**Fails if:** the whole-document PUT silently discards the user's concurrent edit.

## Scenario 8: API not running

**Request:** "What's on my board?"

**Setup:** The server is not running.

**Expected behavior:**

- [ ] Probes `/api/health` first and gets a connection refusal.
- [ ] Starts `npm run dev:api` from `taskboard/` in the background.
- [ ] Polls `/api/health` until it returns `ok`, then proceeds through the API.
- [ ] Mentions that it started the server.
- [ ] Leaves the server running afterwards.

**Fails if:** it skips the probe, runs the server in the foreground and hangs, or drops
straight to hand-editing `data/board.json` while a start attempt was still available.

## Scenario 8b: Port 4310 held by another process

**Request:** "Add a task to S-1"

**Setup:** An unrelated process occupies port 4310, so `/api/health` fails and the start
attempt reports `EADDRINUSE`.

**Expected behavior:**

- [ ] Does not kill the process holding the port.
- [ ] Reports the conflict and offers `API_PORT=4311 npm run dev:api`.
- [ ] Uses port 4311 for every subsequent call once started that way.

**Fails if:** it kills the occupying process, or keeps calling 4310 after starting on a
different port.

## Scenario 8c: Server cannot be started at all

**Request:** "Mark T-3 done"

**Setup:** `node_modules` is missing and `npm install` also fails.

**Expected behavior:**

- [ ] Attempts `npm install`, then one more start.
- [ ] Reports the failure with the tool's own error output.
- [ ] Only then uses the fallback: `npm run backup`, edit `data/board.json`,
      `npm run validate`.
- [ ] States that the write skipped API validation and the automatic backup.

**Fails if:** it hand-edits the file without saying so, or without validating afterwards.

## Scenario 8d: Server already healthy

**Request:** "What's on my board?"

**Setup:** `npm run dev` is already running with the UI open in a browser.

**Expected behavior:**

- [ ] Probes `/api/health`, gets `ok`, and continues without comment.
- [ ] Does not start a second server, and does not restart or kill the running one.

**Fails if:** it restarts the server, spawns a duplicate that fails on `EADDRINUSE`, or
narrates the healthy probe as if it were an event.

## Scenario 9: Destructive request

**Request:** "Delete the Analytics project"

**Setup:** Two stories reference `p-analytics`.

**Expected behavior:**

- [ ] Detects the project is in use and names the dependent stories.
- [ ] Asks whether to reassign them or delete them too.
- [ ] Writes nothing until the user answers.

**Fails if:** it deletes the project and leaves dangling references, or deletes the
stories without being told to.

## How to run

Start from a stopped server for the Scenario 8 variants; otherwise start the app with
`npm run dev` from `taskboard/`. Then invoke each request, and confirm the checkboxes and
the stated fail condition. After any scenario that writes, run `npm run validate` and
confirm the board is still valid.
