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
import { resetReachability } from "../../src/query/reachability";

const PACKAGE_A = {
  package_id: "pkg-a",
  name: "Homepage Takeover",
  description: "Full-page homepage placement.",
  ad_formats: ["display", "video"],
  device_types: ["desktop", "mobile"],
  geo_targets: ["US", "CA"],
  tags: ["premium"],
  price_range: "$10-$20 CPM",
  rate_type: "fixed",
  is_featured: true,
  audience_capabilities: {
    standard_taxonomy_version: "1.0",
    contextual_taxonomy_version: null,
    supports_standard: true,
    supports_contextual: false,
    supports_agentic: false,
    agentic_spec_version: null,
  },
};

const PACKAGE_B = {
  package_id: "pkg-b",
  name: "Mobile Interstitial",
  description: null,
  ad_formats: ["interstitial"],
  device_types: ["mobile"],
  geo_targets: [],
  tags: [],
  price_range: "$5-$8 CPM",
  rate_type: "auction",
  is_featured: false,
  audience_capabilities: null,
};

const MEDIA_KIT = {
  total_packages: 2,
  featured_count: 1,
  featured: [PACKAGE_A],
  all_packages: [PACKAGE_A, PACKAGE_B],
};

function renderScreen() {
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

describe("the media kit screen", () => {
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
      http.get(`${API}/media-kit`, () => HttpResponse.json(MEDIA_KIT)),
      http.get(`${API}/media-kit/packages`, () =>
        HttpResponse.json({ packages: [PACKAGE_A, PACKAGE_B] }),
      ),
      http.get(`${API}/media-kit/packages/:packageId`, ({ params }) => {
        const pkg = [PACKAGE_A, PACKAGE_B].find((p) => p.package_id === params.packageId);
        return pkg
          ? HttpResponse.json(pkg)
          : HttpResponse.json({ detail: "not found" }, { status: 404 });
      }),
    );
  });

  it("shows the summary card with total and featured counts", async () => {
    renderScreen();
    await waitFor(() =>
      expect(document.querySelector('[data-card="media-kit-summary"][data-state="live"]')).toBeTruthy(),
    );

    const card = document.querySelector('[data-card="media-kit-summary"]')!;
    expect(card.textContent).toContain("2");
    expect(card.textContent).toContain("1");
  });

  it("lists packages with their formats, devices, price, rate and featured state", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("Homepage Takeover")).toBeInTheDocument());

    const row = screen.getByText("Homepage Takeover").closest("tr")!;
    expect(row.textContent).toContain("display, video");
    expect(row.textContent).toContain("desktop, mobile");
    expect(row.textContent).toContain("$10-$20 CPM");
    expect(row.textContent).toContain("fixed");
    expect(row.textContent).toMatch(/featured/i);

    const other = screen.getByText("Mobile Interstitial").closest("tr")!;
    expect(other.textContent).not.toMatch(/featured/i);
  });

  it("expands a row into a detail that fetches the single package", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("Homepage Takeover")).toBeInTheDocument());

    const row = screen.getByText("Homepage Takeover").closest("tr")!;
    expect(row).toHaveAttribute("data-row", "media-kit-package");

    const toggle = within(row).getByRole("button", { name: "Details" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await waitFor(() =>
      expect(document.querySelector('[data-block="media-kit-package-detail"]')).toBeTruthy(),
    );
    const detail = document.querySelector('[data-block="media-kit-package-detail"]')!;
    expect(detail.textContent).toContain("Full-page homepage placement.");
    expect(detail.textContent).toContain("US, CA");
  });

  it("does not search until the operator submits", async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/media-kit/search`, () => {
        calls += 1;
        return HttpResponse.json({ results: [PACKAGE_A] });
      }),
    );

    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("Homepage Takeover")).toBeInTheDocument());

    const field = screen.getByLabelText("Search the media kit");
    await user.type(field, "homepage");
    expect(calls).toBe(0);

    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(calls).toBe(1));
  });

  it("searches with the submitted query and shows the matching packages", async () => {
    let seenBody: unknown;
    server.use(
      http.post(`${API}/media-kit/search`, async ({ request }) => {
        seenBody = await request.json();
        return HttpResponse.json({ results: [PACKAGE_B] });
      }),
    );

    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("Homepage Takeover")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Search the media kit"), "interstitial");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() =>
      expect(document.querySelector('[data-block="media-kit-search-table"]')).toBeTruthy(),
    );
    const table = document.querySelector('[data-block="media-kit-search-table"]')!;
    expect(table.textContent).toContain("Mobile Interstitial");
    expect(table.textContent).not.toContain("Homepage Takeover");
    expect(seenBody).toEqual({ query: "interstitial" });
  });

  it("re-searches when a different query is submitted, keyed on the query string", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${API}/media-kit/search`, async ({ request }) => {
        const body = (await request.json()) as { query: string };
        bodies.push(body);
        return HttpResponse.json({
          results: body.query === "mobile" ? [PACKAGE_B] : [PACKAGE_A],
        });
      }),
    );

    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("Homepage Takeover")).toBeInTheDocument());

    const field = screen.getByLabelText("Search the media kit");
    await user.type(field, "homepage");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(document.querySelector('[data-block="media-kit-search-table"]')!.textContent).toContain(
        "Homepage Takeover",
      ),
    );

    await user.clear(field);
    await user.type(field, "mobile");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() =>
      expect(document.querySelector('[data-block="media-kit-search-table"]')!.textContent).toContain(
        "Mobile Interstitial",
      ),
    );
    expect(bodies.map((b) => (b as { query: string }).query)).toEqual(["homepage", "mobile"]);
  });

  it("shows a real empty state, not an error, when nothing matches", async () => {
    server.use(http.post(`${API}/media-kit/search`, () => HttpResponse.json({ results: [] })));

    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("Homepage Takeover")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Search the media kit"), "nothing");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(document.querySelector('[data-state="no-matches"]')).toBeTruthy());
  });

  /**
   * `/media-kit/search` rejects an invalid key with 401, unlike the GET routes
   * on this screen which ignore the key entirely (see media-kit.ts). The
   * rejected state must be shown distinctly, not folded into "no results".
   */
  it("shows the gated notice when the search is rejected", async () => {
    server.use(
      http.post(`${API}/media-kit/search`, () =>
        HttpResponse.json({ detail: "invalid api key" }, { status: 401 }),
      ),
    );

    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("Homepage Takeover")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Search the media kit"), "homepage");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(document.querySelector('[data-state="key-rejected"]')).toBeTruthy());
    expect(document.querySelector('[data-state="no-matches"]')).toBeNull();
  });

  /**
   * Every field on `MediaKitPackage` is `.catch()`-guarded except `package_id`,
   * and the list itself is `z.array(MediaKitPackage).catch([])` — a malformed
   * item degrades to an empty list, not a parse failure, so the only way to
   * reach `unavailable("shape")` here is to break the envelope itself.
   */
  it("degrades without crashing when the response is not the expected envelope", async () => {
    server.use(
      http.get(`${API}/media-kit/packages`, () =>
        // The whole body is an array, not `{ packages: [...] }`.
        HttpResponse.json([{ package_id: "pkg-a" }]),
      ),
    );
    renderScreen();

    await waitFor(() => expect(document.body.textContent).toMatch(/unexpected response shape/i));
  });
});
