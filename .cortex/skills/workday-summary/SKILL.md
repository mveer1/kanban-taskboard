---
name: workday-summary
description: "Summarizes the user's work day from the local Task Board: what was completed today, what is still in flight, what is blocked or overdue, what slipped, and what to pick up next. Read-only against the board by default; optionally appends the summary as a dated note after explicit confirmation. Use when wrapping up work or reviewing progress. Triggers: summarize my day, what did I do today, end of day summary, wrap up my day, daily recap, what did I get done, how was my day, close out my day, standup notes for today, what should I do tomorrow"
---

# Workday Summary

## Scope

Builds an end-of-day briefing from the local Task Board: work closed today, work
still open, anything blocked or overdue, and a ranked shortlist for the next session.

The board is read-only in this workflow. The only optional write is a dated note
appended to a story, and only after the user explicitly asks for it.

**Use this skill when** the user is wrapping up, asking what they got done, or
preparing standup notes from their own board.

**Do NOT use this skill for** changing board contents (use `taskboard`), starting the day
or asking what to work on next session (use `workday-startup`), or leadership delivery
reporting (use `sprint-retrospective`).

## Environment

| Setting | Value |
|---|---|
| Data source | `http://localhost:4310/api/board`; `taskboard/data/board.json` only if the server will not start |
| Health probe | `GET http://localhost:4310/api/health` → `{"ok":true,"port":4310}` |
| Start API only | `npm run dev:api` from `taskboard/`, in the background |
| Board writes | none, unless the user asks for a note |
| Reporting day | the local calendar date, `YYYY-MM-DD` |
| Completion signal | `status == "done"` and `completedAt == <today>` |

The board stores dates only — no timestamps. "Today" therefore means the calendar
date, and the summary cannot order two same-day completions. Do not imply it can.

## Workflow

```text
Workday Summary Progress:
- [ ] Step 0: Ensure the API server is running
- [ ] Step 1: Read the board
- [ ] Step 2: Partition the work by state and date
- [ ] Step 3: Detect blocked, overdue, and stale items
- [ ] Step 4: Rank what to pick up next
- [ ] Step 5: Deliver the briefing
```

Use [EXAMPLES.md](EXAMPLES.md) as the regression scenarios for this workflow.

### Step 0: Ensure the API server is running

Probe before reading anything:

```bash
curl -s -m 2 http://localhost:4310/api/health
```

On `{"ok":true,...}` continue to Step 1. On connection refused, an empty response, or a
timeout, start the server from `taskboard/` **in the background** — it is long-running and
will block the session in the foreground:

```bash
npm run dev:api
```

Then re-probe `/api/health` every second for up to 15 seconds and continue on the first
`ok`. If a missing `node_modules` blocks the boot, run `npm install` from `taskboard/` and
try once more. If `EADDRINUSE` reports port 4310 taken by something else, do not kill it —
report the conflict and offer `API_PORT=4311 npm run dev:api`, using that port afterwards.

**Never kill or restart a server that is already healthy**, and leave it running when the
briefing is done. Only if the server genuinely will not start may you fall back to reading
`taskboard/data/board.json`; say so, and quote the server's own error.

### Step 1: Read the board

```bash
curl -s http://localhost:4310/api/board
```

If this fails after a healthy probe, the server died — return to Step 0 rather than
silently reading the file. When the summary did come from the file, say so.

If the board is empty — no stories and no tasks — say so plainly and stop. Do not
manufacture a summary or suggest work that does not exist.

Resolve today's date from the system clock as a **local** calendar date. Do not use a
UTC date: east of UTC it reports yesterday for the first hours after midnight, which
would drop the day's completions from the report.

### Step 2: Partition the work by state and date

Compute these sets. Resolve every `storyId` to its story title, and every `project`
id to its project label, so the briefing never shows a bare id alone.

| Set | Definition |
|---|---|
| Closed today | tasks and stories with `status == "done"` and `completedAt == today` |
| Closed earlier this week | `done` with `completedAt` within the preceding 6 days |
| In flight | `status == "active"` |
| Parked | `status == "hold"` |
| Queued | `status == "new"` |

Report counts alongside effort: sum `estimate` for closed-today work, treating `null`
as unestimated rather than as zero. If some items have no estimate, say the point
total is partial instead of implying it is complete.

For every story touched today, show `done/total` task progress.

### Step 3: Detect blocked, overdue, and stale items

**Blocked.** A story is blocked when another story links to it with `blocks` or
`precedes` and that source story is not yet `done`. Links are stored only on the
source story, so scan every story's `links[]` for entries targeting the story in
question. Name the blocker's id and title.

**Overdue.** Any item with `due < today` that is not `done`. Include tasks as well as
stories, and give the number of days late.

**Due next.** Items due today or within three days, since they drive the next session.

**Stale in flight.** A story that is `active` with no task closed in the last 7 days.
Report it as an observation, not a judgement, and never guess a cause.

Do not infer a blocker from missing data. A story with no tasks is undecomposed, which
is different from blocked.

### Step 4: Rank what to pick up next

Produce three to seven concrete next actions. Each names the id, the title, the reason,
and the first concrete step. Rank in this order, breaking ties by due date, then
priority, then id:

1. Overdue items already `active`.
2. Blockers — unfinished stories that gate other work, since they unblock the most.
3. `active` tasks under `active` stories, highest priority first.
4. `active` stories with no `active` task, where the next task must be chosen.
5. Items due within three days that have not been started.
6. `new` stories needing decomposition, especially any with zero tasks.
7. Parked work whose blocker has since cleared — worth surfacing explicitly, because
   nothing else will.

This ranking is judgement, not a stored field. State the reason so the user can
disagree with it.

### Step 5: Deliver the briefing

Keep it compact and skimmable. Lead with what was accomplished.

```markdown
## <today> — day summary

**Closed today** — <n> tasks, <n> stories · <points> pts<, partial if unestimated>
- `T-12` Reproduce failures locally — *Fix dbt test failures* (Data Platform)

**In flight** — <n> stories
- `S-1` Migrate patient ETL to dynamic tables · 1/5 tasks · due <date>

**Needs attention**
- Overdue: `T-2` Rewrite non-deterministic UDFs — 3 days late
- Blocked: `S-2` Rebuild exec KPI dashboard — waiting on `S-1`

**Next up**
1. `T-2` … — overdue and already active; finish the last UDF conversion.
```

Omit any section that is empty rather than printing a heading with nothing under it.
If nothing closed today, say so directly and move to what is in flight — do not pad
the report or soften it.

Close with one line of honest observation only when the data supports it, for example
that every closed item belonged to a single project. Do not invent encouragement or
infer how the user felt about their day.

### Optional: log the summary to the board

Only when the user explicitly asks. Append to the relevant story's `notes[]`:

```json
{ "date": "<today>", "text": "<one-line summary>" }
```

Hand the write to `taskboard` so it goes through the validated API. Never write as a
side effect of producing a summary.

## Rules

- The board is read-only here. The only permitted write is a note the user asked for,
  performed through `taskboard`.
- Confirm the API is healthy, or start it, before reading the board. Never kill or restart
  a healthy server, and never shut one down when finishing.
- Read the data file only after a start attempt has genuinely failed, and say so.
- Never infer completion. An item counts as closed today only if `status == "done"`
  and `completedAt` is today's date.
- Never treat a `null` estimate as `0`. Report point totals as partial when estimates
  are missing.
- Never derive "today" from a UTC date.
- Never infer a blocker from absent data, and never speculate about why something
  stalled.
- Never resolve a story or project by id alone in the output — always pair it with its
  title or label.
- Report an empty board as empty. Do not generate plausible-looking work.
- Say when the summary came from the data file rather than the running API.
- Give the recommendation first; ask at most one focused follow-up question after it,
  and only if a real ambiguity blocks prioritization.

## Related Skills
- **taskboard**: the read/write protocol for this board; owns every mutation,
  including the optional summary note.
- **workday-startup**: the morning counterpart on this same board — recaps what is
  active, ranks the session, and scores board hygiene.
- **session-handoff**: captures deeper implementation context when work continues
  across sessions.
