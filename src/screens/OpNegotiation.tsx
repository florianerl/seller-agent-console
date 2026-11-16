import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  commitOpNegotiation,
  openOpNegotiation,
  opNegotiationById,
  postOpNegotiationMessage,
  type HistoryEntry,
  type NegotiationMove,
  type NegotiationThread,
  type OpenNegotiationBody,
} from "../api/endpoints";
import { describe, type Result } from "../api/errors";
import { OP_NEGOTIABLE_MECHANISMS, type OpNegotiableMechanism } from "../api/vocabulary";
import { FreshnessNote } from "../components/DataPanel";
import { EnumSelect } from "../components/EnumSelect";
import { Field, FieldGrid } from "../components/Field";
import { GatedNotice } from "../components/GatedNotice";
import { StatusChip } from "../components/StatusChip";
import { TipField } from "../components/TipField";
import { ReviewList, WizardDialog } from "../components/Wizard";
import { WriteForm } from "../components/WriteForm";
import { useCredential } from "../credentials/context";
import { fromThread, recordNegotiation } from "../credentials/recentNegotiations";
import { stamp, timeOfDay } from "../lib/time";
import { useAttemptKey } from "../query/useAttemptKey";
import { useMutation } from "../query/useMutation";
import { useRecentNegotiations } from "../query/useRecentNegotiations";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";
import { LineItemCard } from "./OpenProposalLineItem";
import { money } from "./openproposalFormat";
import { ProductPicker } from "./pickers";

/**
 * OpenProposal negotiation threads, as upstream serves them: a buyer asks for
 * a price on one line item, the seller's engine answers, and an accepted price
 * is committed by booking a deal.
 *
 * Every move here is a buyer's move. The console makes them as the operator
 * testing their own agent, the way the Negotiation screen submits and counters
 * legacy proposals — and every thread belongs to the key that opened it, so
 * this is the only kind of thread an operator console can see at all.
 */

const threadResource = (id: string) => `op-negotiation:${id}`;

/** The seller's current price: the agreed rate once accepted, its last counter before. */
function currentRate(thread: NegotiationThread): { rate: number | null; currency: string | null } {
  const pricing = thread.line_item.pricing[0];
  return { rate: pricing?.agreed_rate ?? null, currency: pricing?.currency ?? null };
}

/**
 * The agent's 409s on a move each mean something specific, and none of them
 * is "the agent failed". Read by code, so a reworded message does not change
 * what the operator is told.
 */
function RefusalNote({ last }: { last: Result<unknown> | undefined }) {
  if (last?.kind !== "unavailable" || last.reason !== "http" || last.status !== 409) return null;
  const current = last.problem?.["current_version"];
  const text =
    last.code === "stale_version"
      ? `The thread moved since this view read it${typeof current === "number" ? ` — it is at version ${current} now` : ""}, so nothing was applied. Read the seller's latest answer before moving again.`
      : last.code === "negotiation_closed"
        ? "The thread is closed, so nothing was applied. Read it again to see how it ended."
        : last.code === "idempotency_conflict"
          ? "The agent has already seen this request key with a different body, so nothing was applied."
          : null;
  if (!text) return null;
  return (
    <Typography variant="body2" sx={{ mt: 0.5, color: palette.warningText }} data-state={`refused-${last.code ?? "409"}`}>
      {text}
    </Typography>
  );
}

function History({ entries, currency }: { entries: readonly HistoryEntry[]; currency: string | null }) {
  if (entries.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No moves recorded.
      </Typography>
    );
  }
  return (
    <Stack component="ol" spacing={1} sx={{ m: 0, p: 0, listStyle: "none" }} data-block="thread-history">
      {entries.map((entry, index) => {
        const seller = entry.actor === "seller";
        return (
          <Box
            component="li"
            key={index}
            data-actor={entry.actor ?? "unknown"}
            data-history-action={entry.action ?? "unknown"}
            sx={{
              alignSelf: seller ? "flex-end" : "flex-start",
              maxWidth: { xs: "100%", sm: "80%" },
              border: `1px solid ${palette.line}`,
              borderRadius: 1,
              px: 1.5,
              py: 1,
              backgroundColor: seller ? palette.ground : palette.paper,
            }}
          >
            <Typography sx={{ fontSize: 13 }}>
              <strong>{entry.actor ?? "?"}</strong> {entry.action ?? "?"}
              {entry.ext?.rate != null && ` at ${money(entry.ext.rate, currency)} CPM`}
              {entry.ext?.final_offer && " — final offer"}
            </Typography>
            {entry.ext?.rationale && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {entry.ext.rationale}
              </Typography>
            )}
            <Typography sx={{ fontSize: 12, color: palette.textSecondary, mt: 0.25 }}>
              v{entry.version ?? "?"}
              {entry.fields_changed.length > 0 && ` · ${entry.fields_changed.join(", ")}`} · {stamp(entry.at)}
            </Typography>
          </Box>
        );
      })}
    </Stack>
  );
}

function Moves({ thread }: { thread: NegotiationThread }) {
  const { writesEnabled, credential } = useCredential();
  const id = thread.negotiation_id;
  const [rate, setRate] = useState("");
  const keys = {
    counter: useAttemptKey(),
    accept: useAttemptKey(),
    decline: useAttemptKey(),
    withdraw: useAttemptKey(),
    commit: useAttemptKey(),
  };
  const options = { invalidates: [threadResource(id)] };
  const move = useMutation<NegotiationMove, NegotiationThread>((c, a) => postOpNegotiationMessage(c, id, a), options);
  const commit = useMutation<{ idempotency_key: string; version: number }, NegotiationThread>(
    (c, a) => commitOpNegotiation(c, id, a),
    options,
  );

  // Every answer is the thread as it now stands; remember it so the recent
  // list shows the state this browser last saw.
  const remember = (result: Result<NegotiationThread>) => {
    if (result.kind === "ok" && credential) void recordNegotiation(credential.credId, fromThread(result.data));
  };

  // One mutation carries all four moves, so its outcome is shown only under
  // the move that produced it.
  const [lastAction, setLastAction] = useState<NegotiationMove["action"]>();
  const outcome = (action: NegotiationMove["action"]) => (lastAction === action ? move.last : undefined);

  const send = (action: NegotiationMove["action"], extra: { requested_rate?: number } = {}) => {
    setLastAction(action);
    void move
      .run({ idempotency_key: keys[action].key, version: thread.version, action, ...extra })
      .then((result) => {
        keys[action].settle(result);
        remember(result);
      });
  };

  const blocked = !writesEnabled;
  const { rate: current, currency } = currentRate(thread);
  const asked = Number(rate);
  const rateValid = rate.trim() !== "" && Number.isFinite(asked) && asked > 0;

  if (thread.state === "accepted") {
    return (
      <Box data-block="thread-moves">
        <WriteForm
          title="Commit and book this deal?"
          confirmLabel="Commit"
          action="op-commit"
          blocked={blocked}
          pending={commit.pending}
          last={commit.last}
          onConfirm={() =>
            void commit.run({ idempotency_key: keys.commit.key, version: thread.version }).then((result) => {
              keys.commit.settle(result);
              remember(result);
            })
          }
          consequence={`Books a real deal at ${money(current, currency)} CPM through the agent's deal flow, then marks the line item agreed and records assent. A booking cannot be undone from this console. If the booking fails, nothing is agreed. A retry after a timeout reuses the same key, so it cannot book twice.`}
        />
        <RefusalNote last={commit.last} />
      </Box>
    );
  }

  if (thread.state !== "open") {
    return (
      <Typography variant="body2" color="text.secondary" data-state="no-move">
        This thread is {thread.state}; no move is open on it.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5} data-block="thread-moves">
      <WriteForm
        title="Counter the seller's price?"
        confirmLabel="Counter"
        action="op-counter"
        blocked={blocked || !rateValid}
        pending={move.pending}
        last={outcome("counter")}
        onConfirm={() => send("counter", { requested_rate: asked })}
        consequence={`Asks for ${money(asked, currency)} CPM against version ${thread.version}. The seller's engine answers at once — a counter, an acceptance or a decline — and a counter moves the thread to a new version. A retry after a timeout reuses the same key.`}
      >
        <TipField
          hint="The CPM to ask for. A proposed extension: the spec has no field for a requested rate yet."
          size="small"
          label="Requested CPM"
          type="number"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          disabled={blocked}
          sx={{ width: 160 }}
        />
      </WriteForm>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
        <WriteForm
          title="Accept the seller's price?"
          confirmLabel="Accept"
          action="op-accept"
          blocked={blocked}
          pending={move.pending}
          last={outcome("accept")}
          onConfirm={() => send("accept")}
          consequence={`Takes the seller's current price, ${money(current, currency)} CPM. Nothing is booked yet: the line item stays under review until you commit.`}
        />
        <WriteForm
          title="Decline and end this thread?"
          confirmLabel="Decline"
          action="op-decline"
          blocked={blocked}
          pending={move.pending}
          last={outcome("decline")}
          onConfirm={() => send("decline")}
          consequence="Ends the thread. It cannot be reopened; asking again needs a new thread."
        />
        <WriteForm
          title="Withdraw from this thread?"
          confirmLabel="Withdraw"
          action="op-withdraw"
          blocked={blocked}
          pending={move.pending}
          last={outcome("withdraw")}
          onConfirm={() => send("withdraw")}
          consequence="Withdraws the request and ends the thread. It cannot be reopened."
        />
      </Stack>
      <RefusalNote last={move.last} />
    </Stack>
  );
}

export function ThreadView({ negotiationId }: { negotiationId: string }) {
  const { credential } = useCredential();
  const thread = useResource(threadResource(negotiationId), (c, signal) => opNegotiationById(c, negotiationId, signal));

  // A thread read is also the moment to remember it: it may have been pasted
  // from somewhere, and the next visit should not need the id again.
  const data = thread.freshness === "live" ? thread.data : undefined;
  useEffect(() => {
    if (data && credential) void recordNegotiation(credential.credId, fromThread(data));
  }, [data, credential]);

  if (thread.freshness === "blocked") return <GatedNotice what="This negotiation thread" result={thread.result} />;
  if (!thread.data) {
    if (thread.loading) return <Skeleton height={48} />;
    const missing = thread.result?.kind === "unavailable" && thread.result.status === 404;
    return (
      <Alert severity={missing ? "info" : "warning"} variant="outlined" data-state={missing ? "thread-not-found" : "thread-unavailable"}>
        {missing
          ? "The agent has no thread with this id for this key. Threads are visible only to the key that opened them."
          : thread.result
            ? describe(thread.result)
            : "Not read yet."}
      </Alert>
    );
  }

  const t = thread.data;
  const { currency } = currentRate(t);
  const deal = t.line_item.external_references.find((r) => r.role === "deal");

  return (
    <Stack spacing={2} data-block="thread" data-thread={t.negotiation_id}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <FreshnessNote freshness={thread.freshness}>
          {thread.freshness === "stale"
            ? "couldn't refresh — showing the last thread received"
            : thread.asOf !== undefined
              ? `as of ${stamp(new Date(thread.asOf).toISOString())}`
              : ""}
        </FreshnessNote>
        <Button size="small" onClick={thread.refresh} disabled={thread.validating} data-action="refresh-thread">
          {thread.validating ? "Reading…" : "Read again"}
        </Button>
      </Box>

      <FieldGrid min={160} data-block="thread-summary">
        <Field label="State">
          <StatusChip status={t.state} />
        </Field>
        <Field label="Version">{t.version}</Field>
        <Field label="Proposal">{t.proposal_id || "—"}</Field>
        <Field label="Seller's price">
          {money(currentRate(t).rate, currency)}
          {t.state === "open" && (
            <Box component="span" sx={{ display: "block", fontSize: 12, color: palette.textSecondary }}>
              last counter, not yet accepted
            </Box>
          )}
        </Field>
        <Field label="Assent">
          {t.assent ? `v${t.assent.version ?? "?"} · buyer ${stamp(t.assent.buyer_at)} · seller ${stamp(t.assent.seller_at)}` : "none recorded"}
        </Field>
        <Field label="Deal">
          {deal ? (
            <span data-block="thread-deal">
              {deal.id} · <Link href="#/deals">Deals</Link>
            </span>
          ) : (
            "not booked"
          )}
        </Field>
      </FieldGrid>

      <Box>
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1 }}>Negotiation history · append-only</Typography>
        <History entries={t.negotiation_history} currency={currency} />
      </Box>

      <Box>
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1 }}>Next move</Typography>
        <Moves thread={t} />
      </Box>

      <Box>
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1 }}>The line item, as the thread presents it</Typography>
        <LineItemCard item={t.line_item} />
      </Box>
    </Stack>
  );
}

/**
 * The threads this browser knows about. Not the agent's list — it has none —
 * and the helper says so: a thread opened from another browser or with
 * another key is not here, and the second of those cannot be read at all.
 */
export function RecentThreads({ selected, onSelect }: { selected: string | undefined; onSelect: (id: string) => void }) {
  const { negotiations, asOf } = useRecentNegotiations();
  const [pasted, setPasted] = useState("");

  return (
    <Stack spacing={1.5} data-block="recent-threads">
      <Typography variant="body2" color="text.secondary">
        Threads opened or read from this browser with this key
        {asOf ? `, as of ${timeOfDay(new Date(asOf).toISOString())}` : ""}. The agent has no list of threads, and a
        thread opened with any other key is invisible to this one. States below are as this browser last saw them.
      </Typography>
      {negotiations.length === 0 ? (
        <Typography variant="body2" color="text.secondary" data-state="no-recent-threads">
          None yet. Open one, or paste an id this key opened.
        </Typography>
      ) : (
        <Stack spacing={0.5}>
          {negotiations.map((n) => (
            <Button
              key={n.negotiation_id}
              onClick={() => onSelect(n.negotiation_id)}
              variant={selected === n.negotiation_id ? "contained" : "text"}
              data-recent-thread={n.negotiation_id}
              sx={{ justifyContent: "flex-start", textTransform: "none", textAlign: "left" }}
            >
              <Box>
                <Box sx={{ fontFamily: "monospace", fontSize: 12 }}>{n.negotiation_id}</Box>
                <Box sx={{ fontSize: 12 }}>
                  {n.line_item_id} · {n.state} · v{n.version}
                  {n.rate !== null && ` · ${money(n.rate, n.currency)} CPM`} · seen {timeOfDay(new Date(n.seen_at).toISOString())}
                </Box>
              </Box>
            </Button>
          ))}
        </Stack>
      )}
      <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end", flexWrap: "wrap" }}>
        <TipField
          hint="A negotiation id this key opened, for example from another tab or a log."
          size="small"
          label="Negotiation id"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          sx={{ minWidth: 220 }}
        />
        <Button
          size="small"
          variant="outlined"
          disabled={!pasted.trim()}
          onClick={() => onSelect(pasted.trim())}
          data-action="read-thread"
        >
          Read thread
        </Button>
      </Box>
    </Stack>
  );
}

const STEPS = ["Line item", "Terms", "Buyer", "Review"] as const;

type Draft = {
  proposalId: string;
  version: string;
  lineItemId: string;
  mechanism: OpNegotiableMechanism;
  amount: string;
  flightStart: string;
  flightEnd: string;
  rate: string;
  seatId: string;
  agencyId: string;
  advertiserId: string;
};

const BLANK: Draft = {
  proposalId: "",
  version: "1",
  lineItemId: "",
  mechanism: "PREFERRED_DEAL",
  amount: "",
  flightStart: "",
  flightEnd: "",
  rate: "",
  seatId: "",
  agencyId: "",
  advertiserId: "",
};

const positiveInt = (v: string) => /^\d+$/.test(v.trim()) && Number(v) > 0;
const positive = (v: string) => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) > 0;

/**
 * Opening a thread, with every field of upstream's `OPNegotiationOpenRequest`.
 * The line item is a seller-agent product id: the thread quotes that product,
 * so it is picked from the catalog rather than from a proposal.
 */
export function OpenThreadWizard({
  open,
  onClose,
  onOpened,
}: {
  open: boolean;
  onClose: () => void;
  onOpened: (negotiationId: string) => void;
}) {
  const { writesEnabled, credential } = useCredential();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const attempt = useAttemptKey();
  const create = useMutation<OpenNegotiationBody, NegotiationThread>((c, a) => openOpNegotiation(c, a));
  const done = create.last?.kind === "ok";

  // Blank fields are left off the wire rather than sent empty.
  const identity: Record<string, string> = {};
  for (const [key, value] of [
    ["seat_id", draft.seatId],
    ["agency_id", draft.agencyId],
    ["advertiser_id", draft.advertiserId],
  ] as const) {
    if (value.trim()) identity[key] = value.trim();
  }

  const body: OpenNegotiationBody = {
    idempotency_key: attempt.key,
    proposal_id: draft.proposalId.trim(),
    version: Number(draft.version),
    line_item_id: draft.lineItemId.trim(),
    transaction_mechanism: draft.mechanism,
    commitment: {
      basis: "units",
      amount: Number(draft.amount),
      ...(draft.flightStart ? { flight_start: draft.flightStart } : {}),
      ...(draft.flightEnd ? { flight_end: draft.flightEnd } : {}),
    },
    requested_rate: Number(draft.rate),
    ...(Object.keys(identity).length ? { buyer_identity: identity } : {}),
  };

  const stepValid = [
    draft.proposalId.trim() !== "" && draft.lineItemId.trim() !== "" && positiveInt(draft.version),
    positiveInt(draft.amount) && positive(draft.rate) && !(draft.flightStart && draft.flightEnd && draft.flightEnd < draft.flightStart),
    true,
  ];

  function close() {
    if (create.pending) return;
    onClose();
    // Reset after the dialog has gone, so it does not flash back to step one.
    setTimeout(() => {
      setStep(0);
      setDraft(BLANK);
      create.reset();
    }, 200);
  }

  function finish() {
    void create.run(body).then((result) => {
      attempt.settle(result);
      if (result.kind === "ok") {
        if (credential) void recordNegotiation(credential.credId, fromThread(result.data));
        onOpened(result.data.negotiation_id);
      }
    });
  }

  return (
    <WizardDialog
      open={open}
      title="Ask for a price on a line item"
      steps={STEPS}
      step={step}
      onStep={setStep}
      onClose={close}
      canNext={stepValid[step] ?? true}
      finishLabel="Open thread"
      pendingLabel="Asking…"
      onFinish={finish}
      canFinish={writesEnabled}
      pending={create.pending}
      done={done}
      block="op-thread-wizard"
    >
      {step === 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TipField
            hint="The proposal the buyer is reading. The agent records it on the thread; it does not look it up."
            size="small"
            label="Proposal id"
            value={draft.proposalId}
            onChange={(e) => set("proposalId", e.target.value)}
            fullWidth
          />
          <TipField
            hint="The proposal version the buyer is looking at."
            size="small"
            label="Proposal version"
            type="number"
            value={draft.version}
            onChange={(e) => set("version", e.target.value)}
            sx={{ width: 160 }}
          />
          <ProductPicker
            label="Line item (product id)"
            hint="The thread quotes this seller-agent product. Pick one from the catalog, or paste an id."
            value={draft.lineItemId}
            onChange={(v) => set("lineItemId", v)}
          />
          <EnumSelect
            label="Transaction mechanism"
            hint="How the deal would execute. Direct IO and open auction are not negotiated here."
            value={draft.mechanism}
            options={OP_NEGOTIABLE_MECHANISMS}
            onChange={(v) => v && set("mechanism", v)}
          />
        </Box>
      )}
      {step === 1 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TipField
            hint="Impressions. Only a unit commitment is supported upstream."
            size="small"
            label="Impressions"
            type="number"
            value={draft.amount}
            onChange={(e) => set("amount", e.target.value)}
            sx={{ width: 200 }}
          />
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <TipField
              hint="Campaign start, a calendar date. Optional."
              size="small"
              label="Flight start"
              type="date"
              value={draft.flightStart}
              onChange={(e) => set("flightStart", e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TipField
              hint="Campaign end, a calendar date. Optional."
              size="small"
              label="Flight end"
              type="date"
              value={draft.flightEnd}
              onChange={(e) => set("flightEnd", e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
          <TipField
            hint="The CPM to ask for. A proposed extension: the spec has no field for a requested rate yet."
            size="small"
            label="Requested CPM"
            type="number"
            value={draft.rate}
            onChange={(e) => set("rate", e.target.value)}
            sx={{ width: 200 }}
          />
        </Box>
      )}
      {step === 2 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            All optional. The agent prices by the tier it can verify of this buyer.
          </Typography>
          <TipField hint="DSP seat id of the buyer." size="small" label="Seat id (optional)" value={draft.seatId} onChange={(e) => set("seatId", e.target.value)} fullWidth />
          <TipField hint="The agency buying on the advertiser's behalf." size="small" label="Agency id (optional)" value={draft.agencyId} onChange={(e) => set("agencyId", e.target.value)} fullWidth />
          <TipField hint="The advertiser the campaign is for." size="small" label="Advertiser id (optional)" value={draft.advertiserId} onChange={(e) => set("advertiserId", e.target.value)} fullWidth />
        </Box>
      )}
      {step === 3 && (
        <Box>
          <ReviewList
            rows={[
              ["Proposal", `${body.proposal_id} · v${body.version}`],
              ["Line item", body.line_item_id],
              ["Mechanism", draft.mechanism.replace(/_/g, " ").toLowerCase()],
              ["Impressions", body.commitment.amount.toLocaleString()],
              ["Flight", draft.flightStart || draft.flightEnd ? `${draft.flightStart || "…"} – ${draft.flightEnd || "…"}` : "—"],
              ["Requested CPM", body.requested_rate.toFixed(2)],
              ["Buyer", Object.values(identity).join(" · ") || "—"],
            ]}
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Quotes the line item and runs the seller&apos;s negotiation engine on this rate, which answers at once.
            Creates a quote and a thread owned by this key: no other key can read or move it. Nothing is booked
            until a commit. A retry after a timeout reuses the same key and returns the same thread.
          </Typography>
          {!writesEnabled && (
            <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
              Writes are switched off for this key. Turn them on from the connection menu to open a thread.
            </Alert>
          )}
          {create.last && create.last.kind !== "ok" && (
            <Typography variant="body2" sx={{ mt: 2, color: palette.error }} data-state="write-failed">
              {describe(create.last)}
            </Typography>
          )}
          {done && create.last?.kind === "ok" && (
            <Alert severity="success" variant="outlined" sx={{ mt: 2 }} data-state="write-ok">
              Thread {create.last.data.negotiation_id} opened; the seller answered {create.last.data.state === "open" ? "with a counter" : `and the thread is ${create.last.data.state}`}.
            </Alert>
          )}
        </Box>
      )}
    </WizardDialog>
  );
}
