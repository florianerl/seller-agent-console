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

/**
 * The claim this suite exists to check is "reload offline and you still see the
 * shell, your last values, and an honest account of how old they are". Every
 * part of that is invisible to jsdom: the precache, the worker serving the
 * document, and the timestamps surviving a real page teardown.
 */
test("an offline reload serves the shell from the precache", async ({ page, context }) => {
  await connect(page, server, unhandled);
  await awaitController(page);

  await page.goto(`${server.appUrl}#/orders`);
  await expect(page.getByText("ORD-8ECAA495B7EF")).toBeVisible();

  await context.setOffline(true);
  await page.reload();

  // The document itself came from the worker, not the network.
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Console sections" })).toBeVisible();
});

test("offline says so, and says it as a hint rather than a verdict", async ({ page, context }) => {
  await connect(page, server, unhandled);
  await awaitController(page);

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));

  const banner = page.locator('[data-banner="offline"]');
  await expect(banner).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(banner).toBeHidden();
});

/**
 * The staleness rule end to end, and the one claim that was pure assertion
 * until there was a browser to check it in: a reload with the agent gone still
 * shows the last values, restored from IndexedDB, and stops calling them
 * current. In jsdom the cache round-trip can be tested but the reload cannot,
 * and the reload is the half that was broken once already.
 */
test("a reload with the agent gone restores the last values, visibly aged", async ({
  page,
  context,
}) => {
  await connect(page, server, unhandled);
  await awaitController(page);

  await page.goto(`${server.appUrl}#/orders`);
  await expect(page.getByText("ORD-8ECAA495B7EF")).toBeVisible();

  // Give the cache a chance to be written: it persists on hide and unload
  // rather than on every poll.
  await page.evaluate(() => {
    window.dispatchEvent(new Event("pagehide"));
  });

  // The agent goes away. Not offline — the browser is fine, the agent is not,
  // which is the case the two-signal banner exists to tell apart.
  await context.route("https://agent.test/**", (route) => route.abort("connectionrefused"));

  await page.reload();

  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await expect(page.getByText("ORD-8ECAA495B7EF")).toBeVisible();
  await expect(page.locator("[data-freshness]").first()).toHaveAttribute(
    "data-freshness",
    "stale",
  );
});

test("the API is never served from a cache", async ({ page }) => {
  await connect(page, server, unhandled);
  await awaitController(page);

  // Two operators share a URL but not an entitlement, and a Workbox cache key
  // is the URL. The worker registers the agent's origin as NetworkOnly for
  // exactly that reason; this asserts nothing has quietly started caching it.
  const cachedApiEntries = await page.evaluate(async () => {
    const names = await caches.keys();
    const found: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (new URL(request.url).origin !== location.origin) found.push(request.url);
      }
    }
    return found;
  });

  expect(cachedApiEntries).toEqual([]);
});
