import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_PATH } from "../../config/base-path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = resolve(repoRoot, "dist");

describe("built artefacts are all under BASE_PATH", () => {
  it("dist/ exists — run `npm run build` first", () => {
    expect(
      existsSync(dist),
      "dist/ not found: guards inspect the build output, so run `npm run build` before `npm run test:guards`",
    ).toBe(true);
  });

  it("every absolute asset URL in index.html begins with BASE_PATH", () => {
    const html = readFileSync(resolve(dist, "index.html"), "utf8");

    // Every src=/href= that is root-absolute must carry the prefix. A
    // root-relative asset URL is exactly what breaks a Pages subpath deploy.
    const urls = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]!);

    expect(urls.length, "no absolute asset URLs found — did the build emit assets?").toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith(BASE_PATH), `${url} is not under ${BASE_PATH}`).toBe(true);
    }
  });

  it("emits no root-absolute URL that escapes BASE_PATH", () => {
    const html = readFileSync(resolve(dist, "index.html"), "utf8");
    // Catches `/assets/...` slipping in via a plugin that ignores `base`.
    expect(html).not.toMatch(/(?:src|href)="\/assets\//);
  });
});
