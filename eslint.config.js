import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * Type-aware linting, because the rules worth having here — floating promises,
 * unnecessary conditionals, misused promises in event handlers — all need the
 * type checker. The cost is that lint needs a tsconfig; the benefit is that it
 * catches the class of bug tsc alone does not.
 */
export default tseslint.config(
  {
    ignores: [
      "dist",
      "dev-dist",
      "coverage",
      "playwright-report",
      "test-results",
      "node_modules",
      // Both are plain config files outside any tsconfig project, and
      // type-aware linting has nothing to say about them.
      "eslint.config.js",
      "lighthouserc.cjs",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  // `stylisticTypeChecked` is deliberately not enabled. Its rules are taste,
  // not correctness, and several of them (interface-over-type, T[] over
  // Array<T>) disagree with conventions this codebase already applies
  // consistently. A linter that fights the house style just teaches people to
  // stop reading its output.

  {
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // An unawaited promise in a component is how a "fixed" bug comes back.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",

      // `_`-prefixed bindings are the destructuring idiom for dropping a field
      // (see sameResult, which strips fetchedAt), so they are not unused code.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },

  // A provider and the hook that reads it belong in one file; splitting them
  // to satisfy Fast Refresh would trade a clearer module for a slightly
  // cheaper dev reload.
  {
    files: ["src/credentials/context.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },

  // The service worker runs in a worker scope with its own globals, and
  // `self.__WB_MANIFEST` is injected by the build rather than declared.
  {
    files: ["src/sw.ts"],
    languageOptions: { globals: globals.serviceworker },
  },

  // Tests reach into internals and assert on them; the strictness that pays
  // off in src/ mostly produces noise here.
  {
    files: ["tests/**", "*.config.ts", "config/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      // Tests spy on and assert against methods detached from their receiver;
      // that is what a spy is.
      "@typescript-eslint/unbound-method": "off",
    },
  },
);
