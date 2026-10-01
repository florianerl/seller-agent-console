import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import { QuoteView } from "../../src/screens/QuoteView";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetReachability } from "../../src/query/reachability";
import { resetWritePolicy } from "../../src/api/policy";

const QUOTE = {
  quote: {
    quote_id: "qt-abc123",
    status: "available",
    deal_type: "PD",
    product: { product_id: "prod-1", name: "Homepage takeover" },
    pricing: {
      pricing_type: "fixed",
      base_cpm: { amount_micros: 12_000_000, currency: "USD" },
      final_cpm: { amount_micros: 10_800_000, currency: "USD" },
      tier_discount_pct: 10,
      volume_discount_pct: 0,
      pricing_model: "cpm",
    },
    terms: { impressions: 500000, guaranteed: false },
    availability: { inventory_available: true, estimated_fill_rate: 0.85 },
    buyer_tier: "agency",
    expires_at: "2026-09-30T09:00:00Z",
    created_at: "2026-09-29T09:00:00Z",
    deal_id: null,
  },
};

function renderQuote(quoteId = "qt-abc123") {
  return render(
    <SWRConfig
      value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, compare: sameResult }}
    >
      <ThemeProvider theme={theme}>
        <CredentialProvider>
          <QuoteView quoteId={quoteId} />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

async function show(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Show quote" }));
}

describe("a quote by id", () => {
  let calls: string[];

  beforeEach(async () => {
    resetReachability();
    resetWritePolicy();
    await clearCredential();
    await saveCredential({
      baseUrl: API,
      apiKey: "k",
      role: "operator",
      name: "Ad Seller System API",
      reportedVersion: "2.4.2",
    });
    calls = [];
    server.use(
      http.get(`${API}/api/v1/quotes/:id`, ({ params }) => {
        calls.push(String(params["id"]));
        return params["id"] === "qt-abc123"
          ? HttpResponse.json(QUOTE)
          : params["id"] === "qt-old"
            ? HttpResponse.json({ detail: "Quote expired" }, { status: 410 })
            : HttpResponse.json({ detail: "Quote not found" }, { status: 404 });
      }),
    );
  });

  it("discloses that reading the quote writes, and sends nothing until asked", async () => {
    renderQuote();
    expect(await screen.findByText("qt-abc123")).toBeInTheDocument();
    expect(document.querySelector('[data-note="writes"]')?.textContent).toMatch(/makes the agent write/);
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toEqual([]);
  });

  it("shows pricing, terms and availability once asked", async () => {
    const user = userEvent.setup();
    renderQuote();
    await show(user);
    await waitFor(() => expect(document.querySelector('[data-block="quote-card"]')).toBeTruthy());
    expect(screen.getByText("Homepage takeover")).toBeInTheDocument();
    expect(screen.getByText("$10.80")).toBeInTheDocument();
    expect(document.querySelector('[data-block="quote-terms"]')).toBeTruthy();
    expect(document.querySelector('[data-block="quote-availability"]')).toBeTruthy();
    expect(document.querySelector('[data-freshness="live"]')?.textContent).toMatch(/as of/);
    expect(screen.queryByRole("button", { name: "Show quote" })).toBeNull();
    expect(calls).toEqual(["qt-abc123"]);
  });

  it("says plainly that the agent has no such quote, without calling it a typo", async () => {
    const user = userEvent.setup();
    renderQuote("nope");
    await show(user);
    await waitFor(() => expect(document.querySelector('[data-state="unknown-quote"]')).toBeTruthy());
    expect(document.querySelector('[data-state="unknown-quote"]')?.textContent).toMatch(
      /no quote with this id/,
    );
  });

  it("says an expired quote expired", async () => {
    const user = userEvent.setup();
    renderQuote("qt-old");
    await show(user);
    await waitFor(() => expect(document.querySelector('[data-state="expired-quote"]')).toBeTruthy());
  });

  it("does not refetch when the window regains focus", async () => {
    const user = userEvent.setup();
    renderQuote();
    await show(user);
    await waitFor(() => expect(calls).toHaveLength(1));
    window.dispatchEvent(new Event("focus"));
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toHaveLength(1);
  });
});
