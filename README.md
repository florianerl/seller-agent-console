# Seller Agent Operator Console

A read-only, installable operator console for an [IAB Tech Lab seller
agent](https://github.com/IABTechLab/seller-agent). It is a static single-page
app: no server, no backend-for-frontend, no serverless function. The browser
talks to your agent's API directly.

Deployed to GitHub Pages from `main`.

---

## Security posture — read this before you paste a key

> The operator API key you paste into this console is a bearer credential with
> **full write authority** on your seller agent. Anyone holding it can mint and
> revoke API keys, transition orders, push deals to buyers, and rewrite your
> rate card. This console does not call those endpoints — but that is a choice
> this application makes, not a restriction the key carries.
>
> Storing it in IndexedDB is **not** more secure than localStorage. Both are
> readable by any script in this origin, any extension with host permissions,
> and anyone with the unlocked device's browser profile. A single XSS in this
> bundle or any dependency is a full compromise.
>
> Use a dedicated key, rotate it, revoke it when a device is lost. The durable
> fix is upstream: a read-only operator role and per-key origin scoping.
>
> **"Read-only" means this console issues no unsafe HTTP methods. It does not
> mean the server makes no writes.**

That last sentence is not hypothetical. Three of the agent's `GET` routes
modify storage when you read them:

| Route | What it writes | Called by this console? |
|---|---|---|
| `GET /api/v1/deals/{id}` | expires a `proposed` deal past `expires_at` | **No.** The deal list returns the same envelope, so there is nothing to re-fetch. A test asserts this route is never called. |
| `GET /api/v1/quotes/{id}` | marks an expired quote expired | No. |
| `GET /sessions` | expires stale sessions | **Yes**, the Negotiation screen. It says so on the screen. |
| `GET /approvals` | marks an expired pending gate `timed_out` | **Yes**, the Inbox screen. It says so on the screen. |
| any authenticated route | bumps the key's `last_used_at` and `use_count` | Yes — presenting a valid key is itself a write, on every request. |

### What "read-only" is enforced by

Three independent layers, because a convention is not an enforcement:

1. **Shape.** `src/api/http.ts` is the only module permitted to call `fetch`,
   and it exports one function, `get`. There is no `post`, no `request`, no
   method parameter.
2. **A guard.** `tests/guards/readonly.guard.test.ts` walks the TypeScript AST
   and fails if `fetch`, `XMLHttpRequest`, `sendBeacon`, `EventSource` or
   `WebSocket` appears anywhere outside that module.
3. **A trap.** Every unit test runs against MSW with `onUnhandledRequest:
   "error"` and a catch-all that records any non-`GET` and fails the run.

The guard has caught three real additions. It earns its place.

---

## Quick start

```bash
npm ci
npm run dev
```

Open the printed URL, then paste your agent's address and an operator key.

Mint a key on the agent host:

```bash
ad-seller create-operator-key --quiet
```

The console accepts an `https://` address, or `localhost` / `127.0.0.1` over
plain HTTP. Nothing else: the deployed console is served over HTTPS, so the
browser blocks plain-HTTP API calls as mixed content. There is no way around
this from the page, and the setup screen says so rather than showing a bare
"invalid URL".

### Buyer keys

A buyer key is allowed in and degrades rather than being refused. Screens that
need the operator role say which role they need; screens that do not keep
working. A rejected key (401) and an insufficient one (403) are reported
differently, because they send you to different places.

---

## Screens

| Screen | Reads | Notes |
|---|---|---|
| Setup and health | `/`, `/health`, `/auth/api-keys`, `/api/v1/inventory-sync/status`, `/events?limit=1` | One card per resource; each degrades on its own |
| Events | `/events`, `/events/{id}` | Operator-only. A tail, not a log — the API offers no cursor, so there is no way to page backwards |
| Orders | `/api/v1/orders`, `/{id}/history` | Transition timeline. The actor is shown as a label, not as attribution: the API records whatever the caller claimed and does not verify it |
| Deals | `/api/v1/deals`, `/{id}/performance`, `/{id}/lineage` | Operator-only, unpaginated, so it never polls. Delivery figures are **placeholders** upstream and are labelled as not measured |
| Inbox | `/approvals`, `/approvals/{id}` | A monitoring view — approving is a write, so it says so rather than implying a dead button. A decision's verified principal and its unverified free-text name are shown as separate fields |
| Negotiation | `/sessions`, `/sessions/{id}` | Discloses that listing writes, **and** that the upstream routes declare no authentication at all, so the list is not scoped to this key |
| Catalog | `/products`, `/api/v1/rate-card`, `/packages` | Packages are labelled "as seen by this key" — that route alone changes content by credential. A rate card the agent invented is flagged as not the publisher's pricing |
| Agents | `/registry/agents` | Trust status (this operator's decision) and registry verification (an external registry's claim) are separate columns |

### Freshness

No value renders without a timestamp, and no stale value renders looking fresh.

| State | Meaning | Presentation |
|---|---|---|
| `live` | last fetch succeeded | value with "as of …" |
| `stale` | last fetch failed, previous value exists | value retained, visibly aged |
| `blocked` | last result was 401/403 | **value cleared** — data the current key may no longer be entitled to see is not kept on screen |
| `empty` | nothing has ever succeeded | the reason, in words |

Two connectivity signals, deliberately not merged: `navigator.onLine === false`
is a hint (it is `true` behind a captive portal), and several resources failing
at once is the signal that actually correlates with the agent being down.

---

## Installing

The console is a real installable app: Chrome shows an install icon in the
omnibox, and there is an **Install** button in the app's own header for anyone
who does not notice it. Installed, it runs in `display: standalone` — its own
window, no address bar.

Three cases, because they need different things said:

- **Chrome, Edge, Android:** the button prompts for real. Declining hides it;
  the omnibox icon stays for anyone who changes their mind.
- **iOS:** no page can start an install there, so the button explains where the
  control is — Share, then Add to Home Screen. A button that silently did
  nothing would be worse than the sentence.
- **Already installed, viewed in a tab:** the button says so and points at the
  browser's own "Open in app". **No web API can launch an installed app from a
  page**, and pretending otherwise would be a control that does nothing.

The manifest ships `screenshots` so Chrome's desktop install dialog gets its
rich preview rather than the bare confirm. They are captured from the
end-to-end fixtures — never a real deployment — because an install dialog is
shown to whoever installs the app and must not carry someone's actual deals.
Regenerate with `npm run screenshots` after a visual change; never in CI.

## Offline and updates

The service worker precaches the app shell and registers your agent's origin as
`NetworkOnly`. API responses are **never** cached by the worker: a Workbox
cache key is the URL, so two operators with different entitlements would share
one entry for `GET /auth/api-keys`. Last-known values live in SWR's IndexedDB
cache in the page, keyed by credential *and* build, and are wiped on sign-out.

Updates are offered, never applied. An unprompted `skipWaiting()` swaps the
controlling worker under a running page that still holds the previous build's
chunk names; the next lazy route import 404s and the page goes blank, for
exactly the people who were mid-task.

**A ten-minute floor you cannot lower:** GitHub Pages serves everything with
`Cache-Control: max-age=600` and that is not configurable. "I deployed the fix"
and "operators have the fix" can be ten minutes apart. Nobody remembers this
during an incident, so it is written down here.

---

## Development

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | type-aware ESLint; warnings fail |
| `npm test` | unit and integration (Vitest, jsdom, MSW) |
| `npm run build` | production build |
| `npm run test:guards` | guards — these inspect `dist/`, so build first |
| `npm run test:e2e` | Playwright, against a real build under the real prefix |
| `npm run test:lighthouse` | performance budgets against a local preview |

CI runs all of it on every pull request. Unit tests run shuffled, so order
dependence surfaces there rather than intermittently.

### What the tests are actually for

- **Guards** assert properties of the built artifact: every URL under the
  deploy prefix, decoded PNG dimensions matching declared icon sizes, the
  contrast contract, no `fetch` outside the client, a bundle-size tripwire.
- **End-to-end** covers what jsdom structurally cannot: a real service worker,
  a real precache, a real reload, and a real path prefix. It serves `dist/`
  under `/seller-agent-console/`, **never at the origin root** — base-path bugs
  resolve correctly at `/` and only break under a prefix, which is exactly how
  they reach production unnoticed.
- **Lighthouse** asserts concrete metrics and audits. Not `categories:*`:
  those match nothing against Lighthouse 12 reports in the current LHCI, so
  an impossible `categories:performance` budget passes silently. Every
  assertion in `lighthouserc.cjs` was checked by making it fail on purpose.

Lighthouse 12 removed the PWA audits outright — `installable-manifest`,
`service-worker`, `maskable-icon`, `apple-touch-icon`. Installability is
asserted directly in `tests/e2e/installable.spec.ts` instead.

---

## Deployment

Pushing to `main` builds and publishes to GitHub Pages. `BASE_PATH` comes from
`actions/configure-pages`, not from a hand-written constant, so renaming the
repository cannot silently rot the prefix.

Routing is hash-based on purpose. Pages has no rewrite rules, and the
`404.html` trick serves deep links *as* an HTTP 404 while creating two code
paths for one URL — online through `404.html`, offline through the precached
`index.html` — where the offline path only breaks on a real device. Hash
routing means the origin only ever sees one path. The cost is uglier URLs.

---

## Running it next to the agent instead

The Pages deploy is not the only option: the app also builds into a container
that serves it at the origin root, which is how you would run it beside the
agent in `infra/docker/docker-compose.yml`. That buys real response headers and
control over `Cache-Control` — removing the ten-minute update floor Pages
imposes — at the cost of hosting it yourself. See
[docs/running-as-a-container.md](docs/running-as-a-container.md), which also
covers the three ways it can go wrong.

## Known limitations

1. **An operator key in a browser is an operator key in a browser.** No
   application design changes this. Until there is a read-only role upstream,
   this console is a convenience, not a containment boundary.
2. **`/events` has no cursor.** It is a recency window with no way to page
   backwards. The screen calls it a tail.
3. **`GET /api/v1/deals` is an unpaginated full scan.** It gets a 15-second
   timeout and never polls. On a large deployment it will eventually time out
   with no partial mode.
4. **The reported version is a hardcoded literal upstream** that has already
   drifted from the app's declared version. It is shown as "reported version",
   never as authoritative.
5. **CSP is a `<meta>` tag.** Pages sets no response headers, so
   `frame-ancestors` and reporting are unavailable — and a meta tag silently
   ignores them, so they are deliberately not declared rather than declared
   uselessly. Emotion forces `style-src 'unsafe-inline'`, a real and permanent
   weakening that follows from choosing MUI. This is defence-in-depth against
   an XSS in our own bundle, not a boundary against a careless operator.
6. **There are no analytics and cannot be.** No server, no access logs, no
   hook. Counting installs or sessions would mean sending data to a third
   party, which is what the no-external-hosts guard and `connect-src` exist to
   prevent. Adding analytics later means deliberately removing two safety
   rails.
7. **Initial load is ~195 kB gzipped**, mostly React and MUI. Above the 170 kB
   figure the design aimed at; kept deliberately, since the console is an
   internal tool on a desk rather than a landing page.

Design decisions and their reasoning are in [docs/adr](docs/adr).
