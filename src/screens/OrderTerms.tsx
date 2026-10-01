import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { deals, type Deal, type DealList, type Money } from "../api/endpoints";
import { describe } from "../api/errors";
import { DetailCard } from "../components/DetailCard";
import { ReloadButton } from "../components/ReloadButton";
import { Field, FieldGrid } from "../components/Field";
import { GatedNotice } from "../components/GatedNotice";
import { StatusChip } from "../components/StatusChip";
import { day, stamp } from "../lib/time";
import { useResource, type ResourceHandle } from "../query/useResource";
import { palette } from "../theme/palette";
import { QuoteView } from "./QuoteView";

/** Prices cross the wire as an integer count of millionths, never as a float. */
function money(amount: Money | null | undefined): string {
  if (!amount) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: amount.currency || "USD",
  }).format(amount.amount_micros / 1_000_000);
}

function DealFields({ deal }: { deal: Deal }) {
  const { pricing, terms } = deal;
  return (
    <Stack spacing={1.5} data-block="deal-terms">
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <StatusChip status={deal.status} />
        <Typography variant="body2" color="text.secondary">
          {deal.deal_type} · {deal.buyer_tier} tier
        </Typography>
      </Stack>
      <FieldGrid min={140}>
        <Field label="Product">{deal.product?.name || deal.product?.product_id || "—"}</Field>
        <Field label="Final CPM">{money(pricing?.final_cpm)}</Field>
        <Field label="Base CPM">{money(pricing?.base_cpm)}</Field>
        <Field label="Model">{pricing?.pricing_model ?? "—"}</Field>
        <Field label="Impressions">{terms?.impressions?.toLocaleString() ?? "—"}</Field>
        <Field label="Flight">
          {terms?.flight_start || terms?.flight_end ? `${day(terms.flight_start)} → ${day(terms.flight_end)}` : "—"}
        </Field>
        <Field label="Guaranteed">{terms ? (terms.guaranteed ? "Yes" : "No") : "—"}</Field>
        <Field label="Expires">{stamp(deal.expires_at)}</Field>
      </FieldGrid>
    </Stack>
  );
}

function FromDealList({
  dealId,
  quoteId,
  list,
}: {
  dealId: string;
  quoteId: string | null;
  list: ResourceHandle<DealList>;
}) {
  if (list.freshness === "blocked") {
    return (
      <>
        <GatedNotice what="The deal list" result={list.result} />
        {quoteId && <QuoteFallback quoteId={quoteId} why="The deal list is operator-only." />}
      </>
    );
  }
  if (list.loading && !list.data) return <Skeleton height={28} />;
  if (!list.data) {
    return (
      <>
        <Typography variant="body2" color="text.secondary" data-state="deals-failed">
          {list.result ? describe(list.result) : ""}
        </Typography>
        {quoteId && <QuoteFallback quoteId={quoteId} why="The deal list could not be read." />}
      </>
    );
  }

  const deal = list.data.deals.find((d) => d.deal.deal_id === dealId)?.deal;
  if (!deal) {
    const skipped = list.data.skipped.includes(dealId);
    return (
      <>
        <Typography variant="body2" color="text.secondary" data-state={skipped ? "deal-skipped" : "deal-missing"}>
          {skipped
            ? `The agent holds deal ${dealId} but could not put it into the list's shape, so its terms cannot be shown.`
            : `Deal ${dealId} is not in the agent's deal list. An order stores whatever deal id it was created with, unchecked.`}
        </Typography>
        {quoteId && <QuoteFallback quoteId={quoteId} why="The deal is not available." />}
      </>
    );
  }

  return (
    <>
      <DealFields deal={deal} />
      <Typography
        variant="caption"
        component="p"
        data-freshness={list.freshness}
        sx={{ mt: 1.5, color: list.freshness === "stale" ? palette.warningText : palette.textSecondary }}
      >
        {list.freshness === "live" &&
          list.asOf !== undefined &&
          `From deal ${dealId}, as of ${stamp(new Date(list.asOf).toISOString())}`}
        {list.freshness === "stale" && "couldn't refresh — showing the deal list last received"}
      </Typography>
    </>
  );
}

function QuoteFallback({ quoteId, why }: { quoteId: string; why: string }) {
  return (
    <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${palette.line}` }} data-block="quote-fallback">
      <Typography variant="body2" sx={{ mb: 1 }}>
        {why} The quote it was priced from may still be held; the agent keeps one for 24 hours.
      </Typography>
      <QuoteView quoteId={quoteId} />
    </Box>
  );
}

const TERMS_INFO =
  "What the order was made on. They are read from its deal, which keeps them; the quote behind it is deleted 24 hours after it was issued or booked, so it is offered only when there is no deal.";

/**
 * The price and terms an order was made on. The deal is where they last:
 * the agent deletes a quote 24 hours after issuing or booking it, so the
 * quote card this replaced answered 404 for almost every order a day old.
 * The quote is still offered when there is no deal to read it from.
 *
 * Read from the deal list, not `GET /deals/{id}`: that route lazily expires
 * the deal and persists it, and the list carries the same envelope. The list
 * is an unpaginated full scan, so it never polls (`CADENCE.deals` is 0) and
 * does not refetch on focus; it is read when the row opens, and again only
 * from the card's reload button.
 */
function FromDeal({ dealId, quoteId }: { dealId: string; quoteId: string | null }) {
  // Same key as the Deals screen and the deal picker, so a list already read
  // there is reused rather than scanned again.
  const list = useResource("deals:", (c, signal) => deals(c, {}, signal), { manual: true });

  return (
    <DetailCard
      block="terms"
      title="Price and terms"
      info={TERMS_INFO}
      meta={<ReloadButton onClick={list.refresh} busy={list.validating} what="price and terms" />}
    >
      <Box data-block="order-terms">
        <FromDealList dealId={dealId} quoteId={quoteId} list={list} />
      </Box>
    </DetailCard>
  );
}

export function OrderTermsCard({ dealId, quoteId }: { dealId: string | null; quoteId: string | null }) {
  if (dealId) return <FromDeal dealId={dealId} quoteId={quoteId} />;
  if (!quoteId) return null;
  return (
    <DetailCard block="terms" title="Price and terms" info={TERMS_INFO}>
      <QuoteView quoteId={quoteId} />
    </DetailCard>
  );
}
