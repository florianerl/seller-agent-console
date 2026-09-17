import { afterEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { API, server } from "../setup/msw";
import * as endpoints from "../../src/api/endpoints";
import type { Connection } from "../../src/api/http";
import { resetWritePolicy, setWritesEnabled } from "../../src/api/policy";
import { ENDPOINT_CALLS, type EndpointFn } from "../fixtures/endpoint-calls";

const connection: Connection = { baseUrl: API, apiKey: "k-operator" };

afterEach(() => resetWritePolicy());

/**
 * Every exported endpoint function, discovered rather than listed, so a new one
 * cannot be added without this file noticing.
 */
const callers = Object.entries(endpoints).filter(
  ([, value]) => typeof value === "function",
) as Array<[string, EndpointFn]>;

/**
 * The table is no longer all reads: five POSTs are queries the agent could not
 * fit in a URL (src/api/policy.ts). So this asserts each endpoint issues the
 * method it *claims* in the shared call table, rather than asserting GET — and
 * a write added without declaring itself fails here rather than passing
 * quietly.
 */
describe("every endpoint issues the method it declares", () => {
  it("has a declared call for every exported endpoint, and no stale ones", () => {
    expect(callers.map(([name]) => name).sort()).toEqual(Object.keys(ENDPOINT_CALLS).sort());
  });

  it.each(callers)("%s issues its declared method and nothing else", async (name, call) => {
    const spec = ENDPOINT_CALLS[name];
    expect(spec, `${name} has no entry in ENDPOINT_CALLS`).toBeDefined();

    // The query-shaped POSTs are the only unsafe methods permitted while the
    // switch is off, and this file runs with it off.
    setWritesEnabled(true);

    const methods: string[] = [];
    server.use(
      http.all(`${API}/*`, ({ request }) => {
        methods.push(request.method);
        return HttpResponse.json({});
      }),
      http.all(API, ({ request }) => {
        methods.push(request.method);
        return HttpResponse.json({});
      }),
    );

    await call(connection, ...(spec!.args as never[]));

    expect(methods.length).toBeGreaterThan(0);
    expect(methods.every((m) => m === spec!.method)).toBe(true);
  });
});

describe("schemas tolerate upstream drift", () => {
  it("accepts unknown added fields without failing a card", async () => {
    server.use(
      http.get(`${API}/api/v1/inventory-sync/status`, () =>
        HttpResponse.json({
          enabled: true,
          last_sync: "2026-09-16T10:00:00Z",
          sync_count: 3,
          task_running: false,
          // Added upstream after this console shipped.
          brand_new_field: { nested: true },
        }),
      ),
    );

    const result = await endpoints.inventorySyncStatus(connection);
    expect(result.kind).toBe("ok");
  });

  it("still fails when a field the UI renders disappears", async () => {
    server.use(
      http.get(`${API}/api/v1/inventory-sync/status`, () =>
        HttpResponse.json({ last_sync: null, sync_count: 0 }),
      ),
    );

    const result = await endpoints.inventorySyncStatus(connection);
    expect(result).toMatchObject({ kind: "unavailable", reason: "shape" });
  });

  it("recovers a missing optional count rather than degrading the card", async () => {
    server.use(
      http.get(`${API}/api/v1/inventory-sync/status`, () =>
        HttpResponse.json({ enabled: true, last_sync: null, sync_count: "not a number" }),
      ),
    );

    const result = await endpoints.inventorySyncStatus(connection);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.data.sync_count).toBe(0);
  });

  it("keeps the key probe permissive so a body change cannot lock setup out", async () => {
    server.use(
      http.get(`${API}/auth/api-keys`, () => HttpResponse.json("something unexpected")),
    );

    const result = await endpoints.apiKeys(connection);
    expect(result.kind).toBe("ok");
  });
});
