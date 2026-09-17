import type { Connection } from "../../src/api/http";

/**
 * How to call every endpoint in the table, and the method each one issues.
 *
 * Two tests need this and must not disagree: one asserts each endpoint uses the
 * method it claims, the other sweeps the whole table with the write switch off
 * and checks the wire. Both discover the exports rather than listing them, so
 * an endpoint added without an entry here fails as a missing key rather than
 * being skipped in silence.
 *
 * `method` is the contract. A `POST` here is either a deliberate write or one
 * of the five query-shaped routes exempted in src/api/policy.ts, and adding one
 * means saying which.
 */
export type CallSpec = {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Arguments after the connection. */
  readonly args: readonly unknown[];
};

export const ENDPOINT_CALLS: Record<string, CallSpec> = {
  // --- core
  root: { method: "GET", args: [] },
  health: { method: "GET", args: [] },
  inventorySyncStatus: { method: "GET", args: [] },
  inventorySyncWatermark: { method: "GET", args: [] },
  supplyChain: { method: "GET", args: [] },

  // --- events, auth
  events: { method: "GET", args: [] },
  eventById: { method: "GET", args: ["e1"] },
  apiKeys: { method: "GET", args: [] },
  apiKeyById: { method: "GET", args: ["k-1"] },

  // --- orders
  orders: { method: "GET", args: [] },
  orderById: { method: "GET", args: ["ORD-1"] },
  orderHistory: { method: "GET", args: ["ORD-1"] },
  ordersReport: { method: "GET", args: [] },
  orderAudit: { method: "GET", args: ["ORD-1"] },

  // --- deals
  deals: { method: "GET", args: [] },
  dealById: { method: "GET", args: ["D-1"] },
  dealsExport: { method: "GET", args: [] },
  dealPerformance: { method: "GET", args: ["D-1"] },
  dealLineage: { method: "GET", args: ["D-1"] },
  dealBuyerStatus: { method: "GET", args: ["D-1", "https://buyer.test"] },
  dealSspTroubleshoot: { method: "GET", args: ["D-1", "ssp-name"] },

  // --- approvals, sessions, negotiation
  approvals: { method: "GET", args: [] },
  approvalById: { method: "GET", args: ["A-1"] },
  sessions: { method: "GET", args: [] },
  sessionById: { method: "GET", args: ["S-1"] },
  negotiationStatus: { method: "GET", args: ["P-1"] },

  // --- catalog
  products: { method: "GET", args: [] },
  productById: { method: "GET", args: ["prod-1"] },
  inventoryTypeOverride: { method: "GET", args: ["prod-1"] },
  rateCard: { method: "GET", args: [] },
  packages: { method: "GET", args: [] },
  packageById: { method: "GET", args: ["pkg-1"] },
  mediaKit: { method: "GET", args: [] },
  mediaKitPackages: { method: "GET", args: [] },
  mediaKitPackage: { method: "GET", args: ["pkg-1"] },

  // --- registry, curators, quotes, change requests, reporting
  agents: { method: "GET", args: [] },
  agentById: { method: "GET", args: ["ag-1"] },
  agentCard: { method: "GET", args: [] },
  curators: { method: "GET", args: [] },
  curatorById: { method: "GET", args: ["cur-1"] },
  quoteById: { method: "GET", args: ["Q-1"] },
  changeRequests: { method: "GET", args: [] },
  changeRequestById: { method: "GET", args: ["CR-1"] },
  gamOrders: { method: "GET", args: [] },
  gamDeliveryReport: { method: "GET", args: [{ order_ids: "ORD-1" }] },

  // --- writes. Each one is refused at the seam while the switch is off.
  decideApproval: { method: "POST", args: ["A-1", { decision: "approve" as const }] },
  resumeApproval: { method: "POST", args: ["A-1"] },

  // --- the five query-shaped POSTs: unsafe by method, safe by semantics.
  // Exempted by exact path in src/api/policy.ts; ADR 12 says what that costs.
  discovery: { method: "POST", args: [{ query: "sports inventory" }] },
  checkAvails: {
    method: "POST",
    args: [{ productid: "prod-1", startdate: "2026-01-01", enddate: "2026-01-31" }],
  },
  pricingQuote: { method: "POST", args: [{ product_id: "prod-1" }] },
  searchMediaKit: { method: "POST", args: [{ query: "video" }] },
  audienceMatch: {
    method: "POST",
    args: [{ audience_ref: { type: "agentic" as const, identifier: "aud-1" } }],
  },
};

export type EndpointFn = (c: Connection, ...rest: never[]) => Promise<unknown>;
