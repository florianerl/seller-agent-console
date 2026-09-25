import { afterEach, describe, expect, it } from "vitest";
import { asUtc, dateOrStamp, day, plural, stamp } from "../../src/lib/time";

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

describe("a bare date is a calendar day, not an instant", () => {
  const zone = process.env["TZ"];
  afterEach(() => {
    if (zone === undefined) delete process.env["TZ"];
    else process.env["TZ"] = zone;
  });

  /**
   * `new Date("2026-10-06")` is UTC midnight. Formatted in the viewer's zone,
   * anyone west of Greenwich saw a deal's flight start the day before it does.
   * The suite runs east of UTC, where the bug is invisible, so the zone is
   * forced here rather than trusted.
   */
  it.each(["America/Los_Angeles", "Pacific/Honolulu", "Asia/Tokyo", "UTC"])(
    "keeps the day in %s",
    (tz) => {
      process.env["TZ"] = tz;
      const expected = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(
        Date.UTC(2026, 9, 6),
      );
      expect(day("2026-10-06")).toBe(expected);
      expect(day("2026-10-06")).toMatch(/6/);
      expect(day("2026-10-06")).not.toMatch(/5/);
    },
  );
});

describe("a field that may be either", () => {
  it("gives a bare date no time, and a timestamp its time", () => {
    expect(dateOrStamp("2026-10-06")).toBe(day("2026-10-06"));
    expect(dateOrStamp("2026-12-31T23:59:59Z")).toBe(stamp("2026-12-31T23:59:59Z"));
    expect(dateOrStamp(null)).toBe("—");
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
