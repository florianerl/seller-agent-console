import base from "./playwright.config";
import { defineConfig } from "@playwright/test";

/** Runs only the asset-capture spec the main config deliberately ignores. */
export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: /capture-.*\.spec\.ts$/,
});
