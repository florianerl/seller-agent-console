import { Fragment, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
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
import { dealById, dealLineage, dealPerformance, dealsExport } from "../api/endpoints";
import { describe } from "../api/errors";
import { StatusChip } from "../components/StatusChip";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";

/**
 * The internal vocabulary, because `export` filters on the stored value. The
 * detail route answers in the shared wire vocabulary instead — see the note in
 * api/endpoints.
 */
const STATUSES = ["", "proposed", "confirmed", "cancelled", "deprecated"];

function stamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(at);
}

const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });

/** The list carries float dollars; the detail carries integer micros. */
function dollars(amount: number | null | undefined): string {
  return amount == null ? "—" : money.format(amount);
}

function micros(amount: { amount_micros: number; currency: string } | null | undefined): string {
  if (!amount) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: amount.currency || "USD",
  }).format(amount.amount_micros / 1_000_000);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Box sx={{ fontSize: 11, color: palette.textSecondary, textTransform: "uppercase" }}>
        {label}
      </Box>
      <Box sx={{ fontSize: 13 }}>{children}</Box>
    </Box>
  );
}

function Detail({ dealId }: { dealId: string }) {
  const detail = useResource(`deal:${dealId}`, (c, signal) => dealById(c, dealId, signal));
  const perf = useResource(`deal-perf:${dealId}`, (c, signal) =>
    dealPerformance(c, dealId, signal),
  );
  const lineage = useResource(`deal-lineage:${dealId}`, (c, signal) =>
    dealLineage(c, dealId, signal),
  );

  const deal = detail.data?.deal;
  const chain = lineage.data;

  return (
    <Stack spacing={2} sx={{ py: 1 }}>
      <Box>
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1 }}>Deal</Typography>
        {detail.loading && !deal ? (
          <Skeleton height={24} />
        ) : !deal ? (
          <Typography variant="body2" color="text.secondary">
            {detail.result ? describe(detail.result) : "no detail"}
          </Typography>
        ) : (
          <Box
            data-block="deal-detail"
            sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}
          >
            <Field label="Status (wire)">
              <StatusChip status={deal.status} />
            </Field>
            <Field label="Type">{deal.deal_type}</Field>
            <Field label="Product">{deal.product?.name || deal.product?.product_id || "—"}</Field>
            <Field label="Final CPM">{micros(deal.pricing?.final_cpm)}</Field>
            <Field label="Buyer tier">{deal.buyer_tier}</Field>
            <Field label="Impressions">
              {deal.terms?.impressions?.toLocaleString() ?? "—"}
            </Field>
            <Field label="Flight">
              {deal.terms?.flight_start ? stamp(deal.terms.flight_start) : "—"} →{" "}
              {deal.terms?.flight_end ? stamp(deal.terms.flight_end) : "—"}
            </Field>
            <Field label="Expires">{stamp(deal.expires_at)}</Field>
          </Box>
        )}
      </Box>

      <Box>
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 0.5 }}>Delivery</Typography>
        {/* The upstream handler returns placeholder figures until a real ad
            server is wired in. Rendering them as delivery truth would be the
            single most misleading thing this console could do, so the caveat
            sits above the numbers rather than in a footnote. */}
        <Typography variant="body2" sx={{ color: palette.warningText, mb: 1 }}>
          Not measured. The agent returns placeholder delivery figures on this
          route until an ad server is connected — treat them as a shape, not as
          data.
        </Typography>
        {perf.loading && !perf.data ? (
          <Skeleton height={24} />
        ) : !perf.data ? (
          <Typography variant="body2" color="text.secondary">
            {perf.result ? describe(perf.result) : "no delivery data"}
          </Typography>
        ) : (
          <Box
            data-block="deal-performance"
            sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))" }}
          >
            <Field label="Served">{perf.data.impressions_served.toLocaleString()}</Field>
            <Field label="Available">{perf.data.impressions_available.toLocaleString()}</Field>
            <Field label="Fill rate">{`${Math.round(perf.data.fill_rate * 100)}%`}</Field>
            <Field label="Win rate">{`${Math.round(perf.data.win_rate * 100)}%`}</Field>
            <Field label="Avg CPM">{dollars(perf.data.avg_cpm_actual)}</Field>
            <Field label="Pacing">{perf.data.delivery_pacing.replace(/_/g, " ")}</Field>
          </Box>
        )}
      </Box>

      <Box>
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 0.5 }}>Lineage</Typography>
        {lineage.loading && !chain ? (
          <Skeleton height={20} />
        ) : !chain ? (
          <Typography variant="body2" color="text.secondary">
            {lineage.result ? describe(lineage.result) : "no lineage"}
          </Typography>
        ) : chain.parents.length === 0 && chain.replacements.length === 0 ? (
          <Typography variant="body2" color="text.secondary" data-state="no-lineage">
            No migrations — this deal has no predecessor and no replacement.
          </Typography>
        ) : (
          <Box component="ol" sx={{ m: 0, pl: 0, listStyle: "none" }} data-list="lineage">
            {[
              ...chain.parents.map((link) => ({ link, role: "replaced by this deal" })),
              { link: { deal_id: chain.deal_id, status: chain.status, reason: null }, role: "this deal" },
              ...chain.replacements.map((link) => ({ link, role: "replacement" })),
            ].map(({ link, role }, index) => (
              <Box
                component="li"
                key={`${link.deal_id}-${index}`}
                sx={{ display: "flex", gap: 1.5, alignItems: "baseline", py: 0.5 }}
              >
                <Box sx={{ fontFamily: "monospace", fontSize: 12 }}>{link.deal_id}</Box>
                <Box sx={{ fontSize: 12, color: palette.textSecondary }}>
                  {link.status} · {role}
                  {link.reason ? ` — ${link.reason}` : ""}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Stack>
  );
}

export default function DealsScreen() {
  const [status, setStatus] = useState("");
  const [openDeal, setOpenDeal] = useState<string | undefined>();

  // No refreshInterval: this route scans every deal in storage with no
  // pagination, so it refreshes only when the operator asks.
  const list = useResource(`deals:${status}`, (c, signal) =>
    dealsExport(c, status ? { status } : {}, signal),
  );

  const rows = list.data?.deals ?? [];

  return (
    <section data-screen="deals">
      <Typography variant="h2" sx={{ fontSize: 20, fontWeight: 600, mb: 0.5 }}>
        Deals
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Booked and proposed deals, as the agent has them stored.
      </Typography>

      {/* Disclosed rather than buried in the README: opening a deal is not a
          side-effect-free read. */}
      <Alert severity="info" variant="outlined" sx={{ mb: 2 }} data-note="lazy-expiry">
        Opening a deal makes the agent write. The detail route runs a lazy expiry
        check on deals still in <code>proposed</code> and saves the outcome. This
        console sends no unsafe methods, but that GET is not read-only on the
        server.
      </Alert>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            select
            size="small"
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            sx={{ minWidth: 200 }}
          >
            {STATUSES.map((s) => (
              <MenuItem key={s || "any"} value={s}>
                {s || "Any status"}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="outlined"
            size="small"
            onClick={list.refresh}
            disabled={list.validating}
            data-action="refresh"
          >
            {list.validating ? "Refreshing…" : "Refresh"}
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
            This list does not poll — it reads every deal in one unpaginated pass.
          </Typography>
        </Stack>
      </Paper>

      <Box
        data-freshness={list.freshness}
        sx={{
          mb: 1,
          fontSize: 12,
          color: list.freshness === "stale" ? palette.warningText : palette.textSecondary,
        }}
      >
        {list.validating && rows.length === 0 && (
          <span data-state="slow">Scanning every deal — this can take a while.</span>
        )}
        {!list.validating && list.freshness === "live" && `${list.data?.count ?? rows.length} deals`}
        {!list.validating && list.freshness === "stale" && "couldn't refresh — showing the last list received"}
        {!list.validating && list.freshness === "blocked" && "access denied"}
        {!list.validating &&
          list.freshness === "empty" &&
          (list.result ? describe(list.result) : "")}
      </Box>

      <Paper variant="outlined">
        {list.loading && rows.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Skeleton height={28} />
            <Skeleton height={28} />
          </Box>
        ) : rows.length === 0 ? (
          <Box sx={{ p: 3 }} data-state="empty">
            <Typography variant="body2" color="text.secondary">
              {/* An empty deal index is a normal state for a new agent, not a
                  failure, and must not be dressed up as one. */}
              {list.freshness === "empty" && list.result?.kind === "unavailable"
                ? describe(list.result)
                : status
                  ? `No deals with status "${status}".`
                  : "No deals yet."}
            </Typography>
          </Box>
        ) : (
          <Table size="small" data-state="rows">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Deal</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status (stored)</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>CPM</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Created</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((deal) => (
                <Fragment key={deal.deal_id}>
                  <TableRow hover data-row="deal">
                    <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                      {deal.deal_id}
                    </TableCell>
                    <TableCell>
                      <StatusChip status={deal.status} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{deal.deal_type ?? "—"}</TableCell>
                    <TableCell sx={{ fontSize: 12 }}>
                      {dollars(deal.actual_price_cpm ?? deal.pricing?.final_cpm ?? null)}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                      {stamp(deal.created_at)}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        onClick={() =>
                          setOpenDeal((current) =>
                            current === deal.deal_id ? undefined : deal.deal_id,
                          )
                        }
                        aria-expanded={openDeal === deal.deal_id}
                      >
                        {openDeal === deal.deal_id ? "Hide details" : "Details"}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {openDeal === deal.deal_id && (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ backgroundColor: palette.ground }}>
                        <Detail dealId={deal.deal_id} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
    </section>
  );
}
