import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { packages, products, rateCard, type Money } from "../api/endpoints";
import { describe } from "../api/errors";
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

function Products() {
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
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((product) => (
            <TableRow key={product.product_id} hover data-row="product">
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
            </TableRow>
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
    </section>
  );
}
