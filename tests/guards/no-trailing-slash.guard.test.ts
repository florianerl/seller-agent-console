import { describe, expect, it } from "vitest";
import { calledPaths } from "./lib/called-paths";

/**
 * FastAPI's `redirect_slashes` answers a trailing-slash mismatch with a 307,
 * and this client sets `redirect: "manual"` and refuses to follow one. So a
 * single stray `/` does not produce a redirect the user never sees — it
 * produces `unavailable: "redirect"`, which on screen is indistinguishable
 * from the agent being down.
 *
 * That was tolerable when every call was a GET. It is worse now: the same
 * stray character on a POST means the operator confirmed a write, watched it
 * report a failure, and has no way to tell from the console whether the agent
 * refused it or never received it.
 *
 * `/` itself is the agent's root route and is the one legitimate case.
 */
describe("no path ends in a slash", () => {
  const calls = calledPaths();

  it("found the call sites to check", () => {
    // If the extractor silently stops matching, every assertion below passes
    // vacuously. This is the tripwire for that.
    expect(calls.length).toBeGreaterThan(50);
    expect(calls.filter((call) => call.path === "<unresolved>")).toEqual([]);
  });

  it("calls no path with a trailing slash", () => {
    const offenders = calls
      .filter((call) => call.path !== "/" && call.path.endsWith("/"))
      .map((call) => `${call.method} ${call.path} at ${call.file}:${call.line}`);

    expect(offenders).toEqual([]);
  });

  it("calls no path with a doubled slash", () => {
    // `${PATHS.orders}/${id}` where PATHS.orders already ends in one. The
    // agent 404s rather than redirecting, which at least fails honestly, but
    // it fails at runtime and only on the route nobody clicked.
    const offenders = calls
      .filter((call) => call.path.slice(1).includes("//"))
      .map((call) => `${call.method} ${call.path} at ${call.file}:${call.line}`);

    expect(offenders).toEqual([]);
  });
});
