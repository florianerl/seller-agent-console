import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { BASE_PATH } from "./config/base-path";

// Overridable so the update end-to-end test can build two distinguishable
// versions on demand; a normal build just stamps the time.
const BUILD_ID = process.env.BUILD_ID ?? new Date().toISOString();

export default defineConfig({
  define: {
    // Surfaced in the DOM so an operator reporting a problem can say which
    // build they are on. Pages caps update propagation at ten minutes, so
    // "did you reload?" is a question support will actually need to ask.
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  base: BASE_PATH,
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // Prompt, never auto: an unattended update swaps the worker under a
      // running page and 404s the chunks it is still importing.
      registerType: "prompt",
      injectRegister: null,
      // Note on caching: the registration uses the browser default
      // updateViaCache: "imports", which already bypasses the HTTP cache for
      // sw.js itself and only allows it for importScripts — of which this
      // worker has none, being an ES module. So "none" would change nothing
      // here. Pages pins everything to max-age=600 regardless, which is a
      // floor on update propagation that cannot be lowered.
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
      },
      manifest: {
        id: BASE_PATH,
        name: "Seller Agent Operator Console",
        // <= 12 characters or Android truncates it on the home screen.
        short_name: "Seller Ops",
        description: "Read-only operator console for the IAB Tech Lab seller agent.",
        start_url: BASE_PATH,
        scope: BASE_PATH,
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        // Must match the CSS background or the app flashes on launch.
        background_color: "#F7F6F6",
        // Must match <meta name="theme-color">.
        theme_color: "#221F1F",
        orientation: "any",
        lang: "en",
        dir: "ltr",
        categories: ["business", "productivity"],
        // Not an installability requirement, but what upgrades Chrome's
        // desktop install dialog from the bare one to the rich one with a
        // preview. The images come from the end-to-end fixtures, never from a
        // real deployment: an install dialog is shown to whoever installs it,
        // so it must not carry someone's actual deals.
        screenshots: [
          {
            src: "screenshots/wide-setup.png",
            sizes: "1280x800",
            type: "image/png",
            form_factor: "wide",
            label: "Agent health at a glance",
          },
          {
            src: "screenshots/wide-deals.png",
            sizes: "1280x800",
            type: "image/png",
            form_factor: "wide",
            label: "Booked and proposed deals",
          },
          {
            src: "screenshots/narrow-setup.png",
            sizes: "720x1280",
            type: "image/png",
            form_factor: "narrow",
            label: "Agent health on a phone",
          },
        ],
        // Lets the page ask the browser whether this very app is already
        // installed, via navigator.getInstalledRelatedApps().
        related_applications: [
          { platform: "webapp", url: `${BASE_PATH}manifest.webmanifest` },
        ],
        prefer_related_applications: false,
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          // Separate files, never `purpose: "any maskable"` on one: an
          // adaptive mask crops up to 10% per edge, so a maskable icon is
          // full-bleed with the mark inset, which looks wrong used as `any`.
          {
            src: "icons/icon-maskable-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        // Keep MUI + Emotion in their own chunk so the budget guard measures
        // application growth rather than framework noise, and so screens added
        // later do not silently re-bundle the library.
        manualChunks(id) {
          // Match on the package boundary, not a substring: "react" also
          // appears in react-transition-group and hoist-non-react-statics,
          // which are MUI dependencies and belong with MUI. Getting this
          // wrong produces a circular chunk.
          const match = /node_modules\/(?:(@[^/]+)\/)?([^/]+)/.exec(id);
          if (!match) return undefined;
          const pkg = match[1] ? `${match[1]}/${match[2]}` : match[2];

          if (pkg === "react" || pkg === "react-dom" || pkg === "scheduler") {
            return "vendor-react";
          }
          if (pkg === "react-router") {
            return "vendor-router";
          }
          if (pkg?.startsWith("@mui") || pkg?.startsWith("@emotion")) {
            return "vendor-mui";
          }
          return undefined;
        },
      },
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}", "tests/unit/**/*.test.{ts,tsx}"],
          setupFiles: ["./tests/setup/dom.ts", "./tests/setup/msw.ts"],
        },
      },
      {
        // Guards inspect dist/, so they run AFTER `vite build`, never with it.
        extends: true,
        test: {
          name: "guards",
          environment: "node",
          include: ["tests/guards/**/*.test.ts"],
        },
      },
    ],
  },
});
