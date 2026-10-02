import { Fragment, useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import {
  checkAvails,
  deleteInventoryTypeOverride,
  discovery,
  inventoryTypeOverride,
  pricingQuote,
  productById,
  products,
  setInventoryTypeOverride,
  type Avails,
  type AvailsCheckResult,
  type AvailsCollection,
  type Money,
} from "../api/endpoints";
import { describe } from "../api/errors";
import { DataPanel } from "../components/DataPanel";
import { Field, FieldGrid } from "../components/Field";
import { GatedNotice } from "../components/GatedNotice";
import { PageHeader } from "../components/PageHeader";
import { ReadOnlyNotice } from "../components/ReadOnlyNotice";
import { ScreenSection } from "../components/ScreenSection";
import { stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";
import { FormRow } from "../components/WriteForm";
import { TipField } from "../components/TipField";
import { ProductPicker } from "./pickers";
import { useCredential } from "../credentials/context";
import { INVENTORY_TYPES } from "../api/vocabulary";
import { ConfirmButton, WRITES_OFF_HINT } from "../components/ConfirmButton";
import { EnumSelect } from "../components/EnumSelect";
import { Hint } from "../components/Hint";
import { plain } from "../lib/money";
import { useMutation } from "../query/useMutation";
import { PackageTable } from "./PackageTable";
import { PublicPackages } from "./PublicPackages";
import { RateCardTable } from "./RateCardTable";

function money(amount: Money | null | undefined): string {
  if (!amount) return "on request";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: amount.currency || "USD",
  }).format(amount.amount_micros / 1_000_000);
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

/**
 * Set or clear the product's inventory type override, in place under the one
 * it shows. The resource names are the ones ProductDetail reads, so the detail
 * re-reads as soon as a write lands rather than at its next poll.
 */
function OverrideEditor({
  productId,
  current,
}: {
  productId: string;
  current: { inventory_type: string; reason?: string | null } | undefined;
}) {
  const { writesEnabled } = useCredential();
  const blocked = !writesEnabled;
  const [editing, setEditing] = useState(false);
  // Unvalidated upstream, so a typo would be stored and then match no
  // product. The documented set is offered instead of a text box.
  const [inventoryType, setInventoryType] = useState<string>("display");
  const [reason, setReason] = useState("");

  const set = useMutation<{ inventory_type: string; reason?: string }, unknown>(
    (c, args) =>
      setInventoryTypeOverride(c, productId, {
        product_id: productId,
        inventory_type: args.inventory_type,
        ...(args.reason ? { reason: args.reason } : {}),
      }),
    { invalidates: [`inventory-type:${productId}`] },
  );
  const clear = useMutation<Record<string, never>, unknown>(
    (c) => deleteInventoryTypeOverride(c, productId),
    { invalidates: [`inventory-type:${productId}`] },
  );
  const failed = [set.last, clear.last].find((r) => r && r.kind !== "ok");

  function open() {
    set.reset();
    clear.reset();
    setInventoryType(current?.inventory_type ?? "display");
    setReason(current?.reason ?? "");
    setEditing(true);
  }

  return (
    <Box sx={{ mt: 1 }} data-block="override-editor">
      {editing ? (
        <FormRow>
          <EnumSelect<string>
            hint="Inventory type to force on the product. It replaces the auto-detected type and survives inventory syncs."
            label="Inventory type"
            value={inventoryType}
            options={INVENTORY_TYPES}
            onChange={(v) => v && setInventoryType(v)}
            sx={{ minWidth: 160 }}
          />
          <TipField
            hint="Optional note on why the type is being overridden. Sent only when filled in."
            size="small"
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <ConfirmButton
            label="Save"
            title="Set an inventory type override?"
            confirmLabel="Set override"
            action="set-override"
            variant="contained"
            blocked={blocked}
            pending={set.pending}
            onConfirm={() =>
              void set
                .run({ inventory_type: inventoryType, ...(reason.trim() ? { reason: reason.trim() } : {}) })
                .then((r) => r.kind === "ok" && setEditing(false))
            }
            consequence="The override persists across inventory syncs. Setting it again replaces it, so a retry is harmless."
          />
          <Button size="small" onClick={() => setEditing(false)} disabled={set.pending}>
            Cancel
          </Button>
        </FormRow>
      ) : (
        <Stack direction="row" spacing={1}>
          <Hint hint={blocked ? WRITES_OFF_HINT : undefined}>
            <Button size="small" data-action="edit-override" disabled={blocked} onClick={open}>
              {current ? "Change override" : "Set override"}
            </Button>
          </Hint>
          {current && (
            <ConfirmButton
              label="Clear override"
              title="Delete this inventory type override?"
              confirmLabel="Delete override"
              action="delete-override"
              variant="text"
              color="error"
              blocked={blocked}
              pending={clear.pending}
              onConfirm={() => void clear.run({})}
              consequence="The product reverts to the auto-detected type. A second delete 404s."
            />
          )}
        </Stack>
      )}
      {failed && failed.kind !== "ok" && (
        <Typography variant="body2" sx={{ mt: 1, color: palette.error }} data-state="write-failed">
          {describe(failed)}
        </Typography>
      )}
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
        <Typography
          variant="caption"
          component="p"
          data-freshness={noOverride ? "live" : override.freshness}
          data-block="override-freshness"
          sx={{
            mt: 0.5,
            color: override.freshness === "stale" ? palette.warningText : palette.textSecondary,
          }}
        >
          {noOverride &&
            override.result !== undefined &&
            `as of ${asOfStamp(override.result.fetchedAt)}`}
          {!noOverride &&
            override.freshness === "live" &&
            override.asOf !== undefined &&
            `as of ${asOfStamp(override.asOf)}`}
          {override.freshness === "stale" &&
            "couldn't refresh — showing the last override received"}
        </Typography>
        {override.freshness !== "blocked" && (
          <OverrideEditor productId={productId} current={noOverride ? undefined : override.data} />
        )}
      </Box>

      <Typography
        variant="caption"
        component="p"
        data-freshness={product.freshness}
        data-block="product-freshness"
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
    <DataPanel>
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
    </DataPanel>
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
    <Paper variant="outlined" sx={{ p: 2.5 }} data-block="discovery">
      <Box component="form" onSubmit={handleSubmit}>
        <FormRow>
          <TipField
            hint="A plain-language description of what the buyer wants, such as a format or audience. The agent suggests matching products. Submitting a blank brief does nothing."
            size="small"
            label="Brief"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            sx={{ minWidth: 280 }}
          />
          <Button type="submit" variant="outlined" size="small" data-action="discover">
            Discover
          </Button>
        </FormRow>
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
    <Paper variant="outlined" sx={{ p: 2.5 }} data-block="avails">
      <Box component="form" onSubmit={handleSubmit}>
        <FormRow>
          <ProductPicker value={productId} onChange={setProductId} hint="The product to use. Pick one, or type or paste an id. Required." />
          <TipField
            hint="First day of the flight to check. Required,; the check will not run without it."
            size="small"
            label="Start"
            type="date"
            slotProps={{ inputLabel: { shrink: true } }}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <TipField
            hint="Last day of the flight to check. Required,; the check will not run without it."
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
        </FormRow>
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
    <Paper variant="outlined" sx={{ p: 2.5 }} data-block="pricing">
      <Box component="form" onSubmit={handleSubmit}>
        <FormRow>
          <ProductPicker value={productId} onChange={setProductId} hint="The product to use. Pick one, or type or paste an id. Required." />
          <TipField
            hint="Optional impressions to price for. The agent applies its volume discounts to this figure; leave blank to quote without one."
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
        </FormRow>
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
  const { writesEnabled } = useCredential();
  return (
    <section data-screen="catalog">
      <PageHeader title="Catalog" subtitle="What this agent offers buyers.">
      {!writesEnabled && (
        <ReadOnlyNotice what="Editing the rate card, packages, or inventory type overrides" />
      )}

      <ScreenSection
        title="Products"
        caption="The same for every caller — this route ignores the key entirely."
      >
        {/* Not a ReadOnlyNotice: the write switch is irrelevant here. The
            agent API has no create/update/delete route for products, so there
            is nothing for the switch to enable. */}
        <Alert severity="info" variant="outlined" sx={{ mb: 2.5 }} data-note="products-read-only">
          Products can't be created, edited or archived from this console. The agent API offers no
          write endpoints for products yet, so this table is read-only whatever the write switch is
          set to.
          <br />
          Products come from the agent's own setup and inventory sync, so changing one means changing
          it there.
        </Alert>
        <Products />
      </ScreenSection>

      <RateCardTable />

      <ScreenSection
        title="Packages"
        // The one catalog route whose content depends on the credential:
        // without a key the agent returns a price band, with one it returns
        // exact and floor prices. Calling this "the catalog" would overstate
        // what is on screen, so the keyless view is shown beside it.
        caption="Exact and floor prices, as returned for the key you are connected with. Callers without a key only see a price range."
      >
        <PackageTable />
        <PublicPackages />
      </ScreenSection>

      <ScreenSection
        title="Discovery"
        caption="What matches a brief. A POST that reads the catalog and stores nothing, so it runs with writes off."
      >
        <Discovery />
      </ScreenSection>

      <ScreenSection
        title="Availability"
        caption="A forecast for a flight. Reserves nothing; also a query-shaped POST."
      >
        <AvailsCheck />
      </ScreenSection>

      <ScreenSection
        title="Price a line"
        caption="Applies tier and volume discounts to the rate card without booking. An unknown product is a typo, not an outage."
      >
        <Pricing />
      </ScreenSection>
      </PageHeader>
    </section>
  );
}
