import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import MediaKitScreen from "../../src/screens/MediaKit";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetWritePolicy } from "../../src/api/policy";
import { resetReachability } from "../../src/query/reachability";

/**
 * Every input the media kit's read routes declare in openapi.json reaches the
 * wire: the list's five filters, the search body's identity and audience
 * filter, and the audience match's full ref plus package scope. Blank fields
 * stay off the wire, so the agent's defaults apply.
 */

const PACKAGE = {
  package_id: "pkg-a",
  name: "Homepage Takeover",
  description: null,
  ad_formats: ["banner"],
  device_types: [2],
  geo_targets: [],
  tags: [],
  cat: ["IAB17"],
  cattax: 2,
  price_range: "$10-$20 CPM",
  rate_type: "cpm",
  is_featured: false,
  audience_capabilities: null,
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
          <MediaKitScreen />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

describe("media kit queries", () => {
  let listUrls: URL[];

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
    });
    listUrls = [];
    server.use(
      http.get(`${API}/media-kit`, () =>
        HttpResponse.json({
          total_packages: 1,
          featured_count: 0,
          featured: [],
          all_packages: [PACKAGE],
        }),
      ),
      http.get(`${API}/media-kit/packages`, ({ request }) => {
        listUrls.push(new URL(request.url));
        return HttpResponse.json({ packages: [PACKAGE] });
      }),
      http.get(`${API}/media-kit/packages/:id`, () => HttpResponse.json(PACKAGE)),
      http.get(`${API}/packages`, () => HttpResponse.json({ packages: [] })),
    );
  });

  it("sends every list filter that is set, and only those", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(listUrls).toHaveLength(1));
    expect([...listUrls[0]!.searchParams]).toEqual([]);

    const form = document.querySelector('[data-block="media-kit-filters"]') as HTMLElement;
    await user.click(within(form).getByRole("combobox", { name: "Layer" }));
    await user.click(await screen.findByRole("option", { name: "curated" }));
    await user.type(within(form).getByLabelText("Audience id"), "3-7");
    // An id with no type is a 400 upstream, so the form refuses it first.
    expect(within(form).getByRole("button", { name: "Filter" })).toBeDisabled();
    await user.click(within(form).getByRole("combobox", { name: "Audience type" }));
    await user.click(await screen.findByRole("option", { name: "standard" }));
    await user.type(within(form).getByLabelText("Taxonomy version"), "1.1");
    await user.click(within(form).getByLabelText("Featured only"));
    await user.click(within(form).getByRole("button", { name: "Filter" }));

    await waitFor(() => expect(listUrls).toHaveLength(2));
    expect(Object.fromEntries(listUrls[1]!.searchParams)).toEqual({
      layer: "curated",
      featured_only: "true",
      audience_type: "standard",
      audience_id: "3-7",
      audience_taxonomy_version: "1.1",
    });
  });

  it("shows content categories in a package's detail", async () => {
    const user = userEvent.setup();
    mount();
    const row = await waitFor(() => {
      const el = document.querySelector('[data-row="media-kit-package"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    await user.click(within(row).getByRole("button", { name: "Details" }));
    await waitFor(() =>
      expect(
        document.querySelector('[data-block="media-kit-package-detail"]')?.textContent,
      ).toContain("IAB17 (cattax 2)"),
    );
  });

  it("searches as a named buyer within an audience, and shows the authenticated view", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${API}/media-kit/search`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({
          results: [
            {
              ...PACKAGE,
              exact_price: 17.5,
              floor_price: 9,
              currency: "USD",
              negotiation_enabled: true,
              placements: [{ product_id: "prod-1", product_name: "Homepage hero" }],
            },
          ],
        });
      }),
    );
    const user = userEvent.setup();
    mount();

    await user.type(screen.getByLabelText("Search the media kit"), "sports");
    await user.type(screen.getByLabelText("Buyer tier"), "agency");
    await user.type(screen.getByLabelText("Agency id"), "ag-1");
    await user.type(screen.getByLabelText("Advertiser id"), "adv-1");
    const search = screen.getByLabelText("Search the media kit").closest("form") as HTMLElement;
    await user.click(within(search).getByRole("combobox", { name: "Audience type" }));
    await user.click(await screen.findByRole("option", { name: "contextual" }));
    await user.type(within(search).getByLabelText("Audience id"), "IAB1-2");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() =>
      expect(bodies).toEqual([
        {
          query: "sports",
          buyer_tier: "agency",
          agency_id: "ag-1",
          advertiser_id: "adv-1",
          audience_filter: { audience_type: "contextual", audience_id: "IAB1-2" },
        },
      ]),
    );
    const table = await waitFor(() => {
      const el = document.querySelector('[data-block="media-kit-search-table"]');
      expect(el).toBeTruthy();
      return el!;
    });
    expect(table.textContent).toContain("$17.50 · floor $9.00");
    expect(table.textContent).toContain("negotiable");
    expect(table.textContent).toContain("Homepage hero");
  });

  it("sends the whole audience ref and the package scope to the match", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${API}/agentic-audience/match`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({
          match_confidence: 0.81,
          match_quality: "STRONG",
          matched_capabilities: ["agentic"],
          agentic_supported_by_seller: true,
          rationale: "Deterministic mock score",
        });
      }),
    );
    const user = userEvent.setup();
    mount();

    const block = document.querySelector('[data-block="audience-match"]') as HTMLElement;
    await user.type(within(block).getByLabelText("Audience identifier"), "emb://b/x");
    await user.type(within(block).getByLabelText("Package"), "pkg-a{Enter}");
    await user.type(within(block).getByLabelText("Taxonomy"), "agentic-audiences");
    await user.type(within(block).getByLabelText("Version"), "draft-2026-01");
    await user.click(within(block).getByRole("combobox", { name: "Source" }));
    await user.click(await screen.findByRole("option", { name: "inferred" }));
    await user.type(within(block).getByLabelText("Confidence"), "0.7");
    await user.type(within(block).getByLabelText("Jurisdiction"), "EU");
    // A context with half its required pair is refused before sending.
    expect(within(block).getByRole("button", { name: "Match" })).toBeDisabled();
    await user.type(within(block).getByLabelText("Consent framework"), "IAB-TCFv2");
    await user.click(within(block).getByRole("button", { name: "Match" }));

    await waitFor(() =>
      expect(bodies).toEqual([
        {
          audience_ref: {
            type: "agentic",
            identifier: "emb://b/x",
            taxonomy: "agentic-audiences",
            version: "draft-2026-01",
            source: "inferred",
            confidence: 0.7,
            compliance_context: { jurisdiction: "EU", consent_framework: "IAB-TCFv2" },
          },
          package_id: "pkg-a",
        },
      ]),
    );
    await waitFor(() => expect(block.textContent).toContain("Deterministic mock score"));
    expect(block.textContent).toContain("STRONG");
  });
});
