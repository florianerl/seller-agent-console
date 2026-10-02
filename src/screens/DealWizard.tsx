import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import {
  bookDeal,
  createCuratedDeal,
  createQuote,
  curators,
  dealFromTemplate,
  generateDeal,
  openProposals,
  type BuyerIdentityFull,
  type ConsentContextInput,
  type LinearTvInput,
  type BuyerIdentityInput,
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
import { CopyButton } from "../components/CopyButton";
import { EnumSelect } from "../components/EnumSelect";
import { TipField } from "../components/TipField";
import { ChoiceCards, ReviewList, WizardDialog } from "../components/Wizard";
import { useCredential } from "../credentials/context";
import { stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import { recordQuote } from "../credentials/recentQuotes";
import { useMutation } from "../query/useMutation";
import { useOpenProposalSupport } from "../query/useOpenProposalSupport";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";
import { CuratorPicker, ProductMultiPicker, ProductPicker, QuotePicker } from "./pickers";
import { Optional } from "./dealFields";
import { useConsent, useJsonObject, useLinearTv, useListField } from "./dealHooks";
import { DistributeForm, PushForm } from "./DealSend";
import { QuoteView, type QuoteAnswer } from "./QuoteView";

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
    description: "Price a product and book it, or book a quote you already have.",
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

/** The clock, behind a name: it is read when a quote lands, never while rendering. */
const now = (): number => Date.now();

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
  return (
    <Box sx={{ mt: 2.5 }} data-block="send-now">
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        Send it now
      </Typography>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1.5 }}>
        Optional. Hands deal <code>{dealId}</code> to a buyer or an SSP. A retry after an unclear
        failure may send it twice.
      </Typography>
      <PushForm dealId={dealId} />
      <Box sx={{ mt: 2 }}>
        <DistributeForm dealId={dealId} />
      </Box>
    </Box>
  );
}

/**
 * One line per product with what became of it. Multi-product runs are a series
 * of independent calls, so some can land and some fail; the operator has to
 * see exactly which, and a product the agent will not quote can be dropped.
 */
function ProductRows({
  rows,
  onRemove,
  removable,
}: {
  rows: readonly { id: string; text: string; bad?: boolean; copy?: string }[];
  onRemove: (id: string) => void;
  removable: (id: string) => boolean;
}) {
  return (
    <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
      {rows.map((r) => (
        <Box
          component="li"
          key={r.id}
          data-product={r.id}
          sx={{ display: "flex", gap: 1.5, alignItems: "baseline", py: 0.5 }}
        >
          <Box sx={{ fontFamily: "monospace", fontSize: 12, flexShrink: 0 }}>{r.id}</Box>
          <Typography
            variant="body2"
            sx={{ flex: 1, color: r.bad ? palette.error : palette.textSecondary, wordBreak: "break-word" }}
            data-state={r.bad ? "product-failed" : "product-status"}
          >
            {r.text}
          </Typography>
          {r.copy && <CopyButton value={r.copy} />}
          {removable(r.id) && (
            <Button size="small" onClick={() => onRemove(r.id)} aria-label={`Remove ${r.id}`}>
              Remove
            </Button>
          )}
        </Box>
      ))}
    </Box>
  );
}

/**
 * Reports how many proposals the agent will list. Its own component because it
 * must only read when the agent advertises OpenProposal (a 2.x agent has no
 * `/api/v3` and must see none of that traffic), and a hook cannot be called
 * conditionally. Same key and page as the Proposals screen's unfiltered list.
 */
function ProposalProbe({ onCount }: { onCount: (n: number) => void }) {
  const list = useResource("open-proposals::", (c, signal) => openProposals(c, { limit: 50, offset: 0 }, signal), {
    refreshInterval: CADENCE.proposals,
  });
  const count = list.data ? list.data.proposals.items.length : undefined;
  useEffect(() => {
    if (count !== undefined) onCount(count);
  }, [count, onCount]);
  return null;
}

export function DealWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { writesEnabled, credential } = useCredential();
  const [step, setStep] = useState(0);
  const [chosen, setMethod] = useState<Method>("new-quote");
  const { support } = useOpenProposalSupport();
  const [proposalCount, setProposalCount] = useState(0);
  const curatorList = useResource("curators", (c, signal) => curators(c, signal), {
    refreshInterval: CADENCE.curators,
  });

  // Offer only the routes there is something to run them on. "From a proposal"
  // needs an accepted proposal and "For a curator" a registered curator; with
  // none, each is a form that can only be refused. A proposal can be checked
  // only where the agent lists them; the legacy routes have no list, so on
  // such an agent the route is not offered (the Proposals screen still has
  // those forms). A curator list that cannot be read leaves the route on: not
  // knowing is not the same as none.
  const available = METHODS.filter((m) => {
    if (m.value === "proposal") return support === "supported" && proposalCount > 0;
    if (m.value === "curated") return !(curatorList.data && curatorList.data.curators.length === 0);
    return true;
  });
  // "Book an existing quote" is the same route as "Quote, then book" entered
  // halfway: both end in booking a quote, and differ only in whether it has to
  // be asked for first. One card and a switch, not two cards that read alike.
  const [haveQuote, setHaveQuote] = useState(false);
  const route: Method = available.some((m) => m.value === chosen) ? chosen : "new-quote";
  const method: Method = route === "new-quote" && haveQuote ? "quote" : route;
  const [quoteId, setQuoteId] = useState("");
  // What a look at the quote found, keyed by the id it was for, so editing the
  // id on the previous step drops an answer about a different quote.
  const [looked, setLooked] = useState<{ id: string; answer: QuoteAnswer } | undefined>();
  const [proposalId, setProposalId] = useState("");
  const [productIds, setProductIds] = useState<string[]>([]);
  // Short code: the template and quote routes map PG/PD/PA and 400 on anything else.
  const [dealType, setDealType] = useState<DealTypeCode>("PD");
  const [mediaType, setMediaType] = useState<QuoteMediaType>("digital");
  const [impressions, setImpressions] = useState("");
  const [curatorId, setCuratorId] = useState("");
  const [flightStart, setFlightStart] = useState("");
  const [flightEnd, setFlightEnd] = useState("");
  // Target CPM on a quote (advisory), max CPM on a template (a ceiling the
  // agent enforces). One field, because an operator holds one number.
  const [cpm, setCpm] = useState("");
  const [notes, setNotes] = useState("");
  const emptyBuyer = {
    advertiser_id: "",
    agency_id: "",
    seat_id: "",
    dsp_platform: "",
    advertiser_name: "",
    advertiser_industry: "",
    agency_name: "",
    agency_holding_company: "",
    seat_name: "",
    campaign_id: "",
    campaign_name: "",
  };
  const [buyer, setBuyer] = useState(emptyBuyer);
  const [agentUrl, setAgentUrl] = useState("");
  const [rateCardId, setRateCardId] = useState("");
  const [dspPlatform, setDspPlatform] = useState("");
  const [curatedDealType, setCuratedDealType] = useState("PMP");
  const [curatedProduct, setCuratedProduct] = useState("");
  const consent = useConsent();
  const audience = useJsonObject(
    "Audience plan (JSON)",
    "An audience plan as a JSON object. The agent checks it against what it supports and rejects the parts it cannot, so it is sent as you write it. Leave empty for none.",
  );
  const linear = useLinearTv();
  const seatList = useListField("Buyer seat ids", "Seat ids the deal is restricted to, separated by commas. Leave empty for any seat.");
  const segmentList = useListField("Audience segments", "Audience segment ids to target, separated by commas.");
  const categoryList = useListField("Content categories", "Content category ids to target, separated by commas.");

  const prods = productIds.map((id) => id.trim()).filter(Boolean);
  const prod = prods[0] ?? "";
  const multi = prods.length > 1;
  // `QuoteRequest` says impressions are required for PG; the others take them optionally.
  const volume = Number(impressions);
  const needsVolume = dealType === "PG";
  const hasVolume = impressions.trim() !== "";
  const volumeOk = Number.isInteger(volume) && volume > 0;
  const impressionsOk = needsVolume ? volumeOk : !hasVolume || volumeOk;
  const cpmValue = Number(cpm);
  const hasCpm = cpm.trim() !== "";
  const cpmOk = !hasCpm || (Number.isFinite(cpmValue) && cpmValue > 0);
  // Both dates or neither: the agent prices a flight, not half of one.
  const flightOk =
    (flightStart === "" && flightEnd === "") ||
    (flightStart !== "" && flightEnd !== "" && flightEnd >= flightStart);
  // The quote and booking routes take the full identity; the template route
  // has a narrower model, so a name or campaign typed here is simply not sent
  // on that route (and its fields are not shown there).
  const buyerFull: BuyerIdentityFull = Object.fromEntries(
    Object.entries(buyer)
      .map(([k, v]) => [k, v.trim()] as const)
      .filter(([, v]) => v !== ""),
  );
  const NARROW = ["seat_id", "agency_id", "advertiser_id", "dsp_platform"] as const;
  const buyerNarrow: BuyerIdentityInput = Object.fromEntries(
    Object.entries(buyerFull).filter(([k]) => (NARROW as readonly string[]).includes(k)),
  );
  const buyerIdentity: BuyerIdentityFull = method === "template" ? buyerNarrow : buyerFull;
  const hasBuyer = Object.keys(buyerIdentity).length > 0;
  const flight = flightStart !== "" ? { flight_start: flightStart, flight_end: flightEnd } : {};
  const bookNotes = notes.trim() ? { notes: notes.trim() } : {};
  // What every product's quote shares; the product is the only thing that differs.
  const quoteCommon = {
    deal_type: dealType,
    media_type: mediaType,
    ...(hasVolume || needsVolume ? { impressions: volume } : {}),
    ...flight,
    ...(hasCpm ? { target_cpm: { amount_micros: Math.round(cpmValue * 1_000_000), currency: "USD" } } : {}),
    ...(hasBuyer ? { buyer_identity: buyerIdentity } : {}),
    ...(agentUrl.trim() ? { agent_url: agentUrl.trim() } : {}),
    ...(rateCardId.trim() ? { rate_card_id: rateCardId.trim() } : {}),
    ...(mediaType === "linear_tv" && linear.value ? { linear_tv: linear.value } : {}),
    ...(audience.value ? { audience_plan: audience.value } : {}),
    ...(consent.value ? { consent_context: consent.value } : {}),
  };
  // The quotes are only worth booking for the request they answered. Change a
  // term after quoting and this changes, which drops them all instead of
  // letting a stale price be booked. The product list is deliberately not in
  // it: each quote is keyed by its product, so adding one product leaves the
  // others' quotes good, and removing one that failed leaves the rest.
  const requestSignature = JSON.stringify(quoteCommon);

  // Idempotency keys, minted once per thing asked and kept: asking again for
  // the same quote replays it, and a different request is a different key. A
  // ref, not state, because minting one must not re-render and a key must not
  // change between a failed call and its retry.
  const keys = useRef(new Map<string, string>());
  const keyFor = (name: string): string => {
    let key = keys.current.get(name);
    if (!key) {
      key = newKey();
      keys.current.set(name, key);
    }
    return key;
  };
  const q = quoteId.trim();

  const invalidates = ["deals:*"];
  const quoteReq = useMutation<
    {
      product_id: string;
      idempotency_key: string;
      deal_type: DealTypeCode;
      media_type: QuoteMediaType;
      impressions?: number;
      flight_start?: string;
      flight_end?: string;
      target_cpm?: { amount_micros: number; currency: string };
      buyer_identity?: BuyerIdentityFull;
      agent_url?: string;
      rate_card_id?: string;
      linear_tv?: LinearTvInput;
      audience_plan?: Record<string, unknown>;
      consent_context?: ConsentContextInput;
    },
    { quote: Quote }
  >((c, a) => createQuote(c, a));
  const book = useMutation<
    {
      quote_id: string;
      idempotency_key: string;
      notes?: string;
      buyer_identity?: BuyerIdentityFull;
      audience_plan?: Record<string, unknown>;
      consent_context?: ConsentContextInput;
    },
    unknown
  >(
    (c, a) => bookDeal(c, a),
    { invalidates },
  );
  const gen = useMutation<{ proposal_id: string; dsp_platform?: string }, unknown>((c, a) => generateDeal(c, a), {
    invalidates,
  });
  const template = useMutation<
    {
      deal_type: DealTypeCode;
      product_id: string;
      impressions?: number;
      max_cpm?: number;
      flight_start?: string;
      flight_end?: string;
      buyer_identity?: BuyerIdentityInput;
      notes?: string;
      agent_url?: string;
    },
    unknown
  >((c, a) => dealFromTemplate(c, a), { invalidates });
  const curated = useMutation<Parameters<typeof createCuratedDeal>[1], unknown>(
    (c, a) => createCuratedDeal(c, a),
    { invalidates },
  );

  // Per-product results. The two routes that take a product (quote then book,
  // template) can take several, and each product is its own call with its own
  // outcome: a batch can half succeed, and the operator has to see which half.
  const [quotes, setQuotes] = useState<Record<string, Result<{ quote: Quote }>>>({});
  const [deals, setDeals] = useState<Record<string, Result<unknown>>>({});
  const [running, setRunning] = useState(false);
  // Which request the held quotes answer; `undefined` until one has been asked.
  const [quotedFor, setQuotedFor] = useState<string | undefined>();
  const quoteFor = (id: string): Quote | undefined => {
    const r = quotedFor === requestSignature ? quotes[id] : undefined;
    return r?.kind === "ok" ? r.data.quote : undefined;
  };
  const batchRoute = method === "new-quote" || method === "template";
  const allQuoted = prods.length > 0 && prods.every((id) => quoteFor(id));
  const remaining = prods.filter((id) => deals[id]?.kind !== "ok");
  const firstDeal = deals[prod];
  const firstQuote = quotedFor === requestSignature ? quotes[prod] : undefined;
  const firstQuoteHeld = quoteFor(prod);

  const active = { "new-quote": book, quote: book, proposal: gen, template, curated }[method];
  // A deal exists only once a booking-type call lands. Getting a quote is not it.
  const done = batchRoute
    ? prods.length > 0 && remaining.length === 0
    : { quote: book, proposal: gen, curated }[method].last?.kind === "ok";
  const busy = running || active.pending;
  // The one result worth showing as an error when there is a single product.
  const last: Result<unknown> | undefined = batchRoute
    ? multi
      ? undefined
      : (firstDeal ?? firstQuote)
    : active.last;
  const dealId =
    done && !multi
      ? createdDealId((batchRoute ? (firstDeal?.kind === "ok" ? firstDeal.data : undefined) : active.last?.kind === "ok" ? active.last.data : undefined))
      : undefined;

  const onQuoteAnswer = useCallback(
    (answer: QuoteAnswer | undefined) => setLooked(answer ? { id: q, answer } : undefined),
    [q],
  );
  // Booking a quote the agent just said it lacks, or refuses as expired, can
  // only fail; the button stays off rather than send it.
  const deadQuote = method === "quote" && looked?.id === q && looked.answer !== "found";

  const p = proposalId.trim();
  const cur = curatorId.trim();
  const ready = {
    "new-quote":
      prods.length > 0 &&
      impressionsOk &&
      cpmOk &&
      flightOk &&
      audience.valid &&
      consent.valid &&
      (mediaType !== "linear_tv" || linear.valid),
    quote: q !== "" && audience.valid && consent.valid,
    proposal: p !== "",
    template: prods.length > 0 && impressionsOk && cpmOk && flightOk,
    curated: cur !== "" && impressionsOk && cpmOk && flightOk,
  }[method];

  const dealTypeLabel = DEAL_TYPES.find((t) => t.value === dealType)?.label ?? dealType;
  const termRows: [string, string][] = [];
  if (hasVolume || needsVolume) termRows.push(["Impressions", impressions.trim()]);
  if (flightStart !== "") termRows.push(["Flight", `${flightStart} → ${flightEnd}`]);
  if (hasCpm) termRows.push([method === "template" ? "Max CPM" : "Target CPM", `$${cpm.trim()}`]);
  if (hasBuyer)
    termRows.push(["Buyer", Object.entries(buyerIdentity).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(", ")]);
  if (notes.trim()) termRows.push(["Notes", notes.trim()]);
  if (method === "new-quote" && mediaType === "linear_tv" && linear.value)
    termRows.push(["Linear TV", `${linear.value.target_demo}, ${linear.value.spot_length}s spots`]);
  if (agentUrl.trim()) termRows.push(["Agent URL", agentUrl.trim()]);
  if (method === "new-quote" && rateCardId.trim()) termRows.push(["Rate card", rateCardId.trim()]);
  if (audience.value) termRows.push(["Audience plan", "included"]);
  if (consent.value) termRows.push(["Privacy consent", "included"]);
  const quoteRows: [string, string][] = [["Quote", q]];
  if (notes.trim()) quoteRows.push(["Notes", notes.trim()]);
  if (hasBuyer) quoteRows.push(["Buyer", Object.keys(buyerIdentity).length + " details"]);
  if (audience.value) quoteRows.push(["Audience plan", "included"]);
  if (consent.value) quoteRows.push(["Privacy consent", "included"]);
  const summary: [string, string][] = {
    "new-quote": [
      [multi ? "Products" : "Product", prods.join(", ")],
      ["Deal type", dealTypeLabel],
      ["Media type", mediaType],
      ...termRows,
    ] as [string, string][],
    quote: quoteRows,
    proposal: [["Proposal", p]] as [string, string][],
    template: [
      [multi ? "Products" : "Product", prods.join(", ")],
      ["Deal type", dealTypeLabel],
      ...termRows,
    ] as [string, string][],
    curated: [["Curator", cur]] as [string, string][],
  }[method];

  async function runQuotes() {
    setRunning(true);
    // A changed request starts a fresh set; the same request keeps what already landed.
    let current = quotedFor === requestSignature ? quotes : {};
    setQuotedFor(requestSignature);
    for (const id of prods) {
      if (current[id]?.kind === "ok") continue;
      const r = await quoteReq.run({
        ...quoteCommon,
        product_id: id,
        idempotency_key: keyFor(`quote-request|${requestSignature}|${id}`),
      });
      current = { ...current, [id]: r };
      setQuotes(current);
      // The id comes back once. Keep it, so the negotiation and the booking
      // that follow can find it again.
      if (r.kind === "ok" && credential) {
        const made = r.data.quote;
        const cpm = made.pricing?.final_cpm;
        void recordQuote(credential.credId, {
          quote_id: made.quote_id,
          product_id: id,
          product_name: made.product?.name || null,
          deal_type: made.deal_type || dealType,
          final_cpm_micros: cpm ? cpm.amount_micros : null,
          currency: cpm?.currency || "USD",
          expires_at: made.expires_at,
          created_at: now(),
        });
      }
    }
    setRunning(false);
  }

  /**
   * One booking call per product, in turn. Each carries a key tied to its quote,
   * so booking again after a failure replays what already landed instead of
   * booking twice; that is why this does not use the bulk route, which has no key.
   */
  async function runBooking() {
    setRunning(true);
    let current = deals;
    for (const id of prods) {
      const held = quoteFor(id);
      if (current[id]?.kind === "ok" || !held) continue;
      const r = await book.run({
        quote_id: held.quote_id,
        idempotency_key: keyFor(`quote|${held.quote_id}`),
        ...bookNotes,
        // The identity the quote was priced for: the agent re-verifies the tier at booking.
        ...(hasBuyer ? { buyer_identity: buyerIdentity } : {}),
        ...(audience.value ? { audience_plan: audience.value } : {}),
        ...(consent.value ? { consent_context: consent.value } : {}),
      });
      current = { ...current, [id]: r };
      setDeals(current);
    }
    setRunning(false);
  }

  /**
   * Not idempotent, so no key and no automatic second try: a product that
   * failed is run again only when the operator presses the button again.
   */
  async function runTemplates() {
    setRunning(true);
    let current = deals;
    for (const id of prods) {
      if (current[id]?.kind === "ok") continue;
      const r = await template.run({
        deal_type: dealType,
        product_id: id,
        ...(hasVolume ? { impressions: volume } : {}),
        ...(hasCpm ? { max_cpm: cpmValue } : {}),
        ...flight,
        ...(hasBuyer ? { buyer_identity: buyerIdentity } : {}),
        ...bookNotes,
        ...(agentUrl.trim() ? { agent_url: agentUrl.trim() } : {}),
      });
      current = { ...current, [id]: r };
      setDeals(current);
    }
    setRunning(false);
  }

  function finish() {
    switch (method) {
      case "new-quote":
        return void (allQuoted ? runBooking() : runQuotes());
      case "quote":
        return void book.run({
          quote_id: q,
          idempotency_key: keyFor(`quote|${q}`),
          ...bookNotes,
          ...(hasBuyer ? { buyer_identity: buyerIdentity } : {}),
          ...(audience.value ? { audience_plan: audience.value } : {}),
          ...(consent.value ? { consent_context: consent.value } : {}),
        });
      case "proposal":
        return void gen.run({ proposal_id: p, ...(dspPlatform.trim() ? { dsp_platform: dspPlatform.trim() } : {}) });
      case "template":
        return void runTemplates();
      case "curated":
        return void curated.run({
          curator_id: cur,
          ...(curatedDealType.trim() ? { deal_type: curatedDealType.trim() } : {}),
          ...(curatedProduct.trim() ? { product_id: curatedProduct.trim() } : {}),
          ...(hasCpm ? { max_cpm: cpmValue } : {}),
          ...(hasVolume ? { impressions: volume } : {}),
          ...flight,
          ...(seatList.value ? { buyer_seat_ids: seatList.value } : {}),
          ...(segmentList.value ? { audience_segments: segmentList.value } : {}),
          ...(categoryList.value ? { content_categories: categoryList.value } : {}),
        });
    }
  }

  function close() {
    if (busy) return;
    onClose();
    // Reset after the dialog has gone, so a closing dialog does not flash back
    // to its first step. A finished wizard starts clean; an abandoned one too.
    setTimeout(() => {
      setStep(0);
      setQuoteId("");
      setLooked(undefined);
      setHaveQuote(false);
      setProposalId("");
      setProductIds([]);
      setQuotes({});
      setDeals({});
      keys.current.clear();
      setImpressions("");
      setCuratorId("");
      setFlightStart("");
      setFlightEnd("");
      setCpm("");
      setNotes("");
      setBuyer(emptyBuyer);
      setAgentUrl("");
      setRateCardId("");
      setDspPlatform("");
      setCuratedDealType("PMP");
      setCuratedProduct("");
      consent.reset();
      audience.reset();
      linear.reset();
      seatList.reset();
      segmentList.reset();
      categoryList.reset();
      setQuotedFor(undefined);
      quoteReq.reset();
      book.reset();
      gen.reset();
      template.reset();
      curated.reset();
    }, 200);
  }

  const notesField = (
    <TipField
      hint="Optional note kept on the deal. Sent when the deal is booked."
      size="small"
      label="Notes (optional)"
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      fullWidth
      multiline
      minRows={2}
    />
  );
  const buyerField = (key: keyof typeof buyer, label: string, hint: string) => (
    <TipField
      hint={hint}
      size="small"
      label={label}
      value={buyer[key]}
      onChange={(e) => setBuyer({ ...buyer, [key]: e.target.value })}
      fullWidth
    />
  );
  // The commercial terms, shared by the two routes that price a product. The
  // agent prices from its own rate card, so everything here is optional except
  // the volume a guaranteed deal cannot be priced without.
  const buyerSection = (
    <Optional summary="Buyer details (optional)">
      <Typography variant="caption" color="text.secondary">
        Who the deal is for. The agent uses it to pick the pricing tier, capped by what its
        registry can verify, so it can change the rate.
      </Typography>
      {buyerField("advertiser_id", "Advertiser id", "The advertiser the deal is for.")}
      {buyerField("agency_id", "Agency id", "The agency buying on the advertiser's behalf.")}
      {buyerField("seat_id", "Seat id", "The DSP seat the deal will be activated on.")}
      {buyerField("dsp_platform", "DSP platform", "DSP platform slug, for example ttd or dv360.")}
      {method !== "template" && (
        <>
          {buyerField("advertiser_name", "Advertiser name", "Display name of the advertiser.")}
          {buyerField("advertiser_industry", "Advertiser industry", "Industry the advertiser is in.")}
          {buyerField("agency_name", "Agency name", "Display name of the agency.")}
          {buyerField("agency_holding_company", "Agency holding company", "Holding company the agency belongs to.")}
          {buyerField("seat_name", "Seat name", "Display name of the DSP platform.")}
          {buyerField("campaign_id", "Campaign id", "Scopes the deal to one campaign.")}
          {buyerField("campaign_name", "Campaign name", "Display name of the campaign.")}
        </>
      )}
    </Optional>
  );
  const moreOptions = (
    <>
      <Optional summary="More options (optional)">
        <TipField
          hint="A2A endpoint of the buyer agent making the request, so the agent can verify its trust in its registry."
          size="small"
          label="Agent URL"
          value={agentUrl}
          onChange={(e) => setAgentUrl(e.target.value)}
          fullWidth
        />
        {method === "new-quote" && (
          <>
            <TipField
              hint="Id of the private rate card to price against, issued by the seller. The rate card itself is never sent."
              size="small"
              label="Rate card id"
              value={rateCardId}
              onChange={(e) => setRateCardId(e.target.value)}
              fullWidth
            />
            {audience.node}
          </>
        )}
      </Optional>
      {method === "new-quote" && consent.node}
    </>
  );
  const terms = (
    <>
      <TipField
        hint={
          needsVolume
            ? "Number of impressions. Required for a guaranteed (PG) deal and a whole number above zero."
            : "Optional number of impressions, a whole number above zero. Volume can change the rate."
        }
        size="small"
        type="number"
        label={needsVolume ? "Impressions" : "Impressions (optional)"}
        value={impressions}
        onChange={(e) => setImpressions(e.target.value)}
        error={impressions.trim() !== "" && !volumeOk}
        fullWidth
      />
      {/* The hint wrapper is an inline-block span; let each date take half the row. */}
      <Box sx={{ display: "flex", gap: 2, "& > span": { flex: 1 } }}>
        <TipField
          hint="First day of the flight. Give both dates or neither."
          size="small"
          label="Flight start (optional)"
          type="date"
          slotProps={{ inputLabel: { shrink: true } }}
          value={flightStart}
          onChange={(e) => setFlightStart(e.target.value)}
          fullWidth
        />
        <TipField
          hint="Last day of the flight, on or after the start."
          size="small"
          label="Flight end (optional)"
          type="date"
          slotProps={{ inputLabel: { shrink: true } }}
          value={flightEnd}
          onChange={(e) => setFlightEnd(e.target.value)}
          error={!flightOk && flightEnd !== ""}
          fullWidth
        />
      </Box>
      <TipField
        hint={
          method === "template"
            ? "Optional ceiling in dollars, a plain number such as 12.50. The deal is refused with a 422 when this is below the seller's floor price."
            : "Optional CPM you would like, in dollars, a plain number such as 12.50. Advisory: the agent prices from its own rate card."
        }
        size="small"
        type="number"
        label={method === "template" ? "Max CPM (optional)" : "Target CPM (optional)"}
        value={cpm}
        onChange={(e) => setCpm(e.target.value)}
        error={!cpmOk}
        fullWidth
      />
      {notesField}
      {buyerSection}
      {moreOptions}
    </>
  );

  const left = remaining.length;
  const finishLabel =
    method === "new-quote"
      ? allQuoted
        ? multi
          ? `Book ${left === 1 ? "deal" : `${left} deals`}`
          : "Book deal"
        : multi
          ? "Get quotes"
          : "Get quote"
      : method === "template" && multi
        ? `Create ${left === 1 ? "deal" : `${left} deals`}`
        : "Create deal";

  let body: ReactNode;
  if (step === 0) {
    body = (
      <ChoiceCards value={route} onChange={setMethod} options={available} label="How to create the deal" />
    );
  } else if (step === 1) {
    body = (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        {route === "new-quote" && (
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={haveQuote ? "have" : "new"}
            onChange={(_, next: "new" | "have" | null) => next && setHaveQuote(next === "have")}
            aria-label="Where the quote comes from"
          >
            <ToggleButton value="new">Get a new quote</ToggleButton>
            <ToggleButton value="have">I have a quote id</ToggleButton>
          </ToggleButtonGroup>
        )}
        {method === "new-quote" && (
          <>
            <ProductMultiPicker
              value={productIds}
              onChange={setProductIds}
              label="Products"
              hint="The products to quote. Pick one or several, or type or paste ids. Each gets its own quote and its own deal, with the terms below."
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
              hint="Media type the quote is for. Linear TV is priced on ratings and asks for its own details."
              label="Media type"
              value={mediaType}
              options={QUOTE_MEDIA_TYPES}
              onChange={(v) => v && setMediaType(v)}
              sx={{ width: "100%" }}
            />
            {mediaType === "linear_tv" && linear.node}
            {terms}
          </>
        )}
        {method === "quote" && (
          <QuotePicker
            value={quoteId}
            onChange={setQuoteId}
            hint="Id of the quote to book. Pick one you made here, or paste one; an order that came from a quote shows its id. Quotes expire after 24 hours."
            sx={{ width: "100%" }}
          />
        )}
        {method === "quote" && notesField}
        {method === "quote" && (
          <>
            {buyerSection}
            {audience.node}
            {consent.node}
          </>
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
        {method === "proposal" && (
          <TipField
            hint="DSP platform slug the deal is for, for example ttd or dv360. Optional."
            size="small"
            label="DSP platform (optional)"
            value={dspPlatform}
            onChange={(e) => setDspPlatform(e.target.value)}
            fullWidth
          />
        )}
        {method === "template" && (
          <>
            <ProductMultiPicker
              value={productIds}
              onChange={setProductIds}
              label="Products"
              hint="The products to price and book. Pick one or several, or type or paste ids. Each becomes its own deal, with the terms below."
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
            {terms}
          </>
        )}
        {method === "curated" && (
          <>
            <CuratorPicker value={curatorId} onChange={setCuratorId} sx={{ width: "100%" }} />
            <TipField
              hint="Deal type for the curated deal. The agent defaults it to PMP; this route does not use the PG, PD and PA codes."
              size="small"
              label="Deal type"
              value={curatedDealType}
              onChange={(e) => setCuratedDealType(e.target.value)}
              fullWidth
            />
            <ProductPicker value={curatedProduct} onChange={setCuratedProduct} hint="Optional product to base the curated deal on. Pick one, or type or paste an id." sx={{ width: "100%" }} />
            <TipField
              hint="Optional ceiling in dollars for the CPM, a plain number such as 12.50."
              size="small"
              type="number"
              label="Max CPM (optional)"
              value={cpm}
              onChange={(e) => setCpm(e.target.value)}
              error={!cpmOk}
              fullWidth
            />
            <TipField
              hint="Optional number of impressions, a whole number above zero."
              size="small"
              type="number"
              label="Impressions (optional)"
              value={impressions}
              onChange={(e) => setImpressions(e.target.value)}
              error={impressions.trim() !== "" && !volumeOk}
              fullWidth
            />
            <Box sx={{ display: "flex", gap: 2, "& > span": { flex: 1 } }}>
              <TipField
                hint="First day of the flight. Give both dates or neither."
                size="small"
                label="Flight start (optional)"
                type="date"
                slotProps={{ inputLabel: { shrink: true } }}
                value={flightStart}
                onChange={(e) => setFlightStart(e.target.value)}
                fullWidth
              />
              <TipField
                hint="Last day of the flight, on or after the start."
                size="small"
                label="Flight end (optional)"
                type="date"
                slotProps={{ inputLabel: { shrink: true } }}
                value={flightEnd}
                onChange={(e) => setFlightEnd(e.target.value)}
                error={!flightOk && flightEnd !== ""}
                fullWidth
              />
            </Box>
            {seatList.node}
            {segmentList.node}
            {categoryList.node}
          </>
        )}
      </Box>
    );
  } else {
    body = (
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          {method === "quote" ? "Book an existing quote" : METHODS.find((m) => m.value === method)?.title}
        </Typography>
        <ReviewList rows={summary} />
        {method === "new-quote" ? (
          multi ? (
            <Box sx={{ mt: 2 }} data-block="batch">
              <ProductRows
                rows={prods.map((id) => {
                  const d = deals[id];
                  const held = quoteFor(id);
                  const asked = quotedFor === requestSignature ? quotes[id] : undefined;
                  if (d?.kind === "ok") {
                    const made = createdDealId(d.data);
                    return { id, text: `booked${made ? ` · deal ${made}` : ""}` };
                  }
                  if (d) return { id, text: describe(d), bad: true };
                  if (held)
                    return {
                      id,
                      text: `quoted · ${money(held.pricing?.final_cpm)} CPM · ${held.quote_id}${held.expires_at ? ` · expires ${stamp(held.expires_at)}` : ""}`,
                      copy: held.quote_id,
                    };
                  if (asked) return { id, text: describe(asked), bad: true };
                  return { id, text: "not asked yet" };
                })}
                onRemove={(id) => setProductIds(productIds.filter((x) => x.trim() !== id))}
                removable={(id) => !done && deals[id]?.kind !== "ok"}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                {allQuoted
                  ? "Booking binds each quote and creates its deal, one call per product. Booking again after a failure replays the ones that landed instead of booking them twice. Quotes expire after 24 hours; going back and changing the request discards them."
                  : "Asks the agent for a price per product. A quote is non-binding and expires after 24 hours; nothing is booked until you press Book on the next screen. A product it cannot quote can be removed here."}
              </Typography>
            </Box>
          ) : firstQuoteHeld ? (
            <Box sx={{ mt: 2 }} data-block="quote-held">
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                Quoted
              </Typography>
              <ReviewList
                rows={[
                  [
                    "Quote",
                    <>
                      {firstQuoteHeld.quote_id} <CopyButton value={firstQuoteHeld.quote_id} />
                    </>,
                  ],
                  ["Rate", `${money(firstQuoteHeld.pricing?.final_cpm)} CPM`],
                  ...(firstQuoteHeld.expires_at ? [["Expires", stamp(firstQuoteHeld.expires_at)] as const] : []),
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
        ) : method === "template" && multi ? (
          <Box sx={{ mt: 2 }} data-block="batch">
            <ProductRows
              rows={prods.map((id) => {
                const d = deals[id];
                if (d?.kind === "ok") {
                  const made = createdDealId(d.data);
                  return { id, text: `created${made ? ` · deal ${made}` : ""}` };
                }
                if (d) return { id, text: describe(d), bad: true };
                return { id, text: "ready" };
              })}
              onRemove={(id) => setProductIds(productIds.filter((x) => x.trim() !== id))}
              removable={(id) => !done && deals[id]?.kind !== "ok"}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              {CONSEQUENCE.template} One deal per product, in turn. If a product fails, pressing the
              button again runs only the ones that have not been created; a failure with no clear
              refusal may still have created its deal, so check the Deals list before trying again.
            </Typography>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {CONSEQUENCE[method]}
          </Typography>
        )}
        {method === "quote" && !done && (
          <Box sx={{ mt: 2 }} data-block="quote-check">
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              Check the quote first (optional)
            </Typography>
            <QuoteView key={q} quoteId={q} showId={false} onAnswer={onQuoteAnswer} />
            {deadQuote && (
              <Typography variant="body2" sx={{ mt: 1, color: palette.error }} data-state="quote-unbookable">
                {looked?.answer === "expired"
                  ? "This quote has expired, so booking it would be refused. Start a new quote instead."
                  : "The agent has no quote with this id, so booking it would fail. Check the id on the previous step."}
              </Typography>
            )}
          </Box>
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
        {done && multi && (
          <Alert severity="success" variant="outlined" sx={{ mt: 2 }} data-state="write-ok">
            All {prods.length} deals were created. They will appear in the list.
          </Alert>
        )}
        {done && !multi && (
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
        {done && dealId && !multi && <SendNow dealId={dealId} />}
      </Box>
    );
  }

  return (
    <>
      {support === "supported" && <ProposalProbe onCount={setProposalCount} />}
    <WizardDialog
      open={open}
      title="New deal"
      steps={STEPS}
      step={step}
      onStep={setStep}
      onClose={close}
      canNext={step !== 1 || ready}
      finishLabel={finishLabel}
      pendingLabel={method === "new-quote" && !allQuoted ? "Asking…" : "Creating…"}
      onFinish={finish}
      canFinish={writesEnabled && !deadQuote && (!batchRoute || prods.length > 0)}
      pending={busy}
      done={done}
      block="deal-wizard"
    >
      {body}
    </WizardDialog>
    </>
  );
}
