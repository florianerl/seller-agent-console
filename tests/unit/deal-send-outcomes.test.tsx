import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetReachability } from "../../src/query/reachability";
import { resetWritePolicy } from "../../src/api/policy";
import { DistributeForm } from "../../src/screens/DealSend";
import { StatusChip } from "../../src/components/StatusChip";
import { APPROVAL_STATUSES, statusLabel } from "../../src/api/vocabulary";

/**
 * `POST /api/v1/deals/distribute` has two answers a plain "accepted" line
 * misreports: a 200 that sent nothing because a human must pick the DSP
 * (services/deal_service.py:1172), and a 502 that does not say whether the SSP
 * made the deal (:1277).
 */

function mount() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, compare: sameResult }}>
      <ThemeProvider theme={theme}>
        <CredentialProvider>
          <DistributeForm dealId="D-1" />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

async function distribute(user: ReturnType<typeof userEvent.setup>) {
  const button = await waitFor(() => {
    const el = screen.getByRole("button", { name: "Distribute" });
    expect(el).toBeEnabled();
    return el;
  });
  await user.click(button);
  await user.click(
    await waitFor(() => {
      const el = document.querySelector('[data-action="confirm-mutation"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    }),
  );
}

describe("distributing a deal", () => {
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
    });
  });

  it("says a pending approval is waiting, and links to the Inbox instead of calling it accepted", async () => {
    server.use(
      http.post(`${API}/api/v1/deals/distribute`, () =>
        HttpResponse.json({ status: "pending_approval", approval_id: "apr-42", message: "pick a DSP" }),
      ),
    );
    const user = userEvent.setup();
    mount();
    await distribute(user);

    const note = await waitFor(() => {
      const el = document.querySelector('[data-state="distribute-pending-approval"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(note.textContent).toMatch(/waiting for approval/i);
    expect(note.textContent).toContain("apr-42");
    expect(note.querySelector("a")?.getAttribute("href")).toBe("#/inbox");
    expect(document.querySelector('[data-state="write-ok"]')).toBeNull();
  });

  it("says the outcome is unknown on a 502, and does not retry", async () => {
    let posts = 0;
    server.use(
      http.post(`${API}/api/v1/deals/distribute`, () => {
        posts += 1;
        return HttpResponse.json(
          { detail: { error: "outcome_unknown", message: "timeout after send" } },
          { status: 502 },
        );
      }),
    );
    const user = userEvent.setup();
    mount();
    await distribute(user);

    const note = await waitFor(() => {
      const el = document.querySelector('[data-state="distribute-outcome-unknown"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(note.textContent).toMatch(/could not confirm whether the deal reached the SSP/);
    expect(note.textContent).toMatch(/before sending it again/);
    expect(document.querySelector('[data-state="write-failed"]')).toBeNull();
    // A moment for any retry that would have been scheduled.
    await new Promise((r) => setTimeout(r, 50));
    expect(posts).toBe(1);
  });

  it("still reports a plain success the usual way", async () => {
    server.use(http.post(`${API}/api/v1/deals/distribute`, () => HttpResponse.json({ status: "active" })));
    const user = userEvent.setup();
    mount();
    await distribute(user);
    await waitFor(() => expect(document.querySelector('[data-state="write-ok"]')).toBeTruthy());
    expect(document.querySelector('[data-state="distribute-pending-approval"]')).toBeNull();
  });
});

describe("approval status labels", () => {
  it("lists the two statuses upstream added", () => {
    const values = APPROVAL_STATUSES.map((s) => s.value);
    expect(values).toContain("consumed");
    expect(values).toContain("outcome_unknown");
  });

  it("spells them out on the chip, keeping the raw status for tests and styling", () => {
    render(
      <ThemeProvider theme={theme}>
        <StatusChip status="consumed" />
        <StatusChip status="outcome_unknown" />
        <StatusChip status="timed_out" />
      </ThemeProvider>,
    );
    expect(screen.getByText("approved, acted on")).toHaveAttribute("class");
    expect(screen.getByText("approved, outcome unknown")).toBeInTheDocument();
    expect(screen.getByText("timed out")).toBeInTheDocument();
    expect(document.querySelector('[data-status="outcome_unknown"]')).toBeTruthy();
    expect(statusLabel("pending")).toBe("pending");
  });
});
