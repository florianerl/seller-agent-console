import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import EventsScreen from "../../src/screens/Events";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetReachability } from "../../src/query/reachability";

const EVENTS = [
  { event_type: "deal.created", timestamp: "2026-09-16T12:00:00Z", flow_id: "flow-1", event_id: "e1" },
  { event_type: "negotiation.round", timestamp: "2026-09-16T11:00:00Z", flow_id: "flow-2", event_id: "e2" },
];

function renderScreen() {
  return render(
    <SWRConfig
      value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, compare: sameResult }}
    >
      <ThemeProvider theme={theme}>
        <CredentialProvider>
          <EventsScreen />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

async function connectAs(role: "operator" | "buyer") {
  await clearCredential();
  await saveCredential({
    baseUrl: API,
    apiKey: "k",
    role,
    name: "Ad Seller System API",
    reportedVersion: "2.4.2",
  });
}

describe("the events screen", () => {
  beforeEach(async () => {
    resetReachability();
    await connectAs("operator");
    server.use(http.get(`${API}/events`, () => HttpResponse.json({ events: EVENTS })));
  });

  it("lists the most recent events", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("deal.created")).toBeInTheDocument());
    expect(screen.getByText("negotiation.round")).toBeInTheDocument();
  });

  // The API has no cursor, so calling this a log would overstate it.
  it("says plainly that it is a tail, not a full log", async () => {
    renderScreen();
    expect(await screen.findByText(/tail, not a full log/i)).toBeInTheDocument();
  });

  it("sends only the filters that are set", async () => {
    const seen: URL[] = [];
    server.use(
      http.get(`${API}/events`, ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json({ events: EVENTS });
      }),
    );

    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));

    expect(seen[0]!.searchParams.get("limit")).toBe("50");
    expect(seen[0]!.searchParams.has("event_type")).toBe(false);

    await user.type(screen.getByLabelText("Event type"), "deal.created");

    await waitFor(() => {
      const last = seen[seen.length - 1]!;
      expect(last.searchParams.get("event_type")).toBe("deal.created");
    });
  });

  it("opens a detail panel for a row", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText("deal.created")).toBeInTheDocument());

    await user.click(screen.getByText("deal.created"));

    const panel = await waitFor(() => {
      const el = document.querySelector('[data-panel="event-detail"]');
      expect(el).toBeTruthy();
      return el!;
    });
    expect(panel.textContent).toContain("flow-1");
  });

  it("shows a real empty state rather than an error", async () => {
    server.use(http.get(`${API}/events`, () => HttpResponse.json({ events: [] })));
    renderScreen();

    await waitFor(() =>
      expect(document.querySelector('[data-state="empty"]')?.textContent).toMatch(/no events match/i),
    );
  });

  // A bare 403 tells an operator nothing they can act on.
  it("explains what to do under a buyer key instead of showing a 403", async () => {
    await connectAs("buyer");
    server.use(http.get(`${API}/events`, () => new HttpResponse(null, { status: 403 })));
    renderScreen();

    const notice = await waitFor(() => {
      const el = document.querySelector('[data-state="operator-required"]');
      expect(el).toBeTruthy();
      return el!;
    });

    expect(
      within(notice as HTMLElement).getByText("This screen needs an operator key"),
    ).toBeInTheDocument();
    expect(notice.textContent).toMatch(/sign out and connect with an operator key/i);
    // And no bare status code leaking into the UI.
    expect(document.body.textContent).not.toMatch(/\b403\b/);
  });

  it("keeps showing the last events when a refresh fails", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("deal.created")).toBeInTheDocument());

    server.use(http.get(`${API}/events`, () => HttpResponse.error()));
    // Force a refetch.
    document.dispatchEvent(new Event("visibilitychange"));

    // The rows stay; the caption is what changes.
    expect(screen.getByText("deal.created")).toBeInTheDocument();
  });
});
