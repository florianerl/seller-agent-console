import type { Result } from "../api/errors";

/**
 * How much to trust what is on screen. No value is ever rendered without a
 * timestamp, and no stale value is ever rendered looking fresh.
 */
export type Freshness =
  /** Last fetch succeeded. */
  | "live"
  /** Last fetch failed but a previous value exists; shown, visibly aged. */
  | "stale"
  /** Last result was rejected; the value is cleared, not aged. */
  | "blocked"
  /** Nothing has ever succeeded. */
  | "empty";

export type Resource<T> = {
  readonly data: T | undefined;
  readonly asOf: number | undefined;
  readonly freshness: Freshness;
  readonly result: Result<T> | undefined;
  readonly loading: boolean;
};

/**
 * Derives what to show from the latest result and the last known good value.
 *
 * The `blocked` rule matters: a 403 arriving after a key is downgraded or
 * revoked must clear the value, not age it. Continuing to display data the
 * current credential is no longer entitled to see would be a disclosure, not a
 * staleness problem.
 */
export function derive<T>(
  result: Result<T> | undefined,
  lastGood: { data: T; at: number } | undefined,
  loading: boolean,
): Resource<T> {
  if (result?.kind === "ok") {
    return {
      data: result.data,
      asOf: result.fetchedAt,
      freshness: "live",
      result,
      loading,
    };
  }

  if (result?.kind === "rejected") {
    return { data: undefined, asOf: undefined, freshness: "blocked", result, loading };
  }

  if (result?.kind === "unavailable" && lastGood) {
    return {
      data: lastGood.data,
      asOf: lastGood.at,
      freshness: "stale",
      result,
      loading,
    };
  }

  return { data: undefined, asOf: undefined, freshness: "empty", result, loading };
}

/** Equality for SWR that ignores the timestamp, so an unchanged payload keeps its identity. */
export function sameResult(a: unknown, b: unknown): boolean {
  const strip = (value: unknown) => {
    if (value && typeof value === "object" && "fetchedAt" in value) {
      const { fetchedAt: _ignored, ...rest } = value as Record<string, unknown>;
      return rest;
    }
    return value;
  };
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}
