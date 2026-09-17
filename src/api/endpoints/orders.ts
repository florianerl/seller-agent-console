import { z } from "zod";
import { get, TIMEOUTS, type Connection } from "../http";
import type { Result } from "../errors";

const PATHS = {
  orders: "/api/v1/orders",
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
