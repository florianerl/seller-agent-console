import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { theme } from "../../src/theme/theme";
import { InstallButton } from "../../src/pwa/InstallButton";
import {
  getInstallState,
  resetInstallState,
  subscribeInstall,
  watchInstallability,
} from "../../src/pwa/install";

type Choice = "accepted" | "dismissed";

/** A stand-in for Chrome's beforeinstallprompt event. */
function fireInstallable(outcome: Choice = "accepted") {
  const prompt = vi.fn(() => Promise.resolve());
  const event = Object.assign(new Event("beforeinstallprompt"), {
    prompt,
    userChoice: Promise.resolve({ outcome }),
  });
  window.dispatchEvent(event);
  return prompt;
}

function renderButton() {
  return render(
    <ThemeProvider theme={theme}>
      <InstallButton />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  resetInstallState();
  watchInstallability();
  // jsdom has no matchMedia; standalone is false unless a test says otherwise.
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the external store", () => {
  /**
   * The bug this exists for: getInstallState built a fresh object on every
   * call, so useSyncExternalStore saw a new snapshot each render and React
   * threw "Maximum update depth exceeded" — a white screen for the whole app,
   * not a broken button. It only showed in a built bundle.
   */
  it("returns the same snapshot object while nothing changes", () => {
    const first = getInstallState();
    expect(getInstallState()).toBe(first);
    expect(getInstallState()).toBe(first);
  });

  it("returns a new snapshot only when the state actually changes", () => {
    const before = getInstallState();
    fireInstallable();
    const after = getInstallState();
    expect(after).not.toBe(before);
    expect(after.canPrompt).toBe(true);
    expect(getInstallState()).toBe(after);
  });

  it("does not notify subscribers when nothing changed", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeInstall(listener);
    window.dispatchEvent(new Event("appinstalled"));
    expect(listener).toHaveBeenCalledTimes(1);

    // A second identical event must not churn React.
    window.dispatchEvent(new Event("appinstalled"));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe("the install button", () => {
  it("stays hidden until the browser says the app is installable", () => {
    renderButton();
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
  });

  it("appears once the browser offers an install", async () => {
    renderButton();
    fireInstallable();
    expect(await screen.findByRole("button", { name: "Install" })).toBeVisible();
  });

  it("prompts the browser when clicked", async () => {
    const user = userEvent.setup();
    renderButton();
    const prompt = fireInstallable("accepted");

    await user.click(await screen.findByRole("button", { name: "Install" }));
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
  });

  /** Asked once and told no. Asking again in the app's own chrome is nagging. */
  it("stops offering after the install is declined", async () => {
    const user = userEvent.setup();
    renderButton();
    fireInstallable("dismissed");

    await user.click(await screen.findByRole("button", { name: "Install" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Install" })).toBeNull());
  });

  it("disappears once the app reports itself installed", async () => {
    renderButton();
    fireInstallable();
    expect(await screen.findByRole("button", { name: "Install" })).toBeVisible();

    window.dispatchEvent(new Event("appinstalled"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Install" })).toBeNull());
  });

  it("offers nothing at all when already running as the installed app", () => {
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes("standalone"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      }));

    renderButton();
    fireInstallable();
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
  });
});

describe("when the app is installed but viewed in a tab", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "getInstalledRelatedApps", {
      configurable: true,
      value: () => Promise.resolve([{ platform: "webapp" }]),
    });
  });

  /**
   * No web API can launch an installed app from a page. A button that claimed
   * to and did nothing would be worse than the sentence that explains where
   * the real control is.
   */
  it("offers to explain rather than pretending it can open the app", async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(await screen.findByRole("button", { name: "Open in app" }));

    const help = await screen.findByText(/a page cannot open an installed app/i);
    expect(help).toBeVisible();
    expect(document.querySelector('[data-help="open-in-app"]')).toBeTruthy();
  });
});
