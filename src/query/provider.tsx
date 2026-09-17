import { useEffect, useRef, useState } from "react";
import { SWRConfig } from "swr";
import type { ReactNode } from "react";
import { useCredential } from "../credentials/context";
import { sameResult } from "./freshness";
import { loadCache, saveCache, type SwrCache } from "./persistence";

/**
 * Global SWR defaults.
 *
 * No retries: the poll is the retry, and a retry storm against an agent that is
 * already struggling helps nobody.
 *
 * Visibility gating needs no custom code. SWR's default `isVisible` is
 * `document.visibilityState !== "hidden"`, which is what an operator console
 * needs — a tab that is visible but unfocused, on a second monitor or in a
 * split view, must keep polling.
 */
const DEFAULTS = {
  shouldRetryOnError: false,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  refreshWhenHidden: false,
  refreshWhenOffline: false,
  keepPreviousData: true,
  dedupingInterval: 5_000,
  compare: sameResult,
} as const;

export function QueryProvider({ children }: { children: ReactNode }) {
  const { credential } = useCredential();
  const credId = credential?.credId;

  const [cache, setCache] = useState<SwrCache | undefined>();
  const cacheRef = useRef<SwrCache | undefined>(undefined);

  useEffect(() => {
    if (!credId) {
      setCache(undefined);
      cacheRef.current = undefined;
      return;
    }

    let cancelled = false;
    void loadCache(credId, __BUILD_ID__).then((restored) => {
      if (cancelled) return;
      cacheRef.current = restored;
      setCache(restored);
    });

    return () => {
      cancelled = true;
    };
  }, [credId]);

  // Write on hide and on unload rather than on every mutation: polling five
  // resources would otherwise thrash IndexedDB every few seconds for data that
  // only matters if the page goes away.
  useEffect(() => {
    if (!credId) return;

    const persist = () => {
      const current = cacheRef.current;
      if (current) void saveCache(current, credId, __BUILD_ID__);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") persist();
    };

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", persist);

    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", persist);
      persist();
    };
  }, [credId]);

  // Until the cache is hydrated there is nothing to restore, so rendering with
  // a fresh provider would start every card empty and then swap — a visible
  // flash of "no data" on a reload that has perfectly good cached values.
  if (credId && !cache) return null;

  return (
    <SWRConfig
      // Remount on a credential change so one credential's cache can never be
      // handed to another.
      key={credId ?? "anonymous"}
      value={{ ...DEFAULTS, ...(cache ? { provider: () => cache } : {}) }}
    >
      {children}
    </SWRConfig>
  );
}
