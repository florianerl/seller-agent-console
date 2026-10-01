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
 * The catalog's writes are made in the tables they change. The rate card PUT
 * replaces the whole card, so the one assertion that matters most is that an
 * edit to one row sends every other row back unchanged — the form this
 * replaced sent a single entry and wiped the rest.
 */

const CARD = {
  entries: [
    { inventory_type: "display", base_cpm: 12, currency: "USD", effective_date: "2026-01-01", notes: null },
    { inventory_type: "video", base_cpm: 25, currency: "USD", effective_date: null, notes: "pre-roll" },
  ],
  updated_at: "2026-09-01T00:00:00Z",
  source: "stored",
};

const PACKAGE = {
  package_id: "pkg-1",
  name: "Sports bundle",
  rate_type: "fixed",
  is_featured: false,
  ad_formats: ["display"],
  price_range: null,
  // Tier-discounted: the stored base is something else.
  exact_price: 9.5,
  floor_price: 5,
  currency: "USD",
  negotiation_enabled: false,
};

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

function capture(method: "post" | "put", path: string, reply: unknown = {}) {
  const bodies: unknown[] = [];
  server.use(
    http[method](`${API}${path}`, async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json(reply as Record<string, unknown>);
    }),
  );
  return bodies;
}

async function credential(writesEnabled: boolean) {
  await saveCredential({
    baseUrl: API,
    apiKey: "k",
    role: "operator",
    name: "Ad Seller System API",
    reportedVersion: "2.4.2",
    writesEnabled,
  });
}

/** Buttons stay disabled until the stored credential has loaded and said writes are on. */
function enabledIn(block: string, name: string, index = 0) {
  return waitFor(() => {
    const table = document.querySelector(`[data-block="${block}"]`);
    expect(table).toBeTruthy();
    const el = within(table as HTMLElement).getAllByRole("button", { name })[index];
    expect(el).toBeEnabled();
    return el!;
  });
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

describe("catalog inline writes", () => {
  beforeEach(async () => {
    resetReachability();
    await clearCredential();
    resetWritePolicy();
    server.use(
      http.get(`${API}/products`, () =>
        HttpResponse.json({
          products: [
            { product_id: "prod-1", name: "Premium Display - Homepage" },
            { product_id: "prod-2", name: "Video Preroll" },
          ],
          total_count: 2,
          limit: 200,
          offset: 0,
        }),
      ),
      http.get(`${API}/api/v1/rate-card`, () => HttpResponse.json(CARD)),
      http.get(`${API}/packages`, () => HttpResponse.json({ packages: [PACKAGE] })),
    );
  });

  it("saves an edited rate with every other row sent back unchanged", async () => {
    await credential(true);
    const sent = capture("put", "/api/v1/rate-card", CARD);
    const user = userEvent.setup();
    mount();

    await user.click(await enabledIn("rate-card", "Edit", 1));
    const cpm = screen.getByLabelText("Base CPM");
    await user.clear(cpm);
    await user.type(cpm, "30");
    await confirm(user, "save-rate", "Save");

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual([
      { inventory_type: "display", base_cpm: 12, currency: "USD", effective_date: "2026-01-01" },
      { inventory_type: "video", base_cpm: 30, currency: "USD", notes: "pre-roll" },
    ]);
    await waitFor(() => expect(document.querySelector('[data-editing="true"]')).toBeNull());
  });

  it("refuses a CPM the agent would refuse, without sending", async () => {
    await credential(true);
    const sent = capture("put", "/api/v1/rate-card", CARD);
    const user = userEvent.setup();
    mount();

    await user.click(await enabledIn("rate-card", "Edit"));
    const cpm = screen.getByLabelText("Base CPM");
    await user.clear(cpm);
    await user.type(cpm, "0");

    expect(document.querySelector('[data-action="save-rate"]')).toBeDisabled();
    expect(sent).toHaveLength(0);
  });

  it("removes a rate by sending the card without it", async () => {
    await credential(true);
    const sent = capture("put", "/api/v1/rate-card", CARD);
    const user = userEvent.setup();
    mount();

    await user.click(await enabledIn("rate-card", "Remove"));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual([
      { inventory_type: "video", base_cpm: 25, currency: "USD", notes: "pre-roll" },
    ]);
  });

  it("adds a rate for a type not already on the card", async () => {
    await credential(true);
    const sent = capture("put", "/api/v1/rate-card", CARD);
    const user = userEvent.setup();
    mount();

    await user.click(
      await waitFor(() => {
        const el = document.querySelector('[data-action="new-rate"]');
        expect(el).toBeEnabled();
        return el as HTMLElement;
      }),
    );
    await user.click(screen.getByLabelText("Inventory type"));
    const offered = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(offered).not.toContain("display");
    expect(offered).not.toContain("video");
    await user.click(screen.getByRole("option", { name: "ctv" }));
    await user.type(screen.getByLabelText("Base CPM"), "40");
    await confirm(user, "add-rate", "Add");

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual([
      { inventory_type: "display", base_cpm: 12, currency: "USD", effective_date: "2026-01-01" },
      { inventory_type: "video", base_cpm: 25, currency: "USD", notes: "pre-roll" },
      { inventory_type: "ctv", base_cpm: 40, currency: "USD" },
    ]);
  });

  it("sends only the package fields that changed, and never the shown price as a base", async () => {
    await credential(true);
    const sent = capture("put", "/packages/pkg-1", PACKAGE);
    const user = userEvent.setup();
    mount();

    await user.click(await enabledIn("packages", "Edit"));
    // Base price starts blank: the column shows this key's discounted price.
    expect(screen.getByLabelText("Base price")).toHaveValue("");
    expect(document.querySelector('[data-action="update-package"]')).toBeDisabled();

    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Sports bundle Q4");
    await confirm(user, "update-package", "Save");

    await waitFor(() => expect(sent).toEqual([{ name: "Sports bundle Q4" }]));
  });

  it("creates a package from an inline row", async () => {
    await credential(true);
    const sent = capture("post", "/packages", PACKAGE);
    const user = userEvent.setup();
    mount();

    await user.click(
      await waitFor(() => {
        const el = document.querySelector('[data-action="new-package"]');
        expect(el).toBeEnabled();
        return el as HTMLElement;
      }),
    );
    await user.type(screen.getByLabelText("Name"), "Q4 bundle");
    await user.type(screen.getByLabelText("Base price"), "10");
    await user.type(screen.getByLabelText("Floor"), "5");
    await confirm(user, "create-package", "Create package");

    await waitFor(() =>
      expect(sent).toEqual([{ name: "Q4 bundle", base_price: 10, floor_price: 5 }]),
    );
  });

  it("assembles a package from several products picked by name, and from pasted ids", async () => {
    await credential(true);
    const sent = capture("post", "/packages/assemble", PACKAGE);
    const user = userEvent.setup();
    mount();

    await user.click(
      await waitFor(() => {
        const el = document.querySelector('[data-action="new-assembled-package"]');
        expect(el).toBeEnabled();
        return el as HTMLElement;
      }),
    );
    await user.type(screen.getByLabelText("Name"), "Q4 bundle");
    expect(document.querySelector('[data-action="assemble-package"]')).toBeDisabled();

    const products = screen.getByLabelText("Products");
    // By name; a picked product leaves the list, so it cannot be added twice.
    await user.type(products, "video");
    await user.click(await screen.findByRole("option", { name: /prod-2/ }));
    // A pasted list is several ids, not one.
    await user.type(products, "prod-1, prod-9{Enter}");
    await confirm(user, "assemble-package", "Assemble");

    await waitFor(() =>
      expect(sent).toEqual([{ name: "Q4 bundle", product_ids: ["prod-2", "prod-1", "prod-9"] }]),
    );
  });

  it("leaves every table control disabled while writes are off", async () => {
    await credential(false);
    mount();

    await screen.findByText("Sports bundle");
    await waitFor(() => expect(document.querySelector('[data-note="read-only"]')).toBeTruthy());
    for (const action of [
      "edit-rate",
      "remove-rate",
      "new-rate",
      "edit-package",
      "delete-package",
      "new-package",
      "new-assembled-package",
      "sync-packages",
    ]) {
      for (const el of document.querySelectorAll(`[data-action="${action}"]`)) {
        expect(el, action).toBeDisabled();
      }
    }
  });
});
