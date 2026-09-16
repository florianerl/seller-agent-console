import { beforeEach, describe, expect, it } from "vitest";
import { render, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import { HealthCards } from "../../src/screens/HealthCards";
import { CredentialProvider } from "../../src/credentials/context";
import { saveCredential, clearCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";

const CREDENTIAL = {
  baseUrl: API,
  apiKey: "k-operator",
  role: "operator" as const,
  name: "Ad Seller System API",
  reportedVersion: "2.4.2",
};

/** Every card healthy; individual tests override one handler at a time. */
function allHealthy() {
  return [
    http.get(`${API}/health`, () => HttpResponse.json({ status: "healthy" })),
    http.get(API, () => HttpResponse.json({ name: "Ad Seller System API", version: "2.4.2" })),
    http.get(`${API}/auth/api-keys`, () => HttpResponse.json({ keys: [] })),
    http.get(`${API}/api/v1/inventory-sync/status`, () =>
      HttpResponse.json({
        enabled: true,
        last_sync: "2026-09-16T10:00:00Z",
        sync_count: 4,
        task_running: false,
      }),
    ),
    http.get(`${API}/events`, () =>
      HttpResponse.json({
        events: [{ event_type: "deal.created", timestamp: "2026-09-16T12:00:00Z" }],
      }),
    ),
  ];
}

function renderCards() {
  return render(
    // provider: () => new Map() gives each test its own cache.
    <SWRConfig
      value={{
        provider: () => new Map(),
        shouldRetryOnError: false,
        dedupingInterval: 0,
        // SWR throttles focus revalidation to once per 5 s by default, which
        // would swallow the forced re-poll below.
        focusThrottleInterval: 0,
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

const card = (name: string) => document.querySelector(`[data-card="${name}"]`) as HTMLElement;
const stateOf = (name: string) => card(name)?.getAttribute("data-state");

async function waitForCards() {
  await waitFor(() => expect(stateOf("agent")).toBe("live"), { timeout: 3000 });
}

describe("the four health cards", () => {
  beforeEach(async () => {
    await clearCredential();
    await saveCredential(CREDENTIAL);
    server.use(...allHealthy());
  });

  it("renders all four live when the agent is healthy", async () => {
    renderCards();
    await waitForCards();

    for (const name of ["agent", "access", "sync", "events"]) {
      await waitFor(() => expect(stateOf(name)).toBe("live"));
    }
  });

  it("shows the agent status, name and reported version", async () => {
    renderCards();
    await waitForCards();

    const agent = card("agent");
    expect(within(agent).getByText("healthy")).toBeInTheDocument();
    expect(within(agent).getByText("Ad Seller System API")).toBeInTheDocument();
    // Never labelled plain "version": the upstream literal has already drifted.
    expect(within(agent).getByText(/reported version 2\.4\.2/)).toBeInTheDocument();
  });

  it("stamps every card with a time", async () => {
    renderCards();
    await waitForCards();
    expect(within(card("agent")).getByText(/^as of \d/)).toBeInTheDocument();
  });

  // The whole point of the taxonomy.
  it("degrades one card without touching the other three", async () => {
    server.use(
      http.get(`${API}/api/v1/inventory-sync/status`, () => new HttpResponse(null, { status: 500 })),
    );
    renderCards();
    await waitForCards();

    await waitFor(() => expect(stateOf("sync")).toBe("empty"));
    expect(stateOf("agent")).toBe("live");
    expect(stateOf("access")).toBe("live");
    expect(stateOf("events")).toBe("live");
  });

  it("degrades only the operator-gated card under a buyer key", async () => {
    server.use(http.get(`${API}/events`, () => new HttpResponse(null, { status: 403 })));
    renderCards();
    await waitForCards();

    await waitFor(() => expect(stateOf("events")).toBe("blocked"));
    expect(stateOf("agent")).toBe("live");
    expect(stateOf("sync")).toBe("live");
  });

  it("reports a changed upstream field as one degraded card, not a crash", async () => {
    server.use(
      http.get(`${API}/api/v1/inventory-sync/status`, () =>
        // `enabled` renamed upstream. TypeScript cannot catch this.
        HttpResponse.json({ is_enabled: true, last_sync: null, sync_count: 0 }),
      ),
    );
    renderCards();
    await waitForCards();

    await waitFor(() =>
      expect(within(card("sync")).getByText(/unexpected response shape/i)).toBeInTheDocument(),
    );
    expect(stateOf("agent")).toBe("live");
  });

  it("reports an HTML error page as one degraded card", async () => {
    server.use(
      http.get(
        `${API}/health`,
        () =>
          new HttpResponse("<html>502</html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
      ),
    );
    renderCards();

    await waitFor(() =>
      expect(within(card("agent")).getByText(/was not JSON/i)).toBeInTheDocument(),
    );
    expect(stateOf("sync")).toBe("live");
  });

  it("says no events yet rather than showing an empty card", async () => {
    server.use(http.get(`${API}/events`, () => HttpResponse.json({ events: [] })));
    renderCards();
    await waitForCards();

    await waitFor(() =>
      expect(within(card("events")).getByText(/no events yet/i)).toBeInTheDocument(),
    );
  });

  it("does not render a value without a timestamp", async () => {
    renderCards();
    await waitForCards();

    for (const name of ["agent", "access", "sync", "events"]) {
      const caption = card(name).querySelector("[data-freshness]");
      expect(caption?.textContent ?? "", `${name} rendered without a caption`).not.toBe("");
    }
  });
});
