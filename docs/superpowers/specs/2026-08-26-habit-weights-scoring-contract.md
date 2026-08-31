# Issue #105 — Habit weights and scoring contract

Status: implemented — v1 shipped in PR #118 and PR #139; open corrections tracked in #105

This document settles the data and metric semantics before UI or API coding
starts. It is the v1 contract for habit weights, score, completion rate, and
streaks.

## Goals

- Let every habit be compared using the same four user-editable dimensions.
- Keep score behavior deterministic across Android, backend, and future
  clients.
- Preserve useful offline behavior without allowing a client to define the
  authoritative result.
- Make completion and streak numbers reproducible from the stored logs.

## Decisions

### 1. Storage ownership and fields

The four values are properties of a habit, not of a completion log. They are
stored on the existing `habits` record in both stores:

| Field | Type | Range | Meaning | Direction |
| --- | --- | --- | --- | --- |
| `impact` | integer | 1–5 | Benefit when this habit is completed | higher is better |
| `friction` | integer | 1–5 | How difficult it is to complete | lower is better |
| `keystone` | integer | 1–5 | How much this habit enables other habits | higher is better |
| `time_cost` | integer | 1–5 | Time required for one completion | lower is better |

The API uses snake_case (`time_cost`); the React Native model uses the same
database column names and idiomatic properties (`timeCost` is acceptable in
TypeScript code). Values are server-persisted habit data and therefore are
included in habit create, update, push-sync, and pull-sync payloads. They are
not device-local preferences like notification settings, and they are not
copied onto `habit_logs`.

Existing habits are migrated with the neutral value `3` for all four fields.
New habits also default all four fields to `3`. A value is never null in the
v1 schema; “missing” input means “use 3” at the API boundary, while persisted
rows always contain an explicit integer. Values outside 1–5 are rejected with
HTTP 422 (and rejected by the client validation layer).
The API accepts only strict JSON integers for these fields: booleans, numeric
strings, and fractional values are rejected rather than coerced. Omitted
fields still default to `3` during the compatibility window.

The server remains the source of truth for synced values. As with the current
local-first habit flow, an offline client may hold an unsynced edit; conflict
handling follows the existing habit sync behavior and is outside this scoring
contract.

### 2. Score formula

The score is an integer from 0 through 100. All four dimensions have equal
weight. Friction and time cost are inverted because lower values are better.

```text
impact_component   = impact
friction_component = 6 - friction
keystone_component = keystone
time_component     = 6 - time_cost

raw = impact_component + friction_component + keystone_component + time_component
score = round(100 * (raw - 4) / 16)
```

The `raw` range is 4–20, so the normalization maps the worst possible habit
to 0 and the best possible habit to 100. `round` means mathematical
half-up rounding; implementations must not use locale-dependent formatting
or floating-point display values. A score is recalculated whenever any input
rating changes.

Examples:

- `(impact=5, friction=1, keystone=5, time_cost=1)` → `100`.
- `(3, 3, 3, 3)` → `50`.
- `(impact=4, friction=2, keystone=3, time_cost=4)` → `56`.

The score is derived data and is not stored as an independent column in v1.
This prevents stale scores after edits and keeps migration/backfill simple.

### 3. Authority and calculation location

Scoring is server-authoritative. The server validates the four ratings and
 computes the score in every habit read/detail response and in ranking or
 metrics responses. The score is therefore available to lists and
 leaderboards without an extra request, while date-dependent metrics remain
 behind the metrics endpoint. Clients must treat a server-returned score as authoritative
after synchronization.

For responsive offline UI, the Android client may calculate the same formula
locally as a provisional value. The formula and rounding behavior must be
covered by shared-equivalent client and backend tests. The client must not
send a score as writable input, and the server must ignore/reject a client
supplied score.

Completion and streak metrics are also derived from logs. The client may
compute them while offline for display, but a server metrics response is
authoritative once available.

### 4. Completion rate

Completion rate is a percentage for an explicit inclusive calendar-date
range `[start, end]`:

```text
eligible_days = number of calendar days from start through end
completed_days = count of distinct, non-deleted logs for this habit in the range
completion_rate = round(100 * completed_days / eligible_days)
```

`start` must not be after `end`. The range is interpreted in the user/device
calendar timezone as `YYYY-MM-DD`; no UTC conversion is permitted. A day is
completed at most once because `(habit_id, completed_date)` is unique.

For a default lifetime metric, `start` is the habit creation date converted
from the stored UTC `created_at` timestamp using UTC, and `end` is the
requested as-of date (normally today). For a standard dashboard
window, the caller must pass the window explicitly; v1 does not silently
change the denominator based on active/inactive status. The denominator
includes today even when today is not yet completed. An empty range is invalid
rather than returning a fabricated percentage.

Logs before creation, logs marked deleted, and logs belonging to another user
do not count. Historical logs remain valid after a habit is deactivated.

This is a **universal data-validity rule, not a completion-rate one**: it governs
every derived metric — the completion rate, the per-habit streak of §5, and the
head-to-head score and streak alike. A habit's creation is a hard boundary, and
backfilling history from before it is explicitly not supported.

The boundary carries a **one-day grace**: it is `date(created_at) - 1 day`, in
UTC. This is not slack. `created_at` is an absolute UTC instant while
`completed_date` is a device-local calendar date, so the two are not directly
comparable — a user west of UTC creating a habit in their evening lands a UTC
creation date one day *ahead* of their own, and a strict comparison would discard
the first log they ever record. One day covers the whole UTC-12..+14 range.
Carrying the local creation date properly, and removing the need for the grace,
is tracked in #149.

### 5. Streak

Streak is the number of consecutive completed calendar days ending at the
latest completed day at or before the as-of date. It is calculated from
distinct, non-deleted logs and has no maximum in the contract.

To preserve the app’s existing behavior, if the as-of date is not completed,
the calculation starts at the previous calendar day. Therefore a user who has
completed yesterday but not yet today still sees the active streak; a missed
day breaks it. If neither the as-of date nor the previous date is completed,
the streak is `0`.

Examples as of Friday:

- Wed/Thu/Fri completed → `3`.
- Tue/Wed/Thu completed, Fri pending → `3`.
- Tue/Thu/Fri completed → `2` (Thu–Fri; Wednesday is the break).
- No completed day at or immediately before Friday → `0`.

The as-of date is a local calendar date, not a timestamp. Inactive status does
not erase or truncate a streak; the caller can choose whether to request
metrics for an inactive habit.

A streak **is** bounded below by the habit's creation date, under §4's universal
rule and with the same one-day grace. Lifecycle *status* never truncates a
streak; the habit's *existence* does. A day before the habit existed therefore
breaks the walk exactly as an uncompleted day would.

## Data flow and interface requirements

```text
user edits ratings
        │
        ├─ local habits row (unsynced) ──> provisional client score
        │
        └─ habit create/update sync ──> server validates + persists ratings
                                           │
                                           └─ server derives score/metrics
                                              in read/metrics responses
```

Habit create/update and sync contracts must add the four ratings as optional
request fields during the compatibility window, defaulting omitted fields to
`3`; responses must always return all four ratings. Once all clients are
migrated, requests may become required for newly created records while update
requests remain partial. The metrics endpoint must accept
`habit_id`, `start`, `end`, and `as_of` as explicit local-date parameters and
return the score, completion rate, completed-day count, eligible-day count,
and current streak.

`as_of` is independent of `[start, end]`; it may be outside the completion
rate range for historical streak queries. The response shape is:

```json
{
  "habit_id": "…",
  "score": 50,
  "completed_days": 3,
  "eligible_days": 7,
  "completion_rate": 43,
  "current_streak": 2
}
```

The Android habit screen and leaderboard screen are the v1 consumers of
ratings and score. The existing Stats screen must use the metrics endpoint
with an explicitly selected date window rather than its current local-only
month-to-date calculation.

This contract exposes the per-habit score needed by a leaderboard, but does
not define cross-user ranking, participant identity, privacy, tie-breaking,
or a leaderboard endpoint. Those decisions remain part of #107; until that
contract exists, clients must not synthesize a head-to-head leaderboard from
one user's local habits.

The head-to-head integration defined by #107 uses:

```text
GET /v1/leaderboards/head-to-head?opponent_id={user_id}&start={epoch_ms}&end={epoch_ms}[&as_of={YYYY-MM-DD}]
```

`opponent_id` is required and must identify a user other than the authenticated
caller. `as_of` is optional and defaults to today (UTC); it is the local calendar
date the streak tie-breaker is measured from. Boundaries are generated
dynamically by the client for daily, weekly, monthly, and yearly tabs; they are
not persisted as competitions. The response
contains exactly the authenticated user and opponent. Each user's aggregate
score is the sum of the derived habit score for every distinct, non-deleted
habit log inside the requested window. Rankings sort by score descending,
streak descending, completion rate descending, then earliest authoritative sync.

The tie-breaker's streak is **user-level**: consecutive calendar days on which the
user completed at least one non-deleted log for *any* of their habits. It is
therefore not the per-habit streak of §5, and equals
`GET /habits/{id}/metrics.current_streak` only for a user who owns exactly one
habit. It is measured from `as_of`, clamped to the period end so a finished window
reports the streak as it stood at that point, and is otherwise **independent of
`[start, end]`** — history from before the window counts toward it. §4's creation
floor applies per habit: a day counts toward the user-level streak only if the
user completed at least one habit that **already existed on that day**. Points are
floored the same way, so a habit created mid-window accrues nothing for the days
before it existed. §5's rule still applies: start at `as_of`, or at the previous
calendar day when `as_of` is not completed.

The current storage represents completion as a calendar date, so epoch
boundaries are normalized to UTC dates by the backend. Both representations
therefore cross the wire together on this endpoint: `as_of` is a local calendar
date, as §5 requires of an as-of date, while `start` and `end` remain
UTC-normalized epoch boundaries until #149 settles the window representation.

## Migration and testing requirements

- Add the four non-null habit columns with default `3` in the backend
  migration/model and WatermelonDB schema migration.
- Include the fields in local create, local pull, local push, backend create,
  update, and sync paths.
- Test bounds, omitted values, and rejection of invalid values.
- Test score extremes, neutral score, inversion of friction/time cost, and
  half-up rounding.
- Test completion rates with today pending, deleted logs, duplicate input,
  date boundaries, and a one-day range.
- Test streaks across month/year boundaries, missing today, a gap, and deleted
  logs, retaining the existing DST-safe date tests.
- Do not backfill or rewrite existing completion logs.

## Non-goals and deferred decisions

- Per-habit schedules, skipped days, weekly frequencies, or grace days.
- Different score weights by user, habit category, or habit type.
- Persisted score history; changing a rating changes the current derived score.
- Cross-habit “keystone effect” calculations; `keystone` is currently a
  user-entered rating, not an inferred graph relationship.
- A product decision about which dashboard date window to display by default;
  callers must provide that window explicitly.
