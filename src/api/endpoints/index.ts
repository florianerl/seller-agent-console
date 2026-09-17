/**
 * The endpoint table, one module per domain, re-exported here so callers and
 * the discovery-based tests see a single surface.
 *
 * It was one file until it stopped fitting in a head. The split is by the
 * agent's own domains rather than by HTTP verb: a screen reads and writes the
 * same records, and keeping a deal's schema next to the call that changes it is
 * what makes "what does this write leave behind" answerable in one place.
 *
 * Conventions every module here follows:
 *
 * - Narrow schemas: only the fields the UI renders, `.loose()` throughout so
 *   upstream additions never fail a parse, `.catch()` on anything non-critical.
 *   Generated from openapi.json was not an option — 39 of its 44 GET responses
 *   carry an empty schema and its securitySchemes is null (ADR 7).
 * - Paths never end in a slash: FastAPI's redirect_slashes answers a mismatch
 *   with a 307, which the client refuses to follow. A guard asserts this across
 *   every module in this directory.
 * - Each module owns its own `PATHS`, unexported. Nothing outside reads them.
 */

export * from "./shared";
export * from "./core";
export * from "./events";
export * from "./auth";
export * from "./orders";
export * from "./deals";
export * from "./approvals";
export * from "./sessions";
export * from "./products";
export * from "./pricing";
export * from "./packages";
export * from "./registry";
export * from "./negotiation";
export * from "./media-kit";
export * from "./curators";
export * from "./quotes";
export * from "./change-requests";
export * from "./reporting";
export * from "./audience";
