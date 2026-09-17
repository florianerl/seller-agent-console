# 7. Runtime validation with Zod, despite TypeScript

**Status:** Accepted

## Context

"Why validate at runtime when we have types?" TypeScript is erased at compile
time and `res.json()` is `any`. A type annotation on a response is an
assertion about a separately-versioned Python service, not a check.

Code generation from the agent's `openapi.json` was considered and rejected:
39 of its 44 GET responses carry an empty schema and `securitySchemes` is
`null`, so a generated client would type every route this console reads as
`unknown`, with no auth wiring.

## Decision

Narrow hand-written Zod schemas covering only the fields actually rendered,
`.loose()` throughout so upstream additions never fail, and `.catch()` on
non-critical fields.

## Consequences

- The `unavailable: "shape"` branch of ADR 5 *is* the runtime parse. Without
  it, a renamed field upstream crashes a page instead of degrading one card.
- `.loose()` means the agent can add fields freely. It does this often.
- **Cost:** schemas are hand-maintained and can drift from the agent. They
  have: shapes were read from a stale branch of the agent repository at one
  point, and the mistake was caught by testing against a running instance, not
  by any check in this repository.
- One schema is deliberately permissive: `/auth/api-keys` is called for its
  *status code*, not its body, so a shape change upstream must not turn "the
  key works" into "unavailable" and lock an operator out of setup.
