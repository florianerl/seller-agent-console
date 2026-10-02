import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import { OPENPROPOSAL_PROTOCOL } from "../../src/api/capabilities";
import { DealWizard } from "../../src/screens/DealWizard";
import { DealWrites } from "../../src/screens/mutations";
import { card, WHOLE } from "../fixtures/proposals-harness";
import contract from "../fixtures/deal-request-schemas.json";

/**
 * Every field the agent's deal requests accept, sent from the screen.
 *
 * The console used to send a product and a deal type to routes that take a
 * dozen fields each, and nothing noticed. So this fills in every field of every
 * request the Deals screen makes, records the bodies that reach the wire, and
 * compares the keys against a snapshot of the agent's OpenAPI
 * (`tests/fixtures/deal-request-schemas.json`). A field the agent adds shows up
 * as missing here; a field the screen stops sending does too.
 *
 * The comparison runs in `afterAll`, because the suite is shuffled and a final
 * test could run first.
 */

type User = ReturnType<typeof userEvent.setup>;
type Body = Record<string, unknown>;

/** What reached the wire, by the OpenAPI model it answers. */
const seen: Record<string, Set<string>> = {};
const note = (model: string, body: unknown) => {
  if (typeof body !== "object" || body === null) return;
  (seen[model] ??= new Set()).add(Object.keys(body).join(","));
};
const keysSeen = (model: string): Set<string> =>
  new Set([...(seen[model] ?? [])].flatMap((k) => k.split(",")).filter(Boolean));

function mount(node: ReactNode) {
  return render(
    <SWRConfig
      value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, compare: sameResult }}
    >
      <ThemeProvider theme={theme}>
        <CredentialProvider>{node}</CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

function capture(path: string, reply: unknown = {}) {
  const bodies: Body[] = [];
  server.use(
    http.post(`${API}${path}`, async ({ request }) => {
      bodies.push((await request.json()) as Body);
      return HttpResponse.json(reply as Body);
    }),
  );
  return bodies;
}

const text = async (_user: User, label: string, value: string, exact = true) => {
  const field = await screen.findByLabelText(exact ? label : new RegExp(label));
  // A change event, not keystrokes: dozens of long fields typed key by key made this the slowest test in the suite.
  fireEvent.change(field, { target: { value } });
};
/** Date and datetime inputs do not take typed text in jsdom. */
const setValue = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const open = (user: User, summary: string) => user.click(screen.getByText(summary));
const choose = async (user: User, label: string, option: string) => {
  await user.click(screen.getByLabelText(label));
  await user.click(await screen.findByRole("option", { name: option }));
};
const next = (user: User) => user.click(screen.getByRole("button", { name: "Next" }));
const confirmDialog = async (user: User) =>
  user.click(
    await waitFor(() => {
      const el = document.querySelector('[data-action="confirm-mutation"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    }),
  );

async function fillBuyer(user: User, full: boolean) {
  await open(user, "Buyer details (optional)");
  const narrow: [string, string][] = [
    ["Advertiser id", "adv-1"],
    ["Agency id", "ag-1"],
    ["Seat id", "seat-1"],
    ["DSP platform", "ttd"],
  ];
  const extra: [string, string][] = [
    ["Advertiser name", "Acme"],
    ["Advertiser industry", "retail"],
    ["Agency name", "Agency Co"],
    ["Agency holding company", "Holding Inc"],
    ["Seat name", "The Trade Desk"],
    ["Campaign id", "camp-1"],
    ["Campaign name", "Spring"],
  ];
  for (const [l, v] of full ? [...narrow, ...extra] : narrow) await text(user, l, v);
}

async function fillConsent(user: User) {
  await open(user, "Privacy consent (optional)");
  await text(user, "Applicable regimes", "GDPR, CCPA");
  await text(user, "GPP string", "DBABM~BVQqAAAAAg");
  await text(user, "GPP section ids", "2, 6");
  await text(user, "TCF string", "CPXxRfAPXxR");
  await choose(user, "GDPR applies", "yes");
  await text(user, "US Privacy string", "1YNN");
  await choose(user, "Diligence status", "passed");
  setValue("Verified at", "2026-10-01T10:00");
}

async function startWizard(user: User, route?: string) {
  mount(<DealWizard open onClose={() => undefined} />);
  if (route) await user.click(await screen.findByRole("radio", { name: new RegExp(route) }));
  await next(user);
}

describe("every field of every deal request is sent from the screen", { timeout: 60_000 }, () => {
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

  it("quote, then book: the quote and the booking", async () => {
    const quotes = capture("/api/v1/quotes", { quote: { quote_id: "qt-1" } });
    const books = capture("/api/v1/deals", { deal: { deal_id: "D-1" } });
    const user = userEvent.setup({ delay: null });
    await startWizard(user);

    await user.type(screen.getByRole("combobox", { name: "Products" }), "prod-1{Enter}");
    await choose(user, "Deal type", "PG — programmatic guaranteed");
    await choose(user, "Media type", "linear tv");
    await text(user, "Target demo", "A18-49");
    await text(user, "GRPs \\(optional\\)", "100", false);
    await text(user, "Dayparts \\(optional\\)", "primetime, late_night", false);
    await text(user, "Networks \\(optional\\)", "NBC, ESPN", false);
    await text(user, "DMAs \\(optional\\)", "501", false);
    await choose(user, "Spot length", "60 seconds");
    await text(user, "Target CPP \\(optional\\)", "2.5", false);
    await text(user, "Measurement", "comscore");
    await text(user, "Rotation", "fixed");
    await text(user, "Impressions", "250000");
    setValue("Flight start (optional)", "2026-11-01");
    setValue("Flight end (optional)", "2026-11-30");
    await text(user, "Target CPM \\(optional\\)", "7.25", false);
    await text(user, "Notes \\(optional\\)", "hold for Q4", false);
    await fillBuyer(user, true);
    await open(user, "More options (optional)");
    await text(user, "Agent URL", "https://buyer.example/agent");
    await text(user, "Rate card id", "rc-1");
    fireEvent.change(await screen.findByLabelText(/Audience plan/), { target: { value: '{"segments": ["a"]}' } });
    await fillConsent(user);
    await next(user);

    await user.click(await screen.findByRole("button", { name: "Get quote" }));
    await waitFor(() => expect(quotes).toHaveLength(1));
    await user.click(await screen.findByRole("button", { name: "Book deal" }));
    await waitFor(() => expect(books).toHaveLength(1));

    note("QuoteRequest", quotes[0]);
    note("BuyerIdentity", quotes[0]!["buyer_identity"]);
    note("LinearTVParams", quotes[0]!["linear_tv"]);
    note("ConsentContext", quotes[0]!["consent_context"]);
    note("DealBookingRequest", books[0]);
    note("BuyerIdentity", books[0]!["buyer_identity"]);
    note("ConsentContext", books[0]!["consent_context"]);
    // The booking carries the same identity, plan and consent the quote was priced for.
    expect(books[0]).toMatchObject({
      quote_id: "qt-1",
      notes: "hold for Q4",
      audience_plan: { segments: ["a"] },
      buyer_identity: quotes[0]!["buyer_identity"],
      consent_context: quotes[0]!["consent_context"],
    });
    expect(quotes[0]).toMatchObject({
      linear_tv: { target_demo: "A18-49", spot_length: 60, target_cpp: { amount_micros: 2_500_000 } },
      consent_context: { gdpr_applies: true, gpp_section_ids: [2, 6], diligence_status: "passed" },
    });
  });

  it("an existing quote: the booking alone", async () => {
    const books = capture("/api/v1/deals", { deal: { deal_id: "D-2" } });
    const user = userEvent.setup({ delay: null });
    await startWizard(user);
    await user.click(screen.getByRole("button", { name: "I have a quote id" }));

    await text(user, "Quote id", "qt-9");
    await text(user, "Notes \\(optional\\)", "from an order", false);
    await fillBuyer(user, true);
    fireEvent.change(await screen.findByLabelText(/Audience plan/), { target: { value: '{"segments": ["b"]}' } });
    await fillConsent(user);
    await next(user);
    await user.click(await screen.findByRole("button", { name: "Create deal" }));

    await waitFor(() => expect(books).toHaveLength(1));
    note("DealBookingRequest", books[0]);
    note("BuyerIdentity", books[0]!["buyer_identity"]);
    note("ConsentContext", books[0]!["consent_context"]);
  });

  it("a template", async () => {
    const sent = capture("/api/v1/deals/from-template", { deal: { deal_id: "D-3" } });
    const user = userEvent.setup({ delay: null });
    await startWizard(user, "From a template");

    await user.type(screen.getByRole("combobox", { name: "Products" }), "prod-1{Enter}");
    await text(user, "Impressions \\(optional\\)", "500000", false);
    setValue("Flight start (optional)", "2026-11-01");
    setValue("Flight end (optional)", "2026-11-30");
    await text(user, "Max CPM \\(optional\\)", "12.5", false);
    await text(user, "Notes \\(optional\\)", "q4", false);
    await fillBuyer(user, false);
    await open(user, "More options (optional)");
    await text(user, "Agent URL", "https://buyer.example/agent");
    await next(user);
    await user.click(await screen.findByRole("button", { name: "Create deal" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    note("DealFromTemplateRequest", sent[0]);
    note("QuoteBuyerIdentityModel", sent[0]!["buyer_identity"]);
    // The template's identity model has four fields; the names are not offered, so not sent.
    expect(Object.keys(sent[0]!["buyer_identity"] as Body).sort()).toEqual(
      ["advertiser_id", "agency_id", "dsp_platform", "seat_id"],
    );
  });

  it("a curated deal", async () => {
    server.use(
      http.get(`${API}/api/v1/curators`, () =>
        HttpResponse.json({ count: 1, curators: [{ curator_id: "cur-1", name: "Acme", domain: "acme.example", is_active: true }] }),
      ),
    );
    const sent = capture("/api/v1/deals/curated", { deal: { deal_id: "D-4" } });
    const user = userEvent.setup({ delay: null });
    await startWizard(user, "For a curator");

    await user.click(await screen.findByRole("combobox", { name: "Curator" }));
    await user.click(await screen.findByRole("option", { name: /cur-1/ }));
    await text(user, "Deal type", "PMP");
    await user.type(screen.getByRole("combobox", { name: "Product id" }), "prod-1");
    await text(user, "Max CPM \\(optional\\)", "9", false);
    await text(user, "Impressions \\(optional\\)", "1000", false);
    setValue("Flight start (optional)", "2026-11-01");
    setValue("Flight end (optional)", "2026-11-30");
    await text(user, "Buyer seat ids", "s1, s2");
    await text(user, "Audience segments", "seg-1");
    await text(user, "Content categories", "IAB1");
    await next(user);
    await user.click(await screen.findByRole("button", { name: "Create deal" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    note("CuratedDealRequest", sent[0]);
    expect(sent[0]).toMatchObject({ buyer_seat_ids: ["s1", "s2"], audience_segments: ["seg-1"] });
  });

  it("a deal from a proposal", async () => {
    server.use(
      http.get(`${API}/.well-known/agent.json`, () =>
        HttpResponse.json(card(["opendirect21", OPENPROPOSAL_PROTOCOL])),
      ),
      http.get(`${API}/api/v3/proposals`, () => HttpResponse.json({ proposals: [WHOLE], total: 1 })),
    );
    const sent = capture("/deals", {});
    const user = userEvent.setup({ delay: null });
    await startWizard(user, "From a proposal");

    await text(user, "Proposal id", "prop-1");
    await text(user, "DSP platform \\(optional\\)", "dv360", false);
    await next(user);
    await user.click(await screen.findByRole("button", { name: "Create deal" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    note("DealRequest", sent[0]);
  });

  it("push, distribute, migrate, bulk and deprecate on an existing deal", async () => {
    const push = capture("/api/v1/deals/push");
    const dist = capture("/api/v1/deals/distribute");
    const migrate = capture("/api/v1/deals/D-1/migrate");
    const bulk = capture("/api/v1/deals/bulk", { total: 1, succeeded: 1, failed: 0, results: [] });
    const deprecate = capture("/api/v1/deals/D-1/deprecate");
    const user = userEvent.setup({ delay: null });
    mount(<DealWrites dealId="D-1" />);

    /** A form and the optional section beside it, found by its action. */
    const scope = (action: string) =>
      within(document.querySelector(`[data-block="write:${action}"]`)!.parentElement!);
    const into = async (w: ReturnType<typeof scope>, label: string, value: string) => {
      const field = w.getByLabelText(label);
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
        throw new Error(`"${label}" is a <${field.tagName.toLowerCase()}>, not a field`);
      }
      // Fields stay disabled until the stored credential has said writes are on.
      await waitFor(() => expect(field).toBeEnabled());
      fireEvent.change(field, { target: { value } });
    };
    const date = (w: ReturnType<typeof scope>, label: string, value: string) =>
      fireEvent.change(w.getByLabelText(label), { target: { value } });
    const run = async (w: ReturnType<typeof scope>, button: string) => {
      await user.click(w.getByRole("button", { name: button }));
      await confirmDialog(user);
      // While a dialog is closing the page behind it is aria-hidden, and role queries skip it.
      await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    };

    // Push.
    let w = scope("push-deal");
    await into(w, "Buyer URLs", "https://b1.example, https://b2.example");
    await user.click(w.getByText("Override what is sent (optional)"));
    await into(w, "Buyer API keys", "k1, k2");
    await into(w, "Deal type", "PMP");
    await into(w, "Name", "Q4 deal");
    await into(w, "Price", "9.5");
    await into(w, "Impressions", "1000");
    date(w, "Flight start", "2026-11-01");
    date(w, "Flight end", "2026-11-30");
    await into(w, "Buyer seat ids", "s1, s2");
    await run(w, "Push");
    await waitFor(() => expect(push).toHaveLength(1));
    note("DealPushRequest", push[0]);
    expect(push[0]).toMatchObject({
      buyer_urls: ["https://b1.example", "https://b2.example"],
      buyer_api_keys: ["k1", "k2"],
      buyer_seat_ids: ["s1", "s2"],
    });

    // Distribute.
    w = scope("distribute-deal");
    await into(w, "SSP name (optional)", "pubmatic");
    await user.click(w.getByText("Override what is sent (optional)"));
    await into(w, "Deal type", "PMP");
    await into(w, "Name", "Q4 deal");
    await into(w, "Advertiser", "Acme");
    await into(w, "CPM", "9.5");
    date(w, "Start date", "2026-11-01");
    date(w, "End date", "2026-11-30");
    await into(w, "Inventory type", "display");
    await into(w, "Buyer seat ids", "s1");
    fireEvent.change(w.getByLabelText("Targeting (JSON)"), { target: { value: '{"geo": ["US"]}' } });
    await run(w, "Distribute");
    await waitFor(() => expect(dist).toHaveLength(1));
    note("SSPDealDistributeRequest", dist[0]);
    expect(dist[0]).toMatchObject({ targeting: { geo: ["US"] }, ssp_name: "pubmatic" });

    // Migrate: every term of the successor.
    w = scope("migrate-deal");
    await into(w, "Reason (optional)", "new flight");
    await user.click(w.getByText("Terms of the new deal (optional)"));
    await user.type(w.getByRole("combobox", { name: "Product id" }), "prod-2");
    await into(w, "Deal type", "PG");
    await into(w, "Max CPM", "11");
    await into(w, "Impressions", "2000");
    date(w, "Flight start", "2026-12-01");
    date(w, "Flight end", "2026-12-31");
    await into(w, "Buyer seat ids", "s9");
    await user.click(w.getByText("Buyer details (optional)"));
    await into(w, "Advertiser id", "adv-9");
    await into(w, "Agency id", "ag-9");
    await into(w, "Seat id", "seat-9");
    await into(w, "DSP platform", "dv360");
    await run(w, "Migrate");
    await waitFor(() => expect(migrate).toHaveLength(1));
    note("DealMigrationRequest", migrate[0]);
    note("QuoteBuyerIdentityModel", migrate[0]!["buyer_identity"]);

    // Cancel, with a buyer identity.
    w = scope("bulk-deals");
    await into(w, "Notes (optional)", "withdrawn");
    await user.click(w.getByText("Buyer details (optional)"));
    await into(w, "Advertiser id", "adv-1");
    await into(w, "Agency id", "ag-1");
    await into(w, "Seat id", "seat-1");
    await into(w, "DSP platform", "ttd");
    await run(w, "Cancel deal");
    await waitFor(() => expect(bulk).toHaveLength(1));
    const op = (bulk[0]!["operations"] as Body[])[0]!;
    note("BulkDealOperation", op);
    note("QuoteBuyerIdentityModel", op["buyer_identity"]);

    // Deprecate, naming a replacement.
    w = scope("deprecate-deal");
    await into(w, "Reason", "superseded");
    await user.type(w.getByRole("combobox", { name: "Replacement deal (optional)" }), "D-2");
    await run(w, "Deprecate");
    await waitFor(() => expect(deprecate).toHaveLength(1));
    note("DealDeprecationRequest", deprecate[0]);
    expect(deprecate[0]).toEqual({ reason: "superseded", replacement_deal_id: "D-2" });
  });

  afterAll(() => {
    // Nothing here may be absent from the snapshot of the agent's API. A field
    // is excused only with a reason written beside it.
    const EXCUSED: Record<string, Record<string, string>> = {
      BulkDealOperation: {
        quote_id: "bulk create is not offered: Book from a quote does the same with an idempotency key",
      },
    };
    const MODELS = [
      "QuoteRequest",
      "DealBookingRequest",
      "DealFromTemplateRequest",
      "CuratedDealRequest",
      "DealRequest",
      "DealPushRequest",
      "SSPDealDistributeRequest",
      "DealMigrationRequest",
      "DealDeprecationRequest",
      "BulkDealOperation",
      "ConsentContext",
      "LinearTVParams",
      "BuyerIdentity",
      "QuoteBuyerIdentityModel",
    ];
    const missing: string[] = [];
    for (const model of MODELS) {
      const fields = (contract.schemas as Record<string, string[]>)[model] ?? [];
      const sent = keysSeen(model);
      for (const field of fields) {
        if (!sent.has(field) && !EXCUSED[model]?.[field]) missing.push(`${model}.${field}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
