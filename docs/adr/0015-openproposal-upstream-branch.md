# 15. OpenProposal against the contract upstream actually built

**Status:** Accepted. Provisional until the upstream branch merges; supersedes
[ADR 14](0014-openproposal-provisional-contract.md).

## Context

ADR 14 built the Proposals screen against a contract the console proposed —
`/api/v3/proposals`, seller lifecycle writes (publish, withdraw, holds,
assent), and an `openproposal-3.0` token on the agent card — because neither
the spec nor the agent defined one. The screen was then hidden on 2026-10-01
until upstream served AAMP 3.0.

By 2026-11-16 two things had happened, and one had not:

- **The comment period closed** (2026-10-22) with no revision. The spec is
  still `3.0-draft-1`; its examples were anonymised and one rate corrected. No
  JSON Schema and no dispositions are published, and about forty change
  requests are open, several marked breaking.
- **Upstream built OpenProposal**, on the seller agent's
  `feat/openproposal-mapping` branch (e77022e, 2026-10-19). It is not merged
  and has no pull request. It looks nothing like ADR 14's guess:
  - four pure mapping routes — GAM line item, GAM line-item batch, GAM ad
    unit, many-to-one proposal — and a static field map, none of which store
    anything or need a key;
  - negotiation threads (`/api/v1/op-negotiations`): a buyer opens one on a
    line item with a requested rate, counters, accepts, declines or
    withdraws, and commits, which books a deal through the existing quote and
    deal flow. Every thread belongs to the key that opened it; there is no
    list, and another key's thread is a 404;
  - no stored proposals, no list, no seller lifecycle writes, and no change
    to the agent card, which still advertises `["opendirect21"]`.
- **Nothing of ADR 14's contract exists anywhere upstream.**

## Decision

Retarget the console to the branch, and drop ADR 14's contract entirely.

**Detection** probes `GET /api/v1/op-gam/line-item/field-map`. It is the
cheapest route the screen uses anyway, unauthenticated and pure, and the map it
returns is the one the screen shows. A 404 is folded into an `ok` answer of
"not served", so a 2.x agent does not feed the shell's "can't reach the agent"
signal from a route it never had. Any other failure is "unknown". Neither sends
anything else.

**The mapping routes are query-shaped.** They take a payload and return its
translation, store nothing and need no key, so they join `QUERY_SHAPED_PATHS`
and run with writes off. That list grows from five to nine; each entry carries
its sentence, as ADR 12 requires.

**Threads are driven, not watched.** Because a thread is visible only to the
key that opened it, an operator console cannot observe buyers' negotiations.
It can test its own agent the way the Negotiation screen already does for the
legacy flow: open a thread, move on it, commit. Each move is behind the write
switch and a confirmation; commit says it books a real deal. Every write keeps
one idempotency key across a retry whose outcome is unknown, since a timed-out
commit may have booked. Moves name the thread version, and the agent's
`stale_version`, `negotiation_closed` and `idempotency_conflict` refusals are
explained by code. The ids this browser has seen are kept per credential in
IndexedDB, as quote ids are, because the agent will not list them.

**The routes are PROVISIONAL in the drift guard**, for the reason ADR 14 gave
and with its two honesty checks: they are absent from the captured surface
(main, not the branch), and the day the branch merges and the capture is
refreshed, every entry must go.

**The screen stays hidden** (`hidden: true` in `src/shell/screens.ts`) until
the branch merges. It is reachable at `#/proposals` for testing against a
local agent running the branch.

## Consequences

- **Built against unmerged code.** The branch may change or be abandoned
  before it merges. The fixtures under `tests/fixtures/openproposal/agent/`
  are derived from its models and tests, not captured from a running agent;
  they agree with every value the branch's own tests assert and are
  otherwise plausible, not observed.
- **A probe on every visit.** Against a 2.x agent the screen sends one GET and
  gets a 404. ADR 14 sent nothing; this is the cost of upstream not putting
  the protocol on its card.
- **No proposal list, anywhere.** The proposal picker and the deal wizard no
  longer read one. The deal wizard's "From a proposal" route is now offered on
  every agent with a pasted id, by the same "not knowing is not none" rule the
  curator route follows, instead of only when a list held one — which no real
  agent ever did.
- **What the spec says and what the agent says are kept apart.** Mutability
  markers are still quoted from the spec revision; the source of each mapped
  value (`ad_server`, `inferred`, `not_available`…) is the agent's word, shown
  beside it, never merged into it.
- **Requested rate, rate in history, `ext`.** The branch carries values the
  spec has no field for in proposed extensions. The screen labels them as
  such rather than presenting them as OpenProposal 3.0.

## Exit criteria

Revisited — by a new ADR — when the branch merges (unhide the screen, refresh
the agent surface, empty PROVISIONAL, replace derived fixtures with captures),
when it is abandoned, or when the spec's post-comment revision or schema
changes a shape the screen reads.
