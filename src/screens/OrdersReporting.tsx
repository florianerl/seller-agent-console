import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { gamDeliveryReport, ordersReport } from "../api/endpoints";
import { describe } from "../api/errors";
import { GAM_SCAN, gamMatches, useGamScan } from "../query/gam-scan";
import { DetailCard } from "../components/DetailCard";
import { ReloadButton } from "../components/ReloadButton";
import { Field, FieldGrid } from "../components/Field";
import { GatedNotice } from "../components/GatedNotice";
import { JsonView } from "../components/JsonView";
import { plural, stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import { useResource, type ResourceHandle } from "../query/useResource";
import { palette } from "../theme/palette";

/**
 * What used to be the Reporting screen, now on the Orders screen: the agent's
 * own aggregate over the orders it stores, and an order's delivery from a
 * connected Google Ad Manager network. The two must not be blended — a GAM
 * order has its own id, and is not the agent's order with another name.
 *
 * Nothing here polls. The GAM routes proxy an external ad server, so a timer
 * spends someone else's quota on a tab nobody may be looking at; an order's
 * delivery card reads when its row opens, because opening one row is already
 * a request for that order. The agent's own totals load when the screen opens
 * and sit above the list; they are a second scan of every stored order, so
 * they refresh by hand rather than on the list's cadence.
 *
 * The raw GAM order list this screen once offered is gone: nothing an
 * operator acts on here needs GAM orders that name no agent deal.
 */

function Counts({ label, counts }: { label: string; counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return <Field label={label}>none</Field>;
  }
  return (
    <Field label={label}>
      {entries.map(([key, n]) => (
        <Box key={key} sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
          <span>{key.replace(/_/g, " ")}</span>
          <strong>{n.toLocaleString()}</strong>
        </Box>
      ))}
    </Field>
  );
}

/** The caption every value here carries: what it is, and when it arrived. */
function Freshness<T>({ resource }: { resource: ResourceHandle<T> }) {
  const { freshness, asOf, result, loading } = resource;
  return (
    <Typography
      variant="caption"
      component="p"
      data-freshness={freshness}
      sx={{ color: freshness === "stale" ? palette.warningText : palette.textSecondary }}
    >
      {freshness === "live" && asOf !== undefined && `as of ${stamp(new Date(asOf).toISOString())}`}
      {freshness === "stale" &&
        asOf !== undefined &&
        `couldn't refresh — showing ${stamp(new Date(asOf).toISOString())}`}
      {freshness === "blocked" && "value hidden while access is denied"}
      {freshness === "empty" &&
        (loading ? "loading…" : result ? describe(result) : "not loaded yet")}
    </Typography>
  );
}

/**
 * GAM's payload reaches the agent unshaped and leaves it the same way — the
 * API declares the response as an object with no properties at all. Rendering
 * it verbatim is the only honest option: a table here would be this console
 * inventing a structure for data it has never seen, and an operator would have
 * no way to tell the invention from the network's own answer.
 */
function RawPayload({ data, testId }: { data: unknown; testId: string }) {
  return <JsonView value={data} data-payload={testId} />;
}

/**
 * The loaded halves live in their own components so the request is made by
 * mounting rather than by a flag inside the fetcher. A hook cannot be called
 * conditionally, and faking an "idle" result to keep one quiet would put a
 * state in the Result taxonomy that means "we did not ask" — which is not a
 * thing that can happen to a request.
 */
function AgentTotalsPanel({ listed }: { listed: number | undefined }) {
  const report = useResource("orders-report", (c, signal) => ordersReport(c, {}, signal), {
    refreshInterval: CADENCE.reporting,
  });

  if (report.result?.kind === "rejected") {
    return <GatedNotice what="The order summary" result={report.result} />;
  }

  // Two reads, made at different moments, of the same store. A difference is
  // usually an order created between them, but it is the agent's number and
  // the list's number, and neither is quietly preferred.
  const differs =
    report.data !== undefined && listed !== undefined && report.data.total_orders !== listed;

  return (
    <>
      {report.loading && !report.data ? (
        <Skeleton height={24} />
      ) : report.data ? (
        <FieldGrid>
          <Field label="Orders">{plural(report.data.total_orders, "order")}</Field>
          <Field label="Transitions">{report.data.total_transitions.toLocaleString()}</Field>
          <Field label="Average per order">
            {report.data.avg_transitions_per_order.toFixed(1)}
          </Field>
          <Field label="Change requests">
            {plural(report.data.change_requests.total, "request")}
          </Field>
          {/* The agent records who asked, not who it verified — an actor is a
              claim the caller made. Counted, never presented as attribution. */}
          <Counts label="By claimed actor" counts={report.data.actor_type_counts} />
        </FieldGrid>
      ) : null}
      {differs && (
        <Typography variant="body2" sx={{ mt: 1, color: palette.warningText }} data-state="totals-differ">
          The list below has {plural(listed, "order")}; the agent's count was read separately.
        </Typography>
      )}
      <Box sx={{ mt: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
        <Freshness resource={report} />
        <Button size="small" onClick={report.refresh} disabled={report.validating}>
          {report.validating ? "Refreshing…" : "Refresh"}
        </Button>
      </Box>
    </>
  );
}

export function AgentTotals({ listed }: { listed: number | undefined }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, mb: 2 }} data-card="orders-report">
      {/* Directly under the page's h2, unlike the Reporting cards below the list. */}
      <Typography variant="h3" component="h3" sx={{ mb: 1.5 }}>
        Totals, as the agent counts them
      </Typography>
      <AgentTotalsPanel listed={listed} />
    </Paper>
  );
}

/** Delivery is reported over the agent's default window; the card has no field for it. */
const DELIVERY_DAYS = 30;

function DeliveryFrame({ reload, busy, children }: { reload: () => void; busy: boolean; children: ReactNode }) {
  return (
    <DetailCard
      block="delivery"
      title="Ad server delivery"
      info={`What GAM delivered over the last ${DELIVERY_DAYS} days for the GAM orders that name this deal. The agent keeps a deal's GAM order id out of its responses, so the orders are found by reading up to ${GAM_SCAN} of GAM's. Both reads spend GAM API quota: they run when the row opens and when you reload, never on a timer.`}
      meta={<ReloadButton onClick={reload} busy={busy} what="delivery" />}
    >
      {children}
    </DetailCard>
  );
}

function DeliveryReport({ ids, scan }: { ids: string; scan: ResourceHandle<unknown> }) {
  const report = useResource(
    `gam-report:${ids}:${DELIVERY_DAYS}`,
    (c, signal) => gamDeliveryReport(c, { order_ids: ids, days: DELIVERY_DAYS }, signal),
    { refreshInterval: CADENCE.reporting, manual: true },
  );

  return (
    <DeliveryFrame
      reload={() => {
        scan.refresh();
        report.refresh();
      }}
      busy={scan.validating || report.validating}
    >
      <Typography variant="body2" sx={{ mb: 1 }} data-state="gam-ids">
        GAM {ids.includes(",") ? "orders" : "order"} {ids.split(",").join(", ")}
      </Typography>
      {report.result?.kind === "rejected" ? (
        <GatedNotice what="Delivery reporting" result={report.result} />
      ) : (
        <>
          {report.loading && !report.data ? (
            <Skeleton height={80} />
          ) : report.data ? (
            <RawPayload data={report.data} testId="gam-report" />
          ) : null}
          <Box sx={{ mt: 1.5 }}>
            <Freshness resource={report} />
          </Box>
        </>
      )}
    </DeliveryFrame>
  );
}

/**
 * Delivery for one order, in its row: find the deal's GAM orders, then report
 * on them. The report is mounted only once the ids are known, so it cannot go
 * out with an empty `order_ids` — which upstream requires.
 */
export function OrderDeliveryCard({ dealId }: { dealId: string }) {
  const scan = useGamScan();
  // The GAM ids, not the agent's: /gam/report knows only the ad server's.
  const ids = gamMatches(dealId, scan.result)
    .map((o) => o.id)
    .filter(Boolean)
    .join(",");

  if (ids) return <DeliveryReport ids={ids} scan={scan} />;

  return (
    <DeliveryFrame reload={scan.refresh} busy={scan.validating}>
      {scan.result?.kind === "rejected" ? (
        <GatedNotice what="Ad server orders" result={scan.result} />
      ) : scan.loading && !scan.result ? (
        <Skeleton height={28} />
      ) : (
        <Typography variant="body2" color="text.secondary" data-state="no-gam-order">
          {scan.result?.kind === "ok"
            ? `GAM has no order for deal ${dealId}, so there is no delivery to report.`
            : scan.result
              ? `Could not look up the deal's GAM orders: ${describe(scan.result)}`
              : ""}
        </Typography>
      )}
    </DeliveryFrame>
  );
}
