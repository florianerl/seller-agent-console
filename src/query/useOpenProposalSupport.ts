import { openProposalSupport, probeOpenProposal, type Support } from "../api/capabilities";
import type { FieldMap } from "../api/endpoints";
import { CADENCE } from "./cadence";
import { useResource, type ResourceHandle } from "./useResource";

/**
 * One resource for the probe and the field map it returns, so the screen's
 * field-map table and every support check share a single request.
 */
export function useOpenProposalSupport(): { support: Support; probe: ResourceHandle<FieldMap | null> } {
  const probe = useResource("op-field-map", probeOpenProposal, { refreshInterval: CADENCE.opFieldMap });
  return { support: openProposalSupport(probe.data), probe };
}
