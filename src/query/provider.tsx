import { SWRConfig } from "swr";
import type { ReactNode } from "react";
import { sameResult } from "./freshness";

/**
 * Global SWR defaults.
 *
 * No retries: the poll is the retry, and a retry storm against an agent that is
 * already struggling helps nobody.
 *
 * Visibility gating needs no custom code here. SWR's default `isVisible` is
 * `document.visibilityState !== "hidden"`, which is what an operator console
 * needs — a tab that is visible but unfocused, on a second monitor or in a
 * split view, must keep polling. (TanStack Query keys on window focus instead
 * and has to be patched for this.)
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        shouldRetryOnError: false,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        refreshWhenHidden: false,
        refreshWhenOffline: false,
        keepPreviousData: true,
        dedupingInterval: 5_000,
        compare: sameResult,
      }}
    >
      {children}
    </SWRConfig>
  );
}
