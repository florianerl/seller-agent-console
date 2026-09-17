const { readFileSync } = require("node:fs");

/**
 * The deploy prefix is read back out of the build rather than restated here.
 * config/base-path.ts is the single definition, but this file is CommonJS and
 * cannot import TypeScript — and a hand-copied constant is exactly the drift
 * §3 of the design exists to prevent. The built manifest's `scope` is derived
 * from that constant, so reading it keeps one source of truth and, better,
 * asserts against the prefix the artifact actually shipped with.
 */
function basePath() {
  const manifest = JSON.parse(readFileSync("dist/manifest.webmanifest", "utf8"));
  if (typeof manifest.scope !== "string" || !manifest.scope.startsWith("/")) {
    throw new Error("dist/manifest.webmanifest has no usable scope — build first");
  }
  return manifest.scope;
}

/**
 * Budgets are asserted against a locally previewed build, not the live site, so
 * a pull request is gated before anything deploys.
 *
 * On PWA audits: Lighthouse 12 removed them entirely — not merely the `pwa`
 * category, but `installable-manifest`, `service-worker`, `maskable-icon`,
 * `apple-touch-icon`, `splash-screen` and `themed-omnibox` as audit ids. There
 * is nothing left here to assert installability with, and asserting an audit id
 * that no longer exists is silently vacuous, which is worse than not asserting
 * it at all. Those properties are covered instead by manifest.guard — which
 * decodes the PNGs and compares real pixel dimensions against the declared
 * sizes — and by the installability end-to-end test.
 *
 * SEO is deliberately not asserted. This is an authenticated internal console;
 * a score for it would be something to game rather than something to meet.
 */
module.exports = {
  ci: {
    collect: {
      startServerCommand: "npx vite preview --port 4173 --strictPort",
      // Without this lhci gives up waiting and collects anyway, which turns a
      // server that failed to start into a run that silently measures nothing.
      startServerReadyPattern: "Local:",
      url: [`http://localhost:4173${basePath()}`],
      numberOfRuns: 3,
      settings: { preset: "desktop" },
    },
    assert: {
      /**
       * Concrete audits and metric budgets, not `categories:*`.
       *
       * Category assertions silently match nothing against Lighthouse 12
       * reports in this LHCI: `categories:performance` set to an impossible
       * 0.999 produced zero assertion results and exit 0, while an audit-level
       * assertion on the same run failed correctly. A budget that cannot fail
       * is worse than no budget, because it is mistaken for protection. Every
       * assertion below was checked by making it fail on purpose.
       *
       * Accessibility is not asserted here at all. The end-to-end suite runs
       * axe over all four routes in both drawer states, which is both stricter
       * and more specific than a rolled-up score on the setup screen alone.
       */
      assertions: {
        // Budgets sit well above today's numbers (FCP ~470ms, LCP ~540ms, TBT
        // 0, CLS 0) so ordinary variance does not fail a pull request, but a
        // real regression — an unsplit vendor chunk, a blocking font — does.
        "first-contentful-paint": ["error", { maxNumericValue: 2000 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "total-blocking-time": ["error", { maxNumericValue: 200 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],

        // Correctness rather than speed, and all currently clean.
        "errors-in-console": ["error", { minScore: 1 }],
        "valid-source-maps": ["error", { minScore: 1 }],
        "inspector-issues": ["error", { minScore: 1 }],
        deprecations: ["error", { minScore: 1 }],
        doctype: ["error", { minScore: 1 }],
        charset: ["error", { minScore: 1 }],
        viewport: ["error", { minScore: 1 }],
      },
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci" },
  },
};
