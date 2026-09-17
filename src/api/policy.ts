/**
 * Whether this console may issue a state-changing request.
 *
 * ADR 11 opened the seam to writes and was explicit that nothing replaced what
 * the closed seam gave an operator: the protection had been the absence of a
 * function to call. This module is the replacement — one flag, consulted at the
 * one place that issues requests, off until an operator turns it on for the
 * credential they are connected with (ADR 12).
 *
 * It is a module store rather than context because the seam must not import
 * React: `src/api/http.ts` is reachable from tests, from the probe, and from
 * anywhere a component is not. The credential provider owns the value and
 * pushes it here, so the switch the operator sees and the switch the seam reads
 * are the same one.
 *
 * What this is not: a defence against an attacker. Whoever can run script in
 * this origin has the key and can call the agent directly, flag or no flag.
 * It bounds the damage of our own bugs and of a misclick.
 */

/**
 * Unsafe by method, safe by semantics: five POSTs the agent uses to answer a
 * query that does not fit in a URL. They stay available with writes off,
 * because refusing them would withhold reads for a reason that has nothing to
 * do with what they do.
 *
 * Exact paths, never prefixes — `/api/v1/deals` must not be reachable because
 * something matched a shorter string. Each entry needs the sentence saying why
 * it changes nothing, and a new entry needs a reviewer to agree with it.
 */
export const QUERY_SHAPED_PATHS: readonly string[] = [
  /** Returns products matching a brief. Reads the catalogue. */
  "/discovery",
  /** Prices a hypothetical line; the rate card is untouched. */
  "/pricing",
  /** Checks availability for a flight. Reserves nothing. */
  "/products/avails",
  /** Full-text search over the media kit. */
  "/media-kit/search",
  /** Scores an audience brief against segments. Stores no segment. */
  "/agentic-audience/match",
];

const queryShaped = new Set(QUERY_SHAPED_PATHS);

/**
 * True when `path` is one of the query-shaped POSTs. The path is compared as
 * written in `PATHS`, so a templated path is never a member — those all take an
 * id and none of them are queries.
 */
export function isQueryShaped(path: string): boolean {
  return queryShaped.has(path);
}

let enabled = false;

/** Off is the default, and stays the default after every sign-out. */
export function writesEnabled(): boolean {
  return enabled;
}

export function setWritesEnabled(on: boolean): void {
  enabled = on;
}

/** Test seam, and what sign-out calls so no state outlives a credential. */
export function resetWritePolicy(): void {
  enabled = false;
}
