import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { startServer } from "./fixtures/server";
import { connect } from "./fixtures/console";

/**
 * Regenerates the manifest screenshots. Run by hand, never in CI:
 *
 *   npm run build && npm run screenshots
 *
 * Excluded from the normal suite by testIgnore — it writes into public/
 * rather than asserting anything. Rasterising in CI would make the committed assets non-deterministic for
 * something that changes twice a year, and the agent data behind them comes
 * from the end-to-end fixtures rather than from anyone's real deployment — a
 * screenshot in an install dialog is shown to whoever installs it, so it must
 * not carry a real publisher's deals.
 */
const SHOTS = [
  { name: "wide-setup", hash: "#/", width: 1280, height: 800 },
  { name: "wide-deals", hash: "#/deals", width: 1280, height: 800 },
  { name: "narrow-setup", hash: "#/", width: 720, height: 1280 },
];

test("capture", async ({ page }) => {
  const server = await startServer("dist");
  const unhandled: string[] = [];
  await mkdir("public/screenshots", { recursive: true });

  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE ERROR:", m.text());
  });
  await connect(page, server, unhandled);

  for (const shot of SHOTS) {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto(`${server.appUrl}${shot.hash}`);
    // Let the cards settle so the shot shows data rather than skeletons.
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `public/screenshots/${shot.name}.png` });
  }

  expect(unhandled).toEqual([]);
  await server.close();
});
