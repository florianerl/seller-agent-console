import { describe, expect, it } from "vitest";
import {
  HAPPY_PATH,
  ORDER_TRANSITIONS,
  STAGE,
  actorClaim,
  nextSteps,
} from "../../src/api/order-lifecycle";
import { ORDER_STATUSES } from "../../src/api/vocabulary";

const STATUSES = ORDER_STATUSES.map((o) => o.value);

describe("the order move table", () => {
  // Pinned on purpose: this is a copy of upstream's _DEFAULT_TRANSITIONS, and
  // an edit here should be a deliberate re-read of order_state_machine.py,
  // not a drive-by.
  it("matches the upstream table it copies", () => {
    expect(ORDER_TRANSITIONS.map((t) => `${t.from}>${t.to}`)).toEqual([
      "draft>submitted",
      "submitted>pending_approval",
      "submitted>approved",
      "pending_approval>approved",
      "pending_approval>rejected",
      "approved>in_progress",
      "in_progress>syncing",
      "syncing>booked",
      "booked>completed",
      "booked>unbooked",
      "draft>cancelled",
      "submitted>cancelled",
      "submitted>failed",
      "pending_approval>cancelled",
      "approved>cancelled",
      "in_progress>failed",
      "in_progress>cancelled",
      "syncing>failed",
      "rejected>draft",
      "failed>draft",
      "unbooked>draft",
    ]);
  });

  it("only names statuses the agent knows", () => {
    for (const t of ORDER_TRANSITIONS) {
      expect(STATUSES).toContain(t.from);
      expect(STATUSES).toContain(t.to);
    }
    for (const step of HAPPY_PATH) expect(STATUSES).toContain(step);
  });

  it("describes every status", () => {
    expect(Object.keys(STAGE).sort()).toEqual([...STATUSES].sort());
  });
});

describe("nextSteps", () => {
  it.each([
    ["draft", ["submitted", "cancelled"]],
    ["submitted", ["pending_approval", "approved", "cancelled", "failed"]],
    ["pending_approval", ["approved", "rejected", "cancelled"]],
    ["approved", ["in_progress", "cancelled"]],
    ["in_progress", ["syncing", "failed", "cancelled"]],
    ["syncing", ["booked", "failed"]],
    ["booked", ["completed", "unbooked"]],
    ["rejected", ["draft"]],
    ["failed", ["draft"]],
    ["unbooked", ["draft"]],
  ])("from %s offers %j, forward moves first", (from, to) => {
    expect(nextSteps(from).map((s) => s.to)).toEqual(to);
  });

  it.each(["completed", "cancelled"])("offers nothing from terminal %s", (status) => {
    expect(nextSteps(status)).toEqual([]);
  });

  it("offers nothing for a status it does not know", () => {
    expect(nextSteps("archived")).toEqual([]);
  });

  it("never puts a cancel before a forward move", () => {
    for (const status of STATUSES) {
      const kinds = nextSteps(status).map((s) => s.kind);
      const firstOff = kinds.findIndex((k) => k !== "forward");
      if (firstOff >= 0) expect(kinds.slice(firstOff)).not.toContain("forward");
    }
  });

  it("carries the upstream description, verbatim", () => {
    expect(nextSteps("pending_approval")[0]).toMatchObject({
      to: "approved",
      label: "Approve",
      description: "Human approved",
      kind: "forward",
    });
  });
});

describe("actorClaim", () => {
  it("follows the agent's prefix convention", () => {
    expect(actorClaim({ kind: "human", id: " anna " })).toBe("human:anna");
    expect(actorClaim({ kind: "agent", id: "buyer-7" })).toBe("agent:buyer-7");
    expect(actorClaim({ kind: "system", id: "ignored" })).toBe("system");
  });

  it("refuses a named actor with no name", () => {
    expect(actorClaim({ kind: "human", id: "  " })).toBeUndefined();
  });
});
