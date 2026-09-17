# 4. Read-only enforced by module shape, not by convention

**Status:** Accepted

## Context

"This console is read-only" is easy to say and easy to break. One `fetch` with
a `method` in a screen component undoes it, and nothing would notice.

## Decision

`src/api/http.ts` is the only module permitted to call `fetch`, and it exports
exactly one function, `get`. No `post`, no `put`, no `delete`, no generic
`request`, no method parameter. The request options are fixed in one place:
`method: "GET"`, `credentials: "omit"` (the agent sets
`allow_credentials=false`, so cookies would fail CORS outright),
`cache: "no-store"`, `redirect: "manual"`.

Three enforcement layers, described in the README.

## Consequences

- Adding a mutation is not a matter of remembering not to. There is no
  function that performs one.
- **The guard has caught three real additions** where an endpoint was added
  without a read-only assertion. The endpoint table now takes path parameters
  from a map so a new endpoint fails loudly instead of being skipped.
- **Cost:** `redirect: "manual"` means one stray trailing slash becomes an
  indistinguishable outage, because FastAPI's `redirect_slashes` answers a
  mismatch with a 307. A guard asserts no path ends in a slash.
- **This constrains us, not an attacker.** Anyone who can run script in this
  origin has the key and can issue whatever they like. See ADR 2.
