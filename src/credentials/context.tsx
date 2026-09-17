import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearCredential,
  loadCredential,
  saveCredential,
  type Credential,
} from "./store";
import type { Connection } from "../api/http";
import { resetWritePolicy, setWritesEnabled as setPolicy } from "../api/policy";

/**
 * Context is the right tool here and not in competition with SWR: the
 * credential is read almost everywhere and changes almost never. Server data
 * stays in SWR, where each resource has its own cache entry and one card's
 * failure cannot re-render the others.
 */

/** What sign-in supplies; the rest of the record is minted by the store. */
export type NewCredential = Omit<Credential, "credId" | "validatedAt" | "writesEnabled">;

type CredentialState = {
  readonly credential: Credential | undefined;
  /** Still reading IndexedDB; render nothing decisive until this is false. */
  readonly loading: boolean;
  readonly connection: Connection | undefined;
  readonly signIn: (c: NewCredential) => Promise<void>;
  readonly signOut: () => Promise<void>;
  /** Whether this console may issue state-changing requests. Off by default. */
  readonly writesEnabled: boolean;
  readonly setWritesEnabled: (on: boolean) => Promise<void>;
};

const CredentialContext = createContext<CredentialState | undefined>(undefined);

export function CredentialProvider({ children }: { children: ReactNode }) {
  const [credential, setCredential] = useState<Credential | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void loadCredential().then((stored) => {
      if (cancelled) return;
      setCredential(stored);
      // The seam reads the policy module, not this context, so the stored
      // value has to reach it before anything can issue a request.
      setPolicy(stored?.writesEnabled === true);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (input: NewCredential) => {
    const saved = await saveCredential(input);
    // A new key starts read-only whatever the last one was allowed to do.
    resetWritePolicy();
    setCredential(saved);
  }, []);

  const signOut = useCallback(async () => {
    await clearCredential();
    resetWritePolicy();
    setCredential(undefined);
  }, []);

  const setWritesEnabled = useCallback(
    async (on: boolean) => {
      if (!credential) return;
      // Persist first: a flag the seam honours but a reload forgets is the
      // worse of the two ways for these to disagree.
      const saved = await saveCredential({ ...credential, writesEnabled: on });
      setPolicy(on);
      setCredential(saved);
    },
    [credential],
  );

  const value = useMemo<CredentialState>(
    () => ({
      credential,
      loading,
      connection: credential
        ? { baseUrl: credential.baseUrl, apiKey: credential.apiKey }
        : undefined,
      signIn,
      signOut,
      writesEnabled: credential?.writesEnabled === true,
      setWritesEnabled,
    }),
    [credential, loading, signIn, signOut, setWritesEnabled],
  );

  return <CredentialContext value={value}>{children}</CredentialContext>;
}

export function useCredential(): CredentialState {
  const value = useContext(CredentialContext);
  if (!value) throw new Error("useCredential used outside CredentialProvider");
  return value;
}
