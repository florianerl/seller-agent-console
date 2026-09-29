import { describe, expect, it } from "vitest";
import {
  CR_STAGE,
  HAPPY_PATH,
  MOVED_BY,
  ORDER_TRANSITIONS,
  STAGE,
  STAGE_GROUPS,
  actorClaim,
  actorKind,
  enteredStatusAt,
  nextSteps,
  predictSeverity,
  refuseChange,
  stageGroupOf,
} from "../../src/api/order-lifecycle";
import { CHANGE_REQUEST_STATUSES, CHANGE_TYPES, ORDER_STATUSES } from "../../src/api/vocabulary";

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

describe("stage groups", () => {
  it("place every status in exactly one group", () => {
    const grouped = STAGE_GROUPS.flatMap((g) => g.statuses);
    expect([...grouped].sort()).toEqual([...STATUSES].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("say who moves every status", () => {
    expect(Object.keys(MOVED_BY).sort()).toEqual([...STATUSES].sort());
  });

  it("find the group of a status", () => {
    expect(stageGroupOf("syncing")?.id).toBe("execution");
    expect(stageGroupOf("archived")).toBeUndefined();
  });
});

describe("enteredStatusAt", () => {
  it("is the last transition", () => {
    expect(
      enteredStatusAt({
        created_at: "2026-09-28T13:00:00Z",
        audit_log: { transitions: [{ timestamp: "2026-09-28T14:00:00" }, { timestamp: "2026-09-28T15:00:00" }] },
      }),
    ).toBe("2026-09-28T15:00:00");
  });

  // Creation writes no transition, so a draft has only its creation time.
  it("falls back to creation for an order that never moved", () => {
    expect(enteredStatusAt({ created_at: "2026-09-28T13:00:00Z", audit_log: { transitions: [] } })).toBe(
      "2026-09-28T13:00:00Z",
    );
    expect(enteredStatusAt({ created_at: null })).toBeNull();
  });
});

describe("actorKind", () => {
  it.each([
    ["system", "system"],
    ["system:auto-approve", "system"],
    ["human:anna", "human"],
    ["agent:buyer-7", "agent"],
    ["test-buyer:advertiser", "other"],
  ] as const)("reads %s as %s", (actor, kind) => {
    expect(actorKind(actor)).toBe(kind);
  });
});

describe("change-request rules", () => {
  it.each([
    ["creative", "minor"],
    ["flight_dates", "material"],
    ["impressions", "material"],
    ["targeting", "material"],
    ["other", "material"],
    ["pricing", "critical"],
    ["cancellation", "critical"],
  ] as const)("classifies %s as %s", (type, severity) => {
    expect(predictSeverity(type).severity).toBe(severity);
  });

  it("covers every change type", () => {
    for (const { value } of CHANGE_TYPES) expect(predictSeverity(value).note).toBeTruthy();
  });

  it("refuses an order with no deal", () => {
    expect(refuseChange({ status: "booked", deal_id: "" })).toMatch(/no deal/);
    expect(refuseChange({ status: "booked", deal_id: null })).toMatch(/no deal/);
  });

  it.each(["completed", "cancelled", "failed"])("refuses a %s order", (status) => {
    expect(refuseChange({ status, deal_id: "D-1" })).toMatch(/does not modify/);
  });

  it.each(["syncing", "rejected", "unbooked"])("refuses a cancellation while %s", (status) => {
    expect(refuseChange({ status, deal_id: "D-1" }, "cancellation")).toMatch(/cancellation/);
    expect(refuseChange({ status, deal_id: "D-1" }, "creative")).toBeUndefined();
  });

  it("takes a change to a live order", () => {
    expect(refuseChange({ status: "booked", deal_id: "D-1" }, "cancellation")).toBeUndefined();
  });

  it("describes every change-request status", () => {
    for (const { value } of CHANGE_REQUEST_STATUSES) expect(CR_STAGE[value]).toBeTruthy();
  });
});
