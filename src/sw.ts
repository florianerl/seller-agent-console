/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkOnly } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope;

/**
 * The service worker source, written rather than generated: generateSW cannot
 * express a rule for an API origin that is only known at runtime.
 */

const manifest = self.__WB_MANIFEST;
precacheAndRoute(manifest);
cleanupOutdatedCaches();

/**
 * One navigation target. With a hash router the origin only ever serves
 * BASE_URL and BASE_URL + index.html, so every route resolves through the same
 * precached document online and offline — one code path, not two.
 */
// createHandlerBoundToURL serves the precached document by its revisioned
// cache key. Written by hand it would need a raw fetch fallback, and the
// fetch-seam guard rightly refuses any fetch outside src/api/http.ts.
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

/**
 * API responses are deliberately NOT cached here.
 *
 * A Workbox cache key is the URL, so two operators with different keys — or one
 * operator before and after a rotation — would share an entry for
 * GET /auth/api-keys, and the worker would serve one principal's authorised
 * response to another. Vary does not help: Workbox ignores it by default, and
 * Origin is the wrong axis anyway. Partitioning a cache per principal inside a
 * service worker is a bad place to get authorisation logic wrong.
 *
 * Last-known-good data lives in the page instead, where it is scoped to the
 * credential, wiped on sign-out, and carries the timestamp the UI shows.
 * NetworkOnly is registered explicitly so this is a recorded decision rather
 * than a default someone later mistakes for an oversight.
 */
registerRoute(
  ({ url, request }) => request.method === "GET" && url.origin !== self.location.origin,
  new NetworkOnly(),
);

/**
 * Take control of the page that registered us, so the first visit gets offline
 * support without a second load. This affects the FIRST install only and does
 * NOT jump the waiting queue on an update — skipWaiting is what does that, and
 * it is called only when the operator accepts the update prompt.
 */
self.addEventListener("install", () => {
  // Deliberately does not skip waiting. Swapping the worker under a running
  // page leaves it requesting chunk filenames the new build no longer has,
  // which 404s mid-task for exactly the people who were using the app.
});

self.addEventListener("activate", () => {
  void self.clients.claim();
});

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if ((event.data as { type?: string } | undefined)?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});
