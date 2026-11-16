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
  /**
   * Built and routed, but left out of the nav. For a screen whose upstream
   * has not landed: a direct link still works, nothing invites an operator in.
   */
  readonly hidden?: true;
  /** Needs an operator key; a buyer key sees a gated state rather than a 403. */
  readonly operatorOnly?: true;
};

export const SCREENS: readonly Screen[] = [
  { id: "setup", path: "/", label: "Setup and health" },
  { id: "inbox", path: "/inbox", label: "Inbox" },
  { id: "catalog", path: "/catalog", label: "Catalog" },
  { id: "media-kit", path: "/media-kit", label: "Media kit" },
  { id: "curators", path: "/curators", label: "Curators" },
  // Hidden until the seller agent's feat/openproposal-mapping branch merges
  // (ADR 15). Until then every agent on its main line lands on the not-served
  // notice; #/proposals still works against one running the branch.
  { id: "proposals", path: "/proposals", label: "Proposals", hidden: true },
  { id: "negotiation", path: "/negotiation", label: "Negotiation" },
  { id: "deals", path: "/deals", label: "Deals" },
  { id: "orders", path: "/orders", label: "Orders" },
  { id: "events", path: "/events", label: "Events", operatorOnly: true },
  { id: "agents", path: "/agents", label: "Agents" },
];

export const BUILT_SCREENS = SCREENS.filter((s) => !s.soon);

/** What the nav renders. Hidden screens keep their place in `NAV_GROUPS`. */
export const NAV_SCREENS = SCREENS.filter((s) => !s.hidden);

/**
 * Nav grouping only. Order of `SCREENS` is still the source of "which screens
 * exist"; this table must list every id or the shell test fails.
 */
// Groups follow the deal lifecycle: discover what is for sale, agree terms
// (proposal or quote, negotiation, closing the deal), execute the order, then
// monitor the event log. `stage` marks the lifecycle steps; the horizontal
// header numbers nothing but draws chevrons between them, so a group that is
// not a step (Overview) stays outside the chain. Keep the stages in order.
export type NavGroup = {
  readonly label: string;
  readonly ids: readonly string[];
  readonly stage?: true;
};

export const NAV_GROUPS: readonly NavGroup[] = [
  { label: "Overview", ids: ["setup", "inbox"] },
  { label: "Discovery", ids: ["catalog", "media-kit", "curators", "agents"], stage: true },
  { label: "Planning", ids: ["proposals", "negotiation", "deals"], stage: true },
  { label: "Execution", ids: ["orders"], stage: true },
  // Events is the agent's audit log, not delivery reporting; "Monitoring"
  // says what the screen does without promising impressions or spend.
  { label: "Monitoring", ids: ["events"], stage: true },
];

export const NAV_GROUP_IDS = NAV_GROUPS.flatMap((group) => group.ids);

export const DRAWER_WIDTH = 288;
