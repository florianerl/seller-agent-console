# 1. Ship as a standalone PWA rather than inside the agent

**Status:** Accepted

## Context

The console was originally specified (PR #6 on the seller-agent fork) as Jinja2
templates and HTMX partials mounted inside the Python FastAPI app. That design
is sound and deliberately has no build step.

It also ties the console's release cycle to the agent's. Shipping a copy
change means deploying the API. There is no path to installability, and no way
to push a fix to operators without a server deployment.

## Decision

A separate repository, built with Vite, deployed to GitHub Pages, talking to
the agent's API across origins.

## Consequences

- The console updates without touching the API deployment, and on its own
  cadence.
- It is installable, and works offline for what it has already seen.
- **Cost:** a build step and a front-end toolchain where there was none.
- **Cost:** cross-origin, so it depends on the agent's CORS configuration.
  That configuration is `allow_origins=["*"]` today, which makes this possible
  — and is not something this repository controls. If it tightens, the console
  breaks and the fix is upstream.
- **Cost:** two repositories to keep in step. The API shapes here are
  hand-written, and drift is a real risk — see ADR 7.

PR #6 remains the design record and is not withdrawn.
