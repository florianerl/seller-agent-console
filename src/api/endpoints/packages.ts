import { z } from "zod";
import { get, type Connection } from "../http";
import type { Result } from "../errors";

const PATHS = {
  packages: "/packages",
} as const;

/**
 * The one catalog route whose *content* depends on the credential. With no key
 * it returns a public view carrying only a `price_range` band; with any valid
 * key it returns exact_price, floor_price and placements. The screen labels
 * what it shows as "as seen by this key" rather than as the catalog.
 */
export const Package = z
  .object({
    package_id: z.string(),
    name: z.string().catch(""),
    rate_type: z.string().nullable().catch(null),
    is_featured: z.boolean().catch(false),
    ad_formats: z.array(z.string()).catch([]),
    // Public view only.
    price_range: z.string().nullable().catch(null),
    // Authenticated view only.
    exact_price: z.number().nullable().catch(null),
    floor_price: z.number().nullable().catch(null),
    currency: z.string().nullable().catch(null),
    negotiation_enabled: z.boolean().nullable().catch(null),
  })
  .loose();
export type Package = z.infer<typeof Package>;

export const PackageList = z.object({ packages: z.array(Package) }).loose();
export type PackageList = z.infer<typeof PackageList>;

export const packages = (c: Connection, signal?: AbortSignal): Promise<Result<PackageList>> =>
  get(c, PATHS.packages, { schema: PackageList, signal });

/**
 * `/packages/{id}` shares `/packages`'s credential sensitivity in both
 * directions: same authenticated-vs-public field split, and — unlike the
 * catalog routes in products.ts — an invalid key is rejected (401) rather than
 * silently treated as anonymous. Confirmed on the live agent.
 */
export const packageById = (
  c: Connection,
  packageId: string,
  signal?: AbortSignal,
): Promise<Result<Package>> =>
  get(c, `${PATHS.packages}/${encodeURIComponent(packageId)}`, { schema: Package, signal });
