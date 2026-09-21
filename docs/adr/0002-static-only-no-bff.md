# 2. Static only — no server, no backend-for-frontend

**Status:** Accepted

## Context

A backend-for-frontend would solve real problems: it could hold the operator
key server-side, present a session cookie to the browser, enforce read-only at
a boundary the client cannot cross, and give us access logs.

## Decision

No server of any kind. No BFF, no serverless function, no container. The
browser holds the credential and calls the agent directly.

## Consequences

- Nothing to operate, patch, or pay for. The deployment is a directory of
  files.
- **Cost, and it is the big one:** the operator key lives in the browser. A BFF
  is the only design that fixes this, and we chose not to have one. The README
  says so plainly rather than implying that IndexedDB is a safeguard.
- **Cost:** whatever limits the console observes are enforced by the client
  alone. That was read-only (ADR 4); it is now a write switch (ADR 11, ADR 12),
  and the point is unchanged and now sharper — a compromised page can do
  anything the key permits. The layers exist to stop *us* from regressing, not
  to stop an attacker.
- **Cost:** no analytics, ever, without reversing this (ADR 10).
- **Cost:** no real CSP. GitHub Pages sets no response headers, so only a
  `<meta>` tag is available, which cannot express `frame-ancestors` or
  reporting.

If a server ever appears for another reason, revisit all four.
