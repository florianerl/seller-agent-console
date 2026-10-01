/**
 * The sidebar is generated from this table, so "which screens exist" has one
 * definition. `soon` screens render as disabled items with a chip rather than
 * links — they are roadmap information we chose to display, which is why they
 * are held to a readability bar (see CONTRAST_CONTRACT).
 */
export type Screen = {
  readonly id: string;
  /** Hash route path. The landing screen is the index route. */
  readonly path: string;
  readonly label: string;
  /** Not yet built. Rendered disabled, excluded from the router. */
  readonly soon?: true;
  /** Needs an operator key; a buyer key sees a gated state rather than a 403. */
  readonly operatorOnly?: true;
};

export const SCREENS: readonly Screen[] = [
  { id: "setup", path: "/", label: "Setup and health" },
  { id: "inbox", path: "/inbox", label: "Inbox" },
  { id: "catalog", path: "/catalog", label: "Catalog" },
  { id: "media-kit", path: "/media-kit", label: "Media kit" },
  { id: "curators", path: "/curators", label: "Curators" },
  { id: "proposals", path: "/proposals", label: "Proposals" },
  { id: "negotiation", path: "/negotiation", label: "Negotiation" },
  { id: "deals", path: "/deals", label: "Deals" },
  { id: "orders", path: "/orders", label: "Orders" },
  { id: "events", path: "/events", label: "Events", operatorOnly: true },
  { id: "agents", path: "/agents", label: "Agents" },
];

export const BUILT_SCREENS = SCREENS.filter((s) => !s.soon);

/**
 * Sidebar grouping only. Order of `SCREENS` is still the source of "which
 * screens exist"; this table must list every id or the shell test fails.
 */
// Groups follow the deal lifecycle top to bottom: discover what is for sale,
// agree terms (proposal or quote, then negotiation), book the deal, run the
// order, then read the event log of what happened. Keep it in that order.
export const NAV_GROUPS: ReadonlyArray<{ label: string; ids: readonly string[] }> = [
  { label: "Overview", ids: ["setup", "inbox"] },
  { label: "Discover", ids: ["catalog", "media-kit", "curators"] },
  { label: "Pipeline", ids: ["proposals", "negotiation", "deals", "orders"] },
  { label: "Monitor", ids: ["events"] },
  { label: "Network", ids: ["agents"] },
];

export const NAV_GROUP_IDS = NAV_GROUPS.flatMap((group) => group.ids);

export const DRAWER_WIDTH = 288;
