import { Fragment, useState } from "react";
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
import { orderAudit, orders } from "../api/endpoints";
import { describe } from "../api/errors";
import { DataPanel, FreshnessNote } from "../components/DataPanel";
import { GatedNotice } from "../components/GatedNotice";
import { PageHeader } from "../components/PageHeader";
import { ReadOnlyNotice } from "../components/ReadOnlyNotice";
import { StatusChip } from "../components/StatusChip";
import { useCredential } from "../credentials/context";
import { OrderRecord, OrderWrites, Panel } from "./mutations";
import { plural, stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";

const STATUSES = [
  "",
  "draft",
  "submitted",
  "pending_approval",
  "approved",
  "rejected",
  "cancelled",
];

/**
 * A change request's per-entry shape has never been observed on the wire —
 * the local store has none, so `orderAudit`'s schema types each entry as a
 * loose, unvalidated object (see orders.ts). `cr_id` is the id field the
 * sibling `/change-requests` endpoint uses; check for it and a couple of
 * generic fallbacks before giving up and keying by position.
 */
function changeRequestKey(entry: Record<string, unknown>, index: number): string {
  const candidate = entry["cr_id"] ?? entry["id"] ?? entry["change_request_id"];
  return typeof candidate === "string" || typeof candidate === "number"
    ? String(candidate)
    : `${index}`;
}

function Timeline({ orderId }: { orderId: string }) {
  const audit = useResource(
    `order-audit:${orderId}`,
    (connection, signal) => orderAudit(connection, orderId, {}, signal),
  );

  if (audit.freshness === "blocked") {
    return <GatedNotice what="Order audit trail" result={audit.result} />;
  }

  if (audit.loading && !audit.data) return <Skeleton height={24} />;

  if (!audit.data) {
    return (
      <Typography variant="body2" color="text.secondary">
        {audit.result ? describe(audit.result) : "no history"}
      </Typography>
    );
  }

  const { transitions, change_requests, change_request_count, created_at } = audit.data;

  return (
    <Stack spacing={1.5}>
      <Box sx={{ fontSize: 12, color: palette.textSecondary }}>Created {stamp(created_at)}</Box>

      {transitions.length === 0 ? (
        <Typography variant="body2" color="text.secondary" data-state="no-transitions">
          No transitions recorded yet.
        </Typography>
      ) : (
        <Box component="ol" sx={{ m: 0, pl: 0, listStyle: "none" }} data-list="transitions">
          {transitions.map((t, index) => (
            <Box
              component="li"
              key={t.transition_id ?? `${t.timestamp}-${index}`}
              sx={{
                display: "flex",
                gap: 1.5,
                alignItems: "baseline",
                py: 0.75,
                borderTop: index === 0 ? "none" : `1px solid ${palette.line}`,
              }}
            >
              <Box sx={{ fontSize: 12, color: palette.textSecondary, minWidth: 130 }}>
                {stamp(t.timestamp)}
              </Box>
              <Box sx={{ fontSize: 13 }}>
                {t.from_status.replace(/_/g, " ")} →{" "}
                <strong>{t.to_status.replace(/_/g, " ")}</strong>
              </Box>
              <Box sx={{ fontSize: 12, color: palette.textSecondary }}>
                {/* The actor is whatever the caller claimed; the API does not
                    verify it, so it is shown as a label, not as attribution. */}
                by {t.actor}
                {t.reason ? ` — ${t.reason}` : ""}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      <Box>
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 0.5 }}>
          {plural(change_request_count, "change request")}
        </Typography>
        {change_requests.length === 0 ? (
          <Typography
            variant="body2"
            color="text.secondary"
            data-state="no-change-requests"
          >
            No change requests recorded yet.
          </Typography>
        ) : (
          <Box
            component="ol"
            sx={{ m: 0, pl: 0, listStyle: "none" }}
            data-list="change-requests"
          >
            {change_requests.map((entry, index) => (
              <Box
                component="li"
                key={changeRequestKey(entry, index)}
                sx={{
                  py: 0.75,
                  borderTop: index === 0 ? "none" : `1px solid ${palette.line}`,
                }}
              >
                {/* The shape was never confirmed against a populated order
                    (see orders.ts), so nothing beyond "it is an object" is
                    assumed — shown raw rather than mapped into fields that
                    might not exist. */}
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    fontSize: 12,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {JSON.stringify(entry, null, 2)}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Typography
        variant="caption"
        component="p"
        data-freshness={audit.freshness}
        sx={{ color: audit.freshness === "stale" ? palette.warningText : palette.textSecondary }}
      >
        {audit.freshness === "live" &&
          audit.asOf !== undefined &&
          `as of ${stamp(new Date(audit.asOf).toISOString())}`}
        {audit.freshness === "stale" && "couldn't refresh — showing the last audit received"}
      </Typography>
    </Stack>
  );
}

export default function OrdersScreen() {
  const [status, setStatus] = useState("");
  const [openOrder, setOpenOrder] = useState<string | undefined>();
  const { writesEnabled } = useCredential();

  const list = useResource(
    `orders:${status}`,
    (connection, signal) => orders(connection, status ? { status } : {}, signal),
    { refreshInterval: CADENCE.orders },
  );

  const rows = list.data?.orders ?? [];

  return (
    <section data-screen="orders">
      <PageHeader
        title="Orders"
        subtitle="Order lifecycle and its audit trail. Transitions are writes."
      />

      {!writesEnabled && <ReadOnlyNotice what="Creating or transitioning an order" />}
      <Panel title="Create and transition">
        <OrderWrites />
      </Panel>

      <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }}>
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
      </Paper>

      <FreshnessNote freshness={list.freshness}>
        {list.freshness === "live" && plural(list.data?.count ?? rows.length, "order")}
        {list.freshness === "stale" && "couldn't refresh — showing the last list received"}
        {list.freshness === "blocked" && "access denied"}
        {list.freshness === "empty" &&
          (list.loading ? "loading…" : list.result ? describe(list.result) : "")}
      </FreshnessNote>

      <DataPanel>
        {list.loading && rows.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Skeleton height={28} />
            <Skeleton height={28} />
          </Box>
        ) : rows.length === 0 ? (
          <Box sx={{ p: 3 }} data-state="empty">
            <Typography variant="body2" color="text.secondary">
              {list.freshness === "empty" && list.result?.kind === "unavailable"
                ? describe(list.result)
                : status
                  ? `No orders with status "${status.replace(/_/g, " ")}".`
                  : "No orders yet."}
            </Typography>
          </Box>
        ) : (
          <Table size="small" data-state="rows">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Order</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Deal</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Created</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((order) => (
                <Fragment key={order.order_id}>
                  <TableRow hover data-row="order">
                    <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                      {order.order_id}
                    </TableCell>
                    <TableCell>
                      <StatusChip status={order.status} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                      {order.deal_id || "—"}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                      {stamp(order.created_at)}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        onClick={() =>
                          setOpenOrder((current) =>
                            current === order.order_id ? undefined : order.order_id,
                          )
                        }
                        aria-expanded={openOrder === order.order_id}
                      >
                        {openOrder === order.order_id ? "Hide history" : "History"}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {openOrder === order.order_id && (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ backgroundColor: palette.ground }}>
                        <Stack spacing={1}>
                          <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
                            Transition history
                          </Typography>
                          <OrderRecord orderId={order.order_id} />
                          <Timeline orderId={order.order_id} />
                          <OrderWrites orderId={order.order_id} />
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </DataPanel>
    </section>
  );
}
