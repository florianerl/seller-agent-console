import type { BrowserContext, Route } from "@playwright/test";

/** The address the tests tell the console to connect to. Never contacted. */
export const AGENT = "https://agent.test";

const OK = {
  "/": { name: "Ad Seller System API", version: "2.4.2" },
  "/health": { status: "healthy" },
  "/auth/api-keys": { keys: [] },
  "/events": {
    events: [
      {
        event_id: "evt-1",
        event_type: "deal.registered",
        timestamp: "2026-09-17T06:59:37",
        flow_id: "a5ce6afb-ecd7-4bea-8d68-f9a03a50fbe7",
        session_id: null,
      },
    ],
  },
  "/api/v1/inventory-sync/status": {
    enabled: false,
    last_sync: null,
    sync_count: 0,
    task_running: false,
  },
  "/api/v1/orders": {
    orders: [
      {
        order_id: "ORD-8ECAA495B7EF",
        status: "approved",
        deal_id: "deal-console-demo-1",
        created_at: "2026-09-17T05:12:15.838064Z",
      },
    ],
    count: 1,
  },
  "/api/v1/deals": {
    deals: [
      {
        deal: {
          deal_id: "deal-console-demo-1",
          deal_type: "PD",
          status: "booked",
          quote_id: "quote-demo-1",
          product: { product_id: "prod-1", name: "Premium Display - Homepage" },
          pricing: {
            final_cpm: { amount_micros: 12_500_000, currency: "USD" },
            pricing_model: "cpm",
          },
          terms: {
            impressions: 5_000_000,
            flight_start: "2026-12-01",
            flight_end: "2026-12-31",
            guaranteed: false,
          },
          buyer_tier: "seat",
          expires_at: "2026-12-31T23:59:59",
          created_at: "2026-09-17T06:00:00",
        },
      },
    ],
    count: 1,
    skipped: [],
  },
  "/approvals": { approvals: [] },
  "/sessions": { sessions: [] },
  "/registry/agents": { agents: [], total: 0 },
  "/products": { products: [], total_count: 0, limit: 50, offset: 0 },
  "/api/v1/rate-card": { entries: [], updated_at: null, source: "stored" },
  "/packages": { packages: [] },
  "/api/v1/supply-chain": {
    seller_id: "console-demo-001",
    seller_name: "Console Demo",
    seller_type: "PUBLISHER",
    domain: "console.demo",
    is_direct: true,
    supported_deal_types: ["preferred_deal"],
    contact_email: null,
    schain: [
      {
        asi: "console.demo",
        sid: "console-demo-001",
        name: "Console Demo",
        domain: "console.demo",
        seller_type: "PUBLISHER",
        is_direct: true,
        comment: null,
      },
    ],
    version: "1.0",
  },
  "/.well-known/agent.json": {
    name: "Ad Seller Agent",
    description: "Console demo agent",
    url: "http://localhost:8000",
    version: "2.4.2",
    provider: { name: "Console Demo", url: "http://localhost:8000", description: null },
    capabilities: { protocols: ["opendirect21"], streaming: false, push_notifications: false },
    skills: [{ id: "discovery", name: "Inventory Discovery", description: null, tags: [] }],
  },
  "/media-kit": { total_packages: 0, featured_count: 0, featured: [], all_packages: [] },
  "/media-kit/packages": { packages: [] },
  "/api/v1/change-requests": { change_requests: [], count: 0 },
  "/api/v1/curators": { curators: [], count: 0 },
  "/api/v1/orders/report": {
    total_orders: 1,
    status_counts: { approved: 1 },
    total_transitions: 3,
    avg_transitions_per_order: 3,
    actor_type_counts: { operator: 1, agent: 1, system: 1 },
    change_requests: { total: 0, by_status: {} },
  },
} as const;

/**
 * Answers the agent's API from fixtures. Anything the console asks for that is
 * not listed fails the test rather than silently 404ing — a screen quietly
 * losing a route would otherwise still look green.
 */
export async function mockAgent(
  context: BrowserContext,
  unhandled: string[],
): Promise<void> {
  // browserContext.route, not page.route. Once the worker calls clientsClaim()
  // it controls the page, and every API read is then dispatched *from the
  // service worker* — which page.route does not see. Routed at the page level
  // these tests fail with an opaque network error the moment the worker takes
  // over, which is both confusing and exactly backwards: the interesting tests
  // are the ones where a worker is in charge.
  await context.route(`${AGENT}/**`, async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    // `X-Api-Key` is not a CORS-safelisted header, so every authenticated read
    // is preceded by a preflight. Answering it is not optional — without this
    // the browser fails the real request with an opaque net::ERR_FAILED, which
    // the console then reports, correctly but unhelpfully, as "could not reach
    // that address". A preflight is the browser asking, not the console
    // writing, so it is not a read-only violation.
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "*",
          "access-control-max-age": "600",
        },
      });
      return;
    }

    if (request.method() !== "GET") {
      // The console can write now (ADR 11), but only with the write switch on
      // (ADR 12), and these tests never turn it on. An unsafe method reaching
      // here therefore means the switch leaked — which is worth failing a test
      // over, so it is recorded rather than answered.
      unhandled.push(`${request.method()} ${path}`);
      await route.fulfill({ status: 405, body: "read-only" });
      return;
    }

    const body: unknown =
      path in OK
        ? OK[path as keyof typeof OK]
        : /^\/api\/v1\/deals\/[^/]+\/performance$/.test(path)
          ? {
              deal_id: "deal-console-demo-1",
              impressions_available: 1_000_000,
              impressions_served: 0,
              fill_rate: 0,
              win_rate: 0,
              avg_cpm_actual: 0,
              delivery_pacing: "not_started",
              last_updated: "2026-09-17T05:02:57Z",
            }
          : /^\/api\/v1\/deals\/[^/]+\/lineage$/.test(path)
            ? {
                deal_id: "deal-console-demo-1",
                status: "confirmed",
                parents: [],
                replacements: [],
                chain_length: 1,
              }
            : /^\/api\/v1\/orders\/[^/]+\/history$/.test(path)
              ? {
                  order_id: "ORD-8ECAA495B7EF",
                  current_status: "approved",
                  transition_count: 1,
                  transitions: [
                    {
                      from_status: "draft",
                      to_status: "submitted",
                      timestamp: "2026-09-17T05:12:15.839341",
                      actor: "agent:buyer-demo",
                      reason: "buyer submitted the insertion order",
                      transition_id: "t1",
                    },
                  ],
                }
              : undefined;

    if (body === undefined) {
      unhandled.push(`GET ${path}`);
      await route.fulfill({ status: 404, body: "no fixture" });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(body),
    });
  });
}
