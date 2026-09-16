/**
 * A minimal IndexedDB wrapper that owns its connection.
 *
 * Written rather than using idb-keyval because sign-out deletes the whole
 * database, and `deleteDatabase` blocks indefinitely while any connection is
 * open. idb-keyval keeps its connection private with no way to close it, so a
 * sign-out would hang until the tab closed. Owning the connection makes
 * close-then-delete possible.
 */

export const DB_NAME = "seller-console";
const DB_VERSION = 1;

/** Object stores created on upgrade. The cache store is used by the query layer. */
export const STORES = { credentials: "credentials", queryCache: "queryCache" } as const;

let connection: Promise<IDBDatabase> | undefined;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export function openDb(): Promise<IDBDatabase> {
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);

      open.onupgradeneeded = () => {
        const db = open.result;
        for (const name of Object.values(STORES)) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
      };
      open.onsuccess = () => {
        const db = open.result;
        // Another tab upgrading or deleting needs us out of the way.
        db.onversionchange = () => {
          db.close();
          connection = undefined;
        };
        resolve(db);
      };
      open.onerror = () => reject(open.error ?? new Error("could not open IndexedDB"));
      open.onblocked = () => reject(new Error("IndexedDB open blocked"));
    }).catch((error: unknown) => {
      connection = undefined;
      throw error;
    });
  }
  return connection;
}

export function closeDb(): void {
  const pending = connection;
  connection = undefined;
  if (pending) void pending.then((db) => db.close()).catch(() => undefined);
}

export async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openDb();
  return request<T | undefined>(
    db.transaction(store, "readonly").objectStore(store).get(key) as IDBRequest<T | undefined>,
  );
}

export async function idbSet(store: string, key: string, value: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value, key);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB write aborted"));
  });
}

/** Closes our connection first; otherwise the delete blocks until the tab closes. */
export function deleteDb(): Promise<void> {
  closeDb();
  return new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    // Resolve on every outcome: a delete blocked by another tab must not leave
    // the operator stuck on a spinner believing they are still signed in.
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}
