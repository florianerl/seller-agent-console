import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { quoteById, type Money, type Quote } from "../api/endpoints";
import { describe } from "../api/errors";
import { Field, FieldGrid } from "../components/Field";
import { GatedNotice } from "../components/GatedNotice";
import { StatusChip } from "../components/StatusChip";
import { stamp } from "../lib/time";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";

const heading = { fontSize: 12, fontWeight: 600, mb: 0.5 } as const;

/** Prices cross the wire as an integer count of millionths, never as a float. */
function money(amount: Money | null | undefined): string {
  if (!amount) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: amount.currency || "USD",
  }).format(amount.amount_micros / 1_000_000);
}

function pct(n: number): string {
  return `${n}%`;
}

function yesNo(v: boolean): string {
  return v ? "Yes" : "No";
}

function Mono({ children }: { children: string | null }) {
  return (
    <Box component="span" sx={{ fontFamily: "monospace", fontSize: 12 }}>
      {children || "—"}
    </Box>
  );
}

function QuoteCard({ quote }: { quote: Quote }) {
  const { pricing, terms, availability, product } = quote;
  return (
    <Stack spacing={2} data-block="quote-card">
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <StatusChip status={quote.status} />
        <Typography variant="body2" color="text.secondary">
          {quote.deal_type} · {quote.buyer_tier} tier
        </Typography>
      </Stack>

      <FieldGrid min={160}>
        <Field label="Quote">
          <Mono>{quote.quote_id}</Mono>
        </Field>
        <Field label="Product">{product?.name || product?.product_id || "—"}</Field>
        <Field label="Created">{stamp(quote.created_at)}</Field>
        <Field label="Expires">{stamp(quote.expires_at)}</Field>
        <Field label="Deal">
          <Mono>{quote.deal_id}</Mono>
        </Field>
        <Field label="Rate card">
          <Mono>{quote.rate_card_id}</Mono>
        </Field>
      </FieldGrid>

      {pricing ? (
        <Box data-block="quote-pricing">
          <Typography sx={heading}>Pricing</Typography>
          <FieldGrid min={140}>
            <Field label="Model">{pricing.pricing_model}</Field>
            <Field label="Base CPM">{money(pricing.base_cpm)}</Field>
            <Field label="Final CPM">{money(pricing.final_cpm)}</Field>
            {pricing.base_cpp || pricing.final_cpp ? (
              <>
                <Field label="Base CPP">{money(pricing.base_cpp)}</Field>
                <Field label="Final CPP">{money(pricing.final_cpp)}</Field>
              </>
            ) : null}
            <Field label="Tier discount">{pct(pricing.tier_discount_pct)}</Field>
            <Field label="Volume discount">{pct(pricing.volume_discount_pct)}</Field>
          </FieldGrid>
        </Box>
      ) : null}

      {terms ? (
        <Box data-block="quote-terms">
          <Typography sx={heading}>Terms</Typography>
          <FieldGrid min={140}>
            <Field label="Impressions">{terms.impressions?.toLocaleString() ?? "—"}</Field>
            <Field label="Flight start">{stamp(terms.flight_start)}</Field>
            <Field label="Flight end">{stamp(terms.flight_end)}</Field>
            <Field label="Guaranteed">{yesNo(terms.guaranteed)}</Field>
            <Field label="GRPs">{terms.grps ?? "—"}</Field>
            <Field label="Target demo">{terms.target_demo || "—"}</Field>
          </FieldGrid>
        </Box>
      ) : null}

      {availability ? (
        <Box data-block="quote-availability">
          <Typography sx={heading}>Availability</Typography>
          <FieldGrid min={140}>
            <Field label="Inventory available">{yesNo(availability.inventory_available)}</Field>
            <Field label="Est. fill rate">
              {availability.estimated_fill_rate == null
                ? "—"
                : pct(Math.round(availability.estimated_fill_rate * 100))}
            </Field>
            <Field label="Competing demand">{availability.competing_demand || "—"}</Field>
          </FieldGrid>
        </Box>
      ) : null}
    </Stack>
  );
}

/**
 * What the agent said about a quote, for a caller that acts on it. Only the
 * two answers that make booking pointless are named; a failed read says
 * nothing about the quote, so it is `undefined` like no read at all.
 */
export type QuoteAnswer = "found" | "unknown" | "expired";

function QuoteResult({ quoteId, onAnswer }: { quoteId: string; onAnswer?: (answer: QuoteAnswer | undefined) => void }) {
  // `manual`: the operator confirmed this one fetch. The provider's default
  // refetch on focus would re-run a GET that writes, unconfirmed.
  const quote = useResource(`quote:${quoteId}`, (c, signal) => quoteById(c, quoteId, signal), {
    manual: true,
  });

  // 404 and 410 are answers about the quote, not outages. A 404 is the usual
  // answer for anything a day old: upstream stores quotes with a 24-hour
  // storage TTL (renewed for 24 hours on booking), and once that lapses the row
  // is gone, so the 410 for an expired quote is rarely seen. An order also
  // stores whatever quote id it was created with, unchecked.
  const status = quote.result?.kind === "unavailable" ? quote.result.status : undefined;
  // A stored status of `expired` is the same answer as a 410, arrived earlier.
  const answer: QuoteAnswer | undefined =
    status === 404
      ? "unknown"
      : status === 410 || quote.data?.quote.status === "expired"
        ? "expired"
        : quote.data
          ? "found"
          : undefined;
  useEffect(() => onAnswer?.(answer), [answer, onAnswer]);

  if (quote.freshness === "blocked") {
    return <GatedNotice what="This quote" result={quote.result} />;
  }

  return (
    <Box sx={{ mt: 2 }} data-block="quote-result">
      {quote.loading && !quote.data ? (
        <Skeleton height={28} />
      ) : !quote.data ? (
        <Typography
          variant="body2"
          color="text.secondary"
          data-state={status === 404 ? "unknown-quote" : status === 410 ? "expired-quote" : "failed"}
        >
          {status === 404
            ? "The agent has no quote with this id. It deletes a quote 24 hours after issuing it, or 24 hours after it was booked, so a quote behind an older order is usually gone. It also never checked that an order's quote id existed. This is not an outage."
            : status === 410
              ? "This quote has expired. The agent enforces a TTL and refuses an expired quote."
              : quote.result
                ? describe(quote.result)
                : ""}
        </Typography>
      ) : (
        <>
          <QuoteCard quote={quote.data.quote} />
          <Typography
            variant="caption"
            component="p"
            data-freshness={quote.freshness}
            sx={{
              mt: 1.5,
              color: quote.freshness === "stale" ? palette.warningText : palette.textSecondary,
            }}
          >
            {quote.freshness === "live" &&
              quote.asOf !== undefined &&
              `as of ${stamp(new Date(quote.asOf).toISOString())}`}
            {quote.freshness === "stale" && "couldn't refresh — showing the last quote received"}
          </Typography>
        </>
      )}
    </Box>
  );
}

/**
 * One quote, by id, behind a button. The New deal wizard (a quote about to be
 * booked) and an order with no deal to read its terms from both use it. This used to be a screen of its own; the agent cannot list quotes, so
 * an id in hand was the only way anyone arrived there anyway.
 *
 * Fetched on a click, never on mount: `GET /quotes/{id}` enforces the quote's
 * TTL and persists `expired`, so opening a row or reaching a wizard step must
 * not write. The disclosure sits beside the button rather than in a tooltip
 * because it is the reason the button exists.
 */
export function QuoteView({
  quoteId,
  showId = true,
  onAnswer,
}: {
  quoteId: string;
  /** Off where the id is already on screen beside it. */
  showId?: boolean;
  onAnswer?: (answer: QuoteAnswer | undefined) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Box data-block="quote-view">
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        {showId && <Mono>{quoteId}</Mono>}
        {!open && (
          <Button size="small" variant="outlined" onClick={() => setOpen(true)} data-action="fetch-quote">
            Show quote
          </Button>
        )}
      </Stack>
      <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 0.5 }} data-note="writes">
        Reading a quote makes the agent write: it checks the quote&apos;s expiry and stores{" "}
        <code>expired</code> if it has passed, even when this console&apos;s write switch is off.
      </Typography>
      {open && <QuoteResult quoteId={quoteId} {...(onAnswer ? { onAnswer } : {})} />}
    </Box>
  );
}
