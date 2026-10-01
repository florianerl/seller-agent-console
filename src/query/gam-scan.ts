import { gamOrders, GamOrderRows } from "../api/endpoints";
import type { Result } from "../api/errors";
import { useResource, type ResourceHandle } from "./useResource";

/** How many GAM orders one lookup reads. Each read spends the network's API quota. */
export const GAM_SCAN = 500;

/**
 * The GAM order list an order's row reads to find its deal. One cache entry
 * for every row and both cards in it, so the Next step finding and the
 * delivery card share one request rather than making two. `manual`, so
 * switching tabs back does not quietly spend another read of GAM's quota.
 */
export function useGamScan(): ResourceHandle<unknown> {
  return useResource("gam-orders:scan", (c, signal) => gamOrders(c, { limit: GAM_SCAN }, signal), {
    manual: true,
  });
}

/**
 * Which GAM orders name a deal. Upstream derives `external_order_id` from
 * `externalOrderId` or a `[deal_id:…]` tag in the order's notes, so an order
 * trafficked by hand and tagged is found too.
 */
export function gamMatches(dealId: string, result: Result<unknown> | undefined): GamOrderRows["orders"] {
  if (result?.kind !== "ok") return [];
  const parsed = GamOrderRows.safeParse(result.data);
  return (parsed.success ? parsed.data.orders : []).filter((o) => o.external_order_id === dealId);
}
