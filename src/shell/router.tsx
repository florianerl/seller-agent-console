import { lazy } from "react";
import { HashRouter, Route, Routes } from "react-router";
import { Shell } from "./Shell";

/**
 * Hash routing, deliberately. GitHub Pages has no rewrite rules, so a history
 * router needs the 404.html copy trick — which is served as an actual HTTP 404
 * and gives deep links two resolution paths (404.html online, the precached
 * index.html offline). With a hash the origin only ever sees one URL, online
 * and offline alike, and no basename has to be kept in sync.
 *
 * Declarative mode rather than createHashRouter: the data router costs 30.8 kB
 * gz against 13.7 kB for this, and we use none of it — no loaders, no actions,
 * no route-level error elements. SWR owns data fetching.
 */

// Lazy so screen code stays out of the initial chunk.
const Setup = lazy(() => import("../screens/Setup"));
const Events = lazy(() => import("../screens/Events"));
const Orders = lazy(() => import("../screens/Orders"));
const Deals = lazy(() => import("../screens/Deals"));
const Inbox = lazy(() => import("../screens/Inbox"));
const Negotiation = lazy(() => import("../screens/Negotiation"));
const Catalog = lazy(() => import("../screens/Catalog"));
const Agents = lazy(() => import("../screens/Agents"));
const MediaKit = lazy(() => import("../screens/MediaKit"));
const ChangeRequests = lazy(() => import("../screens/ChangeRequests"));
const Curators = lazy(() => import("../screens/Curators"));
const Reporting = lazy(() => import("../screens/Reporting"));
const NotFound = lazy(() => import("./NotFound"));

export function Router() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Shell />}>
          <Route index element={<Setup />} />
          <Route path="events" element={<Events />} />
          <Route path="orders" element={<Orders />} />
          <Route path="deals" element={<Deals />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="negotiation" element={<Negotiation />} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="media-kit" element={<MediaKit />} />
          <Route path="change-requests" element={<ChangeRequests />} />
          <Route path="curators" element={<Curators />} />
          <Route path="reporting" element={<Reporting />} />
          <Route path="agents" element={<Agents />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
