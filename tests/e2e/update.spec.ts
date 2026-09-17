import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { startServer, type StaticServer } from "./fixtures/server";
import { awaitController, connect } from "./fixtures/console";

const V1 = ".e2e/v1";
const V2 = ".e2e/v2";

let server: StaticServer;
let unhandled: string[];

/**
 * Two real builds, because the interesting failure is a chunk hash that only
 * exists in one of them.
 *
 * `BUILD_ID` differs, which changes the main chunk's contents, its hash, the
 * precache manifest and therefore `sw.js` — the same chain of consequences a
 * genuine code change produces, which is what makes the swap a fair test.
 */
function build(outDir: string, buildId: string) {
  execFileSync("npx", ["vite", "build", "--outDir", outDir, "--emptyOutDir"], {
    env: { ...process.env, BUILD_ID: buildId },
    stdio: "pipe",
  });
}

test.beforeAll(async () => {
  build(V1, "e2e-build-1");
  build(V2, "e2e-build-2");
  server = await startServer(V1);
});

test.afterAll(async () => {
  await server.close();
  await rm(".e2e", { recursive: true, force: true });
});

test.beforeEach(() => {
  unhandled = [];
});

/**
 * The most valuable test in the suite, and the one that caught the bug every
 * unit test missed: the worker activated, took control, and the page never
 * reloaded — so the operator sat on the old build looking at a prompt that
 * would not go away.
 */
test("an update is offered, applied once, and leaves no missing chunk", async ({ page }) => {
  const notFound: string[] = [];
  page.on("response", (response) => {
    if (response.status() === 404) notFound.push(new URL(response.url()).pathname);
  });

  let loads = 0;
  page.on("load", () => {
    loads += 1;
  });

  await connect(page, server, unhandled);
  await awaitController(page);

  await expect(page.locator("#root")).toHaveAttribute("data-build", "e2e-build-1");
  // Nothing to offer yet — a prompt on first load would be a false alarm.
  await expect(page.locator('[data-update-prompt="ready"]')).toBeHidden();

  // Ship v2.
  server.setRoot(V2);
  const loadsBeforeUpdate = loads;

  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
  });

  // The offer, not the act: the new worker waits until the operator agrees.
  await expect(page.locator('[data-update-prompt="ready"]')).toBeVisible();
  await expect(page.getByText("A new version is available")).toBeVisible();
  // Still on the old build, still working, because skipWaiting() unprompted
  // would 404 the chunks this page is about to import.
  await expect(page.locator("#root")).toHaveAttribute("data-build", "e2e-build-1");
  expect(loads).toBe(loadsBeforeUpdate);

  await page.getByRole("button", { name: "Reload" }).click();

  await expect(page.locator("#root")).toHaveAttribute("data-build", "e2e-build-2", {
    timeout: 20_000,
  });
  await expect(page.locator('[data-update-prompt="ready"]')).toBeHidden();

  // Exactly one reload. A controllerchange handler without a guard produces a
  // loop, and on some browsers an endless one.
  expect(loads).toBe(loadsBeforeUpdate + 1);

  // And no chunk went missing across the swap.
  expect(notFound).toEqual([]);
});

test("dismissing the prompt leaves the old build running", async ({ page }) => {
  server.setRoot(V1);
  await connect(page, server, unhandled);
  await awaitController(page);

  server.setRoot(V2);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
  });

  await expect(page.locator('[data-update-prompt="ready"]')).toBeVisible();
  await page.getByRole("button", { name: "Later" }).click();

  await expect(page.locator('[data-update-prompt="ready"]')).toBeHidden();
  // "Later" means later, not "quietly do it anyway".
  await expect(page.locator("#root")).toHaveAttribute("data-build", "e2e-build-1");
});
