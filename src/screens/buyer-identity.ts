/**
 * Who a query is asked on behalf of. The agent prices by tier, and lifts a
 * buyer above `public` only for an identity it can verify, so these fields are
 * how an operator sees what a given buyer would be shown. Every one is
 * optional, and a blank one is left out of the request rather than sent empty.
 */
export type BuyerIdentity = {
  tier: string;
  agencyId: string;
  advertiserId: string;
  agentUrl: string;
};

export const NO_IDENTITY: BuyerIdentity = {
  tier: "",
  agencyId: "",
  advertiserId: "",
  agentUrl: "",
};

type Wire = {
  buyer_tier?: string;
  agency_id?: string;
  advertiser_id?: string;
  agent_url?: string;
};

/** The set fields, named as the routes take them. */
export function identityBody(
  identity: BuyerIdentity,
  routes: { advertiser?: boolean; agentUrl?: boolean },
): Wire {
  const out: Wire = {};
  if (identity.tier.trim()) out.buyer_tier = identity.tier.trim();
  if (identity.agencyId.trim()) out.agency_id = identity.agencyId.trim();
  if (routes.advertiser && identity.advertiserId.trim())
    out.advertiser_id = identity.advertiserId.trim();
  if (routes.agentUrl && identity.agentUrl.trim()) out.agent_url = identity.agentUrl.trim();
  return out;
}

/** What the identity fields said, for a result line: "tier agency · agency a-1", or nothing. */
export function identityLabel(wire: Wire): string {
  const parts = [
    wire.buyer_tier && `tier ${wire.buyer_tier}`,
    wire.agency_id && `agency ${wire.agency_id}`,
    wire.advertiser_id && `advertiser ${wire.advertiser_id}`,
    wire.agent_url && `agent ${wire.agent_url}`,
  ].filter(Boolean);
  return parts.join(" · ");
}
