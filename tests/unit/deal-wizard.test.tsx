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
import { resetWritePolicy } from "../../src/api/policy";
import { resetReachability } from "../../src/query/reachability";
import { DealWizard } from "../../src/screens/DealWizard";
import { OPENPROPOSAL_PROTOCOL } from "../../src/api/capabilities";
import { card, WHOLE } from "../fixtures/proposals-harness";

/**
 * The wizard replaced four forms, each of which had its own test of the body
 * that goes on the wire. Those bodies are what is pinned here: that is where
 * the old mistakes (a long deal-type name, a missing field) lived.
 */

function mount() {
  return render(
    <SWRConfig
      value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, compare: sameResult }}
    >
      <ThemeProvider theme={theme}>
        <CredentialProvider>
          <DealWizard open onClose={() => undefined} />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

function capture(path: string, reply: unknown = {}, status = 200, method: "post" = "post") {
  const bodies: Record<string, unknown>[] = [];
  server.use(
    http[method](`${API}${path}`, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json(reply as Record<string, unknown>, { status });
    }),
  );
  return bodies;
}

const next = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Next" }));

async function pick(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(await screen.findByRole("radio", { name: new RegExp(title) }));
  await next(user);
}

async function createButton() {
  return waitFor(() => {
    const el = screen.getByRole("button", { name: "Create deal" });
    expect(el).toBeEnabled();
    return el;
  });
}

describe("the new-deal wizard", () => {
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

  it("will not leave the details step until what the route needs is filled in", async () => {
    const user = userEvent.setup();
    mount();

    await pick(user, "Book an existing quote");

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await user.type(screen.getByLabelText("Quote id"), "qt-1");
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("books a quote with an idempotency key, and shows what it will do first", async () => {
    const sent = capture("/api/v1/deals", { deal: { deal_id: "D-1" } });
    const user = userEvent.setup();
    mount();

    await pick(user, "Book an existing quote");
    await user.type(screen.getByLabelText("Quote id"), "qt-1");
    await next(user);

    expect(screen.getByText("qt-1")).toBeInTheDocument();
    expect(screen.getByText(/commit|bound/i)).toBeInTheDocument();
    expect(sent).toHaveLength(0);

    await user.click(await createButton());

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ quote_id: "qt-1" });
    expect(typeof sent[0]!["idempotency_key"]).toBe("string");
    expect(await screen.findByText(/agent accepted/i)).toBeInTheDocument();
  });

  it("quotes first, shows the rate, and only then books that quote", async () => {
    const quotes = capture("/api/v1/quotes", {
      quote: {
        quote_id: "qt-9",
        pricing: { final_cpm: { amount_micros: 6_800_000, currency: "USD" } },
        expires_at: "2026-10-28T13:25:43Z",
      },
    });
    const deals = capture("/api/v1/deals", { deal: { deal_id: "D-9" } });
    const user = userEvent.setup();
    mount();

    // Quote, then book is the default route.
    await user.click(await screen.findByRole("button", { name: "Next" }));
    await user.type(screen.getByRole("combobox", { name: "Product id" }), "prod-1");
    await user.click(screen.getByLabelText("Media type"));
    await user.click(await screen.findByRole("option", { name: "ctv" }));
    await next(user);

    await user.click(await screen.findByRole("button", { name: "Get quote" }));
    await waitFor(() => expect(quotes).toHaveLength(1));
    expect(quotes[0]).toMatchObject({ product_id: "prod-1", deal_type: "PD", media_type: "ctv" });
    expect(quotes[0]).not.toHaveProperty("impressions");

    // The price is on screen, and nothing has been booked.
    expect(await screen.findByText("qt-9")).toBeInTheDocument();
    expect(screen.getByText(/\$6\.80 CPM/)).toBeInTheDocument();
    expect(deals).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Book deal" }));
    await waitFor(() => expect(deals).toHaveLength(1));
    expect(deals[0]).toMatchObject({ quote_id: "qt-9" });
    await waitFor(() =>
      expect(document.querySelector('[data-state="write-ok"]')?.textContent).toContain("D-9"),
    );
  });

  it("asks for impressions before quoting a guaranteed deal", async () => {
    const quotes = capture("/api/v1/quotes", { quote: { quote_id: "qt-1" } });
    const user = userEvent.setup();
    mount();

    await next(user);
    await user.type(screen.getByRole("combobox", { name: "Product id" }), "prod-1");
    await user.click(screen.getByLabelText("Deal type"));
    await user.click(await screen.findByRole("option", { name: "PG — programmatic guaranteed" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await user.type(screen.getByLabelText("Impressions"), "250000");
    await next(user);
    await user.click(await screen.findByRole("button", { name: "Get quote" }));

    await waitFor(() => expect(quotes[0]).toMatchObject({ deal_type: "PG", impressions: 250_000 }));
  });

  it("drops a quote when the request behind it changes, instead of booking a stale price", async () => {
    capture("/api/v1/quotes", { quote: { quote_id: "qt-1" } });
    const user = userEvent.setup();
    mount();

    await next(user);
    await user.type(screen.getByRole("combobox", { name: "Product id" }), "prod-1");
    await next(user);
    await user.click(await screen.findByRole("button", { name: "Get quote" }));
    expect(await screen.findByRole("button", { name: "Book deal" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.type(screen.getByRole("combobox", { name: "Product id" }), "2");
    await next(user);

    expect(await screen.findByRole("button", { name: "Get quote" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Book deal" })).toBeNull();
  });

  it("can show the quote before booking it, and only fetches it when asked", async () => {
    const reads: string[] = [];
    server.use(
      http.get(`${API}/api/v1/quotes/:id`, ({ params }) => {
        reads.push(String(params["id"]));
        return HttpResponse.json({
          quote: {
            quote_id: "qt-1",
            status: "available",
            product: { product_id: "p", name: "Homepage takeover" },
            pricing: { final_cpm: { amount_micros: 10_800_000, currency: "USD" } },
          },
        });
      }),
    );
    const user = userEvent.setup();
    mount();

    await pick(user, "Book an existing quote");
    await user.type(screen.getByLabelText("Quote id"), "qt-1");
    await next(user);

    expect(document.querySelector('[data-block="quote-check"] [data-note="writes"]')).toBeTruthy();
    expect(reads).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Show quote" }));
    expect(await screen.findByText("Homepage takeover")).toBeInTheDocument();
    expect(screen.getByText("$10.80")).toBeInTheDocument();
    expect(reads).toEqual(["qt-1"]);
    await createButton();
  });

  for (const [label, status, said] of [
    ["unknown", 404, /no quote with this id/],
    ["expired", 410, /has expired/],
  ] as const) {
    it(`will not book a quote the agent reports as ${label}`, async () => {
      server.use(
        http.get(`${API}/api/v1/quotes/:id`, () => HttpResponse.json({ detail: "x" }, { status })),
      );
      const sent = capture("/api/v1/deals", { deal: { deal_id: "D-1" } });
      const user = userEvent.setup();
      mount();

      await pick(user, "Book an existing quote");
      await user.type(screen.getByLabelText("Quote id"), "qt-1");
      await next(user);
      await user.click(screen.getByRole("button", { name: "Show quote" }));

      await waitFor(() =>
        expect(document.querySelector('[data-state="quote-unbookable"]')?.textContent).toMatch(said),
      );
      expect(screen.getByRole("button", { name: "Create deal" })).toBeDisabled();
      expect(sent).toHaveLength(0);

      // A different id is a different quote: the verdict does not carry over.
      await user.click(screen.getByRole("button", { name: "Back" }));
      await user.type(screen.getByLabelText("Quote id"), "-2");
      await next(user);
      expect(document.querySelector('[data-state="quote-unbookable"]')).toBeNull();
      await createButton();
    });
  }

  it("offers to send a new deal to a buyer once it exists", async () => {
    capture("/api/v1/deals", { deal: { deal_id: "D-7" } });
    const pushed = capture("/api/v1/deals/push");
    const user = userEvent.setup();
    mount();

    await pick(user, "Book an existing quote");
    await user.type(screen.getByLabelText("Quote id"), "qt-1");
    await next(user);
    await user.click(await createButton());

    await user.type(await screen.findByLabelText("Buyer URL"), "https://buyer.example");
    await user.click(screen.getByRole("button", { name: "Notify buyer" }));

    await waitFor(() =>
      expect(pushed).toEqual([{ deal_id: "D-7", buyer_urls: ["https://buyer.example"] }]),
    );
  });

  it("offers the proposal route only when the agent lists a proposal, and generates from it", async () => {
    server.use(
      http.get(`${API}/.well-known/agent.json`, () =>
        HttpResponse.json(card(["opendirect21", OPENPROPOSAL_PROTOCOL])),
      ),
      http.get(`${API}/api/v3/proposals`, () => HttpResponse.json({ proposals: [WHOLE], total: 1 })),
    );
    const sent = capture("/deals");
    const user = userEvent.setup();
    mount();

    await pick(user, "From a proposal");
    await user.type(screen.getByLabelText("Proposal id"), "prop-1");
    await next(user);
    await user.click(await createButton());

    await waitFor(() => expect(sent).toEqual([{ proposal_id: "prop-1" }]));
  });

  it("does not offer the proposal route to an agent that lists none, or has no proposals", async () => {
    const listed: string[] = [];
    server.use(
      http.get(`${API}/.well-known/agent.json`, () =>
        HttpResponse.json(card(["opendirect21", OPENPROPOSAL_PROTOCOL])),
      ),
      http.get(`${API}/api/v3/proposals`, () => {
        listed.push("list");
        return HttpResponse.json({ proposals: [], total: 0 });
      }),
    );
    mount();

    // Advertises OpenProposal but holds none: nothing to generate a deal from.
    await waitFor(() => expect(listed.length).toBeGreaterThan(0));
    expect(screen.queryByRole("radio", { name: /From a proposal/ })).toBeNull();
    expect(screen.getByRole("radio", { name: /From a template/ })).toBeInTheDocument();
  });

  it("does not offer the curator route when no curator is registered", async () => {
    server.use(http.get(`${API}/api/v1/curators`, () => HttpResponse.json({ curators: [], count: 0 })));
    mount();

    await waitFor(() => expect(screen.queryByRole("radio", { name: /For a curator/ })).toBeNull());
    expect(screen.getByRole("radio", { name: /From a template/ })).toBeInTheDocument();
  });

  it("creates a deal from a template with a short deal-type code, and picks the product by name", async () => {
    server.use(
      http.get(`${API}/products`, () =>
        HttpResponse.json({ products: [{ product_id: "prod-91", name: "Premium Display - Homepage" }] }),
      ),
    );
    const sent = capture("/api/v1/deals/from-template");
    const user = userEvent.setup();
    mount();

    await pick(user, "From a template");
    await user.type(screen.getByRole("combobox", { name: "Product id" }), "homepage");
    await user.click(await screen.findByRole("option", { name: /prod-91/ }));
    await user.click(screen.getByLabelText("Deal type"));
    await user.click(await screen.findByRole("option", { name: "PG — programmatic guaranteed" }));
    // A guaranteed deal cannot be priced without a volume.
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await user.type(screen.getByLabelText("Impressions"), "250000");
    await next(user);
    await user.click(await createButton());

    await waitFor(() =>
      expect(sent).toEqual([{ deal_type: "PG", product_id: "prod-91", impressions: 250_000 }]),
    );
  });

  it("sends the commercial terms the template route takes: flight, ceiling, notes and buyer", async () => {
    const sent = capture("/api/v1/deals/from-template");
    const user = userEvent.setup();
    mount();

    await pick(user, "From a template");
    await user.type(screen.getByRole("combobox", { name: "Product id" }), "prod-1");
    await user.type(screen.getByLabelText("Flight start (optional)"), "2026-11-01");
    // One date without the other is half a flight.
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await user.type(screen.getByLabelText("Flight end (optional)"), "2026-11-30");
    await user.type(screen.getByLabelText("Max CPM (optional)"), "12.5");
    await user.type(screen.getByLabelText("Notes (optional)"), "Q4 push");
    await user.click(screen.getByText("Buyer details (optional)"));
    await user.type(await screen.findByLabelText("Advertiser id"), "adv-1");
    await next(user);
    await user.click(await createButton());

    await waitFor(() =>
      expect(sent).toEqual([
        {
          deal_type: "PD",
          product_id: "prod-1",
          flight_start: "2026-11-01",
          flight_end: "2026-11-30",
          max_cpm: 12.5,
          notes: "Q4 push",
          buyer_identity: { advertiser_id: "adv-1" },
        },
      ]),
    );
  });

  it("will not accept a flight that ends before it starts", async () => {
    const user = userEvent.setup();
    mount();

    await pick(user, "From a template");
    await user.type(screen.getByRole("combobox", { name: "Product id" }), "prod-1");
    await user.type(screen.getByLabelText("Flight start (optional)"), "2026-11-30");
    await user.type(screen.getByLabelText("Flight end (optional)"), "2026-11-01");

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("quotes with a target CPM in micros and books with the same buyer and the notes", async () => {
    const quotes = capture("/api/v1/quotes", { quote: { quote_id: "qt-3" } });
    const deals = capture("/api/v1/deals", { deal: { deal_id: "D-3" } });
    const user = userEvent.setup();
    mount();

    await next(user);
    await user.type(screen.getByRole("combobox", { name: "Product id" }), "prod-1");
    await user.type(screen.getByLabelText("Target CPM (optional)"), "7.25");
    await user.type(screen.getByLabelText("Notes (optional)"), "hold for Q4");
    await user.click(screen.getByText("Buyer details (optional)"));
    await user.type(await screen.findByLabelText("Seat id"), "seat-9");
    await next(user);
    await user.click(await screen.findByRole("button", { name: "Get quote" }));
    await waitFor(() => expect(quotes).toHaveLength(1));
    expect(quotes[0]).toMatchObject({
      target_cpm: { amount_micros: 7_250_000, currency: "USD" },
      buyer_identity: { seat_id: "seat-9" },
    });
    // Notes belong to the booking, not the quote.
    expect(quotes[0]).not.toHaveProperty("notes");

    await user.click(await screen.findByRole("button", { name: "Book deal" }));
    await waitFor(() => expect(deals).toHaveLength(1));
    expect(deals[0]).toMatchObject({
      quote_id: "qt-3",
      notes: "hold for Q4",
      buyer_identity: { seat_id: "seat-9" },
    });
  });

  it("offers the registered curators for a curated deal", async () => {
    server.use(
      http.get(`${API}/api/v1/curators`, () =>
        HttpResponse.json({
          count: 1,
          curators: [{ curator_id: "cur-1", name: "Acme Curation", domain: "acme.example", is_active: true }],
        }),
      ),
    );
    const sent = capture("/api/v1/deals/curated");
    const user = userEvent.setup();
    mount();

    await pick(user, "For a curator");
    await user.click(await screen.findByRole("combobox", { name: "Curator" }));
    await user.click(await screen.findByRole("option", { name: /cur-1/ }));
    await next(user);
    await user.click(await createButton());

    await waitFor(() => expect(sent).toEqual([{ curator_id: "cur-1" }]));
  });

  it("says why it was refused, and lets the operator go back and fix it", async () => {
    capture("/api/v1/deals", { detail: "Quote expired" }, 409);
    const user = userEvent.setup();
    mount();

    await pick(user, "Book an existing quote");
    await user.type(screen.getByLabelText("Quote id"), "qt-old");
    await next(user);
    await user.click(await createButton());

    await waitFor(() => expect(document.querySelector('[data-state="write-failed"]')).toBeTruthy());
    expect(screen.queryByText(/agent accepted/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
  });

  it("cannot create while writes are off, and says so", async () => {
    await saveCredential({
      baseUrl: API,
      apiKey: "k",
      role: "operator",
      name: "Ad Seller System API",
      reportedVersion: "2.4.2",
      writesEnabled: false,
    });
    const user = userEvent.setup();
    mount();

    await pick(user, "For a curator");
    await user.type(await screen.findByRole("combobox", { name: "Curator" }), "cur-1");
    await next(user);

    expect(await screen.findByText(/writes are switched off/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create deal" })).toBeDisabled();
  });
});
