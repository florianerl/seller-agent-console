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
import { orderHistory, orders } from "../api/endpoints";
import { describe } from "../api/errors";
import { StatusChip } from "../components/StatusChip";
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

function Timeline({ orderId }: { orderId: string }) {
  const history = useResource(
    `order-history:${orderId}`,
    (connection, signal) => orderHistory(connection, orderId, signal),
  );

  if (history.loading && !history.data) return <Skeleton height={24} />;

  if (!history.data) {
    return (
      <Typography variant="body2" color="text.secondary">
        {history.result ? describe(history.result) : "no history"}
      </Typography>
    );
  }

  const { transitions } = history.data;

  if (transitions.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" data-state="no-transitions">
        No transitions recorded yet.
      </Typography>
    );
  }

  return (
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
            {t.from_status.replace(/_/g, " ")} → <strong>{t.to_status.replace(/_/g, " ")}</strong>
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
  );
}

export default function OrdersScreen() {
  const [status, setStatus] = useState("");
  const [openOrder, setOpenOrder] = useState<string | undefined>();

  const list = useResource(
    `orders:${status}`,
    (connection, signal) => orders(connection, status ? { status } : {}, signal),
    { refreshInterval: CADENCE.orders },
  );

  const rows = list.data?.orders ?? [];

  return (
    <section data-screen="orders">
      <Typography variant="h2" sx={{ fontSize: 20, fontWeight: 600, mb: 0.5 }}>
        Orders
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Order lifecycle and its audit trail. Read-only — transitions are made
        through the agent, not here.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
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

      <Box
        data-freshness={list.freshness}
        sx={{
          mb: 1,
          fontSize: 12,
          color: list.freshness === "stale" ? palette.warningText : palette.textSecondary,
        }}
      >
        {list.freshness === "live" && plural(list.data?.count ?? rows.length, "order")}
        {list.freshness === "stale" && "couldn't refresh — showing the last list received"}
        {list.freshness === "blocked" && "access denied"}
        {list.freshness === "empty" &&
          (list.loading ? "loading…" : list.result ? describe(list.result) : "")}
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
                          <Timeline orderId={order.order_id} />
                        </Stack>
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
