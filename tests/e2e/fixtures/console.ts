import { expect, type Page } from "@playwright/test";
import { AGENT, mockAgent } from "./agent";
import type { StaticServer } from "./server";

/**
 * Walks the setup form the way an operator does, rather than writing the
 * credential straight into IndexedDB. The point of an end-to-end test is that
 * the path a person takes is the path under test; seeding storage would skip
 * the probe ladder, which is where the console decides what it is talking to.
 */
export async function connect(page: Page, server: StaticServer, unhandled: string[]) {
  await mockAgent(page.context(), unhandled);
  await page.goto(server.appUrl);

  await page.getByLabel("Agent address").fill(AGENT);
  await page.getByLabel("Operator API key").fill("ask_live_e2e");
  await page.getByRole("button", { name: "Connect" }).click();

  await expect(page.getByRole("heading", { name: "Setup and health" })).toBeVisible();
}

/** Resolves once a service worker is controlling the page. */
export async function awaitController(page: Page): Promise<void> {
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {
    timeout: 30_000,
  });
}
