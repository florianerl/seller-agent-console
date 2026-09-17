import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import CuratorsScreen from "../../src/screens/Curators";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetReachability } from "../../src/query/reachability";

const CURATORS = [
  {
    curator_id: "curator-console-demo-1",
    name: "Demo Curator",
    domain: "curator.example",
    type: "supply_path_optimizer",
    description: "",
    fee: { fee_type: "percent", fee_value: 10, currency: "USD" },
    supported_deal_types: ["PG", "PD"],
    is_active: true,
  },
  {
    curator_id: "curator-console-demo-2",
    name: "Inactive Curator",
    domain: "inactive.example",
    type: "data_provider",
    description: "",
    fee: { fee_type: "cpm", fee_value: 0.5, currency: "USD" },
    supported_deal_types: [],
    is_active: false,
  },
];

const CURATOR_DETAIL = {
  ...CURATORS[0],
  audience_segments: ["sports-fans", "auto-intenders"],
  content_categories: ["sports", "news"],
  tags: ["premium"],
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
          <CuratorsScreen />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

describe("the curators screen", () => {
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
      http.get(`${API}/api/v1/curators`, () =>
        HttpResponse.json({ curators: CURATORS, count: CURATORS.length }),
      ),
    );
  });

  it("lists registered curators with a distinctive id", async () => {
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText("curator-console-demo-1")).toBeInTheDocument(),
    );
  });

  it("shows a real empty state, not an error, for a seller with no curators", async () => {
    server.use(
      http.get(`${API}/api/v1/curators`, () =>
        HttpResponse.json({ curators: [], count: 0 }),
      ),
    );
    renderScreen();

    await waitFor(() =>
      expect(
        document.querySelector('[data-state="empty"]')?.textContent,
      ).toMatch(/no curators have registered yet/i),
    );
    expect(document.body.textContent).not.toMatch(/could not reach|unavailable/i);
  });

  /**
   * A bare "10" is ambiguous between a percent-of-media-cost fee and a CPM
   * surcharge. The row must say which, plus the currency for the CPM case.
   */
  it("renders the fee with its type, never a bare number", async () => {
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText("curator-console-demo-1")).toBeInTheDocument(),
    );

    const row = screen.getByText("curator-console-demo-1").closest("tr")!;
    expect(row.textContent).toMatch(/10%\s*of media cost/i);

    const inactiveRow = screen.getByText("curator-console-demo-2").closest("tr")!;
    expect(inactiveRow.textContent).toMatch(/\$0\.50/);
    expect(inactiveRow.textContent).toMatch(/CPM/);
  });

  it("expands a row into a detail that fetches curatorById and shows segments, categories and tags", async () => {
    server.use(
      http.get(`${API}/api/v1/curators/curator-console-demo-1`, () =>
        HttpResponse.json(CURATOR_DETAIL),
      ),
    );
    renderScreen();

    await waitFor(() =>
      expect(screen.getByText("curator-console-demo-1")).toBeInTheDocument(),
    );

    const row = screen.getByText("curator-console-demo-1").closest("tr")!;
    const toggle = within(row).getByRole("button", { name: /details/i });
    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await waitFor(() =>
      expect(screen.getByText(/sports-fans/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/auto-intenders/)).toBeInTheDocument();
    expect(screen.getByText("sports, news")).toBeInTheDocument();
    expect(screen.getByText("premium")).toBeInTheDocument();
  });

  /**
   * A 403 and a 401 mean opposite things (insufficient role vs. a dead key)
   * and the notice text must not conflate them — same contract as every other
   * gated screen.
   */
  it("shows an operator-required notice when the list is rejected with 403", async () => {
    server.use(
      http.get(`${API}/api/v1/curators`, () =>
        HttpResponse.json({ detail: "operator required" }, { status: 403 }),
      ),
    );
    renderScreen();

    await waitFor(() =>
      expect(document.querySelector('[data-state="operator-required"]')).toBeTruthy(),
    );
    expect(document.querySelector('[data-state="key-rejected"]')).toBeNull();
  });

  it("shows a key-rejected notice, not an operator-required one, on 401", async () => {
    server.use(
      http.get(`${API}/api/v1/curators`, () =>
        HttpResponse.json({ detail: "invalid api key" }, { status: 401 }),
      ),
    );
    renderScreen();

    await waitFor(() =>
      expect(document.querySelector('[data-state="key-rejected"]')).toBeTruthy(),
    );
    expect(document.querySelector('[data-state="operator-required"]')).toBeNull();
  });

  it("degrades without crashing when the response shape changes upstream", async () => {
    server.use(
      http.get(`${API}/api/v1/curators`, () =>
        // curator_id renamed upstream.
        HttpResponse.json({ curators: [{ id: "C-X" }], count: 1 }),
      ),
    );
    renderScreen();

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/unexpected response shape/i),
    );
  });
});
