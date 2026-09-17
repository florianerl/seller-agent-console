# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, installable (PWA) operator console for an IAB Tech Lab
seller agent. No server, no BFF, no serverless function — the browser talks to
the operator's agent API directly, over an address and API key they enter at
setup. Deployed to GitHub Pages from `main` under the prefix `/seller-agent-console/`.

`README.md` is the operator-facing document (security posture, per-screen
routes, known limitations). `docs/adr/` records the decisions worth not
re-litigating; a revisited decision gets a *new* ADR rather than an edit.

## Commands

```bash
npm run dev            # Vite dev server
npm run typecheck      # tsc -b --noEmit
npm run lint           # type-aware ESLint; warnings fail (--max-warnings 0)
npm test               # Vitest unit/integration (jsdom + MSW)
npm run build          # production build → dist/
npm run test:guards    # guards; inspect dist/, so BUILD FIRST
npm run test:e2e       # Playwright against a real build under the real prefix
npm run test:lighthouse# LHCI budgets against a local preview
npm run screenshots    # regenerate manifest screenshots (never in CI)
```

Single test / single file:

```bash
npx vitest run --project unit tests/unit/http.test.ts -t "refuses a redirect"
```

Guards are a separate Vitest project (`--project guards`) and require `npm run
build` first — they assert properties of `dist/`, not of source. A single e2e
spec: `npx playwright test tests/e2e/offline.spec.ts`.

CI runs everything in this order: typecheck → lint → unit (with
`--sequence.shuffle`, so order dependence surfaces in CI) → build → guards →
e2e → Lighthouse. Don't set `BASE_PATH` locally when running guards; the
default in `config/base-path.ts` is what they assert against.

## Architecture

**The HTTP client.** `src/api/http.ts` is the only module that calls `fetch`,
and a guard keeps it that way — not to block writes (see below) but so that one
module owns timeouts, the auth header, the redirect policy and the error
taxonomy. It exports `request` (method, optional JSON body) and `get`, which is
`request` with the method fixed. Both take a `Connection` (base URL plus
optional API key), a path and a Zod schema, and resolve to a `Result<T>`.
Per-route-class timeouts live there as `TIMEOUTS`. Redirects are refused with
`redirect: "manual"` so a stray trailing slash reads as a redirect rather than
an outage; requests go out `credentials: "omit"`, `cache: "no-store"`. A 204/205
parses `undefined` through the caller's schema.

**Writes are permitted, and a runtime switch decides whether they go out.**
`src/api/policy.ts` holds one flag; `request()` refuses any non-`GET` while it
is off, returning `unavailable / "writes-disabled"` without sending anything.
The flag is stored on the `Credential` record (so it is per key, and sign-out
takes it), pushed into the policy module by `CredentialProvider`, toggled in
`ConnectionMenu` behind a confirmation, and shown as a chip in the app bar.
Five query-shaped POSTs are exempt by exact path — see `QUERY_SHAPED_PATHS`,
and ADR 12 for why that exemption makes "read-only" a judgement rather than a
checkable property. `tests/unit/writes-policy.test.ts` sweeps the whole endpoint
table with the switch off and asserts on recorded wire traffic; add a write
endpoint and it is that test, not a type, that will notice.

**Writes still need thought per endpoint; the switch does not supply it.** The console was
read-only by construction until [ADR 11](docs/adr/0011-writes-permitted.md)
lifted it: the seam had no write verb, an AST guard enforced that, and an MSW
trap failed any test run issuing a non-`GET`. The latter two are gone. The
operator key this app holds carries full write authority — minting keys,
transitioning orders, rewriting the rate card — so a mistaken call site is now a
real mutation. A write added in `src/api/endpoints/` needs its own answer on
confirmation, idempotency and what a partial failure leaves behind, because the
client answers none of that generically. Approvals (`decide` / `resume`) are the
first mutations; the table lives next to those calls.

**Results are values, never exceptions.** `src/api/errors.ts` defines
`Result<T>` = `ok` | `rejected` (401/403 only) | `unavailable` (timeout,
network, redirect, http, content-type, shape). Nothing in the client throws;
thrown errors stay reserved for genuine bugs in our own code. This is what lets
one changed upstream field degrade a single card instead of crashing a page.
Add new failure modes as `UnavailableReason` variants with a sentence in
`describe()`, not as thrown errors.

**Schemas.** `src/api/endpoints/index.ts` holds `PATHS` and narrow Zod schemas —
only fields the UI renders, `.loose()` throughout so upstream additions never
fail a parse. Paths never end in a slash (FastAPI answers a mismatch with a 307
which the client refuses to follow). `z.config({ jitless: true })` is set there
on purpose: Zod's `new Function` probe trips the CSP and pollutes the issues
panel on every load.

**The query layer** (`src/query/`) wraps SWR. `useResource` creates one cache
entry per resource — independent key, failure and timestamp — which is what
makes each card degrade on its own. Cache keys are prefixed with `credential.credId`
(a random UUID), never the API key, so the credential never reaches a cache key
or a serialised blob. `freshness.ts` derives `live | stale | blocked | empty`;
the `blocked` rule is a disclosure rule, not a staleness one — a 401/403 clears
the value rather than ageing it. Poll intervals live in `cadence.ts`, per
resource; `deals` is `0` (manual refresh only) because it is an unpaginated
full scan.

**Credentials** (`src/credentials/`) store one record in IndexedDB. The hand-written
`idb.ts` owns its connection because sign-out deletes the whole database and
`deleteDatabase` blocks while a connection is open. `clearCredential()` wipes
the database and all non-precache Cache Storage.

**PWA** (`src/pwa/`, `src/sw.ts`). `injectManifest` strategy, `registerType:
"prompt"`. Updates are *offered, never applied*: an unprompted `skipWaiting()`
swaps the worker under a running page whose lazy chunks then 404. The worker
precaches the shell and treats the agent origin as `NetworkOnly` — API
responses are never SW-cached, since a Workbox cache key is the URL and two
operators with different entitlements would share one entry.

**Base path.** `config/base-path.ts` is the single source of truth, build-time
only, fed from `actions/configure-pages` in CI. Runtime code reads
`import.meta.env.BASE_URL`. Routing is hash-based because Pages has no rewrite
rules.

**Screens.** `src/shell/screens.ts` is the one table defining which screens
exist; the sidebar and router are generated from it. Operator-only screens
render a `GatedNotice` for a buyer key rather than a bare 403 — the screen does
that itself; the `operatorOnly` flag in the table is currently descriptive and
nothing reads it.

**Theme.** `src/theme/palette.ts` exports `CONTRAST_CONTRACT`, and the contrast
guard walks it — editing the palette fails a test rather than shipping an
unreadable token.

## Conventions that carry weight here

- Comments in this codebase explain *why*, usually recording a decision or a
  trap someone already hit. Match that register; don't strip them, and add one
  when a choice is non-obvious.
- Every rendered value carries a timestamp and a freshness state. Never render
  a value without `asOf`, and never let a stale one look fresh.
- The UI states what the server does, including when a `GET` writes upstream
  (`/sessions`, `/approvals`) — see `WritesNotice`. Don't quietly drop those
  disclosures.
- Guards exist because a convention is not an enforcement. When a guard fails,
  fix the code; adding an allow-list entry needs a reason written down.
- No third-party origins, ever — no CDN fonts, no analytics, no telemetry. The
  no-external-hosts guard and `connect-src` both enforce it; ADR 0010 explains
  that adding analytics means deliberately removing two safety rails.
