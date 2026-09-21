import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { calledPaths, repoRoot, shape } from "./lib/called-paths";

type Surface = {
  capturedFrom: string;
  capturedAt: string;
  reportedAgentVersion: string | null;
  pathCount: number;
  paths: Record<string, Record<string, string[]>>;
};

const surface = JSON.parse(
  readFileSync(resolve(repoRoot, "tests/fixtures/agent-surface.json"), "utf8"),
) as Surface;

/**
 * Every path this console calls must exist in the agent's own OpenAPI surface,
 * with the method we use.
 *
 * What this catches: a typo, a rename, a path assembled wrongly, a method
 * changed on one side only. Those are cheap mistakes that currently surface
 * as a 404 on whichever screen nobody opened before release — and since the
 * console gained writes, as a 404 on a route the operator confirmed.
 *
 * What it cannot catch, stated plainly because a guard trusted beyond its
 * reach is worse than no guard: the snapshot in tests/fixtures is a capture,
 * not a live query. If the agent changes and nobody refreshes it, this passes
 * while the console is broken. `npm run refresh:agent-surface` against a
 * running agent updates it, and the capture date is asserted below so the file
 * cannot rot indefinitely without someone being told.
 *
 * It also does not check query parameters. They are passed as forwarded
 * variables rather than literals almost everywhere, so a static reader sees
 * nothing — and checking a third of them while implying all would be the kind
 * of half-guard this comment is warning about.
 */
describe("the console calls only routes the agent declares", () => {
  const calls = calledPaths();
  const known = new Map(
    Object.entries(surface.paths).map(([path, methods]) => [shape(path), methods]),
  );

  it("found the call sites to check", () => {
    expect(calls.length).toBeGreaterThan(50);
    expect(calls.filter((call) => call.path === "<unresolved>")).toEqual([]);
  });

  it("calls no path the agent does not declare", () => {
    const missing = [...new Set(
      calls
        .filter((call) => !known.has(shape(call.path)))
        .map((call) => `${call.method} ${call.path} at ${call.file}:${call.line}`),
    )];

    expect(missing).toEqual([]);
  });

  it("uses no method the agent does not declare on that path", () => {
    const wrong = [...new Set(
      calls
        .filter((call) => {
          const methods = known.get(shape(call.path));
          return methods !== undefined && !(call.method in methods);
        })
        .map((call) => {
          const methods = Object.keys(known.get(shape(call.path)) ?? {}).join(", ");
          return `${call.method} ${call.path} at ${call.file}:${call.line} — agent declares ${methods}`;
        }),
    )];

    expect(wrong).toEqual([]);
  });

  /**
   * The console currently reaches all 89 operations the agent exposes, so the
   * interesting direction is the other one: an operation the agent gains that
   * nobody here notices.
   *
   * This was first written to print the list and pass regardless. That is a
   * test that cannot fail, and with the list empty it asserted nothing at all
   * — vitest swallows console.info, so it would not even have printed. Not
   * adopting a route is still a legitimate choice; it just has to be a
   * recorded one rather than an omission.
   */
  const NOT_ADOPTED = new Set<string>([
    // "POST /api/v1/x", // reason it is deliberately not on any screen
  ]);

  it("leaves no agent operation unreached without saying so", () => {
    const called = new Set(calls.map((call) => `${call.method} ${shape(call.path)}`));
    const unreached: string[] = [];
    for (const [path, methods] of Object.entries(surface.paths)) {
      for (const method of Object.keys(methods)) {
        const operation = `${method} ${path}`;
        if (called.has(`${method} ${shape(path)}`)) continue;
        if (NOT_ADOPTED.has(operation)) continue;
        unreached.push(operation);
      }
    }

    expect(
      unreached,
      "the agent exposes operations this console never calls. Either put them " +
        "on a screen, or add them to NOT_ADOPTED with the reason",
    ).toEqual([]);
  });

  /**
   * A capture cannot notice the world moving on. This is the closest a
   * committed fixture gets to knowing it is stale.
   */
  it("was captured recently enough to be worth trusting", () => {
    const ageInDays = (Date.now() - Date.parse(surface.capturedAt)) / 86_400_000;
    expect(Number.isFinite(ageInDays)).toBe(true);
    expect(
      ageInDays,
      `tests/fixtures/agent-surface.json was captured ${Math.round(ageInDays)} days ago; ` +
        "run `npm run refresh:agent-surface` against a running agent",
    ).toBeLessThan(90);
  });
});
