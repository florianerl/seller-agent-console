# 5. A result union the client never throws

**Status:** Accepted

## Context

Four cards on one screen read four different routes. A 403 on one must not
blank the others, and a changed field upstream must degrade one card rather
than crash a page.

## Decision

Every read resolves to a value:

```ts
type Result<T> =
  | { kind: "ok"; data: T; fetchedAt: number }
  | { kind: "rejected"; status: 401 | 403; role: "anonymous" | "insufficient"; fetchedAt: number }
  | { kind: "unavailable"; reason: "timeout" | "network" | "redirect" | "http" | "content-type" | "shape"; ... };
```

`rejected` is **only** 401 and 403. A 500, an HTML error page from a proxy, a
redirect, a schema mismatch — all `unavailable`, with a reason that can be
shown to a person.

Nothing is thrown. A rejected read is still a resolved read with its own cache
entry, so one card's 403 cannot disturb another's state. Thrown errors stay
reserved for genuine bugs in our own code, which is what an error boundary
should catch.

## Consequences

- Per-card degradation falls out of the design instead of being arranged.
- `fetchedAt` is stamped on every result, which is what the freshness model
  reads — it records when the *data* was fetched, not when a cache entry was
  touched.
- **401 and 403 must not be merged**, and merging them shipped a real defect:
  an operator whose key had expired was told they were "using a buyer key" and
  sent looking for the operator key they were already holding.
- **Cost:** every call site handles a union rather than a happy path. That is
  the point, and it is more code.
