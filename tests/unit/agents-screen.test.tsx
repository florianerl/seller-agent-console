import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import AgentsScreen from "../../src/screens/Agents";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetReachability } from "../../src/query/reachability";

const AGENTS = [
  {
    agent_id: "agent-console-demo-1",
    agent_type: "buyer",
    trust_status: "preferred",
    registry_sources: [
      {
        registry_id: "reg-1",
        registry_name: "AdCP Registry",
        verified_at: "2026-08-01T00:00:00Z",
      },
    ],
    registered_at: "2026-01-01T00:00:00Z",
    last_seen: "2026-09-16T00:00:00Z",
    interaction_count: 4,
    agent_card: { name: "Demo Buyer", url: "https://buyer.example" },
  },
  {
    agent_id: "agent-console-demo-2",
    agent_type: "buyer",
    trust_status: "approved",
    registry_sources: [],
    registered_at: "2026-02-01T00:00:00Z",
    last_seen: "2026-09-15T00:00:00Z",
    interaction_count: 0,
    agent_card: { name: "Unverified Buyer", url: "https://unverified.example" },
  },
];

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
          <AgentsScreen />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

describe("the agents screen", () => {
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
      http.get(`${API}/registry/agents`, () =>
        HttpResponse.json({ agents: AGENTS, total: AGENTS.length }),
      ),
    );
  });

  it("lists agents with a distinctive agent id", async () => {
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText("agent-console-demo-1")).toBeInTheDocument(),
    );
  });

  it("shows a real empty state, not an error, for a seller with no agents", async () => {
    server.use(
      http.get(`${API}/registry/agents`, () =>
        HttpResponse.json({ agents: [], total: 0 }),
      ),
    );
    renderScreen();

    await waitFor(() =>
      expect(
        document.querySelector('[data-state="empty"]')?.textContent,
      ).toMatch(/no agents have registered yet/i),
    );
    expect(document.body.textContent).not.toMatch(
      /could not reach|unavailable/i,
    );
  });

  it("degrades the list without crashing when a field changes upstream", async () => {
    server.use(
      http.get(`${API}/registry/agents`, () =>
        // agent_id renamed upstream.
        HttpResponse.json({
          agents: [{ id: "A-X", trust_status: "unknown" }],
          total: 1,
        }),
      ),
    );
    renderScreen();

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/unexpected response shape/i),
    );
  });

  /**
   * trust_status is this operator's own decision; a registry source is an
   * external registry's claim. Collapsing them into one badge would let our
   * own judgement borrow someone else's authority, or the reverse.
   */
  it("renders trust status and registry verification in separate columns", async () => {
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText("agent-console-demo-1")).toBeInTheDocument(),
    );

    const row = screen.getByText("agent-console-demo-1").closest("tr")!;
    const trustCell = row.querySelector('[data-status="preferred"]');
    const registryCell = row.querySelector('[data-cell="registry"]');
    expect(trustCell).toBeTruthy();
    expect(registryCell).toBeTruthy();
    expect(registryCell).not.toBe(trustCell);
    expect(registryCell!.textContent).toContain("AdCP Registry");
  });

  it("shows an agent with no registry sources as not in any registry, not verified", async () => {
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText("Unverified Buyer")).toBeInTheDocument(),
    );

    const row = screen.getByText("Unverified Buyer").closest("tr")!;
    const registryCell = row.querySelector('[data-cell="registry"]');
    expect(registryCell?.textContent).toMatch(/not in any registry/i);
  });

  /**
   * An agent that never served an agent card has no name. Printing its id as
   * both the name and the id reads as a rendering fault rather than as an
   * absence, and it made `getByText(agentId)` ambiguous while these tests were
   * being written — which is how it was noticed.
   */
  it("shows the id once, not twice, when an agent has no agent card", async () => {
    server.use(
      http.get(`${API}/registry/agents`, () =>
        HttpResponse.json({
          agents: [
            {
              agent_id: "agent-nameless",
              agent_type: "buyer",
              trust_status: "unknown",
              registry_sources: [],
              registered_at: "2026-09-01T00:00:00Z",
              last_seen: null,
              interaction_count: 0,
              agent_card: null,
            },
          ],
          total: 1,
        }),
      ),
    );
    renderScreen();

    await waitFor(() =>
      expect(document.querySelector('[data-row="agent"]')).toBeTruthy(),
    );
    expect(screen.getAllByText("agent-nameless")).toHaveLength(1);
  });
});
