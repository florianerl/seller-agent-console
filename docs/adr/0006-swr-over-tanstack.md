# 6. SWR rather than TanStack Query

**Status:** Accepted

## Context

The app does polled, read-only GETs. No mutations, no invalidation, no
optimistic updates — roughly ninety percent of TanStack Query's surface is
unused here.

## Decision

SWR.

## Consequences

- Smaller, and the per-key cache entry is exactly the per-card degradation unit
  the design needs.
- **The deciding detail:** SWR's default `isVisible` checks
  `document.visibilityState`. TanStack's `focusManager` keys on *window focus*,
  so a visible-but-unfocused tab — second monitor, split screen, which is how
  an operator console is actually used — stops polling and has to be
  hand-patched. A test pins the behaviour so a config change cannot regress it.
- **Cost:** SWR replaces `data` by reference on each poll, and `fetchedAt`
  changes every time, which would defeat the default deep-equality `compare`
  and re-render every table on every poll. A custom `compare` ignores the
  timestamp; the timestamp is tracked separately.
- **Cost:** no built-in devtools worth the name.

React Context is used only for the credential and shell state — read
everywhere, changed almost never. Server data deliberately does not live in
context: any context change re-renders every consumer, so one shared data
context would re-render all four cards on every poll of any resource.
