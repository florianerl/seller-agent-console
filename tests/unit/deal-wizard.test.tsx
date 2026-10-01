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

function capture(path: string, reply: unknown = {}, status = 200) {
  const bodies: Record<string, unknown>[] = [];
  server.use(
    http.post(`${API}${path}`, async ({ request }) => {
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

    await pick(user, "Book a quote");

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await user.type(screen.getByLabelText("Quote id"), "qt-1");
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("books a quote with an idempotency key, and shows what it will do first", async () => {
    const sent = capture("/api/v1/deals", { deal: { deal_id: "D-1" } });
    const user = userEvent.setup();
    mount();

    await pick(user, "Book a quote");
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

  it("generates a deal from a proposal", async () => {
    const sent = capture("/deals");
    const user = userEvent.setup();
    mount();

    await pick(user, "From a proposal");
    await user.type(screen.getByLabelText("Proposal id"), "prop-1");
    await next(user);
    await user.click(await createButton());

    await waitFor(() => expect(sent).toEqual([{ proposal_id: "prop-1" }]));
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
    await next(user);
    await user.click(await createButton());

    await waitFor(() => expect(sent).toEqual([{ deal_type: "PG", product_id: "prod-91" }]));
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

    await pick(user, "Book a quote");
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
