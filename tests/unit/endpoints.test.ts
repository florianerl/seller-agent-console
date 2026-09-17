import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { API, server } from "../setup/msw";
import * as endpoints from "../../src/api/endpoints";
import type { Connection } from "../../src/api/http";

const connection: Connection = { baseUrl: API, apiKey: "k-operator" };

/**
 * Every exported endpoint function, discovered rather than listed, so a new one
 * cannot be added without this file noticing.
 */
const callers = Object.entries(endpoints).filter(
  ([, value]) => typeof value === "function",
) as Array<[string, (c: Connection, ...rest: never[]) => Promise<unknown>]>;

/**
 * Extra arguments for endpoints that take a path parameter. Everything else
 * needs only the connection. Listed rather than guessed, so a new endpoint
 * with an unusual signature fails loudly instead of being silently skipped.
 */
const EXTRA_ARGS: Record<string, unknown[]> = {
  eventById: ["e1"],
  orderById: ["ORD-1"],
  orderHistory: ["ORD-1"],
  dealPerformance: ["D-1"],
  dealLineage: ["D-1"],
  approvalById: ["A-1"],
  sessionById: ["S-1"],
};

/**
 * The endpoint table is all reads today. This is not the read-only enforcement
 * it once was (ADR 11) — it is a statement about the current table, and a
 * deliberately added write endpoint updates it rather than working around it.
 */
describe("every endpoint currently in the table issues GET", () => {
  it("discovered every exported endpoint", () => {
    expect(callers.map(([name]) => name).sort()).toEqual([
      "agents",
      "apiKeys",
      "approvalById",
      "approvals",
      "dealLineage",
      "dealPerformance",
      "deals",
      "eventById",
      "events",
      "health",
      "inventorySyncStatus",
      "inventorySyncWatermark",
      "orderById",
      "orderHistory",
      "orders",
      "packages",
      "products",
      "rateCard",
      "root",
      "sessionById",
      "sessions",
    ]);
  });

  it.each(callers)("%s issues GET and nothing else", async (name, call) => {
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

    await call(connection, ...((EXTRA_ARGS[name] ?? []) as never[]));

    expect(methods.length).toBeGreaterThan(0);
    expect(methods.every((m) => m === "GET")).toBe(true);
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
