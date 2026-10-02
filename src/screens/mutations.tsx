import { useState, type ReactNode } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  applyChangeRequest,
  bulkDealOperations,
  closeSession,
  createBuyerApiKey,
  type BuyerKeyRequest,
  createChangeRequest,
  createOperatorApiKey,
  dealBuyerStatus,
  dealById,
  dealSspTroubleshoot,
  deprecateDeal,
  eventById,
  migrateDeal,
  negotiationStatus,
  reviewChangeRequest,
  sendSessionMessage,
  transitionOrder,
  triggerInventorySync,
  assentProposal,
  holdLineItem,
  publishProposal,
  withdrawProposal,
  type CreatedApiKey,
  type BulkDealResponse,
  type BuyerIdentityInput,
  type ChangeRequestAck,
  type ChangeRequestReviewInput,
  type LineItem,
  type Proposal,
} from "../api/endpoints";
import { describe, type Result } from "../api/errors";
import {
  RECORD_ONLY,
  actorClaim,
  isOrderStatus,
  nextSteps,
  predictSeverity,
  refuseChange,
  type NextStep,
  type OrderActor,
} from "../api/order-lifecycle";
import {
  ACTOR_KINDS,
  BULK_DEAL_ACTIONS,
  CHANGE_TYPES,
  words,
  type BulkDealAction,
} from "../api/vocabulary";
import { ConfirmAction } from "../components/ConfirmAction";
import { EnumSelect } from "../components/EnumSelect";
import { KeyValueFields } from "../components/KeyValueFields";
import { rowsToRecord, type KeyValueRow } from "../lib/key-values";
import { Hint } from "../components/Hint";
import { TipField } from "../components/TipField";
import { DealPicker, ProductPicker, ProposalPicker } from "./pickers";
import { ProposalWizard } from "./ProposalWizard";
import { NegotiationMessageWizard } from "./NegotiationMessageWizard";
import { SessionWizard } from "./SessionWizard";
import { Optional, SspNameField } from "./dealFields";
import { useBuyerIdentity, useListField } from "./dealHooks";
import { DistributeForm, PushForm } from "./DealSend";
import { ApiKeyTable } from "./ApiKeyTable";
import { JsonView } from "../components/JsonView";
import { FormFields, FormRow, ReadForm, WriteForm } from "../components/WriteForm";
import { WritesNotice } from "../components/WritesNotice";
import { useCredential } from "../credentials/context";
import { useMutation } from "../query/useMutation";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";

function newKey(): string {
  return crypto.randomUUID();
}

/**
 * One thing an operator can do, laid out like a settings row: what it is on the
 * left, its controls on the right. Stacked controls under a title read as a
 * wall of identical form rows; two columns lets the eye run down the titles
 * alone and only stop at the control it wants. It collapses to one column on a
 * narrow screen.
 */
function ActionBlock({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        // By the width of the card or panel it sits in, not of the page: the
        // same row is wide in a page-level panel and narrow in half a deal.
        gridTemplateColumns: "minmax(0, 1fr)",
        "@container (min-width: 560px)": {
          gridTemplateColumns: "minmax(180px, 240px) minmax(0, 1fr)",
        },
        columnGap: 4,
        rowGap: 1,
        alignItems: "start",
        py: 2,
        borderTop: `1px solid ${palette.line}`,
        "&:first-of-type": { borderTop: 0, pt: 0 },
        "&:last-of-type": { pb: 0 },
      }}
    >
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Typography variant="caption" component="p" color="text.secondary">
          {description}
        </Typography>
      </Box>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

// Bulk "create" is left out: it books a deal from a quote, which "Book from a
// quote" does with an idempotency key, and it is the one bulk action that takes
// no deal id, so it never fitted a form that acts on a deal.
const DEAL_EDIT_ACTIONS = BULK_DEAL_ACTIONS.filter((o) => o.value !== "create");

/**
 * What a read came back with: the value as highlighted JSON, or the reason
 * there is none. Shared so every lookup shows a result the same way.
 */
function ReadOutcome({
  name,
  data,
  result,
}: {
  name: string;
  data: unknown;
  result: Result<unknown> | undefined;
}) {
  if (data === undefined || data === null) {
    return (
      <Typography variant="caption" component="p">
        {result ? `${name}: ${describe(result)}` : ""}
      </Typography>
    );
  }
  return (
    <Box sx={{ mt: 1 }}>
      <Typography variant="caption" component="p" color="text.secondary" sx={{ mb: 0.5 }}>
        {name}
      </Typography>
      <JsonView value={data} />
    </Box>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 2.5, mb: 2.5, containerType: "inline-size" }}
      data-block="operator-writes"
    >
      <Typography variant="h3" sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

/**
 * The sync trigger lives on the Inventory sync card as one button; the dialog
 * is both the mode choice and the confirmation, so there is no second prompt
 * behind the first.
 */
export function InventorySyncWrite() {
  const { writesEnabled } = useCredential();
  const [open, setOpen] = useState(false);
  const [incremental, setIncremental] = useState(false);
  const run = useMutation<{ incremental: boolean }, unknown>(
    (c, args) => triggerInventorySync(c, args),
    { invalidates: ["inventory-sync", "inventory-watermark"] },
  );

  return (
    <Box data-block="write:trigger-sync">
      <Hint
        hint={
          writesEnabled
            ? undefined
            : "Writes are switched off. Turn them on from the connection menu to use this."
        }
      >
        <Button
          variant="outlined"
          size="small"
          data-action="trigger-sync"
          disabled={!writesEnabled || run.pending}
          onClick={() => setOpen(true)}
        >
          {run.pending ? "Working…" : "Sync now"}
        </Button>
      </Hint>
      {run.last && run.last.kind !== "ok" && (
        <Typography variant="body2" sx={{ mt: 1, color: palette.error }} data-state="write-failed">
          {describe(run.last)}
        </Typography>
      )}
      {run.last?.kind === "ok" && (
        <Typography variant="body2" sx={{ mt: 1 }} data-state="write-ok">
          The agent accepted this call.
        </Typography>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Trigger an inventory sync?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Each trigger starts another pass against the ad server. It is not
            idempotent: a retry after an unclear failure may run a second sync.
            Incremental uses the stored watermark when one exists.
          </Typography>
          <TipField
            hint="How much to sync. Full re-reads everything from the ad server; Incremental starts from the stored watermark when one exists."
            select
            size="small"
            label="Mode"
            value={incremental ? "incremental" : "full"}
            onChange={(e) => setIncremental(e.target.value === "incremental")}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="full">Full</MenuItem>
            <MenuItem value="incremental">Incremental</MenuItem>
          </TipField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            data-action="confirm-mutation"
            onClick={() => {
              setOpen(false);
              void run.run({ incremental });
            }}
          >
            Sync now
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/**
 * Key administration is rare and not a health signal, so it sits behind one
 * button on the Console access card. The dialog unmounts on close, which drops
 * the one-time secret from state — shown once, as the copy says.
 */
export function ApiKeysDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outlined" size="small" data-action="manage-keys" onClick={() => setOpen(true)}>
        API keys
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>API keys</DialogTitle>
        <DialogContent>
          <ApiKeyWrites />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

const BUYER_KEY_FIELDS = [
  ["seat_id", "Seat id", "The DSP seat this key acts for."],
  ["seat_name", "Seat name", "Display name of the DSP seat."],
  ["dsp_platform", "DSP platform", "DSP platform slug, for example ttd or dv360."],
  ["agency_id", "Agency id", "The agency buying on the advertiser's behalf."],
  ["agency_name", "Agency name", "Display name of the agency."],
  ["agency_holding_company", "Holding company", "The agency's holding company."],
  ["advertiser_id", "Advertiser id", "The advertiser the key buys for."],
  ["advertiser_name", "Advertiser name", "Display name of the advertiser."],
] as const;

export function ApiKeyWrites() {
  const { writesEnabled } = useCredential();
  const [label, setLabel] = useState("");
  const [expires, setExpires] = useState("");
  const [identity, setIdentity] = useState<Record<(typeof BUYER_KEY_FIELDS)[number][0], string>>({
    seat_id: "",
    seat_name: "",
    dsp_platform: "",
    agency_id: "",
    agency_name: "",
    agency_holding_company: "",
    advertiser_id: "",
    advertiser_name: "",
  });
  const [secret, setSecret] = useState<CreatedApiKey | undefined>();

  const buyer = useMutation<BuyerKeyRequest, CreatedApiKey>(
    (c, args) => createBuyerApiKey(c, args),
    { invalidates: ["api-keys"] },
  );
  const operator = useMutation<{ label?: string; expires_in_days?: number }, CreatedApiKey>(
    (c, args) => createOperatorApiKey(c, args),
    { invalidates: ["api-keys"] },
  );
  function showSecret(result: { kind: string; data?: CreatedApiKey }) {
    if (result.kind === "ok" && result.data) setSecret(result.data);
  }

  // Empty means "not sent": the agent applies its own default (no expiry).
  const days = expires.trim() === "" ? undefined : Number(expires);
  const daysInvalid = days !== undefined && (!Number.isInteger(days) || days < 1);
  const common = {
    ...(label.trim() ? { label: label.trim() } : {}),
    ...(days !== undefined && !daysInvalid ? { expires_in_days: days } : {}),
  };
  const buyerBody: BuyerKeyRequest = {
    ...common,
    ...Object.fromEntries(
      Object.entries(identity)
        .map(([k, v]) => [k, v.trim()] as const)
        .filter(([, v]) => v),
    ),
  };

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Creating a key returns the secret once. It is shown here and never
        stored in this console.
      </Typography>
      <FormRow>
        <TipField
          hint="Optional name for the new key (buyer or operator), so you can tell keys apart in the list. Leave empty for an unlabelled key."
          size="small"
          label="Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={!writesEnabled}
          sx={{ minWidth: 180 }}
        />
        <TipField
          hint="Days until the key expires, as a whole number. Leave empty for the agent's default."
          size="small"
          label="Expires in (days)"
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
          error={daysInvalid}
          disabled={!writesEnabled}
          sx={{ width: 150 }}
        />
        <WriteForm
          title="Mint a buyer API key?"
          confirmLabel="Create buyer key"
          action="create-buyer-key"
          blocked={!writesEnabled || daysInvalid}
          pending={buyer.pending}
          last={buyer.last}
          onConfirm={() => void buyer.run(buyerBody).then(showSecret)}
          consequence={
            <>
              Not idempotent: each call mints a new key. The secret is in this
              response only. A failure leaves a key that exists or does not —
              re-read the list before minting again.
            </>
          }
        />
        <WriteForm
          title="Mint an operator API key?"
          confirmLabel="Create operator key"
          action="create-operator-key"
          blocked={!writesEnabled || daysInvalid}
          pending={operator.pending}
          last={operator.last}
          onConfirm={() => void operator.run(common).then(showSecret)}
          consequence={
            <>
              Not idempotent. Some agents 409 if an extra operator key already
              exists. The secret is in this response only.
            </>
          }
        />
      </FormRow>
      <Accordion disableGutters variant="outlined" sx={{ "&:before": { display: "none" } }}>
        <AccordionSummary
          expandIcon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" focusable="false">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          }
        >
          <Typography variant="body2">Buyer identity (optional, buyer keys only)</Typography>
        </AccordionSummary>
        <AccordionDetails
          sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}
        >
          {BUYER_KEY_FIELDS.map(([name, fieldLabel, hint]) => (
            <TipField
              key={name}
              hint={hint}
              size="small"
              label={fieldLabel}
              value={identity[name]}
              onChange={(e) => setIdentity((cur) => ({ ...cur, [name]: e.target.value }))}
              disabled={!writesEnabled}
            />
          ))}
        </AccordionDetails>
      </Accordion>
      {secret?.api_key ? (
        <Box
          component="pre"
          data-block="one-time-secret"
          sx={{ p: 1.5, fontSize: 12, backgroundColor: palette.ground, overflow: "auto" }}
        >
          {`key_id ${secret.key_id}\nrole ${secret.role}\n${secret.api_key}`}
        </Box>
      ) : null}
      <ApiKeyTable />
    </Stack>
  );
}

/**
 * The legal next moves for one order, one button each. The move table is a
 * copy of upstream's (see order-lifecycle.ts), so a 409 means the order moved
 * under the operator or the table drifted; either way nothing was applied and
 * the order is re-read.
 */
export function OrderTransitionWrites({
  orderId,
  status,
  actor,
  onActorChange,
  onStale,
  accepted,
  onAccepted,
  adServer,
  adServerOrderIds = [],
}: {
  orderId: string;
  status: string;
  actor: OrderActor;
  onActorChange: (actor: OrderActor) => void;
  onStale: () => void;
  /** The last move the agent accepted here. Owned by the caller: see onAccepted. */
  accepted: string | undefined;
  /**
   * A successful move invalidates the order list, which empties it until the
   * re-read lands and unmounts this row with it. Anything said about the move
   * has to live above the table to still be on screen afterwards.
   */
  onAccepted: (to: string | undefined) => void;
  /**
   * What GAM showed for this order's deal, if someone checked. Quoted in the
   * confirmation of every record-only move, because that move is a claim
   * about the ad server and this is the only evidence the console has.
   */
  adServer?: string;
  /**
   * The GAM order ids that check found for this order's deal. A record-only
   * move stores them in the transition's metadata as `gam_order_id`, so the
   * timeline keeps the evidence the move was made on.
   */
  adServerOrderIds?: readonly string[];
}) {
  const { writesEnabled, credential, setActorName } = useCredential();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState<KeyValueRow[]>([]);
  const [chosen, setChosen] = useState<string | undefined>();
  const steps = nextSteps(status);
  const claim = actorClaim(actor);

  const transition = useMutation<
    { to_status: string; actor: string; reason?: string; metadata?: Record<string, unknown> },
    unknown
  >(
    (c, args) => transitionOrder(c, orderId, args),
    // The trailing `*` entry covers the row's filtered timeline reads too.
    { invalidates: ["orders:*", `order-audit:${orderId}`, `order-audit:${orderId}:*`, "orders-report", "orders-report:*"] },
  );

  if (steps.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" data-state="no-next-step">
        {isOrderStatus(status)
          ? "No further transitions from here."
          : `This console does not know the status "${words(status)}", so it offers no transition.`}
      </Typography>
    );
  }

  // Upstream gates this route on an operator key. A buyer key would only
  // ever collect a 403, so say that instead of offering the buttons.
  if (credential?.role === "buyer") {
    return (
      <Typography variant="body2" color="text.secondary" data-state="operator-only">
        Moving an order needs an operator key; this one is a buyer key.
      </Typography>
    );
  }

  const moved =
    transition.last?.kind === "unavailable" &&
    transition.last.reason === "http" &&
    transition.last.status === 409;
  // The 409 body names the moves that are legal now; the screen's own table
  // may be the thing that is out of date.
  const allowedNow = problemList(transition.last, "allowed_transitions");

  /** What the move stores as metadata: the GAM evidence for a record-only move, then anything typed. */
  const metadataFor = (to: string): Record<string, unknown> => ({
    ...(RECORD_ONLY.has(to) && adServerOrderIds.length > 0 ? { gam_order_id: adServerOrderIds.join(",") } : {}),
    ...rowsToRecord(details),
  });

  const go = (to: string) => {
    if (!claim) return;
    setChosen(to);
    // A new attempt supersedes whatever the last one said.
    onAccepted(undefined);
    const metadata = metadataFor(to);
    void transition
      .run({
        to_status: to,
        actor: claim,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      })
      .then((result) => {
        if (result.kind === "ok") {
          setReason("");
          setDetails([]);
          onAccepted(to);
        }
        if (result.kind === "unavailable" && result.reason === "http" && result.status === 409) {
          onStale();
        }
      });
  };

  const button = (step: NextStep) => (
    <WriteForm
      key={step.to}
      // One obvious move: the forward step is the filled button, and ways
      // off the path are quiet text, so the one a hurried operator hits is
      // never the one that cancels.
      variant={step.kind === "forward" ? "contained" : "text"}
      color={step.kind === "forward" ? "primary" : "inherit"}
      title={`${step.label}?`}
      confirmLabel={step.label}
      action={`transition-order:${step.to}`}
      blocked={!writesEnabled || !claim || (transition.pending && chosen !== step.to)}
      pending={transition.pending && chosen === step.to}
      // Success is reported below the buttons: the button that was pressed
      // is gone once the order has moved.
      last={chosen === step.to && !moved && transition.last?.kind !== "ok" ? transition.last : undefined}
      onConfirm={() => go(step.to)}
      consequence={
        <>
          Moves {orderId} from <strong>{words(status)}</strong> to{" "}
          <strong>{words(step.to)}</strong>, recorded as {claim ?? "?"}
          {reason.trim() ? <> with the reason &ldquo;{reason.trim()}&rdquo;</> : null}. The agent
          describes this move as &ldquo;{step.description}&rdquo;.
          {step.kind === "stop" && " It takes the order off its path."}
          {(step.to === "cancelled" || step.to === "completed") &&
            " This is terminal: no transition leads out of it."}
          {RECORD_ONLY.has(step.to) && (
            <>
              {" "}
              <strong>Nothing is sent to the ad server</strong>: the agent has no ad-server sync, so
              this only records the status on the order.{" "}
              {adServer ? `GAM, when checked: ${adServer}` : "The ad server has not been checked from here."}
            </>
          )}
          {Object.keys(metadataFor(step.to)).length > 0 && (
            <>
              {" "}
              It stores these details with the move:{" "}
              {Object.entries(metadataFor(step.to))
                .map(([k, v]) => `${k} = ${String(v)}`)
                .join(", ")}
              .
            </>
          )}{" "}
          Not idempotent: re-read the order before retrying after a timeout.
        </>
      }
    />
  );

  const forward = steps.filter((s) => s.kind === "forward");
  const other = steps.filter((s) => s.kind !== "forward");

  return (
    <Stack spacing={2} data-block="order-transitions">
      <FormRow>
        <EnumSelect
          hint="Who the move is recorded as: a person, an agent or the system. Not verified by the agent."
          label="Acting as"
          value={actor.kind}
          options={ACTOR_KINDS}
          onChange={(kind) => kind && onActorChange({ ...actor, kind })}
          disabled={!writesEnabled}
          sx={{ minWidth: 140 }}
        />
        {actor.kind !== "system" && (
          <TipField
            hint="Who the move is recorded as. The agent stores this as claimed and does not verify it."
            size="small"
            label={actor.kind === "human" ? "Your name or id" : "Agent id"}
            value={actor.id}
            onChange={(e) => onActorChange({ ...actor, id: e.target.value })}
            // Only a person's name is remembered: an agent id is a one-off
            // claim about someone else.
            onBlur={() => {
              if (actor.kind === "human") void setActorName(actor.id);
            }}
            disabled={!writesEnabled}
          />
        )}
        <TipField
          hint="Optional reason recorded with the move. The placeholder shows how the agent describes the first available step."
          size="small"
          label="Reason (optional)"
          placeholder={steps[0]?.description}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={!writesEnabled}
          sx={{ flex: "1 1 200px" }}
        />
      </FormRow>
      <KeyValueFields
        rows={details}
        onChange={setDetails}
        disabled={!writesEnabled}
        addLabel="Add a detail to the move"
        hint="A name for a detail stored with this move, such as ticket or gam_order_id. It shows on the timeline; the agent does not read it."
      />
      {/* Who and why come first so the buttons read as the last step; the
          fields' own hints say the agent verifies neither. */}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
        {forward.length > 0 && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap data-group="forward">
            {forward.map(button)}
          </Stack>
        )}
        {other.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap data-group="off-path">
            {other.map(button)}
          </Stack>
        )}
      </Stack>
      {writesEnabled && !claim && (
        <Typography variant="caption" color="text.secondary" data-note="actor">
          Enter {actor.kind === "human" ? "your name" : "the agent's id"} to enable these moves.
        </Typography>
      )}
      {accepted && (
        <Typography variant="body2" data-state="write-ok">
          The agent accepted the move to {words(accepted)}.
        </Typography>
      )}
      {moved && (
        <Typography variant="body2" sx={{ color: palette.warningText }} data-state="order-moved">
          The agent refused the move: the order is no longer in {words(status)}
          {allowedNow.length > 0 ? `, and from where it is now it allows ${allowedNow.map(words).join(", ")}` : ""}.
          Nothing was applied; the order has been re-read.
        </Typography>
      )}
    </Stack>
  );
}

export function DealWrites({
  dealId,
  group,
}: {
  dealId: string;
  /** Show one group of a deal's actions, for a tabbed panel. Omitted: all of them. */
  group?: "distribute" | "manage" | "danger";
}) {
  const show = (g: "distribute" | "manage" | "danger") => !group || group === g;
  const { writesEnabled } = useCredential();
  const id = dealId;
  const blocked = !writesEnabled;

  // Cancel or edit notes (the bulk route).
  const [bulkAction, setBulkAction] = useState<BulkDealAction>("cancel");
  const [bulkNotes, setBulkNotes] = useState("");
  const bulkBuyer = useBuyerIdentity();
  const bulk = useMutation<
    {
      operations: {
        action: BulkDealAction;
        deal_id?: string;
        quote_id?: string;
        notes?: string;
        buyer_identity?: BuyerIdentityInput;
      }[];
    },
    BulkDealResponse
  >((c, a) => bulkDealOperations(c, a), { invalidates: ["deals:*"] });

  // Replace with a new deal (migrate). Every term is optional: left out, the
  // agent carries the old deal's over, so these only say what should differ.
  const [reason, setReason] = useState("");
  const [mDealType, setMDealType] = useState("");
  const [mProduct, setMProduct] = useState("");
  const [mMaxCpm, setMMaxCpm] = useState("");
  const [mImpressions, setMImpressions] = useState("");
  const [mStart, setMStart] = useState("");
  const [mEnd, setMEnd] = useState("");
  const mSeats = useListField("Buyer seat ids", "Seat ids the new deal is restricted to, separated by commas.");
  const mBuyer = useBuyerIdentity();
  const migrate = useMutation<Parameters<typeof migrateDeal>[2], unknown>(
    (c, a) => migrateDeal(c, a.old_deal_id, a),
    { invalidates: ["deals:*", `deal-lineage:${id}`] },
  );
  const mCpm = Number(mMaxCpm);
  const mCpmOk = mMaxCpm.trim() === "" || (Number.isFinite(mCpm) && mCpm > 0);
  const mImp = Number(mImpressions);
  const mImpOk = mImpressions.trim() === "" || (Number.isInteger(mImp) && mImp > 0);
  const mDatesOk = (mStart === "" && mEnd === "") || (mStart !== "" && mEnd !== "" && mEnd >= mStart);

  // Deprecate.
  const [deprecateReason, setDeprecateReason] = useState("");
  const [replacement, setReplacement] = useState("");
  const deprecate = useMutation<{ id: string; reason: string; replacement_deal_id?: string }, unknown>(
    (c, a) =>
      deprecateDeal(c, a.id, {
        reason: a.reason,
        ...(a.replacement_deal_id ? { replacement_deal_id: a.replacement_deal_id } : {}),
      }),
    { invalidates: ["deals:*"] },
  );

  return (
    <Box>
      {show("distribute") && (
        <>
          <ActionBlock
            title="Notify buyers"
            description="Sends this deal to the buyer agents at the URLs below."
          >
            <PushForm dealId={id} />
          </ActionBlock>
          <ActionBlock
            title="Send to an SSP"
            description="Pushes this deal to one SSP connector. Leave the name empty to use the agent's default."
          >
            <DistributeForm dealId={id} />
          </ActionBlock>
        </>
      )}
      {show("manage") && (
        <ActionBlock
          title="Replace with a new deal"
          description="Creates a successor deal and links the two in this deal's lineage. Whatever you leave empty carries over from this deal."
        >
          <WriteForm
            title="Migrate this deal?"
            confirmLabel="Migrate"
            action="migrate-deal"
            blocked={blocked || !mCpmOk || !mImpOk || !mDatesOk}
            pending={migrate.pending}
            last={migrate.last}
            onConfirm={() =>
              void migrate.run({
                old_deal_id: id,
                ...(reason.trim() ? { reason: reason.trim() } : {}),
                ...(mDealType.trim() ? { deal_type: mDealType.trim() } : {}),
                ...(mProduct.trim() ? { product_id: mProduct.trim() } : {}),
                ...(mMaxCpm.trim() ? { max_cpm: mCpm } : {}),
                ...(mImpressions.trim() ? { impressions: mImp } : {}),
                ...(mStart ? { flight_start: mStart, flight_end: mEnd } : {}),
                ...(mSeats.value ? { buyer_seat_ids: mSeats.value } : {}),
                ...(mBuyer.value ? { buyer_identity: mBuyer.value } : {}),
              })
            }
            consequence="Mints a successor and records lineage. A retry may mint a second successor."
          >
            <TipField hint="Optional reason recorded with the migration." size="small" label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} disabled={blocked} />
          </WriteForm>
          <Box sx={{ mt: 1.5 }}>
            <Optional summary="Terms of the new deal (optional)">
              <ProductPicker value={mProduct} onChange={setMProduct} hint="Product for the new deal. Left empty, it keeps this deal's product." sx={{ width: "100%" }} />
              <TipField hint="Deal type for the new deal, for example PG, PD or PA. Left empty, it keeps this deal's." size="small" label="Deal type" value={mDealType} onChange={(e) => setMDealType(e.target.value)} fullWidth />
              <TipField hint="Ceiling in dollars for the new deal's CPM, a plain number." size="small" type="number" label="Max CPM" value={mMaxCpm} onChange={(e) => setMMaxCpm(e.target.value)} error={!mCpmOk} fullWidth />
              <TipField hint="Impressions for the new deal, a whole number above zero." size="small" type="number" label="Impressions" value={mImpressions} onChange={(e) => setMImpressions(e.target.value)} error={!mImpOk} fullWidth />
              <TipField hint="First day of the new flight. Give both dates or neither." size="small" type="date" label="Flight start" slotProps={{ inputLabel: { shrink: true } }} value={mStart} onChange={(e) => setMStart(e.target.value)} fullWidth />
              <TipField hint="Last day of the new flight, on or after the start." size="small" type="date" label="Flight end" slotProps={{ inputLabel: { shrink: true } }} value={mEnd} onChange={(e) => setMEnd(e.target.value)} error={!mDatesOk && mEnd !== ""} fullWidth />
              {mSeats.node}
              {mBuyer.node}
            </Optional>
          </Box>
        </ActionBlock>
      )}
      {show("danger") && (
        <>
          <ActionBlock
            title="Cancel or edit notes"
            description="Cancels this deal, or replaces its notes. Cancelling cannot be undone from this console."
          >
            <WriteForm
              title={`Run a bulk ${bulkAction}?`}
              confirmLabel={bulkAction === "cancel" ? "Cancel deal" : "Update notes"}
              action="bulk-deals"
              blocked={blocked}
              pending={bulk.pending}
              // Reported below instead: a 200 here can still carry failures.
              last={bulk.last?.kind === "ok" ? undefined : bulk.last}
              onConfirm={() =>
                void bulk.run({
                  operations: [
                    {
                      action: bulkAction,
                      deal_id: id,
                      ...(bulkNotes.trim() ? { notes: bulkNotes.trim() } : {}),
                      ...(bulkBuyer.value ? { buyer_identity: bulkBuyer.value } : {}),
                    },
                  ],
                })
              }
              consequence={
                bulkAction === "cancel"
                  ? "Sets the deal to cancelled, with the notes as the cancel reason. Nothing in this console reverses it."
                  : "Replaces the deal's notes and stamps updated_at. Partial success is possible in a batch: re-read the list rather than repeating it blindly."
              }
            >
              <FormFields>
                <EnumSelect
                  hint="Cancel ends the deal; update replaces its notes."
                  label="Action"
                  value={bulkAction}
                  options={DEAL_EDIT_ACTIONS}
                  onChange={(v) => v && setBulkAction(v)}
                  disabled={blocked}
                  sx={{ minWidth: 140 }}
                />
                <TipField hint="Optional notes. For update they replace the deal's notes; for cancel they become the cancel reason." size="small" label="Notes (optional)" value={bulkNotes} onChange={(e) => setBulkNotes(e.target.value)} disabled={blocked} />
              </FormFields>
            </WriteForm>
            <Box sx={{ mt: 1.5 }}>{bulkBuyer.node}</Box>
            {bulk.last?.kind === "ok" && (
              <Box sx={{ mt: 1 }} data-block="bulk-results">
                {bulk.last.data.results.map((r) => (
                  <Typography
                    key={r.index}
                    variant="body2"
                    sx={{ color: r.success ? undefined : palette.error }}
                    data-state={r.success ? "op-ok" : "op-failed"}
                  >
                    {r.action} {r.deal_id ?? ""}: {r.success ? "done" : r.error ?? "failed"}
                  </Typography>
                ))}
              </Box>
            )}
          </ActionBlock>
          <ActionBlock
            title="Deprecate"
            description="Marks this deal deprecated. A reason is required; name its replacement if there is one."
          >
            <WriteForm
              title="Deprecate this deal?"
              confirmLabel="Deprecate"
              action="deprecate-deal"
              blocked={blocked || !deprecateReason.trim()}
              pending={deprecate.pending}
              last={deprecate.last}
              onConfirm={() =>
                void deprecate.run({
                  id,
                  reason: deprecateReason.trim(),
                  ...(replacement.trim() ? { replacement_deal_id: replacement.trim() } : {}),
                })
              }
              consequence="Marks the deal deprecated. A second deprecate may 409 depending on status."
            >
              <FormFields>
                <TipField hint="Why the deal is being deprecated. Required; sent to the agent with the request." size="small" label="Reason" value={deprecateReason} onChange={(e) => setDeprecateReason(e.target.value)} disabled={blocked} />
                <DealPicker
                  label="Replacement deal (optional)"
                  value={replacement}
                  onChange={setReplacement}
                  disabled={blocked}
                  hint="The deal that takes this one's place, if there is one. Pick one or paste an id."
                />
              </FormFields>
            </WriteForm>
          </ActionBlock>
        </>
      )}
    </Box>
  );
}

/** Reads about one deal. Each is a GET; the first has a side effect worth a line. */
export function DealLookups({ dealId }: { dealId: string }) {
  const [loadRecord, setLoadRecord] = useState(false);

  return (
    <Box data-block="deal-lookups">
      <ActionBlock
        title="Full record"
        description="Reads this deal's stored record. The agent may expire a proposed deal when you read it."
      >
        {loadRecord && <WritesNotice what="GET /api/v1/deals/{id} runs a lazy expiry check and may persist the outcome." />}
        <WriteForm
          title="Fetch this deal record?"
          confirmLabel="Fetch deal"
          action="fetch-deal"
          blocked={false}
          pending={false}
          last={undefined}
          onConfirm={() => setLoadRecord(true)}
          consequence="This GET can expire a proposed deal and save that. Only fetch when you mean to."
        />
        {loadRecord && <DealRecord dealId={dealId} />}
      </ActionBlock>
      <ActionBlock title="Buyer's view" description="How a buyer agent currently sees this deal.">
        <BuyerStatus dealId={dealId} />
      </ActionBlock>
      <ActionBlock title="SSP diagnostics" description="Connector diagnostics for this deal at one SSP.">
        <SspTrouble dealId={dealId} />
      </ActionBlock>
    </Box>
  );
}

function DealRecord({ dealId }: { dealId: string }) {
  const record = useResource(`deal:${dealId}`, (c, signal) => dealById(c, dealId, signal));
  return (
    <Typography variant="body2">
      {record.data?.deal.status ?? (record.result ? describe(record.result) : "")}
    </Typography>
  );
}

function BuyerStatus({ dealId }: { dealId: string }) {
  const [buyerUrl, setBuyerUrl] = useState("https://buyer.example");
  const [submitted, setSubmitted] = useState<string | undefined>();
  return (
    <>
      <FormRow>
        <TipField hint="Full URL of the buyer agent whose view of this deal you want to read." size="small" label="Buyer URL" value={buyerUrl} onChange={(e) => setBuyerUrl(e.target.value)} />
        <ReadForm
          label="Buyer status"
          action="deal-buyer-status"
          disabled={!buyerUrl.trim()}
          onRun={() => setSubmitted(buyerUrl.trim())}
        />
      </FormRow>
      {submitted && <BuyerStatusBody dealId={dealId} buyerUrl={submitted} />}
    </>
  );
}

function BuyerStatusBody({ dealId, buyerUrl }: { dealId: string; buyerUrl: string }) {
  const buyer = useResource(`deal-buyer:${dealId}:${buyerUrl}`, (c, signal) =>
    dealBuyerStatus(c, dealId, buyerUrl, signal),
  );
  return (
    <ReadOutcome name="Buyer status" data={buyer.data} result={buyer.result} />
  );
}

function SspTrouble({ dealId }: { dealId: string }) {
  // Empty, not a guess: the old "gam" default is no SSP connector, so every
  // troubleshoot sent with it was a 400.
  const [ssp, setSsp] = useState("");
  const [submitted, setSubmitted] = useState<string | undefined>();
  return (
    <>
      <FormRow>
        <SspNameField label="SSP" hint="Name of the SSP connector to diagnose. Pick a known one or type another; an unknown name is a 400 that lists the configured ones." value={ssp} onChange={setSsp} />
        <ReadForm
          label="Troubleshoot"
          action="deal-ssp"
          disabled={!ssp.trim()}
          onRun={() => setSubmitted(ssp.trim())}
        />
      </FormRow>
      {submitted && <SspTroubleBody dealId={dealId} ssp={submitted} />}
    </>
  );
}

function SspTroubleBody({ dealId, ssp }: { dealId: string; ssp: string }) {
  const trouble = useResource(`deal-ssp:${dealId}:${ssp}`, (c, signal) =>
    dealSspTroubleshoot(c, dealId, ssp, signal),
  );
  return (
    <ReadOutcome name="SSP troubleshoot" data={trouble.data} result={trouble.result} />
  );
}

export function SessionWrites({ sessionId }: { sessionId: string }) {
  const { writesEnabled } = useCredential();
  const [message, setMessage] = useState("");
  const send = useMutation<{ id: string; message: string }, unknown>(
    (c, a) => sendSessionMessage(c, a.id, { message: a.message }),
    { invalidates: [`session:${sessionId}`, "sessions:*"] },
  );
  const sendMessage = async () => {
    const result = await send.run({ id: sessionId, message: message.trim() });
    if (result.kind === "ok") setMessage("");
  };
  const close = useMutation<{ id: string }, unknown>(
    (c, a) => closeSession(c, a.id),
    { invalidates: [`session:${sessionId}`, "sessions:*"] },
  );

  return (
    <Stack spacing={1}>
      {/* No confirmation: sending a chat turn is the whole point of the box,
          and a dialog per message makes a conversation unusable. The field
          is cleared only on success so a failed send can be retried. */}
      <ReadForm
        label={send.pending ? "Working…" : "Send"}
        action="session-message"
        disabled={!writesEnabled || !message.trim() || send.pending}
        onRun={() => void sendMessage()}
      >
        <TipField
          hint="Text sent to the session as the next turn. Required."
          size="small"
          label="Message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && writesEnabled && message.trim() && !send.pending) {
              e.preventDefault();
              void sendMessage();
            }
          }}
          disabled={!writesEnabled}
          sx={{ minWidth: 280 }}
        />
      </ReadForm>
      {send.last && send.last.kind !== "ok" && (
        <Typography variant="body2" sx={{ color: palette.error }} data-state="write-failed">
          {describe(send.last)}
        </Typography>
      )}
      <WriteForm
        title="Close this session?"
        confirmLabel="Close session"
        action="close-session"
        blocked={!writesEnabled}
        pending={close.pending}
        last={close.last}
        onConfirm={() => void close.run({ id: sessionId })}
        consequence="Marks the session closed. A second close may 409."
      />
    </Stack>
  );
}

export function CreateSessionWrite() {
  const { writesEnabled } = useCredential();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="contained"
        size="small"
        disabled={!writesEnabled}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        data-action="create-session"
      >
        Create session
      </Button>
      <SessionWizard open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function ProposalWrites() {
  const { writesEnabled } = useCredential();
  const [proposalId, setProposalId] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);

  return (
    <Stack spacing={2}>
      {/* The legacy flow has no list of proposals, so say where a result can
          turn up instead of leaving the operator to look for it. */}
      <Typography variant="body2" color="text.secondary" data-note="proposal-results">
        This acts as a buyer: it submits and responds from here. The agent has no
        endpoint to list or look up proposals (only submit, counter and negotiation
        status by id), so the id of a submitted proposal is filled in below but is
        not kept: after a reload, note it down or paste it back. If the agent holds
        a proposal for a human decision, it shows up in the Inbox. OpenProposal 3.0
        proposals are on the Proposals screen.
      </Typography>
      <Box>
        <Button
          variant="contained"
          size="small"
          disabled={!writesEnabled}
          onClick={() => setWizardOpen(true)}
          aria-haspopup="dialog"
          data-action="submit-proposal"
        >
          Submit a proposal
        </Button>
      </Box>
      <ProposalWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSubmitted={(id) => id && setProposalId(id)}
      />
      <ProposalPicker
        value={proposalId}
        onChange={setProposalId}
        known={proposalId.trim() ? [proposalId.trim()] : []}
        hint="Id of the proposal to counter or check negotiation status for. Pick one, or type or paste an id."
      />
      {proposalId.trim() ? <NegotiationStatus proposalId={proposalId.trim()} /> : null}
      <Box>
        <Button
          variant="outlined"
          size="small"
          disabled={!writesEnabled || !proposalId.trim()}
          onClick={() => setMessageOpen(true)}
          aria-haspopup="dialog"
          data-action="negotiation-message"
        >
          Respond to proposal
        </Button>
      </Box>
      <NegotiationMessageWizard
        key={proposalId.trim()}
        open={messageOpen}
        proposalId={proposalId.trim()}
        onClose={() => setMessageOpen(false)}
      />
    </Stack>
  );
}

function NegotiationStatus({ proposalId }: { proposalId: string }) {
  const status = useResource(`negotiation:${proposalId}`, (c, signal) =>
    negotiationStatus(c, proposalId, signal),
  );
  const text =
    status.data?.status ??
    (status.result?.kind === "unavailable" && status.result.status === 404
      ? "no rounds yet"
      : status.result
        ? describe(status.result)
        : "");
  return <Typography variant="body2">Negotiation: {text}</Typography>;
}

/**
 * The field a change of each type usually touches, so the form starts from
 * something the agent's severity rules and the order's metadata understand.
 * A request with no field change has nothing to apply.
 */
const CHANGE_FIELD: Readonly<Record<string, string>> = {
  creative: "creative_id",
  flight_dates: "flight_end",
  impressions: "impressions",
  pricing: "final_cpm",
  targeting: "targeting",
  cancellation: "",
  other: "",
};

/**
 * Offered, not enforced: applying a change merges `proposed_values` into the
 * order's metadata under whatever key it carries, so the agent has no field
 * list to validate against and a closed dropdown would refuse real fields.
 */
const SUGGESTED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  ...Object.fromEntries(Object.entries(CHANGE_FIELD).map(([k, v]) => [k, v ? [v] : []])),
  flight_dates: ["flight_start", "flight_end"],
};

function problemList(result: Result<unknown> | undefined, key: string): string[] {
  if (result?.kind !== "unavailable") return [];
  const value = result.problem?.[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Fields the agent compares as numbers: impressions must be a positive integer, CPMs feed the pricing check. */
const NUMERIC_FIELDS = new Set(["impressions", "final_cpm", "base_cpm"]);

function typed(field: string, raw: string): unknown {
  const text = raw.trim();
  if (NUMERIC_FIELDS.has(field) && text !== "" && Number.isFinite(Number(text))) return Number(text);
  return text;
}

function shown(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

type ChangeRow = {
  readonly field: string;
  readonly oldValue: string;
  readonly newValue: string;
  /** Once the operator types a current value, the form stops filling it in. */
  readonly oldTouched: boolean;
};

/**
 * Raised from an order's row, so the order is fixed, and `order` lets the form
 * say up front what the agent would refuse. `current` is what the console
 * knows each field to hold now — the order's metadata over its deal's terms —
 * and fills each row's current value from it. That value is `old_value` on
 * the wire, and it matters more than it looks: the agent classifies a flight
 * change as minor, and auto-approves it, only by comparing old and new dates,
 * and its pricing check compares the two CPMs.
 */
export function ChangeRequestCreate({
  orderId,
  order,
  current = {},
}: {
  orderId: string;
  order: { status: string; deal_id: string | null };
  current?: Readonly<Record<string, unknown>>;
}) {
  const { writesEnabled, actorName } = useCredential();
  // `flight_extension` was the default here once; it is not a ChangeType, so
  // every request sent with it was a 400.
  const [changeType, setChangeType] = useState<string>("flight_dates");
  const rowFor = (field: string): ChangeRow => ({
    field,
    oldValue: shown(current[field]),
    newValue: "",
    oldTouched: false,
  });
  const [rows, setRows] = useState<ChangeRow[]>(() => [rowFor(CHANGE_FIELD["flight_dates"] ?? "")]);
  const [reason, setReason] = useState("");
  const refusal = refuseChange(order, changeType);
  const { severity, note } = predictSeverity(changeType);

  const setRow = (i: number, patch: Partial<ChangeRow>) =>
    setRows((all) =>
      all.map((r, j) => {
        if (j !== i) return r;
        const next = { ...r, ...patch };
        // A new field name brings its own current value, unless one was typed.
        if (patch.field !== undefined && !next.oldTouched) next.oldValue = shown(current[next.field.trim()]);
        return next;
      }),
    );

  const create = useMutation<
    {
      idempotency_key: string;
      order_id: string;
      change_type: string;
      reason?: string;
      requested_by?: string;
      diffs?: { field: string; old_value?: unknown; new_value: unknown }[];
      proposed_values?: Record<string, unknown>;
    },
    ChangeRequestAck
  >((c, a) => createChangeRequest(c, a), {
    // The order's audit counts its change requests, so it goes stale too.
    invalidates: ["change-requests:*", `order-audit:${orderId.trim()}`],
  });

  const changes = rows
    .map((r) => ({ field: r.field.trim(), old: r.oldValue.trim(), next: r.newValue.trim() }))
    .filter((r) => r.field && r.next);
  const diffs = changes.map((r) => ({
    field: r.field,
    ...(r.old ? { old_value: typed(r.field, r.old) } : {}),
    new_value: typed(r.field, r.next),
  }));
  const proposed = Object.fromEntries(changes.map((r) => [r.field, typed(r.field, r.next)]));
  const created = create.last?.kind === "ok" ? create.last.data : undefined;
  const createdStatus = typeof created?.["status"] === "string" ? created["status"] : undefined;
  const refused = problemList(create.last, "validation_errors");

  return (
    <Box>
      {refusal ? (
        <Typography variant="body2" color="text.secondary" data-state="change-refused">
          {refusal}
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          <FormRow>
            <EnumSelect
              hint="What kind of change is being requested. It decides the usual field and how severe the agent treats the request."
              label="Change type"
              value={changeType}
              options={CHANGE_TYPES}
              onChange={(v) => {
                if (!v) return;
                setChangeType(v);
                // A new type starts from its usual field; rows already
                // filled in beyond the first are kept.
                setRows((all) => [rowFor(CHANGE_FIELD[v] ?? ""), ...all.slice(1)]);
              }}
              disabled={!writesEnabled}
              sx={{ minWidth: 180 }}
            />
            <TipField
              hint="Optional reason for the request, shown to whoever reviews it."
              size="small"
              label="Request reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={!writesEnabled}
              sx={{ flex: "1 1 220px" }}
            />
          </FormRow>
          <Stack spacing={1} data-list="change-rows">
            {rows.map((r, i) => (
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap key={i} data-row="change">
                <Autocomplete
                  freeSolo
                  size="small"
                  options={SUGGESTED_FIELDS[changeType] ?? []}
                  // The field starts filled in, and the default text filter would
                  // then hide every suggestion but that one.
                  filterOptions={(all) => all}
                  openOnFocus
                  inputValue={r.field}
                  onInputChange={(_, next) => setRow(i, { field: next })}
                  disabled={!writesEnabled}
                  sx={{ flex: "1 1 170px" }}
                  renderInput={(params) => (
                    <TipField
                      {...params}
                      hint="Name of the order field to change. Pick a suggestion for the change type, or type another; it starts from the usual field."
                      label="Field"
                    />
                  )}
                />
                <TipField
                  hint="What the field holds now, sent as old_value. Filled in from the order and its deal when the console knows it. The agent compares it with the new value: a flight shift of 3 days or less is minor and auto-approved."
                  size="small"
                  label="Current value"
                  value={r.oldValue}
                  onChange={(e) => setRow(i, { oldValue: e.target.value, oldTouched: true })}
                  disabled={!writesEnabled}
                  sx={{ flex: "1 1 150px" }}
                />
                <TipField
                  hint="The value to set the field to, sent as new_value and proposed_values. A whole number for impressions, a number for a CPM, otherwise text. A row with no new value is left out."
                  size="small"
                  label="New value"
                  type={NUMERIC_FIELDS.has(r.field.trim()) ? "number" : "text"}
                  value={r.newValue}
                  onChange={(e) => setRow(i, { newValue: e.target.value })}
                  disabled={!writesEnabled}
                  sx={{ flex: "1 1 150px" }}
                />
                {rows.length > 1 && (
                  <IconButton
                    size="small"
                    aria-label={`Remove the ${r.field.trim() || "empty"} change`}
                    onClick={() => setRows((all) => all.filter((_, j) => j !== i))}
                    disabled={!writesEnabled}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
                      <line x1="6" y1="6" x2="18" y2="18" />
                      <line x1="18" y1="6" x2="6" y2="18" />
                    </svg>
                  </IconButton>
                )}
              </Stack>
            ))}
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button
              size="small"
              onClick={() => setRows((all) => [...all, rowFor("")])}
              disabled={!writesEnabled}
              data-action="add-change-row"
            >
              Add another field
            </Button>
            <Box sx={{ flex: 1 }} />
            <WriteForm
              title="Submit a change request?"
              confirmLabel="Create request"
              action="create-change-request"
              blocked={!writesEnabled || !orderId.trim()}
              pending={create.pending}
              last={create.last?.kind === "ok" || refused.length > 0 ? undefined : create.last}
              onConfirm={() =>
                void create.run({
                  idempotency_key: newKey(),
                  order_id: orderId.trim(),
                  change_type: changeType,
                  ...(reason ? { reason } : {}),
                  ...(actorName ? { requested_by: `human:${actorName}` } : {}),
                  ...(diffs.length > 0 ? { diffs, proposed_values: proposed } : {}),
                })
              }
              consequence={
                <>
                  Raises a <strong>{words(changeType)}</strong> change request against{" "}
                  {orderId.trim()}
                  {changes.length > 0 ? (
                    <>
                      , changing{" "}
                      {changes.map((c, i) => (
                        <span key={c.field}>
                          {i > 0 ? ", " : ""}
                          <strong>{c.field}</strong> {c.old ? <>from {c.old} </> : null}to <strong>{c.next}</strong>
                        </span>
                      ))}
                    </>
                  ) : (
                    <> with no field change, so applying it will write nothing</>
                  )}
                  . {note} Nothing on the order changes until it is applied, and applying writes into
                  the order&apos;s metadata, never its status. Idempotent per order and key for 24
                  hours.
                </>
              }
            />
          </Stack>
        </Stack>
      )}
      {!refusal && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }} data-note="severity">
          {words(changeType)} is {severity}. {note}
        </Typography>
      )}
      {created && (
        <Typography variant="body2" sx={{ mt: 1 }} data-state="change-created">
          Created {typeof created["change_request_id"] === "string" ? created["change_request_id"] : "the request"}
          {createdStatus === "approved"
            ? ": auto-approved. Apply it from the list to write it onto the order."
            : createdStatus === "pending_approval"
              ? ": waiting for review in the list."
              : createdStatus
                ? `: ${words(createdStatus)}.`
                : "."}
        </Typography>
      )}
      {refused.length > 0 && (
        <Box sx={{ mt: 1, color: palette.error }} data-state="change-validation-failed">
          <Typography variant="body2">
            The agent refused it, and saved it as a failed request:
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 13 }}>
            {refused.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

/**
 * Review and apply for one change request, in the order row: a pending request
 * reaches no approval queue and has no MCP tool, so that row has to be able to
 * act. Only what the request's status allows is shown — beside its own status
 * sentence, the one live action is what matters.
 */
export function ChangeRequestReviewWrites({
  crId,
  status,
  changeType,
  onChanged,
}: {
  crId: string;
  status: string;
  changeType?: string;
  onChanged: () => void;
}) {
  const { writesEnabled, actorName, setActorName } = useCredential();
  const [reason, setReason] = useState("");
  const [typedName, setName] = useState<string | undefined>();
  // The stored name until the operator types a different one here.
  const name = typedName ?? actorName;
  const [pendingDecision, setPendingDecision] = useState<"approve" | "reject" | undefined>();
  const [pendingApply, setPendingApply] = useState(false);

  const invalidate = {
    // Apply writes into the order's metadata, so the orders read goes stale
    // too; review changes nothing on the order, but the same list shows it.
    invalidates: ["change-requests:*", "orders:*", "order-audit:*"] as const,
  };

  const review = useMutation<{ id: string; body: ChangeRequestReviewInput }, unknown>(
    (c, args) => reviewChangeRequest(c, args.id, args.body),
    invalidate,
  );
  const apply = useMutation<{ id: string }, unknown>(
    (c, args) => applyChangeRequest(c, args.id),
    invalidate,
  );

  const reviewable = status === "pending_approval";
  const applicable = status === "approved";
  const busy = review.pending || apply.pending;
  const blocked = !writesEnabled;
  const outcome = review.last ?? apply.last;

  return (
    <Box sx={{ mt: 1 }} data-block="change-request-controls">
      {reviewable && (
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1 }}>Review this request</Typography>
      )}

      <FormRow>
        {reviewable && (
          <>
            <TipField
              hint="Optional reason for the decision, saved with the change request."
              size="small"
              label="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={blocked || busy}
              sx={{ minWidth: 240 }}
            />
            <TipField
              hint="Name recorded as the reviewer (decided_by). It is stored as given and not verified, and is remembered for next time."
              size="small"
              label="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => void setActorName(name)}
              disabled={blocked || busy}
              sx={{ minWidth: 200 }}
            />
            <Hint hint="Approves this pending request so it can be applied. You are asked to confirm first.">
              <Button
                size="small"
                variant="contained"
                data-action="approve"
                disabled={blocked || busy}
                onClick={() => setPendingDecision("approve")}
              >
                Approve
              </Button>
            </Hint>
            <Hint hint="Rejects this pending request. The agent keeps the first decision it receives. You are asked to confirm first.">
              <Button
                size="small"
                variant="outlined"
                data-action="reject"
                disabled={blocked || busy}
                onClick={() => setPendingDecision("reject")}
              >
                Reject
              </Button>
            </Hint>
          </>
        )}
        {applicable && (
          <Hint hint="Writes the approved values into the order's metadata. The order's status does not change. You are asked to confirm first.">
            <Button
              size="small"
              variant="outlined"
              data-action="apply"
              disabled={blocked || busy}
              onClick={() => setPendingApply(true)}
            >
              {apply.pending ? "Applying…" : "Apply to order"}
            </Button>
          </Hint>
        )}
      </FormRow>
      {outcome && outcome.kind !== "ok" && (
        <Typography variant="body2" sx={{ mt: 1, color: palette.error }} data-state="write-failed">
          {describe(outcome)}
        </Typography>
      )}

      <ConfirmAction
        open={pendingDecision !== undefined}
        title={pendingDecision === "reject" ? "Reject this change request?" : "Approve this change request?"}
        confirmLabel={pendingDecision === "reject" ? "Reject" : "Approve"}
        pending={review.pending}
        onCancel={() => setPendingDecision(undefined)}
        consequence={
          <>
            The agent records this decision on the change request. It keeps the
            first decision it receives and refuses later ones, so if this fails
            without a clear answer, re-read the request before trying again
            rather than reviewing twice.
          </>
        }
        onConfirm={() => {
          const decision = pendingDecision;
          setPendingDecision(undefined);
          if (!decision) return;
          void review
            .run({
              id: crId,
              body: {
                decision,
                ...(reason ? { reason } : {}),
                ...(name.trim() ? { decided_by: name.trim() } : {}),
              },
            })
            .then(onChanged);
        }}
      />

      <ConfirmAction
        open={pendingApply}
        title="Apply this change request to the order?"
        confirmLabel="Apply"
        pending={apply.pending}
        onCancel={() => setPendingApply(false)}
        consequence={
          <>
            The agent writes the proposed values into the order&apos;s metadata and
            marks this request applied. The order&apos;s status does not change
            {changeType === "cancellation"
              ? " — applying a cancellation request does not cancel the order; that is a separate transition"
              : ""}
            . A second apply is refused, so if this fails without a clear answer,
            re-read the request rather than applying twice.
          </>
        }
        onConfirm={() => {
          setPendingApply(false);
          void apply.run({ id: crId }).then(onChanged);
        }}
      />
    </Box>
  );
}

export function EventLookup({ eventId }: { eventId: string }) {
  const detail = useResource(`event:${eventId}`, (c, signal) => eventById(c, eventId, signal));
  if (!detail.data && !detail.result) return null;
  return (
    <Box data-block="event-by-id" sx={{ mt: 1 }}>
      <ReadOutcome name="Event" data={detail.data} result={detail.result} />
    </Box>
  );
}

// --- OpenProposal lifecycle (ADR 14) -----------------------------------------

/**
 * One idempotency key per attempt, kept across a retry whose outcome is
 * unknown. The other call sites mint a key per run, which is right when every
 * failure is a definite answer; here a timeout on publish or assent may have
 * landed, and retrying with a fresh key would ask the agent to do it twice.
 * Any definite answer — success, 409, 422 — ends the attempt.
 */
function useAttemptKey(): { key: string; settle: (result: Result<unknown>) => void } {
  const [key, setKey] = useState(newKey);
  return {
    key,
    settle: (result) => {
      // Nothing was sent (writes-disabled, busy) or nobody knows (timeout,
      // network, an unparseable body): keep the key.
      const definite =
        result.kind !== "unavailable" || result.reason === "http";
      if (definite) setKey(newKey());
    },
  };
}

/** A 409 here means the record moved under the operator, not that the agent failed. */
function StaleNote({ last }: { last: Result<unknown> | undefined }) {
  if (last?.kind !== "unavailable" || last.reason !== "http" || last.status !== 409) return null;
  return (
    <Typography variant="body2" sx={{ mt: 0.5, color: palette.warningText }} data-state="stale-version">
      The proposal changed since this screen loaded it, so nothing was applied. Review
      the current version before trying again.
    </Typography>
  );
}

function proposalInvalidations(proposalId: string): string[] {
  return [`open-proposal:${proposalId}`, "open-proposals:*"];
}

export function ProposalLifecycleWrites({ proposal }: { proposal: Proposal }) {
  const { writesEnabled } = useCredential();
  const id = proposal.proposal_id;
  const version = proposal.version;
  const status = proposal.status ?? "";
  const [reason, setReason] = useState("");
  const attempt = useAttemptKey();

  type Guard = { idempotency_key: string; expected_version: number | null };
  const publish = useMutation<Guard, unknown>((c, a) => publishProposal(c, id, a), {
    invalidates: proposalInvalidations(id),
  });
  const withdraw = useMutation<Guard & { reason?: string }, unknown>(
    (c, a) => withdrawProposal(c, id, a),
    { invalidates: proposalInvalidations(id) },
  );
  const assent = useMutation<Guard & { decision: "accept" | "decline"; reason?: string }, unknown>(
    (c, a) => assentProposal(c, id, a),
    { invalidates: proposalInvalidations(id) },
  );

  const run = <A extends object>(m: { run: (a: A & Guard) => Promise<Result<unknown>> }, args: A) =>
    void m
      .run({ ...args, idempotency_key: attempt.key, expected_version: version })
      .then(attempt.settle);

  const blocked = !writesEnabled;
  const lastAsk = [...proposal.negotiation_history].reverse().find((e) => e.actor === "buyer");
  const withReason = reason.trim() ? { reason: reason.trim() } : {};

  const canPublish = status === "draft";
  const canWithdraw = status === "published" || status === "under_review";
  const canAssent = status === "under_review";

  if (!canPublish && !canWithdraw && !canAssent) {
    return (
      <Typography variant="body2" color="text.secondary" data-state="no-lifecycle-action">
        No lifecycle action applies to a proposal that is {status ? status.replace(/_/g, " ") : "of unreported status"}.
      </Typography>
    );
  }

  return (
    <Stack spacing={2} data-block="proposal-lifecycle">
      {canPublish && (
        <Box>
          <WriteForm
            title="Publish this proposal?"
            confirmLabel="Publish"
            action="publish-proposal"
            blocked={blocked}
            pending={publish.pending}
            last={publish.last}
            onConfirm={() => run(publish, {})}
            consequence={`Buyer agents can discover version ${version ?? "?"} from this point. Seller-set fields stay revisable while it is published. Replay-safe: a retry after a timeout reuses the same idempotency key.`}
          />
          <StaleNote last={publish.last} />
        </Box>
      )}
      {canAssent && (
        <Box>
          <Typography variant="body2" sx={{ mb: 1 }} data-block="assent-ask">
            Under review: the buyer&apos;s last move was{" "}
            {lastAsk ? `${lastAsk.action ?? "unreported"} on version ${lastAsk.version ?? "?"}` : "not recorded"}
            {lastAsk && lastAsk.fields_changed.length > 0 && `, changing ${lastAsk.fields_changed.join(", ")}`}.
          </Typography>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <WriteForm
              title="Accept this version and make it binding?"
              confirmLabel="Accept"
              action="assent-accept"
              blocked={blocked}
              pending={assent.pending}
              last={assent.last}
              onConfirm={() => run(assent, { decision: "accept" as const, ...withReason })}
              consequence={`Your assent makes version ${version ?? "?"} binding: the proposal becomes agreed, held line items convert, and the stored record is frozen with every catalog reference resolved. This is the commercial commitment, and there is no undo from this console.`}
            />
            <WriteForm
              title="Decline the version under review?"
              confirmLabel="Decline"
              action="assent-decline"
              blocked={blocked}
              pending={assent.pending}
              last={assent.last}
              onConfirm={() => run(assent, { decision: "decline" as const, ...withReason })}
              consequence="Records a seller decline in the negotiation history, which is append-only. The buyer may propose again."
            />
          </Stack>
          <StaleNote last={assent.last} />
        </Box>
      )}
      {canWithdraw && (
        <Box>
          <WriteForm
            title="Withdraw this proposal?"
            confirmLabel="Withdraw"
            action="withdraw-proposal"
            blocked={blocked}
            pending={withdraw.pending}
            last={withdraw.last}
            onConfirm={() => run(withdraw, withReason)}
            consequence="Withdrawn is terminal. Buyer agents composing against it lose it, including any line items they were about to commit."
          />
          <StaleNote last={withdraw.last} />
        </Box>
      )}
      {(canWithdraw || canAssent) && (
        <TipField
          hint="Optional reason sent with a withdraw or an assent (accept or decline). Not used for publish."
          size="small"
          label="Reason (optional, sent with withdraw or assent)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={blocked}
          sx={{ maxWidth: 480 }}
        />
      )}
    </Stack>
  );
}

export function LineItemHoldWrites({ proposal, item }: { proposal: Proposal; item: LineItem }) {
  const { writesEnabled } = useCredential();
  const attempt = useAttemptKey();
  const state = item.hold_status?.state ?? "none";
  const hold = useMutation<
    { action: "grant" | "release"; idempotency_key: string; expected_version: number | null },
    unknown
  >((c, a) => holdLineItem(c, proposal.proposal_id, item.line_item_id, a), {
    invalidates: proposalInvalidations(proposal.proposal_id),
  });
  const run = (action: "grant" | "release") =>
    void hold
      .run({ action, idempotency_key: attempt.key, expected_version: proposal.version })
      .then(attempt.settle);

  if (state !== "requested" && state !== "held") return null;

  return (
    <Box data-block={`hold-writes:${item.line_item_id}`}>
      {state === "requested" ? (
        <WriteForm
          title="Grant the requested hold?"
          confirmLabel="Grant hold"
          action="grant-hold"
          blocked={!writesEnabled}
          pending={hold.pending}
          last={hold.last}
          onConfirm={() => run("grant")}
          consequence={`Reserves this inventory for ${item.hold_status?.hold_duration ?? "an unreported duration"}, scoped to the ${item.hold_status?.hold_scope ?? "unreported scope"}. Nobody else can commit it until the hold expires, is released, or converts on agreement.`}
        />
      ) : (
        <WriteForm
          title="Release this hold?"
          confirmLabel="Release hold"
          action="release-hold"
          blocked={!writesEnabled}
          pending={hold.pending}
          last={hold.last}
          onConfirm={() => run("release")}
          consequence="The inventory returns to the shelf now, before the hold would have expired. The buyer loses its reservation."
        />
      )}
      <StaleNote last={hold.last} />
    </Box>
  );
}

export { Panel };
