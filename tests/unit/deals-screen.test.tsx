import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import DealsScreen from "../../src/screens/Deals";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetReachability } from "../../src/query/reachability";

/** Envelopes exactly as the live agent returns them, micros and all. */
const DEALS = [
  {
    deal: {
      deal_id: "deal-console-demo-1",
      deal_type: "PD",
      status: "booked",
      quote_id: "quote-demo-1",
      product: { product_id: "prod-91ddc363", name: "Premium Display - Homepage" },
      pricing: {
        base_cpm: { amount_micros: 15_000_000, currency: "USD" },
        final_cpm: { amount_micros: 12_500_000, currency: "USD" },
        pricing_model: "cpm",
      },
      terms: {
        impressions: 5_000_000,
        flight_start: "2026-12-01",
        flight_end: "2026-12-31",
        guaranteed: false,
      },
      buyer_tier: "seat",
      expires_at: "2026-12-31T23:59:59",
      created_at: "2026-09-17T06:00:00",
    },
  },
  {
    deal: {
      deal_id: "deal-console-demo-2",
      deal_type: "PG",
      status: "proposed",
      quote_id: null,
      product: { product_id: "prod-2", name: "Video Preroll" },
      pricing: { final_cpm: { amount_micros: 30_000_000, currency: "EUR" }, pricing_model: "cpm" },
      terms: null,
      buyer_tier: "public",
      expires_at: "2026-10-01T00:00:00",
      created_at: "2026-09-16T06:00:00",
    },
  },
];

const PERFORMANCE = {
  deal_id: "deal-console-demo-1",
  impressions_available: 1_000_000,
  impressions_served: 250_000,
  fill_rate: 0.25,
  win_rate: 0.4,
  avg_cpm_actual: 11.9,
  delivery_pacing: "on_track",
  last_updated: "2026-09-16T09:00:00Z",
};

const LINEAGE = {
  deal_id: "deal-console-demo-1",
  status: "confirmed",
  parents: [{ deal_id: "deal-old-0", status: "deprecated" }],
  replacements: [],
  chain_length: 2,
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
          <DealsScreen />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

const list = (extra: Record<string, unknown> = {}) => ({
  deals: DEALS,
  count: DEALS.length,
  skipped: [],
  ...extra,
});

describe("the deals screen", () => {
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
      http.get(`${API}/api/v1/deals`, () => HttpResponse.json(list())),
      http.get(`${API}/api/v1/deals/deal-console-demo-1/performance`, () =>
        HttpResponse.json(PERFORMANCE),
      ),
      http.get(`${API}/api/v1/deals/deal-console-demo-1/lineage`, () => HttpResponse.json(LINEAGE)),
    );
  });

  it("lists deals with their wire status", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("deal-console-demo-1")).toBeInTheDocument());

    expect(document.querySelector('[data-status="booked"]')).toBeTruthy();
    expect(document.querySelector('[data-status="proposed"]')).toBeTruthy();
  });

  /**
   * Prices cross the wire as micros. Rendering the integer, or dividing by the
   * wrong power of ten, turns $12.50 into $12,500,000 — the kind of error that
   * looks plausible on a deal ledger.
   */
  it("converts micros to currency, in the currency the deal carries", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("deal-console-demo-1")).toBeInTheDocument());

    expect(document.body.textContent).toContain("$12.50");
    expect(document.body.textContent).toMatch(/€30\.00|EUR\s?30\.00/);
    expect(document.body.textContent).not.toContain("12,500,000");
  });

  it("survives a deal with no terms", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("deal-console-demo-2")).toBeInTheDocument());
    const row = screen.getByText("deal-console-demo-2").closest("tr")!;
    expect(row.textContent).toMatch(/expires/i);
  });

  it("filters on the wire status and asks the agent for it", async () => {
    const seen: URL[] = [];
    server.use(
      http.get(`${API}/api/v1/deals`, ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json(list());
      }),
    );

    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen[0]!.searchParams.has("status")).toBe(false);

    await user.click(screen.getByLabelText("Status"));
    await user.click(await screen.findByRole("option", { name: "booked" }));

    await waitFor(() => expect(seen[seen.length - 1]!.searchParams.get("status")).toBe("booked"));
  });

  /**
   * The route is operator-only, so a buyer key has to be told why the screen is
   * empty rather than shown a bare 403 or, worse, "no deals".
   */
  it("shows the gated notice to a buyer key, not an empty ledger", async () => {
    server.use(
      http.get(`${API}/api/v1/deals`, () =>
        HttpResponse.json({ detail: "operator required" }, { status: 403 }),
      ),
    );
    renderScreen();

    await waitFor(() =>
      expect(document.querySelector('[data-state="operator-required"]')).toBeTruthy(),
    );
    expect(document.body.textContent).not.toMatch(/no deals yet/i);
  });

  /**
   * A 401 and a 403 are opposite problems. Conflating them tells an operator
   * holding a revoked key to go find an operator key they already have.
   */
  it("says a rejected key is rejected, not that it is a buyer key", async () => {
    server.use(
      http.get(`${API}/api/v1/deals`, () =>
        HttpResponse.json({ detail: "invalid api key" }, { status: 401 }),
      ),
    );
    renderScreen();

    await waitFor(() => expect(document.querySelector('[data-state="key-rejected"]')).toBeTruthy());
    expect(document.querySelector('[data-state="operator-required"]')).toBeNull();
    expect(document.body.textContent).toMatch(/expired or been revoked/i);
    expect(document.body.textContent).not.toMatch(/is a buyer key/i);
  });

  it("shows a real empty state, not an error, for an agent with no deals", async () => {
    server.use(
      http.get(`${API}/api/v1/deals`, () =>
        HttpResponse.json({ deals: [], count: 0, skipped: [] }),
      ),
    );
    renderScreen();

    await waitFor(() =>
      expect(document.querySelector('[data-state="empty"]')?.textContent).toMatch(/no deals yet/i),
    );
    expect(document.body.textContent).not.toMatch(/could not reach|unavailable/i);
  });

  it("distinguishes an empty filter result from no deals at all", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${API}/api/v1/deals`, ({ request }) => {
        const status = new URL(request.url).searchParams.get("status");
        return HttpResponse.json(
          status ? { deals: [], count: 0, skipped: [] } : list(),
        );
      }),
    );
    renderScreen();
    await waitFor(() => expect(screen.getByText("deal-console-demo-1")).toBeInTheDocument());

    await user.click(screen.getByLabelText("Status"));
    await user.click(await screen.findByRole("option", { name: "cancelled" }));

    await waitFor(() =>
      expect(document.querySelector('[data-state="empty"]')?.textContent).toMatch(
        /no deals with status "cancelled"/i,
      ),
    );
  });

  /** A short ledger that does not say it is short is the worst failure here. */
  it("says so when the agent could not read some of its own deals", async () => {
    server.use(
      http.get(`${API}/api/v1/deals`, () =>
        HttpResponse.json(list({ skipped: ["deal-broken-1", "deal-broken-2"] })),
      ),
    );
    renderScreen();

    const note = await waitFor(() => {
      const el = document.querySelector('[data-note="skipped"]');
      expect(el).toBeTruthy();
      return el!;
    });
    expect(note.textContent).toContain("deal-broken-1");
    expect(note.textContent).toContain("deal-broken-2");
    expect(note.textContent).toMatch(/2 stored deals are missing/i);
  });

  it("does not poll — the list only refetches when asked", async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/api/v1/deals`, () => {
        calls += 1;
        return HttpResponse.json(list());
      }),
    );

    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(calls).toBe(1));

    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(calls).toBe(1);

    await user.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => expect(calls).toBe(2));
  });

  /**
   * `GET /api/v1/deals/{id}` runs a lazy expiry check and persists the result.
   * The list already carries the whole envelope, so there is no reason to call
   * it — and this test is what keeps a future "just fetch the detail" refactor
   * from quietly making the console cause writes.
   */
  it("never calls the single-deal route, which would make the agent write", async () => {
    const detailCalls: string[] = [];
    server.use(
      http.get(`${API}/api/v1/deals/:dealId`, ({ params }) => {
        detailCalls.push(String(params.dealId));
        return HttpResponse.json({ deal: DEALS[0]!.deal });
      }),
    );

    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("deal-console-demo-1")).toBeInTheDocument());

    const row = screen.getByText("deal-console-demo-1").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Details" }));
    await waitFor(() =>
      expect(document.querySelector('[data-block="deal-performance"]')).toBeTruthy(),
    );

    expect(detailCalls).toEqual([]);
  });

  it("marks the delivery figures as not measured", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("deal-console-demo-1")).toBeInTheDocument());

    const row = screen.getByText("deal-console-demo-1").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Details" }));

    await waitFor(() =>
      expect(document.querySelector('[data-block="deal-performance"]')).toBeTruthy(),
    );
    expect(document.body.textContent).toMatch(/not measured/i);
    expect(document.body.textContent).toMatch(/placeholder/i);
  });

  it("renders the lineage chain with the deal in it", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("deal-console-demo-1")).toBeInTheDocument());

    const row = screen.getByText("deal-console-demo-1").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Details" }));

    const chain = await waitFor(() => {
      const el = document.querySelector('[data-list="lineage"]');
      expect(el).toBeTruthy();
      return el!;
    });
    expect(chain.textContent).toContain("deal-old-0");
    expect(chain.textContent).toMatch(/predecessor/);
    expect(chain.textContent).toMatch(/this deal/);
  });

  it("says a deal has no migrations rather than showing an empty box", async () => {
    server.use(
      http.get(`${API}/api/v1/deals/deal-console-demo-1/lineage`, () =>
        HttpResponse.json({ ...LINEAGE, parents: [], replacements: [], chain_length: 1 }),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("deal-console-demo-1")).toBeInTheDocument());

    const row = screen.getByText("deal-console-demo-1").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Details" }));

    await waitFor(() => expect(document.querySelector('[data-state="no-lineage"]')).toBeTruthy());
  });

  it("degrades one panel without taking the other down", async () => {
    server.use(
      http.get(`${API}/api/v1/deals/deal-console-demo-1/performance`, () =>
        HttpResponse.json({ detail: "boom" }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("deal-console-demo-1")).toBeInTheDocument());

    const row = screen.getByText("deal-console-demo-1").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Details" }));

    await waitFor(() => expect(document.body.textContent).toMatch(/the agent returned 500/i));
    expect(document.querySelector('[data-list="lineage"]')).toBeTruthy();
  });

  it("degrades the list without crashing when a field changes upstream", async () => {
    server.use(
      http.get(`${API}/api/v1/deals`, () =>
        // deal_id renamed upstream.
        HttpResponse.json({ deals: [{ deal: { id: "D-X" } }], count: 1, skipped: [] }),
      ),
    );
    renderScreen();

    await waitFor(() => expect(document.body.textContent).toMatch(/unexpected response shape/i));
  });
});
