import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["electron/**", "scripts/**"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-mod/**",
    ".next-phone/**",
    ".next-dock-stash/**",
    "out/**",
    "build/**",
    "out/**",
    "next-env.d.ts",
    "spikes/**",
    "phone/**",
  ]),
]);

export default eslintConfig;
