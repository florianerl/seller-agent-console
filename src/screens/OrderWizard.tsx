import { useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { createOrder, deals, type Order } from "../api/endpoints";
import { describe } from "../api/errors";
import { TipField } from "../components/TipField";
import { ChoiceCards, ReviewList, WizardDialog } from "../components/Wizard";
import { useCredential } from "../credentials/context";
import { useMutation } from "../query/useMutation";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";
import { DealPicker } from "./pickers";

type Start = "deal" | "quote" | "none";

/**
 * Where a new order comes from, as a choice. `POST /api/v1/orders` takes a
 * deal id and a quote id, both optional and neither checked, so the question
 * that matters is which of them the operator holds — and what an order
 * without a deal costs later (the agent refuses change requests against it).
 */
const STARTS: readonly { value: Start; title: string; description: string }[] = [
  {
    value: "deal",
    title: "For a stored deal",
    description:
      "The usual case: the order executes a deal the agent holds. Lists the stored deals, which reads every one of them.",
  },
  {
    value: "quote",
    title: "From a quote",
    description: "You have the id of the quote it was priced from. Attach the deal too if you know it.",
  },
  {
    value: "none",
    title: "With no deal yet",
    description: "A bare draft. The agent refuses change requests against an order with no deal.",
  },
];

const STEPS = ["Start from", "Details", "Review"] as const;

/**
 * The deal picker plus the quote it was booked from. Its own component so
 * the deals list — an unpaginated full scan — is read only once the operator
 * has chosen this route and reached this step, never on opening the wizard.
 * A deal's envelope names its quote, so picking the deal fills the quote in.
 */
function DealDetails({
  dealId,
  quoteId,
  onDeal,
  onQuote,
}: {
  dealId: string;
  quoteId: string;
  onDeal: (id: string) => void;
  onQuote: (id: string, auto: boolean) => void;
}) {
  const list = useResource("deals:", (c, signal) => deals(c, {}, signal));
  return (
    <>
      <DealPicker
        value={dealId}
        onChange={(id) => {
          onDeal(id);
          const quote = list.data?.deals.find((e) => e.deal.deal_id === id.trim())?.deal.quote_id;
          if (quote) onQuote(quote, true);
        }}
        hint="The deal this order executes. Pick a stored deal, or type or paste its id."
        sx={{ width: "100%" }}
      />
      <TipField
        hint="The quote the deal was booked from. Filled in from the deal when the agent records one; change it or leave it empty."
        size="small"
        label="Quote id (optional)"
        value={quoteId}
        onChange={(e) => onQuote(e.target.value, false)}
        fullWidth
      />
    </>
  );
}

export function OrderWizard({
  open,
  onClose,
  onOpenOrder,
}: {
  open: boolean;
  onClose: () => void;
  /** Close the wizard and land on the new order's row. */
  onOpenOrder: (orderId: string) => void;
}) {
  const { writesEnabled } = useCredential();
  const [step, setStep] = useState(0);
  const [start, setStart] = useState<Start>("deal");
  const [dealId, setDealId] = useState("");
  const [quoteId, setQuoteId] = useState("");
  const [quoteFromDeal, setQuoteFromDeal] = useState(false);
  const [note, setNote] = useState("");

  const create = useMutation<
    { deal_id?: string; quote_id?: string; metadata: Record<string, unknown> },
    Order
  >((c, a) => createOrder(c, a), { invalidates: ["orders:*", "orders-report"] });

  const deal = start === "none" ? "" : dealId.trim();
  const quote = start === "none" ? "" : quoteId.trim();
  const ready = { deal: deal !== "", quote: quote !== "", none: true }[start];
  const created = create.last?.kind === "ok" ? create.last.data : undefined;

  function close() {
    if (create.pending) return;
    onClose();
    // Reset after the dialog has gone, so it does not flash back to step one
    // while closing. Same as the deal wizard.
    setTimeout(() => {
      setStep(0);
      setStart("deal");
      setDealId("");
      setQuoteId("");
      setQuoteFromDeal(false);
      setNote("");
      create.reset();
    }, 200);
  }

  function finish() {
    void create.run({
      ...(deal ? { deal_id: deal } : {}),
      ...(quote ? { quote_id: quote } : {}),
      // Buyer agents tag their orders with a source; so does the console,
      // or its orders would read as "source not recorded".
      metadata: { source: "seller-console", ...(note.trim() ? { note: note.trim() } : {}) },
    });
  }

  const noteField = (
    <TipField
      hint="Optional note stored with the order, shown on its record. The agent does not read it."
      size="small"
      label="Note (optional)"
      value={note}
      onChange={(e) => setNote(e.target.value)}
      fullWidth
    />
  );

  let body: ReactNode;
  if (step === 0) {
    body = <ChoiceCards value={start} onChange={setStart} options={STARTS} label="Where the order comes from" />;
  } else if (step === 1) {
    body = (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        {start === "deal" && (
          <DealDetails
            dealId={dealId}
            quoteId={quoteId}
            onDeal={setDealId}
            onQuote={(id, auto) => {
              // Picking a deal fills its quote in, but never over one the
              // operator typed.
              if (auto && quoteId.trim() && !quoteFromDeal) return;
              setQuoteId(id);
              setQuoteFromDeal(auto);
            }}
          />
        )}
        {start === "quote" && (
          <>
            <TipField
              hint="Id of the quote the order was priced from, from New deal on the Deals screen. The agent cannot list quotes, so paste it exactly."
              size="small"
              label="Quote id"
              value={quoteId}
              onChange={(e) => setQuoteId(e.target.value)}
              autoFocus
              fullWidth
            />
            <TipField
              hint="The deal the order executes, if you know it. Without one the agent refuses change requests against the order."
              size="small"
              label="Deal id (optional)"
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
              fullWidth
            />
          </>
        )}
        {start === "none" && (
          <Alert severity="warning" variant="outlined">
            Without a deal the agent refuses every change request against this order. You cannot
            attach a deal later from this console: the agent has no route that edits one.
          </Alert>
        )}
        {noteField}
      </Box>
    );
  } else {
    body = (
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          {STARTS.find((s) => s.value === start)?.title}
        </Typography>
        <ReviewList
          rows={[
            ["Status", "draft"],
            ["Deal", deal || "none"],
            ["Quote", quote ? `${quote}${quoteFromDeal ? " (from the deal)" : ""}` : "none"],
            ["Source", "seller-console"],
            ...(note.trim() ? ([["Note", note.trim()]] as const) : []),
          ]}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Creates the order in draft and nothing else: it waits there until someone submits it.
          Not idempotent: each call mints a new order id, so a retry after a timeout may leave two
          drafts.
          {!deal && " With no deal attached, the agent will refuse change requests against it."}
        </Typography>
        {!writesEnabled && (
          <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
            Writes are switched off for this key. Turn them on from the connection menu to create
            the order.
          </Alert>
        )}
        {create.last && create.last.kind !== "ok" && (
          <Typography variant="body2" sx={{ mt: 2, color: palette.error }} data-state="write-failed">
            {describe(create.last)}
          </Typography>
        )}
        {created && (
          <Alert severity="success" variant="outlined" sx={{ mt: 2 }} data-state="write-ok">
            Created {created.order_id}, in draft. Open it to submit it for review.
          </Alert>
        )}
      </Box>
    );
  }

  return (
    <WizardDialog
      open={open}
      title="New order"
      steps={STEPS}
      step={step}
      onStep={setStep}
      onClose={close}
      canNext={step !== 1 || ready}
      finishLabel="Create order"
      pendingLabel="Creating…"
      onFinish={finish}
      canFinish={writesEnabled}
      pending={create.pending}
      done={created !== undefined}
      doneActions={
        <>
          <Button onClick={close} data-action="wizard-done">
            Done
          </Button>
          <Button
            variant="contained"
            data-action="wizard-open-order"
            onClick={() => {
              if (created) onOpenOrder(created.order_id);
              close();
            }}
          >
            Open the order
          </Button>
        </>
      }
      block="order-wizard"
    >
      {body}
    </WizardDialog>
  );
}
