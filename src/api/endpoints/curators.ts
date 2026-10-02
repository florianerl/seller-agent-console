import { z } from "zod";
import { get, request, type Connection } from "../http";
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

/**
 * `CuratorRegistrationRequest` in openapi.json, every field. Only the first
 * three are required; the rest have server defaults, but a default is the
 * agent's choice rather than the operator's, so the console sends what the
 * form holds. Optional strings are omitted when empty rather than sent as
 * `""`, which the agent would store as a value. The response does not echo
 * `contact_email` or `api_key`, so nothing here can show them again.
 */
export type CuratorRegistration = {
  curator_id: string;
  name: string;
  domain: string;
  curator_type?: string;
  description?: string;
  fee_type?: string;
  fee_value?: number;
  contact_email?: string;
  api_key?: string;
  audience_segments?: string[];
  content_categories?: string[];
  supported_deal_types?: string[];
};

export const registerCurator = (
  c: Connection,
  body: CuratorRegistration,
  signal?: AbortSignal,
): Promise<Result<Curator>> =>
  request(c, PATHS.curators, { schema: Curator, method: "POST", body, signal });
