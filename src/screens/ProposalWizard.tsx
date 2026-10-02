import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { submitProposal } from "../api/endpoints";
import { describe } from "../api/errors";
import { LEGACY_DEAL_TYPES } from "../api/vocabulary";
import { EnumSelect } from "../components/EnumSelect";
import { TipField } from "../components/TipField";
import { ReviewList, WizardDialog } from "../components/Wizard";
import { useCredential } from "../credentials/context";
import { useMutation } from "../query/useMutation";
import { palette } from "../theme/palette";
import { ProductPicker } from "./pickers";

const STEPS = ["Product", "Terms", "Buyer", "Review"] as const;

type Draft = {
  productId: string;
  dealType: string;
  price: string;
  impressions: string;
  startDate: string;
  endDate: string;
  buyerId: string;
  agencyId: string;
  advertiserId: string;
  agentUrl: string;
};

// The legacy flow checks the deal type against the product's core DealType
// values (long form, no underscores); "preferred_deal" matched none of them.
const EMPTY: Draft = {
  productId: "",
  dealType: "preferreddeal",
  price: "",
  impressions: "",
  startDate: "",
  endDate: "",
  buyerId: "",
  agencyId: "",
  advertiserId: "",
  agentUrl: "",
};

/**
 * Submitting a legacy proposal, one step per group of the agent's
 * `ProposalRequest`: what, on what terms, for whom, then a review that names
 * the consequence. Every field of the request is offered; the four buyer
 * fields are optional and left off the wire when blank rather than sent empty.
 * The review is the confirmation, as in the other wizards.
 */
export function ProposalWizard({
  open,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  /** Called with the new proposal's id, when the ack carries one. */
  onSubmitted: (proposalId: string | undefined) => void;
}) {
  const { writesEnabled } = useCredential();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const set = (key: keyof Draft) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = useMutation<Parameters<typeof submitProposal>[1], unknown>((c, a) =>
    submitProposal(c, a),
  );

  const productId = draft.productId.trim();
  const price = Number(draft.price);
  const impressions = Number(draft.impressions);
  const productOk = productId !== "" && draft.dealType !== "";
  const termsOk =
    draft.price.trim() !== "" &&
    Number.isFinite(price) &&
    price > 0 &&
    Number.isInteger(impressions) &&
    impressions > 0 &&
    draft.startDate !== "" &&
    draft.endDate !== "" &&
    draft.startDate <= draft.endDate;
  const ready = productOk && termsOk;
  const done = submit.last?.kind === "ok";

  const optional = {
    buyer_id: draft.buyerId.trim(),
    agency_id: draft.agencyId.trim(),
    advertiser_id: draft.advertiserId.trim(),
    agent_url: draft.agentUrl.trim(),
  };

  async function finish() {
    const result = await submit.run({
      product_id: productId,
      deal_type: draft.dealType,
      price,
      impressions,
      start_date: draft.startDate,
      end_date: draft.endDate,
      ...Object.fromEntries(Object.entries(optional).filter(([, v]) => v !== "")),
    });
    if (result.kind !== "ok") return;
    // The ack is loose; no list of legacy proposals exists to find the id again.
    const ack = result.data as { proposal_id?: unknown; id?: unknown };
    const id = ack.proposal_id ?? ack.id;
    onSubmitted(typeof id === "string" ? id : undefined);
  }

  function close() {
    if (submit.pending) return;
    onClose();
    // Reset after the dialog has gone, so it does not flash back to step one.
    setTimeout(() => {
      setStep(0);
      setDraft(EMPTY);
      submit.reset();
    }, 200);
  }

  const canNext = step === 0 ? productOk : step === 1 ? termsOk : true;

  return (
    <WizardDialog
      open={open}
      title="Submit a proposal"
      steps={STEPS}
      step={step}
      onStep={setStep}
      onClose={close}
      canNext={canNext}
      finishLabel="Submit proposal"
      pendingLabel="Submitting…"
      onFinish={() => void finish()}
      canFinish={writesEnabled && ready}
      pending={submit.pending}
      done={done}
      block="proposal-wizard"
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        {step === 0 && (
          <>
            <ProductPicker value={draft.productId} onChange={set("productId")} />
            <EnumSelect
              hint="Legacy deal type the proposal is checked against; the agent rejects values it does not recognise."
              label="Deal type"
              value={draft.dealType}
              options={LEGACY_DEAL_TYPES}
              onChange={(v) => v && set("dealType")(v)}
            />
          </>
        )}
        {step === 1 && (
          <>
            <TipField
              hint="Your price as a plain number in dollars, for example 10."
              size="small"
              label="Price"
              value={draft.price}
              onChange={(e) => set("price")(e.target.value)}
              error={draft.price.trim() !== "" && !(price > 0)}
              fullWidth
            />
            <TipField
              hint="Impressions to buy, a whole number."
              size="small"
              type="number"
              label="Impressions"
              value={draft.impressions}
              onChange={(e) => set("impressions")(e.target.value)}
              error={draft.impressions.trim() !== "" && !(Number.isInteger(impressions) && impressions > 0)}
              fullWidth
            />
            {/* The hint wrapper is an inline-block span; let each date take half the row. */}
            <Box sx={{ display: "flex", gap: 2, "& > span": { flex: 1 } }}>
              <TipField
                hint="First day of the flight."
                size="small"
                type="date"
                label="Start date"
                slotProps={{ inputLabel: { shrink: true } }}
                value={draft.startDate}
                onChange={(e) => set("startDate")(e.target.value)}
                fullWidth
              />
              <TipField
                hint="Last day of the flight, on or after the start."
                size="small"
                type="date"
                label="End date"
                slotProps={{ inputLabel: { shrink: true } }}
                value={draft.endDate}
                onChange={(e) => set("endDate")(e.target.value)}
                error={draft.endDate !== "" && draft.startDate > draft.endDate}
                fullWidth
              />
            </Box>
          </>
        )}
        {step === 2 && (
          <>
            <Typography variant="body2" color="text.secondary">
              All optional. Who the proposal is for can change the tier the agent prices at.
            </Typography>
            <TipField hint="Buyer seat or account id." size="small" label="Buyer id (optional)" value={draft.buyerId} onChange={(e) => set("buyerId")(e.target.value)} fullWidth />
            <TipField hint="The agency buying on the advertiser's behalf." size="small" label="Agency id (optional)" value={draft.agencyId} onChange={(e) => set("agencyId")(e.target.value)} fullWidth />
            <TipField hint="The advertiser the campaign is for." size="small" label="Advertiser id (optional)" value={draft.advertiserId} onChange={(e) => set("advertiserId")(e.target.value)} fullWidth />
            <TipField hint="URL of the buyer agent making the proposal." size="small" label="Agent URL (optional)" value={draft.agentUrl} onChange={(e) => set("agentUrl")(e.target.value)} fullWidth />
          </>
        )}
        {step === 3 && (
          <Box>
            <ReviewList
              rows={[
                ["Product", productId],
                ["Deal type", LEGACY_DEAL_TYPES.find((o) => o.value === draft.dealType)?.label ?? draft.dealType],
                ["Price", `$${draft.price.trim()}`],
                ["Impressions", impressions.toLocaleString()],
                ["Flight", `${draft.startDate} to ${draft.endDate}`],
                ["Buyer id", optional.buyer_id || "—"],
                ["Agency id", optional.agency_id || "—"],
                ["Advertiser id", optional.advertiser_id || "—"],
                ["Agent URL", optional.agent_url || "—"],
              ]}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Submits the proposal for review. Not idempotent: a retry after an unclear failure may
              create a second proposal.
            </Typography>
            {!writesEnabled && (
              <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
                Writes are switched off for this key. Turn them on from the connection menu to submit.
              </Alert>
            )}
            {submit.last && submit.last.kind !== "ok" && (
              <Typography variant="body2" sx={{ mt: 2, color: palette.error }} data-state="write-failed">
                {describe(submit.last)}
              </Typography>
            )}
            {done && (
              <Alert severity="success" variant="outlined" sx={{ mt: 2 }} data-state="write-ok">
                The agent accepted the proposal. Its id is filled in on the Negotiation screen if the
                reply carried one.
              </Alert>
            )}
          </Box>
        )}
      </Box>
    </WizardDialog>
  );
}
