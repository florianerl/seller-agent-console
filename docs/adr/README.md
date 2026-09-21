# Architecture decision records

One file per decision that would otherwise be re-litigated. Each records the
context, what was chosen, and — most usefully — what it costs.

An ADR is not updated when the decision is revisited. A new one supersedes it,
and the old one stays, because the reasoning that turned out to be wrong is the
part worth reading.

| # | Decision | Status |
|---|---|---|
| [0001](0001-standalone-pwa.md) | Ship as a standalone PWA rather than inside the agent | Accepted |
| [0002](0002-static-only-no-bff.md) | Static only — no server, no BFF | Accepted |
| [0003](0003-hash-routing.md) | Hash routing on GitHub Pages | Accepted |
| [0004](0004-read-only-by-construction.md) | Read-only enforced by module shape, not convention | Superseded by 0011 |
| [0005](0005-result-taxonomy.md) | A result union the client never throws | Accepted |
| [0006](0006-swr-over-tanstack.md) | SWR rather than TanStack Query | Accepted |
| [0007](0007-zod-despite-typescript.md) | Runtime validation with Zod despite TypeScript | Accepted |
| [0008](0008-no-api-caching-in-sw.md) | The service worker never caches API responses | Accepted |
| [0009](0009-prompted-updates.md) | Updates are prompted, never automatic | Accepted |
| [0010](0010-no-analytics.md) | No analytics, and none planned | Accepted |
| [0011](0011-writes-permitted.md) | Writes are permitted; the seam takes a method | Accepted |
| [0012](0012-writes-behind-a-runtime-switch.md) | Writes are gated by a runtime switch | Accepted |
| [0013](0013-drift-guards-over-codegen.md) | Guard against API drift rather than generate a client | Accepted |
