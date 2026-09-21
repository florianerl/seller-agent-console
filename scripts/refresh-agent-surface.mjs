/**
 * Captures the agent's API surface into tests/fixtures/agent-surface.json.
 *
 *   node scripts/refresh-agent-surface.mjs [http://127.0.0.1:8000]
 *
 * Only the surface is kept — paths, methods and declared parameter names —
 * not the whole 300 kB spec. Two reasons. The guard needs nothing else, and a
 * reduced file produces a diff a reviewer can actually read: when the agent
 * gains or loses a route, that shows up in a pull request as a line, not as a
 * regenerated blob nobody inspects.
 */
import { writeFileSync } from "node:fs";

const base = (process.argv[2] ?? "http://127.0.0.1:8000").replace(/\/+$/, "");

const response = await fetch(`${base}/openapi.json`);
if (!response.ok) {
  console.error(`the agent at ${base} answered ${response.status}`);
  process.exit(1);
}
const spec = await response.json();

const paths = {};
for (const [path, operations] of Object.entries(spec.paths ?? {})) {
  const methods = {};
  for (const [method, operation] of Object.entries(operations)) {
    if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
    methods[method.toUpperCase()] = (operation.parameters ?? [])
      .filter((parameter) => parameter.in === "query")
      .map((parameter) => parameter.name)
      .sort();
  }
  if (Object.keys(methods).length > 0) paths[path] = methods;
}

const surface = {
  capturedFrom: base,
  capturedAt: new Date().toISOString(),
  // The agent reports a hardcoded literal that has already drifted from its
  // own package version, so this records what it claimed, not what it is.
  reportedAgentVersion: spec.info?.version ?? null,
  pathCount: Object.keys(paths).length,
  paths: Object.fromEntries(Object.entries(paths).sort(([a], [b]) => a.localeCompare(b))),
};

writeFileSync("tests/fixtures/agent-surface.json", `${JSON.stringify(surface, null, 2)}\n`);
console.log(`captured ${surface.pathCount} paths from ${base}`);
