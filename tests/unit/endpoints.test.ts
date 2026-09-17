import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { API, server, takeViolations } from "../setup/msw";
import * as endpoints from "../../src/api/endpoints";
import type { Connection } from "../../src/api/http";

const connection: Connection = { baseUrl: API, apiKey: "k-operator" };

/**
 * Every exported endpoint function, discovered rather than listed, so adding
 * one without a read-only assertion is not possible.
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

describe("read-only: layer 2, every endpoint issues GET", () => {
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

describe("read-only: layer 3, the global trap", () => {
  it("records any non-GET, whatever handlers a test installed", async () => {
    // Simulates a future refactor reintroducing a mutating call. Drained here
    // so this test passes; in any other test the afterEach hook fails the run.
    await fetch(`${API}/api/v1/deals`, { method: "POST" });
    await fetch(`${API}/api/v1/deals/x`, { method: "DELETE" });

    const found = takeViolations();
    expect(found).toHaveLength(2);
    expect(found[0]).toContain("POST");
    expect(found[1]).toContain("DELETE");
  });

  it("lets GET through without recording anything", async () => {
    const response = await fetch(`${API}/health`);
    expect(response.ok).toBe(true);
    expect(takeViolations()).toEqual([]);
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
