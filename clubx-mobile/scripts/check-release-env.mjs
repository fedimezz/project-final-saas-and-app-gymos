// Stops an EAS build EARLY (before ~10 minutes of compiling) when the production API URL is missing,
// still the committed placeholder, not HTTPS, or points at the developer's machine. A build with a
// wrong URL installs fine and then fails every request, which is exactly the "server connection
// error" symptom, so we refuse to produce it. Runs automatically as the `eas-build-pre-install` hook.
//   Run by hand:  EXPO_PUBLIC_PLATFORM_API_BASE_URL=https://example.com node scripts/check-release-env.mjs
const raw = (process.env.EXPO_PUBLIC_PLATFORM_API_BASE_URL ?? "").trim();
const problems = [];

if (!raw) problems.push("EXPO_PUBLIC_PLATFORM_API_BASE_URL is not set.");
else {
  let url = null;
  try {
    url = new URL(raw);
  } catch {
    problems.push(`"${raw}" is not a valid URL.`);
  }
  if (url) {
    if (url.protocol !== "https:") problems.push(`"${raw}" must be https:// (tokens and passwords travel over it).`);
    if (/replace-with|your-apex|example\.(com|org|net)$/i.test(url.hostname)) problems.push(`"${url.hostname}" is a placeholder, not your real domain.`);
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname) || url.hostname.endsWith(".local")) {
      problems.push(`"${url.hostname}" is a local address; a phone cannot reach it in production.`);
    }
    if (url.pathname !== "/" && url.pathname !== "") problems.push("Use the bare domain (no path), e.g. https://yourdomain.com");
  }
}

if (problems.length > 0) {
  console.error("\nRelease build refused:\n  - " + problems.join("\n  - "));
  console.error("\nSet the real value in eas.json (build profile env) or with `eas env:create`, then build again.\n");
  process.exit(1);
}
console.log(`Release env OK: API = ${raw}`);
