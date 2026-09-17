import { z } from "zod";
import { get, request, type Connection } from "../http";
import type { Result } from "../errors";

const PATHS = {
  mediaKit: "/media-kit",
  mediaKitPackages: "/media-kit/packages",
  mediaKitSearch: "/media-kit/search",
} as const;

/**
 * `/media-kit` and `/media-kit/packages*` answer identically to every caller —
 * no key, a bad key, byte for byte — same as `/products` in products.ts. That
 * makes them credential-insensitive by observation, which is worth recording
 * since `/packages` (packages.ts) and `/media-kit/search` below are not: both
 * reject an invalid key with 401.
 */
const AudienceCapabilities = z
  .object({
    standard_taxonomy_version: z.string().nullable().catch(null),
    contextual_taxonomy_version: z.string().nullable().catch(null),
    supports_standard: z.boolean().catch(false),
    supports_contextual: z.boolean().catch(false),
    supports_agentic: z.boolean().catch(false),
    agentic_spec_version: z.string().nullable().catch(null),
  })
  .loose();

export const MediaKitPackage = z
  .object({
    package_id: z.string(),
    name: z.string().catch(""),
    description: z.string().nullable().catch(null),
    ad_formats: z.array(z.string()).catch([]),
    device_types: z.array(z.string()).catch([]),
    geo_targets: z.array(z.string()).catch([]),
    tags: z.array(z.string()).catch([]),
    price_range: z.string().nullable().catch(null),
    rate_type: z.string().nullable().catch(null),
    is_featured: z.boolean().catch(false),
    audience_capabilities: AudienceCapabilities.nullable().catch(null),
  })
  .loose();
export type MediaKitPackage = z.infer<typeof MediaKitPackage>;

export const MediaKit = z
  .object({
    total_packages: z.number().catch(0),
    featured_count: z.number().catch(0),
    featured: z.array(MediaKitPackage).catch([]),
    all_packages: z.array(MediaKitPackage).catch([]),
  })
  .loose();
export type MediaKit = z.infer<typeof MediaKit>;

export const mediaKit = (c: Connection, signal?: AbortSignal): Promise<Result<MediaKit>> =>
  get(c, PATHS.mediaKit, { schema: MediaKit, signal });

export const MediaKitPackageList = z
  .object({ packages: z.array(MediaKitPackage).catch([]) })
  .loose();
export type MediaKitPackageList = z.infer<typeof MediaKitPackageList>;

export const mediaKitPackages = (
  c: Connection,
  signal?: AbortSignal,
): Promise<Result<MediaKitPackageList>> =>
  get(c, PATHS.mediaKitPackages, { schema: MediaKitPackageList, signal });

/** Returns one `MediaKitPackage`, same shape as an entry in the list above. */
export const mediaKitPackage = (
  c: Connection,
  packageId: string,
  signal?: AbortSignal,
): Promise<Result<MediaKitPackage>> =>
  get(c, `${PATHS.mediaKitPackages}/${encodeURIComponent(packageId)}`, { schema: MediaKitPackage, signal });

// --- search --------------------------------------------------------------------

/** Mirrors `GET /packages`'s type/id/version audience triple. */
export type MediaKitAudienceFilter = {
  audience_type?: string;
  audience_id?: string;
  taxonomy_version?: string;
};

export type MediaKitSearchQuery = {
  query: string;
  buyer_tier?: string;
  advertiser_id?: string;
  agency_id?: string;
  audience_filter?: MediaKitAudienceFilter;
};

export const MediaKitSearchResult = z
  .object({ results: z.array(MediaKitPackage).catch([]) })
  .loose();
export type MediaKitSearchResult = z.infer<typeof MediaKitSearchResult>;

export const searchMediaKit = (
  c: Connection,
  body: MediaKitSearchQuery,
  signal?: AbortSignal,
): Promise<Result<MediaKitSearchResult>> =>
  // Query, not a write: full-text search over the existing media kit, nothing
  // stored. Exempted by exact path in policy.ts (QUERY_SHAPED_PATHS) — the
  // only way a non-GET goes out while writes are off. Unlike the GET routes
  // above, an invalid key here is rejected with 401 — confirmed on the live
  // agent.
  request(c, PATHS.mediaKitSearch, {
    schema: MediaKitSearchResult,
    method: "POST",
    body,
    signal,
  });
