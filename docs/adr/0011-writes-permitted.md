# 11. Writes are permitted; the seam takes a method

**Status:** Accepted. Supersedes [ADR 4](0004-read-only-by-construction.md).

## Context

ADR 4 made read-only a property of the client's shape: `src/api/http.ts`
exported `get` and nothing else, and three layers — the module's shape, an AST
guard, and an MSW trap that failed the run on any non-GET — kept it that way.

That decision was correct for a console that only read. It stops being correct
the moment the product needs to do anything, because there is no incremental
version of it: the enforcement is all-or-nothing by design, and you cannot add
one write without dismantling the layer that forbade all of them.

## Decision

`src/api/http.ts` exports `request`, which takes a `Method`, and keeps `get` as
a wrapper with the method fixed. Writes serialise their body as JSON and go
through the same timeout budgets, auth header, redirect policy and `Result<T>`
taxonomy as reads. A 204 or 205 parses `undefined` through the caller's schema
rather than being special-cased at the call site.

The enforcement layers change rather than all disappearing:

- The AST guard stays, with its purpose narrowed. `fetch` and friends remain
  confined to the seam — not to prevent writes, but so that one module owns
  timeouts, auth, redirects and the error taxonomy.
- The seam-shape assertions are gone. There is nothing left for them to assert.
- The MSW trap no longer fails the run on a non-GET. It is a plain catch-all.

## Consequences

- **The containment argument in the README is gone, not weakened.** It used to
  say: this console issues no unsafe method, so a mistake in it cannot mint a
  key or rewrite a rate card. That sentence is no longer true, and the operator
  key it was written about still carries full write authority. What protected
  an operator was the absence of a function to call; nothing replaces that.
- **An XSS in this bundle is now a write primitive.** Before, an attacker with
  script in this origin had the key and could issue requests anyway — the
  constraint bound us, not them (ADR 4 said so). The change is to the blast
  radius of *our own* bugs: a careless call site can now mutate an operator's
  deals, and the type system will not object.
- **Every new mutation needs its own thought about idempotency, confirmation
  and what a partial failure leaves behind.** The read-only design meant none
  of that was ever a question. It is now a question per endpoint, and nothing
  in the client answers it generically.
- **`GET`-that-writes disclosures stay.** Three upstream routes mutate on read
  (see the README). Those surfaces still say so; that was never about our
  methods.
- **Cost carried over from ADR 4:** `redirect: "manual"` still turns a stray
  trailing slash into an indistinguishable outage, and a guard still asserts no
  path ends in a slash.

## What would have to be true to go back

A read-only operator role upstream, or per-key scoping, would make this
console's restraint enforceable where it belongs — on the credential rather
than in a bundle the operator's browser can be talked out of. ADR 4's closing
line is still the honest one: this constrains us, not an attacker.
