import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIST = "dist";
const html = () => readFileSync(join(DIST, "index.html"), "utf8");

/**
 * The console must load from exactly one place — its own origin — and connect
 * to exactly one more: the agent the operator names at runtime. A third-party
 * origin is how a CDN font, an analytics beacon or a telemetry endpoint
 * arrives, each of which would send something about an operator's deal traffic
 * somewhere neither of us chose.
 *
 * Deliberately narrow. An earlier version scanned every URL-shaped string in
 * every built file and flagged the setup form's own `https://agent.example.com`
 * placeholder, a Workbox comment, and a JSON-schema namespace. A guard that
 * reports things nobody should act on gets an allow-list bolted on until it
 * reports nothing at all. So this checks the positions that actually cause a
 * load, and leaves prose alone.
 *
 * This is the rail ADR 10 leans on when it says adding analytics later means
 * deliberately removing one. That is only true while the rail exists.
 */
describe("no external hosts", () => {
  it("loads every script, style, icon and manifest from its own origin", () => {
    const attributes = [...html().matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]!);
    expect(attributes.length).toBeGreaterThan(3);

    const external = attributes.filter((value) => /^[a-z]+:\/\//i.test(value));
    expect(external).toEqual([]);
  });

  it("precaches nothing from another origin", () => {
    const sw = readFileSync(join(DIST, "sw.js"), "utf8");
    // Entries are emitted as {"revision":"…","url":"…"} — quoted keys, since
    // the manifest is injected as JSON rather than minified alongside the
    // worker's own code.
    const urls = [...sw.matchAll(/"url"\s*:\s*"([^"]+)"/g)].map((m) => m[1]!);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((url) => /^[a-z]+:\/\//i.test(url))).toEqual([]);
  });

  it("declares a content security policy, and does not overstate it", () => {
    const match = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/s.exec(html());
    expect(match, "no CSP meta tag in the built page").toBeTruthy();

    const policy = match![1]!.replace(/\s+/g, " ");
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("form-action 'none'");

    // https: plus loopback only. Plain http: to anywhere else would let an XSS
    // in our own bundle exfiltrate over a channel the mixed-content rules
    // would otherwise have blocked.
    expect(policy).toMatch(/connect-src https:/);
    expect(policy).not.toMatch(/connect-src[^;]*\bhttp:\/\/(?!localhost|127\.0\.0\.1)/);

    // A meta tag silently ignores both of these. Declaring them would look
    // like protection and provide none — the README says the same thing in
    // words, and this keeps the two honest with each other.
    expect(policy).not.toContain("frame-ancestors");
    expect(policy).not.toContain("report-uri");
  });

  it("names no stylesheet or font host at all", () => {
    // The classic third-party arrival: a Google Fonts <link> added for one
    // typeface. Self-hosting is the rule here.
    expect(html()).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(html()).not.toMatch(/<link[^>]+rel="(?:stylesheet|preconnect|dns-prefetch)"[^>]+https?:/);
  });
});
