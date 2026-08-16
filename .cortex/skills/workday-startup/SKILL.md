---
name: workday-startup
description: "Starts the workday from the local Task Board: recaps what is currently active and where it was left, ranks a concrete priority list for the session, shows the backlog and what is due or overdue, and scores board hygiene out of 10 with the highest-value fixes. Read-only against the board by default; optionally sets one story or task active after explicit confirmation. Triggers: start my day, start my work, morning briefing, what should I work on, what am I working on, catch me up, where did I leave off, plan my day, standup prep, daily kickoff, board hygiene, hygiene score"
---

# Workday Startup

## Scope

Builds a start-of-day briefing from the local Task Board: what is already in flight and
where it stands, a ranked priority list for this session, the backlog behind it, and a
deterministic hygiene score for the board itself.

The board is read-only in this workflow. The only optional write is setting a single
chosen item to `active`, and only after the user explicitly asks.

**Use this skill when** the user is starting work, asking what to work on, asking where
they left off, or asking how tidy their board is.

**Do NOT use this skill for** end-of-day recaps of what was completed (use
`workday-summary`), changing board contents (use `taskboard`), or Azure DevOps work
items (use the `ado-*` skills).

## Environment

| Setting | Value |
|---|---|
| Data source | `http://localhost:4310/api/board`; `taskboard/data/board.json` only if the server will not start |
| Health probe | `GET http://localhost:4310/api/health` → `{"ok":true,"port":4310}` |
| Start API only | `npm run dev:api` from `taskboard/`, in the background |
| Board writes | none, unless the user asks to start an item |
| Reporting day | the local calendar date, `YYYY-MM-DD` |
| Active signal | `status == "active"` |

The board stores dates only — no timestamps. "Where you left off" is therefore inferred
from `completedAt`, `created`, and `notes[].date`, all at day granularity. Do not imply
the board records a time of day or an ordering within a day.

## Workflow

```text
Workday Startup Progress:
- [ ] Step 0: Ensure the API server is running
- [ ] Step 1: Read the board
- [ ] Step 2: Recap what is active and where it stands
- [ ] Step 3: Detect blocked, overdue, and due-soon work
- [ ] Step 4: Rank the session priority list
- [ ] Step 5: Show the backlog
- [ ] Step 6: Score board hygiene
- [ ] Step 7: Deliver the briefing
```

Use [EXAMPLES.md](EXAMPLES.md) as the regression scenarios for this workflow.

### Step 0: Ensure the API server is running

Probe before reading anything. This skill usually runs first thing in the morning, so the
server is frequently down — treat starting it as part of the routine.

```bash
curl -s -m 2 http://localhost:4310/api/health
```

On `{"ok":true,...}` continue to Step 1. On connection refused, an empty response, or a
timeout, start the server from `taskboard/` **in the background** — it is long-running and
will block the session in the foreground:

```bash
npm run dev:api
```

Use `npm run dev` instead when the user also wants the browser UI for the day. Then
re-probe `/api/health` every second for up to 15 seconds and continue on the first `ok`.

If a missing `node_modules` blocks the boot, run `npm install` from `taskboard/` and try
once more. If `EADDRINUSE` reports port 4310 taken by something else, do not kill it —
report the conflict and offer `API_PORT=4311 npm run dev:api`, using that port afterwards.

**Never kill or restart a server that is already healthy**, and leave it running when the
briefing is done — the user is starting their day and will keep using it. Only if the
server genuinely will not start may you fall back to reading `taskboard/data/board.json`;
say so, and quote the server's own error.

Mention the server in the briefing only when something notable happened: it was started,
it is on a non-default port, or it could not start at all. A silent healthy probe needs no
commentary.

### Step 1: Read the board

```bash
curl -s http://localhost:4310/api/board
```

If this fails after a healthy probe, the server died — return to Step 0 rather than
silently reading the file. When the briefing did come from the file, say so.

If the board is empty — no stories and no tasks — say so plainly, offer to create the
first story through `taskboard`, and stop. Do not manufacture a plan or a hygiene score
for an empty board.

Resolve today's date from the system clock as a **local** calendar date. A UTC date
reports yesterday for the first hours after midnight east of UTC, which would misstate
what is overdue.

### Step 2: Recap what is active and where it stands

The **active set** is every story and task with `status == "active"`. This is the answer
to "what am I working on" — report it first, before any recommendation.

For each active story, give:

- id and title, plus its project label
- `done/total` task progress
- `due`, or `no due date`
- the most recent `notes[]` entry with its date, since that is the closest thing the
  board has to a resume point
- which of its tasks are `active`, `new`, and `hold`

For each active task, give its id, title, parent story title, priority, and `due`.

**Name the resume point explicitly** when the data supports one: an active task under an
active story is where work stopped. When an active story has no active task, say the next
task still has to be chosen — do not pick one silently and present it as in progress.

Resolve every `storyId` to its story title and every `project` id to its project label.
Never show a bare id alone.

If more than one story is active, list them all and say so; do not silently collapse to
one "current" item.

### Step 3: Detect blocked, overdue, and due-soon work

**Blocked.** A story is blocked when another story links to it with `blocks` or
`precedes` and that source story is not yet `done`. Links are stored only on the source
story, so scan every story's `links[]` for entries targeting the story in question. Name
the blocker's id and title. A `related` or `duplicate-of` link does not block.

**Cleared parking.** A `hold` story whose blockers are now all `done`, or which never had
a blocking link, is a candidate to restart. Surface it — nothing else will.

**Overdue.** Any item with `due < today` that is not `done`, including tasks. Give the
number of days late.

**Due soon.** Items due today or within the next three days.

Do not infer a blocker from absent data. A story with no tasks is undecomposed, which is
different from blocked, and a story with no `due` is undated, not late.

### Step 4: Rank the session priority list

Produce three to seven concrete next actions. Each names the id, the title, the reason,
and the first concrete step. Rank in this order, breaking ties by due date, then
priority, then id:

1. Overdue items already `active` — in flight and already late.
2. Blockers — unfinished stories that gate other work, since clearing them unblocks the
   most.
3. `active` tasks under `active` stories, highest priority first. This is normally the
   true resume point.
4. `active` stories with no `active` task, where the next task must be chosen.
5. Overdue or due-soon items not yet started.
6. `hold` stories whose blocker has cleared.
7. `new` stories needing decomposition, especially any with zero tasks.

This ranking is judgement, not a stored field. State the reason for each entry so the
user can disagree with it.

If more than three stories are already `active`, say that finishing beats starting and
do not recommend opening additional work at the top of the list.

### Step 5: Show the backlog

Everything not `done` and not in the active set, grouped so it is skimmable:

| Group | Definition |
|---|---|
| Parked | `status == "hold"` |
| Queued | `status == "new"` |

Within each group, order by due date first, then priority, then id. Show id, title,
project, priority, `due`, and task count for stories.

Cap the printed backlog at ten items per group. When a group is truncated, give the full
count and say how many were omitted rather than implying the list is complete.

Report `estimate` sums per group with `null` treated as unestimated, never as zero. When
any item lacks an estimate, label the total partial.

### Step 6: Score board hygiene

Hygiene measures whether the board is trustworthy enough to plan from. It is about the
record, not the delivery — being behind schedule is not poor hygiene; being unable to
tell whether you are behind is.

Seven deterministic checks, ten points total. Each check awards its full weight times the
fraction of in-scope items that pass. Items outside a check's scope neither help nor hurt
it; when a check has no in-scope items, award full weight and mark it `n/a`.

| # | Check | Weight | Scope | Passes when |
|---|---|---:|---|---|
| 1 | Decomposition | 2 | `active` stories | the story has at least one task |
| 2 | Estimates | 2 | `active` and `new` tasks | `estimate` is not `null` |
| 3 | WIP discipline | 2 | the board | at most 3 stories are `active`; award `2 - (active - 3) * 0.5`, floored at 0 |
| 4 | Dated commitments | 1 | `active` stories | `due` is not `null` |
| 5 | Parking justified | 1 | `hold` stories | an unfinished blocking link targets it, or it has a `notes[]` entry within 14 days |
| 6 | Completion consistency | 1 | all stories and tasks | `done` implies a non-null `completedAt`, and any other status implies `completedAt == null` |
| 7 | Referential integrity | 1 | all stories and tasks | the story's `project` resolves to a real project, every task's `storyId` resolves to a real story, and no story links to itself |

Round the total to the nearest 0.5 and label it:

| Score | Label |
|---|---|
| 9–10 | Healthy |
| 7–8.5 | Good |
| 5–6.5 | Needs work |
| below 5 | At risk |

Report the score, the label, and every check that lost points with the exact items
responsible. Order the recommended fixes by points recoverable, descending, and break
ties by the number of items a single fix resolves.

Check 6 or 7 losing any points is a **data integrity** finding, not a tidiness one:
report it first regardless of its weight, because the rest of the briefing is derived
from that data. Note that the validated API rejects these states, so their presence
means the file was hand-edited.

Never propose a fix that invents content. "Add an estimate to `T-4`" is a prompt for the
user to supply one, not licence to guess a number.

### Step 7: Deliver the briefing

Keep it compact and skimmable. Lead with what is already in flight, then what to do.

```markdown
## <today> — start of day

**Active now** — <n> stories, <n> tasks
- `S-1` Migrate patient ETL to dynamic tables (Data Platform) · 1/5 tasks · due <date>
  - resume at `T-3` Convert staging models — active, high
  - last note <date>: <text>

**Needs attention**
- Overdue: `T-2` Rewrite non-deterministic UDFs — 3 days late
- Blocked: `S-2` Rebuild exec KPI dashboard — waiting on `S-1`
- Restartable: `S-5` Archive legacy extracts — blocker `S-4` is now done

**Priorities this session**
1. `T-2` … — overdue and already active; finish the last UDF conversion.
2. `S-1` … — gates `S-2`; pick up `T-3`.

**Backlog** — <n> queued, <n> parked · <points> pts, partial
- `S-6` Add freshness monitors (Data Platform) · medium · due <date> · 0 tasks

**Board hygiene** — 7.5/10 · Good
- Estimates (−1.0): `T-4`, `T-7`, `T-9` have no estimate
- Decomposition (−0.7): `S-3` is active with zero tasks
Highest-value fix: estimate the three open tasks.
```

Omit any section that is empty rather than printing a heading with nothing under it. If
nothing is active, say so directly and lead with the priority list instead — do not pad
the briefing.

Close with one line of honest observation only when the data supports it, for example
that every active story belongs to one project. Do not invent encouragement or infer how
the user feels about the day ahead.

### Optional: start an item

Only when the user explicitly asks to begin something. Hand the write to `taskboard` so
it passes through the validated API: set `status` to `active` and leave `completedAt` as
`null`. Change one item at a time and confirm which one. Never set an item active as a
side effect of producing a briefing.

## Rules

- The board is read-only here. The only permitted write is starting an item the user
  asked to start, performed through `taskboard`.
- Confirm the API is healthy, or start it, before reading the board. Never kill or restart
  a healthy server, and never shut one down when finishing — the user's day is beginning.
- Read the data file only after a start attempt has genuinely failed, and say so.
- Never derive "today" from a UTC date.
- Never treat a `null` estimate as `0`. Report point totals as partial when estimates are
  missing.
- Never present a recommendation as the current state. Only `status == "active"` is
  in flight.
- Never silently choose a next task for an active story that has none — say the choice is
  open.
- Never infer a blocker from absent data, and never speculate about why something stalled.
- Never resolve a story or project by id alone in the output — always pair it with its
  title or label.
- Compute the hygiene score exactly as specified. Do not add, drop, or reweight checks to
  reach a nicer number, and show the arithmetic for any check that lost points.
- Never propose a hygiene fix that fabricates an estimate, due date, description, or
  project.
- Report an empty board as empty. Do not generate plausible-looking work or score it.
- Say when the briefing came from the data file rather than the running API.
- Give the briefing first; ask at most one focused follow-up question after it, and only
  if a real ambiguity blocks prioritization.

## Related Skills
- **taskboard**: the read/write protocol for this board; owns every mutation, including
  the optional status change.
- **workday-summary**: the end-of-day counterpart, reporting what closed rather than what
  to start.
