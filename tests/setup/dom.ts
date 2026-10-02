import "@testing-library/jest-dom/vitest";
// The credential provider reads IndexedDB on mount, so every test that
// renders the app needs a working implementation.
import "fake-indexeddb/auto";
import { afterEach } from "vitest";
import { cleanup, configure } from "@testing-library/react";

afterEach(cleanup);

// Testing Library's 1s default for findBy/waitFor was a budget for this
// machine, not for a CI runner. On 2026-10-01 and -02, CI on main failed four
// times on waits that only ran long there: a select still disabled while the
// stored credential loaded, a lazy screen's heading, a whole-screen render.
// None was a bug, and each was patched one call at a time. 5s fixes the
// class; a genuine hang still fails well inside the 15s per-test budget.
configure({ asyncUtilTimeout: 5_000 });

// MUI's useMediaQuery needs matchMedia, which jsdom does not implement.
// Tests drive the breakpoint through setViewport() below.
let matches = false;

export function setViewport(kind: "mobile" | "desktop") {
  // The shell asks for breakpoints.up("md"); desktop matches, mobile does not.
  matches = kind === "desktop";
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
