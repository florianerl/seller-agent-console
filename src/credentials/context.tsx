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

/**
 * Context is the right tool here and not in competition with SWR: the
 * credential is read almost everywhere and changes almost never. Server data
 * stays in SWR, where each resource has its own cache entry and one card's
 * failure cannot re-render the others.
 */

type CredentialState = {
  readonly credential: Credential | undefined;
  /** Still reading IndexedDB; render nothing decisive until this is false. */
  readonly loading: boolean;
  readonly connection: Connection | undefined;
  readonly signIn: (c: Omit<Credential, "credId" | "validatedAt">) => Promise<void>;
  readonly signOut: () => Promise<void>;
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
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (input: Omit<Credential, "credId" | "validatedAt">) => {
      setCredential(await saveCredential(input));
    },
    [],
  );

  const signOut = useCallback(async () => {
    await clearCredential();
    setCredential(undefined);
  }, []);

  const value = useMemo<CredentialState>(
    () => ({
      credential,
      loading,
      connection: credential
        ? { baseUrl: credential.baseUrl, apiKey: credential.apiKey }
        : undefined,
      signIn,
      signOut,
    }),
    [credential, loading, signIn, signOut],
  );

  return <CredentialContext value={value}>{children}</CredentialContext>;
}

export function useCredential(): CredentialState {
  const value = useContext(CredentialContext);
  if (!value) throw new Error("useCredential used outside CredentialProvider");
  return value;
}
