import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import type { Result } from "../api/errors";
import type { Connection } from "../api/http";
import { useCredential } from "../credentials/context";
import { derive, sameResult, type Resource } from "./freshness";

/**
 * One SWR entry per resource, which is what makes each card degrade on its own:
 * independent key, independent failure, independent timestamp.
 *
 * The key is prefixed with `credId` rather than the API key, so the credential
 * never reaches a cache key, a devtools panel, or a serialised cache blob.
 */
export function useResource<T>(
  name: string,
  fetcher: (connection: Connection, signal?: AbortSignal) => Promise<Result<T>>,
  options: { refreshInterval?: number } = {},
): Resource<T> {
  const { credential, connection } = useCredential();
  const lastGood = useRef<{ data: T; at: number } | undefined>(undefined);

  // SWR's compare ignores fetchedAt so an unchanged payload keeps its object
  // identity and consumers do not re-reconcile. The timestamp still has to
  // advance — an operator needs to know we checked, not only that nothing
  // changed — so it is tracked separately here, and setting it is what
  // re-renders.
  const [, setCheckedAt] = useState(0);

  const key = connection && credential ? [credential.credId, name] : null;

  const { data: result, isLoading } = useSWR<Result<T>>(
    key,
    () => fetcher(connection as Connection),
    {
      refreshInterval: options.refreshInterval ?? 0,
      compare: sameResult,
      onSuccess: (value) => {
        if (value.kind === "ok") setCheckedAt(value.fetchedAt);
      },
    },
  );

  useEffect(() => {
    if (result?.kind === "ok") {
      lastGood.current = { data: result.data, at: result.fetchedAt };
    }
    // A rejected result must not leave privileged data cached for reuse.
    if (result?.kind === "rejected") {
      lastGood.current = undefined;
    }
  }, [result]);

  return derive(result, lastGood.current, isLoading);
}
