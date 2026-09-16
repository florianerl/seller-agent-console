import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

export const server = setupServer();

export const API = "https://agent.test";

/**
 * Read-only trap, layer 3 and the broadest of the three.
 *
 * Violations are recorded rather than thrown from the handler: MSW turns a
 * handler throw into an opaque network error, so the reason would be lost and
 * a test could even swallow it. Collecting them and failing in afterEach means
 * any non-GET issued by anything under test fails the run with a readable
 * message, whatever handlers that test installed.
 */
const violations: string[] = [];

export const readOnlyTrap = http.all("*", ({ request }) => {
  if (request.method !== "GET") {
    violations.push(`${request.method} ${request.url}`);
    return new HttpResponse(null, { status: 405 });
  }
  return HttpResponse.json({ unhandled: true });
});

/** For the trap's own test, which needs to observe a violation without failing. */
export function takeViolations(): string[] {
  return violations.splice(0, violations.length);
}

beforeAll(() => {
  // Nothing in the suite may reach the real network by accident.
  server.listen({ onUnhandledRequest: "error" });
  server.use(readOnlyTrap);
});

afterEach(() => {
  server.resetHandlers();
  server.use(readOnlyTrap);

  const found = takeViolations();
  if (found.length > 0) {
    throw new Error(
      `read-only violation: the app issued ${found.join(", ")}. ` +
        "Only GET requests are permitted; see src/api/http.ts.",
    );
  }
});

afterAll(() => server.close());
