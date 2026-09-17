import { useEffect, useState } from "react";
import useSWR from "swr";
import type { Result } from "../api/errors";
import type { Connection } from "../api/http";
import { useCredential } from "../credentials/context";
import { derive, sameResult, type Resource } from "./freshness";
import { reportResult } from "./reachability";

export type ResourceHandle<T> = Resource<T> & {
  /** True while a fetch is in flight, including a refresh over existing data. */
  readonly validating: boolean;
  /** Revalidate now. */
  readonly refresh: () => void;
};

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
): ResourceHandle<T> {
  const { credential, connection } = useCredential();

  // The last value that actually arrived, kept as state adjusted during render
  // rather than as a ref written from an effect. A ref would be read while
  // rendering and written afterwards, so a render React discards would leave
  // the two out of step — the card would show a value the current result no
  // longer justifies. Adjusting state during render is the documented way to
  // derive from a changing input, and it re-renders before anything commits.
  const [lastGood, setLastGood] = useState<{ data: T; at: number } | undefined>(undefined);
  const [seen, setSeen] = useState<Result<T> | undefined>(undefined);

  // SWR's compare ignores fetchedAt so an unchanged payload keeps its object
  // identity and consumers do not re-reconcile. The timestamp still has to
  // advance — an operator needs to know we checked, not only that nothing
  // changed — so it is tracked separately here, and setting it is what
  // re-renders.
  const [, setCheckedAt] = useState(0);

  const key = connection && credential ? [credential.credId, name] : null;

  const {
    data: result,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<Result<T>>(
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

  if (result !== seen) {
    setSeen(result);
    if (result?.kind === "ok") {
      setLastGood({ data: result.data, at: result.fetchedAt });
    }
    // A rejected result must not leave privileged data behind to be reused.
    if (result?.kind === "rejected") {
      setLastGood(undefined);
    }
  }

  useEffect(() => {
    // Feeds the shell-level "can't reach the agent" signal, which needs
    // several resources to agree before it says anything. This one is a real
    // side effect on something outside React, so it belongs in an effect.
    if (result) reportResult(name, result.kind === "unavailable");
  }, [result, name]);

  return {
    ...derive(result, lastGood, isLoading),
    validating: isValidating,
    // Exposed for resources that deliberately do not poll: the deals export is
    // an unpaginated full scan, so refreshing it has to be the operator's
    // decision rather than a timer's.
    refresh: () => {
      void mutate();
    },
  };
}
