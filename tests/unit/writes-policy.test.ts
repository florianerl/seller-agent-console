import { beforeEach, describe, expect, it } from "vitest";
import { API, recordRequests, server } from "../setup/msw";
import { http, HttpResponse } from "msw";
import * as endpoints from "../../src/api/endpoints";
import { request, type Connection } from "../../src/api/http";
import {
  QUERY_SHAPED_PATHS,
  resetWritePolicy,
  setWritesEnabled,
} from "../../src/api/policy";
import { z } from "zod";
import { ENDPOINT_CALLS, type EndpointFn } from "../fixtures/endpoint-calls";

const connection: Connection = { baseUrl: API, apiKey: "k-operator" };
const anything = z.unknown();

/**
 * What ADR 12 claims, asserted on the wire.
 *
 * ADR 11 removed the layer that made a write impossible to write. This file is
 * what replaced it: not a shape assertion about a module, but the behaviour an
 * operator is relying on — with the switch off, an unsafe method does not leave
 * the browser, whatever the call site believed.
 */

beforeEach(() => {
  resetWritePolicy();
});

describe("with writes off", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"] as const)(
    "refuses %s without sending it",
    async (method) => {
      const recorder = recordRequests();

      const result = await request(connection, "/api/v1/deals", {
        schema: anything,
        method,
        ...(method === "DELETE" ? {} : { body: { anything: true } }),
      });

      expect(result).toMatchObject({ kind: "unavailable", reason: "writes-disabled" });
      expect(recorder.seen).toEqual([]);
    },
  );

  it("still allows every read", async () => {
    const recorder = recordRequests();
    const result = await request(connection, "/health", { schema: anything });

    expect(result.kind).toBe("ok");
    expect(recorder.seen).toEqual([`GET ${API}/health`]);
  });

  /**
   * The exemption, and its exact size. Someone adding a sixth path has to come
   * here and say why, which is the only control on a list whose whole purpose
   * is to make a rule less mechanical.
   */
  it("exempts exactly the five query-shaped POSTs", () => {
    expect([...QUERY_SHAPED_PATHS].sort()).toEqual([
      "/agentic-audience/match",
      "/discovery",
      "/media-kit/search",
      "/pricing",
      "/products/avails",
    ]);
  });

  it.each(QUERY_SHAPED_PATHS)("sends %s even though it is a POST", async (path) => {
    const recorder = recordRequests();

    const result = await request(connection, path, {
      schema: anything,
      method: "POST",
      body: {},
    });

    expect(result.kind).toBe("ok");
    expect(recorder.seen).toEqual([`POST ${API}${path}`]);
  });

  /**
   * Exact paths, not prefixes: /pricing being exempt must not carry anything
   * that merely starts the same way.
   */
  it("does not extend the exemption to a path that starts with an exempt one", async () => {
    const recorder = recordRequests();

    const result = await request(connection, "/pricing/rules", {
      schema: anything,
      method: "POST",
      body: {},
    });

    expect(result).toMatchObject({ reason: "writes-disabled" });
    expect(recorder.seen).toEqual([]);
  });

  /**
   * Swept rather than listed. Every endpoint in the table has to survive the
   * switch being off — today they are all reads, and when they are not, the
   * ones that write must come back writes-disabled rather than send.
   */
  it("leaves every endpoint in the table callable or refused, never silently sent", async () => {
    const recorder = recordRequests();

    const callers = Object.entries(endpoints).filter(
      ([, value]) => typeof value === "function",
    ) as Array<[string, EndpointFn]>;

    for (const [name, call] of callers) {
      const spec = ENDPOINT_CALLS[name];
      expect(spec, `${name} has no entry in ENDPOINT_CALLS`).toBeDefined();
      await call(connection, ...(spec!.args as never[]));
    }

    const unsafe = recorder.seen.filter((line) => !line.startsWith("GET "));
    const allowed = QUERY_SHAPED_PATHS.map((p) => `POST ${API}${p}`);
    expect(unsafe.filter((line) => !allowed.includes(line))).toEqual([]);

    // And the exempt ones did go out — a sweep that sent nothing at all would
    // pass this test while proving nothing.
    for (const path of QUERY_SHAPED_PATHS) {
      expect(recorder.seen).toContain(`POST ${API}${path}`);
    }
  });
});

describe("with writes on", () => {
  it("sends the method it was asked for", async () => {
    setWritesEnabled(true);
    server.use(http.post(`${API}/approvals/A-1/decide`, () => HttpResponse.json({ ok: true })));

    const result = await request(connection, "/approvals/A-1/decide", {
      schema: z.object({ ok: z.boolean() }),
      method: "POST",
      body: { decision: "approve" },
    });

    expect(result).toMatchObject({ kind: "ok", data: { ok: true } });
  });

  it("goes back to refusing as soon as the policy is reset", async () => {
    setWritesEnabled(true);
    resetWritePolicy();
    const recorder = recordRequests();

    const result = await request(connection, "/approvals/A-1/decide", {
      schema: anything,
      method: "POST",
      body: {},
    });

    expect(result).toMatchObject({ reason: "writes-disabled" });
    expect(recorder.seen).toEqual([]);
  });
});
