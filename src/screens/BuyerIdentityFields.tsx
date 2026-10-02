import { TipField } from "../components/TipField";
import type { BuyerIdentity } from "./buyer-identity";

export function BuyerIdentityFields({
  value,
  onChange,
  advertiser = false,
  agentUrl = false,
}: {
  value: BuyerIdentity;
  onChange: (value: BuyerIdentity) => void;
  /** Whether the route takes an advertiser id. */
  advertiser?: boolean;
  /** Whether the route takes the buyer agent's URL. */
  agentUrl?: boolean;
}) {
  const set = <K extends keyof BuyerIdentity>(key: K, next: string) =>
    onChange({ ...value, [key]: next });
  return (
    <>
      <TipField
        hint="Pricing tier to ask as. Blank means public. The agent caps the tier at what it can verify of the buyer, so a tier it cannot verify comes back as public."
        size="small"
        label="Buyer tier"
        placeholder="public"
        value={value.tier}
        onChange={(e) => set("tier", e.target.value)}
        sx={{ width: 140 }}
      />
      <TipField
        hint="The buyer's agency, as the agent's registry knows it. Optional."
        size="small"
        label="Agency id"
        value={value.agencyId}
        onChange={(e) => set("agencyId", e.target.value)}
        sx={{ width: 160 }}
      />
      {advertiser && (
        <TipField
          hint="The advertiser the buyer is working for, as the agent's registry knows it. Optional."
          size="small"
          label="Advertiser id"
          value={value.advertiserId}
          onChange={(e) => set("advertiserId", e.target.value)}
          sx={{ width: 160 }}
        />
      )}
      {agentUrl && (
        <TipField
          hint="URL of the buyer's agent, which the agent may use to verify the identity. Optional."
          size="small"
          label="Buyer agent URL"
          value={value.agentUrl}
          onChange={(e) => set("agentUrl", e.target.value)}
          sx={{ minWidth: 220 }}
        />
      )}
    </>
  );
}
