import { opFieldMap, type FieldMap } from "./endpoints";
import type { Result } from "./errors";
import type { Connection } from "./http";

/**
 * Whether this agent serves OpenProposal, asked of the agent rather than of
 * its card.
 *
 * The card was the first plan (ADR 14) and upstream never adopted it: the
 * branch that serves OpenProposal still advertises `["opendirect21"]`. So the
 * console asks the cheapest route it would use anyway — the static field map,
 * an unauthenticated GET that stores nothing — and reads a 404 as "not
 * served". The map that comes back is the same one the screen shows, so the
 * probe costs nothing on an agent that answers it.
 *
 * Against a 2.x agent this is the one OpenProposal request the console sends,
 * and it is a GET that changes nothing (ADR 15).
 */
export type Support = "supported" | "not-served" | "unknown";

/**
 * A 404 is an answer, not a failure, so it comes back `ok` with no map. Left
 * as `unavailable`, every 2.x agent would feed the shell's "can't reach the
 * agent" signal from a route it was never going to have.
 */
export async function probeOpenProposal(
  c: Connection,
  signal?: AbortSignal,
): Promise<Result<FieldMap | null>> {
  const result = await opFieldMap(c, signal);
  if (result.kind === "unavailable" && result.reason === "http" && result.status === 404) {
    return { kind: "ok", data: null, fetchedAt: result.fetchedAt };
  }
  return result;
}

/**
 * Read from the last probe answer that arrived, not the latest attempt: an
 * agent that answered a minute ago and timed out now has not stopped serving
 * OpenProposal, and the screen shows that staleness on its own. `unknown` —
 * nothing has answered yet — is not `not-served`, and neither sends anything.
 */
export function openProposalSupport(lastAnswer: FieldMap | null | undefined): Support {
  if (lastAnswer === undefined) return "unknown";
  return lastAnswer === null ? "not-served" : "supported";
}
