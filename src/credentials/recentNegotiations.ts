import type { NegotiationThread } from "../api/endpoints";
import { STORES, idbGet, idbSet } from "./idb";

/**
 * OpenProposal negotiation threads this browser opened or looked up with this
 * key, kept so an id is not lost.
 *
 * The agent has no route that lists threads, and a thread is invisible to
 * every key but the one that opened it. Its id comes back once, in the
 * response that opened it. This is a note-to-self, not the agent's state: the
 * state and version here are as of the last response this browser saw, and
 * the thread view re-reads the thread before showing either.
 *
 * Keyed by `credId`, never by the API key, in the same IndexedDB database as
 * the credential: sign-out deletes the database, and this list goes with it.
 */
export type RecentNegotiation = {
  readonly negotiation_id: string;
  readonly proposal_id: string;
  readonly line_item_id: string;
  /** As of `seen_at`. */
  readonly state: string;
  readonly version: number;
  /** The last rate either side named, as of `seen_at`. */
  readonly rate: number | null;
  readonly currency: string | null;
  /** When this browser last saw the thread (ms since the epoch): the entry's own `asOf`. */
  readonly seen_at: number;
};

const MAX_NEGOTIATIONS = 50;

export function fromThread(thread: NegotiationThread, now = Date.now()): RecentNegotiation {
  const pricing = thread.line_item.pricing[0];
  const named = [...thread.negotiation_history].reverse().find((e) => e.ext?.rate != null)?.ext?.rate ?? null;
  return {
    negotiation_id: thread.negotiation_id,
    proposal_id: thread.proposal_id,
    line_item_id: thread.line_item.line_item_id,
    state: thread.state,
    version: thread.version,
    rate: named ?? pricing?.agreed_rate ?? null,
    currency: pricing?.currency ?? null,
    seen_at: now,
  };
}

const listeners = new Set<() => void>();
/** Lets a mounted list pick up a thread recorded elsewhere on the page. */
export function subscribeNegotiations(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export async function readNegotiations(credId: string): Promise<RecentNegotiation[]> {
  try {
    const stored = await idbGet<RecentNegotiation[]>(STORES.recentNegotiations, credId);
    return Array.isArray(stored) ? [...stored].sort((a, b) => b.seen_at - a.seen_at) : [];
  } catch {
    // Private browsing or blocked storage: a missing note-to-self, not an outage.
    return [];
  }
}

// One write at a time, for the same reason as recentQuotes: two responses in
// quick succession both read before either writes, and the second would drop
// the first.
let queue: Promise<unknown> = Promise.resolve();

export function recordNegotiation(credId: string, entry: RecentNegotiation): Promise<void> {
  const run = queue.then(async () => {
    try {
      const current = await readNegotiations(credId);
      const rest = current.filter((n) => n.negotiation_id !== entry.negotiation_id);
      await idbSet(STORES.recentNegotiations, credId, [entry, ...rest].slice(0, MAX_NEGOTIATIONS));
      listeners.forEach((fn) => fn());
    } catch {
      // Not being able to remember a thread must not fail the move that made it.
    }
  });
  queue = run;
  return run;
}
