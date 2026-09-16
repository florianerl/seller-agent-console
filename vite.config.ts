import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { BASE_PATH } from "./config/base-path";

export default defineConfig({
  base: BASE_PATH,
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}", "tests/unit/**/*.test.{ts,tsx}"],
          setupFiles: [],
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
