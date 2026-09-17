import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import InboxScreen from "../../src/screens/Inbox";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetReachability } from "../../src/query/reachability";

const APPROVALS = [
  {
    approval_id: "appr-1",
    flow_id: "flow-1",
    flow_type: "negotiation",
    gate_name: "budget-gate",
    status: "pending",
    proposal_id: "prop-1",
    deal_id: "deal-1",
    created_at: "2026-09-16T09:00:00Z",
    expires_at: "2026-09-20T09:00:00Z",
  },
];

const DETAIL_UNDECIDED = {
  request: APPROVALS[0],
  response: null,
};

const DETAIL_DECIDED = {
  request: APPROVALS[0],
  response: {
    decision: "approved",
    decided_by: "alice from finance",
    decided_by_principal: "key:op-42",
    decided_at: "2026-09-16T10:00:00Z",
    reason: "within budget",
  },
};

function renderScreen() {
  return render(
    <SWRConfig
      value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, compare: sameResult }}
    >
      <ThemeProvider theme={theme}>
        <CredentialProvider>
          <InboxScreen />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

describe("the inbox screen", () => {
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
      http.get(`${API}/approvals`, () => HttpResponse.json({ approvals: APPROVALS })),
      http.get(`${API}/approvals/appr-1`, () => HttpResponse.json(DETAIL_UNDECIDED)),
    );
  });

  it("lists approvals with a distinctive gate name", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("budget-gate")).toBeInTheDocument());
  });

  it("shows a real empty state, not an error, for an agent with no approvals", async () => {
    server.use(http.get(`${API}/approvals`, () => HttpResponse.json({ approvals: [] })));
    renderScreen();

    await waitFor(() =>
      expect(document.querySelector('[data-state="empty"]')?.textContent).toMatch(
        /nothing waiting for approval/i,
      ),
    );
    expect(document.body.textContent).not.toMatch(/could not reach|unavailable/i);
  });

  it("degrades the list without crashing when a field changes upstream", async () => {
    server.use(
      http.get(`${API}/approvals`, () =>
        // approval_id renamed upstream.
        HttpResponse.json({ approvals: [{ id: "A-X", status: "pending" }] }),
      ),
    );
    renderScreen();

    await waitFor(() => expect(document.body.textContent).toMatch(/unexpected response shape/i));
  });

  /**
   * decided_by_principal is derived from the authenticated key; decided_by is
   * free text the caller supplied and the agent never checked. Merging them
   * under one label would launder an unverified claim into attribution.
   */
  it("labels the verified principal and the unverified name given differently", async () => {
    server.use(http.get(`${API}/approvals/appr-1`, () => HttpResponse.json(DETAIL_DECIDED)));
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("budget-gate")).toBeInTheDocument());

    const row = screen.getByText("budget-gate").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Details" }));

    const block = await waitFor(() => {
      const el = document.querySelector('[data-block="approval-decision"]');
      expect(el).toBeTruthy();
      return el!;
    });
    expect(block.textContent).toContain("key:op-42");
    expect(block.textContent).toContain("alice from finance");
    expect(block.textContent).toMatch(/verified/i);
    expect(block.textContent).toMatch(/unverified/i);
  });

  /** Listing approvals flips expired gates to timed_out and persists that. */
  it("discloses that listing approvals writes", async () => {
    renderScreen();
    await waitFor(() => expect(document.querySelector('[data-note="writes"]')).toBeTruthy());
  });

  it("shows an undecided approval as undecided, not blank", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("budget-gate")).toBeInTheDocument());

    const row = screen.getByText("budget-gate").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Details" }));

    await waitFor(() => expect(document.querySelector('[data-state="undecided"]')).toBeTruthy());
  });
});
