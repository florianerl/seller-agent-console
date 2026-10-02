import { beforeEach, describe, expect, it } from "vitest";
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
import { resetWritePolicy } from "../../src/api/policy";

/**
 * Every field the agent's OpenAPI spec offers on the calls the Orders screen
 * makes, checked on the wire. These were the ones the screen left out until
 * they were compared against openapi.json: transition and creation
 * `metadata`, change-request `old_value` and multiple diffs, the audit's
 * `actor` / `from_date` / `to_date`, and the GAM delivery window. The
 * report's date range is the one left out on purpose (see OrdersReporting).
 */

const ORDER = {
  order_id: "ORD-ABC123",
  status: "booked",
  deal_id: "DEMO-1",
  quote_id: null,
  created_at: "2026-09-15T09:00:00Z",
  metadata: { source: "test-buyer", creative_id: "cr-001" },
  audit_log: { order_id: "ORD-ABC123", transitions: [] },
};

const AUDIT = {
  order_id: "ORD-ABC123",
  current_status: "booked",
  created_at: "2026-09-15T09:00:00Z",
  transition_count: 2,
  transitions: [
    { from_status: "draft", to_status: "submitted", timestamp: "2026-09-15T09:05:00", actor: "human:anna", reason: "", transition_id: "t1" },
    { from_status: "submitted", to_status: "booked", timestamp: "2026-09-20T09:05:00", actor: "system", reason: "", transition_id: "t2" },
  ],
  change_requests: [],
  change_request_count: 0,
};

const DEAL = {
  deal: {
    deal_id: "DEMO-1",
    deal_type: "PD",
    status: "active",
    quote_id: null,
    product: { product_id: "p1", name: "Homepage takeover" },
    pricing: { final_cpm: { amount_micros: 12_500_000, currency: "USD" }, base_cpm: null, pricing_model: "cpm" },
    terms: { impressions: 250_000, flight_start: "2026-11-01", flight_end: "2026-11-30", guaranteed: false },
    buyer_tier: "agency",
    expires_at: null,
  },
};

function renderScreen() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, compare: sameResult }}>
      <ThemeProvider theme={theme}>
        <CredentialProvider>
          <OrdersScreen />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

async function expand(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Show ORD-ABC123" }));
  return waitFor(() => {
    const el = document.querySelector('[data-block="order-detail"]');
    expect(el).toBeTruthy();
    return el as HTMLElement;
  });
}

/** Every request URL the agent saw, for the query-string checks. */
const seen: URL[] = [];

describe("the Orders screen sends every field the spec offers", () => {
  beforeEach(async () => {
    resetReachability();
    await clearCredential();
    resetWritePolicy();
    await saveCredential({
      baseUrl: API,
      apiKey: "k",
      role: "operator",
      name: "Ad Seller System API",
      reportedVersion: "2.4.2",
      writesEnabled: true,
      actorName: "anna",
    });
    seen.length = 0;
    server.use(
      http.all(`${API}/*`, ({ request }) => {
        seen.push(new URL(request.url));
        return undefined;
      }),
      http.get(`${API}/api/v1/orders`, () => HttpResponse.json({ orders: [ORDER], count: 1 })),
      http.get(`${API}/api/v1/orders/ORD-ABC123/audit`, ({ request }) => {
        const q = new URL(request.url).searchParams;
        // The filter is the agent's; this mimics its prefix match.
        const actor = q.get("actor");
        return HttpResponse.json({
          ...AUDIT,
          transitions: AUDIT.transitions.filter((t) => !actor || t.actor.startsWith(actor)),
        });
      }),
      http.get(`${API}/api/v1/change-requests`, () => HttpResponse.json({ change_requests: [], count: 0 })),
      http.get(`${API}/api/v1/deals`, () => HttpResponse.json({ deals: [DEAL], count: 1, skipped: [] })),
      http.get(`${API}/gam/orders`, () =>
        HttpResponse.json({ orders: [{ id: "9001", name: "Takeover", status: "APPROVED", external_order_id: "DEMO-1" }] }),
      ),
      http.get(`${API}/gam/report`, () => HttpResponse.json({ rows: [] })),
      http.get(`${API}/api/v1/orders/report`, () =>
        HttpResponse.json({ total_orders: 1, status_counts: {}, total_transitions: 2, avg_transitions_per_order: 2, actor_type_counts: {} }),
      ),
    );
  });

  it("stores the GAM order it was checked against, and any typed detail, as transition metadata", async () => {
    const sent: unknown[] = [];
    server.use(
      http.post(`${API}/api/v1/orders/ORD-ABC123/transition`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    const detail = await expand(user);

    await waitFor(() => expect(detail.querySelector('[data-state="gam-checked"]')?.textContent).toMatch(/9001/));
    await user.click(within(detail).getByRole("button", { name: "Add a detail to the move" }));
    await user.type(within(detail).getByLabelText("Name"), "ticket");
    await user.type(within(detail).getByLabelText("Value"), "OPS-42");
    await user.click(detail.querySelector('[data-action="transition-order:completed"]') as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/gam_order_id = 9001/);
    await user.click(within(dialog).getByRole("button", { name: "Record completed" }));

    await waitFor(() =>
      expect(sent).toEqual([
        { to_status: "completed", actor: "human:anna", metadata: { gam_order_id: "9001", ticket: "OPS-42" } },
      ]),
    );
  });

  it("sends each changed field with its current value, filled in from the deal and the order", async () => {
    const sent: Record<string, unknown>[] = [];
    server.use(
      http.post(`${API}/api/v1/change-requests`, async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ change_request_id: "CR-9", status: "pending_approval" });
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    const detail = await expand(user);

    await user.click(await within(detail).findByRole("button", { name: "Request a change" }));
    const rows = () => [...detail.querySelectorAll('[data-row="change"]')] as HTMLElement[];
    // The flight end comes from the deal's terms.
    await waitFor(() => expect(within(rows()[0]!).getByLabelText("Current value")).toHaveValue("2026-11-30"));
    await user.type(within(rows()[0]!).getByLabelText("New value"), "2026-12-02");

    await user.click(within(detail).getByRole("button", { name: "Add another field" }));
    await user.type(within(rows()[1]!).getByLabelText("Field"), "creative_id");
    // The creative comes from the order's own metadata.
    expect(within(rows()[1]!).getByLabelText("Current value")).toHaveValue("cr-001");
    await user.type(within(rows()[1]!).getByLabelText("New value"), "cr-002");

    await user.click(detail.querySelector('[data-action="create-change-request"]') as HTMLElement);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Create request" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      order_id: "ORD-ABC123",
      change_type: "flight_dates",
      requested_by: "human:anna",
      diffs: [
        { field: "flight_end", old_value: "2026-11-30", new_value: "2026-12-02" },
        { field: "creative_id", old_value: "cr-001", new_value: "cr-002" },
      ],
      proposed_values: { flight_end: "2026-12-02", creative_id: "cr-002" },
    });
  });

  it("filters the timeline with the audit's own actor and date parameters, without narrowing the status", async () => {
    const user = userEvent.setup();
    renderScreen();
    const detail = await expand(user);
    await waitFor(() => expect(detail.querySelectorAll('[data-list="transitions"] .MuiStep-root')).toHaveLength(3));

    await user.click(within(detail).getByLabelText("Moved by"));
    await user.click(await screen.findByRole("option", { name: /people/ }));
    const from = within(detail).getByLabelText("From");
    await user.type(from, "2026-09-01");

    await waitFor(() => {
      const q = seen.filter((u) => u.pathname.endsWith("/audit")).at(-1)!.searchParams;
      expect(q.get("actor")).toBe("human");
      expect(q.get("from_date")).toBe("2026-09-01");
    });
    await waitFor(() =>
      expect(detail.querySelector('[data-state="timeline-filtered"]')?.textContent).toMatch(/1 move of 2/),
    );
    // Next steps still come from the full audit: the order is booked.
    expect(detail.querySelector('[data-action="transition-order:completed"]')).toBeTruthy();
  });

  // The spec offers from_date / to_date, but upstream ranges only the
  // orders and never the change requests, so the card does not offer them.
  it("reads the totals over every order, unranged", async () => {
    renderScreen();
    await waitFor(() => expect(seen.some((u) => u.pathname.endsWith("/orders/report"))).toBe(true));
    const q = seen.find((u) => u.pathname.endsWith("/orders/report"))!.searchParams;
    expect(q.has("from_date") || q.has("to_date")).toBe(false);
    expect(document.querySelector('[data-card="orders-report"] input[type="date"]')).toBeNull();
  });

  it("asks GAM for the delivery window chosen", async () => {
    const user = userEvent.setup();
    renderScreen();
    const detail = await expand(user);
    await waitFor(() => expect(seen.some((u) => u.pathname === "/gam/report")).toBe(true));
    expect(seen.find((u) => u.pathname === "/gam/report")!.searchParams.get("days")).toBe("30");

    await user.click(within(detail).getByLabelText("Window"));
    await user.click(await screen.findByRole("option", { name: "last 90 days" }));

    await waitFor(() =>
      expect(seen.filter((u) => u.pathname === "/gam/report").at(-1)!.searchParams.get("days")).toBe("90"),
    );
  });

  it("creates an order with typed details in its metadata, beside the console's source tag", async () => {
    const sent: unknown[] = [];
    server.use(
      http.post(`${API}/api/v1/orders`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ order_id: "ORD-NEW", status: "draft", deal_id: "", created_at: null });
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "New order" }));
    const wizard = await screen.findByRole("dialog");
    await user.click(within(wizard).getByRole("radio", { name: /With no deal yet/ }));
    await user.click(within(wizard).getByRole("button", { name: "Next" }));
    await user.click(within(wizard).getByRole("button", { name: "Add a detail" }));
    await user.type(within(wizard).getByLabelText("Name"), "io_number");
    await user.type(within(wizard).getByLabelText("Value"), "IO-7");
    await user.click(within(wizard).getByRole("button", { name: "Next" }));
    expect(wizard.textContent).toMatch(/io_number/);
    await user.click(within(wizard).getByRole("button", { name: "Create order" }));

    await waitFor(() => expect(sent).toEqual([{ metadata: { io_number: "IO-7", source: "seller-console" } }]));
  });
});
