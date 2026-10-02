import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { openDb } from "../../src/credentials/idb";
import {
  GRACE_MS,
  MAX_QUOTES,
  describeExpiry,
  isExpiredLocally,
  readQuotes,
  recordQuote,
  type RecentQuote,
} from "../../src/credentials/recentQuotes";

const HOUR = 60 * 60 * 1000;

const quote = (id: string, over: Partial<RecentQuote> = {}): RecentQuote => ({
  quote_id: id,
  product_id: "prod-1",
  product_name: "Premium Display",
  deal_type: "PD",
  final_cpm_micros: 6_800_000,
  currency: "USD",
  expires_at: new Date(Date.now() + 24 * HOUR).toISOString(),
  created_at: Date.now(),
  ...over,
});

describe("the recent-quotes store", () => {
  beforeEach(async () => {
    await clearCredential();
  });

  it("reads back what was recorded, newest first", async () => {
    await recordQuote("cred-a", quote("qt-1", { created_at: Date.now() - 2000 }));
    await recordQuote("cred-a", quote("qt-2", { created_at: Date.now() - 1000 }));

    expect((await readQuotes("cred-a")).map((q) => q.quote_id)).toEqual(["qt-2", "qt-1"]);
  });

  it("keeps one list per credential, and never the API key", async () => {
    const mine = await saveCredential({
      baseUrl: "https://agent.example.com",
      apiKey: "sk-secret-key",
      role: "operator",
      name: "Ad Seller System API",
      reportedVersion: "2.4.2",
    });
    await recordQuote(mine.credId, quote("qt-mine"));
    await recordQuote("another-cred", quote("qt-theirs"));

    expect((await readQuotes(mine.credId)).map((q) => q.quote_id)).toEqual(["qt-mine"]);
    expect((await readQuotes("another-cred")).map((q) => q.quote_id)).toEqual(["qt-theirs"]);

    // The key must reach no record in the quotes store, as a key or a value.
    const db = await openDb();
    const dump = await new Promise<string>((resolve) => {
      const tx = db.transaction("recentQuotes", "readonly");
      const store = tx.objectStore("recentQuotes");
      const keys = store.getAllKeys();
      const values = store.getAll();
      tx.oncomplete = () => resolve(JSON.stringify([keys.result, values.result]));
    });
    expect(dump).not.toContain("sk-secret-key");
  });

  it("records the same quote once, with its latest details", async () => {
    await recordQuote("c", quote("qt-1", { final_cpm_micros: 1 }));
    await recordQuote("c", quote("qt-1", { final_cpm_micros: 2 }));

    const list = await readQuotes("c");
    expect(list).toHaveLength(1);
    expect(list[0]!.final_cpm_micros).toBe(2);
  });

  it("drops a quote once it is past expiry plus the grace period, and keeps one inside it", async () => {
    const now = Date.now();
    await recordQuote("c", quote("qt-old", { expires_at: new Date(now - GRACE_MS - 60_000).toISOString() }), now - 3 * GRACE_MS);
    await recordQuote("c", quote("qt-lapsed", { expires_at: new Date(now - 60_000).toISOString() }), now - 3 * GRACE_MS);
    await recordQuote("c", quote("qt-live"), now);

    const ids = (await readQuotes("c", now)).map((q) => q.quote_id);
    expect(ids).toContain("qt-live");
    // Just expired: still listed, so "that id expired" is visible rather than a vanished entry.
    expect(ids).toContain("qt-lapsed");
    expect(ids).not.toContain("qt-old");
  });

  it("assumes 24 hours when the agent gave no expiry", () => {
    const made = Date.now() - 25 * HOUR;
    expect(isExpiredLocally({ expires_at: null, created_at: made })).toBe(true);
    expect(isExpiredLocally({ expires_at: null, created_at: Date.now() - HOUR })).toBe(false);
  });

  it("words an expiry as local: 'expired', not 'unavailable'", () => {
    const now = Date.now();
    expect(describeExpiry({ expires_at: new Date(now + 3 * HOUR).toISOString(), created_at: now }, now)).toBe("expires in 3 h");
    expect(describeExpiry({ expires_at: new Date(now - 2 * HOUR).toISOString(), created_at: now }, now)).toBe("expired 2 h ago");
  });

  it("caps the list, keeping the newest", async () => {
    for (let i = 0; i < MAX_QUOTES + 5; i++) {
      await recordQuote("c", quote(`qt-${i}`, { created_at: Date.now() + i }));
    }
    const list = await readQuotes("c");
    expect(list).toHaveLength(MAX_QUOTES);
    expect(list[0]!.quote_id).toBe(`qt-${MAX_QUOTES + 4}`);
    expect(list.some((q) => q.quote_id === "qt-0")).toBe(false);
  });

  it("does not lose a quote when two are recorded at once", async () => {
    await Promise.all([recordQuote("c", quote("qt-a")), recordQuote("c", quote("qt-b"))]);
    expect((await readQuotes("c")).map((q) => q.quote_id).sort()).toEqual(["qt-a", "qt-b"]);
  });

  it("goes with sign-out", async () => {
    await recordQuote("c", quote("qt-1"));
    expect(await readQuotes("c")).toHaveLength(1);

    await clearCredential();

    expect(await readQuotes("c")).toEqual([]);
  });
});
