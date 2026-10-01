import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import CatalogScreen from "../../src/screens/Catalog";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetWritePolicy } from "../../src/api/policy";
import { resetReachability } from "../../src/query/reachability";

/**
 * The override writes once invalidated `inventory-override:<id>`, a name
 * nothing reads, while ProductDetail reads `inventory-type:<id>`. Each hook
 * was fine on its own; the detail just kept showing the old override until
 * its own refresh. These mount the whole screen so the reader is the real
 * one, not a stand-in that repeats the key string and would agree with any
 * typo.
 */

const PRODUCT = {
  product_id: "prod-1",
  name: "Premium Display - Homepage",
  delivery_type: "guaranteed",
  pricing_model: "cpm",
  base_price: { amount_micros: 15_000_000, currency: "USD" },
  ad_formats: ["display"],
  available_impressions: 1_000_000,
};

const OVERRIDE_PATH = `${API}/api/v1/products/prod-1/inventory-type`;

function mount() {
  return render(
    <SWRConfig
      value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, compare: sameResult }}
    >
      <ThemeProvider theme={theme}>
        <CredentialProvider>
          <CatalogScreen />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

/** A stored override the agent hands back until a write changes it. */
function overrideRoute(initial: { inventory_type: string } | undefined) {
  const state = { current: initial, reads: 0 };
  const reply = () =>
    state.current
      ? HttpResponse.json({ product_id: "prod-1", reason: null, ...state.current })
      : HttpResponse.json({ detail: { error: "no_override" } }, { status: 404 });
  server.use(
    http.get(OVERRIDE_PATH, () => {
      state.reads += 1;
      return reply();
    }),
    http.post(OVERRIDE_PATH, async ({ request }) => {
      const body = (await request.json()) as { inventory_type: string };
      state.current = { inventory_type: body.inventory_type };
      return reply();
    }),
    http.delete(OVERRIDE_PATH, () => {
      const deleted = reply();
      state.current = undefined;
      return deleted;
    }),
  );
  return state;
}

async function confirm(user: ReturnType<typeof userEvent.setup>, action: string, label: string) {
  const button = await waitFor(() => {
    const el = document.querySelector(`[data-action="${action}"]`);
    expect(el).toBeEnabled();
    return el as HTMLElement;
  });
  await user.click(button);
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: label }));
}

async function openDetail(user: ReturnType<typeof userEvent.setup>) {
  const row = (await screen.findByText("Premium Display - Homepage")).closest("tr")!;
  await user.click(within(row).getByRole("button", { name: "Details" }));
}

/** The editor lives in the open product's detail, under the override it shows. */
function editor() {
  const el = document.querySelector('[data-block="override-editor"]');
  expect(el).toBeTruthy();
  return within(el as HTMLElement);
}

describe("inventory type override writes", () => {
  beforeEach(async () => {
    resetReachability();
    await clearCredential();
    resetWritePolicy();
    await saveCredential({
      baseUrl: API,
      apiKey: "k",
      role: "operator",
      name: "Ad Seller System API",
      reportedVersion: "2.4.2",
      writesEnabled: true,
    });
    server.use(
      http.get(`${API}/products`, () =>
        HttpResponse.json({ products: [PRODUCT], total_count: 1, limit: 200, offset: 0 }),
      ),
      http.get(`${API}/products/prod-1`, () => HttpResponse.json(PRODUCT)),
      http.get(`${API}/api/v1/rate-card`, () =>
        HttpResponse.json({ entries: [], updated_at: "2026-09-01T00:00:00Z", source: "stored" }),
      ),
      http.get(`${API}/packages`, () => HttpResponse.json({ packages: [] })),
    );
  });

  it("re-reads the open product's override after setting one", async () => {
    const route = overrideRoute(undefined);
    const user = userEvent.setup();
    mount();
    await openDetail(user);
    await waitFor(() => expect(document.querySelector('[data-state="no-override"]')).toBeTruthy());
    const before = route.reads;

    await user.click(
      await waitFor(() => {
        const el = editor().getByRole("button", { name: "Set override" });
        expect(el).toBeEnabled();
        return el;
      }),
    );
    await user.click(editor().getByLabelText("Inventory type"));
    await user.click(await screen.findByRole("option", { name: "mobile app" }));
    await confirm(user, "set-override", "Set override");

    await waitFor(() => expect(route.reads).toBeGreaterThan(before));
    await waitFor(() =>
      expect(document.querySelector('[data-block="inventory-override"]')?.textContent).toMatch(
        /mobile_app/,
      ),
    );
  });

  it("re-reads the open product's override after deleting it", async () => {
    const route = overrideRoute({ inventory_type: "display" });
    const user = userEvent.setup();
    mount();
    await openDetail(user);
    await waitFor(() =>
      expect(document.querySelector('[data-block="inventory-override"]')?.textContent).toMatch(/display/),
    );
    const before = route.reads;

    await confirm(user, "delete-override", "Delete override");

    await waitFor(() => expect(route.reads).toBeGreaterThan(before));
    await waitFor(() => expect(document.querySelector('[data-state="no-override"]')).toBeTruthy());
  });
});
