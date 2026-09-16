import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const assets = resolve(repoRoot, "dist/assets");

/**
 * A tripwire, not a budget. It exists to catch a catastrophic regression —
 * someone importing the @mui/icons-material barrel (~11k modules), or a chart
 * library landing in the initial chunk — rather than to police kilobytes.
 */
const INITIAL_CEILING_KB = 320;

function gzipKb(file: string): number {
  return gzipSync(readFileSync(resolve(assets, file))).byteLength / 1024;
}

describe("bundle tripwire", () => {
  it("dist/ exists — run `npm run build` first", () => {
    expect(existsSync(assets)).toBe(true);
  });

  it("keeps the initial load under the ceiling", () => {
    // Everything not lazily imported: the entry plus the vendor chunks.
    const initial = readdirSync(assets).filter(
      (f) => f.endsWith(".js") && (f.startsWith("index-") || f.startsWith("vendor-")),
    );

    expect(initial.length).toBeGreaterThan(0);

    const total = initial.reduce((sum, f) => sum + gzipKb(f), 0);
    const breakdown = initial
      .map((f) => `${f} ${gzipKb(f).toFixed(1)}kB`)
      .join(", ");

    expect(
      total,
      `initial load is ${total.toFixed(1)} kB gz (ceiling ${INITIAL_CEILING_KB}); ${breakdown}`,
    ).toBeLessThan(INITIAL_CEILING_KB);
  });

  it("splits each screen into its own lazily loaded chunk", () => {
    const files = readdirSync(assets);
    for (const screen of ["Setup", "Events", "Orders", "Deals"]) {
      expect(
        files.some((f) => f.startsWith(`${screen}-`) && f.endsWith(".js")),
        `${screen} is not a separate chunk — it was bundled into the entry`,
      ).toBe(true);
    }
  });
});
