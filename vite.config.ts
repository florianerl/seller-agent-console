import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { BASE_PATH } from "./config/base-path";

export default defineConfig({
  base: BASE_PATH,
  plugins: [react()],
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
          setupFiles: ["./tests/setup/dom.ts"],
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
