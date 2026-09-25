# 14. OpenProposal 3.0 against a provisional, detected contract

**Status:** Accepted. Provisional by design; see the exit criteria.

## Context

IAB Tech Lab announced AAMP 3.0 with OpenProposal on 2026-09-22. OpenProposal
is the object a seller manages from brief to binding terms: a proposal holding
self-contained line items, each field carrying a mutability marker that says
which party may change it and whether that needs the other's assent.

Three facts shape what the console can do with it today:

- **The spec is a draft.** `spec/openproposal-3.0.md` (`3.0-draft-1`, OpenProposal
  commit `cd63a32`) is open for comment until 2026-10-22 and says it must not be
  treated as a standard. Seven open questions could still change its shape;
  OQ-1 (whether mutability belongs in the object) and OQ-2 (whether
  `catalog_ref` stays) would change the wire format outright.
- **It defines no transport.** No endpoints, no discovery, and deliberately no
  JSON Schema yet — `schema/README.md` withholds one so as not to freeze what
  the comment period exists to decide.
- **Upstream serves none of it.** The seller agent's `/proposals` routes are the
  pre-3.0 submit-and-counter flow. Its agent card advertises
  `capabilities.protocols: ["opendirect21"]`.

Waiting for all three to resolve would mean building nothing until well after
the comment period. Building against a guessed contract unconditionally would
mean a console that calls routes a 2.x agent does not have.

## Decision

Build against a provisional contract, and switch it on only when the agent
says it speaks the protocol.

**Detection.** `openproposal-3.0` in the agent card's `capabilities.protocols`
(`src/api/capabilities.ts`). Anything else — including a card that failed to
load — sends no `/api/v3` request at all. This is the backwards-compatibility
contract: against today's agent the console behaves exactly as before, and a
screen test asserts that on recorded wire traffic rather than on rendering.

**Contract**, proposed to upstream rather than agreed with it:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v3/proposals` | Summary Representation list (§2.1), `status`, `type`, `limit`, `offset` |
| GET | `/api/v3/proposals/{proposal_id}` | Full Representation, catalog refs resolved |
| POST | `/api/v3/proposals/{id}/publish` | draft → published |
| POST | `/api/v3/proposals/{id}/withdraw` | → withdrawn |
| POST | `/api/v3/proposals/{id}/line-items/{li}/hold` | `{ action: grant \| release }` |
| POST | `/api/v3/proposals/{id}/assent` | `{ decision: accept \| decline }` on the version under review |

Every write carries `{ idempotency_key, expected_version }`; a stale version is
a 409. The `/api/v3` prefix keeps the new object clear of the legacy
`/proposals` routes, which stay untouched along with every screen that uses
them.

**Drift guard.** ADR 13's guard asserts the console calls only routes the
captured agent surface declares, which these cannot pass. They are listed in a
`PROVISIONAL` map with this ADR as the reason, and two assertions keep the list
honest: every entry must still be absent from the capture, and still be called.
The day upstream ships one, CI fails until the entry is removed and the real
route is checked like any other.

**Markers are quoted, not received.** The spec assigns mutability statically
(Appendix A), so the console carries its own copy pinned to `3.0-draft-1`
(`src/api/openproposal/fields.ts`) and says which revision it is quoting.

## Consequences

- **A guessed contract will be wrong somewhere.** Paths, the list envelope, the
  write bodies and the protocol token are all ours. Each lives in one place
  (`PATHS`, the constant, the schemas) so correcting it is local, but the first
  real agent will find mismatches. Detection limits the blast radius to agents
  that claim the protocol.
- **Schemas are hand-written against prose.** They follow the spec's own
  fallbacks — a `selectable` with no `available[]`, or a `settable` with no
  bounds, is `seller-set` — and parse line items one at a time, so a reshaped
  one degrades to a counted "could not be read" rather than blanking the
  proposal. That leniency is deliberate for a draft and would be worth
  tightening against a ratified schema.
- **The fixtures are the spec's examples**, converted once from YAML and pinned
  to a commit. A spec revision means replacing them and expecting failures.
- **A seller-side assent is a binding act.** The console can now make a
  proposal version binding on the operator's click. It is behind the write
  switch (ADR 12) and a confirmation that names what becomes binding, which is
  the same protection every other write has and no more.

## Exit criteria

This decision is revisited — by a new ADR, not an edit — when any of these
happens:

- upstream ships any of the routes (the guard forces it);
- the spec publishes a JSON Schema or a revision that changes OQ-1 or OQ-2;
- the spec, or upstream, defines a discovery mechanism other than the card.
