import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import NegotiationScreen from "../../src/screens/Negotiation";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetReachability } from "../../src/query/reachability";

const SESSIONS = [
  {
    session_id: "sess-console-demo-1",
    status: "active",
    buyer_pricing_key: "bk-1",
    message_count: 2,
    negotiation_stage: "counter_offer",
    created_at: "2026-09-15T09:00:00Z",
    updated_at: "2026-09-16T09:00:00Z",
  },
];

const DETAIL_WITH_MESSAGES = {
  session_id: "sess-console-demo-1",
  status: "active",
  buyer_pricing_key: "bk-1",
  messages: [{ message_id: "m1", role: "buyer", timestamp: "2026-09-16T09:00:00Z", content: { text: "hi" } }],
  linked_flow_ids: [],
  created_at: "2026-09-15T09:00:00Z",
  updated_at: "2026-09-16T09:00:00Z",
  expires_at: "2026-09-20T09:00:00Z",
};

const DETAIL_NO_MESSAGES = { ...DETAIL_WITH_MESSAGES, messages: [] };

function renderScreen() {
  return render(
    <SWRConfig
      value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, compare: sameResult }}
    >
      <ThemeProvider theme={theme}>
        <CredentialProvider>
          <NegotiationScreen />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

describe("the negotiation screen", () => {
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
      http.get(`${API}/sessions`, () => HttpResponse.json({ sessions: SESSIONS })),
      http.get(`${API}/sessions/sess-console-demo-1`, () =>
        HttpResponse.json(DETAIL_WITH_MESSAGES),
      ),
    );
  });

  it("lists sessions with a distinctive session id", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("sess-console-demo-1")).toBeInTheDocument());
  });

  it("shows a real empty state, not an error, for an agent with no sessions", async () => {
    server.use(http.get(`${API}/sessions`, () => HttpResponse.json({ sessions: [] })));
    renderScreen();

    await waitFor(() =>
      expect(document.querySelector('[data-state="empty"]')?.textContent).toMatch(
        /no sessions yet/i,
      ),
    );
    expect(document.body.textContent).not.toMatch(/could not reach|unavailable/i);
  });

  it("degrades the list without crashing when a field changes upstream", async () => {
    server.use(
      http.get(`${API}/sessions`, () =>
        // session_id renamed upstream.
        HttpResponse.json({ sessions: [{ id: "S-X", status: "active" }] }),
      ),
    );
    renderScreen();

    await waitFor(() => expect(document.body.textContent).toMatch(/unexpected response shape/i));
  });

  /**
   * These routes declare no auth dependency at all, so the list is not scoped
   * to this console's key. Omitting this note would let someone assume the
   * screen only shows their own buyers.
   */
  it("discloses that the session list is not scoped to this key", async () => {
    renderScreen();
    const note = await waitFor(() => {
      const el = document.querySelector('[data-note="unscoped"]');
      expect(el).toBeTruthy();
      return el!;
    });
    expect(note.textContent).toMatch(/not scoped to the/i);
  });

  /** Listing sessions flips expired sessions to expired and persists that. */
  it("discloses that listing sessions writes", async () => {
    renderScreen();
    await waitFor(() => expect(document.querySelector('[data-note="writes"]')).toBeTruthy());
  });

  it("shows a session with no messages as no-messages, not blank", async () => {
    server.use(
      http.get(`${API}/sessions/sess-console-demo-1`, () =>
        HttpResponse.json(DETAIL_NO_MESSAGES),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("sess-console-demo-1")).toBeInTheDocument());

    const row = screen.getByText("sess-console-demo-1").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Messages" }));

    await waitFor(() => expect(document.querySelector('[data-state="no-messages"]')).toBeTruthy());
  });
});
