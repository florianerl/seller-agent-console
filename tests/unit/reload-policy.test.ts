import { describe, expect, it } from "vitest";
import { shouldReloadOnControllerChange } from "../../src/pwa/reload-policy";

const state = (over: Partial<Parameters<typeof shouldReloadOnControllerChange>[0]> = {}) => ({
  updateRequested: false,
  wasControlled: false,
  reloading: false,
  ...over,
});

/**
 * This function has now been wrong twice, both times stranding an operator on
 * a stale build behind a prompt that did nothing. The table below is written
 * around those two failures rather than around the shape of the code.
 */
describe("reloading when a new worker takes control", () => {
  /**
   * The case the second version got wrong, and the reason CI on Linux caught
   * what a local run did not. On a first visit the worker claims the page
   * AFTER registration, so `wasControlled` stays false for that page's whole
   * life — including an hour later when the operator finally clicks Reload.
   */
  it("reloads when the operator asked for the update, even on a page that began uncontrolled", () => {
    expect(shouldReloadOnControllerChange(state({ updateRequested: true }))).toBe(true);
  });

  it("reloads when an update replaces a worker that was already controlling", () => {
    expect(shouldReloadOnControllerChange(state({ wasControlled: true }))).toBe(true);
  });

  // clientsClaim() fires controllerchange on a first install too. Reloading
  // there restarts the app during someone's first visit, for nothing.
  it("does not reload on a first install nobody asked about", () => {
    expect(shouldReloadOnControllerChange(state())).toBe(false);
  });

  it("reloads at most once, however the reload was reached", () => {
    expect(
      shouldReloadOnControllerChange(state({ updateRequested: true, reloading: true })),
    ).toBe(false);
    expect(shouldReloadOnControllerChange(state({ wasControlled: true, reloading: true }))).toBe(
      false,
    );
  });

  it("never reloads on an unrequested first install even if the event repeats", () => {
    expect(shouldReloadOnControllerChange(state({ reloading: true }))).toBe(false);
  });
});
