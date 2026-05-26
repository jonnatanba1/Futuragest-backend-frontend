// @ts-check
const tseslint = require("typescript-eslint");
const noRawPrismaScopedQuery = require("./rules/no-raw-prisma-scoped-query");

/** @type {import("eslint").Linter.Config[]} */
const config = [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/*.js"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },
  // ── RBAC scope-filter guardrail ────────────────────────────────────────────
  // Bans raw prisma.<scopedModel>.findMany/findFirst outside ScopedRepository.
  // This prevents developers from accidentally bypassing the row-level scope filter.
  {
    plugins: {
      futuragest: {
        rules: {
          "no-raw-prisma-scoped-query": noRawPrismaScopedQuery,
        },
      },
    },
    rules: {
      "futuragest/no-raw-prisma-scoped-query": "error",
    },
  },
];

module.exports = config;
