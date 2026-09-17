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
import { dealLineage, dealPerformance, deals, type Money } from "../api/endpoints";
import { describe } from "../api/errors";
import { Field, FieldGrid } from "../components/Field";
import { GatedNotice } from "../components/GatedNotice";
import { StatusChip } from "../components/StatusChip";
import { day, plural, stamp } from "../lib/time";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";

/**
 * The shared wire vocabulary, taken from the agent's DealStatus enum. The list
 * filters on the mapped value, so these are the words the rows actually carry.
 */
const STATUSES = [
  "",
  "proposed",
  "negotiating",
  "accepted",
  "booked",
  "active",
  "makegood_pending",
  "partially_cancelled",
  "completed",
  "rejected",
  "failed",
  "cancelled",
  "expired",
];

/** Prices cross the wire as an integer count of millionths, never as a float. */
function money(amount: Money | null | undefined): string {
  if (!amount) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: amount.currency || "USD",
  }).format(amount.amount_micros / 1_000_000);
}

function dollars(amount: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount);
}

/**
 * Delivery and lineage only. The deal itself is already in the list row — the
 * list returns the same envelope the single-deal route does — so there is
 * nothing to re-fetch, and this screen never calls `GET /api/v1/deals/{id}`,
 * which would make the agent write (it runs a lazy expiry check and persists
 * the outcome).
 */
function Detail({ dealId }: { dealId: string }) {
  const perf = useResource(`deal-perf:${dealId}`, (c, signal) =>
    dealPerformance(c, dealId, signal),
  );
  const lineage = useResource(`deal-lineage:${dealId}`, (c, signal) =>
    dealLineage(c, dealId, signal),
  );

  const chain = lineage.data;

  return (
    <Stack spacing={2} sx={{ py: 1 }}>
      <Box>
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 0.5 }}>Delivery</Typography>
        {/* The agent returns placeholder figures on this route until a real ad
            server is wired in. Rendering a fill rate as delivery truth would be
            the most misleading thing this console could do, so the caveat sits
            above the numbers rather than in a footnote. */}
        <Typography variant="body2" sx={{ color: palette.warningText, mb: 1 }}>
          Not measured. The agent returns placeholder delivery figures here until
          an ad server is connected — read them as a shape, not as data.
        </Typography>
        {perf.loading && !perf.data ? (
          <Skeleton height={24} />
        ) : !perf.data ? (
          <Typography variant="body2" color="text.secondary">
            {perf.result ? describe(perf.result) : "no delivery data"}
          </Typography>
        ) : (
          <FieldGrid data-block="deal-performance" min={120}>
            <Field label="Served">{perf.data.impressions_served.toLocaleString()}</Field>
            <Field label="Available">{perf.data.impressions_available.toLocaleString()}</Field>
            <Field label="Fill rate">{`${Math.round(perf.data.fill_rate * 100)}%`}</Field>
            <Field label="Win rate">{`${Math.round(perf.data.win_rate * 100)}%`}</Field>
            <Field label="Avg CPM">{dollars(perf.data.avg_cpm_actual)}</Field>
            <Field label="Pacing">{perf.data.delivery_pacing.replace(/_/g, " ")}</Field>
          </FieldGrid>
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
              ...chain.parents.map((link) => ({ link, role: "predecessor" })),
              {
                link: { deal_id: chain.deal_id, status: chain.status, reason: null },
                role: "this deal",
              },
              ...chain.replacements.map((link) => ({ link, role: "replacement" })),
            ].map(({ link, role }, index) => (
              <Box
                component="li"
                key={`${link.deal_id}-${index}`}
                sx={{ display: "flex", gap: 1.5, alignItems: "baseline", py: 0.5 }}
              >
                <Box sx={{ fontFamily: "monospace", fontSize: 12 }}>{link.deal_id}</Box>
                <Box sx={{ fontSize: 12, color: palette.textSecondary }}>
                  {/* Lineage reports the stored status, not the wire one, so it
                      is left unstyled rather than dressed as the row's chip. */}
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

  // No refreshInterval: the route scans every deal in storage with no
  // pagination, so refreshing it is the operator's decision, not a timer's.
  const list = useResource(`deals:${status}`, (c, signal) =>
    deals(c, status ? { status } : {}, signal),
  );

  const rows = list.data?.deals ?? [];
  const skipped = list.data?.skipped ?? [];

  return (
    <section data-screen="deals">
      <Typography variant="h2" sx={{ fontSize: 20, fontWeight: 600, mb: 0.5 }}>
        Deals
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Every buyer's deals, as the agent has them stored.
      </Typography>

      {list.freshness === "blocked" ? (
        <GatedNotice what="The deal ledger" result={list.result} />
      ) : (
        <>
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
                    {s ? s.replace(/_/g, " ") : "Any status"}
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

          {/* The agent drops deals it cannot map into the wire shape. Left
              unsaid, the ledger would just be quietly short. */}
          {skipped.length > 0 && (
            <Alert severity="warning" variant="outlined" sx={{ mb: 2 }} data-note="skipped">
              {skipped.length} stored {skipped.length === 1 ? "deal is" : "deals are"} missing from
              this list. The agent could not read {skipped.length === 1 ? "it" : "them"} into its
              own response shape: {skipped.join(", ")}.
            </Alert>
          )}

          <Box
            data-freshness={list.freshness}
            sx={{
              mb: 1,
              fontSize: 12,
              color: list.freshness === "stale" ? palette.warningText : palette.textSecondary,
            }}
          >
            {list.validating && rows.length === 0 && (
              <span data-state="slow">Reading every deal — this can take a while.</span>
            )}
            {!list.validating &&
              list.freshness === "live" &&
              plural(list.data?.count ?? rows.length, "deal")}
            {!list.validating &&
              list.freshness === "stale" &&
              "couldn't refresh — showing the last list received"}
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
                  {/* An agent with no deals is a normal agent, not a broken one. */}
                  {list.freshness === "empty" && list.result?.kind === "unavailable"
                    ? describe(list.result)
                    : status
                      ? `No deals with status "${status.replace(/_/g, " ")}".`
                      : "No deals yet."}
                </Typography>
              </Box>
            ) : (
              <Table size="small" data-state="rows">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Deal</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Product</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>CPM</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Flight</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map(({ deal }) => (
                    <Fragment key={deal.deal_id}>
                      <TableRow hover data-row="deal">
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                          {deal.deal_id}
                        </TableCell>
                        <TableCell>
                          <StatusChip status={deal.status} />
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{deal.deal_type}</TableCell>
                        <TableCell sx={{ fontSize: 12 }}>
                          {deal.product?.name || deal.product?.product_id || "—"}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{money(deal.pricing?.final_cpm)}</TableCell>
                        <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                          {deal.terms?.flight_start || deal.terms?.flight_end
                            ? `${day(deal.terms.flight_start)} → ${day(deal.terms.flight_end)}`
                            : `expires ${stamp(deal.expires_at)}`}
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
                          <TableCell colSpan={7} sx={{ backgroundColor: palette.ground }}>
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
        </>
      )}
    </section>
  );
}
