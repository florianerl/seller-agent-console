import { useEffect, useState } from "react";
import { useCredential } from "../credentials/context";
import { readQuotes, subscribeQuotes, type RecentQuote } from "../credentials/recentQuotes";

/**
 * The quotes this browser made with this key, newest first. Local bookkeeping,
 * not a request: `asOf` is when the list was last read from IndexedDB, and an
 * entry's own `created_at` is when its quote was made. Re-reads when a quote is
 * recorded elsewhere on the page, so the wizard that creates one and the
 * picker that offers it agree without a reload.
 */
export function useRecentQuotes(): { quotes: readonly RecentQuote[]; asOf: number | undefined } {
  const credId = useCredential().credential?.credId;
  const [state, setState] = useState<{ quotes: readonly RecentQuote[]; asOf: number | undefined }>({
    quotes: [],
    asOf: undefined,
  });

  useEffect(() => {
    if (!credId) return;
    let live = true;
    const load = () =>
      void readQuotes(credId).then((quotes) => {
        if (live) setState({ quotes, asOf: Date.now() });
      });
    load();
    const off = subscribeQuotes(load);
    return () => {
      live = false;
      off();
    };
  }, [credId]);

  return state;
}
