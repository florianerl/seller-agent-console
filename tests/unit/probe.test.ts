import { describe, expect, it } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { API, server } from "../setup/msw";
import { probe, validateBaseUrl } from "../../src/api/probe";

const reachable = () => http.get(`${API}/health`, () => HttpResponse.json({ status: "healthy" }));
const identified = () =>
  http.get(API, () =>
    HttpResponse.json({ name: "Ad Seller System API", version: "2.4.2", docs: "/docs" }),
  );

describe("rung 1: the address", () => {
  it("accepts https anywhere", () => {
    expect(validateBaseUrl("https://agent.example.com")).toEqual({
      ok: true,
      baseUrl: "https://agent.example.com",
    });
  });

  it("strips trailing slashes, which would otherwise 307", () => {
    expect(validateBaseUrl("https://agent.example.com///")).toMatchObject({
      baseUrl: "https://agent.example.com",
    });
  });

  // localhost is a potentially-trustworthy origin, so it is exempt from the
  // mixed-content rule. This is what makes local development work against the
  // HTTPS-hosted console.
  it.each(["http://localhost:8000", "http://127.0.0.1:8000"])("allows %s", (url) => {
    expect(validateBaseUrl(url)).toMatchObject({ ok: true });
  });

  it("rejects plain http elsewhere when this page is HTTPS, and explains why", () => {
    const result = validateBaseUrl("http://seller.corp.local:8000", "https:");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/HTTPS/i);
    expect(result.hint).toMatch(/mixed content/i);
  });

  // The restriction is the browser's, not ours: a dev server on http may
  // legitimately talk to an http agent, and claiming otherwise would state
  // something untrue as well as blocking it.
  it("allows plain http elsewhere when this page is itself http", () => {
    expect(validateBaseUrl("http://seller.corp.local:8000", "http:")).toMatchObject({
      ok: true,
    });
  });

  it("rejects nonsense with a usable example", () => {
    const result = validateBaseUrl("not a url");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.hint).toMatch(/https:\/\//);
  });

  it("rejects an empty address", () => {
    expect(validateBaseUrl("   ")).toMatchObject({ ok: false });
  });
});

describe("rung 2: reachability", () => {
  it("cannot distinguish CORS from unreachable, and says both", async () => {
    server.use(http.get(`${API}/health`, () => HttpResponse.error()));

    const result = await probe(API, "k");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.step).toBe("reachability");
    expect(result.hint).toMatch(/CORS/);
    expect(result.hint).toMatch(/not running/);
  });

  it("distinguishes a slow agent from an absent one", async () => {
    server.use(
      http.get(`${API}/health`, async () => {
        await delay(6000);
        return HttpResponse.json({ status: "healthy" });
      }),
    );

    const result = await probe(API, "k");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/did not respond in time/i);
    expect(result.hint).toMatch(/starting up/i);
  });
});

describe("rung 3: identity", () => {
  it("rejects a host that answers /health but is not a seller agent", async () => {
    server.use(
      reachable(),
      http.get(API, () => HttpResponse.json({ greeting: "hello" })),
    );

    const result = await probe(API, "k");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.step).toBe("identity");
  });
});

describe("rung 4: the key and its role", () => {
  it("accepts an operator key", async () => {
    server.use(
      reachable(),
      identified(),
      http.get(`${API}/auth/api-keys`, () => HttpResponse.json({ keys: [] })),
    );

    const result = await probe(API, "k-operator");
    expect(result).toMatchObject({
      ok: true,
      role: "operator",
      name: "Ad Seller System API",
      reportedVersion: "2.4.2",
    });
  });

  // A buyer key is a supported, degraded mode rather than a failure.
  it("accepts a buyer key as a degraded role", async () => {
    server.use(
      reachable(),
      identified(),
      http.get(`${API}/auth/api-keys`, () => new HttpResponse(null, { status: 403 })),
    );

    expect(await probe(API, "k-buyer")).toMatchObject({ ok: true, role: "buyer" });
  });

  it("does not accuse the operator of a typo on a 401", async () => {
    server.use(
      reachable(),
      identified(),
      http.get(`${API}/auth/api-keys`, () => new HttpResponse(null, { status: 401 })),
    );

    const result = await probe(API, "wrong");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.step).toBe("key");
    // A 401 cannot tell a wrong key from an agent with no keys configured.
    expect(result.hint).toMatch(/no API keys configured/i);
  });

  it("separates a failed check from a rejected key", async () => {
    server.use(
      reachable(),
      identified(),
      http.get(`${API}/auth/api-keys`, () => new HttpResponse(null, { status: 500 })),
    );

    const result = await probe(API, "k");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/could not verify/i);
  });
});

describe("the ladder stops at the first failure", () => {
  it("does not ask about the key when the agent is unreachable", async () => {
    let keyChecked = false;
    server.use(
      http.get(`${API}/health`, () => HttpResponse.error()),
      http.get(`${API}/auth/api-keys`, () => {
        keyChecked = true;
        return HttpResponse.json({});
      }),
    );

    await probe(API, "k");
    expect(keyChecked).toBe(false);
  });

  it("gives every rung a distinct step so the UI can differ per failure", async () => {
    const steps = new Set<string>();

    // A malformed address rather than an http one: jsdom serves these tests
    // over http, where the mixed-content rung correctly does not apply.
    const bad = await probe("not a url", "k");
    if (!bad.ok) steps.add(bad.step);

    server.use(http.get(`${API}/health`, () => HttpResponse.error()));
    const unreachable = await probe(API, "k");
    if (!unreachable.ok) steps.add(unreachable.step);

    server.use(reachable(), http.get(API, () => HttpResponse.json({ nope: 1 })));
    const unidentified = await probe(API, "k");
    if (!unidentified.ok) steps.add(unidentified.step);

    server.use(
      reachable(),
      identified(),
      http.get(`${API}/auth/api-keys`, () => new HttpResponse(null, { status: 401 })),
    );
    const rejected = await probe(API, "k");
    if (!rejected.ok) steps.add(rejected.step);

    expect([...steps].sort()).toEqual(["identity", "key", "reachability", "url"]);
  });
});
