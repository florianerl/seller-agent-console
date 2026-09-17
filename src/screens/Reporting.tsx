import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { gamDeliveryReport, gamOrders, ordersReport } from "../api/endpoints";
import { describe } from "../api/errors";
import { Field, FieldGrid } from "../components/Field";
import { GatedNotice } from "../components/GatedNotice";
import { PageHeader } from "../components/PageHeader";
import { plural, stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import { useResource, type ResourceHandle } from "../query/useResource";
import { palette } from "../theme/palette";

/**
 * Delivery reporting, from two different places that must not be blended: the
 * agent's own aggregate over the orders it stores, and a passthrough to a
 * connected Google Ad Manager network.
 *
 * Nothing here polls. The GAM routes proxy an external ad server, so a timer on
 * this screen spends someone else's quota on a tab nobody is looking at, and
 * the delivery report needs an operator to say which orders they mean before it
 * can run at all.
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

/**
 * GAM's payload reaches the agent unshaped and leaves it the same way — the
 * API declares the response as an object with no properties at all. Rendering
 * it verbatim is the only honest option: a table here would be this console
 * inventing a structure for data it has never seen, and an operator would have
 * no way to tell the invention from the network's own answer.
 */
function RawPayload({ data, testId }: { data: unknown; testId: string }) {
  return (
    <Box
      component="pre"
      data-payload={testId}
      sx={{
        m: 0,
        p: 1.5,
        maxHeight: 320,
        overflow: "auto",
        fontSize: 12,
        lineHeight: 1.5,
        backgroundColor: palette.ground,
        border: `1px solid ${palette.line}`,
        borderRadius: 1,
      }}
    >
      {JSON.stringify(data, null, 2)}
    </Box>
  );
}

/** The caption every value on this screen carries: what it is, and when it arrived. */
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

function OrdersSummary() {
  const report = useResource("orders-report", (c, signal) => ordersReport(c, {}, signal), {
    refreshInterval: CADENCE.reporting,
  });

  if (report.result?.kind === "rejected") {
    return <GatedNotice what="The order summary" result={report.result} />;
  }

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }} data-card="orders-report">
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1.5 }}>
        <Typography variant="h3">Orders, as the agent counts them</Typography>
        <Button size="small" onClick={report.refresh} disabled={report.validating}>
          {report.validating ? "Refreshing…" : "Refresh"}
        </Button>
      </Stack>

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
          <Counts label="By status" counts={report.data.status_counts} />
          {/* The agent records who asked, not who it verified — an actor is a
              claim the caller made. Counted, never presented as attribution. */}
          <Counts label="By claimed actor" counts={report.data.actor_type_counts} />
        </FieldGrid>
      ) : null}

      <Box sx={{ mt: 1.5 }}>
        <Freshness resource={report} />
      </Box>
    </Paper>
  );
}

/**
 * The loaded halves live in their own components so the request is made by
 * mounting rather than by a flag inside the fetcher. A hook cannot be called
 * conditionally, and faking an "idle" result to keep one quiet would put a
 * state in the Result taxonomy that means "we did not ask" — which is not a
 * thing that can happen to a request.
 */
function GamOrdersPanel() {
  const list = useResource("gam-orders", (c, signal) => gamOrders(c, { limit: 50 }, signal), {
    refreshInterval: CADENCE.reporting,
  });

  if (list.result?.kind === "rejected") {
    return <GatedNotice what="Ad server orders" result={list.result} />;
  }

  return (
    <>
      {list.loading && !list.data ? (
        <Skeleton height={80} />
      ) : list.data ? (
        <RawPayload data={list.data} testId="gam-orders" />
      ) : null}
      <Box sx={{ mt: 1.5 }}>
        <Freshness resource={list} />
      </Box>
    </>
  );
}

function GamOrders() {
  const [loaded, setLoaded] = useState(false);

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }} data-card="gam-orders">
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1.5 }}>
        <Typography variant="h3">Orders in the connected ad server</Typography>
        {!loaded && (
          <Button size="small" onClick={() => setLoaded(true)}>
            Load
          </Button>
        )}
      </Stack>

      {loaded ? (
        <GamOrdersPanel />
      ) : (
        <Typography variant="body2" color="text.secondary" data-state="idle">
          Not loaded. This calls the connected ad server through the agent, so it
          runs when you ask for it.
        </Typography>
      )}
    </Paper>
  );
}

function DeliveryReportPanel({ orderIds, days }: { orderIds: string; days: number }) {
  const report = useResource(
    `gam-report:${orderIds}:${days}`,
    (c, signal) => gamDeliveryReport(c, { order_ids: orderIds, days }, signal),
    { refreshInterval: CADENCE.reporting },
  );

  if (report.result?.kind === "rejected") {
    return <GatedNotice what="Delivery reporting" result={report.result} />;
  }

  return (
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
  );
}

function DeliveryReport() {
  const [orderIds, setOrderIds] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [days, setDays] = useState("30");

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }} data-card="gam-report">
      <Typography variant="h3" sx={{ mb: 1.5 }}>
        Delivery for specific orders
      </Typography>

      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(orderIds.trim());
        }}
        sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2, alignItems: "flex-start" }}
      >
        <TextField
          size="small"
          label="Order IDs"
          // The agent takes one comma-joined string rather than a repeated
          // parameter, so the field asks for exactly what it sends.
          helperText="Comma-separated, as the ad server knows them"
          value={orderIds}
          onChange={(e) => setOrderIds(e.target.value)}
          sx={{ minWidth: 280 }}
        />
        <TextField
          size="small"
          label="Days"
          type="number"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          sx={{ width: 110 }}
        />
        <Button type="submit" variant="outlined" size="small" disabled={!orderIds.trim()}>
          Run report
        </Button>
      </Box>

      {submitted ? (
        <DeliveryReportPanel orderIds={submitted} days={Number(days) || 30} />
      ) : (
        <Typography variant="body2" color="text.secondary" data-state="idle">
          Name the orders you want delivery for. Nothing is requested until you do.
        </Typography>
      )}
    </Paper>
  );
}

export default function ReportingScreen() {
  return (
    <section data-screen="reporting">
      <PageHeader
        title="Reporting"
        subtitle="What the agent counted, and what the connected ad server reports."
      />

      <Stack spacing={2}>
        <OrdersSummary />
        <GamOrders />
        <DeliveryReport />
      </Stack>
    </section>
  );
}
