/**
 * Timestamp rendering, in one place, because the agent is not consistent about
 * saying what its timestamps mean.
 *
 * `order_service` writes `datetime.utcnow().isoformat() + "Z"`, but
 * `OrderStateMachine` writes a bare `datetime.utcnow()` with no designator.
 * Both are UTC; only one says so. JavaScript parses a date-time string with no
 * offset as *local* time, so an order created at 07:12 CEST rendered its own
 * transitions at 05:12 — the timeline disagreed with the row it sat inside,
 * which on an audit trail reads as data corruption rather than as a formatting
 * bug.
 *
 * A bare date ("2026-12-01") is already UTC by specification and is left alone.
 */
const HAS_TIME = /\d{2}:\d{2}/;
const HAS_ZONE = /(?:[Zz]|[+-]\d{2}:?\d{2})$/;

/** Marks a naive UTC timestamp as UTC. Anything already explicit is untouched. */
export function asUtc(iso: string): string {
  const trimmed = iso.trim();
  if (!HAS_TIME.test(trimmed)) return trimmed;
  if (HAS_ZONE.test(trimmed)) return trimmed;
  return `${trimmed}Z`;
}

function parse(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined;
  const at = new Date(asUtc(iso));
  return Number.isNaN(at.getTime()) ? undefined : at;
}

/** Date and time, in the viewer's zone. Unparseable input is shown verbatim. */
export function stamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const at = parse(iso);
  if (!at) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(at);
}

/** Time only, for a dense feed where the date is already established. */
export function clock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const at = parse(iso);
  if (!at) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(at);
}

/** Date only, for flight windows the agent stores without a time. */
export function day(iso: string | null | undefined): string {
  if (!iso) return "—";
  const at = parse(iso);
  if (!at) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(at);
}

/** "1 deal" / "2 deals" — a count next to a bare plural reads as a bug. */
export function plural(count: number, singular: string, plural?: string): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}
