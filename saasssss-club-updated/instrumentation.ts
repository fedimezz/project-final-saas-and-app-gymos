// Runs once when the server starts (Node runtime only — the Edge runtime,
// used by proxy.ts, doesn't support this hook and doesn't need it: it reads
// only JWT_SECRET/COOKIE_DOMAIN, which are covered by this same check
// running in the Node process).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
  }
}
