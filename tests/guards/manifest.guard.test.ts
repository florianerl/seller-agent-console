import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_PATH } from "../../config/base-path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = resolve(repoRoot, "dist");

type Icon = { src: string; sizes: string; type: string; purpose?: string };
type Manifest = {
  id?: string;
  name?: string;
  short_name?: string;
  start_url?: string;
  scope?: string;
  display?: string;
  background_color?: string;
  theme_color?: string;
  icons?: Icon[];
};

const swSource = (): string => readFileSync(resolve(repoRoot, "src/sw.ts"), "utf8");

/** Comments describe intent and routinely name the thing they forbid. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const manifest = (): Manifest =>
  JSON.parse(readFileSync(resolve(dist, "manifest.webmanifest"), "utf8")) as Manifest;

/** Reads width and height out of the PNG IHDR chunk. */
function pngSize(file: string): { width: number; height: number } {
  const buffer = readFileSync(file);
  const signature = buffer.subarray(0, 8).toString("hex");
  expect(signature, `${file} is not a PNG`).toBe("89504e470d0a1a0a");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe("the manifest satisfies installability", () => {
  it("declares the fields browsers require", () => {
    const m = manifest();
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBe(BASE_PATH);
    expect(m.scope).toBe(BASE_PATH);
    expect(m.display).toBe("standalone");
    expect(m.icons?.length).toBeGreaterThanOrEqual(2);
  });

  // id defaults to start_url. If start_url ever changes without an explicit
  // id, every installed copy is orphaned as a different app.
  it("sets id explicitly rather than inheriting start_url", () => {
    expect(manifest().id).toBe(BASE_PATH);
  });

  it("keeps short_name within Android's truncation limit", () => {
    expect((manifest().short_name ?? "").length).toBeLessThanOrEqual(12);
  });

  // A mismatch produces a colour flash between the splash screen and the app.
  it("matches background_color to the CSS background and theme_color to the meta tag", () => {
    const m = manifest();
    const html = readFileSync(resolve(dist, "index.html"), "utf8");
    const themeMeta = /<meta name="theme-color" content="([^"]+)"/.exec(html)?.[1];

    expect(m.background_color?.toLowerCase()).toBe("#f7f6f6");
    expect(m.theme_color?.toLowerCase()).toBe(themeMeta?.toLowerCase());
  });
});

describe("the icons are real and correctly declared", () => {
  it("ships every icon the manifest references", () => {
    for (const icon of manifest().icons ?? []) {
      expect(existsSync(resolve(dist, icon.src)), `${icon.src} is missing`).toBe(true);
    }
  });

  // The classic installability failure: a file declared 512x512 that decodes
  // to something else. Browsers reject it and the install prompt never shows.
  it("matches every declared size to the decoded pixel dimensions", () => {
    for (const icon of manifest().icons ?? []) {
      const [declaredWidth, declaredHeight] = icon.sizes.split("x").map(Number);
      const actual = pngSize(resolve(dist, icon.src));

      expect(actual.width, `${icon.src} declares ${icon.sizes}`).toBe(declaredWidth);
      expect(actual.height, `${icon.src} declares ${icon.sizes}`).toBe(declaredHeight);
    }
  });

  // purpose: "any maskable" on a single file is the standard mistake: an
  // adaptive mask crops up to 10% per edge, so one artwork cannot serve both.
  it("provides separate any and maskable artwork", () => {
    const icons = manifest().icons ?? [];
    const any = icons.filter((i) => (i.purpose ?? "any").split(" ").includes("any"));
    const maskable = icons.filter((i) => (i.purpose ?? "").split(" ").includes("maskable"));

    expect(any.length).toBeGreaterThan(0);
    expect(maskable.length).toBeGreaterThan(0);

    for (const icon of icons) {
      expect(
        icon.purpose,
        `${icon.src} declares both purposes on one file`,
      ).not.toBe("any maskable");
    }
    // And they must not be the same file under two entries.
    expect(new Set(any.map((i) => i.src))).not.toEqual(new Set(maskable.map((i) => i.src)));
  });

  it("ships an apple-touch-icon, which iOS uses instead of the manifest", () => {
    const html = readFileSync(resolve(dist, "index.html"), "utf8");
    const href = /<link rel="apple-touch-icon" href="([^"]+)"/.exec(html)?.[1];

    expect(href).toBeTruthy();
    const file = resolve(dist, href!.replace(BASE_PATH, ""));
    expect(existsSync(file), `${href} is missing`).toBe(true);
    expect(pngSize(file)).toEqual({ width: 180, height: 180 });
  });
});

describe("the service worker", () => {
  it("is emitted and precaches the shell", () => {
    const sw = readFileSync(resolve(dist, "sw.js"), "utf8");
    expect(sw).toContain("index.html");
    expect(sw.length).toBeGreaterThan(1000);
  });

  // Caching authenticated API responses by URL would let the worker serve one
  // principal's response to another. Asserted against the source: the built
  // worker is minified, so strategy class names are not present verbatim.
  it("uses only NetworkOnly, so no cross-origin response is ever cached", () => {
    const source = swSource();
    expect(source).toContain("NetworkOnly");
    for (const forbidden of ["StaleWhileRevalidate", "NetworkFirst", "CacheFirst"]) {
      expect(source, `${forbidden} must not be used for API responses`).not.toContain(forbidden);
    }
  });

  // Swapping the worker under a running page 404s the chunks it still holds.
  it("never calls skipWaiting unprompted", () => {
    const source = stripComments(swSource());
    const calls = [...source.matchAll(/skipWaiting\(\)/g)];

    expect(calls, "expected exactly one skipWaiting call site").toHaveLength(1);
    // And that one site must be inside the SKIP_WAITING message handler.
    const index = source.indexOf("skipWaiting()");
    expect(source.slice(Math.max(0, index - 400), index)).toContain("SKIP_WAITING");
  });
});
