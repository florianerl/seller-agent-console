import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API, recordRequests, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import InboxScreen from "../../src/screens/Inbox";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetWritePolicy } from "../../src/api/policy";
import { resetReachability } from "../../src/query/reachability";

/**
 * The first screen that can change something, and the first place the write
 * switch has to mean what ADR 12 says it means: with it off, the controls are
 * visible, disabled, and nothing reaches the wire.
 */

const GATE = {
  approval_id: "appr-1",
  flow_id: "flow-1",
  flow_type: "negotiation",
  gate_name: "budget-gate",
  status: "pending",
  proposal_id: "prop-1",
  deal_id: "deal-1",
  created_at: "2026-09-16T09:00:00Z",
  expires_at: "2026-09-20T09:00:00Z",
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
          <InboxScreen />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

async function connect(writesEnabled: boolean) {
  await clearCredential();
  resetWritePolicy();
  await saveCredential({
    baseUrl: API,
    apiKey: "k",
    role: "operator",
    name: "Ad Seller System API",
    reportedVersion: "2.4.2",
    writesEnabled,
  });
}

/** Opens the one gate's detail, which is where the controls live. */
async function openGate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Details" }));
  await screen.findByText("Decide this gate");
}

describe("deciding an approval", () => {
  beforeEach(() => {
    resetReachability();
    server.use(
      http.get(`${API}/approvals`, () => HttpResponse.json({ approvals: [GATE] })),
      http.get(`${API}/approvals/appr-1`, () =>
        HttpResponse.json({ request: GATE, response: null }),
      ),
    );
  });

  it("shows the controls disabled, and says where the switch is, while writes are off", async () => {
    await connect(false);
    const user = userEvent.setup();
    const recorder = recordRequests();
    server.use(
      http.get(`${API}/approvals`, () => HttpResponse.json({ approvals: [GATE] })),
      http.get(`${API}/approvals/appr-1`, () =>
        HttpResponse.json({ request: GATE, response: null }),
      ),
    );
    renderScreen();
    await openGate(user);

    expect(document.querySelector('[data-note="read-only"]')).toBeTruthy();
    expect(document.querySelector('[data-action="approve"]')).toBeDisabled();
    expect(document.querySelector('[data-action="reject"]')).toBeDisabled();
    expect(recorder.seen.filter((line) => !line.startsWith("GET "))).toEqual([]);
  });

  it("asks before approving, and cancelling sends nothing", async () => {
    await connect(true);
    const user = userEvent.setup();
    const sent: string[] = [];
    server.use(
      http.post(`${API}/approvals/appr-1/decide`, () => {
        sent.push("decide");
        return HttpResponse.json({ ok: true });
      }),
    );

    renderScreen();
    await openGate(user);
    await user.click(document.querySelector('[data-action="approve"]') as HTMLElement);

    const dialog = await screen.findByRole("dialog");
    // The dialog has to say what a failed attempt leaves behind, not just ask.
    expect(dialog.textContent).toMatch(/keeps the first decision/i);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(sent).toEqual([]);
  });

  it("sends the decision with the reason and name, and re-reads the gate", async () => {
    await connect(true);
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    let listReads = 0;

    server.use(
      http.get(`${API}/approvals`, () => {
        listReads += 1;
        return HttpResponse.json({ approvals: [GATE] });
      }),
      http.post(`${API}/approvals/appr-1/decide`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ ok: true });
      }),
    );

    renderScreen();
    await openGate(user);
    await user.type(screen.getByLabelText("Reason"), "within budget");
    await user.type(screen.getByLabelText("Your name"), "alice");
    await user.click(document.querySelector('[data-action="approve"]') as HTMLElement);
    await user.click(document.querySelector('[data-action="confirm-mutation"]') as HTMLElement);

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      decision: "approve",
      reason: "within budget",
      decided_by: "alice",
    });

    // The queue described a pending gate; after deciding it, that description
    // is one this console can no longer stand behind.
    await waitFor(() => expect(listReads).toBeGreaterThan(1));
  });

  it("reports a refused write in place rather than pretending it landed", async () => {
    await connect(true);
    const user = userEvent.setup();
    server.use(
      http.post(`${API}/approvals/appr-1/decide`, () => new HttpResponse(null, { status: 409 })),
    );

    renderScreen();
    await openGate(user);
    await user.click(document.querySelector('[data-action="reject"]') as HTMLElement);
    await user.click(document.querySelector('[data-action="confirm-mutation"]') as HTMLElement);

    await waitFor(() =>
      expect(document.querySelector('[data-state="write-failed"]')?.textContent).toContain("409"),
    );
  });

  /** A gate the agent already answered is not ours to decide. */
  it("will not decide a gate that is no longer pending", async () => {
    await connect(true);
    const timedOut = { ...GATE, status: "timed_out" };
    server.use(
      http.get(`${API}/approvals`, () => HttpResponse.json({ approvals: [timedOut] })),
      http.get(`${API}/approvals/appr-1`, () =>
        HttpResponse.json({ request: timedOut, response: null }),
      ),
    );

    const user = userEvent.setup();
    renderScreen();
    await openGate(user);

    expect(document.querySelector('[data-action="approve"]')).toBeDisabled();
    expect(document.querySelector('[data-state="not-pending"]')?.textContent).toContain(
      "timed out",
    );
  });

  // Upstream answers a resume before a decision with 400 "has not been
  // decided yet", so offering it beside Approve could only ever fail.
  it("offers no resume while the gate is still pending", async () => {
    await connect(true);
    const user = userEvent.setup();
    renderScreen();
    await openGate(user);

    expect(document.querySelector('[data-action="approve"]')).toBeEnabled();
    expect(document.querySelector('[data-action="resume"]')).toBeNull();
  });

  it("offers resume once decided, says what it emits, and reports what the flow became", async () => {
    await connect(true);
    const gate = { ...GATE, flow_type: "proposal_handling", gate_name: "proposal_decision", status: "approved" };
    const resumed: string[] = [];
    server.use(
      http.get(`${API}/approvals`, () => HttpResponse.json({ approvals: [gate] })),
      http.get(`${API}/approvals/appr-1`, () =>
        HttpResponse.json({
          request: gate,
          response: { decision: "approve", decided_by: "anna", decided_by_principal: "key:ops", decided_at: "2026-09-16T10:00:00Z", reason: "" },
        }),
      ),
      http.post(`${API}/approvals/appr-1/resume`, () => {
        resumed.push("resume");
        return HttpResponse.json({ proposal_id: "prop-1", status: "accepted", recommendation: "approve", resumed_from_approval: "appr-1" });
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Details" }));

    const resume = await waitFor(() => {
      const el = document.querySelector('[data-action="resume"]');
      expect(el).toBeEnabled();
      return el as HTMLElement;
    });
    await user.click(resume);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/proposal\.accepted/);
    expect(dialog.textContent).toMatch(/not idempotent/i);
    await user.click(document.querySelector('[data-action="confirm-mutation"]') as HTMLElement);

    await waitFor(() => expect(resumed).toEqual(["resume"]));
    await waitFor(() =>
      expect(document.querySelector('[data-state="resumed"]')?.textContent).toMatch(/prop-1 is now accepted/),
    );
  });

  it("says a gate the agent cannot resume has nothing to resume", async () => {
    await connect(true);
    const decided = { ...GATE, status: "approved" };
    server.use(
      http.get(`${API}/approvals/appr-1`, () =>
        HttpResponse.json({
          request: decided,
          response: { decision: "approve", decided_by: "", decided_by_principal: "", decided_at: null, reason: "" },
        }),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Details" }));

    await waitFor(() =>
      expect(document.querySelector('[data-state="not-resumable"]')?.textContent).toMatch(/only resume proposal decisions/),
    );
    expect(document.querySelector('[data-action="resume"]')).toBeNull();
  });

  it("keeps a gate decided here on screen after the queue drops it, so it can still be resumed", async () => {
    await connect(true);
    const gate = { ...GATE, flow_type: "proposal_handling", gate_name: "proposal_decision" };
    let decided = false;
    server.use(
      // The agent lists pending gates only.
      http.get(`${API}/approvals`, () => HttpResponse.json({ approvals: decided ? [] : [gate] })),
      http.get(`${API}/approvals/appr-1`, () =>
        HttpResponse.json({
          request: { ...gate, status: decided ? "approved" : "pending" },
          response: decided
            ? { decision: "approve", decided_by: "", decided_by_principal: "", decided_at: null, reason: "" }
            : null,
        }),
      ),
      http.post(`${API}/approvals/appr-1/decide`, () => {
        decided = true;
        return HttpResponse.json({ ok: true });
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await openGate(user);
    await user.click(document.querySelector('[data-action="approve"]') as HTMLElement);
    await user.click(document.querySelector('[data-action="confirm-mutation"]') as HTMLElement);

    await waitFor(() => expect(document.querySelector('[data-state="left-queue"]')).toBeTruthy());
    await waitFor(() => expect(document.querySelector('[data-action="resume"]')).toBeEnabled());
  });

  // FastAPI puts the seller's sentence in `detail`; "the agent returned 400"
  // alone hid exactly what to do next.
  it("shows the agent's reason when it refuses a decision", async () => {
    await connect(true);
    server.use(
      http.post(`${API}/approvals/appr-1/decide`, () =>
        HttpResponse.json({ detail: "Approval appr-1 has expired" }, { status: 400 }),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await openGate(user);
    await user.click(document.querySelector('[data-action="approve"]') as HTMLElement);
    await user.click(document.querySelector('[data-action="confirm-mutation"]') as HTMLElement);

    await waitFor(() =>
      expect(document.querySelector('[data-state="write-failed"]')?.textContent).toBe(
        "the agent returned 400: Approval appr-1 has expired",
      ),
    );
  });

  it("opens a gate decided elsewhere by its id", async () => {
    await connect(true);
    server.use(
      http.get(`${API}/approvals`, () => HttpResponse.json({ approvals: [] })),
      http.get(`${API}/approvals/appr-9`, () =>
        HttpResponse.json({
          request: { ...GATE, approval_id: "appr-9", flow_type: "proposal_handling", gate_name: "proposal_decision", status: "rejected" },
          response: { decision: "reject", decided_by: "anonymous", decided_by_principal: "", decided_at: null, reason: "" },
        }),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await user.type(await screen.findByLabelText("Gate id"), "appr-9");
    await user.click(document.querySelector('[data-action="open-gate"]') as HTMLElement);

    await waitFor(() =>
      expect(document.querySelector('[data-block="opened-gate"] [data-action="resume"]')).toBeEnabled(),
    );
  });

  it("hides the decide controls as soon as the decision is accepted, before the gate is re-read", async () => {
    await connect(true);
    const user = userEvent.setup();
    server.use(
      http.post(`${API}/approvals/appr-1/decide`, () => HttpResponse.json({ ok: true })),
      // The detail stays undecided so the lock cannot cheat by waiting for response.
      http.get(`${API}/approvals/appr-1`, () =>
        HttpResponse.json({ request: GATE, response: null }),
      ),
    );

    renderScreen();
    await openGate(user);
    await user.click(document.querySelector('[data-action="reject"]') as HTMLElement);
    await user.click(document.querySelector('[data-action="confirm-mutation"]') as HTMLElement);

    await waitFor(() => expect(document.querySelector('[data-state="decision-sent"]')).toBeTruthy());
    expect(document.querySelector('[data-action="approve"]')).toBeNull();
  });
});
