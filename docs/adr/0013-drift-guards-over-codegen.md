# 13. Guard against API drift rather than generate a client

**Status:** Accepted

## Context

The console hand-writes its request layer (ADR 7) against an agent that lives
in another repository and changes weekly. Once writes landed (ADR 11), the cost
of getting a path wrong changed: a mistyped GET shows an error on a screen,
a mistyped DELETE means an operator confirmed a destructive action, watched it
fail, and cannot tell from the console whether the agent refused it or never
received it.

Generating a client from `openapi.json` remains rejected for the reasons in
ADR 7 — most of its GET responses carry an empty schema, so a generated client
types every route we read as `unknown`.

## Decision

Two guards over the source, both reading the call sites rather than a list.

`openapi-drift.guard` asserts every path the endpoint layer calls exists in a
captured snapshot of the agent's OpenAPI surface with the method used, and that
no operation the agent exposes goes unreached without an entry in `NOT_ADOPTED`
explaining why.

`no-trailing-slash.guard` asserts no path ends in — or contains — a stray
slash. FastAPI's `redirect_slashes` answers a mismatch with a 307, and this
client refuses to follow one, so a single character turns into
`unavailable: "redirect"`, which on screen is indistinguishable from the agent
being down.

## Consequences

- Both read the call sites with the TypeScript compiler API, so a new endpoint
  is covered the moment it is written. A hand-kept list would be a second place
  to update, and a guard whose input drifts reports on code that no longer
  exists while missing the code that does.
- **The snapshot is a capture, not a live query.** If the agent changes and
  nobody refreshes `tests/fixtures/agent-surface.json`, the guard passes while
  the console is broken. That is the limitation the guard cannot escape; it is
  mitigated by asserting the capture is under 90 days old, so the file cannot
  rot indefinitely without someone being told, and by
  `npm run refresh:agent-surface`.
- Only the surface is captured — paths, methods, query parameter names — not
  the 300 kB spec. A reduced file makes the diff readable, so a route appearing
  or disappearing shows up in review as a line rather than a regenerated blob.
- **Query parameters are not checked.** They are forwarded variables rather
  than literals at nearly every call site, so a static reader sees nothing.
  Checking a third of them while implying all would be worse than not claiming
  it, so the guard says what it does not do.
- Requiring every agent operation to be reached will fail CI when the agent
  gains a route. That is the intent — an unnoticed route is the failure mode —
  and the fix is one line either way. It is the assertion most likely to become
  noise, and the first to revisit if it does.
