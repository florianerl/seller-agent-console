import { useEffect, useState } from "react";
import { useCredential } from "../credentials/context";
import {
  readNegotiations,
  subscribeNegotiations,
  type RecentNegotiation,
} from "../credentials/recentNegotiations";

/**
 * The threads this browser has seen with this key, most recent first. Local
 * bookkeeping, not a request: `asOf` is when the list was last read from
 * IndexedDB, and each entry's `seen_at` is when its thread was last answered.
 */
export function useRecentNegotiations(): {
  negotiations: readonly RecentNegotiation[];
  asOf: number | undefined;
} {
  const credId = useCredential().credential?.credId;
  const [state, setState] = useState<{ negotiations: readonly RecentNegotiation[]; asOf: number | undefined }>({
    negotiations: [],
    asOf: undefined,
  });

  useEffect(() => {
    if (!credId) return;
    let live = true;
    const load = () =>
      void readNegotiations(credId).then((negotiations) => {
        if (live) setState({ negotiations, asOf: Date.now() });
      });
    load();
    const off = subscribeNegotiations(load);
    return () => {
      live = false;
      off();
    };
  }, [credId]);

  return state;
}
