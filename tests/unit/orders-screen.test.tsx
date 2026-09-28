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
    // Every upstream status is offered, not a hand-picked few.
    const offered = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(offered).toEqual(["Any status", ...ORDER_STATUSES.map((o) => o.label)]);
    await user.click(screen.getByRole("option", { name: "approved" }));

    await waitFor(() =>
      expect(seen[seen.length - 1]!.searchParams.get("status")).toBe("approved"),
    );
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
    expect(cell("ORD-DEF456")).toBe("Start execution");
  });

  it("offers only the moves the state machine allows from the current status", async () => {
    await connect({ writesEnabled: true });
    const user = userEvent.setup();
    renderScreen();
    const detail = await expand(user, "ORD-ABC123");

    await waitFor(() => expect(transitionButtons().length).toBeGreaterThan(0));
    // pending_approval → approved | rejected | cancelled, forward move first.
    expect(transitionButtons()).toEqual(["approved", "rejected", "cancelled"]);
    expect(within(detail).getByText(/held at the approval gate/i)).toBeInTheDocument();
    expect(detail.querySelector('[aria-current="step"]')?.textContent).toMatch(/pending approval/);
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
    expect(detail.textContent).toMatch(/the list still shows pending approval/);
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
              cr_id: "CR-1",
              order_id: "ORD-ABC123",
              change_type: "flight_dates",
              status: "pending_approval",
              diffs: [],
              reason: "two more weeks",
              requested_by: "agent:buyer-7",
              created_at: "2026-09-15T10:00:00Z",
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
    expect(seen.some((u) => u.searchParams.get("order_id") === "ORD-ABC123")).toBe(true);
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
    await user.type(screen.getByLabelText("Deal id (optional)"), "deal-9");
    await user.click(document.querySelector('[data-action="create-order"]') as HTMLElement);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Create order" }));

    await waitFor(() => expect(sent).toEqual([{ deal_id: "deal-9" }]));
    await waitFor(() => expect(transitionButtons()).toEqual(["submitted", "cancelled"]));
    // By role, so it has to wait out the confirmation's exit, which hides the page meanwhile.
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
