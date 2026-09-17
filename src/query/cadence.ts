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
} as const;
