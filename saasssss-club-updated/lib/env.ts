// lib/env.ts — fail fast on a missing/malformed required env var, once, at
// boot, instead of letting each route discover it lazily (a 500 the first
// time a customer hits checkout, three weeks after a bad deploy).
//
// Two tiers:
//   REQUIRED  — the app cannot run correctly without these. Missing one
//               throws at startup (instrumentation.ts) and fails the deploy
//               health check instead of silently degrading in production.
//   RECOMMENDED — integrations that can be omitted for local/test runs.
//               Production email is required; SMS is required when SMS
//               verification is enabled.

interface Check {
  name: string;
  required: boolean;
  validate?: (value: string) => string | null; // returns an error message, or null if OK
}

const PRODUCTION_REQUIRED = new Set([
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "RESEND_API_KEY",
  "RESEND_FROM",
]);

function isRequired(name: string, required: boolean): boolean {
  return required || (process.env.NODE_ENV === "production" && PRODUCTION_REQUIRED.has(name));
}

function missingChecks(): string[] {
  const missing = CHECKS.filter((check) => isRequired(check.name, check.required) && !process.env[check.name])
    .map((check) => check.name);
  if (process.env.NODE_ENV === "production" && process.env.SMS_VERIFICATION_ENABLED === "true" && !process.env.TEXTBEE_API_KEY) {
    missing.push("TEXTBEE_API_KEY (required when SMS_VERIFICATION_ENABLED=true)");
  }
  return missing;
}

function invalidChecks(): string[] {
  return CHECKS.flatMap((check) => {
    const value = process.env[check.name];
    const error = value ? check.validate?.(value) : null;
    return error ? [`${check.name} (${error})`] : [];
  });
}

function recommendedChecks(): string[] {
  return CHECKS.filter((check) => !isRequired(check.name, check.required) && !process.env[check.name])
    .map((check) => check.name);
}

const CHECKS: Check[] = [
  { name: "DATABASE_URL", required: true },
  {
    name: "JWT_SECRET", required: true,
    validate: (v) => (v.length < 32 ? "must be at least 32 characters" : null),
  },
  {
    name: "APP_URL", required: true,
    validate: (v) => {
      try {
        new URL(v);
        return null;
      } catch {
        return "must be a valid absolute URL (e.g. https://yourapp.com)";
      }
    },
  },
  { name: "COOKIE_DOMAIN", required: false },
  { name: "CRON_SECRET", required: false },
  { name: "RESEND_API_KEY", required: false },
  { name: "RESEND_FROM", required: false },
  { name: "TEXTBEE_API_KEY", required: false },
  { name: "TEXTBEE_DEVICE_ID", required: false },
  { name: "TEXTBEE_BASE_URL", required: false },
  { name: "CLOUDINARY_URL", required: false },
  { name: "STRIPE_SECRET_KEY", required: false },
  { name: "STRIPE_WEBHOOK_SECRET", required: false },
  { name: "GOOGLE_CLIENT_ID", required: false },
  { name: "UPSTASH_REDIS_REST_URL", required: false },
];

export function validateEnv(): void {
  const missing = missingChecks();
  const invalid = invalidChecks();
  const recommended = recommendedChecks();

  if (recommended.length > 0) {
    console.warn(
      `[env] Not configured, related features will run in a degraded/dev mode: ${recommended.join(", ")}`
    );
  }

  if (missing.length > 0 || invalid.length > 0) {
    const lines = [
      missing.length > 0 ? `Missing: ${missing.join(", ")}` : null,
      invalid.length > 0 ? `Invalid: ${invalid.join(", ")}` : null,
    ].filter(Boolean);
    throw new Error(`[env] Required environment variables are not set correctly.\n${lines.join("\n")}`);
  }
}
