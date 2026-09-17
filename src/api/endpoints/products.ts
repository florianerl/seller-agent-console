import { z } from "zod";
import { get, request, type Connection } from "../http";
import type { Result } from "../errors";
import { Money } from "./shared";

const PATHS = {
  products: "/products",
  productAvails: "/products/avails",
  inventoryTypeOverrides: "/api/v1/products",
  discovery: "/discovery",
} as const;

// --- catalog ----------------------------------------------------------------

/**
 * Products, the rate card and the media kit answer identically to every caller
 * — no key, a bad key, an operator key, byte for byte. `/packages` does not:
 * it declares an optional auth dependency and returns a *different view* when
 * any valid key is presented. See `packages` below.
 */
export const Product = z
  .object({
    product_id: z.string(),
    name: z.string().catch(""),
    delivery_type: z.string().nullable().catch(null),
    pricing_model: z.string().nullable().catch(null),
    // Null for "pricing on request only" products. Not an error.
    base_price: Money.nullable().catch(null),
    ad_formats: z.array(z.string()).catch([]),
    available_impressions: z.number().nullable().catch(null),
  })
  .loose();
export type Product = z.infer<typeof Product>;

export const ProductList = z
  .object({
    products: z.array(Product),
    total_count: z.number().catch(0),
    limit: z.number().catch(50),
    offset: z.number().catch(0),
  })
  .loose();
export type ProductList = z.infer<typeof ProductList>;

export const products = (
  c: Connection,
  query: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<Result<ProductList>> => get(c, PATHS.products, { schema: ProductList, query, signal });

/** Same shape as a `Product` in the list; verified byte-for-byte against `/products/{id}`. */
export const productById = (
  c: Connection,
  productId: string,
  signal?: AbortSignal,
): Promise<Result<Product>> =>
  get(c, `${PATHS.products}/${encodeURIComponent(productId)}`, { schema: Product, signal });

// --- inventory type override -------------------------------------------------

/**
 * Shape inferred from the POST request body (`InventoryTypeOverride` in
 * openapi.json): every product probed in this environment has no override set,
 * so the 200 body was never observed — only the 404 `{"detail": {"error":
 * "no_override", ...}}"` this seller returns when none exists. That 404 comes
 * back through `get` as `unavailable / "http"` with status 404, same as any
 * other not-found; there is no dedicated "absent" result kind.
 */
export const InventoryTypeOverride = z
  .object({
    product_id: z.string(),
    inventory_type: z.string(),
    reason: z.string().nullable().catch(null),
  })
  .loose();
export type InventoryTypeOverride = z.infer<typeof InventoryTypeOverride>;

export const inventoryTypeOverride = (
  c: Connection,
  productId: string,
  signal?: AbortSignal,
): Promise<Result<InventoryTypeOverride>> =>
  get(c, `${PATHS.inventoryTypeOverrides}/${encodeURIComponent(productId)}/inventory-type`, {
    schema: InventoryTypeOverride,
    signal,
  });

// --- avails -------------------------------------------------------------------

/**
 * `POST /products/avails` accepts two dialects, discriminated by which
 * required fields are present: the legacy single-product form (`productid`,
 * scalar) and the spec `ProductAvailsSearch` multi-product form (`productids`,
 * array, plus `accountid`/`advertiserbrandid`). The response follows whichever
 * dialect the request used. A narrow TS type is enough here — the body is
 * never round-tripped through a schema, only sent.
 */
export type AvailsQuery =
  | {
      productid: string;
      startdate: string;
      enddate: string;
      requestedImpressions?: number;
      budget?: number;
      targeting?: Record<string, unknown>;
    }
  | {
      productids: string[];
      accountid: string;
      advertiserbrandid: string;
      startdate: string;
      enddate: string;
      currency?: string;
      targeting?: Record<string, unknown>[];
      producttargeting?: unknown[];
      grouping?: unknown[];
      availabilityfields?: unknown[];
    };

/** One product's availability, in the legacy dialect's field names. */
export const Avails = z
  .object({
    productid: z.string(),
    availableImpressions: z.number(),
    estimatedCpm: z.number(),
    totalCost: z.number(),
    guaranteedImpressions: z.number().nullable().catch(null),
    availableTargeting: z.array(z.string()).nullable().catch(null),
    // Omitted by the seller when it has no forecast source — never fabricated.
    deliveryConfidence: z.number().nullable().catch(null),
  })
  .loose();
export type Avails = z.infer<typeof Avails>;

/** The spec dialect's envelope: the same records, wrapped in `{ avails }`. */
export const AvailsCollection = z.object({ avails: z.array(Avails) }).loose();
export type AvailsCollection = z.infer<typeof AvailsCollection>;

export const AvailsCheckResult = z.union([AvailsCollection, Avails]);
export type AvailsCheckResult = z.infer<typeof AvailsCheckResult>;

export const checkAvails = (
  c: Connection,
  body: AvailsQuery,
  signal?: AbortSignal,
): Promise<Result<AvailsCheckResult>> =>
  // Query, not a write: derives availability from the cached catalog and
  // reserves nothing. Exempted by exact path in policy.ts (QUERY_SHAPED_PATHS)
  // — the only way a non-GET goes out while writes are off.
  request(c, PATHS.productAvails, {
    schema: AvailsCheckResult,
    method: "POST",
    body,
    signal,
  });

// --- discovery ----------------------------------------------------------------

export type DiscoveryQuery = {
  query: string;
  buyer_tier?: string;
  agent_url?: string;
  agency_id?: string;
};

const DiscoveryTierConfig = z
  .object({
    tier: z.string().catch("public"),
    tier_name: z.string().catch(""),
    description: z.string().catch(""),
    show_exact_price: z.boolean().catch(false),
    price_range_variance: z.number().nullable().catch(null),
    tier_discount: z.number().catch(0),
    negotiation_enabled: z.boolean().catch(false),
    premium_inventory_access: z.boolean().catch(false),
    custom_deals_enabled: z.boolean().catch(false),
    volume_discounts_enabled: z.boolean().catch(false),
    avails_granularity: z.string().nullable().catch(null),
  })
  .loose();

const DiscoveryCatalogItem = z
  .object({
    product_id: z.string(),
    name: z.string().catch(""),
    description: z.string().nullable().catch(null),
    inventory_type: z.string().nullable().catch(null),
    deal_types: z.array(z.string()).catch([]),
    price_range: z.string().nullable().catch(null),
  })
  .loose();

/**
 * `buyer_tier` in the request body picks the tier (default "public"); an
 * invalid key 401s even though the tier comes from the body, not the key —
 * observed on the live agent, not just inferred from the schema.
 */
export const Discovery = z
  .object({
    access_tier: z.string().catch("public"),
    tier_config: DiscoveryTierConfig,
    catalog: z.array(DiscoveryCatalogItem).catch([]),
  })
  .loose();
export type Discovery = z.infer<typeof Discovery>;

export const discovery = (
  c: Connection,
  body: DiscoveryQuery,
  signal?: AbortSignal,
): Promise<Result<Discovery>> =>
  // Query, not a write: answers "what matches this brief" from the existing
  // catalog. Exempted by exact path in policy.ts (QUERY_SHAPED_PATHS) — the
  // only way a non-GET goes out while writes are off.
  request(c, PATHS.discovery, { schema: Discovery, method: "POST", body, signal });
