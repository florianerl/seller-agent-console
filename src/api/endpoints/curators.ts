import { z } from "zod";
import { get, type Connection } from "../http";
import type { Result } from "../errors";

const PATHS = {
  curators: "/api/v1/curators",
} as const;

// --- curators ----------------------------------------------------------------

/**
 * Curators are third-party deal/supply-path optimizers a seller can route
 * inventory through. Shape confirmed against a live instance (openapi.json's
 * schema for this route is empty, same trap as most GETs here): the list item
 * and the detail share every field below except `audience_segments`,
 * `content_categories` and `tags`, which only the detail carries — hence
 * `.catch([])` rather than a bare array, so a list item still parses.
 */
export const CuratorFee = z
  .object({
    fee_type: z.string().catch("percent"),
    fee_value: z.number().catch(0),
    currency: z.string().catch("USD"),
  })
  .loose();
export type CuratorFee = z.infer<typeof CuratorFee>;

export const Curator = z
  .object({
    curator_id: z.string(),
    name: z.string().catch(""),
    domain: z.string().catch(""),
    type: z.string().catch("unknown"),
    description: z.string().catch(""),
    fee: CuratorFee.nullable().catch(null),
    supported_deal_types: z.array(z.string()).catch([]),
    is_active: z.boolean().catch(false),
    audience_segments: z.array(z.string()).catch([]),
    content_categories: z.array(z.string()).catch([]),
    tags: z.array(z.string()).catch([]),
  })
  .loose();
export type Curator = z.infer<typeof Curator>;

export const CuratorList = z
  .object({ curators: z.array(Curator), count: z.number().catch(0) })
  .loose();
export type CuratorList = z.infer<typeof CuratorList>;

export const curators = (c: Connection, signal?: AbortSignal): Promise<Result<CuratorList>> =>
  get(c, PATHS.curators, { schema: CuratorList, signal });

export const curatorById = (
  c: Connection,
  curatorId: string,
  signal?: AbortSignal,
): Promise<Result<Curator>> =>
  get(c, `${PATHS.curators}/${encodeURIComponent(curatorId)}`, { schema: Curator, signal });
