import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

export const server = setupServer();

export const API = "https://agent.test";

/**
 * The catch-all every test falls through to.
 *
 * It used to fail the run on any non-GET, which is how read-only was enforced
 * at the test layer. Writes are permitted now (ADR 11), so it answers them the
 * same way it answers a read: a test that issues one and cares about the
 * result installs a handler for it.
 */
export const fallthrough = http.all("*", () => HttpResponse.json({ unhandled: true }));

/**
 * Opt-in version of the trap the read-only design used to run globally. It is
 * no longer a policy — a write in a test is ordinary now — but a test that
 * asserts *nothing* was sent still needs something watching the wire, and
 * asserting on a recorded list beats asserting on the absence of a mock call.
 */
export function recordRequests(): { readonly seen: string[] } {
  const seen: string[] = [];
  server.use(
    http.all("*", ({ request }) => {
      seen.push(`${request.method} ${request.url}`);
      return HttpResponse.json({});
    }),
  );
  return { seen };
}

beforeAll(() => {
  // Nothing in the suite may reach the real network by accident.
  server.listen({ onUnhandledRequest: "error" });
  server.use(fallthrough);
});

afterEach(() => {
  server.resetHandlers();
  server.use(fallthrough);
});

afterAll(() => server.close());
