import { z } from "zod";
import { get, type Connection } from "../http";
import type { Result } from "../errors";
import { Money } from "./shared";

const PATHS = {
  products: "/products",
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
