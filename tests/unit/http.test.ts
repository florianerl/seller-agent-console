import { describe, expect, it } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { z } from "zod";
import { API, server } from "../setup/msw";
import { get, TIMEOUTS, type Connection } from "../../src/api/http";

const connection: Connection = { baseUrl: API, apiKey: "k-operator" };
const schema = z.object({ status: z.string() }).loose();
const PATH = "/health";
const url = `${API}${PATH}`;

const call = (c: Connection = connection, timeoutMs?: number) =>
  get(c, PATH, { schema, ...(timeoutMs !== undefined ? { timeoutMs } : {}) });

describe("the result taxonomy", () => {
  it("returns ok with parsed data and a fetchedAt stamp", async () => {
    server.use(http.get(url, () => HttpResponse.json({ status: "healthy" })));

    const before = Date.now();
    const result = await call();

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.data.status).toBe("healthy");
    expect(result.fetchedAt).toBeGreaterThanOrEqual(before);
  });

  // rejected is ONLY 401 and 403.
  it.each([
    [401, "anonymous"],
    [403, "insufficient"],
  ] as const)("maps %i to rejected/%s", async (status, role) => {
    server.use(http.get(url, () => new HttpResponse(null, { status })));

    const result = await call();
    expect(result).toMatchObject({ kind: "rejected", status, role });
  });

  it.each([400, 404, 418, 500, 502, 503])(
    "maps %i to unavailable/http, never rejected",
    async (status) => {
      server.use(http.get(url, () => new HttpResponse(null, { status })));

      const result = await call();
      expect(result).toMatchObject({ kind: "unavailable", reason: "http", status });
    },
  );

  // The concrete case: FastAPI's redirect_slashes answers a trailing-slash
  // mismatch with a 307. It must read as a redirect, not as an outage.
  it.each([301, 302, 307, 308])("maps %i to unavailable/redirect", async (status) => {
    server.use(
      http.get(url, () => new HttpResponse(null, { status, headers: { Location: "/elsewhere" } })),
    );

    const result = await call();
    expect(result).toMatchObject({ kind: "unavailable", reason: "redirect" });
  });

  it("maps an HTML error page on a 200 to unavailable/content-type", async () => {
    server.use(
      http.get(
        url,
        () =>
          new HttpResponse("<html><body>502 Bad Gateway</body></html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
      ),
    );

    const result = await call();
    expect(result).toMatchObject({ kind: "unavailable", reason: "content-type" });
  });

  it("maps a malformed JSON body to unavailable/shape", async () => {
    server.use(
      http.get(
        url,
        () =>
          new HttpResponse("{not json", {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    const result = await call();
    expect(result).toMatchObject({ kind: "unavailable", reason: "shape" });
  });

  // The whole reason a runtime parse exists: TypeScript cannot check this.
  it("maps a changed upstream field to unavailable/shape with a readable detail", async () => {
    server.use(http.get(url, () => HttpResponse.json({ state: "healthy" })));

    const result = await call();
    expect(result).toMatchObject({ kind: "unavailable", reason: "shape" });
    if (result.kind !== "unavailable") return;
    expect(result.detail).toContain("status");
  });

  it("maps a network failure to unavailable/network", async () => {
    server.use(http.get(url, () => HttpResponse.error()));

    const result = await call();
    expect(result).toMatchObject({ kind: "unavailable", reason: "network" });
  });

  it("maps a slow response to unavailable/timeout, not network", async () => {
    server.use(
      http.get(url, async () => {
        await delay(200);
        return HttpResponse.json({ status: "healthy" });
      }),
    );

    const result = await call(connection, 50);
    expect(result).toMatchObject({ kind: "unavailable", reason: "timeout" });
  });

  it("never throws, whatever the server does", async () => {
    server.use(http.get(url, () => HttpResponse.error()));
    await expect(call()).resolves.toBeDefined();

    server.use(http.get(url, () => new HttpResponse(null, { status: 500 })));
    await expect(call()).resolves.toBeDefined();
  });
});

describe("request construction", () => {
  it("sends the key as X-Api-Key and never as a cookie", async () => {
    let seen: Request | undefined;
    server.use(
      http.get(url, ({ request }) => {
        seen = request;
        return HttpResponse.json({ status: "healthy" });
      }),
    );

    await call();
    expect(seen?.headers.get("X-Api-Key")).toBe("k-operator");
    expect(seen?.headers.get("cookie")).toBeNull();
    expect(seen?.method).toBe("GET");
  });

  it("omits the key header entirely when anonymous", async () => {
    let seen: Request | undefined;
    server.use(
      http.get(url, ({ request }) => {
        seen = request;
        return HttpResponse.json({ status: "healthy" });
      }),
    );

    await get({ baseUrl: API }, PATH, { schema });
    expect(seen?.headers.has("X-Api-Key")).toBe(false);
  });

  it("appends defined query parameters and drops undefined ones", async () => {
    let seen: URL | undefined;
    server.use(
      http.get(`${API}/events`, ({ request }) => {
        seen = new URL(request.url);
        return HttpResponse.json({ events: [] });
      }),
    );

    await get(connection, "/events", {
      schema: z.object({ events: z.array(z.unknown()) }),
      query: { limit: 50, event_type: undefined, flow_id: "f-1" },
    });

    expect(seen?.searchParams.get("limit")).toBe("50");
    expect(seen?.searchParams.get("flow_id")).toBe("f-1");
    expect(seen?.searchParams.has("event_type")).toBe(false);
  });

  it("preserves a path prefix on the base URL", async () => {
    let seen: string | undefined;
    server.use(
      http.get(`${API}/agent/health`, ({ request }) => {
        seen = new URL(request.url).pathname;
        return HttpResponse.json({ status: "healthy" });
      }),
    );

    await get({ baseUrl: `${API}/agent` }, "/health", { schema });
    expect(seen).toBe("/agent/health");
  });

  it("honours caller cancellation", async () => {
    server.use(
      http.get(url, async () => {
        await delay(200);
        return HttpResponse.json({ status: "healthy" });
      }),
    );

    const controller = new AbortController();
    const pending = get(connection, PATH, { schema, signal: controller.signal });
    controller.abort();

    expect(await pending).toMatchObject({ kind: "unavailable" });
  });
});

describe("timeout budgets", () => {
  it("are ordered probe < normal < heavy", () => {
    expect(TIMEOUTS.probe).toBeLessThan(TIMEOUTS.normal);
    expect(TIMEOUTS.normal).toBeLessThan(TIMEOUTS.heavy);
    // Above the p95 first byte of a cold-started container.
    expect(TIMEOUTS.normal).toBeGreaterThanOrEqual(8_000);
  });
});
