import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { API, server } from "../setup/msw";
import {
  connect,
  renderScreen,
  serveNoOpenProposal,
  serveOpenProposal,
  THREAD,
  THREAD_ID,
  watchWire,
} from "../fixtures/proposals-harness";
import mapped from "../fixtures/openproposal/agent/mapped-line-item.json";
import batch from "../fixtures/openproposal/agent/mapped-batch.json";
import { GAM_LINE_ITEM_EXAMPLE } from "../../src/screens/opExamples";

const opTraffic = (wire: string[]) => wire.filter((line) => line.includes("/op-"));

afterEach(() => server.events.removeAllListeners());

describe("against an agent without OpenProposal", () => {
  beforeEach(() => connect());

  it("says what it asked and what came back, and sends nothing else", async () => {
    const wire = watchWire();
    serveNoOpenProposal();

    renderScreen();
    const notice = await screen.findByText(/This agent does not serve OpenProposal/);
    expect(notice.closest("[data-state]")?.textContent).toContain("404");

    expect(opTraffic(wire)).toEqual(["GET /api/v1/op-gam/line-item/field-map"]);
    expect(wire.filter((line) => line.includes("/api/v3"))).toEqual([]);
  });

  it("does not guess when the probe itself fails", async () => {
    const wire = watchWire();
    server.use(http.get(`${API}/api/v1/op-gam/line-item/field-map`, () => new HttpResponse(null, { status: 500 })));

    renderScreen();
    await screen.findByText(/Could not tell whether this agent serves OpenProposal/);
    expect(document.querySelector('[data-state="protocol-unknown"]')?.textContent).toContain("500");
    expect(opTraffic(wire)).toEqual(["GET /api/v1/op-gam/line-item/field-map"]);
  });
});

describe("against an agent that serves OpenProposal", () => {
  beforeEach(async () => {
    await connect();
    serveOpenProposal();
  });

  it("shows the agent's field map, filterable by how a field lands", async () => {
    const user = userEvent.setup();
    renderScreen();
    const map = await screen.findByText("GAM field map");
    const section = map.closest("section") as HTMLElement;
    expect(section.querySelectorAll("[data-gam-field]")).toHaveLength(0);
    await user.click(await within(section).findByRole("button", { name: "Show all 96 rules" }));
    await waitFor(() => expect(section.querySelectorAll("[data-gam-field]")).toHaveLength(96));
    expect(section.querySelector('[data-gam-field="priority"] [data-field-status="no_home"]')).toBeTruthy();
  });

  it("maps a pasted GAM line item with writes off, and shows what the trip lost", async () => {
    const bodies: unknown[] = [];
    const queries: string[] = [];
    server.use(
      http.post(`${API}/api/v1/op-gam/line-item`, async ({ request }) => {
        queries.push(new URL(request.url).search);
        bodies.push(await request.json());
        return HttpResponse.json(mapped);
      }),
    );
    const user = userEvent.setup();
    renderScreen();

    const mapping = (await screen.findByText("Map from Google Ad Manager")).closest("section") as HTMLElement;
    await user.click(within(mapping).getByRole("button", { name: /Load the agent's example/ }));
    await user.click(within(mapping).getByRole("button", { name: "Map to OpenProposal" }));

    await waitFor(() => expect(bodies).toEqual([GAM_LINE_ITEM_EXAMPLE]));
    expect(queries).toEqual(["?explain=true"]);

    const result = await screen.findByText("gam-li-7202154879");
    const card = result.closest("[data-line-item]") as HTMLElement;
    // Where each value came from is the agent's word, shown beside the spec's marker.
    expect(card.querySelector('[data-field="audiences"] [data-source="not_available"]')).toBeTruthy();
    expect(card.querySelector('[data-field="formats"] [data-source="ad_server"]')).toBeTruthy();
    // The flight is zone-bracketed upstream; it is shown as sent, not re-read in this zone.
    expect(card.textContent).toContain("2026-03-01T00:00:00[America/New_York]");

    const report = document.querySelector('[data-block="mapped-line-item"]') as HTMLElement;
    expect(report.querySelector('[data-problem="lifecycle_mismatch"]')).toBeTruthy();
    expect(report.querySelector('[data-gam-field="priority"]')?.textContent).toContain("8");
  });

  it("refuses to send what is not JSON", async () => {
    const sent: string[] = [];
    server.use(
      http.post(`${API}/api/v1/op-gam/line-item`, () => {
        sent.push("map");
        return HttpResponse.json(mapped);
      }),
    );
    const user = userEvent.setup();
    renderScreen();

    const box = await screen.findByLabelText("GAM payload (JSON)");
    fireEvent.change(box, { target: { value: "{ not json" } });
    await user.click(screen.getByRole("button", { name: "Map to OpenProposal" }));

    expect(await screen.findByText(/Not JSON/)).toBeInTheDocument();
    expect(sent).toEqual([]);
  });

  it("names the line items a batch could not map, and why", async () => {
    server.use(http.post(`${API}/api/v1/op-gam/line-items`, () => HttpResponse.json(batch)));
    const user = userEvent.setup();
    renderScreen();

    const mapping = (await screen.findByText("Map from Google Ad Manager")).closest("section") as HTMLElement;
    await user.click(within(mapping).getByLabelText("Payload"));
    await user.click(await screen.findByRole("option", { name: "A LineItemService export" }));
    await user.click(within(mapping).getByRole("button", { name: /Load the agent's example/ }));
    await user.click(within(mapping).getByRole("button", { name: "Map to OpenProposal" }));

    const unmappable = await screen.findByText(/not mapped: HOUSE line items are not a sale/);
    expect(unmappable.closest("[data-batch-result]")?.getAttribute("data-batch-result")).toBe("1001");
    expect(document.querySelector('[data-block="mapped-batch"]')?.textContent).toMatch(/1 of 2/);
  });

  it("lists every reason a many-to-one request was refused", async () => {
    server.use(
      http.post(`${API}/api/v1/op-many-to-one/proposal`, () =>
        HttpResponse.json(
          {
            detail: {
              error: "invalid_many_to_one",
              errors: ["line item weather-ctv mixes two channels", "line item x has no objects"],
            },
          },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderScreen();

    const builder = (await screen.findByText("Build a proposal from several ad servers")).closest("section") as HTMLElement;
    await user.click(within(builder).getByRole("button", { name: /Load the agent's example/ }));
    await user.click(within(builder).getByRole("button", { name: "Build proposal" }));

    const refused = await screen.findByText(/mixes two channels/);
    expect(refused.closest('[data-state="mapping-refused"]')?.textContent).toContain("has no objects");
  });
});

describe("negotiation threads", () => {
  beforeEach(async () => {
    await connect();
    serveOpenProposal();
    server.use(http.get(`${API}/api/v1/op-negotiations/${THREAD_ID}`, () => HttpResponse.json(THREAD)));
  });

  it("says the list is this browser's, since the agent has none", async () => {
    renderScreen();
    expect(await screen.findByText(/None yet/)).toBeInTheDocument();
    expect(document.querySelector('[data-block="recent-threads"]')?.textContent).toMatch(/agent has no list of threads/);
  });

  it("reads a pasted thread, shows both sides of it, and remembers it", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(await screen.findByLabelText("Negotiation id"), THREAD_ID);
    await user.click(screen.getByRole("button", { name: "Read thread" }));

    const history = await screen.findByText(/Concession of 3\.7%/);
    const log = history.closest('[data-block="thread-history"]') as HTMLElement;
    expect([...log.querySelectorAll("[data-actor]")].map((e) => e.getAttribute("data-actor"))).toEqual(["buyer", "seller"]);
    expect(document.querySelector('[data-block="thread-summary"]')?.textContent).toContain("USD 39.00");

    await waitFor(() => expect(document.querySelector(`[data-recent-thread="${THREAD_ID}"]`)).toBeTruthy());
  });

  it("explains a thread it cannot see without calling it an outage", async () => {
    server.use(
      http.get(`${API}/api/v1/op-negotiations/opn-nope`, () =>
        HttpResponse.json({ detail: { error: "negotiation_not_found", message: "Negotiation 'opn-nope' not found." } }, { status: 404 }),
      ),
    );
    const user = userEvent.setup();
    renderScreen();

    await user.type(await screen.findByLabelText("Negotiation id"), "opn-nope");
    await user.click(screen.getByRole("button", { name: "Read thread" }));

    expect(await screen.findByText(/visible only to the key that opened them/)).toBeInTheDocument();
  });
});
