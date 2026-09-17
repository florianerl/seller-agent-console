/**
 * Tracks which resources are currently failing, so the shell can say "the
 * agent looks unreachable" rather than every card saying it separately.
 *
 * Kept distinct from navigator.onLine on purpose. They answer different
 * questions and conflating them produces a banner that lies: onLine is true on
 * a captive portal, and a perfectly connected browser can still be unable to
 * reach one agent.
 */

/** How many distinct resources must be failing before we blame the agent. */
const THRESHOLD = 3;

const failing = new Set<string>();
const listeners = new Set<() => void>();
let snapshot = false;

function recompute(): void {
  const next = failing.size >= THRESHOLD;
  if (next === snapshot) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

export function reportResult(name: string, unavailable: boolean): void {
  if (unavailable) failing.add(name);
  else failing.delete(name);
  recompute();
}

export function subscribeReachability(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAgentUnreachable(): boolean {
  return snapshot;
}

/** Test seam. */
export function resetReachability(): void {
  failing.clear();
  snapshot = false;
  listeners.clear();
}
