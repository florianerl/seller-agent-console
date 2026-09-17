import type { ZodType } from "zod";
import type { Result, UnavailableReason } from "./errors";
import { isQueryShaped, writesEnabled } from "./policy";

/**
 * The only module in this repository permitted to call fetch.
 *
 * It exports `request`, which takes a method, and `get`, which is that with
 * the method fixed. Centralising the call is what keeps the timeouts, the
 * result taxonomy, the auth header and the redirect policy in one place, and a
 * guard in tests/guards keeps every other module out of the business of
 * issuing requests.
 *
 * This module used to export `get` alone, so that a mutation was not something
 * anyone could write. That restriction was lifted deliberately — see ADR 11,
 * which supersedes ADR 4 and records what it cost.
 */

export type Connection = {
  /** Origin of the seller agent, e.g. https://agent.example.com. No trailing slash needed. */
  readonly baseUrl: string;
  /** Operator or buyer key. Omitted for the anonymous probes during setup. */
  readonly apiKey?: string | undefined;
};

export type QueryValue = string | number | boolean | undefined;

/** The methods the client will issue. Anything outside this set is a typo. */
export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type GetOptions<T> = {
  readonly schema: ZodType<T>;
  readonly query?: Readonly<Record<string, QueryValue>> | undefined;
  readonly timeoutMs?: number | undefined;
  /** Caller cancellation, composed with the timeout. */
  readonly signal?: AbortSignal | undefined;
};

export type RequestOptions<T> = GetOptions<T> & {
  /** Defaults to GET, so a read reads exactly as it did before. */
  readonly method?: Method | undefined;
  /**
   * Serialised as JSON. A GET may not carry one, and passing a body with a GET
   * is a programming error rather than something to drop silently.
   */
  readonly body?: unknown;
};

/**
 * Per-route-class budgets. The 2 s originally specified sits below the p95
 * first byte of a cold-started container, which makes every cold start look
 * like an outage rather than making the app feel fast.
 */
export const TIMEOUTS = {
  /** Setup feedback should be quick, and the poll is the retry. */
  probe: 4_000,
  /** Covers a cold start plus a slow link. */
  normal: 8_000,
  /** Unbounded result sets that scan storage. */
  heavy: 15_000,
} as const;

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Readonly<Record<string, QueryValue>>,
): string {
  // Join by hand rather than with new URL(path, base): the base may carry a
  // path prefix behind a reverse proxy, and URL resolution would discard it.
  const origin = baseUrl.replace(/\/+$/, "");
  const url = new URL(`${origin}${path}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function unavailable(
  reason: UnavailableReason,
  fetchedAt: number,
  extra?: { status?: number; detail?: string },
): Result<never> {
  return {
    kind: "unavailable",
    reason,
    fetchedAt,
    ...(extra?.status !== undefined ? { status: extra.status } : {}),
    ...(extra?.detail !== undefined ? { detail: extra.detail } : {}),
  };
}

/** A read. The method is fixed here so a caller cannot make it anything else. */
export function get<T>(
  connection: Connection,
  path: string,
  options: GetOptions<T>,
): Promise<Result<T>> {
  return request(connection, path, { ...options, method: "GET" });
}

export async function request<T>(
  connection: Connection,
  path: string,
  options: RequestOptions<T>,
): Promise<Result<T>> {
  const {
    schema,
    query,
    timeoutMs = TIMEOUTS.normal,
    signal,
    method = "GET",
    body: requestBody,
  } = options;
  const fetchedAt = Date.now();

  if (method === "GET" && requestBody !== undefined) {
    throw new TypeError("a GET request cannot carry a body");
  }

  // The one place a write is refused. Refusing here rather than at the call
  // sites is the whole design: a call site that forgot to check is still
  // refused, and the refusal is a Result the caller already renders rather
  // than an exception it would have to learn about. Nothing is sent — no
  // request, no preflight, no timer.
  if (method !== "GET" && !writesEnabled() && !isQueryShaped(path)) {
    return unavailable("writes-disabled", fetchedAt);
  }

  const timeout = AbortSignal.timeout(timeoutMs);
  const composed = signal ? AbortSignal.any([timeout, signal]) : timeout;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (connection.apiKey) headers["X-Api-Key"] = connection.apiKey;
  if (requestBody !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(buildUrl(connection.baseUrl, path, query), {
      method,
      headers,
      ...(requestBody !== undefined ? { body: JSON.stringify(requestBody) } : {}),
      // 'manual' rather than 'error': both refuse to follow, but 'error'
      // rejects with a TypeError indistinguishable from a network failure,
      // so a stray trailing slash (FastAPI's redirect_slashes answers 307)
      // would be reported as an outage. 'manual' yields a detectable
      // response instead.
      redirect: "manual",
      // The API sets allow_credentials=false; sending cookies fails CORS.
      credentials: "omit",
      mode: "cors",
      // Authenticated responses must not enter the HTTP cache.
      cache: "no-store",
      signal: composed,
    });
  } catch (cause) {
    if (timeout.aborted) return unavailable("timeout", fetchedAt);
    if (composed.aborted) {
      // Caller cancelled (unmount, key change). Not a fault of the agent.
      return unavailable("network", fetchedAt, { detail: "cancelled" });
    }
    return unavailable("network", fetchedAt, {
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }

  // Browsers surface a refused redirect as an opaque response with status 0;
  // undici (tests, Node) hands back the real 3xx. Catch both.
  if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
    return unavailable("redirect", fetchedAt, {
      ...(response.status ? { status: response.status } : {}),
    });
  }

  if (response.status === 401 || response.status === 403) {
    return {
      kind: "rejected",
      status: response.status,
      role: response.status === 401 ? "anonymous" : "insufficient",
      fetchedAt,
    };
  }

  if (!response.ok) {
    return unavailable("http", fetchedAt, { status: response.status });
  }

  // A mutation that returns nothing is a 204, and a 204 has no content-type to
  // check and no body to parse. The schema still runs, against `undefined`, so
  // a caller expecting a payload here fails as a shape error rather than
  // receiving undefined typed as T.
  if (response.status === 204 || response.status === 205) {
    const parsedEmpty = schema.safeParse(undefined);
    return parsedEmpty.success
      ? { kind: "ok", data: parsedEmpty.data, fetchedAt }
      : unavailable("shape", fetchedAt, {
          status: response.status,
          detail: "the response carried no body",
        });
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("json")) {
    return unavailable("content-type", fetchedAt, {
      status: response.status,
      detail: contentType || "no content-type",
    });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return unavailable("shape", fetchedAt, {
      status: response.status,
      detail: "body was not valid JSON",
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // A changed upstream field lands here and degrades one card. Without this
    // boundary it would reach a template and throw during render.
    return unavailable("shape", fetchedAt, {
      status: response.status,
      detail: parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; "),
    });
  }

  return { kind: "ok", data: parsed.data, fetchedAt };
}
