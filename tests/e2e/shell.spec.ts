import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { BASE_PATH } from "../../config/base-path";
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
test.afterEach(() => {
  expect(unhandled, "the console asked for routes the fixture does not answer").toEqual([]);
});

test("every asset loads from under the deploy prefix, never from the root", async ({ page }) => {
  const outside: string[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== server.origin) return;
    if (!url.pathname.startsWith(BASE_PATH)) outside.push(url.pathname);
  });

  await connect(page, server, unhandled);
  expect(outside).toEqual([]);
});

test("a deep link survives a reload", async ({ page }) => {
  await connect(page, server, unhandled);

  await page.goto(`${server.appUrl}#/orders`);
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await expect(page.getByText("ORD-8ECAA495B7EF")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await expect(page.getByText("ORD-8ECAA495B7EF")).toBeVisible();
});

test("the service worker registers at the deploy prefix, not the origin root", async ({ page }) => {
  await connect(page, server, unhandled);
  await awaitController(page);

  const scope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.scope ?? null;
  });

  expect(scope).toBe(`${server.origin}${BASE_PATH}`);
});

test("the manifest parses and its identity fields carry the prefix", async ({ page }) => {
  await page.goto(server.appUrl);

  const href = await page.getAttribute('link[rel="manifest"]', "href");
  expect(href).toBeTruthy();

  const response = await page.request.get(new URL(href!, server.appUrl).toString());
  expect(response.ok()).toBe(true);

  const manifest = (await response.json()) as Record<string, string>;
  // `id` is effectively permanent: it defaults to start_url, so changing
  // start_url later would orphan every installed copy as a different app.
  expect(manifest.id).toBe(BASE_PATH);
  expect(manifest.start_url).toBe(BASE_PATH);
  expect(manifest.scope).toBe(BASE_PATH);
  // A launch flash is caused by these two disagreeing with the page.
  expect(manifest.background_color).toBe("#F7F6F6");
  expect(manifest.theme_color).toBe(
    await page.getAttribute('meta[name="theme-color"]', "content"),
  );
});

const ROUTES = [
  { hash: "#/", heading: "Setup and health" },
  { hash: "#/events", heading: "Events" },
  { hash: "#/orders", heading: "Orders" },
  { hash: "#/deals", heading: "Deals" },
];

for (const route of ROUTES) {
  test(`${route.heading} is free of axe violations`, async ({ page }) => {
    await connect(page, server, unhandled);
    await page.goto(`${server.appUrl}${route.hash}`);
    await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();

    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    ).toEqual([]);
  });
}

test("the temporary drawer is reachable and escapable by keyboard alone", async ({ page }) => {
  await connect(page, server, unhandled);

  // Narrow enough that the drawer is the temporary variant, which is the one
  // with a focus trap — MUI's trap is a recurring regression.
  await page.setViewportSize({ width: 480, height: 900 });
  await page.reload();

  const toggle = page.getByRole("button", { name: "Open navigation" });
  await expect(toggle).toBeVisible();
  await toggle.focus();
  await page.keyboard.press("Enter");

  const drawer = page.getByRole("presentation").getByRole("navigation");
  await expect(drawer).toBeVisible();

  // Focus must move into the drawer, or a keyboard user has opened something
  // they cannot reach. MUI parks it on the drawer's own container rather than
  // on the nav, so the assertion is about the trap, not about the landmark.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const presentation = document.querySelector('[role="presentation"]');
        return presentation?.contains(document.activeElement) ?? false;
      }),
    )
    .toBe(true);

  // And tabbing from there has to reach the navigation itself — focus sitting
  // in a container the user cannot tab out of into anything useful is the
  // failure mode this test is really about.
  await page.keyboard.press("Tab");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const nav = document.querySelector('[role="presentation"] nav');
        return nav?.contains(document.activeElement) ?? false;
      }),
    )
    .toBe(true);

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("no axe violations with the drawer open", async ({ page }) => {
  await connect(page, server, unhandled);
  await page.setViewportSize({ width: 480, height: 900 });
  await page.reload();

  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("presentation").getByRole("navigation")).toBeVisible();

  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(violations.map((v) => v.id)).toEqual([]);
});
