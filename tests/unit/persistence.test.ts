import { beforeEach, describe, expect, it } from "vitest";
import { loadCache, saveCache, type SwrCache } from "../../src/query/persistence";
import { clearCredential } from "../../src/credentials/store";

const CRED = "cred-a";
const BUILD = "2026-09-17T00:00:00.000Z";

function cacheWith(value: unknown): SwrCache {
  return new Map([["key", value]]) as SwrCache;
}

describe("the persisted query cache", () => {
  beforeEach(async () => {
    await clearCredential();
  });

  it("is empty before anything is stored", async () => {
    expect((await loadCache(CRED, BUILD)).size).toBe(0);
  });

  it("round-trips cached values so a reload shows last-known data", async () => {
    await saveCache(cacheWith({ data: { kind: "ok", fetchedAt: 123 } }), CRED, BUILD);

    const restored = await loadCache(CRED, BUILD);
    expect(restored.get("key")).toEqual({ data: { kind: "ok", fetchedAt: 123 } });
  });

  // A different credential must never inherit the previous one's data.
  it("does not hand one credential's cache to another", async () => {
    await saveCache(cacheWith({ data: "secret" }), CRED, BUILD);
    expect((await loadCache("cred-b", BUILD)).size).toBe(0);
  });

  // A new build may parse payloads against changed schemas.
  it("does not rehydrate a cache saved by a different build", async () => {
    await saveCache(cacheWith({ data: "old" }), CRED, BUILD);
    expect((await loadCache(CRED, "2026-09-18T00:00:00.000Z")).size).toBe(0);
  });

  it("drops anything older than a day", async () => {
    await saveCache(cacheWith({ data: "stale" }), CRED, BUILD);

    const realNow = Date.now;
    Date.now = () => realNow() + 25 * 60 * 60 * 1000;
    try {
      expect((await loadCache(CRED, BUILD)).size).toBe(0);
    } finally {
      Date.now = realNow;
    }
  });

  it("survives a storage failure rather than breaking the page", async () => {
    const original = indexedDB.open;
    (indexedDB as unknown as { open: unknown }).open = () => {
      throw new Error("storage blocked");
    };
    try {
      await expect(saveCache(cacheWith({ data: 1 }), CRED, BUILD)).resolves.toBeUndefined();
      expect((await loadCache(CRED, BUILD)).size).toBe(0);
    } finally {
      (indexedDB as unknown as { open: unknown }).open = original;
    }
  });
});
