import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { theme } from "../../src/theme/theme";
import { ConnectionMenu } from "../../src/shell/ConnectionMenu";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, loadCredential, saveCredential } from "../../src/credentials/store";

const KEY = "ask_live_supersecret_value";

function renderMenu() {
  return render(
    <ThemeProvider theme={theme}>
      <CredentialProvider>
        <ConnectionMenu />
      </CredentialProvider>
    </ThemeProvider>,
  );
}

describe("the sign-out control", () => {
  beforeEach(async () => {
    await clearCredential();
    await saveCredential({
      baseUrl: "https://agent.test",
      apiKey: KEY,
      role: "operator",
      name: "Ad Seller System API",
      reportedVersion: "2.4.2",
    });
  });

  it("shows which agent and role the console is connected as", async () => {
    renderMenu();
    await waitFor(() =>
      expect(document.querySelector('[data-connection="summary"]')?.textContent).toContain(
        "https://agent.test",
      ),
    );
    expect(document.querySelector('[data-connection="summary"]')?.textContent).toContain(
      "operator",
    );
  });

  /** The key must never be on screen, in any element, at any point. */
  it("never renders the key", async () => {
    renderMenu();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible());
    expect(document.body.textContent).not.toContain(KEY);
    expect(document.body.innerHTML).not.toContain(KEY);
  });

  it("asks before signing out, and cancelling keeps the credential", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await loadCredential()).toBeDefined();
  });

  /**
   * The confirmation says what signing out does *not* do. Someone who believes
   * it revokes the key will leave a live credential in the wild.
   */
  it("says plainly that signing out does not revoke the key", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/does not revoke/i);
    expect(dialog.textContent).toMatch(/revoke it on the agent/i);
  });

  it("removes the credential from storage when confirmed", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    await user.click(document.querySelector('[data-action="confirm-sign-out"]') as HTMLElement);

    await waitFor(async () => {
      expect(await loadCredential()).toBeUndefined();
    });
  });
});
