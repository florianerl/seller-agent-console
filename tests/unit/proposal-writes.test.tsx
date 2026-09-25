import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { API, server } from "../setup/msw";
import { OPENPROPOSAL_PROTOCOL } from "../../src/api/capabilities";
import { card, connect, renderScreen, WHOLE } from "../fixtures/proposals-harness";

/**
 * Lifecycle writes on an OpenProposal record. The question each one has to
 * answer is different from the other screens': a timeout on publish or assent
 * may have landed, so a retry must be recognisably the same attempt, and a
 * record that moved under the operator must refuse rather than overwrite.
 */

const ID = "newscorp-us-q4-2026-omni";

function serve(proposal: object) {
  server.use(
    http.get(`${API}/.well-known/agent.json`, () => HttpResponse.json(card([OPENPROPOSAL_PROTOCOL]))),
    http.get(`${API}/api/v3/proposals`, () => HttpResponse.json({ proposals: [proposal], total: 1 })),
    http.get(`${API}/api/v3/proposals/${ID}`, () => HttpResponse.json(proposal)),
  );
}

function captureWrites(): { method: string; path: string; body: Record<string, unknown> }[] {
  const writes: { method: string; path: string; body: Record<string, unknown> }[] = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "GET") return;
    writes.push({
      method: request.method,
      path: new URL(request.url).pathname,
      body: (await request.clone().json()) as Record<string, unknown>,
    });
  });
  return writes;
}

async function openDetail(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Details" }));
  await screen.findByText("wsj-display");
}

const click = (selector: string) => document.querySelector(selector) as HTMLElement;

afterEach(() => server.events.removeAllListeners());

describe("proposal lifecycle writes", () => {
  beforeEach(() => serve({ ...WHOLE, status: "draft", version: 3 }));

  it("offers publish on a draft but sends nothing while writes are off", async () => {
    await connect(false);
    const writes = captureWrites();
    const user = userEvent.setup();
    renderScreen();
    await openDetail(user);

    expect(click('[data-action="publish-proposal"]')).toBeDisabled();
    expect(document.querySelector('[data-action="withdraw-proposal"]')).toBeNull();
    expect(document.querySelector('[data-note="read-only"]')).toBeTruthy();
    expect(writes).toEqual([]);
  });

  it("asks first, then publishes with an idempotency key and the version on screen", async () => {
    await connect(true);
    const writes = captureWrites();
    server.use(http.post(`${API}/api/v3/proposals/${ID}/publish`, () => HttpResponse.json({ ok: true })));
    const user = userEvent.setup();
    renderScreen();
    await openDetail(user);

    await user.click(click('[data-action="publish-proposal"]'));
    expect((await screen.findByRole("dialog")).textContent).toMatch(/discover version 3/);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(writes).toEqual([]);

    await user.click(click('[data-action="publish-proposal"]'));
    await user.click(click('[data-action="confirm-mutation"]'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      method: "POST",
      path: `/api/v3/proposals/${ID}/publish`,
      body: { expected_version: 3 },
    });
    expect(typeof writes[0]?.body["idempotency_key"]).toBe("string");
  });

  it("retries a publish whose outcome is unknown with the same key", async () => {
    await connect(true);
    const writes = captureWrites();
    let attempts = 0;
    server.use(
      http.post(`${API}/api/v3/proposals/${ID}/publish`, () => {
        attempts += 1;
        return attempts === 1 ? HttpResponse.error() : HttpResponse.json({ ok: true });
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await openDetail(user);

    for (let i = 0; i < 2; i += 1) {
      await user.click(click('[data-action="publish-proposal"]'));
      await user.click(click('[data-action="confirm-mutation"]'));
      await waitFor(() => expect(writes).toHaveLength(i + 1));
      await waitFor(() => expect(click('[data-action="publish-proposal"]')).not.toBeDisabled());
    }

    expect(writes[1]?.body["idempotency_key"]).toBe(writes[0]?.body["idempotency_key"]);
  });

  it("says the record moved when the agent answers 409, rather than just failing", async () => {
    await connect(true);
    server.use(
      http.post(`${API}/api/v3/proposals/${ID}/publish`, () => new HttpResponse(null, { status: 409 })),
    );
    const user = userEvent.setup();
    renderScreen();
    await openDetail(user);

    await user.click(click('[data-action="publish-proposal"]'));
    await user.click(click('[data-action="confirm-mutation"]'));
    expect(await screen.findByText(/changed since this screen loaded it/)).toBeInTheDocument();
  });
});

describe("assent on a version under review", () => {
  beforeEach(() =>
    serve({
      ...WHOLE,
      status: "under_review",
      version: 4,
      negotiation_history: [
        { version: 3, actor: "seller", action: "proposed", fields_changed: [], at: "2026-09-20T10:00:00Z" },
        { version: 4, actor: "buyer", action: "countered", fields_changed: ["materials_due"], at: "2026-09-21T10:00:00Z" },
      ],
    }),
  );

  it("names what the buyer changed and what accepting makes binding", async () => {
    await connect(true);
    const writes = captureWrites();
    server.use(http.post(`${API}/api/v3/proposals/${ID}/assent`, () => HttpResponse.json({ ok: true })));
    const user = userEvent.setup();
    renderScreen();
    await openDetail(user);

    expect(document.querySelector('[data-block="assent-ask"]')?.textContent).toMatch(
      /countered on version 4, changing materials_due/,
    );
    expect(document.querySelector('[data-action="publish-proposal"]')).toBeNull();

    await user.click(click('[data-action="assent-accept"]'));
    expect((await screen.findByRole("dialog")).textContent).toMatch(/version 4 binding/);
    await user.click(click('[data-action="confirm-mutation"]'));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      path: `/api/v3/proposals/${ID}/assent`,
      body: { decision: "accept", expected_version: 4 },
    });
  });
});

describe("holds", () => {
  it("offers release only on a line item that is held", async () => {
    await connect(true);
    serve({ ...WHOLE, status: "published", version: 2 });
    const writes = captureWrites();
    server.use(
      http.post(`${API}/api/v3/proposals/${ID}/line-items/fox-ctv/hold`, () => HttpResponse.json({ ok: true })),
    );
    const user = userEvent.setup();
    renderScreen();
    await openDetail(user);

    // The CTV example is held; the display example's hold state is "none".
    expect(document.querySelector('[data-block="hold-writes:fox-ctv"] [data-action="release-hold"]')).toBeTruthy();
    expect(document.querySelector('[data-block="hold-writes:wsj-display"]')).toBeNull();

    await user.click(click('[data-block="hold-writes:fox-ctv"] [data-action="release-hold"]'));
    await user.click(click('[data-action="confirm-mutation"]'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ body: { action: "release", expected_version: 2 } });
  });
});
