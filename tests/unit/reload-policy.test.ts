import { describe, expect, it } from "vitest";
import { shouldReloadOnControllerChange } from "../../src/pwa/reload-policy";

/**
 * Regression cover for a defect found only by running the update against the
 * live deployment: the new worker took control while the page kept running the
 * previous build.
 */
describe("reloading when a new worker takes control", () => {
  it("reloads when an update replaces a worker that was already controlling", () => {
    expect(shouldReloadOnControllerChange({ wasControlled: true, reloading: false })).toBe(true);
  });

  // clientsClaim() fires controllerchange on a first install too.
  it("does not reload on a first install", () => {
    expect(shouldReloadOnControllerChange({ wasControlled: false, reloading: false })).toBe(false);
  });

  it("reloads at most once", () => {
    expect(shouldReloadOnControllerChange({ wasControlled: true, reloading: true })).toBe(false);
  });

  it("never reloads on a first install even if the event repeats", () => {
    expect(shouldReloadOnControllerChange({ wasControlled: false, reloading: true })).toBe(false);
  });
});
