import { z } from "zod";
import { get, request, TIMEOUTS, type Connection } from "../http";
import type { Result } from "../errors";
import { MutationAck } from "./shared";

const PATHS = {
  orders: "/api/v1/orders",
  ordersReport: "/api/v1/orders/report",
} as const;

// --- orders ------------------------------------------------------------------

/**
 * Shapes taken from OrderStateMachine.to_dict and order_service, not from
 * openapi.json, whose order responses carry an empty schema.
 */
export const StateTransition = z
  .object({
    from_status: z.string(),
    to_status: z.string(),
    timestamp: z.string(),
    actor: z.string().catch("system"),
    reason: z.string().catch(""),
    transition_id: z.string().optional(),
  })
  .loose();
export type StateTransition = z.infer<typeof StateTransition>;

export const Order = z
  .object({
    order_id: z.string(),
    status: z.string(),
    deal_id: z.string().nullable().catch(null),
    created_at: z.string().nullable().catch(null),
  })
  .loose();
export type Order = z.infer<typeof Order>;

export const OrderList = z
  .object({ orders: z.array(Order), count: z.number().catch(0) })
  .loose();
export type OrderList = z.infer<typeof OrderList>;

export const orders = (
  c: Connection,
  query: { status?: string } = {},
  signal?: AbortSignal,
): Promise<Result<OrderList>> => get(c, PATHS.orders, { schema: OrderList, query, signal });

export const orderById = (
  c: Connection,
  orderId: string,
  signal?: AbortSignal,
): Promise<Result<Order>> =>
  get(c, `${PATHS.orders}/${encodeURIComponent(orderId)}`, { schema: Order, signal });

export const OrderHistory = z
  .object({
    order_id: z.string(),
    current_status: z.string().nullable().catch(null),
    transitions: z.array(StateTransition),
    transition_count: z.number().catch(0),
  })
  .loose();
export type OrderHistory = z.infer<typeof OrderHistory>;

export const orderHistory = (
  c: Connection,
  orderId: string,
  signal?: AbortSignal,
): Promise<Result<OrderHistory>> =>
  get(c, `${PATHS.orders}/${encodeURIComponent(orderId)}/history`, {
    schema: OrderHistory,
    // Audit trails scan storage and can be large.
    timeoutMs: TIMEOUTS.heavy,
    signal,
  });

export const OrdersReport = z
  .object({
    total_orders: z.number().catch(0),
    status_counts: z.record(z.string(), z.number()).catch({}),
    total_transitions: z.number().catch(0),
    avg_transitions_per_order: z.number().catch(0),
    actor_type_counts: z.record(z.string(), z.number()).catch({}),
    change_requests: z
      .object({ total: z.number().catch(0), by_status: z.record(z.string(), z.number()).catch({}) })
      .loose()
      .catch({ total: 0, by_status: {} }),
  })
  .loose();
export type OrdersReport = z.infer<typeof OrdersReport>;

/** Aggregates over every stored order, same as the audit trail — heavy timeout. */
export const ordersReport = (
  c: Connection,
  query: { from_date?: string; to_date?: string } = {},
  signal?: AbortSignal,
): Promise<Result<OrdersReport>> =>
  get(c, PATHS.ordersReport, { schema: OrdersReport, query, timeoutMs: TIMEOUTS.heavy, signal });

/**
 * Superset of `OrderHistory` — same transitions plus change requests. The
 * only order in this deployment has none, so `change_requests` entries are
 * left as loose, unvalidated records until a populated one can be inspected.
 */
export const OrderAudit = z
  .object({
    order_id: z.string(),
    current_status: z.string().nullable().catch(null),
    created_at: z.string().nullable().catch(null),
    transitions: z.array(StateTransition),
    transition_count: z.number().catch(0),
    change_requests: z.array(z.object({}).loose()).catch([]),
    change_request_count: z.number().catch(0),
  })
  .loose();
export type OrderAudit = z.infer<typeof OrderAudit>;

export const orderAudit = (
  c: Connection,
  orderId: string,
  query: { actor?: string; from_date?: string; to_date?: string } = {},
  signal?: AbortSignal,
): Promise<Result<OrderAudit>> =>
  get(c, `${PATHS.orders}/${encodeURIComponent(orderId)}/audit`, {
    schema: OrderAudit,
    query,
    // Same storage scan as /history, with change requests layered on top.
    timeoutMs: TIMEOUTS.heavy,
    signal,
  });

/**
 * | Call       | Idempotent on retry?                    | Confirm? | A failure leaves behind |
 * |------------|-----------------------------------------|----------|-------------------------|
 * | create     | No. Each call mints a new order id.     | Yes      | A new draft exists or it does not. |
 * | transition | No. A 409 names the allowed next states. | Yes      | Either the status moved or it did not. |
 */
export const createOrder = (
  c: Connection,
  body: { deal_id?: string; quote_id?: string; metadata?: Record<string, unknown> },
  signal?: AbortSignal,
): Promise<Result<Order>> =>
  request(c, PATHS.orders, { schema: Order, method: "POST", body, signal });

export const transitionOrder = (
  c: Connection,
  orderId: string,
  body: { to_status: string; actor?: string; reason?: string },
  signal?: AbortSignal,
): Promise<Result<MutationAck>> =>
  request(c, `${PATHS.orders}/${encodeURIComponent(orderId)}/transition`, {
    schema: MutationAck,
    method: "POST",
    body,
    signal,
  });
