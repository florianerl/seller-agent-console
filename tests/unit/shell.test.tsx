import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { CredentialProvider } from "../../src/credentials/context";
import { Router } from "../../src/shell/router";
import { theme } from "../../src/theme/theme";
import { NAV_GROUP_IDS, SCREENS } from "../../src/shell/screens";
import { setViewport } from "../setup/dom";

// HashRouter reads window.location, which persists across tests in a file.
// Without this the suite passes or fails depending on execution order.
beforeEach(() => {
  window.location.hash = "#/";
});

function renderApp() {
  return render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <CredentialProvider>
        <Router />
      </CredentialProvider>
    </ThemeProvider>,
  );
}

async function axeViolations(container: HTMLElement) {
  const results = await axe.run(container, {
    resultTypes: ["violations"],
    // Colour contrast is asserted exactly by the contrast guard against the
    // theme; jsdom has no layout engine so axe cannot compute it here.
    rules: { "color-contrast": { enabled: false } },
  });
  return results.violations.map((v) => `${v.id}: ${v.description}`);
}

describe("shell navigation", () => {
  beforeEach(() => setViewport("desktop"));

  it("renders every screen in the sidebar", async () => {
    renderApp();
    const nav = await screen.findByRole("navigation", { name: /console sections/i });
    for (const s of SCREENS) {
      expect(within(nav).getByText(s.label)).toBeInTheDocument();
    }
  });

  it("places every screen in a nav group", () => {
    expect([...NAV_GROUP_IDS].sort()).toEqual([...SCREENS.map((s) => s.id)].sort());
  });

  it("renders built screens as links and unbuilt ones as non-interactive", async () => {
    renderApp();
    const nav = await screen.findByRole("navigation", { name: /console sections/i });

    for (const s of SCREENS.filter((x) => !x.soon)) {
      expect(within(nav).getByRole("link", { name: s.label })).toBeInTheDocument();
    }

    // A disabled link would be a focus stop that does nothing, and announcing
    // a roadmap item as a button would lie about what it does.
    for (const s of SCREENS.filter((x) => x.soon)) {
      expect(within(nav).queryByRole("link", { name: s.label })).toBeNull();
      expect(within(nav).queryByRole("button", { name: s.label })).toBeNull();
      const item = document.querySelector(`[data-nav="${s.id}"]`);
      expect(item).toHaveAttribute("data-state", "soon");
      expect(within(item as HTMLElement).getByText("soon")).toBeInTheDocument();
    }
  });

  it("marks the current screen with aria-current", async () => {
    renderApp();
    const link = await screen.findByRole("link", { name: "Setup and health" });
    expect(link).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: "Orders" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("navigates between screens and moves aria-current with it", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("link", { name: "Orders" }));

    // Every placeholder screen renders the same body text, so waiting on that
    // matches the screen we are navigating AWAY from and races the lazy chunk.
    // Wait for the destination itself.
    await screen.findByRole("heading", { name: "Orders" });
    expect(document.querySelector('[data-screen="orders"]')).toBeTruthy();
    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("is traversable by keyboard alone", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("navigation", { name: /console sections/i });

    const reachable: string[] = [];
    for (let i = 0; i < 20; i++) {
      await user.tab();
      const el = document.activeElement;
      if (el && el.tagName === "A") reachable.push(el.textContent ?? "");
    }

    // Every built screen must be reachable without a pointer.
    for (const s of SCREENS.filter((x) => !x.soon)) {
      expect(reachable, `${s.label} was not reachable by tabbing`).toContain(s.label);
    }
  });
});

describe("responsive drawer", () => {
  it("shows no menu button on desktop", async () => {
    setViewport("desktop");
    renderApp();
    await screen.findByRole("navigation", { name: /console sections/i });
    expect(screen.queryByRole("button", { name: /open navigation/i })).toBeNull();
  });

  it("opens the temporary drawer from the menu button on mobile", async () => {
    setViewport("mobile");
    const user = userEvent.setup();
    renderApp();

    const button = await screen.findByRole("button", { name: /open navigation/i });
    expect(button).toHaveAttribute("aria-expanded", "false");

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(
      await screen.findByRole("link", { name: "Setup and health" }),
    ).toBeInTheDocument();
  });
});

describe("accessibility", () => {
  it.each(["/", "/events", "/orders", "/deals"])(
    "has no axe violations on %s",
    async (path) => {
      setViewport("desktop");
      window.location.hash = `#${path}`;
      const { container } = renderApp();
      await screen.findByRole("navigation", { name: /console sections/i });
      // Let the lazy screen resolve, or axe inspects only the spinner.
      await screen.findByRole("heading", { level: 2 });

      expect(await axeViolations(container)).toEqual([]);
    },
  );

  it("has no axe violations with the mobile drawer open", async () => {
    setViewport("mobile");
    window.location.hash = "#/";
    const user = userEvent.setup();
    const { container } = renderApp();

    await user.click(await screen.findByRole("button", { name: /open navigation/i }));
    await screen.findByRole("link", { name: "Setup and health" });

    expect(await axeViolations(container)).toEqual([]);
  });
});
