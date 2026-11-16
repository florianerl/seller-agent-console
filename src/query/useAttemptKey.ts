import { useCallback, useState } from "react";
import type { Result } from "../api/errors";

const newKey = () => crypto.randomUUID();

/**
 * One idempotency key per attempt, kept across a retry whose outcome is
 * unknown.
 *
 * Most call sites mint a key per run, which is right when every failure is a
 * definite answer. A negotiation move or a commit is different: a timeout may
 * have landed, and retrying with a fresh key would ask the agent to do it
 * twice — for a commit, to book a second deal. The agent replays an identical
 * body under the same key, so keeping the key makes the retry safe.
 *
 * Any definite answer — success, a 409, a 422 — ends the attempt. Nothing sent
 * (writes off, still busy) or nothing known (timeout, network, an unreadable
 * body) keeps the key.
 */
export function useAttemptKey(): { key: string; settle: (result: Result<unknown>) => void } {
  const [key, setKey] = useState(newKey);
  const settle = useCallback((result: Result<unknown>) => {
    const definite = result.kind !== "unavailable" || result.reason === "http";
    if (definite) setKey(newKey());
  }, []);
  return { key, settle };
}
