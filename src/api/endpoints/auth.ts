import { z } from "zod";
import { get, request, TIMEOUTS, type Connection } from "../http";
import type { Result } from "../errors";
import { MutationAck } from "./shared";

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

/**
 * Creating a key returns the secret once. The UI must show it as a one-time
 * value, never persist it, and never put it in a cache key.
 *
 * | Call    | Idempotent? | Confirm? | Failure leaves behind |
 * |---------|-------------|----------|------------------------|
 * | create  | No          | Yes      | A new key exists or not. The secret is in this response only. |
 * | operator| No; 409 if one already exists in some setups | Yes | Same. |
 * | revoke  | Effectively yes — a second revoke 404s | Yes | The key is dead or it is not. |
 */
export const CreatedApiKey = z
  .object({
    key_id: z.string().catch(""),
    api_key: z.string().catch(""),
    role: z.string().catch(""),
    label: z.string().nullable().catch(null),
  })
  .loose();
export type CreatedApiKey = z.infer<typeof CreatedApiKey>;

export const createBuyerApiKey = (
  c: Connection,
  body: { label?: string; expires_in_days?: number; seat_id?: string },
  signal?: AbortSignal,
): Promise<Result<CreatedApiKey>> =>
  request(c, PATHS.apiKeys, { schema: CreatedApiKey, method: "POST", body, signal });

export const createOperatorApiKey = (
  c: Connection,
  body: { label?: string; expires_in_days?: number },
  signal?: AbortSignal,
): Promise<Result<CreatedApiKey>> =>
  request(c, `${PATHS.apiKeys}/operator`, { schema: CreatedApiKey, method: "POST", body, signal });

export const revokeApiKey = (
  c: Connection,
  keyId: string,
  signal?: AbortSignal,
): Promise<Result<MutationAck>> =>
  request(c, `${PATHS.apiKeys}/${encodeURIComponent(keyId)}`, {
    schema: MutationAck,
    method: "DELETE",
    signal,
  });
