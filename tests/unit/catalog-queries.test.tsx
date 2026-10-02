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

/**
 * The Catalog's query forms send every field their route takes, and only the
 * ones that were filled in. The field lists are the ones in the agent's
 * openapi.json; a field dropped from a form is a request nobody can make.
 */

const PRODUCT = {
  product_id: "prod-1",
  name: "Premium Display",
  delivery_type: "Guaranteed",
  pricing_model: "cpm",
  base_price: { amount_micros: 15_000_000, currency: "USD" },
  ad_formats: ["display"],
  available_impressions: 1000,
};

function mount() {
  return render(
    <SWRConfig
      value={{
        provider: () => new Map(),
        dedupingInterval: 0,
        shouldRetryOnError: false,
        compare: sameResult,
      }}
    >
      <ThemeProvider theme={theme}>
        <CredentialProvider>
          <CatalogScreen />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

function block(name: string): HTMLElement {
  const el = document.querySelector(`[data-block="${name}"]`);
  expect(el).toBeTruthy();
  return el as HTMLElement;
}

/** Records the JSON body of a POST and answers with `reply`. */
function capturePost(path: string, reply: unknown) {
  const bodies: unknown[] = [];
  server.use(
    http.post(`${API}${path}`, async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json(reply as Record<string, unknown>);
    }),
  );
  return bodies;
}

describe("catalog query forms", () => {
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
        HttpResponse.json({ products: [PRODUCT], total_count: 1, limit: 200, offset: 0 }),
      ),
      http.get(`${API}/api/v1/rate-card`, () =>
        HttpResponse.json({ entries: [], updated_at: null, source: "stored" }),
      ),
      http.get(`${API}/packages`, () => HttpResponse.json({ packages: [] })),
    );
  });

  it("prices a line as a given buyer, with every identity field", async () => {
    const sent = capturePost("/pricing", {
      product_id: "prod-1",
      base_price: 15,
      final_price: 13.5,
      currency: "USD",
      tier_discount: 0.1,
      volume_discount: 0,
      rationale: "agency tier",
    });
    const user = userEvent.setup();
    mount();

    const form = await waitFor(() => block("pricing"));
    await user.type(within(form).getByLabelText("Product id"), "prod-1");
    await user.type(within(form).getByLabelText("Volume"), "1000");
    await user.type(within(form).getByLabelText("Buyer tier"), "agency");
    await user.type(within(form).getByLabelText("Agency id"), "a-1");
    await user.type(within(form).getByLabelText("Advertiser id"), "adv-1");
    await user.type(within(form).getByLabelText("Buyer agent URL"), "https://buyer.example");
    await user.click(within(form).getByRole("button", { name: "Quote" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      product_id: "prod-1",
      volume: 1000,
      buyer_tier: "agency",
      agency_id: "a-1",
      advertiser_id: "adv-1",
      agent_url: "https://buyer.example",
    });
  });

  it("leaves blank identity fields out of a price quote", async () => {
    const sent = capturePost("/pricing", {
      product_id: "prod-1",
      base_price: 1,
      final_price: 1,
      currency: "USD",
    });
    const user = userEvent.setup();
    mount();

    const form = await waitFor(() => block("pricing"));
    await user.type(within(form).getByLabelText("Product id"), "prod-1");
    await user.click(within(form).getByRole("button", { name: "Quote" }));

    await waitFor(() => expect(sent).toEqual([{ product_id: "prod-1" }]));
  });

  it("runs a discovery brief as a given buyer", async () => {
    const sent = capturePost("/discovery", {
      access_tier: "public",
      tier_config: {},
      catalog: [],
    });
    const user = userEvent.setup();
    mount();

    const form = await waitFor(() => block("discovery"));
    await user.type(within(form).getByLabelText("Brief"), "sports video");
    await user.type(within(form).getByLabelText("Buyer tier"), "seat");
    await user.type(within(form).getByLabelText("Agency id"), "a-1");
    await user.type(within(form).getByLabelText("Buyer agent URL"), "https://buyer.example");
    await user.click(within(form).getByRole("button", { name: "Discover" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      query: "sports video",
      buyer_tier: "seat",
      agency_id: "a-1",
      agent_url: "https://buyer.example",
    });
  });

  it("checks one product's avails with impressions, budget and targeting", async () => {
    const sent = capturePost("/products/avails", {
      productid: "prod-1",
      availableImpressions: 10_000,
      estimatedCpm: 12,
      totalCost: 120,
      guaranteedImpressions: 5000,
      availableTargeting: ["geo"],
    });
    const user = userEvent.setup();
    mount();

    const form = await waitFor(() => block("avails"));
    await user.type(within(form).getByLabelText("Product id"), "prod-1");
    await user.type(within(form).getByLabelText("Start"), "2026-10-02");
    await user.type(within(form).getByLabelText("End"), "2026-10-31");
    await user.type(within(form).getByLabelText("Impressions"), "50000");
    await user.type(within(form).getByLabelText("Budget"), "600");
    await user.click(within(form).getByRole("button", { name: "More options" }));
    // user-event reads `{` and `[` as key descriptors, so they are doubled.
    await user.type(within(form).getByLabelText("Targeting"), '{{"geo": [["US"]}');
    await user.click(within(form).getByRole("button", { name: "Check avails" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      productid: "prod-1",
      startdate: "2026-10-02",
      enddate: "2026-10-31",
      requestedImpressions: 50000,
      budget: 600,
      targeting: { geo: ["US"] },
    });
    await waitFor(() => expect(within(block("avails-forecast")).getByText("5,000")).toBeTruthy());
  });

  it("checks several products' avails and shows the priced answer", async () => {
    const sent = capturePost("/products/avails", {
      avails: [
        {
          productid: "prod-1",
          accountid: "acct-1",
          availability: 4200,
          availsstatus: { status: "available", reason: null, comment: null },
          currency: "USD",
          price: 11.5,
          startdate: "2026-10-02",
          enddate: "2026-10-31",
        },
      ],
    });
    const user = userEvent.setup();
    mount();

    const form = await waitFor(() => block("avails"));
    await user.click(within(form).getByRole("button", { name: "Several products" }));
    await user.type(within(form).getByLabelText("Products"), "prod-1, prod-2{Enter}");
    await user.type(within(form).getByLabelText("Account id"), "acct-1");
    await user.type(within(form).getByLabelText("Advertiser brand id"), "brand-1");
    await user.type(within(form).getByLabelText("Start"), "2026-10-02");
    await user.type(within(form).getByLabelText("End"), "2026-10-31");
    await user.type(within(form).getByLabelText("Currency"), "USD");
    await user.click(within(form).getByRole("button", { name: "Check avails" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      productids: ["prod-1", "prod-2"],
      accountid: "acct-1",
      advertiserbrandid: "brand-1",
      startdate: "2026-10-02",
      enddate: "2026-10-31",
      currency: "USD",
    });
    const table = await waitFor(() => block("avails-priced"));
    expect(table.textContent).toContain("4,200");
    expect(table.textContent).toContain("11.5 USD");
    expect(table.textContent).toContain("available");
  });

  it("refuses targeting that is not JSON, without sending", async () => {
    const sent = capturePost("/products/avails", {});
    const user = userEvent.setup();
    mount();

    const form = await waitFor(() => block("avails"));
    await user.type(within(form).getByLabelText("Product id"), "prod-1");
    await user.type(within(form).getByLabelText("Start"), "2026-10-02");
    await user.type(within(form).getByLabelText("End"), "2026-10-31");
    await user.click(within(form).getByRole("button", { name: "More options" }));
    await user.type(within(form).getByLabelText("Targeting"), "not json");
    await user.click(within(form).getByRole("button", { name: "Check avails" }));

    expect(await screen.findByText(/targeting is not valid json/i)).toBeTruthy();
    expect(sent).toHaveLength(0);
  });

  it("pages through a catalog larger than one page instead of cutting it off", async () => {
    const offsets: Array<string | null> = [];
    server.use(
      http.get(`${API}/products`, ({ request }) => {
        const offset = new URL(request.url).searchParams.get("offset");
        offsets.push(offset);
        const first = offset === null;
        return HttpResponse.json({
          products: [
            {
              ...PRODUCT,
              product_id: first ? "page-1" : "page-2",
              name: first ? "First page" : "Second page",
            },
          ],
          total_count: 250,
          limit: 200,
          offset: first ? 0 : 200,
        });
      }),
    );
    const user = userEvent.setup();
    mount();

    await screen.findAllByText("First page");
    const paging = await waitFor(() => block("products-paging"));
    expect(paging.textContent).toContain("of 250");
    await user.click(within(paging).getByRole("button", { name: "Next" }));

    expect((await screen.findAllByText("Second page")).length).toBeGreaterThan(0);
    expect(offsets).toContain("200");
  });

  it("filters the package list by buyer tier, agency and audience", async () => {
    const urls: string[] = [];
    server.use(
      http.get(`${API}/packages`, ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json({ packages: [] });
      }),
    );
    const user = userEvent.setup();
    mount();

    const filters = () => block("package-filters");
    await waitFor(() => block("package-filters"));
    await user.click(within(filters()).getByRole("button", { name: "Filters" }));
    console.log("DBG0b", filters().querySelector("button")!.textContent);
    await user.type(within(filters()).getByLabelText("Buyer tier"), "agency");
    await user.type(within(filters()).getByLabelText("Agency id"), "a-1");
    await user.type(within(filters()).getByLabelText("Advertiser id"), "adv-1");
    await user.type(within(filters()).getByLabelText("Layer"), "synced");
    await user.type(within(filters()).getByLabelText("Audience id"), "seg-9");
    await user.type(within(filters()).getByLabelText("Taxonomy version"), "1.1");
    await user.click(await screen.findByRole("combobox", { name: /Audience type/ }));
    await user.click(await screen.findByRole("option", { name: "contextual" }));
    await user.click(within(filters()).getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(urls.some((u) => u.includes("buyer_tier=agency"))).toBe(true));
    const url = new URL(urls.find((u) => u.includes("buyer_tier=agency"))!);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      buyer_tier: "agency",
      agency_id: "a-1",
      advertiser_id: "adv-1",
      layer: "synced",
      audience_type: "contextual",
      audience_id: "seg-9",
      audience_taxonomy_version: "1.1",
    });
  });

  it("shows the rest of what the agent says about a product", async () => {
    server.use(
      http.get(`${API}/products/prod-1`, () =>
        HttpResponse.json({
          ...PRODUCT,
          seller_organization_id: "org-7",
          description: "Top of the homepage",
          pricing_type: "floor",
          domain: "example.com",
          audience_targeting: { segments: ["sports"] },
          commercial_terms: {
            supported_deal_types: ["PG", "PD"],
            supported_pricing_models: ["cpm"],
            minimum_deal_value: { amount_micros: 5_000_000, currency: "USD" },
            guarantee_allowed: true,
            makegood_allowed: false,
          },
        }),
      ),
      http.get(`${API}/api/v1/products/prod-1/inventory-type`, () =>
        HttpResponse.json({ detail: "none" }, { status: 404 }),
      ),
    );
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole("button", { name: "Details" }));
    const extras = await waitFor(() => block("product-extras"));
    expect(extras.textContent).toContain("Top of the homepage");
    expect(extras.textContent).toContain("PG, PD");
    expect(extras.textContent).toContain("guarantee allowed".replace(/^./, (c) => c.toUpperCase()));
    expect(extras.textContent).toContain("sports");
    const detail = block("product-detail");
    expect(detail.textContent).toContain("floor");
    expect(detail.textContent).toContain("example.com");
    expect(detail.textContent).toContain("org-7");
  });
});
