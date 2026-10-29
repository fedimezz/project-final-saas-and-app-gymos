# Project Completion Prompt

Copy this prompt into a new coding-agent session after the provider credentials have been rotated and a dedicated local/staging test database is available. Do not include secrets in the prompt.

---

You are the senior engineer completing the production-readiness work for this repository: a Next.js App Router multi-tenant SaaS for sports clubs using TypeScript, Prisma/PostgreSQL, cookie JWTs, bearer tokens for the mobile client, Upstash, Resend, TextBee, Cloudinary, Konnect, Sentry, and Vitest.

## Current State

- Read `AGENTS.md`, `DEPLOYMENT.md`, `.env.example`, `AUDIT_REPORT.md`, and this prompt before editing.
- Initial audit and subsequent changes are recorded in `AUDIT_REPORT.md`.
- Latest verified code-only baseline: 34 Vitest files / 292 tests passed; typecheck passed; ESLint had 0 errors and 55 warnings; `npm audit --omit=dev` reported 0 vulnerabilities; Next.js is 16.3.8.
- Resend is integrated through `RESEND_API_KEY` and `RESEND_FROM`. Registration creates a random verification code, persists only its hash, sends the code through Resend, and `/api/auth/verify` has no fixed `123456` bypass.
- TextBee is integrated through `TEXTBEE_API_KEY`, optional `TEXTBEE_DEVICE_ID`, optional `TEXTBEE_BASE_URL`; verified API contract is `POST /api/v1/gateway/send-sms`, header `x-api-key`, JSON `{ recipients: [E164], message, deviceId? }`. TextBee acceptance means queued, not delivered; it requires a paired/online Android device.
- The shared provider credentials previously pasted in chat are compromised. Do not reuse, print, or commit them. The user must revoke and rotate them and configure replacements only through a local shell/secret manager or deployment secret store.
- The current repository `.env` pointed at a remote Supabase pooler during the previous session. Docker was absent and local PostgreSQL port 5433 was closed. Do not run any DB-writing command until `DATABASE_URL` and `DIRECT_URL` have been verified as disposable local/test endpoints.
- The mobile consumer repository `fedimezz/app_gymos` was not available in this workspace. Preserve every existing API response shape and route used by that client. Do not claim its contract is validated without its source/types or supplied fixtures.

## Non-Negotiable Safety Rules

1. Never print or ask the user to paste API keys, passwords, tokens, or database credentials. Never write secrets into source, docs, `.env`, shell history, or this prompt.
2. Before any database action, classify the database host without displaying credentials. If it is not an explicitly local/disposable test DB, stop all DB writes and ask the user for an isolated test DB.
3. No destructive DB command, migration reset, truncation, or remote write without explicit approval.
4. Do not commit, push, or create branches.
5. Preserve API method/path/status/JSON contracts used by `fedimezz/app_gymos`; where pagination is needed, preserve existing JSON roots and coordinate parameters with the mobile consumer before changing behavior.
6. Do not claim a command, request, delivery, security property, or performance target passed unless executed and observed. Label findings VERIFIED or READ-ONLY.
7. Use current Next.js 16 docs from `node_modules/next/dist/docs/` before framework-sensitive changes. Run focused validation immediately after each edit slice.

## Completion Work

### 1. Safe configuration and provider smoke tests

- Ask the user to rotate the exposed Resend and TextBee keys privately; do not request the new values in chat.
- Document the secret names and expected setup only: Resend needs an active key and a verified sender matching `RESEND_FROM`; TextBee needs an API key and an enabled online paired Android device; `TEXTBEE_DEVICE_ID` is optional if a default device is configured.
- Add or verify a provider health/smoke procedure that does not send a real message by default. A live message test requires explicit user consent, an allow-listed test recipient, and the newly rotated key already installed in the local secret store.
- Confirm no OTP, email body, password, API key, or phone number is logged on success or error paths.
- Confirm registration failure behavior if email provider fails after account creation; ensure user can safely resend and responses do not enumerate accounts.

### 2. Database-backed tests (isolated test DB only)

- Confirm a local disposable Postgres instance, generate Prisma client, apply migrations, and seed only that local/test DB.
- Add a real two-club integration suite with Club A and Club B users for MEMBER, COACH, ADMIN, OWNER and SUPER_ADMIN. Cover forged `clubId`, host/subdomain spoofing, cross-tenant cookies, bearer requests, stale/demoted JWTs, and IDOR for each mutating/reading route family.
- Test booking capacity under concurrent requests and cancellation at zero; test duplicate and replayed Konnect webhooks; verify membership card expiry is user-specific.
- Test Resend and TextBee through mocked provider tests in CI. Perform any live delivery check only against an approved test email/phone and report accepted vs delivered distinctly.

### 3. Mobile API contract

- Obtain access to the actual `fedimezz/app_gymos` repository or its checked-in API types/fixtures. If unavailable, leave the contract explicitly unverified.
- Compare all mobile-used routes: auth/login token body, clubs/search, settings/public, posts, bookings, dashboard, coach, notifications, membership and any additional typed endpoints.
- Verify bearer tokens pass through the proxy and still hit handler-level live account/tenant/role checks. Verify expired tokens return the expected 401 and tenant mismatch is rejected.
- Do not alter existing response roots, field names, nullability, status codes, or route paths without coordinated mobile changes and explicit approval.

### 4. Website and integration E2E

- Start the app only after local/test DB validation. Exercise public pages, onboarding, authentication, invitations, member/coach/admin/owner/platform workflows, theming/language, uploads, SSE, settings, and site preview.
- Verify login, logout, remember-me, reset-password, Google OAuth configuration, email resend, account enumeration, stale JWT after role changes, SMS rate limits and country allow-list.
- Verify Resend sender/domain and TextBee phone/device setup in staging; inspect provider status without leaking secrets or PII.
- Test Konnect sandbox initiation, webhook verification, replay/idempotency, amount units, success/failure redirects. Test cron secrets and Sentry event delivery.

### 5. Security closure

- Re-review all `/api` routes for auth, role, tenant scoping, input validation, pagination, and response leaks; publish a per-route matrix with tested vs read-only status.
- Re-test CSRF against the actual deployment ingress and prove which host headers are overwritten. Test no-Origin mobile requests and browser cross-origin writes.
- Review CSP nonce behavior, frame preview, cookie flags/domain, redirects, upload caps, raw SQL, output escaping, dependency audit, public health/error output, and logs.
- Ensure required production env validation includes shared Upstash, Resend key/sender and TextBee key when SMS verification is enabled. Do not require TextBee when SMS is disabled.
- Run a secret scan over tracked files and history without printing matched secret values; rotate any exposed credential.

### 6. Performance, accessibility, SEO

- Run a production build with a safe local/test DB and record route/build output, warnings, and bundle size.
- Run Lighthouse mobile and desktop for homepage, login, dashboard, admin members. Record LCP, CLS, TBT and test conditions; do not invent targets or measurements.
- Load-test three representative API endpoints with autocannon/k6, record p50/p95/error rates and concurrency.
- Check real query plans with `EXPLAIN (ANALYZE, BUFFERS)` on representative data before adding indexes. Prioritize schedule cleanup scans, activity logs, unbounded/capped histories and nested posts.
- Add client-compatible cursor pagination for currently hard-capped lists; preserve response roots and ensure stable ordering/no duplicate or skipped rows.
- Browser-test keyboard focus, dialog focus trap/restore, contrast, responsive layouts, language direction and screen readers where possible.
- Verify per-tenant metadata and sitemap on apex, subdomain and custom domain.

### 7. Final deliverables

- Update `AUDIT_REPORT.md` so the current status is authoritative and old baseline data is clearly historical.
- Include an executive go/no-go verdict; scores; tested feature matrix; current security findings; tenant/RBAC matrix; performance measurements (or explicit unavailable reasons); reliability/provider behavior; test/lint/build/audit results; remaining blockers; prioritized next actions; pre-launch checklist; exact safe local/production setup.
- Keep `RESEND_API_KEY`, `TEXTBEE_API_KEY`, device IDs, passwords, and DB URLs out of the report.
- Run `npm test`, `npm run typecheck`, `npm run lint`, `npm audit --omit=dev`, and `npm run build` where safe. Do not run build if it will reach a remote DB or cause non-disposable writes.
- Finish with a concise summary that clearly states what was actually tested, what remains untested, whether production launch is approved, and who owns each remaining blocker.

Start by checking worktree changes, reading this prompt and the current report, then verifying database target classification. Continue through safe work without touching secrets or a remote DB.
