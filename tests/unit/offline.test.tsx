import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { API, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import { ConnectivityBanner } from "../../src/shell/ConnectivityBanner";
import { CredentialProvider } from "../../src/credentials/context";
import { QueryProvider } from "../../src/query/provider";
import { HealthCards } from "../../src/screens/HealthCards";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { reportResult, resetReachability } from "../../src/query/reachability";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

describe("the connectivity banner", () => {
  beforeEach(() => resetReachability());
  afterEach(() => setOnline(true));

  it("says nothing when everything is fine", () => {
    setOnline(true);
    render(<ConnectivityBanner />);
    expect(document.querySelector("[data-banner]")).toBeNull();
  });

  it("reports a lost network connection", () => {
    setOnline(false);
    render(<ConnectivityBanner />);
    expect(document.querySelector('[data-banner="offline"]')).toBeTruthy();
  });

  // Distinct messages, because they call for different actions: check your
  // wifi, versus check whether the agent is up.
  it("distinguishes an unreachable agent from a lost connection", () => {
    setOnline(true);
    for (const name of ["health", "events", "sync"]) reportResult(name, true);

    render(<ConnectivityBanner />);
    const banner = document.querySelector('[data-banner="unreachable"]');
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toMatch(/seller agent/i);
    expect(document.querySelector('[data-banner="offline"]')).toBeNull();
  });

  // navigator.onLine is true behind a captive portal, so the network message
  // takes precedence only when the browser is certain.
  it("prefers the network message when the browser reports offline", () => {
    setOnline(false);
    for (const name of ["health", "events", "sync"]) reportResult(name, true);

    render(<ConnectivityBanner />);
    expect(document.querySelector('[data-banner="offline"]')).toBeTruthy();
    expect(document.querySelector('[data-banner="unreachable"]')).toBeNull();
  });
});

const CREDENTIAL = {
  baseUrl: API,
  apiKey: "k-operator",
  role: "operator" as const,
  name: "Ad Seller System API",
  reportedVersion: "2.4.2",
};

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CredentialProvider>
        <QueryProvider>
          <HealthCards />
        </QueryProvider>
      </CredentialProvider>
    </ThemeProvider>
  );
}

describe("values survive a reload", () => {
  beforeEach(async () => {
    resetReachability();
    await clearCredential();
    await saveCredential(CREDENTIAL);

    server.use(
      http.get(`${API}/health`, () => HttpResponse.json({ status: "healthy" })),
      http.get(API, () => HttpResponse.json({ name: "Ad Seller System API", version: "2.4.2" })),
      http.get(`${API}/auth/api-keys`, () => HttpResponse.json({ keys: [] })),
      http.get(`${API}/events`, () => HttpResponse.json({ events: [] })),
      http.get(`${API}/api/v1/inventory-sync/status`, () =>
        HttpResponse.json({
          enabled: true,
          last_sync: "2026-09-16T10:00:00Z",
          sync_count: 7,
          task_running: false,
        }),
      ),
    );
  });

  it("restores last-known values, with their timestamps, after a remount", async () => {
    const first = render(<App />);
    await waitFor(() =>
      expect(within(document.querySelector('[data-card="sync"]')!).getByText(/7 runs/)).toBeInTheDocument(),
    );

    const asOf = document
      .querySelector('[data-card="sync"] [data-freshness]')!
      .textContent;

    // Simulate the page going away, which is when the cache is written.
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    first.unmount();

    // The agent is now unreachable, so anything on screen must come from cache.
    server.use(
      http.get(`${API}/api/v1/inventory-sync/status`, () => HttpResponse.error()),
    );
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    render(<App />);

    await waitFor(() =>
      expect(within(document.querySelector('[data-card="sync"]')!).getByText(/7 runs/)).toBeInTheDocument(),
    );
    // And it must say it is old rather than pretending to be current.
    await waitFor(() =>
      expect(document.querySelector('[data-card="sync"]')?.getAttribute("data-state")).toBe("stale"),
    );
    expect(asOf).toMatch(/as of/);
  });
});
