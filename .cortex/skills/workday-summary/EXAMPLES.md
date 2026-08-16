# Workday Summary - Evaluation Scenarios

Regression scenarios for `workday-summary`. Each states the request, any setup, the
expected behavior, and the fail condition.

## Scenario 1: Normal day with mixed activity

**Request:** "Summarize my day"

**Correct selection:** `workday-summary`.

**Setup:** Two tasks completed today, one story active, one story overdue.

**Expected behavior:**

- [ ] Reads the board once from the API.
- [ ] Counts as closed today only items with `status == "done"` **and**
      `completedAt == today`.
- [ ] Resolves every task to its parent story title and every story to its project label.
- [ ] Reports the overdue item with the number of days late.
- [ ] Gives three to seven ranked next actions, each with a reason and first step.
- [ ] Writes nothing to the board.

**Fails if:** it counts items completed on other dates, shows bare ids with no titles,
or modifies the board.

## Scenario 2: Nothing completed today

**Request:** "What did I get done today?"

**Setup:** No item has `completedAt` equal to today.

**Expected behavior:**

- [ ] States plainly that nothing was closed today.
- [ ] Moves on to what is in flight and what needs attention.
- [ ] Does not pad the report, soften it, or count yesterday's work as today's.

**Fails if:** it inflates the day by including earlier completions, or invents
encouragement not supported by the data.

## Scenario 3: Empty board

**Request:** "Summarize my day"

**Setup:** `stories` and `tasks` are both empty.

**Expected behavior:**

- [ ] Reports the board is empty and stops.
- [ ] Suggests nothing specific, because there is no work to reference.

**Fails if:** it fabricates stories, tasks, or a plausible-looking recap.

## Scenario 4: Blocked story

**Request:** "End of day summary"

**Setup:** `S-1` has `{ "type": "blocks", "target": "S-2" }` and `S-1` is still active.

**Expected behavior:**

- [ ] Finds the block by scanning source stories' `links[]`, since inverse links are
      not stored.
- [ ] Reports `S-2` as blocked and names `S-1` with its title as the blocker.
- [ ] Ranks the blocker `S-1` above ordinary active work, because clearing it unblocks
      more.

**Fails if:** it misses the block because it only looked at `S-2`, or reports a
`related` link as blocking.

## Scenario 5: Missing estimates

**Request:** "How was my day?"

**Setup:** Three tasks closed today; two have `estimate: null`.

**Expected behavior:**

- [ ] Sums only the populated estimates.
- [ ] Labels the point total partial and says how many items were unestimated.

**Fails if:** it treats `null` as `0` and presents the total as complete.

## Scenario 6: Local date boundary

**Request:** "Summarize my day" run at 01:00 local time, in a timezone ahead of UTC

**Expected behavior:**

- [ ] Uses the local calendar date.
- [ ] Includes items completed earlier that same local day.

**Fails if:** it uses a UTC date, reports yesterday, and shows the day as empty.

## Scenario 7: Explicit request to log the summary

**Request:** "Summarize my day and add it as a note on S-1"

**Expected behavior:**

- [ ] Produces the summary first.
- [ ] Delegates the note write to `taskboard` so it passes through the validated API.
- [ ] Appends `{ "date": "<today>", "text": "<summary>" }` to `S-1.notes` and changes
      nothing else.

**Fails if:** it writes the note without being asked, edits `data/board.json` directly,
or alters other fields.

## Scenario 8: API not running

**Request:** "Daily recap"

**Setup:** The server is not running.

**Expected behavior:**

- [ ] Probes `/api/health` first and gets a connection refusal.
- [ ] Starts `npm run dev:api` from `taskboard/` in the background and polls health until
      it returns `ok`.
- [ ] Builds the summary from the API, not the file.
- [ ] Leaves the server running.

**Fails if:** it reads `data/board.json` without attempting a start, runs the server in
the foreground and hangs, or reports the request as impossible.

## Scenario 8b: Server cannot be started

**Request:** "Daily recap"

**Setup:** The start attempt fails and health never returns `ok`.

**Expected behavior:**

- [ ] Falls back to reading `taskboard/data/board.json`.
- [ ] States that the summary came from the data file and that the server would not start.
- [ ] Produces the same briefing structure.

**Fails if:** it hides which source it used, or presents the file read as the normal path.

## Scenario 9: Stale active story

**Request:** "Wrap up my day"

**Setup:** A story is `active` with no task closed in the last 7 days.

**Expected behavior:**

- [ ] Surfaces it as stale in flight, with the number of days since the last closure.
- [ ] Presents it as an observation.
- [ ] Does not speculate about the cause or call it blocked.

**Fails if:** it labels the story blocked, or invents a reason for the stall.

## How to run

Start from a stopped server for the Scenario 8 variants; otherwise start the app with
`npm run dev` from `taskboard/`. Seed the setup for each scenario, then invoke the request.
Confirm the checkboxes and the stated fail condition. After every scenario, run
`npm run validate` and confirm the board was not modified except in Scenario 7.
