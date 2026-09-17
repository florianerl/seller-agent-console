import { z } from "zod";
import { get, TIMEOUTS, type Connection } from "../http";
import type { Result } from "../errors";

const PATHS = {
  apiKeys: "/auth/api-keys",
} as const;

// --- api keys (operator only; used as the role probe) -----------------------

export const ApiKeySummary = z
  .object({
    key_id: z.string(),
    label: z.string().nullable().optional(),
    role: z.string().optional(),
    is_active: z.boolean().optional(),
    expires_at: z.string().nullable().optional(),
  })
  .loose();

/**
 * Deliberately permissive: this route is called to read its *status code*, not
 * its body. A shape change upstream must not turn "the key works" into
 * "unavailable" and lock an operator out of setup.
 */
export const ApiKeyList = z.unknown();

export const apiKeys = (c: Connection, signal?: AbortSignal): Promise<Result<unknown>> =>
  get(c, PATHS.apiKeys, { schema: ApiKeyList, timeoutMs: TIMEOUTS.probe, signal });

/**
 * One key's record. The agent never returns the secret here — only its
 * metadata — and this console must never render one either, so the schema
 * deliberately does not carry a field that could hold it.
 */
export const ApiKeyDetail = z
  .object({
    key_id: z.string(),
    name: z.string().nullable().catch(null),
    role: z.string().nullable().catch(null),
    created_at: z.string().nullable().catch(null),
    expires_at: z.string().nullable().catch(null),
    last_used_at: z.string().nullable().catch(null),
    use_count: z.number().nullable().catch(null),
    revoked: z.boolean().nullable().catch(null),
  })
  .loose();
export type ApiKeyDetail = z.infer<typeof ApiKeyDetail>;

export const apiKeyById = (
  c: Connection,
  keyId: string,
  signal?: AbortSignal,
): Promise<Result<ApiKeyDetail>> =>
  get(c, `${PATHS.apiKeys}/${encodeURIComponent(keyId)}`, { schema: ApiKeyDetail, signal });
