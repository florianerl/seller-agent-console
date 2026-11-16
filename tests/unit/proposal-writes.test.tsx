import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { API, server } from "../setup/msw";
import { connect, renderScreen, serveOpenProposal, THREAD, THREAD_ID } from "../fixtures/proposals-harness";

/**
 * Negotiation moves are a buyer's moves, made by the operator testing their
 * own agent. The questions each one has to answer: nothing goes out while the
 * switch is off; a move names the version it answers, so one made against a
 * counter the operator has not seen is refused; a retry after a lost response
 * is the same attempt; and commit — which books a real deal — says so before
 * it is sent.
 */

type Sent = { path: string; body: Record<string, unknown> };

function captureWrites(): Sent[] {
  const writes: Sent[] = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method !== "POST") return;
    writes.push({ path: new URL(request.url).pathname, body: (await request.clone().json()) as Record<string, unknown> });
  });
  return writes;
}

const click = (selector: string) => document.querySelector(selector) as HTMLElement;

function serveThread(thread: object) {
  server.use(http.get(`${API}/api/v1/op-negotiations/${THREAD_ID}`, () => HttpResponse.json(thread)));
}

async function readThread(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Negotiation id"), THREAD_ID);
  await user.click(screen.getByRole("button", { name: "Read thread" }));
  await screen.findByText(/Concession of 3\.7%/);
}

afterEach(() => server.events.removeAllListeners());

describe("opening a thread", () => {
  beforeEach(() => serveOpenProposal());

  it("sends every field the agent takes, then shows the thread it opened", async () => {
    await connect(true);
    const writes = captureWrites();
    server.use(
      http.post(`${API}/api/v1/op-negotiations`, () => HttpResponse.json(THREAD, { status: 201 })),
      http.get(`${API}/api/v1/op-negotiations/${THREAD_ID}`, () => HttpResponse.json(THREAD)),
    );
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Ask for a price" }));
    await user.type(screen.getByLabelText("Proposal id"), "examplepub-standard");
    await user.type(screen.getByLabelText("Line item (product id)"), "inv-ctv-apex-series");
    await user.click(click('[data-action="wizard-next"]'));
    await user.type(screen.getByLabelText("Impressions"), "500000");
    await user.type(screen.getByLabelText("Requested CPM"), "36");
    await user.click(click('[data-action="wizard-next"]'));
    await user.type(screen.getByLabelText("Seat id (optional)"), "seat-demo");
    await user.click(click('[data-action="wizard-next"]'));

    expect(screen.getByRole("dialog").textContent).toMatch(/owned by this key/);
    await user.click(click('[data-action="wizard-create"]'));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      path: "/api/v1/op-negotiations",
      body: {
        proposal_id: "examplepub-standard",
        version: 1,
        line_item_id: "inv-ctv-apex-series",
        transaction_mechanism: "PREFERRED_DEAL",
        commitment: { basis: "units", amount: 500000 },
        requested_rate: 36,
        buyer_identity: { seat_id: "seat-demo" },
      },
    });
    expect(typeof writes[0]?.body["idempotency_key"]).toBe("string");
    // Blank optional fields stay off the wire.
    expect(writes[0]?.body["commitment"]).not.toHaveProperty("flight_start");

    await user.click(click('[data-action="wizard-done"]'));
    expect(await screen.findByText(/Concession of 3\.7%/)).toBeInTheDocument();
    expect(document.querySelector(`[data-recent-thread="${THREAD_ID}"]`)).toBeTruthy();
  });

  it("offers no way to open a thread while writes are off", async () => {
    await connect(false);
    const writes = captureWrites();
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Ask for a price" }));
    await user.type(screen.getByLabelText("Proposal id"), "p");
    await user.type(screen.getByLabelText("Line item (product id)"), "prod-1");
    await user.click(click('[data-action="wizard-next"]'));
    await user.type(screen.getByLabelText("Impressions"), "1000");
    await user.type(screen.getByLabelText("Requested CPM"), "10");
    await user.click(click('[data-action="wizard-next"]'));
    await user.click(click('[data-action="wizard-next"]'));

    expect(click('[data-action="wizard-create"]')).toBeDisabled();
    expect(writes).toEqual([]);
  });
});

describe("moving on an open thread", () => {
  beforeEach(() => {
    serveOpenProposal();
    serveThread(THREAD);
  });

  it("disables every move while writes are off, and sends nothing", async () => {
    await connect(false);
    const writes = captureWrites();
    const user = userEvent.setup();
    renderScreen();
    await readThread(user);

    for (const action of ["op-counter", "op-accept", "op-decline", "op-withdraw"]) {
      expect(click(`[data-action="${action}"]`)).toBeDisabled();
    }
    expect(document.querySelector('[data-note="read-only"]')).toBeTruthy();
    expect(writes).toEqual([]);
  });

  it("counters against the version on screen, and reuses the key when the answer was lost", async () => {
    await connect(true);
    const writes = captureWrites();
    let attempts = 0;
    server.use(
      http.post(`${API}/api/v1/op-negotiations/${THREAD_ID}/messages`, () => {
        attempts += 1;
        return attempts === 1 ? HttpResponse.error() : HttpResponse.json({ ...THREAD, version: 3 });
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await readThread(user);

    await user.type(screen.getByLabelText("Requested CPM"), "37");
    const counter = async () => {
      await user.click(click('[data-action="op-counter"]'));
      expect(screen.getByRole("dialog").textContent).toMatch(/against version 2/);
      await user.click(click('[data-action="confirm-mutation"]'));
    };

    await counter();
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(await screen.findByText("could not reach the agent")).toBeInTheDocument();
    await counter();
    await waitFor(() => expect(writes).toHaveLength(2));

    expect(writes[0]?.body).toMatchObject({ version: 2, action: "counter", requested_rate: 37 });
    expect(writes[1]?.body["idempotency_key"]).toBe(writes[0]?.body["idempotency_key"]);
  });

  it("says the seller moved first when the agent answers stale_version", async () => {
    await connect(true);
    server.use(
      http.post(`${API}/api/v1/op-negotiations/${THREAD_ID}/messages`, () =>
        HttpResponse.json(
          { detail: { error: "stale_version", message: "Version 2 is stale; the current version is 3.", current_version: 3 } },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await readThread(user);

    await user.click(click('[data-action="op-accept"]'));
    expect(screen.getByRole("dialog").textContent).toMatch(/Nothing is booked yet/);
    await user.click(click('[data-action="confirm-mutation"]'));

    const note = await screen.findByText(/it is at version 3 now/);
    expect(note.getAttribute("data-state")).toBe("refused-stale_version");
  });
});

describe("committing an accepted thread", () => {
  const ACCEPTED = {
    ...THREAD,
    state: "accepted",
    negotiation_history: [
      ...THREAD.negotiation_history,
      { version: 2, actor: "buyer", action: "accepted", fields_changed: [], at: "2026-11-16T10:05:00Z", ext: { rate: 39 } },
    ],
  };

  beforeEach(() => {
    serveOpenProposal();
    serveThread(ACCEPTED);
  });

  it("offers only commit, says it books a real deal, and sends the version", async () => {
    await connect(true);
    const writes = captureWrites();
    server.use(
      http.post(`${API}/api/v1/op-negotiations/${THREAD_ID}/commit`, () =>
        HttpResponse.json({
          ...ACCEPTED,
          state: "committed",
          line_item: {
            ...ACCEPTED.line_item,
            status: "agreed",
            external_references: [
              ...ACCEPTED.line_item.external_references,
              { system: "seller-agent", id: "D-77", role: "deal" },
            ],
          },
        }),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await readThread(user);

    expect(document.querySelector('[data-action="op-counter"]')).toBeNull();
    await user.click(click('[data-action="op-commit"]'));
    expect(screen.getByRole("dialog").textContent).toMatch(/Books a real deal at USD 39\.00/);
    await user.click(click('[data-action="confirm-mutation"]'));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ path: `/api/v1/op-negotiations/${THREAD_ID}/commit`, body: { version: 2 } });
  });
});
