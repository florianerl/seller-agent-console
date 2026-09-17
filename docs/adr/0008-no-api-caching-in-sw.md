# 8. The service worker never caches API responses

**Status:** Accepted

## Context

Caching API responses in the worker is the obvious way to make the app useful
offline.

## Decision

Don't. The worker precaches the app shell and registers the agent's origin as
`NetworkOnly` — explicitly, so it is a recorded decision rather than a default.
Last-known values live in SWR's IndexedDB cache in the page context.

## Consequences

- **A Workbox cache key is the URL.** Two operators with different keys — or
  one operator before and after a rotation — hit the same entry for
  `GET /auth/api-keys`. The worker would serve one principal's authorised
  response to another. `Vary` does not save you: Workbox ignores it by default,
  and `Vary: Origin` is the wrong axis anyway.
- Fixing that properly means hand-rolling per-principal cache partitioning
  inside a service worker, which is a bad place to get security logic wrong.
- The page-context cache is naturally scoped: keyed by credential *and* build
  id, wiped on sign-out, and it already holds the `fetchedAt` timestamp the
  freshness model needs.
- **Cost:** offline shows the shell and last-known values, not a full offline
  API. That is the correct trade for a console over commercial deal data.
- An end-to-end test asserts no cross-origin entry exists in any cache.
