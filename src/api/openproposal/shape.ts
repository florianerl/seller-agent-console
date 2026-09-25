/**
 * Normalisers for the parts of an OpenProposal line item whose wire shape
 * depends on a mutability marker (spec §3).
 *
 * They live outside `src/api/endpoints/` on purpose: every function exported
 * from that barrel is swept as an endpoint by the method and write-switch
 * tests, and these are pure functions that never touch the network.
 *
 * Written against `3.0-draft-1`, which publishes no JSON Schema. The spec is
 * explicit about the fallbacks, and those are what keep a draft revision from
 * blanking a screen: a `selectable` field with no `available[]` is `seller-set`
 * (§3.1), and so is a `settable` field with no bounds (§3.2). Nothing here
 * throws; an unrecognised shape becomes `seller-set` with the raw value kept,
 * so the screen shows what arrived rather than inventing an option space.
 */

export type SelectOption = {
  /** The id `included[]` and `pricing` key on. Null for an unresolved ref. */
  readonly id: string | null;
  readonly label: string;
  /**
   * Present when the option is still a catalog reference
   * (`<namespace>/<collection>/<entry_id>@<version>`, §2.2), not a value.
   */
  readonly catalogRef: string | null;
};

export type PriceDelta = {
  readonly deltaCpm: number | null;
  readonly deltaFlat: number | null;
  readonly deltaPct: number | null;
};

export type Selectable =
  | {
      readonly kind: "selectable";
      readonly available: readonly SelectOption[];
      readonly included: readonly string[];
      readonly pricing: Readonly<Record<string, PriceDelta>>;
      readonly maxSelect: number | null;
    }
  | { readonly kind: "seller-set"; readonly value: unknown };

export type Settable =
  | { readonly kind: "allowed"; readonly allowed: readonly string[] }
  | { readonly kind: "range"; readonly min: string | number | null; readonly max: string | number | null }
  | { readonly kind: "seller-set"; readonly value: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * An option is a bare string (`"web_desktop"`), an object with an `id`, or a
 * catalog reference. Options the spec shows without an `id` — a measurement
 * vendor, a reporting feed — are keyed in `included[]` by their first string
 * field (`"IAS"`, `"aggregate"`), so that is the fallback here.
 */
function option(raw: unknown): SelectOption {
  if (typeof raw === "string") return { id: raw, label: raw, catalogRef: null };
  if (!isRecord(raw)) return { id: null, label: String(raw), catalogRef: null };

  const ref = str(raw["catalog_ref"]);
  if (ref !== null) return { id: null, label: ref, catalogRef: ref };

  const id = str(raw["id"]) ?? Object.values(raw).map(str).find((v) => v !== null) ?? null;
  return { id, label: str(raw["name"]) ?? id ?? "unnamed option", catalogRef: null };
}

function delta(raw: unknown): PriceDelta {
  const r = isRecord(raw) ? raw : {};
  return { deltaCpm: num(r["delta_cpm"]), deltaFlat: num(r["delta_flat"]), deltaPct: num(r["delta_pct"]) };
}

export function selectable(raw: unknown): Selectable | null {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw) || !Array.isArray(raw["available"])) return { kind: "seller-set", value: raw };

  const pricing = isRecord(raw["pricing"])
    ? Object.fromEntries(Object.entries(raw["pricing"]).map(([k, v]) => [k, delta(v)]))
    : {};

  return {
    kind: "selectable",
    available: raw["available"].map(option),
    included: Array.isArray(raw["included"]) ? raw["included"].filter((v) => typeof v === "string") : [],
    pricing,
    maxSelect: num(raw["max_select"]),
  };
}

export function settable(raw: unknown): Settable | null {
  if (raw === undefined || raw === null) return null;
  if (isRecord(raw) && Array.isArray(raw["allowed"])) {
    return { kind: "allowed", allowed: raw["allowed"].map((v) => String(v)) };
  }
  if (isRecord(raw) && ("min" in raw || "max" in raw)) {
    const bound = (v: unknown) => str(v) ?? num(v);
    return { kind: "range", min: bound(raw["min"]), max: bound(raw["max"]) };
  }
  return { kind: "seller-set", value: raw };
}

/**
 * Every catalog reference still present anywhere in a value. A summary keeps
 * them unresolved by design (§2.1); on an `agreed` proposal any survivor is a
 * spec violation (§2.2), and the screen says so rather than hiding it.
 */
export function unresolvedRefs(value: unknown): string[] {
  const found = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (isRecord(node)) {
      // `catalog_ref` on the wire and in fields passed through unrendered;
      // `catalogRef` once an option space has been normalised by `option()`.
      const ref = str(node["catalog_ref"]) ?? str(node["catalogRef"]);
      if (ref !== null) found.add(ref);
      Object.values(node).forEach(walk);
    }
  };
  walk(value);
  return [...found];
}

/**
 * Parse an array element by element, so one line item the draft has since
 * reshaped degrades to a count rather than taking its siblings down with it.
 * The count is returned rather than dropped: a proposal silently showing two
 * of its three line items would look complete.
 */
export function eachOrCount<T>(
  raw: unknown,
  parse: (item: unknown) => { success: true; data: T } | { success: false },
): { items: T[]; unreadable: number } {
  if (!Array.isArray(raw)) return { items: [], unreadable: 0 };
  const items: T[] = [];
  let unreadable = 0;
  for (const entry of raw) {
    const parsed = parse(entry);
    if (parsed.success) items.push(parsed.data);
    else unreadable += 1;
  }
  return { items, unreadable };
}
