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
  triggerInventorySync: { method: "POST", args: [{ incremental: false }] },
  supplyChain: { method: "GET", args: [] },

  // --- events, auth
  events: { method: "GET", args: [] },
  eventById: { method: "GET", args: ["e1"] },
  apiKeys: { method: "GET", args: [] },
  apiKeyById: { method: "GET", args: ["k-1"] },
  createBuyerApiKey: { method: "POST", args: [{ label: "buyer" }] },
  createOperatorApiKey: { method: "POST", args: [{ label: "ops" }] },
  revokeApiKey: { method: "DELETE", args: ["k-1"] },

  // --- orders
  orders: { method: "GET", args: [] },
  orderById: { method: "GET", args: ["ORD-1"] },
  orderHistory: { method: "GET", args: ["ORD-1"] },
  ordersReport: { method: "GET", args: [] },
  orderAudit: { method: "GET", args: ["ORD-1"] },
  createOrder: { method: "POST", args: [{ deal_id: "D-1" }] },
  transitionOrder: { method: "POST", args: ["ORD-1", { to_status: "submitted" }] },

  // --- deals
  deals: { method: "GET", args: [] },
  dealById: { method: "GET", args: ["D-1"] },
  dealsExport: { method: "GET", args: [] },
  dealPerformance: { method: "GET", args: ["D-1"] },
  dealLineage: { method: "GET", args: ["D-1"] },
  dealBuyerStatus: { method: "GET", args: ["D-1", "https://buyer.test"] },
  dealSspTroubleshoot: { method: "GET", args: ["D-1", "ssp-name"] },
  generateDeal: { method: "POST", args: [{ proposal_id: "P-1" }] },
  bookDeal: { method: "POST", args: [{ quote_id: "Q-1", idempotency_key: "idem-1" }] },
  dealFromTemplate: { method: "POST", args: [{ deal_type: "preferred_deal", product_id: "prod-1" }] },
  bulkDealOperations: { method: "POST", args: [{ operations: [{ action: "pause", deal_id: "D-1" }] }] },
  pushDeal: { method: "POST", args: [{ deal_id: "D-1", buyer_urls: ["https://buyer.test"] }] },
  distributeDeal: { method: "POST", args: [{ deal_id: "D-1" }] },
  createCuratedDeal: { method: "POST", args: [{ curator_id: "cur-1" }] },
  migrateDeal: { method: "POST", args: ["D-1", { reason: "move" }] },
  deprecateDeal: { method: "POST", args: ["D-1", { reason: "sunset" }] },

  // --- approvals, sessions, negotiation
  approvals: { method: "GET", args: [] },
  approvalById: { method: "GET", args: ["A-1"] },
  sessions: { method: "GET", args: [] },
  sessionById: { method: "GET", args: ["S-1"] },
  createSession: { method: "POST", args: [{}] },
  sendSessionMessage: { method: "POST", args: ["S-1", { message: "hello" }] },
  closeSession: { method: "POST", args: ["S-1"] },
  negotiationStatus: { method: "GET", args: ["P-1"] },
  submitProposal: {
    method: "POST",
    args: [
      {
        product_id: "prod-1",
        deal_type: "preferred_deal",
        price: 10,
        impressions: 1000,
        start_date: "2026-01-01",
        end_date: "2026-01-31",
      },
    ],
  },
  counterProposal: { method: "POST", args: ["P-1", { buyer_price: 9 }] },
  postNegotiationMessage: {
    method: "POST",
    args: [
      {
        idempotency_key: "idem-n",
        action: "counter",
        proposal_id: "P-1",
        buyer_price: { amount_micros: 9_000_000, currency: "USD" },
      },
    ],
  },

  // --- catalog
  products: { method: "GET", args: [] },
  productById: { method: "GET", args: ["prod-1"] },
  inventoryTypeOverride: { method: "GET", args: ["prod-1"] },
  rateCard: { method: "GET", args: [] },
  packages: { method: "GET", args: [] },
  packageById: { method: "GET", args: ["pkg-1"] },
  createPackage: { method: "POST", args: [{ name: "pkg", base_price: 10, floor_price: 5 }] },
  updatePackage: { method: "PUT", args: ["pkg-1", { name: "renamed" }] },
  deletePackage: { method: "DELETE", args: ["pkg-1"] },
  assemblePackage: { method: "POST", args: [{ name: "dyn", product_ids: ["prod-1"] }] },
  syncPackages: { method: "POST", args: [] },
  setInventoryTypeOverride: {
    method: "POST",
    args: ["prod-1", { product_id: "prod-1", inventory_type: "display" }],
  },
  deleteInventoryTypeOverride: { method: "DELETE", args: ["prod-1"] },
  putRateCard: { method: "PUT", args: [[{ inventory_type: "display", base_cpm: 12 }]] },
  createQuote: {
    method: "POST",
    args: [{ idempotency_key: "idem-q", product_id: "prod-1", media_type: "display" }],
  },
  mediaKit: { method: "GET", args: [] },
  mediaKitPackages: { method: "GET", args: [] },
  mediaKitPackage: { method: "GET", args: ["pkg-1"] },

  // --- registry, curators, quotes, change requests, reporting
  agents: { method: "GET", args: [] },
  agentById: { method: "GET", args: ["ag-1"] },
  agentCard: { method: "GET", args: [] },
  discoverAgent: { method: "POST", args: [{ agent_url: "https://buyer.test" }] },
  updateAgentTrust: { method: "PUT", args: ["ag-1", { trust_status: "approved" }] },
  removeRegisteredAgent: { method: "DELETE", args: ["ag-1"] },
  curators: { method: "GET", args: [] },
  curatorById: { method: "GET", args: ["cur-1"] },
  registerCurator: { method: "POST", args: [{ curator_id: "cur-1", name: "C", domain: "c.test" }] },
  quoteById: { method: "GET", args: ["Q-1"] },
  changeRequests: { method: "GET", args: [] },
  changeRequestById: { method: "GET", args: ["CR-1"] },
  reviewChangeRequest: { method: "POST", args: ["CR-1", { decision: "approve" as const }] },
  applyChangeRequest: { method: "POST", args: ["CR-1"] },
  createChangeRequest: {
    method: "POST",
    args: [{ idempotency_key: "idem-cr", order_id: "ORD-1", change_type: "flight_extension" }],
  },
  gamOrders: { method: "GET", args: [] },
  gamDeliveryReport: { method: "GET", args: [{ order_ids: "ORD-1" }] },

  // --- OpenProposal 3.0, provisional paths (ADR 14)
  openProposals: { method: "GET", args: [] },
  openProposalById: { method: "GET", args: ["OP-1"] },
  publishProposal: { method: "POST", args: ["OP-1", { idempotency_key: "idem-op", expected_version: 1 }] },
  withdrawProposal: { method: "POST", args: ["OP-1", { idempotency_key: "idem-op", expected_version: 1 }] },
  holdLineItem: {
    method: "POST",
    args: ["OP-1", "li-1", { action: "grant" as const, idempotency_key: "idem-op", expected_version: 1 }],
  },
  assentProposal: {
    method: "POST",
    args: ["OP-1", { decision: "accept" as const, idempotency_key: "idem-op", expected_version: 1 }],
  },

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
