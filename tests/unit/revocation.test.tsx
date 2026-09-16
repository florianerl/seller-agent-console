import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";

// Poll fast, so the real polling path is what the test exercises rather than a
// synthetic focus event. Must be hoisted above the imports that read it.
vi.mock("../../src/query/cadence", () => ({
  CADENCE: {
    health: 50,
    events: 50,
    orders: 50,
    inventorySync: 50,
    rateCard: 50,
    dealsExport: 0,
  },
}));

import { API, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import { HealthCards } from "../../src/screens/HealthCards";
import { CredentialProvider } from "../../src/credentials/context";
import { saveCredential, clearCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";

const card = (name: string) => document.querySelector(`[data-card="${name}"]`) as HTMLElement;
const stateOf = (name: string) => card(name)?.getAttribute("data-state");

function renderCards() {
  return render(
    <SWRConfig
      value={{
        provider: () => new Map(),
        shouldRetryOnError: false,
        dedupingInterval: 0,
        compare: sameResult,
      }}
    >
      <ThemeProvider theme={theme}>
        <CredentialProvider>
          <HealthCards />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

describe("access withdrawn mid-session", () => {
  beforeEach(async () => {
    await clearCredential();
    await saveCredential({
      baseUrl: API,
      apiKey: "k-operator",
      role: "operator",
      name: "Ad Seller System API",
      reportedVersion: "2.4.2",
    });
  });

  it("clears the value rather than ageing it when a poll is rejected", async () => {
    let revoked = false;

    server.use(
      http.get(`${API}/health`, () => HttpResponse.json({ status: "healthy" })),
      http.get(API, () => HttpResponse.json({ name: "Ad Seller System API", version: "2.4.2" })),
      http.get(`${API}/auth/api-keys`, () => HttpResponse.json({ keys: [] })),
      http.get(`${API}/api/v1/inventory-sync/status`, () =>
        HttpResponse.json({ enabled: true, last_sync: null, sync_count: 0, task_running: false }),
      ),
      http.get(`${API}/events`, () =>
        revoked
          ? new HttpResponse(null, { status: 403 })
          : HttpResponse.json({
              events: [{ event_type: "deal.created", timestamp: "2026-09-16T12:00:00Z" }],
            }),
      ),
    );

    renderCards();
    await waitFor(() =>
      expect(within(card("events")).getByText("deal.created")).toBeInTheDocument(),
    );

    // The operator key is revoked upstream; the next poll comes back 403.
    revoked = true;

    await waitFor(() => expect(stateOf("events")).toBe("blocked"), { timeout: 4000 });

    // Data the current credential is no longer entitled to see must be gone,
    // not merely marked stale. Keeping it on screen would be a disclosure.
    expect(within(card("events")).queryByText("deal.created")).toBeNull();

    // And the cards that need no key are untouched.
    expect(stateOf("agent")).toBe("live");
    expect(stateOf("sync")).toBe("live");
  });

  it("shows the last known value, visibly aged, when a poll merely fails", async () => {
    let failing = false;

    server.use(
      http.get(`${API}/health`, () => HttpResponse.json({ status: "healthy" })),
      http.get(API, () => HttpResponse.json({ name: "Ad Seller System API", version: "2.4.2" })),
      http.get(`${API}/auth/api-keys`, () => HttpResponse.json({ keys: [] })),
      http.get(`${API}/events`, () => HttpResponse.json({ events: [] })),
      http.get(`${API}/api/v1/inventory-sync/status`, () =>
        failing
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({
              enabled: true,
              last_sync: "2026-09-16T10:00:00Z",
              sync_count: 7,
              task_running: false,
            }),
      ),
    );

    renderCards();
    await waitFor(() => expect(stateOf("sync")).toBe("live"));

    failing = true;

    await waitFor(() => expect(stateOf("sync")).toBe("stale"), { timeout: 4000 });
    // Unlike a rejection, the value stays — but it must say it is old.
    expect(within(card("sync")).getByText(/7 runs/)).toBeInTheDocument();
    expect(within(card("sync")).getByText(/couldn't refresh/i)).toBeInTheDocument();
  });
});
