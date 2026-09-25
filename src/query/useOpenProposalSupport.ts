import { agentCard, type AgentCard } from "../api/endpoints";
import { openProposalSupport, type Support } from "../api/capabilities";
import { CADENCE } from "./cadence";
import { useResource, type ResourceHandle } from "./useResource";

/**
 * Same resource name and cadence as the health card that already reads the
 * agent card, so SWR shares one entry and opening this screen costs no extra
 * request.
 */
export function useOpenProposalSupport(): { support: Support; card: ResourceHandle<AgentCard> } {
  const card = useResource("agent-card", agentCard, { refreshInterval: CADENCE.agentCard });
  return { support: openProposalSupport(card.data), card };
}
