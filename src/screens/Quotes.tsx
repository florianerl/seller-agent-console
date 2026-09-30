import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useSearchParams } from "react-router";
import { quoteById, type Money, type Quote } from "../api/endpoints";
import { describe } from "../api/errors";
import { Field, FieldGrid } from "../components/Field";
import { GatedNotice } from "../components/GatedNotice";
import { PageHeader } from "../components/PageHeader";
import { StatusChip } from "../components/StatusChip";
import { FormRow } from "../components/WriteForm";
import { WritesNotice } from "../components/WritesNotice";
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

function QuoteResult({ quoteId }: { quoteId: string }) {
  // `manual`: the operator confirmed this one fetch. The provider's default
  // refetch on focus would re-run a GET that writes, unconfirmed.
  const quote = useResource(`quote:${quoteId}`, (c, signal) => quoteById(c, quoteId, signal), {
    manual: true,
  });

  if (quote.freshness === "blocked") {
    return <GatedNotice what="This quote" result={quote.result} />;
  }

  // 404 and 410 are answers about the quote, not outages. A 404 is not
  // necessarily a typo: an order stores whatever quote id it was created with,
  // and the agent may never have held it or may have dropped it since.
  const status = quote.result?.kind === "unavailable" ? quote.result.status : undefined;

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
            ? "The agent has no quote with this id. It may never have existed or may have been removed; this is not an outage."
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

export default function QuotesScreen() {
  // `?id=` comes from the Orders link and is fetched straight away: the
  // operator followed a link to this quote. The lazy expiry that GET performs
  // is disclosed above, and `manual` stops it re-running on focus.
  const [params, setParams] = useSearchParams();
  const initial = params.get("id")?.trim() ?? "";
  const [id, setId] = useState(initial);
  const [submitted, setSubmitted] = useState<string | undefined>(initial || undefined);

  const submit = () => {
    const next = id.trim();
    if (!next) return;
    setSubmitted(next);
    setParams({ id: next }, { replace: true });
  };

  return (
    <section data-screen="quotes">
      <PageHeader
        title="Quotes"
        subtitle="Look up a quote by id. The agent offers no way to list them."
      >
        <WritesNotice what="Fetching a quote enforces its TTL and may persist status=expired." />

        <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }}>
          <Box
            component="form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <FormRow>
              <TextField
                size="small"
                label="Quote id"
                value={id}
                onChange={(e) => setId(e.target.value)}
              />
              <Button
                type="submit"
                variant="outlined"
                size="small"
                data-action="fetch-quote"
                disabled={!id.trim()}
              >
                Fetch quote
              </Button>
            </FormRow>
          </Box>
          {submitted && <QuoteResult key={submitted} quoteId={submitted} />}
        </Paper>

        <Typography variant="body2" color="text.secondary">
          Quotes are requested on <a href="#/catalog">Catalog</a>. An order carries the id of the
          quote it came from.
        </Typography>
      </PageHeader>
    </section>
  );
}
