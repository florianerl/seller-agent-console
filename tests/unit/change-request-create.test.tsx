import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import { ChangeRequestCreate } from "../../src/screens/mutations";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetWritePolicy } from "../../src/api/policy";
import { resetReachability } from "../../src/query/reachability";

function mount() {
  return render(
    <SWRConfig
      value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, compare: sameResult }}
    >
      <ThemeProvider theme={theme}>
        <CredentialProvider>
          <ChangeRequestCreate orderId="ORD-1" order={{ status: "approved", deal_id: "D-1" }} />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  // The fields render disabled until CredentialProvider has read the stored
  // credential (writes off while loading); typing into them before then lands
  // nothing, which made this file fail about one run in three.
  const reason = await screen.findByLabelText("Request reason");
  await waitFor(() => expect(reason).toBeEnabled());
  await user.type(reason, "buyer asked");
  await user.type(screen.getByLabelText("New value"), "2026-10-15");
  await user.click(screen.getByRole("button", { name: "Create request" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Create request" }));
}

describe("raising a change request", () => {
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

  it("clears the form once the agent accepts the request, so it cannot be sent twice by habit", async () => {
    const sent: unknown[] = [];
    server.use(
      http.post(`${API}/api/v1/change-requests`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ change_request_id: "CR-1", status: "pending_approval" });
      }),
    );
    const user = userEvent.setup();
    mount();

    await fillAndSubmit(user);

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(await screen.findByText(/Created CR-1/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Request reason")).toHaveValue(""));
    expect(screen.getByLabelText("New value")).toHaveValue("");
  });

  it("keeps what was typed when the agent refuses, so it can be corrected", async () => {
    server.use(
      http.post(`${API}/api/v1/change-requests`, () =>
        HttpResponse.json({ detail: "nope" }, { status: 422 }),
      ),
    );
    const user = userEvent.setup();
    mount();

    await fillAndSubmit(user);

    await waitFor(() => expect(document.querySelector('[data-state="write-failed"]')).toBeTruthy());
    expect(screen.getByLabelText("Request reason")).toHaveValue("buyer asked");
    expect(screen.getByLabelText("New value")).toHaveValue("2026-10-15");
  });
});
