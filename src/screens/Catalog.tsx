import { Fragment, useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  checkAvails,
  discovery,
  inventoryTypeOverride,
  packages,
  pricingQuote,
  productById,
  products,
  rateCard,
  type Avails,
  type AvailsCheckResult,
  type AvailsCollection,
  type Money,
} from "../api/endpoints";
import { describe } from "../api/errors";
import { Field, FieldGrid } from "../components/Field";
import { GatedNotice } from "../components/GatedNotice";
import { stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";

function money(amount: Money | null | undefined): string {
  if (!amount) return "on request";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: amount.currency || "USD",
  }).format(amount.amount_micros / 1_000_000);
}

function plain(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
  }).format(amount);
}

/** `asOf` is epoch ms; `stamp` takes ISO. Same round-trip as MediaKit. */
function asOfStamp(at: number): string {
  return stamp(new Date(at).toISOString());
}

function isAvailsCollection(result: AvailsCheckResult): result is AvailsCollection {
  return Array.isArray((result as AvailsCollection).avails);
}

function availsList(result: AvailsCheckResult): Avails[] {
  return isAvailsCollection(result) ? result.avails : [result];
}

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <Box component="section" sx={{ mb: 4 }}>
      <Typography variant="h3" sx={{ fontSize: 16, fontWeight: 600, mb: caption ? 0.25 : 1 }}>
        {title}
      </Typography>
      {caption && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontSize: 12 }}>
          {caption}
        </Typography>
      )}
      {children}
    </Box>
  );
}

function ProductDetail({ productId }: { productId: string }) {
  const product = useResource(`product:${productId}`, (c, signal) =>
    productById(c, productId, signal),
  );
  const override = useResource(`inventory-type:${productId}`, (c, signal) =>
    inventoryTypeOverride(c, productId, signal),
  );

  const noOverride =
    override.result?.kind === "unavailable" && override.result.status === 404;

  return (
    <Stack spacing={1.5} sx={{ py: 1 }} data-block="product-detail">
      {product.loading && !product.data ? (
        <Skeleton height={40} />
      ) : product.freshness === "blocked" ? (
        <GatedNotice what="This product" result={product.result} />
      ) : !product.data ? (
        <Typography variant="body2" color="text.secondary">
          {product.result ? describe(product.result) : "no detail"}
        </Typography>
      ) : (
        <FieldGrid min={140}>
          <Field label="Product id">
            <Box component="span" sx={{ fontFamily: "monospace", fontSize: 12 }}>
              {product.data.product_id}
            </Box>
          </Field>
          <Field label="Pricing model">{product.data.pricing_model ?? "—"}</Field>
          <Field label="Delivery">{product.data.delivery_type ?? "—"}</Field>
          <Field label="Base price">{money(product.data.base_price)}</Field>
        </FieldGrid>
      )}

      <Box>
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 0.5 }}>
          Inventory type override
        </Typography>
        {/* Every product probed in this environment 404s here — that is "none
            set", not an outage. Folding it into describe() would call a missing
            override an agent error. */}
        {override.loading && !override.data && !noOverride ? (
          <Skeleton height={24} />
        ) : override.freshness === "blocked" ? (
          <GatedNotice what="The inventory type override" result={override.result} />
        ) : noOverride ? (
          <Typography variant="body2" color="text.secondary" data-state="no-override">
            No inventory type override is set for this product.
          </Typography>
        ) : override.data ? (
          <FieldGrid min={140} data-block="inventory-override">
            <Field label="Inventory type">{override.data.inventory_type}</Field>
            <Field label="Reason">{override.data.reason ?? "—"}</Field>
          </FieldGrid>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {override.result ? describe(override.result) : "no override"}
          </Typography>
        )}
      </Box>

      <Typography
        variant="caption"
        component="p"
        data-freshness={product.freshness}
        sx={{ color: product.freshness === "stale" ? palette.warningText : palette.textSecondary }}
      >
        {product.freshness === "live" &&
          product.asOf !== undefined &&
          `as of ${asOfStamp(product.asOf)}`}
        {product.freshness === "stale" && "couldn't refresh — showing the last product received"}
      </Typography>
    </Stack>
  );
}

function Products() {
  const [openProduct, setOpenProduct] = useState<string | undefined>();
  const list = useResource("products", (c, signal) => products(c, { limit: 200 }, signal), {
    refreshInterval: CADENCE.rateCard,
  });
  const rows = list.data?.products ?? [];

  if (list.loading && rows.length === 0) return <Skeleton height={80} />;
  if (rows.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3 }} data-state="no-products">
        <Typography variant="body2" color="text.secondary">
          {list.result && list.result.kind !== "ok" ? describe(list.result) : "No products."}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined">
      <Table size="small" data-block="products">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 600 }}>Product</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Delivery</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Formats</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Base price</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Impressions</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((product) => (
            <Fragment key={product.product_id}>
              <TableRow hover data-row="product">
                <TableCell sx={{ fontSize: 13 }}>{product.name || product.product_id}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>{product.delivery_type ?? "—"}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>
                  {product.ad_formats.join(", ") || "—"}
                </TableCell>
                {/* A null base_price means "pricing on request only", which is a
                    real state of a real product, not missing data. */}
                <TableCell sx={{ fontSize: 12 }}>{money(product.base_price)}</TableCell>
                <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                  {product.available_impressions?.toLocaleString() ?? "—"}
                </TableCell>
                <TableCell align="right">
                  <Button
                    size="small"
                    onClick={() =>
                      setOpenProduct((current) =>
                        current === product.product_id ? undefined : product.product_id,
                      )
                    }
                    aria-expanded={openProduct === product.product_id}
                  >
                    {openProduct === product.product_id ? "Hide" : "Details"}
                  </Button>
                </TableCell>
              </TableRow>
              {openProduct === product.product_id && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ backgroundColor: palette.ground }}>
                    <ProductDetail productId={product.product_id} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}

function Rates() {
  const card = useResource("rate-card", rateCard, { refreshInterval: CADENCE.rateCard });

  if (card.loading && !card.data) return <Skeleton height={60} />;
  if (!card.data) {
    return (
      <Paper variant="outlined" sx={{ p: 3 }} data-state="no-rate-card">
        <Typography variant="body2" color="text.secondary">
          {card.result ? describe(card.result) : "No rate card."}
        </Typography>
      </Paper>
    );
  }

  const configured = card.data.source === "stored";

  return (
    <>
      {/* The agent invents a fallback card when none has been configured and
          reports it in the same shape as a real one. Showing those numbers as
          this publisher's pricing would be a fabrication with a plausible
          face, so the distinction is the first thing on the section. */}
      {!configured && (
        <Alert severity="warning" variant="outlined" sx={{ mb: 1 }} data-note="rate-card-defaults">
          No rate card has been configured. These are the agent's built-in
          fallback values, not this publisher's pricing.
        </Alert>
      )}
      <Paper variant="outlined">
        <Table size="small" data-block="rate-card" data-source={card.data.source}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Inventory type</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Base CPM</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Effective</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Notes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {card.data.entries.map((entry) => (
              <TableRow key={entry.inventory_type} hover data-row="rate">
                <TableCell sx={{ fontSize: 13 }}>{entry.inventory_type}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>
                  {plain(entry.base_cpm, entry.currency)}
                </TableCell>
                <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                  {stamp(entry.effective_date)}
                </TableCell>
                <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                  {entry.notes ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
      <Typography variant="body2" sx={{ mt: 0.5, fontSize: 12, color: palette.textSecondary }}>
        {configured ? "Set by an operator" : "Agent defaults"} · updated{" "}
        {stamp(card.data.updated_at)}
      </Typography>
    </>
  );
}

function Packages() {
  const list = useResource("packages", packages, { refreshInterval: CADENCE.rateCard });
  const rows = list.data?.packages ?? [];

  if (list.loading && rows.length === 0) return <Skeleton height={60} />;
  if (rows.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3 }} data-state="no-packages">
        <Typography variant="body2" color="text.secondary">
          {list.result && list.result.kind !== "ok" ? describe(list.result) : "No packages."}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined">
      <Table size="small" data-block="packages">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 600 }}>Package</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Rate</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Price</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Floor</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((pkg) => (
            <TableRow key={pkg.package_id} hover data-row="package">
              <TableCell sx={{ fontSize: 13 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <span>{pkg.name || pkg.package_id}</span>
                  {pkg.is_featured && (
                    <Chip
                      label="featured"
                      size="small"
                      variant="outlined"
                      sx={{ height: 18, fontSize: 10, color: palette.textSecondary }}
                    />
                  )}
                </Stack>
              </TableCell>
              <TableCell sx={{ fontSize: 12 }}>{pkg.rate_type ?? "—"}</TableCell>
              {/* Exact prices appear only for an authenticated caller; without
                  a key the agent returns a band instead. Showing whichever
                  arrived, and the section header says whose view this is. */}
              <TableCell sx={{ fontSize: 12 }}>
                {pkg.exact_price != null
                  ? plain(pkg.exact_price, pkg.currency)
                  : (pkg.price_range ?? "—")}
              </TableCell>
              <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                {plain(pkg.floor_price, pkg.currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}

function Discovery() {
  const [queryInput, setQueryInput] = useState("");
  const [submitted, setSubmitted] = useState<string | undefined>(undefined);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = queryInput.trim();
    setSubmitted(trimmed || undefined);
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-block="discovery">
      <Box component="form" onSubmit={handleSubmit}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            label="Brief"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            sx={{ minWidth: 280 }}
          />
          <Button type="submit" variant="outlined" size="small" data-action="discover">
            Discover
          </Button>
        </Stack>
      </Box>
      {submitted !== undefined && <DiscoveryResults query={submitted} />}
    </Paper>
  );
}

function DiscoveryResults({ query }: { query: string }) {
  // Keyed on the submitted brief, same pattern as media-kit search: a POST
  // that answers a question and stores nothing, so it goes through useResource
  // and runs with writes off.
  const results = useResource(`discovery:${query}`, (c, signal) =>
    discovery(c, { query }, signal),
  );
  const rows = results.data?.catalog ?? [];

  if (results.freshness === "blocked") {
    return <GatedNotice what="Discovery" result={results.result} />;
  }

  return (
    <Box sx={{ mt: 2 }} data-block="discovery-results">
      <Box
        data-freshness={results.freshness}
        sx={{
          mb: 1,
          fontSize: 12,
          color: results.freshness === "stale" ? palette.warningText : palette.textSecondary,
        }}
      >
        {results.freshness === "live" &&
          `tier ${results.data?.access_tier ?? "public"} · as of ${asOfStamp(results.asOf!)}`}
        {results.freshness === "stale" && "couldn't refresh — showing the last discovery received"}
        {results.freshness === "empty" &&
          (results.loading ? "searching…" : results.result ? describe(results.result) : "")}
      </Box>

      {results.loading && rows.length === 0 ? (
        <Skeleton height={28} />
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary" data-state="no-discovery">
          {results.freshness === "empty" && results.result?.kind === "unavailable"
            ? describe(results.result)
            : `Nothing in the catalog matches "${query}".`}
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Product</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Inventory</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Deal types</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Price</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((item) => (
              <TableRow key={item.product_id} hover data-row="discovery">
                <TableCell sx={{ fontSize: 13 }}>{item.name || item.product_id}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>{item.inventory_type ?? "—"}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>{item.deal_types.join(", ") || "—"}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>{item.price_range ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}

function AvailsCheck() {
  const [productId, setProductId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitted, setSubmitted] = useState<
    { productid: string; startdate: string; enddate: string } | undefined
  >(undefined);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!productId.trim() || !startDate || !endDate) return;
    setSubmitted({
      productid: productId.trim(),
      startdate: startDate,
      enddate: endDate,
    });
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-block="avails">
      <Box component="form" onSubmit={handleSubmit}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            label="Product id"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            sx={{ minWidth: 200 }}
          />
          <TextField
            size="small"
            label="Start"
            type="date"
            slotProps={{ inputLabel: { shrink: true } }}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <TextField
            size="small"
            label="End"
            type="date"
            slotProps={{ inputLabel: { shrink: true } }}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <Button type="submit" variant="outlined" size="small" data-action="check-avails">
            Check avails
          </Button>
        </Stack>
      </Box>
      {submitted !== undefined && <AvailsResults query={submitted} />}
    </Paper>
  );
}

function AvailsResults({
  query,
}: {
  query: { productid: string; startdate: string; enddate: string };
}) {
  const results = useResource(
    `avails:${query.productid}:${query.startdate}:${query.enddate}`,
    (c, signal) => checkAvails(c, query, signal),
  );
  const rows = results.data ? availsList(results.data) : [];

  if (results.freshness === "blocked") {
    return <GatedNotice what="Availability" result={results.result} />;
  }

  return (
    <Box sx={{ mt: 2 }} data-block="avails-results">
      <Box
        data-freshness={results.freshness}
        sx={{
          mb: 1,
          fontSize: 12,
          color: results.freshness === "stale" ? palette.warningText : palette.textSecondary,
        }}
      >
        {results.freshness === "live" &&
          results.asOf !== undefined &&
          `as of ${asOfStamp(results.asOf)}`}
        {results.freshness === "stale" && "couldn't refresh — showing the last avails received"}
        {results.freshness === "empty" &&
          (results.loading ? "checking…" : results.result ? describe(results.result) : "")}
      </Box>

      {results.loading && rows.length === 0 ? (
        <Skeleton height={28} />
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary" data-state="no-avails">
          {results.result ? describe(results.result) : "No availability returned."}
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Product</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Available impressions</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Estimated CPM</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Total cost</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Delivery confidence</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.productid} hover data-row="avail">
                <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{row.productid}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>
                  {row.availableImpressions.toLocaleString()}
                </TableCell>
                <TableCell sx={{ fontSize: 12 }}>{row.estimatedCpm}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>{row.totalCost}</TableCell>
                <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                  {/* Omitted when the seller has no forecast source — never
                      shown as a zero, which would look measured. */}
                  {row.deliveryConfidence ?? "not provided"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}

function Pricing() {
  const [productId, setProductId] = useState("");
  const [volume, setVolume] = useState("");
  const [submitted, setSubmitted] = useState<{ product_id: string; volume?: number } | undefined>(
    undefined,
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = productId.trim();
    if (!id) return;
    const parsed = volume.trim() === "" ? undefined : Number(volume);
    setSubmitted({
      product_id: id,
      ...(parsed !== undefined && Number.isFinite(parsed) ? { volume: parsed } : {}),
    });
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-block="pricing">
      <Box component="form" onSubmit={handleSubmit}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            label="Product id"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            sx={{ minWidth: 200 }}
          />
          <TextField
            size="small"
            label="Volume"
            type="number"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            sx={{ width: 140 }}
          />
          <Button type="submit" variant="outlined" size="small" data-action="quote">
            Quote
          </Button>
        </Stack>
      </Box>
      {submitted !== undefined && <PricingResult query={submitted} />}
    </Paper>
  );
}

function PricingResult({ query }: { query: { product_id: string; volume?: number } }) {
  const quote = useResource(
    `pricing:${query.product_id}:${query.volume ?? ""}`,
    (c, signal) => pricingQuote(c, query, signal),
  );

  if (quote.freshness === "blocked") {
    return <GatedNotice what="This price quote" result={quote.result} />;
  }

  const unknownProduct = quote.result?.kind === "unavailable" && quote.result.status === 404;

  return (
    <Box sx={{ mt: 2 }} data-block="pricing-result">
      {quote.loading && !quote.data ? (
        <Skeleton height={28} />
      ) : unknownProduct ? (
        <Typography variant="body2" color="text.secondary" data-state="unknown-product">
          No product with that id. This is a typo in the form, not an outage.
        </Typography>
      ) : !quote.data ? (
        <Typography variant="body2" color="text.secondary">
          {quote.result ? describe(quote.result) : ""}
        </Typography>
      ) : (
        <>
          <FieldGrid min={140}>
            <Field label="Base">{plain(quote.data.base_price, quote.data.currency)}</Field>
            <Field label="Final">{plain(quote.data.final_price, quote.data.currency)}</Field>
            <Field label="Tier discount">{quote.data.tier_discount}</Field>
            <Field label="Volume discount">{quote.data.volume_discount}</Field>
          </FieldGrid>
          {/* The agent's own sentence. A discounted number with no reason is
              one an operator cannot defend to a buyer. */}
          {quote.data.rationale ? (
            <Typography variant="body2" sx={{ mt: 1 }} data-field="rationale">
              {quote.data.rationale}
            </Typography>
          ) : null}
          <Typography
            variant="caption"
            component="p"
            data-freshness={quote.freshness}
            sx={{
              mt: 1,
              color: quote.freshness === "stale" ? palette.warningText : palette.textSecondary,
            }}
          >
            {quote.freshness === "live" &&
              quote.asOf !== undefined &&
              `as of ${asOfStamp(quote.asOf)}`}
            {quote.freshness === "stale" && "couldn't refresh — showing the last quote received"}
          </Typography>
        </>
      )}
    </Box>
  );
}

export default function CatalogScreen() {
  return (
    <section data-screen="catalog">
      <Typography variant="h2" sx={{ fontSize: 20, fontWeight: 600, mb: 0.5 }}>
        Catalog
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        What this agent offers buyers.
      </Typography>

      <Section
        title="Products"
        caption="The same for every caller — this route ignores the key entirely."
      >
        <Products />
      </Section>

      <Section title="Rate card" caption="Operator-set base pricing by inventory type.">
        <Rates />
      </Section>

      <Section
        title="Packages"
        // The one catalog route whose content depends on the credential:
        // without a key the agent returns a price band, with one it returns
        // exact and floor prices. Calling this "the catalog" would overstate
        // what is on screen.
        caption="As seen by this key. Unauthenticated callers get price bands instead of exact prices, and a buyer key may be priced differently again."
      >
        <Packages />
      </Section>

      <Section
        title="Discovery"
        caption="What matches a brief. A POST that reads the catalog and stores nothing, so it runs with writes off."
      >
        <Discovery />
      </Section>

      <Section
        title="Availability"
        caption="A forecast for a flight. Reserves nothing; also a query-shaped POST."
      >
        <AvailsCheck />
      </Section>

      <Section
        title="Price a line"
        caption="Applies tier and volume discounts to the rate card without booking. An unknown product is a typo, not an outage."
      >
        <Pricing />
      </Section>
    </section>
  );
}
