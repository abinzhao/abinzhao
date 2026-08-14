import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "dist/**",
    ".astro/**",
    ".superpowers/**",
    "out/**",
    "build/**",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        AbortController: "readonly",
        URL: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        setTimeout: "readonly",
      },
    },
  },
);
