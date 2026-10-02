import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { postNegotiationMessage } from "../api/endpoints";
import { describe } from "../api/errors";
import { NEGOTIATION_ACTIONS } from "../api/vocabulary";
import { EnumSelect } from "../components/EnumSelect";
import { TipField } from "../components/TipField";
import { ReviewList, WizardDialog } from "../components/Wizard";
import { useCredential } from "../credentials/context";
import { useMutation } from "../query/useMutation";
import { palette } from "../theme/palette";
import { QuotePicker } from "./pickers";

const STEPS = ["Action", "Context", "Buyer", "Review"] as const;

/** `BuyerIdentity`: every field the agent's model carries, all optional. */
const IDENTITY_FIELDS = [
  ["seat_id", "Seat id", "DSP seat identifier."],
  ["seat_name", "Seat name", "DSP platform display name."],
  ["dsp_platform", "DSP platform", "DSP platform slug, for example ttd or dv360."],
  ["agency_id", "Agency id", "The agency buying on the advertiser's behalf."],
  ["agency_name", "Agency name", "Display name of the agency."],
  ["agency_holding_company", "Agency holding company", "The holding company the agency belongs to."],
  ["advertiser_id", "Advertiser id", "The advertiser the campaign is for."],
  ["advertiser_name", "Advertiser name", "Display name of the advertiser."],
  ["advertiser_industry", "Advertiser industry", "Industry the advertiser operates in."],
  ["campaign_id", "Campaign id", "Optional campaign scope for campaign-specific deals."],
  ["campaign_name", "Campaign name", "Display name of the campaign."],
] as const;

type Draft = {
  action: string;
  price: string;
  currency: string;
  rationale: string;
  proposalId: string;
  negotiationId: string;
  quoteId: string;
  roundNumber: string;
  identity: Record<string, string>;
};

const blankDraft = (proposalId: string): Draft => ({
  action: "counter",
  price: "",
  currency: "USD",
  rationale: "",
  proposalId,
  negotiationId: "",
  quoteId: "",
  roundNumber: "",
  identity: {},
});

/**
 * One message on a negotiation, with every field of the agent's
 * `NegotiationMessage`: the action (counter, accept, reject, final_offer), a
 * price for the priced ones, the reference it answers (proposal, negotiation or
 * quote), the round it believes it is answering, a rationale and the buyer's
 * identity. Optional fields are left off the wire when blank.
 *
 * The idempotency key is minted when the wizard opens and kept until it
 * closes, so pressing Submit again after an unclear failure replays the same
 * message instead of spending another round.
 */
export function NegotiationMessageWizard({
  open,
  proposalId,
  onClose,
}: {
  open: boolean;
  /** Prefills the reference; the operator may clear it for a negotiation or quote id. */
  proposalId: string;
  onClose: () => void;
}) {
  const { writesEnabled } = useCredential();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => blankDraft(proposalId));
  const [key, setKey] = useState(() => crypto.randomUUID());
  const set = (field: keyof Omit<Draft, "identity">) => (value: string) =>
    setDraft((d) => ({ ...d, [field]: value }));

  const send = useMutation<Parameters<typeof postNegotiationMessage>[1], unknown>(
    (c, a) => postNegotiationMessage(c, a),
    { invalidates: (a) => (a.proposal_id ? [`negotiation:${a.proposal_id}`] : []) },
  );

  const priced = draft.action === "counter" || draft.action === "final_offer";
  const price = Number(draft.price);
  const round = Number(draft.roundNumber);
  const currency = draft.currency.trim().toUpperCase();
  const reference = [draft.proposalId, draft.negotiationId, draft.quoteId].some((v) => v.trim() !== "");
  const actionOk =
    draft.action !== "" &&
    (!priced ||
      (draft.price.trim() !== "" && Number.isFinite(price) && price > 0 && /^[A-Z]{3}$/.test(currency)));
  const contextOk =
    reference && (draft.roundNumber.trim() === "" || (Number.isInteger(round) && round >= 1));
  const ready = actionOk && contextOk;
  const done = send.last?.kind === "ok";

  const identity: Record<string, string> = {};
  for (const [k, v] of Object.entries(draft.identity)) {
    if (v.trim() !== "") identity[k] = v.trim();
  }

  const body = () => ({
    idempotency_key: key,
    action: draft.action,
    ...(draft.proposalId.trim() ? { proposal_id: draft.proposalId.trim() } : {}),
    ...(draft.negotiationId.trim() ? { negotiation_id: draft.negotiationId.trim() } : {}),
    ...(draft.quoteId.trim() ? { quote_id: draft.quoteId.trim() } : {}),
    ...(draft.roundNumber.trim() ? { round_number: round } : {}),
    ...(priced ? { buyer_price: { amount_micros: Math.round(price * 1_000_000), currency } } : {}),
    ...(Object.keys(identity).length > 0 ? { buyer_identity: identity } : {}),
    ...(draft.rationale.trim() ? { rationale: draft.rationale.trim() } : {}),
  });

  function close() {
    if (send.pending) return;
    onClose();
    // Reset after the dialog has gone, so it does not flash back to step one.
    setTimeout(() => {
      setStep(0);
      setDraft(blankDraft(proposalId));
      setKey(crypto.randomUUID());
      send.reset();
    }, 200);
  }

  const canNext = step === 0 ? actionOk : step === 1 ? contextOk : true;

  return (
    <WizardDialog
      open={open}
      title="Respond to a proposal"
      steps={STEPS}
      step={step}
      onStep={setStep}
      onClose={close}
      canNext={canNext}
      finishLabel="Send"
      pendingLabel="Sending…"
      onFinish={() => void send.run(body())}
      canFinish={writesEnabled && ready}
      pending={send.pending}
      done={done}
      block="negotiation-message-wizard"
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        {step === 0 && (
          <>
            <EnumSelect
              hint="What this message does in the negotiation. Counter and final offer carry a price; accept and reject close the round."
              label="Action"
              value={draft.action}
              options={NEGOTIATION_ACTIONS}
              onChange={(v) => v && set("action")(v)}
            />
            {priced && (
              <Box sx={{ display: "flex", gap: 2, "& > span:first-of-type": { flex: 1 } }}>
                <TipField
                  hint="Your price as a plain number in currency units, for example 10. Sent to the agent as micros (times 1,000,000)."
                  size="small"
                  label="Price"
                  value={draft.price}
                  onChange={(e) => set("price")(e.target.value)}
                  error={draft.price.trim() !== "" && !(price > 0)}
                  fullWidth
                />
                <TipField
                  hint="ISO 4217 code, three capital letters."
                  size="small"
                  label="Currency"
                  value={draft.currency}
                  onChange={(e) => set("currency")(e.target.value)}
                  error={!/^[A-Z]{3}$/.test(currency)}
                  sx={{ width: 110 }}
                />
              </Box>
            )}
            <TipField
              hint="Optional human-readable reason, shown in the negotiation history."
              size="small"
              label="Rationale (optional)"
              value={draft.rationale}
              onChange={(e) => set("rationale")(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
          </>
        )}
        {step === 1 && (
          <>
            <Typography variant="body2" color="text.secondary">
              What this message answers. Give at least one.
            </Typography>
            <TipField hint="The proposal being negotiated." size="small" label="Proposal id" value={draft.proposalId} onChange={(e) => set("proposalId")(e.target.value)} fullWidth />
            <TipField hint="An existing negotiation, if you have its id." size="small" label="Negotiation id (optional)" value={draft.negotiationId} onChange={(e) => set("negotiationId")(e.target.value)} fullWidth />
            <QuotePicker
              label="Quote id (optional)"
              value={draft.quoteId}
              onChange={set("quoteId")}
              hint="The quote being negotiated, if any. Pick one you made here, or paste its id."
              sx={{ width: "100%" }}
            />
            <TipField
              hint="The round you believe you are answering, for optimistic concurrency. A mismatch is refused as contention; the seller's numbering is authoritative."
              size="small"
              type="number"
              label="Round number (optional)"
              value={draft.roundNumber}
              onChange={(e) => set("roundNumber")(e.target.value)}
              error={draft.roundNumber.trim() !== "" && !(Number.isInteger(round) && round >= 1)}
              fullWidth
            />
          </>
        )}
        {step === 2 && (
          <>
            <Typography variant="body2" color="text.secondary">
              All optional. The agent derives a pricing tier from these, capped by what its registry can verify.
            </Typography>
            {IDENTITY_FIELDS.map(([field, label, hint]) => (
              <TipField
                key={field}
                hint={hint}
                size="small"
                label={`${label} (optional)`}
                value={draft.identity[field] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, identity: { ...d.identity, [field]: e.target.value } }))}
                fullWidth
              />
            ))}
          </>
        )}
        {step === 3 && (
          <Box>
            <ReviewList
              rows={[
                ["Action", NEGOTIATION_ACTIONS.find((o) => o.value === draft.action)?.label ?? draft.action],
                ["Price", priced ? `${draft.price.trim()} ${currency}` : "—"],
                ["Rationale", draft.rationale.trim() || "—"],
                ["Proposal id", draft.proposalId.trim() || "—"],
                ["Negotiation id", draft.negotiationId.trim() || "—"],
                ["Quote id", draft.quoteId.trim() || "—"],
                ["Round number", draft.roundNumber.trim() || "—"],
                ...Object.entries(identity).map(([k, v]) => [`Buyer ${k}`, v] as const),
              ]}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Idempotent on its key: sending again after an unclear failure replays this message
              without spending another round. A different body under the same key is a 409.
            </Typography>
            {!writesEnabled && (
              <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
                Writes are switched off for this key. Turn them on from the connection menu to send.
              </Alert>
            )}
            {send.last && send.last.kind !== "ok" && (
              <Typography variant="body2" sx={{ mt: 2, color: palette.error }} data-state="write-failed">
                {describe(send.last)}
              </Typography>
            )}
            {done && (
              <Alert severity="success" variant="outlined" sx={{ mt: 2 }} data-state="write-ok">
                The agent accepted this message.
              </Alert>
            )}
          </Box>
        )}
      </Box>
    </WizardDialog>
  );
}
