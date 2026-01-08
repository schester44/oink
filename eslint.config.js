import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";
import tseslint from "typescript-eslint";
import unusedImports from "eslint-plugin-unused-imports";

export default defineConfig(
  {
    ignores: [
      "dist",
      "node_modules",
      ".output",
      "routeTree.gen.ts",
      "**/build/**",
      "**/.nitro/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/.turbo/**",
      "**/.output/**",
      "**/coverage/**",
    ],
  },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      prettier,
    ],
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      prettier: prettierPlugin,
      "unused-imports": unusedImports,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "prettier/prettier": "error",
      "padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "*", next: "return" },
        { blankLine: "always", prev: "const", next: "block-like" },
        { blankLine: "always", prev: "let", next: "block-like" },
        { blankLine: "always", prev: "block-like", next: "function" },
        { blankLine: "always", prev: "block-like", next: "if" },
        { blankLine: "always", prev: "block-like", next: "const" },
        { blankLine: "always", prev: "block-like", next: "let" },
        { blankLine: "always", prev: "block-like", next: "block-like" },
        {
          blankLine: "always",
          prev: "multiline-expression",
          next: "expression",
        },
        {
          blankLine: "always",
          prev: "multiline-expression",
          next: "multiline-expression",
        },
        {
          blankLine: "always",
          prev: "expression",
          next: "multiline-expression",
        },
      ],
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
  // React-specific config for gateway app
  {
    files: ["apps/gateway/**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      prettier: prettierPlugin,
      "unused-imports": unusedImports,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
);
