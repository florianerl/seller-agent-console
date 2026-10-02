import { beforeEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, loadCredential, saveCredential } from "../../src/credentials/store";
import { recordQuote } from "../../src/credentials/recentQuotes";
import { sameResult } from "../../src/query/freshness";
import { resetWritePolicy } from "../../src/api/policy";
import { resetReachability } from "../../src/query/reachability";
import {
  CreateSessionWrite,
  DealLookups,
  DealWrites,
  ProposalWrites,
} from "../../src/screens/mutations";

/**
 * Each of these forms once sent a value the agent always refuses — a deal
 * type it does not map, a bulk action it does not know, a body missing a
 * required field. The tests pin the body that goes on the wire, since that
 * is where the old mistakes lived and where a type would not have caught them.
 */

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

function capture(method: "post" | "put", path: string, reply: unknown = {}) {
  const bodies: Record<string, unknown>[] = [];
  server.use(
    http[method](`${API}${path}`, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json(reply as Record<string, unknown>);
    }),
  );
  return bodies;
}

async function confirm(user: ReturnType<typeof userEvent.setup>, action: string, label: string) {
  const button = await waitFor(() => {
    const el = document.querySelector(`[data-action="${action}"]`);
    expect(el).toBeTruthy();
    expect(el).toBeEnabled();
    return el as HTMLElement;
  });
  await user.click(button);
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: label }));
}

async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  // Like `enabled`: the select stays disabled until the stored credential
  // has loaded and said writes are on, and a click before then opens
  // nothing. Fast locally, it lost that race on CI. MUI marks a disabled
  // select with aria-disabled, which toBeEnabled does not read.
  const select = await waitFor(() => {
    const el = screen.getByLabelText(label);
    expect(el).not.toHaveAttribute("aria-disabled", "true");
    return el;
  });
  await user.click(select);
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("forms that send an enum", () => {
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

  it("runs a bulk action the agent knows, and reports a failed operation inside a 200", async () => {
    const sent = capture("post", "/api/v1/deals/bulk", {
      total: 1,
      succeeded: 0,
      failed: 1,
      results: [{ index: 0, action: "cancel", success: false, deal_id: "D-1", error: "Deal 'D-1' not found" }],
    });
    const user = userEvent.setup();
    mount(<DealWrites dealId="D-1" />);

    await confirm(user, "bulk-deals", "Cancel deal");

    await waitFor(() => expect(sent).toEqual([{ operations: [{ action: "cancel", deal_id: "D-1" }] }]));
    const failed = await waitFor(() => {
      const el = document.querySelector('[data-block="bulk-results"] [data-state="op-failed"]');
      expect(el).toBeTruthy();
      return el!;
    });
    expect(failed.textContent).toMatch(/not found/);
    // A batch where nothing landed must not read as accepted.
    expect(document.querySelector('[data-block="write:bulk-deals"] [data-state="write-ok"]')).toBeNull();
  });

  it("edits a deal's notes through the bulk route, and offers no bulk create", async () => {
    const sent = capture("post", "/api/v1/deals/bulk", { total: 1, succeeded: 1, failed: 0, results: [] });
    const user = userEvent.setup();
    mount(<DealWrites dealId="D-1" />);

    await choose(user, "Action", "update");
    await user.type(screen.getByLabelText("Notes (optional)"), "moved to Q4");
    await confirm(user, "bulk-deals", "Update notes");

    await waitFor(() =>
      expect(sent).toEqual([{ operations: [{ action: "update", deal_id: "D-1", notes: "moved to Q4" }] }]),
    );
  });

  it("migrates with the old deal id the request model requires", async () => {
    const sent = capture("post", "/api/v1/deals/D-1/migrate");
    const user = userEvent.setup();
    mount(<DealWrites dealId="D-1" />);

    await confirm(user, "migrate-deal", "Migrate");

    await waitFor(() => expect(sent).toEqual([{ old_deal_id: "D-1" }]));
  });

  it("does not guess an SSP name for troubleshooting", async () => {
    mount(<DealLookups dealId="D-1" />);

    const button = await waitFor(() => {
      const el = document.querySelector('[data-action="deal-ssp"]');
      expect(el).toBeTruthy();
      return el!;
    });
    expect(button).toBeDisabled();
    expect(screen.getByLabelText("SSP")).toHaveValue("");
  });

  it("submits a legacy proposal through the wizard with every field the agent takes", async () => {
    const sent = capture("post", "/proposals", { proposal_id: "P-9" });
    const user = userEvent.setup();
    mount(<ProposalWrites />);

    await waitFor(() => expect(document.querySelector('[data-action="submit-proposal"]')).toBeEnabled());
    await user.click(document.querySelector('[data-action="submit-proposal"]') as HTMLElement);
    const dialog = await screen.findByRole("dialog");

    await user.type(await within(dialog).findByLabelText("Product id"), "prod-1");
    await user.click(within(dialog).getByRole("button", { name: "Next" }));
    await user.type(within(dialog).getByLabelText("Price"), "12.5");
    await user.type(within(dialog).getByLabelText("Impressions"), "250000");
    await user.type(within(dialog).getByLabelText("Start date"), "2026-11-01");
    await user.type(within(dialog).getByLabelText("End date"), "2026-11-30");
    await user.click(within(dialog).getByRole("button", { name: "Next" }));
    await user.type(within(dialog).getByLabelText("Buyer id (optional)"), "buyer-1");
    await user.type(within(dialog).getByLabelText("Agency id (optional)"), "agency-1");
    await user.type(within(dialog).getByLabelText("Advertiser id (optional)"), "adv-1");
    await user.type(within(dialog).getByLabelText("Agent URL (optional)"), "https://buyer.example");
    await user.click(within(dialog).getByRole("button", { name: "Next" }));
    await user.click(within(dialog).getByRole("button", { name: "Submit proposal" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      product_id: "prod-1",
      deal_type: "preferreddeal",
      price: 12.5,
      impressions: 250000,
      start_date: "2026-11-01",
      end_date: "2026-11-30",
      buyer_id: "buyer-1",
      agency_id: "agency-1",
      advertiser_id: "adv-1",
      agent_url: "https://buyer.example",
    });
    await user.click(await within(dialog).findByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.getByLabelText("Proposal id")).toHaveValue("P-9"));
  });

  it("leaves blank buyer fields off the wire", async () => {
    const sent = capture("post", "/proposals");
    const user = userEvent.setup();
    mount(<ProposalWrites />);

    await waitFor(() => expect(document.querySelector('[data-action="submit-proposal"]')).toBeEnabled());
    await user.click(document.querySelector('[data-action="submit-proposal"]') as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    await user.type(await within(dialog).findByLabelText("Product id"), "prod-1");
    await user.click(within(dialog).getByRole("button", { name: "Next" }));
    await user.type(within(dialog).getByLabelText("Price"), "10");
    await user.type(within(dialog).getByLabelText("Impressions"), "1000");
    await user.type(within(dialog).getByLabelText("Start date"), "2026-11-01");
    await user.type(within(dialog).getByLabelText("End date"), "2026-11-30");
    await user.click(within(dialog).getByRole("button", { name: "Next" }));
    await user.click(within(dialog).getByRole("button", { name: "Next" }));
    await user.click(within(dialog).getByRole("button", { name: "Submit proposal" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(Object.keys(sent[0]!).sort()).toEqual(
      ["deal_type", "end_date", "impressions", "price", "product_id", "start_date"],
    );
  });


  it("sends every field of a negotiation message, with one key kept for a retry", async () => {
    const sent = capture("post", "/api/v1/negotiations/messages");
    const user = userEvent.setup();
    mount(<ProposalWrites />);

    await user.type(await screen.findByLabelText("Proposal id"), "P-1");
    await waitFor(() => expect(document.querySelector('[data-action="negotiation-message"]')).toBeEnabled());
    await user.click(document.querySelector('[data-action="negotiation-message"]') as HTMLElement);
    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByLabelText("Price"), "12.5");
    await user.type(within(dialog).getByLabelText("Rationale (optional)"), "fair");
    await user.click(within(dialog).getByRole("button", { name: "Next" }));
    await user.type(within(dialog).getByLabelText("Negotiation id (optional)"), "N-1");
    await user.type(within(dialog).getByLabelText("Quote id (optional)"), "Q-1");
    await user.type(within(dialog).getByLabelText("Round number (optional)"), "2");
    await user.click(within(dialog).getByRole("button", { name: "Next" }));
    await user.type(within(dialog).getByLabelText("Seat id (optional)"), "seat-1");
    await user.type(within(dialog).getByLabelText("Campaign name (optional)"), "Fall");
    await user.click(within(dialog).getByRole("button", { name: "Next" }));
    await user.click(within(dialog).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(typeof sent[0]!["idempotency_key"]).toBe("string");
    expect({ ...sent[0], idempotency_key: undefined }).toEqual({
      action: "counter",
      proposal_id: "P-1",
      negotiation_id: "N-1",
      quote_id: "Q-1",
      round_number: 2,
      buyer_price: { amount_micros: 12_500_000, currency: "USD" },
      buyer_identity: { seat_id: "seat-1", campaign_name: "Fall" },
      rationale: "fair",
    });
  });

  it("offers the quotes made here when negotiating on a quote, and sends the one picked", async () => {
    const credential = await loadCredential();
    await recordQuote(credential!.credId, {
      quote_id: "qt-made-here",
      product_id: "prod-1",
      product_name: "Premium Display",
      deal_type: "PD",
      final_cpm_micros: 6_800_000,
      currency: "USD",
      expires_at: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
      created_at: Date.now(),
    });
    const sent = capture("post", "/api/v1/negotiations/messages");
    const user = userEvent.setup();
    mount(<ProposalWrites />);

    await user.type(await screen.findByLabelText("Proposal id"), "P-1");
    await waitFor(() => expect(document.querySelector('[data-action="negotiation-message"]')).toBeEnabled());
    await user.click(document.querySelector('[data-action="negotiation-message"]') as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Price"), "12.5");
    await user.click(within(dialog).getByRole("button", { name: "Next" }));

    await user.click(within(dialog).getByRole("combobox", { name: "Quote id (optional)" }));
    await user.click(await screen.findByRole("option", { name: /qt-made-here/ }));
    await user.click(within(dialog).getByRole("button", { name: "Next" }));
    await user.click(within(dialog).getByRole("button", { name: "Next" }));
    await user.click(within(dialog).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ quote_id: "qt-made-here" });
  });

  it("opens a session with the buyer fields it was given", async () => {
    const sent = capture("post", "/sessions", { session_id: "S-1" });
    const user = userEvent.setup();
    mount(<CreateSessionWrite />);

    await waitFor(() => expect(document.querySelector('[data-action="create-session"]')).toBeEnabled());
    await user.click(document.querySelector('[data-action="create-session"]') as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Seat id (optional)"), "seat-1");
    await user.type(within(dialog).getByLabelText("Agent URL (optional)"), "https://buyer.example");
    await user.click(within(dialog).getByLabelText("Authenticated session"));
    await user.click(within(dialog).getByRole("button", { name: "Next" }));
    await user.click(within(dialog).getByRole("button", { name: "Create session" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ seat_id: "seat-1", agent_url: "https://buyer.example", is_authenticated: true });
  });
});
