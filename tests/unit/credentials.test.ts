import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import {
  clearCredential,
  loadCredential,
  saveCredential,
  DB_NAME,
} from "../../src/credentials/store";

const SECRET = "sk-operator-9f2b7c41-do-not-leak";

const base = {
  baseUrl: "https://agent.example.com",
  apiKey: SECRET,
  role: "operator" as const,
  name: "Ad Seller System API",
  reportedVersion: "2.4.2",
};

async function databaseNames(): Promise<string[]> {
  const dbs = await indexedDB.databases();
  return dbs.map((d) => d.name ?? "");
}

describe("the credential store", () => {
  beforeEach(async () => {
    await clearCredential();
  });

  it("reports nothing configured before setup", async () => {
    expect(await loadCredential()).toBeUndefined();
  });

  it("round-trips a credential", async () => {
    const saved = await saveCredential(base);
    const loaded = await loadCredential();

    expect(loaded).toEqual(saved);
    expect(loaded?.baseUrl).toBe(base.baseUrl);
    expect(loaded?.role).toBe("operator");
  });

  it("mints a credId and a validatedAt", async () => {
    const before = Date.now();
    const saved = await saveCredential(base);

    expect(saved.credId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(saved.validatedAt).toBeGreaterThanOrEqual(before);
  });

  // The credId exists so the key never becomes a cache key.
  it("gives a different credId to a different connection", async () => {
    const first = await saveCredential(base);
    await clearCredential();
    const second = await saveCredential(base);

    expect(second.credId).not.toBe(first.credId);
  });

  it("keeps only one record", async () => {
    await saveCredential(base);
    const replaced = await saveCredential({ ...base, baseUrl: "https://other.example.com" });

    expect((await loadCredential())?.baseUrl).toBe("https://other.example.com");
    expect((await loadCredential())?.credId).toBe(replaced.credId);
  });

  it("deletes the whole database on sign-out, not just the record", async () => {
    await saveCredential(base);
    expect(await databaseNames()).toContain(DB_NAME);

    await clearCredential();

    expect(await databaseNames()).not.toContain(DB_NAME);
    expect(await loadCredential()).toBeUndefined();
  });

  it("leaves no trace of the key after sign-out", async () => {
    await saveCredential(base);
    await clearCredential();

    // Anything reachable through the store must not contain the secret.
    const reloaded = await loadCredential();
    expect(JSON.stringify(reloaded ?? null)).not.toContain(SECRET);
  });

  it("survives storage being unavailable rather than failing to boot", async () => {
    const original = indexedDB.open;
    // Private browsing and blocked storage both throw here.
    (indexedDB as unknown as { open: unknown }).open = () => {
      throw new Error("storage blocked");
    };

    await expect(loadCredential()).resolves.toBeUndefined();

    (indexedDB as unknown as { open: unknown }).open = original;
  });
});
