import type { Cache } from "swr";
import { STORES, idbGet, idbSet } from "../credentials/idb";

/** Derived from SWR's own Cache so the provider type stays in step with it. */
export type SwrCache = Map<string, NonNullable<ReturnType<Cache["get"]>>>;

/**
 * Persists the SWR cache so a reload shows last-known values rather than empty
 * cards, with the timestamps that say how old they are.
 *
 * Keyed by credential and build. A different credential must never see the
 * previous one's data, and a new build may have changed the schemas the cached
 * payloads were parsed against, so a stale entry must not be rehydrated into it.
 */

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Persisted = {
  readonly savedAt: number;
  readonly entries: ReadonlyArray<readonly [string, unknown]>;
};

function recordKey(credId: string, buildId: string): string {
  return `swr:${credId}:${buildId}`;
}

export async function loadCache(credId: string, buildId: string): Promise<SwrCache> {
  try {
    const stored = await idbGet<Persisted>(STORES.queryCache, recordKey(credId, buildId));
    if (!stored) return new Map();

    // Data older than a day is more misleading than useful on a console whose
    // whole job is telling you the current state of an agent.
    if (Date.now() - stored.savedAt > MAX_AGE_MS) return new Map();

    return new Map(stored.entries as ReadonlyArray<[string, never]>);
  } catch {
    return new Map();
  }
}

export async function saveCache(
  cache: SwrCache,
  credId: string,
  buildId: string,
): Promise<void> {
  try {
    await idbSet(STORES.queryCache, recordKey(credId, buildId), {
      savedAt: Date.now(),
      entries: [...cache.entries()],
    } satisfies Persisted);
  } catch {
    // Storage full, blocked, or private browsing. Losing the cache costs a
    // skeleton on next load; failing here would cost the whole page.
  }
}
