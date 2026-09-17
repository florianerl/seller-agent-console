# Running the console as a container next to the agent

The console is static files, so the container is a build stage and a web
server. There is no application process, no state, and nothing to keep alive.

## Why bother, when GitHub Pages already works

Three things a container gives you that Pages cannot:

1. **Real response headers.** `frame-ancestors` and reporting directives are
   silently ignored in a `<meta>` CSP. From nginx they work.
2. **Control over `Cache-Control`.** Pages pins everything to `max-age=600`,
   which is a ten-minute floor on update propagation that cannot be lowered.
   Here `index.html` and `sw.js` are never cached, so a deploy reaches an open
   tab as soon as it checks.
3. **No public hosting.** The console never leaves the operator's network.

## Adding it to the agent's stack

The agent repo already has `infra/docker/docker-compose.yml`. Add one service:

```yaml
  console:
    build:
      # No vendoring: Docker builds straight from the console repository.
      # Pin the ref for anything but local development.
      context: https://github.com/florianerl/seller-agent-console.git#main
      args:
        # Served at the origin root here, not under a repository prefix.
        BASE_PATH: /
    ports:
      - "8080:8080"
    depends_on:
      - app
    restart: unless-stopped
```

Then `docker compose up console`, open `http://localhost:8080`, and connect it
to `http://localhost:8000`.

## Three things that will bite

**The API address is resolved by the browser, not by the container.** Compose
service names like `http://app:8000` mean nothing to the operator's browser.
The address to paste is whatever the *browser* can reach — `http://localhost:8000`
for a local stack, or the agent's public HTTPS address otherwise. Putting the
console and the agent on one network buys nothing here; the console makes no
server-side calls at all.

**Plain HTTP beyond localhost loses the whole PWA.** Service workers require a
secure context. On `http://localhost` that is satisfied, so everything works.
Serve the console from `http://10.0.0.5:8080` on a LAN and the worker never
registers: no offline, no install, no update prompt — and the console still
loads, so the loss is silent. Terminate TLS in front of it, or keep it on
localhost. The same rule is why the app refuses a plain-HTTP API address from
an HTTPS page.

**Changing `BASE_PATH` creates a different app.** The manifest `id` is derived
from it, and `id` is what a browser uses to decide whether an installed app is
*this* app. A copy installed from the Pages deploy (`id: /seller-agent-console/`)
and one installed from the container (`id: /`) are two separate installs that do
not update each other. That is correct behaviour — they are different
deployments — but it means anyone who installed from Pages must reinstall from
the container, and the old one will sit there looking fine while never updating
again. Decide which deployment is canonical before anyone installs.

## What CI checks

The `container` job builds for the origin root, runs the end-to-end suite
against it, builds the image, and smoke-tests the running container: the page
is served, the manifest carries `application/manifest+json` (nginx's bundled
mime.types has no entry for `.webmanifest`, and a manifest served as the wrong
type is ignored, which makes the app silently uninstallable), `index.html` and
`sw.js` are uncached, hashed assets are immutable, the CSP header is present,
and a missing chunk is a 404 rather than a 200 of `index.html`.
