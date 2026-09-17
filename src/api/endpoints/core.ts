import { z } from "zod";
import { get, TIMEOUTS, type Connection } from "../http";
import type { Result } from "../errors";

const PATHS = {
  root: "/",
  health: "/health",
  inventorySyncStatus: "/api/v1/inventory-sync/status",
  inventorySyncWatermark: "/api/v1/inventory-sync/watermark",
  supplyChain: "/api/v1/supply-chain",
} as const;

// --- root -------------------------------------------------------------------

/**
 * `version` is a hardcoded literal upstream that has already drifted from the
 * app's declared version, so it is surfaced as "reported version", never as
 * authoritative.
 */
export const RootInfo = z
  .object({
    name: z.string(),
    version: z.string(),
  })
  .loose();
export type RootInfo = z.infer<typeof RootInfo>;

export const root = (c: Connection, signal?: AbortSignal): Promise<Result<RootInfo>> =>
  get(c, PATHS.root, { schema: RootInfo, timeoutMs: TIMEOUTS.probe, signal });

// --- health -----------------------------------------------------------------

export const Health = z.object({ status: z.string() }).loose();
export type Health = z.infer<typeof Health>;

export const health = (c: Connection, signal?: AbortSignal): Promise<Result<Health>> =>
  get(c, PATHS.health, { schema: Health, timeoutMs: TIMEOUTS.probe, signal });

// --- inventory sync ---------------------------------------------------------

export const SyncStatus = z
  .object({
    enabled: z.boolean(),
    last_sync: z.string().nullable().catch(null),
    sync_count: z.number().catch(0),
    task_running: z.boolean().catch(false),
  })
  .loose();
export type SyncStatus = z.infer<typeof SyncStatus>;

export const inventorySyncStatus = (
  c: Connection,
  signal?: AbortSignal,
): Promise<Result<SyncStatus>> =>
  get(c, PATHS.inventorySyncStatus, { schema: SyncStatus, signal });

/**
 * Two shapes: a synced agent reports timestamps, an unsynced one reports a
 * null with a message. The union keeps both renderable.
 */
export const Watermark = z
  .object({
    last_sync_at: z.string().nullable(),
    was_incremental: z.boolean().optional(),
    since_timestamp: z.string().nullable().optional(),
    message: z.string().optional(),
  })
  .loose();
export type Watermark = z.infer<typeof Watermark>;

export const inventorySyncWatermark = (
  c: Connection,
  signal?: AbortSignal,
): Promise<Result<Watermark>> =>
  get(c, PATHS.inventorySyncWatermark, { schema: Watermark, signal });

// --- supply chain -----------------------------------------------------------

/**
 * The seller's own sellers.json/schain declaration, as the agent will present
 * it to a buyer. `is_direct` and the chain length are the two facts a buyer
 * checks, so neither is allowed a default that could invent an answer.
 */
export const SupplyChainNode = z
  .object({
    asi: z.string(),
    sid: z.string(),
    name: z.string().catch(""),
    domain: z.string().nullable().catch(null),
    seller_type: z.string().nullable().catch(null),
    is_direct: z.boolean(),
    comment: z.string().nullable().catch(null),
  })
  .loose();
export type SupplyChainNode = z.infer<typeof SupplyChainNode>;

export const SupplyChain = z
  .object({
    seller_id: z.string(),
    seller_name: z.string().catch(""),
    seller_type: z.string().nullable().catch(null),
    domain: z.string().nullable().catch(null),
    is_direct: z.boolean(),
    supported_deal_types: z.array(z.string()).catch([]),
    contact_email: z.string().nullable().catch(null),
    schain: z.array(SupplyChainNode).catch([]),
    version: z.string().catch(""),
  })
  .loose();
export type SupplyChain = z.infer<typeof SupplyChain>;

export const supplyChain = (c: Connection, signal?: AbortSignal): Promise<Result<SupplyChain>> =>
  get(c, PATHS.supplyChain, { schema: SupplyChain, signal });
