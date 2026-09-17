/**
 * The result taxonomy every API read resolves to.
 *
 * `rejected` is ONLY 401 and 403. Everything else — a 500, an HTML error page
 * from a proxy, a redirect, a schema mismatch, a DNS failure — is
 * `unavailable` with a reason we can show. That split is what lets a changed
 * upstream field degrade a single card instead of crashing a page.
 *
 * Nothing here is thrown. These values are the data a query resolves to, so a
 * rejected read is still a *resolved* read with its own cache entry, and one
 * card's 403 cannot disturb another's state. Thrown errors stay reserved for
 * genuine bugs in our own code, which is what an error boundary should catch.
 */

export type UnavailableReason =
  /** The request exceeded its per-route budget. */
  | "timeout"
  /** fetch rejected: DNS, TLS, connection refused, or a CORS denial. */
  | "network"
  /** The server answered with a redirect, which we never follow. */
  | "redirect"
  /** A non-2xx status that is not 401 or 403. */
  | "http"
  /** A 2xx whose body is not JSON — typically a proxy's HTML error page. */
  | "content-type"
  /** Valid JSON that does not match the schema, or a malformed JSON body. */
  | "shape"
  /**
   * The request would have changed something and this console is read-only.
   * Nothing was sent. See src/api/policy.ts and ADR 12.
   */
  | "writes-disabled"
  /**
   * The same mutation is already in flight, so this attempt was not sent.
   * Client-side only: see src/query/useMutation.ts.
   */
  | "busy";

export type Result<T> =
  | { kind: "ok"; data: T; fetchedAt: number }
  | {
      kind: "rejected";
      status: 401 | 403;
      /** 401: no usable credential. 403: a valid key without the needed role. */
      role: "anonymous" | "insufficient";
      fetchedAt: number;
    }
  | {
      kind: "unavailable";
      reason: UnavailableReason;
      status?: number;
      detail?: string;
      fetchedAt: number;
    };

export function isOk<T>(r: Result<T>): r is Extract<Result<T>, { kind: "ok" }> {
  return r.kind === "ok";
}

/** Human-readable, for card captions. Deliberately non-technical where it can be. */
export function describe(r: Result<unknown>): string {
  switch (r.kind) {
    case "ok":
      return "ok";
    case "rejected":
      return r.role === "anonymous"
        ? "the API rejected this key"
        : "this key lacks the operator role";
    case "unavailable":
      switch (r.reason) {
        case "timeout":
          return "the agent did not respond in time";
        case "network":
          return "could not reach the agent";
        case "redirect":
          return "the agent redirected the request";
        case "http":
          return `the agent returned ${r.status ?? "an error"}`;
        case "content-type":
          return "the agent returned something that was not JSON";
        case "shape":
          return "unexpected response shape";
        case "writes-disabled":
          return "this console is read-only; nothing was sent";
        case "busy":
          return "the previous attempt has not finished";
      }
  }
}
