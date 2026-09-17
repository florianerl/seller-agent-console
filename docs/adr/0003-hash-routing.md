# 3. Hash routing on GitHub Pages

**Status:** Accepted

## Context

A single-page app on GitHub Pages has no rewrite rules. The usual workaround is
to copy `index.html` to `404.html`, so a deep link is served by the 404
handler.

## Decision

`HashRouter`. Every route is a fragment; the origin only ever sees the deploy
prefix.

## Consequences

- The `404.html` copy is served **as an HTTP 404**. Deep links appear to work
  while every direct entry is an error status — to monitoring, to a crawler, to
  anything reading status codes.
- It creates two code paths for one URL: online resolves through `404.html`,
  offline through the precached `index.html`. The offline path is the one that
  breaks, and it breaks only on a real device.
- With a fragment, the server is asked for exactly one path online and offline.
- **Cost:** uglier URLs, and fragments are not sent to the server, so
  server-side per-route anything is impossible. Neither matters here.
- **Cost:** moving to a host with rewrites means swapping `HashRouter` for
  `BrowserRouter` and adding a `basename`. Contained, but not free.

The deploy prefix has exactly one definition, `config/base-path.ts`, and in CI
it comes from `actions/configure-pages` rather than being hand-written — so
renaming the repository cannot silently rot it. A guard asserts every built
asset URL, precache entry, `start_url`, `scope` and `id` begins with it, and
the end-to-end suite serves the build under a prefix, never at the root.
