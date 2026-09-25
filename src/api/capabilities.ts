import type { AgentCard } from "./endpoints";

/**
 * The first place the console changes behaviour on what the agent says it
 * supports. Until OpenProposal, the card's `capabilities.protocols` was only
 * ever printed.
 *
 * The token is provisional (ADR 14): the spec defines no discovery mechanism,
 * and upstream advertises `["opendirect21"]` today. It is one constant so that
 * whatever upstream settles on is a one-line change here.
 */
export const OPENPROPOSAL_PROTOCOL = "openproposal-3.0";

/**
 * `unknown` is not `not-advertised`. A card that failed to load tells us
 * nothing, and the screen says so — but neither state issues a v3 request.
 * Failing closed is what keeps a 2.x agent from ever seeing `/api/v3`.
 */
export type Support = "supported" | "not-advertised" | "unknown";

export function openProposalSupport(card: AgentCard | undefined): Support {
  if (!card) return "unknown";
  return card.capabilities?.protocols.includes(OPENPROPOSAL_PROTOCOL) ? "supported" : "not-advertised";
}
