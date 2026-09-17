import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { BASE_PATH } from "../../../config/base-path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

export type StaticServer = {
  readonly origin: string;
  /** The app's own URL, including the deploy prefix. */
  readonly appUrl: string;
  /** Swap the directory being served — this is how the update test ships v2. */
  setRoot(dir: string): void;
  close(): Promise<void>;
};

/**
 * Serves a built `dist/` under the real deploy prefix, never at the origin
 * root.
 *
 * Serving at `/` in tests is precisely how a base-path bug reaches production
 * unnoticed: every asset URL, the precache manifest, the manifest's start_url
 * and scope, and the service worker's own scope all resolve correctly at the
 * root and only break under a prefix. GitHub Pages project sites are always
 * under a prefix.
 *
 * No `Cache-Control` is sent: the tests exercise the service worker's caching,
 * and an HTTP cache on top of it would make failures ambiguous.
 */
export async function startServer(root: string): Promise<StaticServer> {
  let current = root;

  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (!url.pathname.startsWith(BASE_PATH)) {
        // Anything outside the prefix is genuinely not ours. Answering here
        // would hide exactly the bug this server exists to catch.
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("outside the deploy prefix");
        return;
      }

      const relative = url.pathname.slice(BASE_PATH.length) || "index.html";
      // Normalise before joining so a traversal cannot escape the root.
      const safe = normalize(relative).replace(/^(\.\.[/\\])+/, "");
      let file = join(current, safe);

      let info = await stat(file).catch(() => undefined);
      if (info?.isDirectory()) {
        file = join(current, safe, "index.html");
        info = await stat(file).catch(() => undefined);
      }

      if (!info?.isFile() || !file.startsWith(join(current) + sep)) {
        // A missing asset is a 404, not a fallback to index.html. With hash
        // routing the origin only ever asks for the prefix itself, so a
        // request for a hashed chunk that is not there is a real failure —
        // exactly the symptom of an unsafe service-worker update — and must
        // not be papered over with a 200.
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
        return;
      }

      res.writeHead(200, {
        "content-type": TYPES[extname(file)] ?? "application/octet-stream",
        "content-length": info.size,
      });
      createReadStream(file).pipe(res);
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("server did not bind to a port");
  }
  const origin = `http://localhost:${address.port}`;

  return {
    origin,
    appUrl: `${origin}${BASE_PATH}`,
    setRoot(dir: string) {
      current = dir;
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
