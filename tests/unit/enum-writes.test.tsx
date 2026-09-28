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
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetWritePolicy } from "../../src/api/policy";
import { resetReachability } from "../../src/query/reachability";
import {
  CatalogWrites,
  CreateQuoteWrite,
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

/** Fields stay disabled until the stored credential has loaded and said writes are on. */
function enabled(label: string, index = 0) {
  return waitFor(() => {
    const el = screen.getAllByLabelText(label)[index];
    expect(el).toBeEnabled();
    return el!;
  });
}

async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(screen.getByLabelText(label));
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

  it("creates a deal from a template with a short deal-type code", async () => {
    const sent = capture("post", "/api/v1/deals/from-template");
    const user = userEvent.setup();
    mount(<DealWrites />);

    await user.type(await enabled("Product id"), "prod-1");
    await choose(user, "Deal type", "PG — programmatic guaranteed");
    await confirm(user, "deal-from-template", "From template");

    await waitFor(() => expect(sent).toEqual([{ deal_type: "PG", product_id: "prod-1" }]));
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

    await confirm(user, "bulk-deals", "Bulk cancel");

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

  it("sends a bulk create against a quote, not a deal", async () => {
    const sent = capture("post", "/api/v1/deals/bulk", { total: 1, succeeded: 1, failed: 0, results: [] });
    const user = userEvent.setup();
    mount(<DealWrites dealId="D-1" />);

    await choose(user, "Bulk action", "create");
    await user.type(screen.getAllByLabelText("Quote id").at(-1)!, "Q-9");
    await confirm(user, "bulk-deals", "Bulk create");

    await waitFor(() => expect(sent).toEqual([{ operations: [{ action: "create", quote_id: "Q-9" }] }]));
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

  it("requests a quote with a deal type and a media type the agent accepts", async () => {
    const sent = capture("post", "/api/v1/quotes", { quote: {} });
    const user = userEvent.setup();
    mount(<CreateQuoteWrite />);

    await user.type(await enabled("Product id"), "prod-1");
    await choose(user, "Media type", "ctv");
    await confirm(user, "create-quote", "Create quote");

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ product_id: "prod-1", deal_type: "PD", media_type: "ctv" });
    expect(sent[0]).not.toHaveProperty("impressions");
  });

  it("asks for impressions before quoting a guaranteed deal", async () => {
    const sent = capture("post", "/api/v1/quotes", { quote: {} });
    const user = userEvent.setup();
    mount(<CreateQuoteWrite />);

    await user.type(await enabled("Product id"), "prod-1");
    await choose(user, "Deal type", "PG — programmatic guaranteed");
    expect(document.querySelector('[data-action="create-quote"]')).toBeDisabled();

    await user.type(screen.getByLabelText("Impressions"), "250000");
    await confirm(user, "create-quote", "Create quote");

    await waitFor(() => expect(sent[0]).toMatchObject({ deal_type: "PG", impressions: 250_000 }));
  });

  it("sets an inventory type override from the documented set", async () => {
    const sent = capture("post", "/api/v1/products/prod-1/inventory-type");
    const user = userEvent.setup();
    mount(<CatalogWrites />);

    await user.type(await enabled("Product id"), "prod-1");
    const typeFields = screen.getAllByLabelText("Inventory type");
    await user.click(typeFields[typeFields.length - 1]!);
    await user.click(await screen.findByRole("option", { name: "mobile app" }));
    await confirm(user, "set-override", "Set override");

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ inventory_type: "mobile_app" });
  });

  it("submits a legacy proposal with a deal type the flow compares against", async () => {
    const sent = capture("post", "/proposals");
    const user = userEvent.setup();
    mount(<ProposalWrites />);

    await user.type(await enabled("Product id"), "prod-1");
    await confirm(user, "submit-proposal", "Submit proposal");

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ deal_type: "preferreddeal" });
  });
});
