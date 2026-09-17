import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API, recordRequests, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import ReportingScreen from "../../src/screens/Reporting";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetReachability } from "../../src/query/reachability";

const REPORT = {
  total_orders: 3,
  status_counts: { approved: 2, draft: 1 },
  total_transitions: 7,
  avg_transitions_per_order: 2.3333,
  actor_type_counts: { agent: 4, operator: 3 },
  change_requests: { total: 1, by_status: { pending: 1 } },
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
          <ReportingScreen />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

describe("the reporting screen", () => {
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
      http.get(`${API}/api/v1/orders/report`, () => HttpResponse.json(REPORT)),
      http.get(`${API}/gam/orders`, () => HttpResponse.json({ orders: [{ id: "gam-1" }] })),
      http.get(`${API}/gam/report`, ({ request }) =>
        HttpResponse.json({ asked_for: new URL(request.url).searchParams.get("order_ids") }),
      ),
    );
  });

  it("shows the agent's own order counts, spelled out", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("3 orders")).toBeInTheDocument());
    expect(screen.getByText("1 request")).toBeInTheDocument();
    expect(screen.getByText("2.3")).toBeInTheDocument();
  });

  /**
   * The GAM routes proxy an external ad server. Rendering this screen must not
   * spend someone else's quota; the operator asks first.
   */
  it("requests nothing from the ad server until asked", async () => {
    const recorder = recordRequests();
    server.use(http.get(`${API}/api/v1/orders/report`, () => HttpResponse.json(REPORT)));

    renderScreen();
    await waitFor(() => expect(screen.getByText("3 orders")).toBeInTheDocument());

    expect(recorder.seen.filter((line) => line.includes("/gam/"))).toEqual([]);
    expect(screen.getByRole("button", { name: "Load" })).toBeInTheDocument();
  });

  it("loads ad server orders when asked, and shows the payload verbatim", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Load" }));

    await waitFor(() =>
      expect(document.querySelector('[data-payload="gam-orders"]')?.textContent).toContain(
        "gam-1",
      ),
    );
  });

  /** order_ids is required upstream, so the form must not be able to omit it. */
  it("will not run a delivery report without order ids", async () => {
    renderScreen();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Run report" })).toBeDisabled(),
    );
    expect(document.querySelectorAll('[data-state="idle"]').length).toBeGreaterThan(0);
  });

  it("sends the order ids as one comma-joined parameter", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(screen.getByLabelText("Order IDs"), "ORD-1,ORD-2");
    await user.click(screen.getByRole("button", { name: "Run report" }));

    await waitFor(() =>
      expect(document.querySelector('[data-payload="gam-report"]')?.textContent).toContain(
        "ORD-1,ORD-2",
      ),
    );
  });

  /** A 403 here is a role problem, and must not read as an outage. */
  it("says an operator key is needed when the agent refuses", async () => {
    server.use(
      http.get(`${API}/api/v1/orders/report`, () => new HttpResponse(null, { status: 403 })),
    );
    renderScreen();

    await waitFor(() =>
      expect(document.querySelector('[data-state="operator-required"]')).toBeTruthy(),
    );
  });
});
