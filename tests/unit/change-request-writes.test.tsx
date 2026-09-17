import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API, recordRequests, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import ChangeRequestsScreen from "../../src/screens/ChangeRequests";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetWritePolicy } from "../../src/api/policy";
import { resetReachability } from "../../src/query/reachability";

const PENDING = {
  cr_id: "CR-ABC123",
  order_id: "ORD-1",
  change_type: "flight_extension",
  status: "pending_approval",
  diffs: [{ field: "flight_end", old_value: "2026-09-30", new_value: "2026-10-15" }],
  reason: "buyer asked for two extra weeks",
  requested_by: "agent:buyer-7",
  decided_by: null,
  decided_at: null,
  approved_by: null,
  approved_at: null,
  created_at: "2026-09-15T09:00:00Z",
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
          <ChangeRequestsScreen />
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

async function openRequest(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Details" }));
  await screen.findByText("Review this request");
}

describe("reviewing a change request", () => {
  beforeEach(() => {
    resetReachability();
    server.use(
      http.get(`${API}/api/v1/change-requests`, () =>
        HttpResponse.json({ change_requests: [PENDING], count: 1 }),
      ),
      http.get(`${API}/api/v1/change-requests/CR-ABC123`, () => HttpResponse.json(PENDING)),
    );
  });

  it("shows the controls disabled, and says where the switch is, while writes are off", async () => {
    await connect(false);
    const user = userEvent.setup();
    const recorder = recordRequests();
    server.use(
      http.get(`${API}/api/v1/change-requests`, () =>
        HttpResponse.json({ change_requests: [PENDING], count: 1 }),
      ),
      http.get(`${API}/api/v1/change-requests/CR-ABC123`, () => HttpResponse.json(PENDING)),
    );
    renderScreen();
    await openRequest(user);

    expect(document.querySelector('[data-note="read-only"]')).toBeTruthy();
    expect(document.querySelector('[data-action="approve"]')).toBeDisabled();
    expect(document.querySelector('[data-action="reject"]')).toBeDisabled();
    expect(document.querySelector('[data-action="apply"]')).toBeDisabled();
    expect(recorder.seen.filter((line) => !line.startsWith("GET "))).toEqual([]);
  });

  it("asks before approving, and cancelling sends nothing", async () => {
    await connect(true);
    const user = userEvent.setup();
    const sent: string[] = [];
    server.use(
      http.post(`${API}/api/v1/change-requests/CR-ABC123/review`, () => {
        sent.push("review");
        return HttpResponse.json({ ok: true });
      }),
    );

    renderScreen();
    await openRequest(user);
    await user.click(document.querySelector('[data-action="approve"]') as HTMLElement);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/keeps the first decision/i);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(sent).toEqual([]);
  });

  it("sends the review with the reason and name, and re-reads the list", async () => {
    await connect(true);
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    let listReads = 0;

    server.use(
      http.get(`${API}/api/v1/change-requests`, () => {
        listReads += 1;
        return HttpResponse.json({ change_requests: [PENDING], count: 1 });
      }),
      http.post(`${API}/api/v1/change-requests/CR-ABC123/review`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ ok: true });
      }),
    );

    renderScreen();
    await openRequest(user);
    await user.type(screen.getByLabelText("Reason"), "ok to extend");
    await user.type(screen.getByLabelText("Your name"), "jane");
    await user.click(document.querySelector('[data-action="approve"]') as HTMLElement);
    await user.click(document.querySelector('[data-action="confirm-mutation"]') as HTMLElement);

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      decision: "approve",
      reason: "ok to extend",
      decided_by: "jane",
    });
    await waitFor(() => expect(listReads).toBeGreaterThan(1));
  });

  it("applies an approved request after confirmation", async () => {
    await connect(true);
    const approved = { ...PENDING, status: "approved" };
    const applied: string[] = [];
    server.use(
      http.get(`${API}/api/v1/change-requests`, () =>
        HttpResponse.json({ change_requests: [approved], count: 1 }),
      ),
      http.get(`${API}/api/v1/change-requests/CR-ABC123`, () => HttpResponse.json(approved)),
      http.post(`${API}/api/v1/change-requests/CR-ABC123/apply`, () => {
        applied.push("apply");
        return HttpResponse.json({ status: "applied" });
      }),
    );

    const user = userEvent.setup();
    renderScreen();
    await openRequest(user);

    expect(document.querySelector('[data-action="approve"]')).toBeDisabled();
    await user.click(document.querySelector('[data-action="apply"]') as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/writes the proposed values onto the order/i);
    await user.click(document.querySelector('[data-action="confirm-mutation"]') as HTMLElement);

    await waitFor(() => expect(applied).toEqual(["apply"]));
  });

  it("reports a refused write in place rather than pretending it landed", async () => {
    await connect(true);
    const user = userEvent.setup();
    server.use(
      http.post(`${API}/api/v1/change-requests/CR-ABC123/review`, () =>
        new HttpResponse(null, { status: 409 }),
      ),
    );

    renderScreen();
    await openRequest(user);
    await user.click(document.querySelector('[data-action="reject"]') as HTMLElement);
    await user.click(document.querySelector('[data-action="confirm-mutation"]') as HTMLElement);

    await waitFor(() =>
      expect(document.querySelector('[data-state="write-failed"]')?.textContent).toContain("409"),
    );
  });
});
