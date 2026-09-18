import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { theme } from "../../src/theme/theme";
import { ConnectionMenu } from "../../src/shell/ConnectionMenu";
import { WritesChip } from "../../src/shell/WritesChip";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, loadCredential, saveCredential } from "../../src/credentials/store";
import { resetWritePolicy, writesEnabled } from "../../src/api/policy";

function renderMenu() {
  return render(
    <ThemeProvider theme={theme}>
      <CredentialProvider>
        <WritesChip />
        <ConnectionMenu />
      </CredentialProvider>
    </ThemeProvider>,
  );
}

/** MUI renders a Switch as role="switch", not role="checkbox". */
const toggle = () => screen.getByRole("switch", { name: "Enable write operations" });

describe("the write switch", () => {
  beforeEach(async () => {
    await clearCredential();
    resetWritePolicy();
    await saveCredential({
      baseUrl: "https://agent.test",
      apiKey: "ask_live_supersecret_value",
      role: "operator",
      name: "Ad Seller System API",
      reportedVersion: "2.4.2",
    });
  });

  it("starts off for a freshly connected key", async () => {
    renderMenu();
    await waitFor(() => expect(toggle()).not.toBeChecked());
    expect(writesEnabled()).toBe(false);
    expect(document.querySelector('[data-writes="on"]')).toBeNull();
  });

  it("asks before enabling, and cancelling changes nothing", async () => {
    const user = userEvent.setup();
    renderMenu();
    await waitFor(() => expect(toggle()).toBeInTheDocument());

    await user.click(toggle());
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(writesEnabled()).toBe(false);
    expect((await loadCredential())?.writesEnabled).toBe(false);
  });

  /**
   * The dialog has to name what this key can do. "Are you sure?" would be a
   * dialog people learn to click through.
   */
  it("says what enabling writes lets the console change", async () => {
    const user = userEvent.setup();
    renderMenu();
    await waitFor(() => expect(toggle()).toBeInTheDocument());
    await user.click(toggle());

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/approvals/i);
    expect(dialog.textContent).toMatch(/rate card/i);
    expect(dialog.textContent).toMatch(/turn it off again/i);
  });

  it("enables the policy, persists it, and shows the chip when confirmed", async () => {
    const user = userEvent.setup();
    renderMenu();
    await waitFor(() => expect(toggle()).toBeInTheDocument());
    await user.click(toggle());
    await user.click(document.querySelector('[data-action="confirm-enable-writes"]') as HTMLElement);

    await waitFor(() => expect(writesEnabled()).toBe(true));
    expect((await loadCredential())?.writesEnabled).toBe(true);
    await waitFor(() =>
      expect(document.querySelector('[data-writes="on"]')?.textContent).toBe("Writes on"),
    );
  });

  /** Turning writes off is the safe direction and must not need a dialog. */
  it("turns writes off immediately, without asking", async () => {
    const user = userEvent.setup();
    renderMenu();
    await waitFor(() => expect(toggle()).toBeInTheDocument());
    await user.click(toggle());
    await user.click(document.querySelector('[data-action="confirm-enable-writes"]') as HTMLElement);
    await waitFor(() => expect(writesEnabled()).toBe(true));
    // The confirm dialog is modal, so everything behind it is aria-hidden
    // until it has finished closing — including the switch.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(toggle());

    await waitFor(() => expect(writesEnabled()).toBe(false));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((await loadCredential())?.writesEnabled).toBe(false);
  });

  /** A stored yes has to survive a reload, or the switch is theatre. */
  it("restores a stored yes on load, and pushes it to the seam", async () => {
    const stored = await loadCredential();
    await saveCredential({ ...stored!, writesEnabled: true });

    renderMenu();

    await waitFor(() => expect(toggle()).toBeChecked());
    expect(writesEnabled()).toBe(true);
  });

  /** Sign-out takes the permission with the key. */
  it("is off again after signing out", async () => {
    const stored = await loadCredential();
    await saveCredential({ ...stored!, writesEnabled: true });

    const user = userEvent.setup();
    renderMenu();
    await waitFor(() => expect(writesEnabled()).toBe(true));

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await user.click(document.querySelector('[data-action="confirm-sign-out"]') as HTMLElement);

    await waitFor(() => expect(writesEnabled()).toBe(false));
    expect(await loadCredential()).toBeUndefined();
  });

  /**
   * A record written before the switch existed has no flag at all. It must
   * read as off rather than as undefined-and-therefore-whatever.
   */
  it("treats a credential stored before the switch existed as read-only", async () => {
    const stored = await loadCredential();
    const legacy = { ...stored! } as Record<string, unknown>;
    delete legacy["writesEnabled"];
    await saveCredential(legacy as never);

    renderMenu();

    await waitFor(() => expect(toggle()).toBeInTheDocument());
    expect(toggle()).not.toBeChecked();
    expect(writesEnabled()).toBe(false);
  });

  it("renders WritesChip and ConnectionMenu together when writes are enabled", async () => {
    const stored = await loadCredential();
    await saveCredential({ ...stored!, writesEnabled: true });

    const { container } = renderMenu();
    await waitFor(() => expect(toggle()).toBeChecked());

    expect(container.querySelector('[data-writes="on"]')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByText(/operator/)).toBeInTheDocument();
  });
});
