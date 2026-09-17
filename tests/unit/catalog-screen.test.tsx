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
import { resetReachability } from "../../src/query/reachability";

const PRODUCTS = [
  {
    product_id: "prod-console-demo-1",
    name: "Premium Display - Homepage",
    delivery_type: "guaranteed",
    pricing_model: "cpm",
    base_price: { amount_micros: 15_000_000, currency: "USD" },
    ad_formats: ["display"],
    available_impressions: 1_000_000,
  },
  {
    product_id: "prod-console-demo-2",
    name: "Pricing on request",
    delivery_type: "non_guaranteed",
    pricing_model: "cpm",
    base_price: null,
    ad_formats: ["video"],
    available_impressions: null,
  },
];

const RATE_CARD_STORED = {
  entries: [
    { inventory_type: "display", base_cpm: 12, currency: "USD", effective_date: "2026-01-01", notes: null },
  ],
  updated_at: "2026-09-01T00:00:00Z",
  source: "stored",
};

const RATE_CARD_DEFAULTS = { ...RATE_CARD_STORED, source: "defaults" };

const PACKAGES = [
  {
    package_id: "pkg-exact",
    name: "Exact-priced package",
    rate_type: "fixed",
    is_featured: false,
    ad_formats: ["display"],
    price_range: null,
    exact_price: 9.5,
    floor_price: 5,
    currency: "USD",
    negotiation_enabled: false,
  },
  {
    package_id: "pkg-range",
    name: "Banded package",
    rate_type: "fixed",
    is_featured: false,
    ad_formats: ["display"],
    price_range: "$5-$10 CPM",
    exact_price: null,
    floor_price: null,
    currency: null,
    negotiation_enabled: null,
  },
];

function renderScreen() {
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

describe("the catalog screen", () => {
  beforeEach(async () => {
    resetReachability();
    await clearCredential();
    await saveCredential({
      baseUrl: API,
      apiKey: "k",
      role: "operator",
      name: "Ad Seller System API",
      reportedVersion: "2.4.2",
    });
    server.use(
      http.get(`${API}/products`, () =>
        HttpResponse.json({ products: PRODUCTS, total_count: PRODUCTS.length, limit: 200, offset: 0 }),
      ),
      http.get(`${API}/api/v1/rate-card`, () => HttpResponse.json(RATE_CARD_STORED)),
      http.get(`${API}/packages`, () => HttpResponse.json({ packages: PACKAGES })),
    );
  });

  it("lists products with a distinctive name", async () => {
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText("Premium Display - Homepage")).toBeInTheDocument(),
    );
  });

  it("shows a real empty state, not an error, for an agent with no products", async () => {
    server.use(
      http.get(`${API}/products`, () =>
        HttpResponse.json({ products: [], total_count: 0, limit: 200, offset: 0 }),
      ),
    );
    renderScreen();

    await waitFor(() =>
      expect(document.querySelector('[data-state="no-products"]')?.textContent).toMatch(
        /no products/i,
      ),
    );
    expect(document.body.textContent).not.toMatch(/could not reach|unavailable/i);
  });

  it("degrades the product list without crashing when a field changes upstream", async () => {
    server.use(
      http.get(`${API}/products`, () =>
        // product_id renamed upstream.
        HttpResponse.json({ products: [{ id: "P-X", name: "x" }], total_count: 1, limit: 200, offset: 0 }),
      ),
    );
    renderScreen();

    await waitFor(() => expect(document.body.textContent).toMatch(/unexpected response shape/i));
  });

  /** A null base_price is "pricing on request", a real product state, not missing data. */
  it("renders a null base_price as on request, not blank", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("Pricing on request")).toBeInTheDocument());

    const row = screen.getByText("Pricing on request").closest("tr")!;
    expect(row.textContent).toMatch(/on request/i);
  });

  /**
   * `source: "defaults"` means the agent invented these numbers because no
   * rate card was configured. Rendering them as this publisher's pricing
   * without the warning would be a fabrication with a plausible face.
   */
  it("warns when the rate card is the agent's invented defaults, not a configured one", async () => {
    server.use(http.get(`${API}/api/v1/rate-card`, () => HttpResponse.json(RATE_CARD_DEFAULTS)));
    renderScreen();

    const note = await waitFor(() => {
      const el = document.querySelector('[data-note="rate-card-defaults"]');
      expect(el).toBeTruthy();
      return el!;
    });
    expect(note.textContent).toMatch(/not this publisher's pricing/i);
  });

  it("shows no defaults warning for a stored rate card", async () => {
    renderScreen();
    await waitFor(() => expect(document.querySelector('[data-block="rate-card"]')).toBeTruthy());
    expect(document.querySelector('[data-note="rate-card-defaults"]')).toBeNull();
  });

  it("shows the exact price for a package that has one", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("Exact-priced package")).toBeInTheDocument());

    const row = screen.getByText("Exact-priced package").closest("tr")!;
    expect(row.textContent).toContain("$9.50");
  });

  it("shows the price band for a package priced only as a range", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("Banded package")).toBeInTheDocument());

    const row = screen.getByText("Banded package").closest("tr")!;
    expect(row.textContent).toContain("$5-$10 CPM");
  });

  /**
   * Every product in the environment this was written against 404s on the
   * override route. That means "none set", not that the agent is down.
   */
  it("treats a 404 inventory-type override as absent, not an error", async () => {
    server.use(
      http.get(`${API}/products/prod-console-demo-1`, () => HttpResponse.json(PRODUCTS[0])),
      http.get(`${API}/api/v1/products/prod-console-demo-1/inventory-type`, () =>
        HttpResponse.json({ detail: { error: "no_override" } }, { status: 404 }),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("Premium Display - Homepage")).toBeInTheDocument());

    const row = screen.getByText("Premium Display - Homepage").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Details" }));

    await waitFor(() =>
      expect(document.querySelector('[data-state="no-override"]')?.textContent).toMatch(
        /no inventory type override/i,
      ),
    );
    expect(document.body.textContent).not.toMatch(/the agent returned 404/i);
  });

  it("does not discover until the operator submits a brief", async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/discovery`, () => {
        calls += 1;
        return HttpResponse.json({ access_tier: "public", catalog: [] });
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("Premium Display - Homepage")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Brief"), "sports");
    expect(calls).toBe(0);
  });

  it("discovers against the submitted brief", async () => {
    let seenBody: unknown;
    server.use(
      http.post(`${API}/discovery`, async ({ request }) => {
        seenBody = await request.json();
        return HttpResponse.json({
          access_tier: "public",
          tier_config: { tier: "public", tier_name: "Public" },
          catalog: [
            {
              product_id: "prod-console-demo-1",
              name: "Premium Display - Homepage",
              description: null,
              inventory_type: "display",
              deal_types: ["preferred_deal"],
              price_range: "$10-$20",
            },
          ],
        });
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("Premium Display - Homepage")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Brief"), "homepage");
    await user.click(screen.getByRole("button", { name: "Discover" }));

    await waitFor(() => expect(document.querySelector('[data-row="discovery"]')).toBeTruthy());
    expect(seenBody).toEqual({ query: "homepage" });
  });

  it("quotes a product and shows the agent's rationale verbatim", async () => {
    server.use(
      http.post(`${API}/pricing`, () =>
        HttpResponse.json({
          product_id: "prod-console-demo-1",
          base_price: 12,
          final_price: 10.5,
          currency: "USD",
          tier_discount: 0.1,
          volume_discount: 0.05,
          rationale: "seat tier plus volume band 1m",
        }),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("Premium Display - Homepage")).toBeInTheDocument());

    const pricing = document.querySelector('[data-block="pricing"]') as HTMLElement;
    await user.type(within(pricing).getByLabelText("Product id"), "prod-console-demo-1");
    await user.click(screen.getByRole("button", { name: "Quote" }));

    await waitFor(() =>
      expect(document.querySelector('[data-field="rationale"]')?.textContent).toBe(
        "seat tier plus volume band 1m",
      ),
    );
  });

  it("says an unknown product is a typo, not an outage", async () => {
    server.use(
      http.post(`${API}/pricing`, () =>
        HttpResponse.json({ detail: "Product not found" }, { status: 404 }),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("Premium Display - Homepage")).toBeInTheDocument());

    const pricing = document.querySelector('[data-block="pricing"]') as HTMLElement;
    await user.type(within(pricing).getByLabelText("Product id"), "no-such");
    await user.click(screen.getByRole("button", { name: "Quote" }));

    await waitFor(() =>
      expect(document.querySelector('[data-state="unknown-product"]')?.textContent).toMatch(/typo/i),
    );
    expect(document.body.textContent).not.toMatch(/the agent returned 404/i);
  });
});
