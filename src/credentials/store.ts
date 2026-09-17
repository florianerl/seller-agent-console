import { DB_NAME, STORES, deleteDb, idbGet, idbSet } from "./idb";
import type { Role } from "../api/probe";

/**
 * The stored credential. One record; there is no multi-account mode.
 *
 * `credId` is a random identifier minted at setup and used as the SWR cache
 * key prefix, so the API key itself never appears in a cache key, a devtools
 * panel, or a serialised cache blob.
 */
export type Credential = {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly role: Role;
  readonly name: string;
  readonly reportedVersion: string;
  readonly validatedAt: number;
  readonly credId: string;
  /**
   * Whether this console may issue state-changing requests with this key.
   *
   * It lives on the credential rather than in a settings store of its own
   * because it authorises *this* key: connecting a different one starts from
   * off, and sign-out — which deletes the whole database — takes it with it.
   * Records written before this field existed read as off, which is the
   * answer we want for anything we are unsure about.
   */
  readonly writesEnabled: boolean;
};

export { DB_NAME };
const RECORD_KEY = "active";

export async function loadCredential(): Promise<Credential | undefined> {
  try {
    const stored = await idbGet<Credential>(STORES.credentials, RECORD_KEY);
    // A record from a build before the switch existed has no flag. Default it
    // here rather than at every read, so `undefined` never reaches the policy.
    return stored ? { ...stored, writesEnabled: stored.writesEnabled === true } : undefined;
  } catch {
    // Private browsing, blocked storage, or a corrupt database. Treat as
    // "not configured" rather than failing to boot.
    return undefined;
  }
}

export async function saveCredential(
  credential: Omit<Credential, "credId" | "validatedAt" | "writesEnabled"> &
    Partial<Pick<Credential, "credId" | "validatedAt" | "writesEnabled">>,
): Promise<Credential> {
  const record: Credential = {
    ...credential,
    credId: credential.credId ?? crypto.randomUUID(),
    validatedAt: credential.validatedAt ?? Date.now(),
    // Sign-in never turns writes on. Enabling them is a separate, deliberate
    // act with its own confirmation.
    writesEnabled: credential.writesEnabled ?? false,
  };
  await idbSet(STORES.credentials, RECORD_KEY, record);
  return record;
}

/**
 * Sign-out deletes the whole database rather than the one record, so nothing
 * survives in a store we forgot about — including the cached API responses,
 * which a later task adds to the same database.
 */
export async function clearCredential(): Promise<void> {
  await deleteDb();

  // Belt and braces: the app shell precache is public, but nothing else should
  // outlive a sign-out.
  if (typeof caches !== "undefined") {
    try {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => !n.startsWith("workbox-precache")).map((n) => caches.delete(n)),
      );
    } catch {
      // Cache API unavailable; nothing to clean.
    }
  }
}
