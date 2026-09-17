import { describe, expect, it } from "vitest";
import { asUtc, day, plural, stamp } from "../../src/lib/time";

describe("naive timestamps are read as UTC", () => {
  /**
   * The bug this exists for: order_service stamps `created_at` with a trailing
   * Z, OrderStateMachine stamps transitions without one. Both are utcnow(). A
   * browser east of Greenwich rendered the audit trail hours before the order
   * it belonged to.
   */
  it("marks a bare date-time as UTC", () => {
    expect(asUtc("2026-09-17T05:12:15.839341")).toBe("2026-09-17T05:12:15.839341Z");
  });

  it("leaves an explicit designator alone", () => {
    expect(asUtc("2026-09-17T05:12:15Z")).toBe("2026-09-17T05:12:15Z");
    expect(asUtc("2026-09-17T05:12:15z")).toBe("2026-09-17T05:12:15z");
    expect(asUtc("2026-09-17T07:12:15+02:00")).toBe("2026-09-17T07:12:15+02:00");
    expect(asUtc("2026-09-17T07:12:15+0200")).toBe("2026-09-17T07:12:15+0200");
  });

  /** A bare date is already UTC per spec; appending Z would be noise. */
  it("leaves a date without a time alone", () => {
    expect(asUtc("2026-12-01")).toBe("2026-12-01");
  });

  it("renders the two agent spellings of one instant identically", () => {
    expect(stamp("2026-09-17T05:12:15.839341")).toBe(stamp("2026-09-17T05:12:15.839341Z"));
  });

  it("agrees with an explicit offset for the same instant", () => {
    expect(stamp("2026-09-17T05:12:15Z")).toBe(stamp("2026-09-17T06:12:15+01:00"));
  });
});

describe("unparseable input", () => {
  it("is shown verbatim rather than as Invalid Date", () => {
    expect(stamp("not a date")).toBe("not a date");
    expect(day("whenever")).toBe("whenever");
  });

  it("renders an absent timestamp as a dash", () => {
    expect(stamp(null)).toBe("—");
    expect(stamp(undefined)).toBe("—");
    expect(stamp("")).toBe("—");
  });
});

describe("counts", () => {
  it("does not say 1 deals", () => {
    expect(plural(1, "deal")).toBe("1 deal");
    expect(plural(0, "deal")).toBe("0 deals");
    expect(plural(2, "deal")).toBe("2 deals");
  });

  it("takes an irregular plural", () => {
    expect(plural(1, "entry", "entries")).toBe("1 entry");
    expect(plural(3, "entry", "entries")).toBe("3 entries");
  });
});
