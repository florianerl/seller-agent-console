import { z } from "zod";
import { get, request, type Connection } from "../http";
import type { Result } from "../errors";
import { MutationAck } from "./shared";

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
    // Both views carry these (AuthenticatedPackageView extends the public
    // one upstream); they are what the package editor prefills from.
    description: z.string().nullable().catch(null),
    // AdCOM DeviceType integers — see the same field in media-kit.ts.
    device_types: z.array(z.union([z.number(), z.string()])).catch([]),
    geo_targets: z.array(z.string()).catch([]),
    tags: z.array(z.string()).catch([]),
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
 * The same route as a caller with no key sees it: the key is dropped from the
 * connection, so the agent answers with the public view — a `price_range` band
 * where the authenticated view has exact and floor prices. This is what an
 * operator cannot see by looking at their own screen.
 */
export const publicPackages = (c: Connection, signal?: AbortSignal): Promise<Result<PackageList>> =>
  get({ baseUrl: c.baseUrl }, PATHS.packages, { schema: PackageList, signal });

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

/**
 * `PackageCreateRequest` (interfaces/api/schemas.py), less what the console
 * never sends. Only name and the two prices are required; every list defaults
 * to empty upstream. A package created without `product_ids` has no
 * placements — Assemble is the route that builds one from products.
 */
export type PackageCreate = {
  name: string;
  base_price: number;
  floor_price: number;
  description?: string;
  ad_formats?: string[];
  device_types?: number[];
  geo_targets?: string[];
  tags?: string[];
  is_featured?: boolean;
};

export const createPackage = (
  c: Connection,
  body: PackageCreate,
  signal?: AbortSignal,
): Promise<Result<Package>> =>
  request(c, PATHS.packages, { schema: Package, method: "POST", body, signal });

export const updatePackage = (
  c: Connection,
  packageId: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Result<Package>> =>
  request(c, `${PATHS.packages}/${encodeURIComponent(packageId)}`, {
    schema: Package,
    method: "PUT",
    body,
    signal,
  });

export const deletePackage = (
  c: Connection,
  packageId: string,
  signal?: AbortSignal,
): Promise<Result<MutationAck>> =>
  request(c, `${PATHS.packages}/${encodeURIComponent(packageId)}`, {
    schema: MutationAck,
    method: "DELETE",
    signal,
  });

export const assemblePackage = (
  c: Connection,
  body: { name: string; product_ids: string[] },
  signal?: AbortSignal,
): Promise<Result<Package>> =>
  request(c, `${PATHS.packages}/assemble`, { schema: Package, method: "POST", body, signal });

export const syncPackages = (
  c: Connection,
  signal?: AbortSignal,
): Promise<Result<MutationAck>> =>
  request(c, `${PATHS.packages}/sync`, { schema: MutationAck, method: "POST", signal });
