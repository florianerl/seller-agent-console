/**
 * THE single source of truth for the deploy subpath.
 *
 * Build-time only. Imported by vite.config.ts, the manifest generator and the
 * guard tests — never by application code. Runtime code reads the same value
 * back from `import.meta.env.BASE_URL`, which Vite sets from `base`, so there
 * is exactly one place a path prefix is written.
 *
 * In CI this comes from `actions/configure-pages`'s `base_path` output rather
 * than the default below, so renaming the repository cannot silently rot it.
 */

/** Always a leading slash, always a trailing slash, never a doubled slash. */
export function normalise(raw: string): string {
  const collapsed = raw.trim().replace(/\/+/g, "/");
  if (collapsed === "" || collapsed === "/") return "/";
  const withLeading = collapsed.startsWith("/") ? collapsed : `/${collapsed}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

export const DEFAULT_BASE_PATH = "/seller-agent-console/";

export const BASE_PATH = normalise(process.env.BASE_PATH ?? DEFAULT_BASE_PATH);
