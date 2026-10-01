import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API, recordRequests, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import OrdersScreen from "../../src/screens/Orders";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetReachability } from "../../src/query/reachability";
import { resetWritePolicy } from "../../src/api/policy";
import { ORDER_STATUSES } from "../../src/api/vocabulary";

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

async function connect({
  writesEnabled = false,
  role = "operator",
}: { writesEnabled?: boolean; role?: "operator" | "buyer" } = {}) {
  await clearCredential();
  resetWritePolicy();
  await saveCredential({
    baseUrl: API,
    apiKey: "k",
    role,
    name: "Ad Seller System API",
    reportedVersion: "2.4.2",
    writesEnabled,
  });
}

async function expand(user: ReturnType<typeof userEvent.setup>, orderId: string) {
  await user.click(await screen.findByRole("button", { name: `Show ${orderId}` }));
  return waitFor(() => {
    const el = document.querySelector('[data-block="order-detail"]');
    expect(el).toBeTruthy();
    return el as HTMLElement;
  });
}

function transitionButtons(): string[] {
  return [...document.querySelectorAll('[data-block="order-transitions"] [data-action^="transition-order:"]')].map(
    (el) => el.getAttribute("data-action")!.replace("transition-order:", ""),
  );
}

describe("the orders screen", () => {
  beforeEach(async () => {
    resetReachability();
    await connect();
    server.use(
      http.get(`${API}/api/v1/change-requests`, () =>
        HttpResponse.json({ change_requests: [], count: 0 }),
      ),
      http.get(`${API}/api/v1/orders`, () =>
        HttpResponse.json({ orders: ORDERS, count: ORDERS.length }),
      ),
      http.get(`${API}/api/v1/orders/ORD-ABC123/audit`, () => HttpResponse.json(AUDIT)),
    );
  });

  describe("price and terms", () => {
    const DEAL = {
      deal_id: "deal-1",
      deal_type: "PD",
      status: "booked",
      product: { product_id: "p", name: "Homepage takeover" },
      pricing: { final_cpm: { amount_micros: 10_800_000, currency: "USD" }, pricing_model: "cpm" },
      terms: { impressions: 500000, flight_start: "2026-10-01", flight_end: "2026-10-31", guaranteed: false },
      buyer_tier: "agency",
    };

    // Counted on their own handlers: a catch-all recorder never sees a
    // request a more specific handler answered first.
    function agent(order: Record<string, unknown>, listed: unknown[] = [{ deal: DEAL }]) {
      const calls = { list: 0, single: 0, quote: 0 };
      server.use(
        http.get(`${API}/api/v1/orders`, () =>
          HttpResponse.json({ orders: [{ ...ORDERS[0], ...order }], count: 1 }),
        ),
        http.get(`${API}/api/v1/deals`, () => {
          calls.list += 1;
          return HttpResponse.json({ deals: listed, count: listed.length, skipped: [] });
        }),
        http.get(`${API}/api/v1/deals/:id`, () => {
          calls.single += 1;
          return HttpResponse.json({ deal: DEAL });
        }),
        http.get(`${API}/api/v1/quotes/:id`, () => {
          calls.quote += 1;
          return HttpResponse.json({ detail: "x" }, { status: 404 });
        }),
      );
      return calls;
    }

    async function card(user: ReturnType<typeof userEvent.setup>) {
      renderScreen();
      await expand(user, "ORD-ABC123");
      return waitFor(() => {
        const el = document.querySelector<HTMLElement>('[data-block="terms"]');
        expect(el).toBeTruthy();
        return el!;
      });
    }

    it("reads them from the deal list when the row opens, never from the single-deal route", async () => {
      const calls = agent({ quote_id: "qt-abc123" });
      const user = userEvent.setup();
      const el = await card(user);

      expect(await within(el).findByText("Homepage takeover")).toBeInTheDocument();
      expect(within(el).getByText("$10.80")).toBeInTheDocument();
      expect(within(el).getByText("500,000")).toBeInTheDocument();
      expect(el.querySelector('[data-freshness="live"]')?.textContent).toMatch(/as of/);
      expect(calls).toEqual({ list: 1, single: 0, quote: 0 });

      // The list is a full scan: read again only from the card's reload.
      await user.click(within(el).getByRole("button", { name: "Reload price and terms" }));
      await waitFor(() => expect(calls.list).toBe(2));
      expect(calls.single).toBe(0);
    });

    it("offers the quote when the deal is not in the list", async () => {
      const calls = agent({ quote_id: "qt-abc123" }, []);
      const user = userEvent.setup();
      const el = await card(user);

      await waitFor(() => expect(el.querySelector('[data-state="deal-missing"]')).toBeTruthy());
      expect(el.querySelector('[data-block="quote-fallback"]')).toBeTruthy();
      expect(calls.quote).toBe(0);
    });

    it("goes straight to the quote for an order with no deal", async () => {
      const calls = agent({ deal_id: null, quote_id: "qt-abc123" });
      const user = userEvent.setup();
      const el = await card(user);

      expect(within(el).queryByRole("button", { name: "Show price and terms" })).toBeNull();
      expect(within(el).getByRole("button", { name: "Show quote" })).toBeInTheDocument();
      expect(calls).toEqual({ list: 0, single: 0, quote: 0 });
    });

    it("has no card for an order with neither", async () => {
      agent({ deal_id: null, quote_id: null });
      const user = userEvent.setup();
      renderScreen();
      await expand(user, "ORD-ABC123");
      await waitFor(() => expect(document.querySelector('[data-block="record"]')).toBeTruthy());
      expect(document.querySelector('[data-block="terms"]')).toBeNull();
    });
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

  // Upstream scans every order whatever the filter, and the summary needs
  // them all, so the list is read once and filtered here.
  it("filters by status without asking the agent again", async () => {
    const seen: URL[] = [];
    server.use(
      http.get(`${API}/api/v1/orders`, ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json({ orders: ORDERS, count: ORDERS.length });
      }),
    );

    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("ORD-ABC123")).toBeInTheDocument());

    await user.click(screen.getByLabelText("Status"));
    // Every upstream status is offered, not a hand-picked few.
    const offered = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(offered).toEqual(["Any status", ...ORDER_STATUSES.map((o) => o.label)]);
    await user.click(screen.getByRole("option", { name: "approved" }));

    await waitFor(() => expect(screen.queryByText("ORD-ABC123")).toBeNull());
    expect(screen.getByText("ORD-DEF456")).toBeInTheDocument();
    expect(seen.every((u) => !u.searchParams.has("status"))).toBe(true);
  });

  it("counts orders by stage, and filters by a stage when its chip is pressed", async () => {
    const user = userEvent.setup();
    renderScreen();
    const summary = await waitFor(() => {
      const el = document.querySelector('[data-block="stage-summary"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });

    const count = (id: string) =>
      summary.querySelector(`[data-chip="${id}"] [data-count]`)?.getAttribute("data-count");
    expect(count("approval")).toBe("1");
    expect(count("execution")).toBe("1");
    expect(count("closed")).toBe("0");
    // An order waiting on the seller is marked as such, not only counted.
    expect(summary.querySelector('[data-chip="approval"]')).toHaveAttribute("data-attention", "true");
    expect(summary.querySelector('[data-chip="execution"]')).not.toHaveAttribute("data-attention");

    await user.click(summary.querySelector('[data-chip="approval"]') as HTMLElement);
    await waitFor(() => expect(screen.queryByText("ORD-DEF456")).toBeNull());
    expect(screen.getByText("ORD-ABC123")).toBeInTheDocument();
    expect(summary.querySelector('[data-chip="approval"]')).toHaveAttribute("aria-pressed", "true");
  });

  it("says in the list how long each order has sat, and where it came from", async () => {
    server.use(
      http.get(`${API}/api/v1/orders`, () =>
        HttpResponse.json({
          orders: [
            {
              ...ORDERS[0],
              metadata: { source: "test-buyer", persona: "advertiser" },
              audit_log: {
                transitions: [
                  {
                    from_status: "submitted",
                    to_status: "pending_approval",
                    timestamp: new Date(Date.now() - 3 * 3_600_000).toISOString().replace("Z", ""),
                    actor: "system",
                    reason: "",
                  },
                ],
              },
            },
            ORDERS[1],
          ],
          count: 2,
        }),
      ),
    );
    renderScreen();
    await waitFor(() => expect(screen.getByText("ORD-ABC123")).toBeInTheDocument());

    const row = (id: string) => screen.getByText(id).closest("tr")!;
    expect(row("ORD-ABC123").querySelector('[data-cell="in-status"]')?.textContent).toBe("for 3 h");
    expect(row("ORD-ABC123").querySelector('[data-cell="source"]')?.textContent).toBe(
      "test-buyer (advertiser)",
    );
    expect(row("ORD-DEF456").querySelector('[data-cell="source"]')?.textContent).toBe("not recorded");
  });

  it("shows the transition history when a row is opened", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("ORD-ABC123")).toBeInTheDocument());

    await expand(user, "ORD-ABC123");

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

    await expand(user, "ORD-ABC123");

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

  it("says in the list what each order needs next", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("ORD-ABC123")).toBeInTheDocument());

    const cell = (id: string) =>
      screen.getByText(id).closest("tr")!.querySelector('[data-cell="next-step"]')!.textContent;
    expect(cell("ORD-ABC123")).toBe("Approve");
    expect(cell("ORD-DEF456")).toBe("Record execution started");
  });

  it("offers only the moves the state machine allows from the current status", async () => {
    await connect({ writesEnabled: true });
    const user = userEvent.setup();
    renderScreen();
    const detail = await expand(user, "ORD-ABC123");

    await waitFor(() => expect(transitionButtons().length).toBeGreaterThan(0));
    // pending_approval → approved | rejected | cancelled, forward move first.
    expect(transitionButtons()).toEqual(["approved", "rejected", "cancelled"]);
    expect(within(detail).getByText(/waiting for a human decision/i)).toBeInTheDocument();
    // No approval queue lists orders; the screen has to say so.
    // Held in an (i) whose accessible name is the explanation itself.
    expect(detail.querySelector('[data-block="moved-by"]')?.getAttribute("aria-label")).toMatch(/no approval queue/i);
    const map = detail.querySelector('[data-block="state-map"]')!;
    expect(map.querySelector('[data-node="current"]')?.getAttribute("data-state-node")).toBe("pending_approval");
    expect([...map.querySelectorAll('[data-node="next"]')].map((n) => n.getAttribute("data-state-node")).sort()).toEqual(
      ["approved", "cancelled", "rejected"],
    );
    // Visited, from the audit: draft → submitted → pending approval.
    expect([...map.querySelectorAll('[data-node="visited"]')].map((n) => n.getAttribute("data-state-node")).sort()).toEqual(
      ["draft", "submitted"],
    );
  });

  it("offers nothing from a terminal status", async () => {
    await connect({ writesEnabled: true });
    server.use(
      http.get(`${API}/api/v1/orders/ORD-ABC123/audit`, () =>
        HttpResponse.json({ ...AUDIT, current_status: "completed" }),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");

    await waitFor(() =>
      expect(document.querySelector('[data-state="no-next-step"]')).toBeTruthy(),
    );
    expect(transitionButtons()).toEqual([]);
  });

  it("derives the moves from the audit, and says so when the list is behind", async () => {
    await connect({ writesEnabled: true });
    server.use(
      http.get(`${API}/api/v1/orders/ORD-ABC123/audit`, () =>
        HttpResponse.json({ ...AUDIT, current_status: "approved" }),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    const detail = await expand(user, "ORD-ABC123");

    await waitFor(() => expect(transitionButtons()).toEqual(["in_progress", "cancelled"]));
    expect(detail.textContent).toMatch(/the list still shows pending approval/i);
  });

  it("keeps the moves disabled, and sends nothing, while writes are off", async () => {
    const user = userEvent.setup();
    const recorder = recordRequests();
    server.use(
      http.get(`${API}/api/v1/orders`, () => HttpResponse.json({ orders: ORDERS, count: 2 })),
      http.get(`${API}/api/v1/orders/ORD-ABC123/audit`, () => HttpResponse.json(AUDIT)),
      http.get(`${API}/api/v1/change-requests`, () =>
        HttpResponse.json({ change_requests: [], count: 0 }),
      ),
    );
    renderScreen();
    await expand(user, "ORD-ABC123");
    await waitFor(() => expect(transitionButtons().length).toBeGreaterThan(0));

    for (const el of document.querySelectorAll('[data-action^="transition-order:"]')) {
      expect(el).toBeDisabled();
    }
    expect(document.querySelector('[data-note="read-only"]')).toBeTruthy();
    expect(recorder.seen.filter((line) => !line.startsWith("GET "))).toEqual([]);
  });

  it("tells a buyer key that moving an order needs an operator key", async () => {
    await connect({ writesEnabled: true, role: "buyer" });
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");

    await waitFor(() =>
      expect(document.querySelector('[data-state="operator-only"]')).toBeTruthy(),
    );
    expect(transitionButtons()).toEqual([]);
  });

  it("needs a name before a human move, then sends the move with the claimed actor", async () => {
    await connect({ writesEnabled: true });
    const sent: unknown[] = [];
    server.use(
      http.post(`${API}/api/v1/orders/ORD-ABC123/transition`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ order_id: "ORD-ABC123", status: "approved", allowed_next: [] });
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");
    await waitFor(() => expect(transitionButtons().length).toBeGreaterThan(0));

    const approve = document.querySelector('[data-action="transition-order:approved"]') as HTMLElement;
    expect(approve).toBeDisabled();

    await user.type(screen.getByLabelText("Your name or id"), "ops-anna");
    await user.type(screen.getByLabelText("Reason (optional)"), "budget signed off");
    expect(approve).toBeEnabled();
    await user.click(approve);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/from pending approval to approved/);
    expect(dialog.textContent).toMatch(/human:ops-anna/);
    expect(dialog.textContent).toMatch(/Human approved/);
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      to_status: "approved",
      actor: "human:ops-anna",
      reason: "budget signed off",
    });
    await waitFor(() =>
      expect(document.querySelector('[data-block="order-transitions"] [data-state="write-ok"]')).toBeTruthy(),
    );
  });

  it("sends system as the actor without asking for a name", async () => {
    await connect({ writesEnabled: true });
    const sent: unknown[] = [];
    server.use(
      http.post(`${API}/api/v1/orders/ORD-ABC123/transition`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");
    await waitFor(() => expect(transitionButtons().length).toBeGreaterThan(0));

    await user.click(screen.getByLabelText("Acting as"));
    await user.click(await screen.findByRole("option", { name: "system" }));
    expect(screen.queryByLabelText("Your name or id")).toBeNull();

    await user.click(document.querySelector('[data-action="transition-order:rejected"]') as HTMLElement);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Reject" }));

    await waitFor(() => expect(sent).toEqual([{ to_status: "rejected", actor: "system" }]));
  });

  it("says the order moved, and re-reads it, when the agent refuses a stale move", async () => {
    await connect({ writesEnabled: true });
    let audits = 0;
    server.use(
      http.get(`${API}/api/v1/orders/ORD-ABC123/audit`, () => {
        audits += 1;
        return HttpResponse.json(AUDIT);
      }),
      http.post(`${API}/api/v1/orders/ORD-ABC123/transition`, () =>
        HttpResponse.json(
          { detail: { error: "invalid_transition", allowed_transitions: ["draft"] } },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");
    await waitFor(() => expect(transitionButtons().length).toBeGreaterThan(0));
    const before = audits;

    await user.click(screen.getByLabelText("Acting as"));
    await user.click(await screen.findByRole("option", { name: "system" }));
    await user.click(document.querySelector('[data-action="transition-order:approved"]') as HTMLElement);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(document.querySelector('[data-state="order-moved"]')).toBeTruthy());
    await waitFor(() => expect(audits).toBeGreaterThan(before));
  });

  it("lists the order's change requests from the change-requests route", async () => {
    const seen: URL[] = [];
    server.use(
      http.get(`${API}/api/v1/change-requests`, ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json({
          change_requests: [
            {
              change_request_id: "CR-1",
              order_id: "ORD-ABC123",
              change_type: "flight_dates",
              status: "pending_approval",
              diffs: [],
              reason: "two more weeks",
              requested_by: "agent:buyer-7",
              requested_at: "2026-09-15T10:00:00Z",
            },
          ],
          count: 1,
        });
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");

    const list = await waitFor(() => {
      const el = document.querySelector('[data-list="change-requests"]');
      expect(el).toBeTruthy();
      return el!;
    });
    // One read of every change request serves the badges and every row.
    expect(seen.every((u) => !u.searchParams.has("order_id"))).toBe(true);
    expect(list.textContent).toContain("CR-1");
    expect(list.textContent).toContain("flight dates");
  });

  it("raises a change request against the open order with a valid change type", async () => {
    await connect({ writesEnabled: true });
    const sent: Record<string, unknown>[] = [];
    server.use(
      http.post(`${API}/api/v1/change-requests`, async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ cr_id: "CR-2" });
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");

    await user.click(await screen.findByRole("button", { name: "Request a change" }));
    await user.click(screen.getByLabelText("Change type"));
    await user.click(await screen.findByRole("option", { name: "pricing" }));
    await user.click(document.querySelector('[data-action="create-change-request"]') as HTMLElement);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Create request" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ order_id: "ORD-ABC123", change_type: "pricing" });
  });

  it("creates a draft and opens it on its next step", async () => {
    await connect({ writesEnabled: true });
    const created = {
      order_id: "ORD-NEW1",
      status: "draft",
      deal_id: "deal-9",
      created_at: "2026-09-28T09:00:00Z",
    };
    let listed: object[] = ORDERS;
    const sent: unknown[] = [];
    server.use(
      http.get(`${API}/api/v1/orders`, () => HttpResponse.json({ orders: listed, count: listed.length })),
      http.post(`${API}/api/v1/orders`, async ({ request }) => {
        sent.push(await request.json());
        listed = [...ORDERS, created];
        return HttpResponse.json(created);
      }),
      http.get(`${API}/api/v1/orders/ORD-NEW1/audit`, () =>
        HttpResponse.json({
          order_id: "ORD-NEW1",
          current_status: "draft",
          created_at: created.created_at,
          transitions: [],
          transition_count: 0,
          change_requests: [],
          change_request_count: 0,
        }),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("ORD-ABC123")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "New order" }));
    const wizard = await screen.findByRole("dialog");
    await user.click(within(wizard).getByRole("radio", { name: /From a quote/ }));
    await user.click(within(wizard).getByRole("button", { name: "Next" }));
    await user.type(within(wizard).getByLabelText("Quote id"), "qt-1");
    await user.type(within(wizard).getByLabelText("Deal id (optional)"), "deal-9");
    await user.click(within(wizard).getByRole("button", { name: "Next" }));
    await user.click(within(wizard).getByRole("button", { name: "Create order" }));

    await waitFor(() =>
      expect(sent).toEqual([{ deal_id: "deal-9", quote_id: "qt-1", metadata: { source: "seller-console" } }]),
    );
    await user.click(await within(wizard).findByRole("button", { name: "Open the order" }));
    await waitFor(() => expect(transitionButtons()).toEqual(["submitted", "cancelled"]));
    // By role, so it has to wait out the wizard's exit, which hides the page meanwhile.
    expect(await screen.findByRole("button", { name: "Hide ORD-NEW1" })).toHaveAttribute(
      "aria-expanded",
      "true",
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

/** A change request as a live agent sends it; see tests/fixtures/change-request.live.json. */
function cr(overrides: Record<string, unknown>) {
  return {
    change_request_id: "CR-1",
    order_id: "ORD-ABC123",
    deal_id: "deal-1",
    change_type: "creative",
    status: "approved",
    severity: "minor",
    diffs: [{ field: "creative_id", old_value: "cr-001", new_value: "cr-002" }],
    proposed_values: { creative_id: "cr-002" },
    reason: "swap to autumn creative",
    requested_by: "test-buyer:advertiser",
    requested_at: "2026-09-15T10:00:00",
    approved_by: "system:auto-approve",
    approved_at: "2026-09-15T10:00:00",
    rejection_reason: "",
    validation_errors: [],
    applied_at: null,
    applied_by: "",
    ...overrides,
  };
}

describe("an order's change requests", () => {
  beforeEach(async () => {
    resetReachability();
    await connect({ writesEnabled: true });
    server.use(
      http.get(`${API}/api/v1/orders`, () => HttpResponse.json({ orders: ORDERS, count: ORDERS.length })),
      http.get(`${API}/api/v1/orders/ORD-ABC123/audit`, () => HttpResponse.json(AUDIT)),
    );
  });

  function serve(...list: Record<string, unknown>[]) {
    server.use(
      http.get(`${API}/api/v1/change-requests`, () =>
        HttpResponse.json({ change_requests: list, count: list.length }),
      ),
    );
  }

  it("badges the order in the list with what is waiting", async () => {
    serve(cr({}), cr({ change_request_id: "CR-2", status: "pending_approval", severity: "critical", change_type: "pricing" }));
    renderScreen();

    await waitFor(() =>
      expect(
        screen.getByText("ORD-ABC123").closest("tr")!.querySelector('[data-cell="changes"]')?.textContent,
      ).toBe("1 to review, 1 to apply"),
    );
    expect(
      document.querySelector('[data-chip="waiting"] [data-count]')?.getAttribute("data-count"),
    ).toBe("2");
  });

  it("says an auto-approved request only needs applying, and applies it", async () => {
    serve(cr({}));
    const applied: string[] = [];
    server.use(
      http.post(`${API}/api/v1/change-requests/CR-1/apply`, () => {
        applied.push("CR-1");
        return HttpResponse.json({ change_request_id: "CR-1", status: "applied", order_id: "ORD-ABC123" });
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");

    const entry = await waitFor(() => {
      const el = document.querySelector('[data-cr="CR-1"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(entry.textContent).toMatch(/approved, not applied yet/i);
    expect(entry.textContent).toMatch(/agent approved it itself/i);
    // Only what an approved request allows: nothing to review, one thing to do.
    expect(entry.querySelector('[data-action="approve"]')).toBeNull();

    await user.click(entry.querySelector('[data-action="apply"]') as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/status does not change/i);
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(applied).toEqual(["CR-1"]));
  });

  it("reviews a request that waits for review, signing with the stored name", async () => {
    await connect({ writesEnabled: true });
    const { saveCredential: save, loadCredential } = await import("../../src/credentials/store");
    await save({ ...(await loadCredential())!, actorName: "anna" });
    serve(cr({ status: "pending_approval", severity: "critical", change_type: "pricing", approved_by: null, approved_at: null }));
    const bodies: unknown[] = [];
    server.use(
      http.post(`${API}/api/v1/change-requests/CR-1/review`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");

    const entry = await waitFor(() => {
      const el = document.querySelector('[data-cr="CR-1"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(entry.textContent).toMatch(/waiting for review/i);
    expect(entry.textContent).toMatch(/no approval queue and no MCP tool/i);

    await user.click(entry.querySelector('[data-action="approve"]') as HTMLElement);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(bodies).toEqual([{ decision: "approve", decided_by: "anna" }]));
  });

  it("says applying a cancellation did not cancel the order, and points at the move that does", async () => {
    let status = "approved";
    const cancellation = () =>
      cr({ change_type: "cancellation", severity: "critical", approved_by: "human:anna", diffs: [], proposed_values: {}, status });
    server.use(
      http.get(`${API}/api/v1/change-requests`, () =>
        HttpResponse.json({ change_requests: [cancellation()], count: 1 }),
      ),
      http.post(`${API}/api/v1/change-requests/CR-1/apply`, () => {
        status = "applied";
        return HttpResponse.json({ status: "applied" });
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");

    const apply = await waitFor(() => {
      const el = document.querySelector('[data-cr="CR-1"] [data-action="apply"]');
      expect(el).toBeEnabled();
      return el as HTMLElement;
    });
    await user.click(apply);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/does not cancel the order/i);
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));

    const note = await waitFor(() => {
      const el = document.querySelector('[data-state="cancel-prompt"]');
      expect(el).toBeTruthy();
      return el!;
    });
    expect(note.textContent).toMatch(/still pending approval/);
    expect(note.textContent).toMatch(/Cancel order/);
  });

  it("shows what applied requests wrote onto the order", async () => {
    serve(cr({ status: "applied", applied_at: "2026-09-15T11:00:00", applied_by: "system" }));
    server.use(
      http.get(`${API}/api/v1/orders`, () =>
        HttpResponse.json({
          orders: [
            {
              ...ORDERS[0],
              metadata: { source: "test-buyer", creative_id: "cr-002", _changed_creative_id: "cr-002" },
            },
          ],
          count: 1,
        }),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");

    const applied = await waitFor(() => {
      const el = document.querySelector('[data-list="applied-values"]');
      expect(el?.textContent).toMatch(/cr-002/);
      return el!;
    });
    expect(applied.textContent).toMatch(/from CR-1/);
    expect(applied.textContent).toMatch(/changed creative_id/);
  });

  it("does not offer a change request the agent would refuse", async () => {
    serve();
    server.use(
      http.get(`${API}/api/v1/orders`, () =>
        HttpResponse.json({ orders: [{ ...ORDERS[0], deal_id: "" }], count: 1 }),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");

    await user.click(await screen.findByRole("button", { name: "Request a change" }));
    await waitFor(() =>
      expect(document.querySelector('[data-state="change-refused"]')?.textContent).toMatch(/no deal attached/),
    );
    expect(document.querySelector('[data-action="create-change-request"]')).toBeNull();
  });

  // Suggestions, not a closed list: the agent merges whatever key it is sent.
  it("suggests the fields for the change type but still takes a typed one", async () => {
    serve();
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");

    await user.click(await screen.findByRole("button", { name: "Request a change" }));
    const field = screen.getByLabelText("Field");
    expect(field).toHaveValue("flight_end");

    await user.click(field);
    expect(await screen.findByRole("option", { name: "flight_start" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "flight_start" }));
    expect(field).toHaveValue("flight_start");

    await user.clear(field);
    await user.type(field, "po_number");
    expect(field).toHaveValue("po_number");
  });

  it("predicts the severity, sends the field change, and says what happens next", async () => {
    serve();
    const sent: Record<string, unknown>[] = [];
    server.use(
      http.post(`${API}/api/v1/change-requests`, async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(cr({ change_request_id: "CR-9" }));
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");

    await user.click(await screen.findByRole("button", { name: "Request a change" }));
    await user.click(screen.getByLabelText("Change type"));
    await user.click(await screen.findByRole("option", { name: "creative" }));
    expect(document.querySelector('[data-note="severity"]')?.textContent).toMatch(/minor.*auto-approved/i);
    expect(screen.getByLabelText("Field")).toHaveValue("creative_id");
    await user.type(screen.getByLabelText("New value"), "cr-777");
    await user.click(document.querySelector('[data-action="create-change-request"]') as HTMLElement);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Create request" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      order_id: "ORD-ABC123",
      change_type: "creative",
      diffs: [{ field: "creative_id", new_value: "cr-777" }],
      proposed_values: { creative_id: "cr-777" },
    });
    await waitFor(() =>
      expect(document.querySelector('[data-state="change-created"]')?.textContent).toMatch(/CR-9: auto-approved/),
    );
  });

  it("lists why the agent refused a change request at validation", async () => {
    serve();
    server.use(
      http.post(`${API}/api/v1/change-requests`, () =>
        HttpResponse.json(
          {
            detail: {
              error: "validation_failed",
              change_request_id: "CR-F",
              validation_errors: ["Impressions must be greater than 0"],
            },
          },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");

    await user.click(await screen.findByRole("button", { name: "Request a change" }));
    await user.click(document.querySelector('[data-action="create-change-request"]') as HTMLElement);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Create request" }));

    await waitFor(() =>
      expect(document.querySelector('[data-state="change-validation-failed"]')?.textContent).toMatch(
        /saved it as a failed request.*greater than 0/,
      ),
    );
  });
});

describe("moving an order, round two", () => {
  beforeEach(async () => {
    resetReachability();
    await connect({ writesEnabled: true });
    server.use(
      http.get(`${API}/api/v1/orders`, () => HttpResponse.json({ orders: ORDERS, count: ORDERS.length })),
      http.get(`${API}/api/v1/orders/ORD-ABC123/audit`, () => HttpResponse.json(AUDIT)),
      http.get(`${API}/api/v1/change-requests`, () => HttpResponse.json({ change_requests: [], count: 0 })),
    );
  });

  it("names the moves the agent allows now when it refuses one", async () => {
    server.use(
      http.post(`${API}/api/v1/orders/ORD-ABC123/transition`, () =>
        HttpResponse.json(
          { detail: { error: "invalid_transition", message: "no", current_status: "approved", allowed_transitions: ["in_progress", "cancelled"] } },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");
    await waitFor(() => expect(transitionButtons().length).toBeGreaterThan(0));

    await user.click(screen.getByLabelText("Acting as"));
    await user.click(await screen.findByRole("option", { name: "system" }));
    await user.click(document.querySelector('[data-action="transition-order:approved"]') as HTMLElement);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(document.querySelector('[data-state="order-moved"]')?.textContent).toMatch(
        /allows in progress, cancelled/,
      ),
    );
  });

  it("remembers the operator's name with the credential", async () => {
    const user = userEvent.setup();
    const first = renderScreen();
    await expand(user, "ORD-ABC123");
    await user.type(await screen.findByLabelText("Your name or id"), "anna");
    await user.tab();

    const { loadCredential } = await import("../../src/credentials/store");
    await waitFor(async () => expect((await loadCredential())?.actorName).toBe("anna"));

    first.unmount();
    renderScreen();
    await expand(user, "ORD-ABC123");
    expect(await screen.findByLabelText("Your name or id")).toHaveValue("anna");
  });

  it("explains that system includes moves made from Claude Code", async () => {
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");

    await waitFor(() =>
      expect(document.querySelector('[data-note="system-actor"]')?.getAttribute("aria-label")).toMatch(/transition_order/),
    );
    expect(document.querySelector('[data-actor-kind="agent"]')).toBeTruthy();
    expect(document.querySelector('[data-note="mcp"]')?.getAttribute("aria-label")).toMatch(/transition_order/);
  });
});

describe("ad-server steps", () => {
  beforeEach(async () => {
    resetReachability();
    await connect({ writesEnabled: true });
    server.use(
      http.get(`${API}/api/v1/orders`, () =>
        HttpResponse.json({ orders: [{ ...ORDERS[0], status: "booked" }], count: 1 }),
      ),
      http.get(`${API}/api/v1/orders/ORD-ABC123/audit`, () =>
        HttpResponse.json({ ...AUDIT, current_status: "booked" }),
      ),
      http.get(`${API}/api/v1/change-requests`, () => HttpResponse.json({ change_requests: [], count: 0 })),
    );
  });

  // The agent has no ad-server sync: moving an order into these statuses
  // records a claim, and the confirmation has to say so.
  it("says a record-only move sends nothing to the ad server", async () => {
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");
    await waitFor(() => expect(transitionButtons()).toEqual(["completed", "unbooked"]));

    await user.click(screen.getByLabelText("Acting as"));
    await user.click(await screen.findByRole("option", { name: "system" }));
    await user.click(document.querySelector('[data-action="transition-order:completed"]') as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/Nothing is sent to the ad server/);
    expect(within(dialog).getByRole("button", { name: "Record completed" })).toBeInTheDocument();
  });

  function gam(orders: unknown[]) {
    const seen = { scan: [] as URL[], report: [] as URL[] };
    server.use(
      http.get(`${API}/gam/orders`, ({ request }) => {
        seen.scan.push(new URL(request.url));
        return HttpResponse.json({ network_code: "123", orders, count: orders.length });
      }),
      http.get(`${API}/gam/report`, ({ request }) => {
        seen.report.push(new URL(request.url));
        return HttpResponse.json({ rows: [{ order: "9001", impressions: 10 }] });
      }),
    );
    return seen;
  }

  const delivery = () => document.querySelector('[data-block="delivery"]') as HTMLElement;

  it("asks GAM when the row opens, and quotes what it found in the confirmation", async () => {
    const seen = gam([
      { id: "9001", name: "Autumn takeover", status: "APPROVED", external_order_id: "deal-1" },
      { id: "9002", name: "Other", status: "DRAFT", external_order_id: "deal-7" },
    ]);
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("ORD-ABC123");
    // Each read spends the network's GAM quota: nothing until a row opens.
    expect(seen.scan).toEqual([]);

    await expand(user, "ORD-ABC123");
    await waitFor(() =>
      expect(document.querySelector('[data-state="gam-checked"]')?.textContent).toMatch(
        /order 9001 “Autumn takeover” is APPROVED/,
      ),
    );
    expect(seen.scan[0]!.searchParams.get("limit")).toBe("500");

    await user.click(screen.getByLabelText("Acting as"));
    await user.click(await screen.findByRole("option", { name: "system" }));
    await user.click(document.querySelector('[data-action="transition-order:completed"]') as HTMLElement);
    expect((await screen.findByRole("dialog")).textContent).toMatch(/GAM, when checked: order 9001/);
  });

  it("reports delivery for the deal's GAM orders by their GAM ids, with one GAM lookup for the row", async () => {
    const seen = gam([
      { id: "9001", name: "A", status: "APPROVED", external_order_id: "deal-1" },
      { id: "9003", name: "B", status: "APPROVED", external_order_id: "deal-1" },
      { id: "9002", name: "C", status: "DRAFT", external_order_id: "deal-7" },
    ]);
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");

    await waitFor(() => expect(delivery().querySelector('[data-payload="gam-report"]')?.textContent).toContain("impressions"));
    expect(delivery().querySelector('[data-state="gam-ids"]')?.textContent).toBe("GAM orders 9001, 9003");
    expect(seen.report).toHaveLength(1);
    expect(seen.report[0]!.searchParams.get("order_ids")).toBe("9001,9003");
    expect(seen.report[0]!.searchParams.get("days")).toBe("30");
    // The Next step finding and the delivery card share one read.
    expect(seen.scan).toHaveLength(1);
  });

  it("reloads the lookup and the report from the card's reload button", async () => {
    const seen = gam([{ id: "9001", name: "A", status: "APPROVED", external_order_id: "deal-1" }]);
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");
    await waitFor(() => expect(seen.report).toHaveLength(1));

    await user.click(within(delivery()).getByRole("button", { name: "Reload delivery" }));
    await waitFor(() => expect(seen.report).toHaveLength(2));
    expect(seen.scan).toHaveLength(2);
  });

  it("sends no report when GAM has no order for the deal", async () => {
    const seen = gam([{ id: "1", name: "x", status: "DRAFT", external_order_id: null }]);
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");

    await waitFor(() =>
      expect(document.querySelector('[data-state="gam-checked"]')?.textContent).toMatch(
        /no order for deal deal-1 among the 1 GAM orders read/,
      ),
    );
    expect(delivery().querySelector('[data-state="no-gam-order"]')?.textContent).toMatch(/no order for deal deal-1/);
    expect(seen.report).toEqual([]);
  });

  // Completed is past the statuses where Next step shows the check, and is
  // exactly when delivery matters, so the delivery card still reads.
  it("reports delivery for a completed order, where Next step shows no check", async () => {
    server.use(
      http.get(`${API}/api/v1/orders`, () =>
        HttpResponse.json({ orders: [{ ...ORDERS[0], status: "completed" }], count: 1 }),
      ),
      http.get(`${API}/api/v1/orders/ORD-ABC123/audit`, () =>
        HttpResponse.json({ ...AUDIT, current_status: "completed" }),
      ),
    );
    const seen = gam([{ id: "9001", name: "A", status: "COMPLETED", external_order_id: "deal-1" }]);
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");

    await waitFor(() => expect(seen.report).toHaveLength(1));
    expect(document.querySelector('[data-block="gam-check"]')).toBeNull();
  });

  it("shows no delivery card for an order with no deal", async () => {
    server.use(
      http.get(`${API}/api/v1/orders`, () =>
        HttpResponse.json({ orders: [{ ...ORDERS[0], status: "booked", deal_id: null }], count: 1 }),
      ),
    );
    const seen = gam([]);
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");

    expect(delivery()).toBeNull();
    expect(seen.scan).toEqual([]);
  });

  it("reports why the check failed when GAM is not configured", async () => {
    server.use(
      http.get(`${API}/gam/orders`, () =>
        HttpResponse.json(
          { detail: "GAM not configured — set GAM_ENABLED=true, GAM_NETWORK_CODE, GAM_JSON_KEY_PATH" },
          { status: 503 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await expand(user, "ORD-ABC123");

    await waitFor(() =>
      expect(document.querySelector('[data-state="gam-failed"]')?.textContent).toMatch(/GAM not configured/),
    );
    expect(delivery().querySelector('[data-state="no-gam-order"]')?.textContent).toMatch(/GAM not configured/);
  });
});

describe("the reporting section", () => {
  const REPORT = {
    total_orders: 3,
    status_counts: { approved: 2, draft: 1 },
    total_transitions: 7,
    avg_transitions_per_order: 2.3333,
    actor_type_counts: { agent: 4, operator: 3 },
    change_requests: { total: 1, by_status: { pending: 1 } },
  };

  beforeEach(async () => {
    resetReachability();
    await connect();
    server.use(
      http.get(`${API}/api/v1/orders`, () => HttpResponse.json({ orders: ORDERS, count: ORDERS.length })),
      http.get(`${API}/api/v1/change-requests`, () => HttpResponse.json({ change_requests: [], count: 0 })),
      http.get(`${API}/api/v1/orders/report`, () => HttpResponse.json(REPORT)),
      http.get(`${API}/api/v1/orders/ORD-ABC123/audit`, () => HttpResponse.json(AUDIT)),
      http.get(`${API}/gam/orders`, () => HttpResponse.json({ orders: [{ id: "gam-1" }] })),
      http.get(`${API}/gam/report`, ({ request }) =>
        HttpResponse.json({ asked_for: new URL(request.url).searchParams.get("order_ids") }),
      ),
    );
  });

  function card(name: string): HTMLElement {
    return document.querySelector(`[data-card="${name}"]`) as HTMLElement;
  }

  /**
   * The GAM routes proxy an external ad server: opening the screen spends none
   * of its quota. The agent's own totals are read on arrival, once.
   */
  it("reads the agent's totals on arrival, but nothing from the ad server until asked", async () => {
    const recorder = recordRequests();
    // Added after the recorder so they win; it still sees everything else.
    server.use(
      http.get(`${API}/api/v1/orders`, () => HttpResponse.json({ orders: ORDERS, count: ORDERS.length })),
      http.get(`${API}/api/v1/change-requests`, () => HttpResponse.json({ change_requests: [], count: 0 })),
    );
    renderScreen();
    await screen.findByText("ORD-ABC123");

    await waitFor(() =>
      expect(recorder.seen.filter((line) => line.includes("/orders/report"))).toHaveLength(1),
    );
    expect(recorder.seen.filter((line) => line.includes("/gam/"))).toEqual([]);
  });

  it("shows the agent's own totals, and says when its count differs from the list", async () => {
    renderScreen();
    await screen.findByText("ORD-ABC123");

    await waitFor(() => expect(within(card("orders-report")).getByText("3 orders")).toBeInTheDocument());
    expect(within(card("orders-report")).getByText("1 request")).toBeInTheDocument();
    expect(within(card("orders-report")).getByText("2.3")).toBeInTheDocument();
    // The list has two; the agent counted three. Neither is quietly preferred.
    expect(card("orders-report").querySelector('[data-state="totals-differ"]')?.textContent).toMatch(
      /list below has 2 orders/,
    );
  });

  /** Delivery is per order; the screen itself lists nothing from GAM. */
  it("has no screen-level ad server section; delivery runs from an order's row", async () => {
    renderScreen();
    await screen.findByText("ORD-ABC123");
    expect(document.querySelector('[data-block="orders-reporting"]')).toBeNull();
    expect(document.querySelector('[data-card="gam-orders"]')).toBeNull();
    expect(document.querySelector('[data-card="gam-report"]')).toBeNull();
    expect(document.querySelector('[data-block="delivery"]')).toBeNull();
  });

  /** A 403 here is a role problem, and must not read as an outage. */
  it("says an operator key is needed when the agent refuses the aggregate", async () => {
    server.use(http.get(`${API}/api/v1/orders/report`, () => new HttpResponse(null, { status: 403 })));
    renderScreen();

    await waitFor(() => expect(card("orders-report").querySelector('[data-state="operator-required"]')).toBeTruthy());
  });
});

describe("searching the orders", () => {
  beforeEach(async () => {
    resetReachability();
    await connect();
    server.use(
      http.get(`${API}/api/v1/orders`, () =>
        HttpResponse.json({
          orders: [
            { ...ORDERS[0], quote_id: "qt-aaa111", metadata: { source: "test-buyer" } },
            { ...ORDERS[1], quote_id: "qt-bbb222" },
          ],
          count: 2,
        }),
      ),
      http.get(`${API}/api/v1/change-requests`, () => HttpResponse.json({ change_requests: [], count: 0 })),
    );
  });

  const box = () => document.querySelector('[data-field="order-search"]') as HTMLInputElement;

  it("finds an order by part of its id, case-insensitively, without asking the agent again", async () => {
    const seen: URL[] = [];
    server.use(
      http.get(`${API}/api/v1/orders`, ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json({ orders: ORDERS, count: ORDERS.length });
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("ORD-ABC123")).toBeInTheDocument());
    const reads = seen.length;

    await user.type(box(), "def4");
    await waitFor(() => expect(screen.queryByText("ORD-ABC123")).toBeNull());
    expect(screen.getByText("ORD-DEF456")).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/1 order matching "def4" of 2/);
    expect(seen.length).toBe(reads);
  });

  it.each([
    ["deal-2", "ORD-DEF456"],
    ["qt-aaa", "ORD-ABC123"],
    ["test-buyer", "ORD-ABC123"],
  ])("matches %s to %s", async (query, expected) => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("ORD-ABC123")).toBeInTheDocument());

    await user.type(box(), query);
    await waitFor(() => expect(screen.getAllByRole("row").filter((r) => r.hasAttribute("data-row"))).toHaveLength(1));
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("combines with the status filter, and says when nothing matches", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("ORD-ABC123")).toBeInTheDocument());

    await user.type(box(), "ORD-ABC");
    await user.click(screen.getByLabelText("Status"));
    await user.click(await screen.findByRole("option", { name: "approved" }));

    await waitFor(() =>
      expect(document.querySelector('[data-state="empty"]')?.textContent).toMatch(
        /No orders matching "ORD-ABC" with status "approved"/,
      ),
    );
  });

  it("clears with Escape, and Show all clears search and filter together", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("ORD-ABC123")).toBeInTheDocument());

    await user.type(box(), "nothing-like-this");
    await waitFor(() => expect(document.querySelector('[data-state="empty"]')).toBeTruthy());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByText("ORD-DEF456")).toBeInTheDocument());
    expect(box()).toHaveValue("");

    await user.type(box(), "DEF");
    await user.click(document.querySelector('[data-chip="approval"]') as HTMLElement);
    await waitFor(() => expect(document.querySelector('[data-state="empty"]')).toBeTruthy());
    await user.click(document.querySelector('[data-action="clear-filter"]') as HTMLElement);
    await waitFor(() => expect(screen.getByText("ORD-ABC123")).toBeInTheDocument());
    expect(screen.getByText("ORD-DEF456")).toBeInTheDocument();
    expect(box()).toHaveValue("");
  });
});

describe("the new-order wizard", () => {
  const DEALS = {
    deals: [
      {
        deal: {
          deal_id: "DEMO-111",
          deal_type: "PD",
          status: "active",
          quote_id: "qt-from-deal",
          product: { product_id: "p1", name: "Homepage takeover" },
        },
      },
      { deal: { deal_id: "DEMO-222", deal_type: "PG", status: "active", quote_id: null, product: { product_id: "p2", name: "CTV prime" } } },
    ],
    count: 2,
    skipped: [],
  };

  beforeEach(async () => {
    resetReachability();
    await connect({ writesEnabled: true });
    server.use(
      http.get(`${API}/api/v1/orders`, () => HttpResponse.json({ orders: ORDERS, count: ORDERS.length })),
      http.get(`${API}/api/v1/change-requests`, () => HttpResponse.json({ change_requests: [], count: 0 })),
    );
  });

  async function openWizard(user: ReturnType<typeof userEvent.setup>) {
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "New order" }));
    return screen.findByRole("dialog");
  }

  it("reads the deals only on the deal route's details step, and fills in the deal's quote", async () => {
    let dealReads = 0;
    const sent: unknown[] = [];
    server.use(
      http.get(`${API}/api/v1/deals`, () => {
        dealReads += 1;
        return HttpResponse.json(DEALS);
      }),
      http.post(`${API}/api/v1/orders`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ order_id: "ORD-NEW2", status: "draft", deal_id: "DEMO-111", created_at: null });
      }),
    );
    const user = userEvent.setup();
    const wizard = await openWizard(user);
    // The deals list is a full scan: opening the wizard must not start one.
    expect(dealReads).toBe(0);
    expect(within(wizard).getByRole("radio", { name: /For a stored deal/ })).toBeChecked();

    await user.click(within(wizard).getByRole("button", { name: "Next" }));
    expect(within(wizard).getByRole("button", { name: "Next" })).toBeDisabled();
    await user.click(await within(wizard).findByLabelText("Deal"));
    await user.click(await screen.findByText("DEMO-111"));
    expect(dealReads).toBe(1);
    await waitFor(() => expect(within(wizard).getByLabelText("Quote id (optional)")).toHaveValue("qt-from-deal"));
    await user.type(within(wizard).getByLabelText("Note (optional)"), "phone booking");

    await user.click(within(wizard).getByRole("button", { name: "Next" }));
    expect(wizard.textContent).toMatch(/qt-from-deal \(from the deal\)/);
    expect(wizard.textContent).toMatch(/Not idempotent/);
    await user.click(within(wizard).getByRole("button", { name: "Create order" }));

    await waitFor(() =>
      expect(sent).toEqual([
        {
          deal_id: "DEMO-111",
          quote_id: "qt-from-deal",
          metadata: { source: "seller-console", note: "phone booking" },
        },
      ]),
    );
    expect(await within(wizard).findByText(/Created ORD-NEW2, in draft/)).toBeInTheDocument();
  });

  it("never overwrites a quote the operator typed with the deal's", async () => {
    server.use(http.get(`${API}/api/v1/deals`, () => HttpResponse.json(DEALS)));
    const user = userEvent.setup();
    const wizard = await openWizard(user);
    await user.click(within(wizard).getByRole("button", { name: "Next" }));

    await user.type(within(wizard).getByLabelText("Quote id (optional)"), "qt-mine");
    await user.click(within(wizard).getByLabelText("Deal"));
    await user.click(await screen.findByText("DEMO-111"));

    expect(within(wizard).getByLabelText("Quote id (optional)")).toHaveValue("qt-mine");
  });

  it("warns what an order with no deal cannot do, and sends no deal", async () => {
    const sent: unknown[] = [];
    server.use(
      http.post(`${API}/api/v1/orders`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ order_id: "ORD-BARE", status: "draft", deal_id: "", created_at: null });
      }),
    );
    const user = userEvent.setup();
    const wizard = await openWizard(user);
    await user.click(within(wizard).getByRole("radio", { name: /With no deal yet/ }));
    await user.click(within(wizard).getByRole("button", { name: "Next" }));
    expect(wizard.textContent).toMatch(/refuses every change request/);

    await user.click(within(wizard).getByRole("button", { name: "Next" }));
    expect(wizard.textContent).toMatch(/will refuse change requests/);
    await user.click(within(wizard).getByRole("button", { name: "Create order" }));
    await waitFor(() => expect(sent).toEqual([{ metadata: { source: "seller-console" } }]));
  });

  it("will not create while writes are off, and says where the switch is", async () => {
    await connect({ writesEnabled: false });
    const user = userEvent.setup();
    const wizard = await openWizard(user);
    await user.click(within(wizard).getByRole("radio", { name: /With no deal yet/ }));
    await user.click(within(wizard).getByRole("button", { name: "Next" }));
    await user.click(within(wizard).getByRole("button", { name: "Next" }));

    expect(within(wizard).getByRole("button", { name: "Create order" })).toBeDisabled();
    expect(wizard.textContent).toMatch(/Writes are switched off/);
  });
});
