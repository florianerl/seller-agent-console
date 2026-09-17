# 9. Updates are prompted, never automatic

**Status:** Accepted

## Context

`registerType: "autoUpdate"` is one line and ships new builds silently.

## Decision

`registerType: "prompt"`. A new worker waits; a persistent snackbar offers
**Reload** or **Later**; `skipWaiting()` is sent only when the operator
chooses.

## Consequences

- An unprompted `skipWaiting()` swaps the controlling worker under a *running*
  page that still holds the previous build's module references. The next lazy
  route import requests a chunk the new precache does not have: 404, white
  screen, for exactly the operators who were mid-task.
- `clientsClaim()` **is** used, and is not the same thing. It only affects the
  first install, letting the initial worker control the already-open page so
  the first visit gets offline support. The two flags are routinely conflated.
- **This has gone wrong twice**, both times stranding an operator behind a
  prompt that did nothing:
  1. Reloading on every `controllerchange` also fired on the first-install
     claim, restarting the app during someone's first visit.
  2. Restricting it to pages already controlled at registration broke the case
     it was written for — on a first visit the worker claims the page *after*
     the effect runs, so the flag is false for the rest of that page's life.
     An operator offered an update an hour later clicked Reload and nothing
     happened.

  The deciding fact is not what the page looked like at registration. It is
  whether this page asked for the update.
- The second bug passed locally, because vite-plugin-pwa's own reload fires on
  a local Chromium. It does not fire on the Linux CI runner. **Only the
  end-to-end test on a different machine found it.**
- **Cost:** a ten-minute floor on propagation that cannot be lowered. GitHub
  Pages serves everything `max-age=600`. Mitigated with an hourly
  `registration.update()` and one on `visibilitychange`, not removed.
