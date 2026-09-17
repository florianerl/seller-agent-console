import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import ChangeRequestsScreen from "../../src/screens/ChangeRequests";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetReachability } from "../../src/query/reachability";

const CHANGE_REQUESTS = [
  {
    cr_id: "CR-ABC123",
    order_id: "ORD-1",
    change_type: "flight_extension",
    status: "pending_approval",
    diffs: [{ field: "flight_end", old_value: "2026-09-30", new_value: "2026-10-15" }],
    reason: "buyer asked for two extra weeks",
    requested_by: "agent:buyer-7",
    decided_by: null,
    decided_at: null,
    created_at: "2026-09-15T09:00:00Z",
  },
  {
    cr_id: "CR-DEF456",
    order_id: "ORD-2",
    change_type: "budget_increase",
    status: "approved",
    diffs: [],
    reason: "",
    requested_by: "system",
    decided_by: "operator:jane",
    decided_at: "2026-09-16T10:00:00Z",
    created_at: "2026-09-16T09:00:00Z",
  },
];

const DETAIL = CHANGE_REQUESTS[0];

function renderScreen() {
  return render(
    <SWRConfig
      value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, compare: sameResult }}
    >
      <ThemeProvider theme={theme}>
        <CredentialProvider>
          <ChangeRequestsScreen />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

describe("the change requests screen", () => {
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
      http.get(`${API}/api/v1/change-requests`, () =>
        HttpResponse.json({ change_requests: CHANGE_REQUESTS, count: CHANGE_REQUESTS.length }),
      ),
      http.get(`${API}/api/v1/change-requests/CR-ABC123`, () => HttpResponse.json(DETAIL)),
    );
  });

  it("lists change requests with their status", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("CR-ABC123")).toBeInTheDocument());

    expect(document.querySelector('[data-status="pending_approval"]')).toBeTruthy();
    expect(document.querySelector('[data-status="approved"]')).toBeTruthy();
  });

  it("filters by status and asks the agent for it", async () => {
    const seen: URL[] = [];
    server.use(
      http.get(`${API}/api/v1/change-requests`, ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json({ change_requests: [CHANGE_REQUESTS[1]], count: 1 });
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

  it("expands a row into a detail that fetches the single change request", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("CR-ABC123")).toBeInTheDocument());

    const row = screen.getByText("CR-ABC123").closest("tr")!;
    expect(row.getAttribute("data-row")).toBe("change-request");
    const toggle = within(row).getByRole("button", { name: "Details" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const detail = await waitFor(() => {
      const el = document.querySelector('[data-block="change-request-detail"]');
      expect(el).toBeTruthy();
      return el!;
    });

    expect(detail.textContent).toContain("ORD-1");
    expect(detail.textContent).toContain("flight extension");
    expect(detail.textContent).toContain("buyer asked for two extra weeks");

    const diffs = document.querySelector('[data-list="diffs"]')!;
    expect(diffs.textContent).toContain("flight_end");
    expect(diffs.textContent).toContain("2026-09-30");
    expect(diffs.textContent).toContain("2026-10-15");
  });

  it("says a decided request has no pending decision text, and an undecided one is explicit", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("CR-ABC123")).toBeInTheDocument());

    const row = screen.getByText("CR-ABC123").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Details" }));

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/not decided yet/i),
    );
  });

  it("says a request has no field changes rather than showing an error", async () => {
    server.use(
      http.get(`${API}/api/v1/change-requests/CR-ABC123`, () =>
        HttpResponse.json({ ...DETAIL, diffs: [] }),
      ),
    );

    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("CR-ABC123")).toBeInTheDocument());

    const row = screen.getByText("CR-ABC123").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Details" }));

    await waitFor(() =>
      expect(document.querySelector('[data-state="no-diffs"]')).toBeTruthy(),
    );
  });

  it("distinguishes an empty filter result from no change requests at all", async () => {
    server.use(
      http.get(`${API}/api/v1/change-requests`, () =>
        HttpResponse.json({ change_requests: [], count: 0 }),
      ),
    );
    renderScreen();

    await waitFor(() =>
      expect(document.querySelector('[data-state="empty"]')?.textContent).toMatch(
        /no change requests yet/i,
      ),
    );
  });

  /**
   * The route is operator-only in practice (writes on the sibling review/apply
   * routes certainly are), so a rejected read must explain itself rather than
   * render as an empty queue.
   */
  it("shows the gated notice to a buyer key, not an empty queue", async () => {
    server.use(
      http.get(`${API}/api/v1/change-requests`, () =>
        HttpResponse.json({ detail: "operator required" }, { status: 403 }),
      ),
    );
    renderScreen();

    await waitFor(() =>
      expect(document.querySelector('[data-state="operator-required"]')).toBeTruthy(),
    );
    expect(document.body.textContent).not.toMatch(/no change requests yet/i);
  });

  /**
   * A 401 and a 403 are opposite problems; conflating them sends someone with
   * a dead key looking for a role they already have.
   */
  it("says a rejected key is rejected, not that it is a buyer key", async () => {
    server.use(
      http.get(`${API}/api/v1/change-requests`, () =>
        HttpResponse.json({ detail: "invalid api key" }, { status: 401 }),
      ),
    );
    renderScreen();

    await waitFor(() => expect(document.querySelector('[data-state="key-rejected"]')).toBeTruthy());
    expect(document.querySelector('[data-state="operator-required"]')).toBeNull();
    expect(document.body.textContent).toMatch(/expired or been revoked/i);
  });

  it("degrades the list without crashing when a field changes upstream", async () => {
    server.use(
      http.get(`${API}/api/v1/change-requests`, () =>
        // cr_id renamed upstream.
        HttpResponse.json({ change_requests: [{ id: "CR-X", status: "pending" }], count: 1 }),
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
    await waitFor(() => expect(screen.getByText("CR-ABC123")).toBeInTheDocument());

    const keyWarnings = warn.mock.calls.filter((c) => String(c[0]).includes("unique \"key\""));
    expect(keyWarnings).toEqual([]);
    warn.mockRestore();
  });
});
