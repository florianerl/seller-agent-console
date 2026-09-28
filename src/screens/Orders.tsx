import { Fragment, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { changeRequests, orderAudit, orders, type Order, type OrderAudit } from "../api/endpoints";
import { describe } from "../api/errors";
import { HAPPY_PATH, STAGE, isOrderStatus, nextSteps, type OrderActor } from "../api/order-lifecycle";
import { ORDER_STATUSES, words, type OrderStatus } from "../api/vocabulary";
import { DataPanel, FreshnessNote } from "../components/DataPanel";
import { EnumSelect } from "../components/EnumSelect";
import { GatedNotice } from "../components/GatedNotice";
import { PageHeader } from "../components/PageHeader";
import { ReadOnlyNotice } from "../components/ReadOnlyNotice";
import { StatusChip } from "../components/StatusChip";
import { useCredential } from "../credentials/context";
import { ChangeRequestCreate, OrderCreateWrite, OrderTransitionWrites } from "./mutations";
import { plural, stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import type { ResourceHandle } from "../query/useResource";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";

const sectionHeading = { fontSize: 12, fontWeight: 600, mb: 0.75 } as const;

function asOf(at: number | undefined): string {
  return at === undefined ? "" : `as of ${stamp(new Date(at).toISOString())}`;
}

/** Hand-drawn for the same reason as MenuIcon: no icon package. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms" }}
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

/**
 * The next-step column, so the list itself answers "what does this order
 * need". Forward moves only where there are any: listing "cancel" against
 * every open order would make the column say the same thing on every row.
 */
function nextStepSummary(status: string): string {
  const steps = nextSteps(status);
  const forward = steps.filter((s) => s.kind === "forward");
  const shown = forward.length > 0 ? forward : steps;
  return shown.length > 0 ? shown.map((s) => s.label).join(" or ") : "—";
}

/**
 * Where the order is on the happy path. An off-path status (rejected, failed,
 * cancelled, unbooked) is named beside the strip rather than squeezed into it,
 * since it is a detour, not a step.
 */
function LifecycleStrip({ status }: { status: string }) {
  const onPath = HAPPY_PATH.includes(status as OrderStatus);
  return (
    <Box
      component="ol"
      aria-label="Order lifecycle"
      data-block="lifecycle"
      sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 0.5, fontSize: 12 }}
    >
      {HAPPY_PATH.map((step, index) => {
        const current = step === status;
        return (
          <Box
            component="li"
            key={step}
            aria-current={current ? "step" : undefined}
            sx={{ color: current ? palette.text : palette.textSecondary }}
          >
            {index > 0 && <span aria-hidden="true">→ </span>}
            <Box
              component="span"
              sx={current ? { fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 } : undefined}
            >
              {words(step)}
            </Box>
          </Box>
        );
      })}
      {!onPath && (
        <Box component="li" sx={{ ml: 1, color: palette.textSecondary }}>
          · now off the path: <strong>{words(status)}</strong>
        </Box>
      )}
    </Box>
  );
}

function Timeline({ audit }: { audit: ResourceHandle<OrderAudit> }) {
  if (audit.loading && !audit.data) return <Skeleton height={24} />;

  if (!audit.data) {
    return (
      <Typography variant="body2" color="text.secondary">
        {audit.result ? describe(audit.result) : "no history"}
      </Typography>
    );
  }

  const { transitions, created_at } = audit.data;

  return (
    <Stack spacing={1}>
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
                {words(t.from_status)} → <strong>{words(t.to_status)}</strong>
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
    </Stack>
  );
}

/**
 * Read from `/change-requests?order_id=` rather than the audit's embedded
 * list: the audit types its entries as unvalidated objects (see orders.ts),
 * while the change-requests route has a schema this console already renders
 * on its own screen. The key sits under `change-requests:` so a review or
 * apply there invalidates it here too.
 */
function OrderChangeRequests({ orderId, count }: { orderId: string; count: number | undefined }) {
  const [raising, setRaising] = useState(false);
  const { writesEnabled } = useCredential();
  const list = useResource(`change-requests:order:${orderId}`, (c, signal) =>
    changeRequests(c, { order_id: orderId }, signal),
  );
  const rows = list.data?.change_requests ?? [];

  return (
    <Box data-block="order-change-requests">
      <Stack direction="row" spacing={1.5} alignItems="baseline" sx={{ mb: 0.75 }}>
        <Typography sx={{ ...sectionHeading, mb: 0 }}>
          {plural(count ?? rows.length, "change request")}
        </Typography>
        <Link href="#/change-requests" sx={{ fontSize: 12 }}>
          Review on Change requests
        </Link>
        <Button
          size="small"
          onClick={() => setRaising((v) => !v)}
          aria-expanded={raising}
          data-action="raise-change-request"
          disabled={!writesEnabled}
        >
          {raising ? "Close" : "Request a change"}
        </Button>
      </Stack>

      {list.freshness === "blocked" ? (
        <GatedNotice what="Change requests" result={list.result} />
      ) : list.loading && !list.data ? (
        <Skeleton height={24} />
      ) : !list.data ? (
        <Typography variant="body2" color="text.secondary">
          {list.result ? describe(list.result) : ""}
        </Typography>
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary" data-state="no-change-requests">
          No change requests recorded yet.
        </Typography>
      ) : (
        <Box component="ol" sx={{ m: 0, pl: 0, listStyle: "none" }} data-list="change-requests">
          {rows.map((cr, index) => (
            <Box
              component="li"
              key={cr.cr_id}
              sx={{
                display: "flex",
                gap: 1.5,
                alignItems: "center",
                flexWrap: "wrap",
                py: 0.75,
                borderTop: index === 0 ? "none" : `1px solid ${palette.line}`,
              }}
            >
              <Box sx={{ fontFamily: "monospace", fontSize: 12 }}>{cr.cr_id}</Box>
              <Box sx={{ fontSize: 13 }}>{words(cr.change_type) || "unspecified change"}</Box>
              <StatusChip status={cr.status} />
              <Box sx={{ fontSize: 12, color: palette.textSecondary }}>
                {cr.created_at ? stamp(cr.created_at) : ""}
                {cr.reason ? ` — ${cr.reason}` : ""}
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {list.data && (
        <Typography
          variant="caption"
          component="p"
          data-freshness={list.freshness}
          sx={{ mt: 0.5, color: list.freshness === "stale" ? palette.warningText : palette.textSecondary }}
        >
          {list.freshness === "stale" ? "couldn't refresh — showing the last list received" : asOf(list.asOf)}
        </Typography>
      )}

      <Collapse in={raising} unmountOnExit>
        <Box sx={{ mt: 1.5 }}>
          <ChangeRequestCreate orderId={orderId} />
        </Box>
      </Collapse>
    </Box>
  );
}

function OrderDetail({
  order,
  actor,
  onActorChange,
  onListStale,
  accepted,
  onAccepted,
}: {
  order: Order;
  actor: OrderActor;
  onActorChange: (actor: OrderActor) => void;
  onListStale: () => void;
  accepted: string | undefined;
  onAccepted: (to: string | undefined) => void;
}) {
  const audit = useResource(`order-audit:${order.order_id}`, (connection, signal) =>
    orderAudit(connection, order.order_id, {}, signal),
  );

  if (audit.freshness === "blocked") {
    return <GatedNotice what="Order audit trail" result={audit.result} />;
  }

  // The audit is read when the row opens, so it is fresher than the list,
  // which may be up to a poll interval old. The buttons derive from it.
  const status = audit.data?.current_status ?? order.status;
  const drifted = audit.data?.current_status != null && audit.data.current_status !== order.status;

  return (
    <Stack spacing={2.5} data-block="order-detail">
      <Box>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
          <StatusChip status={status} />
          <Typography variant="body2" data-block="stage">
            {isOrderStatus(status) ? STAGE[status] : "This console does not recognise this status."}
          </Typography>
        </Stack>
        <LifecycleStrip status={status} />
        <Typography
          variant="caption"
          component="p"
          data-freshness={audit.freshness}
          sx={{ mt: 0.5, color: audit.freshness === "stale" ? palette.warningText : palette.textSecondary }}
        >
          {audit.freshness === "stale"
            ? "couldn't refresh — showing the last audit received"
            : audit.data
              ? asOf(audit.asOf)
              : audit.loading
                ? "reading the order…"
                : ""}
          {drifted && ` · the list still shows ${words(order.status)}; the agent now reports ${words(status)}`}
        </Typography>
      </Box>

      <Box>
        <Typography sx={sectionHeading}>Next step</Typography>
        {audit.data || audit.result ? (
          <OrderTransitionWrites
            orderId={order.order_id}
            status={status}
            actor={actor}
            onActorChange={onActorChange}
            onStale={() => {
              audit.refresh();
              onListStale();
            }}
            accepted={accepted}
            onAccepted={onAccepted}
          />
        ) : (
          <Skeleton height={32} />
        )}
      </Box>

      <Box>
        <Typography sx={sectionHeading}>Timeline</Typography>
        <Timeline audit={audit} />
      </Box>

      <OrderChangeRequests orderId={order.order_id} count={audit.data?.change_request_count} />
    </Stack>
  );
}

export default function OrdersScreen() {
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [openOrder, setOpenOrder] = useState<string | undefined>();
  const [creating, setCreating] = useState(false);
  // Kept at screen level so the name typed once carries across every order
  // moved in this visit, rather than being asked for per row.
  const [actor, setActor] = useState<OrderActor>({ kind: "human", id: "" });
  const [accepted, setAccepted] = useState<{ orderId: string; to: string } | undefined>();
  const { writesEnabled } = useCredential();

  const list = useResource(
    `orders:${status}`,
    (connection, signal) => orders(connection, status ? { status } : {}, signal),
    { refreshInterval: CADENCE.orders },
  );

  const rows = list.data?.orders ?? [];
  const toggle = (orderId: string) =>
    setOpenOrder((current) => (current === orderId ? undefined : orderId));

  return (
    <section data-screen="orders">
      <PageHeader
        title="Orders"
        subtitle="Every order the agent has stored. Open one to see where it is in its lifecycle and move it on; each move is a write, recorded with who made it."
        actions={
          <Button
            variant={creating ? "outlined" : "contained"}
            size="small"
            onClick={() => setCreating((v) => !v)}
            aria-expanded={creating}
            data-action="new-order"
          >
            {creating ? "Close" : "New order"}
          </Button>
        }
      >

      {!writesEnabled && <ReadOnlyNotice what="Creating or moving an order" />}

      {/* Inline rather than a dialog: the create button opens its own
          confirmation, and a dialog over a dialog loses the operator. */}
      <Collapse in={creating} unmountOnExit>
        <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }} data-block="new-order">
          <Typography variant="h3" sx={{ mb: 0.5 }}>
            New order
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Orders start in draft. Attach the deal it executes, if there is one; you can submit it
            from its row once it exists.
          </Typography>
          <OrderCreateWrite
            onCreated={(orderId) => {
              // Land the operator on the new order's next step. A filter that
              // would hide a fresh draft is cleared first.
              if (status && status !== "draft") setStatus("");
              setOpenOrder(orderId);
              setCreating(false);
            }}
          />
        </Paper>
      </Collapse>

      <Box sx={{ mb: 2 }}>
        <EnumSelect
          label="Status"
          value={status}
          options={ORDER_STATUSES}
          onChange={setStatus}
          any="Any status"
        />
      </Box>

      <FreshnessNote freshness={list.freshness}>
        {list.freshness === "live" &&
          `${plural(list.data?.count ?? rows.length, "order")} · ${asOf(list.asOf)}`}
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
                  ? `No orders with status "${words(status)}".`
                  : "No orders yet. Use New order to create a draft."}
            </Typography>
          </Box>
        ) : (
          <Table size="small" data-state="rows">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell sx={{ fontWeight: 600 }}>Order</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Next step</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Deal</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((order) => {
                const open = openOrder === order.order_id;
                return (
                  <Fragment key={order.order_id}>
                    <TableRow
                      hover
                      data-row="order"
                      onClick={() => toggle(order.order_id)}
                      sx={{ cursor: "pointer", "& > td": open ? { borderBottom: "none" } : {} }}
                    >
                      <TableCell padding="checkbox">
                        <IconButton
                          size="small"
                          aria-label={`${open ? "Hide" : "Show"} ${order.order_id}`}
                          aria-expanded={open}
                          onClick={(e) => {
                            // The row handles the click; without this it would toggle twice.
                            e.stopPropagation();
                            toggle(order.order_id);
                          }}
                        >
                          <Chevron open={open} />
                        </IconButton>
                      </TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                        {order.order_id}
                      </TableCell>
                      <TableCell>
                        <StatusChip status={order.status} />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12 }} data-cell="next-step">
                        {nextStepSummary(order.status)}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                        {order.deal_id || "—"}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                        {stamp(order.created_at)}
                      </TableCell>
                    </TableRow>
                    {open && (
                      <TableRow>
                        <TableCell colSpan={6} sx={{ backgroundColor: palette.ground, py: 2.5, px: 3 }}>
                          <OrderDetail
                            order={order}
                            actor={actor}
                            onActorChange={setActor}
                            onListStale={list.refresh}
                            accepted={accepted?.orderId === order.order_id ? accepted.to : undefined}
                            onAccepted={(to) => setAccepted(to ? { orderId: order.order_id, to } : undefined)}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DataPanel>
      </PageHeader>
    </section>
  );
}
