import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // react-hooks/set-state-in-effect (part of the React Compiler-oriented
      // preset shipped with eslint-config-next 16) flags EVERY setState call
      // inside a useEffect body, including two patterns this codebase uses
      // deliberately and correctly:
      //   1. Reading localStorage/theme/auth state on mount and applying it
      //      via setState AFTER the initial render, specifically to avoid
      //      SSR/client hydration mismatches (see ThemeContext.tsx and
      //      AuthContext.tsx for the reasoning). Computing this during the
      //      initial render instead — which the rule would prefer — is what
      //      would actually cause a hydration bug here, not avoid one.
      //   2. Fetching data on mount in dashboard/admin pages (the standard,
      //      widely-used Next.js client-fetch pattern).
      // We don't disable this file-by-file because it's the correct rule to
      // have on for genuinely new code (e.g. it caught a real bug: a
      // component-per-render anti-pattern in AdminSidebar, fixed separately).
      // Downgrading to "warn" keeps it visible without blocking builds on
      // patterns that are actually correct here.
      // TODO: if/when this app migrates page-level data fetching to
      // @tanstack/react-query (already a dependency) or React Server
      // Components, revisit and re-enable as "error".
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
