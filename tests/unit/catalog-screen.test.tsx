import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
});
