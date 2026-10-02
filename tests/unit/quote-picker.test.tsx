import { beforeEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { recordQuote } from "../../src/credentials/recentQuotes";
import { sameResult } from "../../src/query/freshness";
import { QuotePicker } from "../../src/screens/pickers";

const HOUR = 60 * 60 * 1000;

function Harness() {
  const [value, setValue] = useState("");
  return (
    <>
      <QuotePicker value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

function mount() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, compare: sameResult }}>
      <ThemeProvider theme={theme}>
        <CredentialProvider>
          <Harness />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

describe("the quote picker", () => {
  let credId = "";
  beforeEach(async () => {
    await clearCredential();
    const saved = await saveCredential({
      baseUrl: API,
      apiKey: "k",
      role: "operator",
      name: "Ad Seller System API",
      reportedVersion: "2.4.2",
    });
    credId = saved.credId;
  });

  it("lists the quotes made here, with product, rate and expiry", async () => {
    const now = Date.now();
    await recordQuote(credId, {
      quote_id: "qt-live",
      product_id: "prod-1",
      product_name: "Premium Display",
      deal_type: "PD",
      final_cpm_micros: 6_800_000,
      currency: "USD",
      expires_at: new Date(now + 5 * HOUR).toISOString(),
      created_at: now,
    });
    await recordQuote(credId, {
      quote_id: "qt-lapsed",
      product_id: "prod-2",
      product_name: null,
      deal_type: "PG",
      final_cpm_micros: null,
      currency: "USD",
      expires_at: new Date(now - 10 * 60_000).toISOString(),
      created_at: now - 25 * HOUR,
    });
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole("combobox", { name: "Quote id" }));

    const live = await screen.findByRole("option", { name: /qt-live/ });
    expect(live.textContent).toMatch(/Premium Display/);
    expect(live.textContent).toMatch(/\$6\.80 CPM/);
    expect(live.textContent).toMatch(/expires in 4 h|expires in 5 h/);
    // An expired entry is worded as expired here, not as gone or unavailable upstream.
    const lapsed = screen.getByRole("option", { name: /qt-lapsed/ });
    expect(lapsed.textContent).toMatch(/expired \d+ min ago/);
    expect(lapsed.textContent).toMatch(/prod-2/);

    await user.click(live);
    expect(screen.getByTestId("value").textContent).toBe("qt-live");
  });

  it("says the list is local, and what it leaves out", async () => {
    mount();

    const note = await screen.findByText(/created from this browser with this key/i);
    expect(note.textContent).toMatch(/not the agent's list/i);
    expect(note.textContent).toMatch(/buyer or another browser/i);
  });

  it("accepts a quote id that is not on the list", async () => {
    const user = userEvent.setup();
    mount();

    await user.type(await screen.findByRole("combobox", { name: "Quote id" }), "qt-from-a-buyer");

    expect(screen.getByTestId("value").textContent).toBe("qt-from-a-buyer");
  });

  it("offers nothing, and does not break, when no quote was made here", async () => {
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole("combobox", { name: "Quote id" }));

    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Quote id" })).toBeEnabled();
  });
});
