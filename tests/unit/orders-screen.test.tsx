import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import OrdersScreen from "../../src/screens/Orders";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetReachability } from "../../src/query/reachability";

const ORDERS = [
  {
    order_id: "ORD-ABC123",
    status: "pending_approval",
    deal_id: "deal-1",
    created_at: "2026-09-15T09:00:00Z",
    audit_log: { order_id: "ORD-ABC123", transitions: [] },
  },
  {
    order_id: "ORD-DEF456",
    status: "approved",
    deal_id: "deal-2",
    created_at: "2026-09-16T09:00:00Z",
    audit_log: { order_id: "ORD-DEF456", transitions: [] },
  },
];

const AUDIT = {
  order_id: "ORD-ABC123",
  current_status: "pending_approval",
  created_at: "2026-09-15T09:00:00Z",
  transition_count: 2,
  transitions: [
    {
      from_status: "draft",
      to_status: "submitted",
      timestamp: "2026-09-15T09:05:00Z",
      actor: "agent:buyer-7",
      reason: "",
      transition_id: "t1",
    },
    {
      from_status: "submitted",
      to_status: "pending_approval",
      timestamp: "2026-09-15T09:06:00Z",
      actor: "system",
      reason: "gate: budget over threshold",
      transition_id: "t2",
    },
  ],
  change_requests: [],
  change_request_count: 0,
};

function renderScreen() {
  return render(
    <SWRConfig
      value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, compare: sameResult }}
    >
      <ThemeProvider theme={theme}>
        <CredentialProvider>
          <OrdersScreen />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

describe("the orders screen", () => {
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
      http.get(`${API}/api/v1/orders`, () =>
        HttpResponse.json({ orders: ORDERS, count: ORDERS.length }),
      ),
      http.get(`${API}/api/v1/orders/ORD-ABC123/audit`, () => HttpResponse.json(AUDIT)),
    );
  });

  it("lists orders with their status", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("ORD-ABC123")).toBeInTheDocument());

    expect(document.querySelector('[data-status="pending_approval"]')).toBeTruthy();
    expect(document.querySelector('[data-status="approved"]')).toBeTruthy();
  });

  // Colour must never be the only signal.
  it("spells the status out in words, not only in colour", () => {
    renderScreen();
    return waitFor(() => {
      const chip = document.querySelector('[data-status="pending_approval"]');
      expect(chip?.textContent).toMatch(/pending approval/);
    });
  });

  it("filters by status and asks the agent for it", async () => {
    const seen: URL[] = [];
    server.use(
      http.get(`${API}/api/v1/orders`, ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json({ orders: [ORDERS[1]], count: 1 });
      }),
    );

    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen[0]!.searchParams.has("status")).toBe(false);

    await user.click(screen.getByLabelText("Status"));
    await user.click(await screen.findByRole("option", { name: "approved" }));

    await waitFor(() =>
      expect(seen[seen.length - 1]!.searchParams.get("status")).toBe("approved"),
    );
  });

  it("shows the transition history on demand", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("ORD-ABC123")).toBeInTheDocument());

    const row = screen.getByText("ORD-ABC123").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "History" }));

    const list = await waitFor(() => {
      const el = document.querySelector('[data-list="transitions"]');
      expect(el).toBeTruthy();
      return el!;
    });

    expect(list.textContent).toContain("submitted");
    expect(list.textContent).toContain("pending approval");
    expect(list.textContent).toContain("agent:buyer-7");
    expect(list.textContent).toContain("gate: budget over threshold");
  });

  it("distinguishes an empty filter result from no orders at all", async () => {
    server.use(http.get(`${API}/api/v1/orders`, () => HttpResponse.json({ orders: [], count: 0 })));
    renderScreen();

    await waitFor(() =>
      expect(document.querySelector('[data-state="empty"]')?.textContent).toMatch(/no orders yet/i),
    );
  });

  it("says an order has no transitions rather than showing an error", async () => {
    server.use(
      http.get(`${API}/api/v1/orders/ORD-ABC123/audit`, () =>
        HttpResponse.json({ ...AUDIT, transitions: [], transition_count: 0 }),
      ),
    );

    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("ORD-ABC123")).toBeInTheDocument());

    const row = screen.getByText("ORD-ABC123").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "History" }));

    await waitFor(() =>
      expect(document.querySelector('[data-state="no-transitions"]')).toBeTruthy(),
    );
    expect(document.querySelector('[data-state="no-change-requests"]')).toBeTruthy();
  });

  it("degrades the list without crashing when a field changes upstream", async () => {
    server.use(
      http.get(`${API}/api/v1/orders`, () =>
        // order_id renamed upstream.
        HttpResponse.json({ orders: [{ id: "ORD-X", status: "draft" }], count: 1 }),
      ),
    );
    renderScreen();

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/unexpected response shape/i),
    );
  });

  it("renders no React key warnings", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    renderScreen();
    await waitFor(() => expect(screen.getByText("ORD-ABC123")).toBeInTheDocument());

    const keyWarnings = warn.mock.calls.filter((c) => String(c[0]).includes("unique \"key\""));
    expect(keyWarnings).toEqual([]);
    warn.mockRestore();
  });
});
