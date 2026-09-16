import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);

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
