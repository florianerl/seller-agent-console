import { z } from "zod";
import { get, TIMEOUTS, type Connection } from "../http";
import type { Result } from "../errors";

const PATHS = {
  gamOrders: "/gam/orders",
  gamReport: "/gam/report",
} as const;

// --- Google Ad Manager reporting (operator only) --------------------------

/**
 * These proxy a connected GAM network directly rather than the agent's own
 * store, and require an API key the local instance doesn't have configured
 * (both routes answer 401 without one), so neither shape below was observed
 * live. openapi.json doesn't help either: it declares the response as
 * `{"type": "object", "additionalProperties": true}` with no properties at
 * all — GAM's own SOAP/report payload passed through unshaped. The schemas
 * here accept any object rather than asserting fields that might not exist,
 * which is the only honest option until this is run against a network with
 * GAM credentials.
 */
export const GamOrdersResponse = z.object({}).loose();
export type GamOrdersResponse = z.infer<typeof GamOrdersResponse>;

export const gamOrders = (
  c: Connection,
  query: { limit?: number; agent_created_only?: boolean } = {},
  signal?: AbortSignal,
): Promise<Result<GamOrdersResponse>> =>
  get(c, PATHS.gamOrders, { schema: GamOrdersResponse, query, timeoutMs: TIMEOUTS.heavy, signal });

export const GamDeliveryReport = z.object({}).loose();
export type GamDeliveryReport = z.infer<typeof GamDeliveryReport>;

/** `order_ids` is required upstream and is a single comma-joined string, not an array. */
export const gamDeliveryReport = (
  c: Connection,
  query: { order_ids: string; days?: number },
  signal?: AbortSignal,
): Promise<Result<GamDeliveryReport>> =>
  get(c, PATHS.gamReport, { schema: GamDeliveryReport, query, timeoutMs: TIMEOUTS.heavy, signal });
