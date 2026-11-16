import { useCallback, useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { createOrder, deals, type Deal, type Order } from "../api/endpoints";
import { describe } from "../api/errors";
import { KeyValueFields } from "../components/KeyValueFields";
import { TipField } from "../components/TipField";
import { rowsToRecord, type KeyValueRow } from "../lib/key-values";
import { ChoiceCards, ReviewList, WizardDialog } from "../components/Wizard";
import { useCredential } from "../credentials/context";
import { isExpiredLocally } from "../credentials/recentQuotes";
import { useMutation } from "../query/useMutation";
import { useRecentQuotes } from "../query/useRecentQuotes";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";
import { DealFields } from "./OrderTerms";
import { DealPicker } from "./pickers";
import { QuoteView, type QuoteAnswer } from "./QuoteView";

type Start = "deal" | "none";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Order create looks the quote up and 404s `quote_not_found` when it is gone
 * (services/order_service.py:56-61); it does not check expiry, only presence.
 * Presence is the problem: quotes are stored with a 24-hour TTL, renewed to 24
 * hours when booked (services/deal_service.py:421, quote_service.py:233), so the quote behind a
 * deal older than a day is usually deleted. The deal's own `created_at` is the
 * booking time, which makes it the one cheap signal the console has without
 * reading the quote (a GET that writes).
 */
function quoteLikelyGone(deal: Deal | undefined, quoteFromDeal: boolean, now = Date.now()): boolean {
  if (!quoteFromDeal || !deal?.created_at) return false;
  const booked = Date.parse(deal.created_at);
  return Number.isFinite(booked) && now - booked > DAY_MS;
}

/**
 * Where a new order comes from, as a choice. `POST /api/v1/orders` takes a
 * deal id and a quote id, both optional and neither checked, so the question
 * that matters is whether the order gets a deal — and what one without a deal
 * costs later (the agent refuses change requests against it).
 *
 * There is no "from a quote" route. It was offered once, but the agent has
 * no route that lists quotes, so there was never one to pick: the operator
 * had to paste an id from somewhere else. The quotes the console can see are
 * the ones booked into stored deals, and picking the deal fills its quote in.
 */
const STARTS: readonly { value: Start; title: string; description: string }[] = [
  {
    value: "deal",
    title: "For a stored deal",
    description:
      "The usual case: the order executes a deal the agent holds. Lists the stored deals, which reads every one of them.",
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
  /** The id, and the stored deal it names when the list has one. */
  onDeal: (id: string, deal: Deal | undefined) => void;
  onQuote: (id: string, auto: boolean) => void;
}) {
  const list = useResource("deals:", (c, signal) => deals(c, {}, signal), { manual: true });
  const chosen = list.data?.deals.find((e) => e.deal.deal_id === dealId.trim())?.deal;
  return (
    <>
      <DealPicker
        value={dealId}
        onChange={(id) => {
          const deal = list.data?.deals.find((e) => e.deal.deal_id === id.trim())?.deal;
          onDeal(id, deal);
          if (deal?.quote_id) onQuote(deal.quote_id, true);
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
      {/* The order inherits these terms, so they are shown before it is
          made rather than discovered on its row afterwards. */}
      {dealId.trim() && (
        <DealTermsPanel deal={chosen} dealId={dealId.trim()} loading={list.loading && !list.data} />
      )}
    </>
  );
}

/** The chosen deal's terms, or why there are none to show. */
function DealTermsPanel({ deal, dealId, loading }: { deal: Deal | undefined; dealId: string; loading: boolean }) {
  return (
    <Box
      sx={{ border: `1px solid ${palette.line}`, borderRadius: 1, p: 1.5 }}
      data-block="wizard-deal-terms"
    >
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
        Deal terms
      </Typography>
      {deal ? (
        <DealFields deal={deal} />
      ) : (
        <Typography variant="body2" color="text.secondary" data-state="deal-terms-missing">
          {loading
            ? "Reading the stored deals…"
            : `Deal ${dealId} is not among the stored deals, so its terms cannot be shown. The agent refuses an order for a deal it does not have.`}
        </Typography>
      )}
    </Box>
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
  const [chosenDeal, setChosenDeal] = useState<Deal | undefined>();
  const [note, setNote] = useState("");
  const [details, setDetails] = useState<KeyValueRow[]>([]);

  const [looked, setLooked] = useState<{ id: string; answer: QuoteAnswer } | undefined>();

  const create = useMutation<
    { deal_id?: string; quote_id?: string; metadata: Record<string, unknown> },
    Order
  >((c, a) => createOrder(c, a), { invalidates: ["orders:*", "orders-report"] });

  const deal = start === "none" ? "" : dealId.trim();
  const quote = start === "none" ? "" : quoteId.trim();
  const ready = { deal: deal !== "", none: true }[start];
  // Only an answer about the quote now in the form counts; one about an id
  // since edited away says nothing.
  const { quotes: remembered } = useRecentQuotes();
  // A quote this browser made and remembers, typed in by hand: its own
  // `expires_at` is the best evidence there is without asking the agent. Not
  // for a quote taken from a deal, whose 24 hours restarted when it was booked.
  const rememberedExpired =
    quote !== "" &&
    !quoteFromDeal &&
    (() => {
      const q = remembered.find((r) => r.quote_id === quote);
      return q !== undefined && isExpiredLocally(q);
    })();
  const deadQuote =
    quote !== "" &&
    (rememberedExpired ||
      (looked?.id === quote && (looked.answer === "unknown" || looked.answer === "expired")));
  const onQuoteAnswer = useCallback(
    (answer: QuoteAnswer | undefined) => setLooked(answer ? { id: quote, answer } : undefined),
    [quote],
  );
  const likelyGone = quote !== "" && !deadQuote && quoteLikelyGone(chosenDeal, quoteFromDeal);
  // 404 here is an answer about an id we sent, not an outage. Which id is in
  // `code` (`quote_not_found` / `deal_not_found`, services/order_service.py:47-61).
  const refusedId =
    create.last?.kind === "unavailable" && create.last.status === 404 ? create.last.code : undefined;
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
      setChosenDeal(undefined);
      setNote("");
      setDetails([]);
      setLooked(undefined);
      create.reset();
    }, 200);
  }

  function finish() {
    void create.run({
      ...(deal ? { deal_id: deal } : {}),
      ...(quote ? { quote_id: quote } : {}),
      // Buyer agents tag their orders with a source; so does the console,
      // or its orders would read as "source not recorded".
      // `metadata` is an open object in CreateOrderRequest; whatever the
      // operator adds goes beside the console's own source tag, never over it.
      metadata: {
        ...rowsToRecord(details),
        ...(note.trim() ? { note: note.trim() } : {}),
        source: "seller-console",
      },
    });
  }

  const noteField = (
    <>
      <TipField
        hint="Optional note stored with the order, shown on its record. The agent does not read it."
        size="small"
        label="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        fullWidth
      />
      <KeyValueFields
        rows={details}
        onChange={setDetails}
        addLabel="Add a detail"
        hint="A name for a detail stored in the order's metadata, such as io_number or campaign. It shows on the order's record; the agent does not read it."
      />
    </>
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
            onDeal={(id, d) => {
              setDealId(id);
              setChosenDeal(d);
            }}
            onQuote={(id, auto) => {
              // Picking a deal fills its quote in, but never over one the
              // operator typed.
              if (auto && quoteId.trim() && !quoteFromDeal) return;
              setQuoteId(id);
              setQuoteFromDeal(auto);
            }}
          />
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
            ...Object.entries(rowsToRecord(details)).map(([k, v]) => [k, v] as const),
          ]}
        />
        {start === "deal" && deal && (
          <Box sx={{ mt: 2 }}>
            <DealTermsPanel deal={chosenDeal?.deal_id === deal ? chosenDeal : undefined} dealId={deal} loading={false} />
          </Box>
        )}
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
        {quote && (
          <Box sx={{ mt: 2 }} data-block="quote-check">
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              Check the quote first (optional)
            </Typography>
            <QuoteView key={quote} quoteId={quote} onAnswer={onQuoteAnswer} />
          </Box>
        )}
        {likelyGone && (
          <Alert severity="warning" variant="outlined" sx={{ mt: 2 }} data-state="quote-likely-gone">
            This deal was booked more than 24 hours ago. The agent deletes a quote 24 hours after it
            was booked, and refuses an order that names a quote it no longer has. Leave the quote out
            if the order is refused.
          </Alert>
        )}
        {(deadQuote || refusedId === "quote_not_found") && (
          <Alert
            severity="error"
            variant="outlined"
            sx={{ mt: 2 }}
            data-state="quote-unusable"
            action={
              <Button
                color="inherit"
                size="small"
                data-action="drop-quote"
                onClick={() => {
                  setQuoteId("");
                  setQuoteFromDeal(false);
                  setLooked(undefined);
                  create.reset();
                }}
              >
                Leave the quote out
              </Button>
            }
          >
            {looked?.answer === "expired" || rememberedExpired
              ? "This quote has expired, so the agent would refuse an order that names it."
              : "The agent has no quote with this id, so it would refuse an order that names it."}{" "}
            The order does not need one: the deal carries the terms. For a fresh quote, price it
            again in the New deal wizard.
          </Alert>
        )}
        {refusedId === "deal_not_found" && (
          <Alert severity="error" variant="outlined" sx={{ mt: 2 }} data-state="deal-unknown">
            The agent has no deal with this id. Check it on the previous step.
          </Alert>
        )}
        {create.last && create.last.kind !== "ok" && refusedId !== "quote_not_found" && refusedId !== "deal_not_found" && (
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
      canFinish={writesEnabled && !deadQuote}
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
