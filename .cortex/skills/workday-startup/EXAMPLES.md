# Workday Startup - Evaluation Scenarios

Regression scenarios for `workday-startup`. Each states the request, any setup, the
expected behavior, and the fail condition.

## Scenario 1: Normal morning with work in flight

**Request:** "Start my day"

**Correct selection:** `workday-startup`.

**Setup:** One `active` story with one `active` task and two `new` tasks, one `new` story,
one `hold` story.

**Expected behavior:**

- [ ] Reads the board once from the API.
- [ ] Leads with the active set before any recommendation.
- [ ] Names the active task as the resume point.
- [ ] Resolves every task to its parent story title and every story to its project label.
- [ ] Gives three to seven ranked priorities, each with a reason and a first step.
- [ ] Shows the backlog split into queued and parked.
- [ ] Reports a hygiene score out of 10 with a label.
- [ ] Writes nothing to the board.

**Fails if:** it opens with recommendations instead of current state, shows bare ids, or
modifies the board.

## Scenario 2: Nothing active

**Request:** "What should I work on?"

**Setup:** No item has `status == "active"`.

**Expected behavior:**

- [ ] States plainly that nothing is active.
- [ ] Leads with the priority list instead of an empty active section.
- [ ] Does not describe a `new` or `hold` item as in flight.

**Fails if:** it presents its top recommendation as the thing the user is already working
on, or prints an empty "Active now" heading.

## Scenario 3: Empty board

**Request:** "Morning briefing"

**Setup:** `stories` and `tasks` are both empty.

**Expected behavior:**

- [ ] Reports the board is empty and stops.
- [ ] Offers to create the first story through `taskboard`.
- [ ] Produces no hygiene score.

**Fails if:** it fabricates work, or reports a 10/10 hygiene score for an empty board.

## Scenario 4: Active story with no active task

**Request:** "Where did I leave off?"

**Setup:** `S-1` is `active`; all of its tasks are `new`.

**Expected behavior:**

- [ ] Says the next task is still open rather than naming one as in progress.
- [ ] Ranks "choose the next task on `S-1`" in the priority list.
- [ ] Does not set anything active.

**Fails if:** it picks a task and presents it as the current work, or writes a status
change.

## Scenario 5: Blocked and restartable stories

**Request:** "Start my work"

**Setup:** `S-1` has `{ "type": "blocks", "target": "S-2" }` and is still `active`.
`S-4` has `{ "type": "blocks", "target": "S-5" }` and is `done`; `S-5` is `hold`.

**Expected behavior:**

- [ ] Finds both links by scanning source stories' `links[]`, since inverse links are not
      stored.
- [ ] Reports `S-2` as blocked, naming `S-1` with its title.
- [ ] Surfaces `S-5` as restartable because its blocker is done.
- [ ] Ranks the blocker `S-1` above ordinary active work.

**Fails if:** it misses either link by inspecting only the target story, treats a
`related` link as blocking, or leaves the cleared parking unmentioned.

## Scenario 6: Hygiene score arithmetic

**Request:** "What's my board hygiene?"

**Setup:** 2 `active` stories, one with zero tasks; 4 open tasks, 2 with `estimate: null`;
both active stories have a `due`; no `hold` stories; all statuses and `completedAt` values
consistent; all references valid.

**Expected behavior:**

- [ ] Decomposition awards 1.0 of 2 (1 of 2 active stories pass).
- [ ] Estimates awards 1.0 of 2 (2 of 4 tasks pass).
- [ ] WIP discipline awards the full 2 (2 active is at or under 3).
- [ ] Dated commitments awards the full 1.
- [ ] Parking justified is marked `n/a` and awards the full 1.
- [ ] Completion consistency and referential integrity award 1 each.
- [ ] Total is 8.0/10, labelled Good.
- [ ] Names the specific items that cost points and orders fixes by points recoverable.

**Fails if:** the arithmetic does not match, an `n/a` check is scored as zero, or checks
are reweighted to produce a different total.

## Scenario 7: Too much work in progress

**Request:** "Plan my day"

**Setup:** Six stories are `active`.

**Expected behavior:**

- [ ] Lists all six rather than collapsing to one current item.
- [ ] Scores WIP discipline at 0.5 (`2 - (6 - 3) * 0.5`).
- [ ] Says finishing beats starting and does not recommend opening new work at the top of
      the priority list.

**Fails if:** it picks one story as "the" active item, miscomputes the WIP deduction, or
recommends starting a `new` story first.

## Scenario 8: Integrity violation from a hand edit

**Request:** "Morning briefing"

**Setup:** `data/board.json` was edited by hand so `T-3` has `status: "new"` with a
non-null `completedAt`, and `T-8` has a `storyId` that no longer exists.

**Expected behavior:**

- [ ] Reports both findings first, ahead of tidiness findings, despite their low weight.
- [ ] Notes that the validated API rejects these states, so the file was hand-edited.
- [ ] Still produces the rest of the briefing.

**Fails if:** it buries the integrity findings under estimate nits, or silently plans from
the inconsistent data.

## Scenario 9: Local date boundary

**Request:** "Start my day" run at 01:00 local time, in a timezone ahead of UTC

**Expected behavior:**

- [ ] Uses the local calendar date.
- [ ] Classifies overdue and due-soon items against that local date.

**Fails if:** it uses a UTC date and reports an item due today as due tomorrow.

## Scenario 10: API not running

**Request:** "Catch me up"

**Setup:** The server is not running — the normal state first thing in the morning.

**Expected behavior:**

- [ ] Probes `/api/health` first and gets a connection refusal.
- [ ] Starts `npm run dev:api` from `taskboard/` in the background and polls health until
      it returns `ok`.
- [ ] Builds the briefing from the API, not the file.
- [ ] Mentions that it started the server, then leaves it running.

**Fails if:** it reads `data/board.json` without attempting a start, runs the server in
the foreground and hangs, or reports the request as impossible.

## Scenario 10b: Server already healthy

**Request:** "Start my day"

**Setup:** `npm run dev` is already running with the UI open.

**Expected behavior:**

- [ ] Probes health, gets `ok`, and proceeds without commentary about the server.
- [ ] Does not restart it, kill it, or spawn a duplicate.

**Fails if:** it restarts the server, or narrates the healthy probe as an event.

## Scenario 10c: Server cannot be started

**Request:** "Morning briefing"

**Setup:** The start attempt fails and health never returns `ok`.

**Expected behavior:**

- [ ] Falls back to reading `taskboard/data/board.json`.
- [ ] States that the briefing came from the data file and quotes the server's error.
- [ ] Produces the same briefing structure and hygiene score.

**Fails if:** it hides which source it used, or abandons the briefing.

## Scenario 11: Explicit request to start an item

**Request:** "Start my day, and set T-5 active"

**Expected behavior:**

- [ ] Produces the briefing first.
- [ ] Delegates the status change to `taskboard` so it passes through the validated API.
- [ ] Sets `T-5.status` to `active`, leaves `completedAt` as `null`, and changes nothing
      else.

**Fails if:** it sets an item active without being asked, edits `data/board.json`
directly, or alters other fields.

## Scenario 12: Large backlog

**Request:** "Show me my backlog"

**Setup:** 24 `new` stories and 3 `hold` stories.

**Expected behavior:**

- [ ] Prints at most ten queued items, ordered by due date, then priority, then id.
- [ ] Gives the full count of 24 and says how many were omitted.
- [ ] Labels the point total partial if any estimate is `null`.

**Fails if:** it dumps all 24, or implies the printed ten are the whole backlog.

## How to run

Start from a stopped server for the Scenario 10 variants; otherwise start the app with
`npm run dev` from `taskboard/`. Seed the setup for each scenario, then invoke the request.
Confirm the checkboxes and the stated fail condition. After every scenario, run
`npm run validate` and confirm the board was not modified except in Scenario 11.
