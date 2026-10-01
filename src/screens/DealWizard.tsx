import { useMemo, useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import {
  bookDeal,
  createCuratedDeal,
  createQuote,
  dealFromTemplate,
  distributeDeal,
  generateDeal,
  pushDeal,
  type Money,
  type Quote,
} from "../api/endpoints";
import { describe, type Result } from "../api/errors";
import {
  DEAL_TYPES,
  QUOTE_MEDIA_TYPES,
  type DealTypeCode,
  type QuoteMediaType,
} from "../api/vocabulary";
import { EnumSelect } from "../components/EnumSelect";
import { TipField } from "../components/TipField";
import { ChoiceCards, ReviewList, WizardDialog } from "../components/Wizard";
import { useCredential } from "../credentials/context";
import { stamp } from "../lib/time";
import { useMutation } from "../query/useMutation";
import { palette } from "../theme/palette";
import { SspNameField } from "./mutations";
import { CuratorPicker, ProductPicker } from "./pickers";

type Method = "new-quote" | "quote" | "proposal" | "template" | "curated";

/**
 * The routes that make a deal, as a choice. They were four unrelated forms in
 * a column, and which one an operator wants depends on what they are holding
 * (nothing yet, a quote, a proposal, a product) — so the first question is
 * that, and each form shrinks to the fields its route needs.
 *
 * "Quote, then book" is first because it is the route the agent is built
 * around: a quote is the non-binding price, and booking is the commit. Doing
 * both here means the operator sees the price before committing to it instead
 * of requesting a quote on one screen and carrying its id to another.
 */
const METHODS: readonly { value: Method; title: string; description: string }[] = [
  {
    value: "new-quote",
    title: "Quote, then book",
    description: "Price a product first, see the rate, and book it if you like it.",
  },
  {
    value: "quote",
    title: "Book an existing quote",
    description: "You already have a quote id, from an order or an earlier request.",
  },
  {
    value: "proposal",
    title: "From a proposal",
    description: "A buyer's proposal was accepted. Turns it into a deal.",
  },
  {
    value: "template",
    title: "From a template",
    description: "Start from a product. Prices it and books a deal in one step.",
  },
  {
    value: "curated",
    title: "For a curator",
    description: "Make a deal on behalf of a registered curator.",
  },
];

const STEPS = ["Choose", "Details", "Review"] as const;

/** What the agent does on each route, said before the operator commits. */
const CONSEQUENCE: Record<Exclude<Method, "new-quote">, string> = {
  quote:
    "The quote becomes bound and a deal is created. Retrying with the same quote returns the same deal; a different body is refused with a 409.",
  proposal:
    "Creates a deal from the accepted proposal. This is not the route that books a quote, and it is not idempotent: a retry after an unclear failure may create a second deal.",
  template:
    "Prices the product and books the deal immediately. Refused with a 422 if the maximum CPM is below the floor. A retry after an unclear failure may create a second deal.",
  curated: "Not idempotent: each call creates another curated deal.",
};

function newKey(): string {
  return crypto.randomUUID();
}

function money(amount: Money | null | undefined): string {
  if (!amount) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: amount.currency || "USD",
  }).format(amount.amount_micros / 1_000_000);
}

/**
 * The id of the deal a create call made. Those routes answer with an untyped
 * body, and which key carries the id differs between them, so look in both
 * places and say nothing rather than guess: with no id the wizard just does
 * not offer to send the deal on.
 */
function createdDealId(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const top = data as Record<string, unknown>;
  const nested = top["deal"];
  const inner =
    typeof nested === "object" && nested !== null
      ? (nested as Record<string, unknown>)["deal_id"]
      : undefined;
  const id = inner ?? top["deal_id"];
  return typeof id === "string" && id !== "" ? id : undefined;
}

/**
 * The last thing an operator does with a new deal is hand it to a buyer or an
 * SSP, and that used to be a trip to the deal's own card. Offered here, once
 * the deal exists, and optional: the wizard is finished either way.
 */
function SendNow({ dealId }: { dealId: string }) {
  const { writesEnabled } = useCredential();
  const [buyerUrl, setBuyerUrl] = useState("");
  const [ssp, setSsp] = useState("");
  const push = useMutation<{ deal_id: string; buyer_urls: string[] }, unknown>(
    (c, a) => pushDeal(c, a),
    { invalidates: ["deals:*"] },
  );
  const distribute = useMutation<{ deal_id: string; ssp_name?: string }, unknown>(
    (c, a) => distributeDeal(c, a),
    { invalidates: ["deals:*"] },
  );

  const outcome = (r: Result<unknown> | undefined, what: string) =>
    r && (
      <Typography
        variant="body2"
        sx={{ mt: 0.5, color: r.kind === "ok" ? undefined : palette.error }}
        data-state={r.kind === "ok" ? "send-ok" : "send-failed"}
      >
        {r.kind === "ok" ? `${what} accepted.` : describe(r)}
      </Typography>
    );

  return (
    <Box sx={{ mt: 2.5 }} data-block="send-now">
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        Send it now
      </Typography>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1.5 }}>
        Optional. Hands deal <code>{dealId}</code> to a buyer or an SSP. A retry after an unclear
        failure may send it twice.
      </Typography>
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", flexWrap: "wrap" }}>
        <TipField
          hint="Full URL of the buyer agent to notify, for example https://buyer.example."
          size="small"
          label="Buyer URL"
          value={buyerUrl}
          onChange={(e) => setBuyerUrl(e.target.value)}
          sx={{ minWidth: 240 }}
        />
        <Button
          variant="outlined"
          size="small"
          data-action="send-buyer"
          disabled={!writesEnabled || !buyerUrl.trim() || push.pending}
          onClick={() => void push.run({ deal_id: dealId, buyer_urls: [buyerUrl.trim()] })}
          sx={{ mt: 0.5 }}
        >
          Notify buyer
        </Button>
      </Box>
      {outcome(push.last, "The buyer notification was")}
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", flexWrap: "wrap", mt: 1.5 }}>
        <SspNameField
          label="SSP name (optional)"
          hint="Name of the SSP connector to send the deal to. Pick a known one or type another; leave it empty for the agent's default."
          value={ssp}
          onChange={setSsp}
        />
        <Button
          variant="outlined"
          size="small"
          data-action="send-ssp"
          disabled={!writesEnabled || distribute.pending}
          onClick={() =>
            void distribute.run({ deal_id: dealId, ...(ssp.trim() ? { ssp_name: ssp.trim() } : {}) })
          }
          sx={{ mt: 0.5 }}
        >
          Send to SSP
        </Button>
      </Box>
      {outcome(distribute.last, "The SSP send was")}
    </Box>
  );
}

export function DealWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { writesEnabled } = useCredential();
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<Method>("new-quote");
  const [quoteId, setQuoteId] = useState("");
  const [proposalId, setProposalId] = useState("");
  const [productId, setProductId] = useState("");
  // Short code: the template and quote routes map PG/PD/PA and 400 on anything else.
  const [dealType, setDealType] = useState<DealTypeCode>("PD");
  const [mediaType, setMediaType] = useState<QuoteMediaType>("digital");
  const [impressions, setImpressions] = useState("");
  const [curatorId, setCuratorId] = useState("");

  const prod = productId.trim();
  // `QuoteRequest` says impressions are required for PG; the others take none.
  const volume = Number(impressions);
  const needsVolume = dealType === "PG";
  const volumeOk = Number.isInteger(volume) && volume > 0;
  const quoteBody = {
    product_id: prod,
    deal_type: dealType,
    media_type: mediaType,
    ...(needsVolume ? { impressions: volume } : {}),
  };
  // The quote is only worth booking for the request it answered. Edit the
  // product or the volume after quoting and this changes, which drops the
  // quote instead of letting a stale price be booked.
  const requestSignature = JSON.stringify(quoteBody);

  // One idempotency key per request: asking again for the same quote replays
  // it, and a different request is a different body, which the agent refuses
  // under a key it has already seen.
  const quoteKey = useMemo(() => newKey(), [requestSignature]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = quoteId.trim();
  const bookingKey = useMemo(() => newKey(), [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidates = ["deals:*"];
  const quoteReq = useMutation<
    {
      product_id: string;
      idempotency_key: string;
      deal_type: DealTypeCode;
      media_type: QuoteMediaType;
      impressions?: number;
    },
    { quote: Quote }
  >((c, a) => createQuote(c, a));
  const book = useMutation<{ quote_id: string; idempotency_key: string }, unknown>(
    (c, a) => bookDeal(c, a),
    { invalidates },
  );
  const gen = useMutation<{ proposal_id: string }, unknown>((c, a) => generateDeal(c, a), {
    invalidates,
  });
  const template = useMutation<{ deal_type: DealTypeCode; product_id: string }, unknown>(
    (c, a) => dealFromTemplate(c, a),
    { invalidates },
  );
  const curated = useMutation<{ curator_id: string }, unknown>(
    (c, a) => createCuratedDeal(c, a),
    { invalidates },
  );

  // Which request the held quote answers; `undefined` until one has landed.
  const [quotedFor, setQuotedFor] = useState<string | undefined>();
  const quote =
    quoteReq.last?.kind === "ok" && quotedFor === requestSignature ? quoteReq.last.data.quote : undefined;

  const bookable = method === "new-quote" ? quote?.quote_id : q;
  const active = {
    "new-quote": quote ? book : quoteReq,
    quote: book,
    proposal: gen,
    template,
    curated,
  }[method];
  // A deal exists only once a booking-type call lands. Getting a quote is not it.
  const dealResult = { "new-quote": book, quote: book, proposal: gen, template, curated }[method].last;
  const done = dealResult?.kind === "ok";
  const last = active.last;
  const dealId = done ? createdDealId(dealResult.data) : undefined;

  const p = proposalId.trim();
  const cur = curatorId.trim();
  const ready = {
    "new-quote": prod !== "" && (!needsVolume || volumeOk),
    quote: q !== "",
    proposal: p !== "",
    template: prod !== "",
    curated: cur !== "",
  }[method];

  const dealTypeLabel = DEAL_TYPES.find((t) => t.value === dealType)?.label ?? dealType;
  const quoteRows: [string, string][] = [
    ["Product", prod],
    ["Deal type", dealTypeLabel],
    ["Media type", mediaType],
  ];
  if (needsVolume) quoteRows.push(["Impressions", impressions.trim()]);
  const summary: [string, string][] = {
    "new-quote": quoteRows,
    quote: [["Quote", q]] as [string, string][],
    proposal: [["Proposal", p]] as [string, string][],
    template: [
      ["Product", prod],
      ["Deal type", dealTypeLabel],
    ] as [string, string][],
    curated: [["Curator", cur]] as [string, string][],
  }[method];

  function finish() {
    switch (method) {
      case "new-quote":
        if (quote) return void book.run({ quote_id: quote.quote_id, idempotency_key: bookingKey });
        return void quoteReq
          .run({ ...quoteBody, idempotency_key: quoteKey })
          .then((r) => r.kind === "ok" && setQuotedFor(requestSignature));
      case "quote":
        return void book.run({ quote_id: q, idempotency_key: bookingKey });
      case "proposal":
        return void gen.run({ proposal_id: p });
      case "template":
        return void template.run({ deal_type: dealType, product_id: prod });
      case "curated":
        return void curated.run({ curator_id: cur });
    }
  }

  function close() {
    if (active.pending) return;
    onClose();
    // Reset after the dialog has gone, so a closing dialog does not flash back
    // to its first step. A finished wizard starts clean; an abandoned one too.
    setTimeout(() => {
      setStep(0);
      setQuoteId("");
      setProposalId("");
      setProductId("");
      setImpressions("");
      setCuratorId("");
      setQuotedFor(undefined);
      quoteReq.reset();
      book.reset();
      gen.reset();
      template.reset();
      curated.reset();
    }, 200);
  }

  let body: ReactNode;
  if (step === 0) {
    body = (
      <ChoiceCards value={method} onChange={setMethod} options={METHODS} label="How to create the deal" />
    );
  } else if (step === 1) {
    body = (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        {method === "new-quote" && (
          <>
            <ProductPicker
              value={productId}
              onChange={setProductId}
              hint="The product to quote. Pick one, or type or paste an id."
              sx={{ width: "100%" }}
            />
            <EnumSelect
              hint="PG is guaranteed and needs an impression count; PD (preferred) and PA (private auction) do not."
              label="Deal type"
              value={dealType}
              options={DEAL_TYPES}
              onChange={(v) => v && setDealType(v)}
              sx={{ width: "100%" }}
            />
            <EnumSelect
              hint="Media type the quote is for. The agent accepts only the listed values."
              label="Media type"
              value={mediaType}
              options={QUOTE_MEDIA_TYPES}
              onChange={(v) => v && setMediaType(v)}
              sx={{ width: "100%" }}
            />
            {needsVolume && (
              <TipField
                hint="Number of impressions to quote. Required for a guaranteed (PG) quote and a whole number above zero."
                size="small"
                type="number"
                label="Impressions"
                value={impressions}
                onChange={(e) => setImpressions(e.target.value)}
                fullWidth
              />
            )}
          </>
        )}
        {method === "quote" && (
          <TipField
            hint="Id of the quote to book. It is shown on an order that came from it. Quotes expire after 24 hours."
            size="small"
            label="Quote id"
            value={quoteId}
            onChange={(e) => setQuoteId(e.target.value)}
            autoFocus
            fullWidth
          />
        )}
        {method === "proposal" && (
          <TipField
            hint="Id of an accepted proposal. Copy it from the Proposals screen."
            size="small"
            label="Proposal id"
            value={proposalId}
            onChange={(e) => setProposalId(e.target.value)}
            autoFocus
            fullWidth
          />
        )}
        {method === "template" && (
          <>
            <ProductPicker
              value={productId}
              onChange={setProductId}
              hint="The product to price and book. Pick one, or type or paste an id."
              sx={{ width: "100%" }}
            />
            <EnumSelect
              hint="Deal type for the template: PG, PD or PA. The route rejects anything else with a 400."
              label="Deal type"
              value={dealType}
              options={DEAL_TYPES}
              onChange={(v) => v && setDealType(v)}
              sx={{ width: "100%" }}
            />
          </>
        )}
        {method === "curated" && (
          <CuratorPicker value={curatorId} onChange={setCuratorId} sx={{ width: "100%" }} />
        )}
      </Box>
    );
  } else {
    body = (
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          {METHODS.find((m) => m.value === method)?.title}
        </Typography>
        <ReviewList rows={summary} />
        {method === "new-quote" ? (
          quote ? (
            <Box sx={{ mt: 2 }} data-block="quote-held">
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                Quoted
              </Typography>
              <ReviewList
                rows={[
                  ["Quote", quote.quote_id],
                  ["Rate", `${money(quote.pricing?.final_cpm)} CPM`],
                  ...(quote.expires_at ? [["Expires", stamp(quote.expires_at)] as const] : []),
                ]}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Booking binds this quote and creates the deal. Retrying with the same quote returns
                the same deal. Quotes expire after 24 hours; going back and changing the request
                discards this one.
              </Typography>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Asks the agent for a price. A quote is non-binding and expires after 24 hours; nothing
              is booked until you press Book deal on the next screen. Asking again with the same
              request returns the same quote.
            </Typography>
          )
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {CONSEQUENCE[method]}
          </Typography>
        )}
        {!writesEnabled && (
          <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
            Writes are switched off for this key. Turn them on from the connection menu to create
            the deal.
          </Alert>
        )}
        {last && last.kind !== "ok" && (
          <Typography variant="body2" sx={{ mt: 2, color: palette.error }} data-state="write-failed">
            {describe(last)}
          </Typography>
        )}
        {done && (
          <Alert severity="success" variant="outlined" sx={{ mt: 2 }} data-state="write-ok">
            The agent accepted this call.{" "}
            {dealId ? (
              <>
                The new deal is <code>{dealId}</code>.
              </>
            ) : (
              "The new deal will appear in the list."
            )}
          </Alert>
        )}
        {done && dealId && <SendNow dealId={dealId} />}
      </Box>
    );
  }

  return (
    <WizardDialog
      open={open}
      title="New deal"
      steps={STEPS}
      step={step}
      onStep={setStep}
      onClose={close}
      canNext={step !== 1 || ready}
      finishLabel={method === "new-quote" ? (bookable ? "Book deal" : "Get quote") : "Create deal"}
      pendingLabel={method === "new-quote" && !bookable ? "Asking…" : "Creating…"}
      onFinish={finish}
      canFinish={writesEnabled}
      pending={active.pending}
      done={done}
      block="deal-wizard"
    >
      {body}
    </WizardDialog>
  );
}
