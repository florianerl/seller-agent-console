# 10. No analytics, and none planned

**Status:** Accepted

## Context

The original brief mentioned wanting usage statistics.

## Decision

None. Not now, and nothing designed in anticipation.

## Consequences

- **Plainly: on GitHub Pages with no server there is zero analytics
  capability.** No access logs, no server hook, no surface. You cannot count
  installs, sessions, page views, error rates, or whether anyone has ever
  opened the app.
- Measuring anything means transmitting to a third party — which is exactly
  what the no-external-hosts guard and the `connect-src` policy exist to
  prevent. **Adding analytics later means deliberately removing two of your
  own safety rails**, and owing operators a privacy disclosure about commercial
  deal data.
- What *is* possible without a server: a local diagnostics ring buffer in
  IndexedDB ("14 refresh failures in the last hour") shown to the operator.
  That is diagnostics, not analytics — it tells the operator something and
  tells us nothing.

## If this is revisited

In rough order of cost: ask the operators (breaks down past ~20 users); local
diagnostics exported as JSON to paste into an issue (biased — you only hear
from people who bother); a `POST /telemetry` on the agent (no third party, but
breaks the no-mutating-requests invariant and siloes data per deployment);
self-hosted Plausible or Umami (you now run a server, which ADR 2 exists to
avoid); hosted cookieless analytics (a third-party origin in `connect-src` and
a CDN script breaking `script-src 'self'`).

Worth recording while the reasoning is fresh: moving off Pages to Cloudflare
Pages or Netlify would buy self-hosted-analytics-grade measurement *and* real
response headers — a genuine CSP instead of a meta tag, and control over
`Cache-Control` on `index.html` instead of the ten-minute floor in ADR 9. That
is the strongest argument for eventually leaving Pages.
