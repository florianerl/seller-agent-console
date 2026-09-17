# 12. Writes are gated by a runtime switch

**Status:** Accepted. Extends [ADR 11](0011-writes-permitted.md).

## Context

ADR 11 opened the seam and was honest about what that cost: *"What protected an
operator was the absence of a function to call; nothing replaces that."* It left
the gap open deliberately, because there was nothing to gate yet — the endpoint
table was all reads.

The console is now growing the rest of the agent's API, which is 44 unsafe
operations including minting operator keys, rewriting the rate card and
transitioning orders. Every one of them will be reachable from a screen an
operator opened to *look* at something. The question ADR 11 deferred is now due.

What we are defending against is worth stating precisely, because it is easy to
claim more. Not an attacker: script running in this origin has the key and can
call the agent directly, switch or no switch, exactly as ADR 4 said. What is in
scope is our own bugs — a call site wired to the wrong id, an effect that fires
on render, a confirm dialog that does not — and an operator who opened the deals
screen to read it and clicked something.

## Decision

A single runtime flag, stored on the credential record, consulted at the seam.

- `src/api/policy.ts` holds the flag. It is a module store, not context: the
  seam must not import React.
- `request()` refuses any non-`GET` while the flag is off, returning
  `unavailable / "writes-disabled"` — a `Result` the callers already render
  (ADR 5) — and sends nothing. Not a preflight, not a timer.
- The flag lives on the `Credential` record, so it authorises *that key*:
  connecting a different one starts from off, and sign-out, which deletes the
  database, takes it with it. A record written before the field existed reads
  as off.
- Enabling it is a deliberate act with a confirmation that names the blast
  radius. Disabling needs no confirmation — the safe direction never should.
- The app bar carries a chip whenever writes are on. A mode you cannot see is a
  mode you forget you are in.

**Runtime, not a build flag.** A build-time define would be stronger — the write
paths would not ship at all — but it moves the decision to whoever deploys, and
this console is deployed once and used by operators who need writes on Tuesday
and not on Wednesday. A flag they cannot reach is a flag that gets left on by
being built on.

**Five POSTs are exempt.** `/discovery`, `/pricing`, `/products/avails`,
`/media-kit/search` and `/agentic-audience/match` are queries the agent models
as POSTs because the input does not fit in a URL. They stay available with
writes off; withholding a read for the shape of its verb would be a rule
following its own letter. They are listed by exact path in `policy.ts`, each
with the sentence saying why, and a test asserts the list is exactly those five.

## Consequences

- **"Read-only" is now a judgement, not a mechanical property.** Before, the
  claim was checkable by reading one module. Now it is: no unsafe method leaves
  the browser *except five paths a human decided were queries*. That decision
  can be wrong, and if one of those endpoints grows a side effect upstream, the
  switch will not catch it. The exemption list is short and asserted so that
  extending it is visible; nothing makes it correct.
- **The guarantee is behavioural, so it is tested behaviourally.**
  `tests/unit/writes-policy.test.ts` sweeps every endpoint in the table with the
  switch off and asserts on the recorded wire traffic. It replaces what ADR 11
  removed, at a weaker but real strength: the old layer made a write unwritable,
  this one makes an unsent write observable.
- **One flag for everything is coarse.** An operator who wants to decide
  approvals must also enable key minting. Per-endpoint scoping belongs on the
  credential, upstream, not in a bundle the browser can be talked out of.
- **A mistake in the policy module un-gates everything at once.** That is the
  price of a single chokepoint, and the reason the check sits in the seam with
  a sweep test over the whole table rather than at call sites.
- **Nothing here binds an attacker.** ADR 4's closing line still holds, and
  ADR 11 repeated it. This is a guard rail on our own conduct.

## What would have to be true to go back

A read-only operator role upstream, or per-key scoping. Then restraint is
enforced where it belongs — on the credential — and this flag becomes a
convenience rather than the only thing standing between a render bug and an
operator's rate card.
