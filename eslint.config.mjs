import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "dist/**",
    ".astro/**",
    ".superpowers/**",
    ".next/**",
    "out/**",
    "build/**",
    "app/**",
    "components/**",
    "content/**",
    "lib/**",
    "tests/*.ts",
    "tests/*.tsx",
    "next-env.d.ts",
    "next.config.ts",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
);
