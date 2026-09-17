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

/** Raw stored dicts, as `export?format=generic` returns them. */
const DEALS = [
  {
    deal_id: "DEAL-001",
    status: "confirmed",
    deal_type: "PG",
    actual_price_cpm: 12.5,
    created_at: "2026-09-10T09:00:00Z",
    expires_at: "2026-12-10T09:00:00Z",
  },
  {
    deal_id: "DEAL-002",
    status: "proposed",
    deal_type: "PD",
    pricing: { final_cpm: 8.25, currency: "USD" },
    created_at: "2026-09-12T09:00:00Z",
  },
];

/** The mapped wire envelope, as `GET /api/v1/deals/{id}` returns it. */
const DETAIL = {
  deal: {
    deal_id: "DEAL-001",
    deal_type: "PG",
    // `confirmed` upstream becomes `booked` on the wire.
    status: "booked",
    quote_id: "Q-1",
    product: { product_id: "p-1", name: "Homepage Takeover" },
    pricing: { final_cpm: { amount_micros: 12_500_000, currency: "USD" }, pricing_model: "cpm" },
    terms: {
      impressions: 1_000_000,
      flight_start: "2026-10-01",
      flight_end: "2026-10-31",
      guaranteed: true,
    },
    buyer_tier: "agency",
    expires_at: "2026-12-10T09:00:00Z",
    created_at: "2026-09-10T09:00:00Z",
  },
};

const PERFORMANCE = {
  deal_id: "DEAL-001",
  impressions_available: 1_000_000,
  impressions_served: 250_000,
  fill_rate: 0.25,
  win_rate: 0.4,
  avg_cpm_actual: 11.9,
  delivery_pacing: "on_track",
  last_updated: "2026-09-16T09:00:00Z",
};

const LINEAGE = {
  deal_id: "DEAL-001",
  status: "confirmed",
  parents: [{ deal_id: "DEAL-000", status: "deprecated" }],
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
      http.get(`${API}/api/v1/deals/export`, () =>
        HttpResponse.json({ format: "generic", deals: DEALS, count: DEALS.length }),
      ),
      http.get(`${API}/api/v1/deals/DEAL-001`, () => HttpResponse.json(DETAIL)),
      http.get(`${API}/api/v1/deals/DEAL-001/performance`, () => HttpResponse.json(PERFORMANCE)),
      http.get(`${API}/api/v1/deals/DEAL-001/lineage`, () => HttpResponse.json(LINEAGE)),
    );
  });

  it("lists deals with their stored status and price", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("DEAL-001")).toBeInTheDocument());

    expect(document.querySelector('[data-status="confirmed"]')).toBeTruthy();
    expect(document.querySelector('[data-status="proposed"]')).toBeTruthy();
    // Float dollars in the list...
    expect(document.body.textContent).toContain("$12.50");
    // ...including the fallback to pricing.final_cpm when actual_price_cpm is absent.
    expect(document.body.textContent).toContain("$8.25");
  });

  it("always requests the generic format", async () => {
    const seen: URL[] = [];
    server.use(
      http.get(`${API}/api/v1/deals/export`, ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json({ format: "generic", deals: [], count: 0 });
      }),
    );
    renderScreen();
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen[0]!.searchParams.get("format")).toBe("generic");
  });

  /**
   * The point of the whole screen: an empty deal index is what a fresh agent
   * looks like, and it must not be presented as a failure.
   */
  it("shows a real empty state, not an error, for an empty deal index", async () => {
    server.use(
      http.get(`${API}/api/v1/deals/export`, () =>
        HttpResponse.json({ format: "generic", deals: [], count: 0 }),
      ),
    );
    renderScreen();

    await waitFor(() =>
      expect(document.querySelector('[data-state="empty"]')?.textContent).toMatch(/no deals yet/i),
    );
    expect(document.body.textContent).not.toMatch(/could not reach|unavailable|error/i);
  });

  it("distinguishes an empty filter result from no deals at all", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${API}/api/v1/deals/export`, ({ request }) => {
        const status = new URL(request.url).searchParams.get("status");
        return HttpResponse.json({
          format: "generic",
          deals: status ? [] : DEALS,
          count: status ? 0 : DEALS.length,
        });
      }),
    );
    renderScreen();
    await waitFor(() => expect(screen.getByText("DEAL-001")).toBeInTheDocument());

    await user.click(screen.getByLabelText("Status"));
    await user.click(await screen.findByRole("option", { name: "cancelled" }));

    await waitFor(() =>
      expect(document.querySelector('[data-state="empty"]')?.textContent).toMatch(
        /no deals with status "cancelled"/i,
      ),
    );
  });

  it("does not poll — the list only refetches when asked", async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/api/v1/deals/export`, () => {
        calls += 1;
        return HttpResponse.json({ format: "generic", deals: DEALS, count: DEALS.length });
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

  it("discloses that opening a deal makes the agent write", () => {
    renderScreen();
    const note = document.querySelector('[data-note="lazy-expiry"]');
    expect(note?.textContent).toMatch(/makes the agent write/i);
  });

  /**
   * The list and the detail disagree by design — `confirmed` is stored,
   * `booked` is the wire value. Showing both unlabelled would read as a bug.
   */
  it("labels the two status vocabularies rather than pretending they agree", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("DEAL-001")).toBeInTheDocument());

    expect(screen.getByText("Status (stored)")).toBeInTheDocument();

    const row = screen.getByText("DEAL-001").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Details" }));

    const detail = await waitFor(() => {
      const el = document.querySelector('[data-block="deal-detail"]');
      expect(el).toBeTruthy();
      return el!;
    });
    expect(detail.textContent).toMatch(/status \(wire\)/i);
    expect(detail.querySelector('[data-status="booked"]')).toBeTruthy();
  });

  it("converts the detail's micros back to currency", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("DEAL-001")).toBeInTheDocument());

    const row = screen.getByText("DEAL-001").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Details" }));

    const detail = await waitFor(() => {
      const el = document.querySelector('[data-block="deal-detail"]');
      expect(el).toBeTruthy();
      return el!;
    });
    // 12_500_000 micros, not "$12,500,000".
    expect(detail.textContent).toContain("$12.50");
  });

  /** Placeholder figures upstream must never read as measured delivery. */
  it("marks the delivery figures as not measured", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("DEAL-001")).toBeInTheDocument());

    const row = screen.getByText("DEAL-001").closest("tr")!;
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
    await waitFor(() => expect(screen.getByText("DEAL-001")).toBeInTheDocument());

    const row = screen.getByText("DEAL-001").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Details" }));

    const list = await waitFor(() => {
      const el = document.querySelector('[data-list="lineage"]');
      expect(el).toBeTruthy();
      return el!;
    });
    expect(list.textContent).toContain("DEAL-000");
    expect(list.textContent).toMatch(/this deal/);
  });

  it("says a deal has no migrations rather than showing an empty box", async () => {
    server.use(
      http.get(`${API}/api/v1/deals/DEAL-001/lineage`, () =>
        HttpResponse.json({ ...LINEAGE, parents: [], replacements: [], chain_length: 1 }),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("DEAL-001")).toBeInTheDocument());

    const row = screen.getByText("DEAL-001").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Details" }));

    await waitFor(() => expect(document.querySelector('[data-state="no-lineage"]')).toBeTruthy());
  });

  it("degrades one panel without taking the others down", async () => {
    server.use(
      http.get(`${API}/api/v1/deals/DEAL-001/performance`, () =>
        HttpResponse.json({ detail: "boom" }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("DEAL-001")).toBeInTheDocument());

    const row = screen.getByText("DEAL-001").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Details" }));

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/the agent returned 500/i),
    );
    // The deal and its lineage still rendered.
    expect(document.querySelector('[data-block="deal-detail"]')).toBeTruthy();
    expect(document.querySelector('[data-list="lineage"]')).toBeTruthy();
  });

  it("degrades the list without crashing when a field changes upstream", async () => {
    server.use(
      http.get(`${API}/api/v1/deals/export`, () =>
        // deal_id renamed upstream.
        HttpResponse.json({ format: "generic", deals: [{ id: "D-X" }], count: 1 }),
      ),
    );
    renderScreen();

    await waitFor(() => expect(document.body.textContent).toMatch(/unexpected response shape/i));
  });
});
