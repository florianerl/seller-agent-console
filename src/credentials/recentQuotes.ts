import { STORES, idbGet, idbSet } from "./idb";

/**
 * The quotes this browser created with this key, kept so an id is not lost.
 *
 * The agent has no route that lists quotes. An id comes back once, in the
 * response that created it, and is valid for 24 hours; the operator needs it
 * again to negotiate on the quote and to book it. This is a note-to-self, not
 * the agent's state: it knows nothing of quotes a buyer or another operator
 * created, and nothing here says a quote is still bookable upstream. Checking
 * that is `GET /api/v1/quotes/{id}`, which writes (it persists `expired`), so
 * it stays an explicit act and is never done to validate this list.
 *
 * Keyed by `credId`, never by the API key, in the same IndexedDB database as
 * the credential: sign-out deletes the database, and this list goes with it.
 */
export type RecentQuote = {
  readonly quote_id: string;
  readonly product_id: string;
  readonly product_name: string | null;
  readonly deal_type: string;
  /** The final CPM in micros, as `Money` carries it; null when the quote had none. */
  readonly final_cpm_micros: number | null;
  readonly currency: string;
  /** From the quote; null when the agent did not say, in which case 24 h from creation is assumed. */
  readonly expires_at: string | null;
  /** When this browser recorded it (ms since the epoch): the entry's own `asOf`. */
  readonly created_at: number;
};

export const MAX_QUOTES = 50;
/** An expired entry is still shown, marked, for this long: "that id expired" beats "that id vanished". */
export const GRACE_MS = 60 * 60 * 1000;
const QUOTE_TTL_MS = 24 * 60 * 60 * 1000;

/** When the quote stops being worth booking, as far as this browser can tell. */
export function expiresAtMs(q: Pick<RecentQuote, "expires_at" | "created_at">): number {
  const stated = q.expires_at ? Date.parse(q.expires_at) : NaN;
  return Number.isFinite(stated) ? stated : q.created_at + QUOTE_TTL_MS;
}

/** Past its expiry, by this browser's clock. Says nothing about the agent's view. */
export function isExpiredLocally(q: Pick<RecentQuote, "expires_at" | "created_at">, now = Date.now()): boolean {
  return expiresAtMs(q) <= now;
}

/**
 * "expires in 3 h" or "expired 2 h ago". By this browser's clock, so the
 * picker words an expired entry as expired *here*, not as unavailable upstream.
 */
export function describeExpiry(q: Pick<RecentQuote, "expires_at" | "created_at">, now = Date.now()): string {
  const delta = expiresAtMs(q) - now;
  const minutes = Math.floor(Math.abs(delta) / 60_000);
  const span = minutes < 1 ? "under a minute" : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h`;
  return delta > 0 ? `expires in ${span}` : `expired ${span} ago`;
}

/** Newest first, with entries past expiry plus grace dropped, capped. */
function tidy(list: readonly RecentQuote[], now: number): RecentQuote[] {
  return list
    .filter((q) => expiresAtMs(q) + GRACE_MS > now)
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, MAX_QUOTES);
}

const listeners = new Set<() => void>();
/** Lets a mounted picker pick up a quote recorded elsewhere on the page. */
export function subscribeQuotes(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export async function readQuotes(credId: string, now = Date.now()): Promise<RecentQuote[]> {
  try {
    const stored = await idbGet<RecentQuote[]>(STORES.recentQuotes, credId);
    return tidy(Array.isArray(stored) ? stored : [], now);
  } catch {
    // Private browsing or blocked storage: a missing note-to-self, not an outage.
    return [];
  }
}

// One write at a time: two quotes created back to back both read the list
// before either writes, and the second write would drop the first.
let queue: Promise<unknown> = Promise.resolve();

export function recordQuote(credId: string, entry: RecentQuote, now = Date.now()): Promise<void> {
  const run = queue.then(async () => {
    try {
      const current = await readQuotes(credId, now);
      const without = current.filter((q) => q.quote_id !== entry.quote_id);
      await idbSet(STORES.recentQuotes, credId, tidy([entry, ...without], now));
      listeners.forEach((fn) => fn());
    } catch {
      // Not being able to remember a quote must not fail creating one.
    }
  });
  queue = run;
  return run;
}
