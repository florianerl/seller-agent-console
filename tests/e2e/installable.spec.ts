import { expect, test } from "@playwright/test";
import { startServer, type StaticServer } from "./fixtures/server";
import { awaitController, connect } from "./fixtures/console";

let server: StaticServer;
let unhandled: string[];

test.beforeAll(async () => {
  server = await startServer("dist");
});
test.afterAll(async () => {
  await server.close();
});
test.beforeEach(() => {
  unhandled = [];
});

type Manifest = {
  name?: string;
  short_name?: string;
  start_url?: string;
  scope?: string;
  display?: string;
  icons?: { src: string; sizes: string; type: string; purpose?: string }[];
};

async function manifest(baseUrl: string, request: { get: (url: string) => Promise<{ json: () => Promise<unknown> }> }) {
  const response = await request.get(new URL("manifest.webmanifest", baseUrl).toString());
  return (await response.json()) as Manifest;
}

/**
 * Lighthouse 12 deleted `installable-manifest`, `maskable-icon`,
 * `apple-touch-icon` and `service-worker` outright, so the budgets in
 * lighthouserc can no longer say anything about whether this app installs.
 * These assertions replace them. They are deliberately about Chrome's actual
 * installability criteria rather than about a score.
 */
test("the manifest meets the installability criteria", async ({ page }) => {
  await page.goto(server.appUrl);
  const m = await manifest(server.appUrl, page.request);

  expect(m.name, "a name is required").toBeTruthy();
  // Android truncates beyond 12 characters on the home screen.
  expect(m.short_name).toBeTruthy();
  expect(m.short_name!.length).toBeLessThanOrEqual(12);
  expect(["standalone", "fullscreen", "minimal-ui"]).toContain(m.display);

  const icons = m.icons ?? [];
  const sizes = (purpose: string) =>
    icons
      .filter((icon) => (icon.purpose ?? "any").split(" ").includes(purpose))
      .map((icon) => Number.parseInt(icon.sizes.split("x")[0]!, 10));

  // Chrome needs a 192 and a 512 in `any`.
  expect(sizes("any")).toEqual(expect.arrayContaining([192, 512]));
  // And a maskable set, in its own entries — `purpose: "any maskable"` on one
  // file is the standard mistake: an adaptive mask crops up to 10% per edge,
  // so a maskable icon is full-bleed with the mark inset, which looks wrong
  // when the same file is used as `any`.
  expect(sizes("maskable")).toEqual(expect.arrayContaining([192, 512]));
  for (const icon of icons) {
    expect(
      (icon.purpose ?? "any").split(" ").length,
      `${icon.src} declares more than one purpose`,
    ).toBe(1);
  }
});

test("every icon the manifest promises is actually served", async ({ page }) => {
  await page.goto(server.appUrl);
  const m = await manifest(server.appUrl, page.request);

  for (const icon of m.icons ?? []) {
    const response = await page.request.get(new URL(icon.src, server.appUrl).toString());
    expect(response.status(), `${icon.src} is missing`).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
});

/** iOS ignores the manifest for the home screen and reads these instead. */
test("the iOS install metadata is present", async ({ page }) => {
  await page.goto(server.appUrl);

  const appleIcon = await page.getAttribute('link[rel="apple-touch-icon"]', "href");
  expect(appleIcon).toBeTruthy();
  const response = await page.request.get(new URL(appleIcon!, server.appUrl).toString());
  expect(response.status()).toBe(200);

  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
    "content",
    "yes",
  );
  await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute(
    "content",
    "yes",
  );

  // black-translucent puts the page under the status bar, which is only safe
  // because the AppBar applies env(safe-area-inset-top). The two travel
  // together; changing one without the other slides the title under the notch.
  const statusBar = await page.getAttribute(
    'meta[name="apple-mobile-web-app-status-bar-style"]',
    "content",
  );
  expect(statusBar).toBe("black-translucent");
  const viewport = await page.getAttribute('meta[name="viewport"]', "content");
  expect(viewport).toContain("viewport-fit=cover");
});

test("the start_url is controlled by the service worker", async ({ page }) => {
  await connect(page, server, unhandled);
  await awaitController(page);

  const m = await manifest(server.appUrl, page.request);

  // An installed app launches at start_url. If the worker does not control it,
  // the app opens to a network error the first time it is launched offline.
  const controlled = await page.evaluate(async (startUrl: string) => {
    const registration = await navigator.serviceWorker.getRegistration(startUrl);
    return registration !== undefined && !!navigator.serviceWorker.controller;
  }, m.start_url!);

  expect(controlled).toBe(true);
});
