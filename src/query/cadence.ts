/**
 * Poll intervals, in milliseconds. Chosen per resource rather than globally:
 * events is the only genuinely live signal, and the deals list is an
 * unpaginated full scan that must never poll.
 */
export const CADENCE = {
  health: 30_000,
  events: 15_000,
  orders: 60_000,
  inventorySync: 60_000,
  rateCard: 300_000,
  /** Manual refresh only — an unpaginated scan of every stored deal. */
  deals: 0,
  /** Queued work an operator is waiting on; fast enough to feel live. */
  changeRequests: 60_000,
  /** Configuration, not activity. It changes when someone changes it. */
  curators: 300_000,
  mediaKit: 300_000,
  supplyChain: 300_000,
  agentCard: 300_000,
  /**
   * Manual refresh only. These proxy an external ad server, so a poll here
   * spends someone else's quota on a screen nobody may be looking at.
   */
  reporting: 0,
} as const;
