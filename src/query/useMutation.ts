import { useCallback, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import type { Result } from "../api/errors";
import type { Connection } from "../api/http";
import { useCredential } from "../credentials/context";

/**
 * The write counterpart of useResource.
 *
 * A read is a subscription: SWR owns it, it repeats, and the component asks for
 * a value. A write is an event: it happens once, when someone asks, and what
 * comes back is an outcome rather than a value to cache. So this does not go
 * through SWR's cache at all — it calls the endpoint, and then tells SWR which
 * resources the call has made wrong.
 *
 * ADR 11 is explicit that nothing in the client answers idempotency,
 * confirmation or partial failure generically. This hook does not pretend to:
 * it refuses to run twice concurrently (the one thing that is the same for
 * every endpoint — a double-click is never intended), and leaves the rest to
 * the call site, which is where the answer differs per endpoint.
 */

export type MutationHandle<TArgs, T> = {
  /** Resolves to the outcome; never throws, never rejects. */
  readonly run: (args: TArgs) => Promise<Result<T>>;
  /** True from the call until the outcome lands. */
  readonly pending: boolean;
  /** The last outcome, so a call site can render it without holding it. */
  readonly last: Result<T> | undefined;
  /** Drop the last outcome — for closing a dialog that was showing it. */
  readonly reset: () => void;
  /** False when writes are off, or there is no credential. */
  readonly permitted: boolean;
};

export function useMutation<TArgs, T>(
  run: (connection: Connection, args: TArgs) => Promise<Result<T>>,
  options: {
    /**
     * `useResource` names whose values this call invalidates. They are matched
     * against the [credId, name] key shape, so only the current credential's
     * entries are touched.
     */
    readonly invalidates?: readonly string[];
  } = {},
): MutationHandle<TArgs, T> {
  const { connection, credential, writesEnabled } = useCredential();
  const { mutate } = useSWRConfig();
  const [pending, setPending] = useState(false);
  const [last, setLast] = useState<Result<T> | undefined>(undefined);

  // A ref rather than the pending state: two clicks in the same tick see the
  // same state value, and the second would get through.
  const inFlight = useRef(false);

  const { invalidates } = options;

  const call = useCallback(
    async (args: TArgs): Promise<Result<T>> => {
      if (!connection || !credential) {
        // No credential means no request was ever going to be sent. Reported
        // as a rejection rather than invented as a network failure.
        const refused: Result<T> = {
          kind: "rejected",
          status: 401,
          role: "anonymous",
          fetchedAt: Date.now(),
        };
        setLast(refused);
        return refused;
      }

      if (inFlight.current) {
        // Already running. Returning the refusal rather than queueing keeps
        // "how many times did this happen" answerable: exactly once.
        return {
          kind: "unavailable",
          reason: "busy",
          fetchedAt: Date.now(),
        };
      }

      inFlight.current = true;
      setPending(true);
      // The seam refuses a write when the policy is off, so this is not the
      // check that protects anything — it only saves building a request that
      // was never going to leave.
      const result = await run(connection, args);
      inFlight.current = false;
      setPending(false);
      setLast(result);

      if (result.kind === "ok" && invalidates?.length) {
        const names = new Set(invalidates);
        // Whatever the call changed, the cached reads of it are now a claim we
        // cannot stand behind. Revalidate rather than patch: the agent decides
        // what the record looks like afterwards, not us.
        await mutate(
          (key) =>
            Array.isArray(key) &&
            key[0] === credential.credId &&
            typeof key[1] === "string" &&
            names.has(key[1]),
          undefined,
          { revalidate: true },
        );
      }

      return result;
    },
    [connection, credential, invalidates, mutate, run],
  );

  return {
    run: call,
    pending,
    last,
    reset: () => setLast(undefined),
    permitted: writesEnabled && connection !== undefined,
  };
}
