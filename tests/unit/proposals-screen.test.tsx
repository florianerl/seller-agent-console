import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { API, server } from "../setup/msw";
import { OPENPROPOSAL_PROTOCOL } from "../../src/api/capabilities";
import display from "../fixtures/openproposal/line-item-display.json";
import { card, connect, renderScreen, WHOLE } from "../fixtures/proposals-harness";

/**
 * Every request, seen at the transport rather than at a handler, so no handler
 * installed later can hide one. This is what "sends nothing to /api/v3" is
 * asserted against.
 */
function watchWire(): string[] {
  const seen: string[] = [];
  server.events.on("request:start", ({ request }) => {
    seen.push(`${request.method} ${new URL(request.url).pathname}`);
  });
  return seen;
}

afterEach(() => server.events.removeAllListeners());

describe("against an agent that does not speak OpenProposal", () => {
  beforeEach(() => connect());

  it("says what the agent does advertise, and sends nothing to /api/v3", async () => {
    const wire = watchWire();
    server.use(http.get(`${API}/.well-known/agent.json`, () => HttpResponse.json(card(["opendirect21"]))));

    renderScreen();
    const notice = await screen.findByText(/does not advertise OpenProposal 3\.0/);
    expect(notice.closest("[data-state]")?.textContent).toContain("opendirect21");

    expect(wire).toContain("GET /.well-known/agent.json");
    expect(wire.filter((line) => line.includes("/api/v3"))).toEqual([]);
  });

  it("does not guess when the card itself cannot be read", async () => {
    const wire = watchWire();
    server.use(http.get(`${API}/.well-known/agent.json`, () => new HttpResponse(null, { status: 500 })));

    renderScreen();
    await screen.findByText(/Could not tell whether this agent speaks OpenProposal/);
    expect(document.querySelector('[data-state="protocol-unknown"]')?.textContent).toContain("500");
    expect(wire.filter((line) => line.includes("/api/v3"))).toEqual([]);
  });
});

describe("against an agent that advertises OpenProposal 3.0", () => {
  beforeEach(async () => {
    await connect();
    server.use(
      http.get(`${API}/.well-known/agent.json`, () =>
        HttpResponse.json(card(["opendirect21", OPENPROPOSAL_PROTOCOL])),
      ),
      http.get(`${API}/api/v3/proposals`, () => HttpResponse.json({ proposals: [WHOLE], total: 1 })),
      http.get(`${API}/api/v3/proposals/newscorp-us-q4-2026-omni`, () => HttpResponse.json(WHOLE)),
    );
  });

  it("lists the proposal with its channels and a freshness stamp", async () => {
    renderScreen();
    expect(await screen.findByText("newscorp-us-q4-2026-omni")).toBeInTheDocument();
    expect(screen.getByText(/display, ctv, audio/)).toBeInTheDocument();
    expect(document.querySelector('[data-freshness="live"]')?.textContent).toMatch(/1 proposal/);
  });

  it("shows each line item on its own terms, including one sold out under a published proposal", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Details" }));
    await screen.findByText("wsj-display");

    const lifecycle = document.querySelector('[data-block="lifecycle"]');
    expect(lifecycle?.querySelector('[data-status="published"]')).toBeTruthy();
    const soldOut = document.querySelector('[data-line-item="fox-ctv"] [data-status="sold_out"]');
    expect(soldOut).toBeTruthy();

    // The two windows the spec warns are easy to conflate are labelled apart.
    expect(screen.getByText("Offer window (not the flight)")).toBeInTheDocument();
    expect(screen.getAllByText("Flight (not the offer window)").length).toBeGreaterThan(0);
  });

  it("shows a catalog reference as unresolved rather than as a value", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Details" }));
    await screen.findByText("wsj-display");

    const refs = document.querySelectorAll('[data-state="unresolved-ref"]');
    expect(refs).toHaveLength(1);
    expect(refs[0]?.textContent).toContain("newscorp/audiences/smb-decision-makers@3");
    // A published proposal may carry refs; only an agreed one may not.
    expect(document.querySelector('[data-state="agreed-with-refs"]')).toBeNull();
  });

  it("quotes the spec's markers and maps execution to its downstream standard", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Details" }));
    await screen.findByText("wsj-display");

    const display = document.querySelector('[data-line-item="wsj-display"]') as HTMLElement;
    expect(display.querySelector('[data-field="audiences"] [data-marker="selectable"]')).toBeTruthy();
    expect(display.querySelector('[data-field="geo"] [data-marker="settable"]')).toBeTruthy();
    expect(display.querySelector('[data-block="downstream"]')?.textContent).toContain(
      "OpenDirect 2.1 + Deals API",
    );
  });

  it("flags an agreed proposal that still carries a catalog reference", async () => {
    server.use(
      http.get(`${API}/api/v3/proposals/newscorp-us-q4-2026-omni`, () =>
        HttpResponse.json({ ...WHOLE, status: "agreed" }),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Details" }));
    expect(await screen.findByText(/agreed but still carries catalog references/)).toBeInTheDocument();
  });

  it("counts a line item it cannot read instead of silently dropping it", async () => {
    server.use(
      http.get(`${API}/api/v3/proposals/newscorp-us-q4-2026-omni`, () =>
        HttpResponse.json({ ...WHOLE, line_items: [display, { channel: "video" }] }),
      ),
    );
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Details" }));
    const alert = await screen.findByText(/could not be read and is not shown/);
    expect(alert.textContent).toMatch(/1 line item/);
  });

  it("explains a rejected key rather than showing an empty list", async () => {
    server.use(http.get(`${API}/api/v3/proposals`, () => new HttpResponse(null, { status: 403 })));
    renderScreen();
    await waitFor(() => expect(document.querySelector('[data-state="operator-required"]')).toBeTruthy());
  });
});
