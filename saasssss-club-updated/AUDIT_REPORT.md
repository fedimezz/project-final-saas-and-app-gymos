# Repository Audit Report

**Audit date:** 2026-10-04; remediation update: 2026-10-05  
**Scope:** Initial static audit plus subsequent approved code fixes and database-independent validation.  
**Evidence labels:** **VERIFIED** means a command or request was executed and its output was observed. **READ-ONLY** means inferred from source/configuration and not exercised against a running application.

**Update:** Baseline diagnostics and findings below retain the initial audit snapshot. See [Remediation Status](#remediation-status) for the current status and post-change command results.

## Executive Summary

**Current verdict: Not yet production-ready.** The critical fixed-code verification flaw and email delivery outage from the initial snapshot are now fixed in code: registration creates a random code, stores only its hash, sends through Resend, and verification checks the hash only. Resend/TextBee have tests against mocked HTTP; credentials were not used live. The dependency audit is clean and all unit tests pass. Remaining launch blockers are live DB/tenant/RBAC verification, mobile client contract verification, a real Resend sender/key and TextBee device smoke test, and real browser/build/load testing. Provider credentials pasted into chat must be rotated before use.

The requested live DB checks remain blocked: `.env` targets a remote Supabase pooler, Docker is unavailable, and `localhost:5433` is not listening. No migrations, seeds, SUPER_ADMIN login, DB-backed tests, or live tenant/RBAC requests were run. The mobile app repository is not available in this workspace. Findings below distinguish observed command output from code review; mocked provider tests do not establish live deliverability.

### Current Status At A Glance

| Item | Current result | Evidence |
|---|---|---|
| Test suite | PASS: 34 files, 292 tests | VERIFIED: `npm test` output, 2026-10-05. |
| TypeScript | PASS | VERIFIED: `npm run typecheck`, no diagnostics. |
| Lint | PASS with warnings: 0 errors, 55 warnings | VERIFIED: `npm run lint`; warnings are mostly `react-hooks/set-state-in-effect`, plus unused `WebsiteSetupFlags`. |
| Production dependency audit | PASS: 0 vulnerabilities | VERIFIED: `npm audit --omit=dev`. Installed Next.js is `16.3.8`. |
| Verification OTP | Fixed bypass removed; random hash-verified code path implemented | VERIFIED by focused route test; live Resend email not sent. |
| Email/SMS integration | Resend and TextBee request contracts implemented | VERIFIED with mocked fetch and provider documentation; live keys/devices not tested. |
| Tenant/RBAC isolation | Not live-verified | Existing mocked coverage passes, but no local DB; cross-club requests still required. |
| Performance metrics | Not measured | No build/server/browser/Lighthouse/load test was run. |
| Production readiness | NO | Staging DB/provider/browser/mobile validation and credential rotation remain. |

## Current Security And Performance Notes

### Security

- **Improved and unit-tested:** fixed verification-code bypass is removed; register stores a hash of a random code, verification checks that hash only, and provider messages/codes are not logged. Resend is required by production env validation.
- **Improved and unit-tested:** protected API proxy accepts bearer JWTs while page requests remain cookie-based; handler-level DB role/tenant checks remain the authorization boundary.
- **Improved and unit-tested:** CSRF no longer treats `x-forwarded-host` as an independent trusted host; session deletion checks `planning.manage`; invalid/failed production rate limiting and one-time tokens fail closed without shared Redis.
- **Improved in code, browser-unverified:** per-request nonce CSP replaces blanket script `'unsafe-inline'`; upload size is measured against streamed bytes before multipart parsing; dialog focus management and tenant metadata/sitemap were added.
- **Credential incident:** the Resend and TextBee key strings were pasted into chat. They were not written to repository files and were not used for network calls. Treat them as exposed anyway: revoke them and create replacements before configuring secrets.
- **Still unverified:** no real requests tested cross-tenant cookies/hosts, every route/role, request smuggling/forwarded-header behavior at the real ingress, content XSS/SSRF, production cookie scope, OAuth/payment webhook behavior, or delivered email/SMS. The TextBee API key has broad account access; keep it server-side only.

### Performance

- **Measured numbers:** none. LCP, CLS, TBT, bundle size, p50/p95, DB query timings and throughput remain unknown because the app was not built or started and no test DB/browser/load generator was used.
- **Code-level mitigation:** list queries now have hard caps and activity-log page depth is limited. This bounds work but does not give clients a way to retrieve records beyond those caps; cursor pagination is the next step and must preserve mobile response contracts.
- **Residual risk:** `/api/admin/schedule` cleanup still scans non-archived sessions before returning capped weekly plans. Activity logs still use offset pagination (bounded to page 1000); no composite index was added without representative query plans. Uploads are bounded but large staff video payloads can still consume significant transient memory while parsing.
- **Required next measurements:** build analyzer output; Lighthouse on home/login/dashboard/admin members at mobile+desktop; DB `EXPLAIN (ANALYZE, BUFFERS)` for high-volume paths on a representative local/staging DB; autocannon/k6 p50/p95/error rate for login/search/dashboard endpoints.

## Scores

| Area | Score / 10 | Justification |
|---|---:|---|
| Functionality | 6 | Major app routes exist and API unit suite passes, but full web, payment, and role workflows were not run. |
| Security | 6 | Fixed OTP bypass removed; JWT, tenant, CSRF and role guards have focused coverage, but live multi-tenant isolation and credential rotation remain outstanding. |
| Performance | 5 | Several high-volume query caps and bounded log paging were added; no latency, bundle, or load metrics exist. |
| Reliability | 6 | Unit suite passes and production Redis config fails closed; actual DB/provider/SSE failover remains untested. |
| Code quality | 6 | Typecheck clean, lint has 0 errors and 55 warnings; some old docs/history remain descriptive of baseline. |
| Accessibility | 5 | Dialog focus management implemented; browser, keyboard, contrast and screen-reader verification was not run. |
| SEO | 6 | Request-host tenant metadata and sitemap implemented; output not verified in a running Next deployment. |
| Test coverage | 6 | 292 tests pass, including provider and OTP regressions; no DB integration or E2E coverage was run. |
| Production readiness | 4 | No-go pending remote-safe staging verification, key rotation, verified Resend sender, TextBee device, build, mobile contract, and performance/accessibility checks. |

## Feature Status

Statuses describe implementation presence plus audit verification, not a claim that the feature works. **PARTIAL** means code is present but not exercised end to end; **BROKEN** is used for a statically identified contract/security defect.

| Area | Guest | MEMBER | COACH | ADMIN | OWNER | SUPER_ADMIN | Evidence |
|---|---|---|---|---|---|---|---|
| Public homepage, news, offers/plans, gallery, contact | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | Pages/routes appear present; no HTTP or browser run. |
| Club onboarding and branding/theme | PARTIAL | NOT APPLICABLE | NOT APPLICABLE | PARTIAL | PARTIAL | NOT APPLICABLE | Routes/pages are present; DB transaction and preview iframe not exercised. |
| Login/session/logout/password/Google/invitations | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | Fixed verification bypass removed and OTP tests pass; provider delivery and end-to-end auth not live-tested. |
| Member dashboard, schedule, booking/cancel/history | NOT APPLICABLE | PARTIAL | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | Booking code uses a transactional conditional capacity update; no DB race test run. |
| Membership card, subscription, payment | NOT APPLICABLE | PARTIAL | NOT APPLICABLE | PARTIAL | PARTIAL | NOT APPLICABLE | Source exists; no Konnect sandbox/live request or member expiry assertion. |
| Notifications and SSE | NOT APPLICABLE | PARTIAL | PARTIAL | PARTIAL | PARTIAL | NOT APPLICABLE | Routes exist; cross-instance SSE and realtime behavior not exercised. |
| Profile, avatar upload, preferences, language/theme | NOT APPLICABLE | PARTIAL | NOT APPLICABLE | PARTIAL | PARTIAL | NOT APPLICABLE | Source exists; Cloudinary and UI/browser checks not run. |
| Coach sessions, roster, attendance, stats | NOT APPLICABLE | NOT APPLICABLE | PARTIAL | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | Coach guards/routes exist; no role-based runtime requests. |
| Admin/Owner members, staff, schedule, billing, content, reports, roles | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | PARTIAL | PARTIAL | NOT APPLICABLE | Routes exist and mocked suite passes; no end-to-end role workflow or DB mutation was tested. |
| Platform clubs, plans, logs, system | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | PARTIAL | Platform pages/routes exist; DB seed/login/dashboard were not run. |
| Mobile API contract | NOT APPLICABLE | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | Proxy bearer support has unit tests; the consuming app repo/types and actual device requests remain unavailable. |
| Build, browser accessibility, Lighthouse | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | Build/dev server/browser were not started because the only configured DB is remote and local DB tooling is unavailable. |

## Baseline Results

| Command/check | Result | Evidence |
|---|---|---|
| Runtime/dependencies | VERIFIED | Node `v24.13.0`, npm `11.10.0`, and `node_modules=True`; no install was needed or run. |
| Database safety | VERIFIED | `DATABASE_URL` host classified as `aws-0-eu-west-1.pooler.supabase.com`, database `postgres`, `local=False`. Credentials were not printed. |
| Docker / local DB | VERIFIED | `docker` command is not installed; `localhost:5433` is unreachable. |
| `npm run lint` | VERIFIED, failed at initial baseline | ESLint summary before fixes: `6 errors, 112 warnings`. Current result is in the remediation section. |
| `npm run typecheck` | VERIFIED, passed at initial baseline | `tsc --noEmit` completed with no diagnostics; current result is in the remediation section. |
| `npm test` | VERIFIED, failed at initial baseline | Initial result: `Tests 10 failed | 532 passed (542)`, with duplicate worktree execution. Current result is in the remediation section. |
| `npm run build` | NOT RUN | It runs `prisma generate` and Next build; this writes generated/build output and build-time route evaluation may touch the configured DB. No safe test DB was available. |
| `npm audit --omit=dev` | VERIFIED, failed at initial baseline | Initial output flagged Next `16.2.0 - 16.3.5`, critical; the follow-up compatible dependency update and clean audit are recorded below. |
| Prisma generate/migrations/seed | NOT RUN | The configured DB is remote; Docker and local test DB are unavailable. |
| Dev server / live website/API | NOT RUN | Would run against the configured remote DB unless safely reconfigured; no local test DB was available. |

### Lint Diagnostics

The six errors represent three distinct diagnostics duplicated by traversal of `.kilo/worktrees`:

| File | Line:column | Rule | Diagnostic |
|---|---:|---|---|
| `app/admin/staff/page.tsx` | 407:103 | `react/no-unescaped-entities` | Unescaped apostrophe in JSX text. |
| `app/admin/website-setup/page.tsx` | 133:77 | `@typescript-eslint/no-explicit-any` | Explicit `any`. |
| `app/admin/website-setup/page.tsx` | 133:122 | `@typescript-eslint/no-explicit-any` | Explicit `any`. |

Lint reported 112 warning instances. The following 39 distinct source locations were recoverable from the captured output; the dominant rule is `react-hooks/set-state-in-effect` (synchronous state updates or data-loading calls within effects). These warning instances are not represented as proof of a runtime bug.

| File | Line:column | Rule / message |
|---|---:|---|
| `app/admin/schedule/page.tsx` | 505:21 | `react-hooks/set-state-in-effect` |
| `app/admin/settings/page.tsx` | 104:7 | `react-hooks/set-state-in-effect` |
| `app/admin/settings/page.tsx` | 135:44 | `react-hooks/set-state-in-effect` |
| `app/admin/settings/page.tsx` | 190:21 | `react-hooks/set-state-in-effect` |
| `app/admin/staff/coaches/page.tsx` | 77:21 | `react-hooks/set-state-in-effect` |
| `app/admin/staff/page.tsx` | 93:18 | `react-hooks/set-state-in-effect` |
| `app/admin/subscriptions/page.tsx` | 105:21 | `react-hooks/set-state-in-effect` |
| `app/admin/subscriptions/page.tsx` | 106:21 | `react-hooks/set-state-in-effect` |
| `app/admin/website-setup/page.tsx` | 146:5 | `react-hooks/set-state-in-effect` |
| `app/dashboard/bookings/page.tsx` | 90:5 | `react-hooks/set-state-in-effect` |
| `app/dashboard/coach/page.tsx` | 99:21 | `react-hooks/set-state-in-effect` |
| `app/dashboard/membership/page.tsx` | 114:5 | `react-hooks/set-state-in-effect` |
| `app/dashboard/membership/page.tsx` | 124:7 | `react-hooks/set-state-in-effect` |
| `app/dashboard/membership/page.tsx` | 146:15 | `react-hooks/set-state-in-effect` |
| `app/dashboard/notifications/page.tsx` | 45:5 | `react-hooks/set-state-in-effect` |
| `app/dashboard/page.tsx` | 97:5 | `react-hooks/set-state-in-effect` |
| `app/dashboard/profile/page.tsx` | 117:5 | `react-hooks/set-state-in-effect` |
| `app/dashboard/schedule/page.tsx` | 711:5 | `react-hooks/set-state-in-effect` |
| `app/dashboard/settings/page.tsx` | 47:21 | `react-hooks/set-state-in-effect` |
| `app/platform/clubs/[id]/page.tsx` | 86:21 | `react-hooks/set-state-in-effect` |
| `app/platform/logs/page.tsx` | 176:5 | `react-hooks/set-state-in-effect` |
| `app/platform/logs/page.tsx` | 181:21 | `react-hooks/set-state-in-effect` |
| `app/platform/website-requests/page.tsx` | 84:21 | `react-hooks/set-state-in-effect` |
| `app/platform/website-requests/page.tsx` | 85:21 | `react-hooks/set-state-in-effect` |
| `app/user/accept-invitation/page.tsx` | 63:7 | `react-hooks/set-state-in-effect` |
| `app/user/login/page.tsx` | 54:7 | `react-hooks/set-state-in-effect` |
| `components/admin/WebsiteChangeRequestPanel.tsx` | 47:5 | `react-hooks/set-state-in-effect` |
| `components/dashboard/DashboardHeader.tsx` | 44:21 | `react-hooks/set-state-in-effect` |
| `components/dashboard/NotificationList.tsx` | 22:7 | `react-hooks/set-state-in-effect` |
| `components/landing/LandingNavbar.tsx` | 38:21 | `react-hooks/set-state-in-effect` |
| `components/PhoneInput.tsx` | 126:19 | `react-hooks/set-state-in-effect` |
| `context/AuthContext.tsx` | 67:7 | `react-hooks/set-state-in-effect` |
| `context/ClubSettingsContext.tsx` | 171:5 | `react-hooks/set-state-in-effect` |
| `context/ThemeContext.tsx` | 55:5 | `react-hooks/set-state-in-effect` |
| `hooks/useDaysUntil.ts` | 21:7 | `react-hooks/set-state-in-effect` |
| `hooks/useEditableContent.ts` | 28:5 | `react-hooks/set-state-in-effect` |
| `hooks/useRealtimeNotifications.ts` | 47:7 | `react-hooks/set-state-in-effect` |
| `lib/email.ts` | 1:10 | `@typescript-eslint/no-unused-vars` (`fetchWithTimeout`) |
| `lib/website-setup.ts` | 7:15 | `@typescript-eslint/no-unused-vars` (`WebsiteSetupFlags`) |

Vitest failures observed:

| Test | Observed failure |
|---|---|
| `lib/__tests__/validation.test.ts` — accepts an 8+ character password | `passwordSchema.safeParse("secret12").success` was `false` where the test expects `true`. |
| `app/api/__tests__/plan-limits.test.ts` — creates a member below limit | Route returned 500 instead of 201 because the Prisma mock has no `$transaction`. |
| `app/api/__tests__/tenant-isolation.test.ts` — GET coaches | Permission mock does not define `hasAnyPermission`. |
| Same tenant-isolation test — DELETE notifications/clear-all | Route returned 500 instead of 200 due the missing permission mock. |
| Same tenant-isolation test — GET promotions | `findMany` was not reached with expected scoped `where.clubId`, after the mock error. |

Each of the five cases above also ran from `.kilo/worktrees/battle-nephew`, accounting for the 10 failing test instances.

## Bugs and Security Findings

The rows below are the initial audit findings and retain their original evidence labels. Their current disposition is in [Approved Non-Email Remediation](#approved-non-email-remediation) and [Provider Migration](#provider-migration). Request snippets are for a dedicated local/test deployment only; do not run them against production.

| ID | Severity | Status | Area | Evidence, reproduction, expected vs actual, location | Proposed fix |
|---|---|---|---|---|---|
| SEC-01 | HIGH | READ-ONLY | Email verification / account ownership | **Repro:** register a pending member at a test club, then `POST /api/auth/verify` with `{"email":"member@example.test","code":"123456"}` on that club host. **Expected:** only the sent, unexpired code verifies. **Actual from source:** literal `123456` is accepted in all environments; register assigns it and logs it. [register](app/api/auth/register/route.ts#L153), [verify](app/api/auth/verify/route.ts#L112). | Remove the fixed bypass; if retained for local development, gate both generation and acceptance on `NODE_ENV !== "production"` and loudly fail production configuration. Never log the code or address. |
| SEC-02 | HIGH | READ-ONLY | Mobile bearer authentication | **Repro:** `curl.exe -i "http://club-a.localhost:3000/api/dashboard/notifications" -H "Authorization: Bearer <token>" -H "x-client-type: mobile-app"`. **Expected:** valid mobile bearer token reaches the authenticated handler. **Actual from source:** proxy sees no `token` cookie and returns 401 for protected API prefixes before `requireUser()` can read the bearer token. [proxy](proxy.ts#L163), [bearer parser](lib/auth.ts#L133), [mobile token response](app/api/auth/login/route.ts#L224). | Make proxy protected-route authentication bearer-aware without changing successful response JSON shapes; keep DB-backed role and tenant checks in `requireX()`. Add contract tests for cookie and bearer clients. |
| SEC-03 | CRITICAL | VERIFIED | Dependency security | `npm audit --omit=dev` returned `next 16.2.0 - 16.3.5`, `Severity: critical`, one critical vulnerability. `npm ls next --depth=0` returned `next@16.3.5`. | Upgrade Next.js to the patched version identified by current npm audit metadata, then rerun audit, typecheck, tests, and build. No dependency change was applied during this audit. |
| QA-01 | MEDIUM | VERIFIED | Automated tests | `npm test`: 532 passed, 10 failed. Failures are the stale password-schema expectation, incomplete Prisma/permissions mocks, and duplicated execution from `.kilo/worktrees`. | Exclude generated/worktree directories in Vitest; update mocks and tests to the current schemas/route contract; retain real DB isolation tests in a separately configured local test suite. |
| QA-02 | MEDIUM | VERIFIED | Lint / maintainability | `npm run lint`: 6 errors and 112 warnings. Distinct errors are `app/admin/staff/page.tsx:407`, and `app/admin/website-setup/page.tsx:133` (two `any` diagnostics). Warning locations are listed above. | Fix the three distinct errors and remove worktree duplication from lint traversal; handle effect warnings in small, behavior-tested slices. |
| SEC-04 | MEDIUM | READ-ONLY | Fine-grained RBAC | **Repro:** create an ADMIN, revoke `planning.manage`, then `DELETE /api/admin/sessions/<sessionId>` for a session in that club. **Expected:** a denied planning permission blocks deletion. **Actual from source:** `PATCH` checks planning permission while `DELETE` only checks `requireAdmin` and club-scoped resource lookup. [session route](app/api/admin/sessions/%5Bid%5D/route.ts). | Apply the same permission policy to DELETE as the corresponding session mutation and test each role/override. |
| SEC-05 | MEDIUM | READ-ONLY | CSRF / reverse-proxy headers | `verifyOrigin()` adds `x-forwarded-host` to accepted request hosts. If an ingress forwards a caller-controlled value, a forged forwarded host matching `Origin` can pass the origin check. [csrf](lib/csrf.ts#L27), [origin comparison](lib/csrf.ts#L60). | Trust only a proxy-sanitized canonical host; configure ingress to overwrite forwarded headers and test hostile Origin/forwarded-host combinations in deployment. |
| PERF-01 | MEDIUM | READ-ONLY | Unbounded lists | Static route review found non-paginated/unbounded responses including member booking history, coach/staff lists, plans, schedule, member reports, public schedules/posts, and coach rosters; posts include nested likes/comments. | Add stable pagination or explicit result caps and select only required fields. Preserve existing mobile response shapes or version the contract before altering them. |
| PERF-02 | MEDIUM | READ-ONLY | Activity log queries | `/api/admin/logs` uses user-controlled `page` to create an unbounded `skip`; filtered ordering is `createdAt desc`. The schema has separate indexes but no `clubId, createdAt` composite index. [logs route](app/api/admin/logs/route.ts#L16), [schema](prisma/schema.prisma#L895). | Bound page/offset, prefer cursor pagination, and add/validate the composite index from observed production query plans. |
| REL-01 | MEDIUM | READ-ONLY | Rate limit resilience | Missing or failing Upstash falls back to per-process in-memory counters. This is not a shared limit across serverless instances. [rate limiter](lib/rate-limit.ts#L98). | Require Upstash in production deployment validation; alert on fallback use and test Redis outage behavior. |
| REL-02 | MEDIUM | READ-ONLY | SSE scale-out | Redis pub/sub is used when configured; fallback clients live in a process-local set, so cross-instance notifications are not delivered in fallback mode. [SSE hub](lib/sse.ts#L28). | Enforce Redis for multi-instance production and monitor subscription/publish failures. |
| SEC-06 | MEDIUM | READ-ONLY | Content Security Policy | Production `script-src` includes `'unsafe-inline'`, weakening CSP's ability to stop inline script injection. [Next config](next.config.ts#L75). | Replace broad inline permission with nonces or hashes for the two bootstrap scripts; verify hydration and CSP in a browser. |
| SEC-07 | MEDIUM | READ-ONLY | Upload request memory | Upload pre-check depends on declared `Content-Length`; multipart parsing buffers the body before checking actual `file.size`, and then the file is buffered again. Chunked/no-length traffic can consume memory before rejection, subject to hosting request limits. [upload](app/api/upload/route.ts#L80). | Configure an edge/body limit and stream or enforce measured request bytes before multipart buffering; test chunked oversize requests. |
| A11Y-01 | LOW | READ-ONLY | Dialog keyboard access | Shared confirmation dialog exposes `aria-modal` but does not implement focus trapping/restoration in the reviewed component. [ConfirmDialog](components/platform/ConfirmDialog.tsx#L38). | Use a dialog primitive with focus management and keyboard/browser tests. |
| SEO-01 | LOW | READ-ONLY | Tenant SEO | Root metadata is a single club-branded title/description and sitemap emits only the configured base URL; tenant subdomains do not get tenant-specific sitemap entries here. [layout](app/layout.tsx#L11), [sitemap](app/sitemap.ts#L9). | Add host-resolved per-tenant metadata and a per-tenant sitemap route. |

### Tenant Isolation and RBAC Matrix

Static review only. **Tested = NO** means no live requests were made. Handler guards and `clubId` scoping are READ-ONLY findings; no claim is made that cross-tenant isolation passed a runtime test.

| API route family | Methods / required role from source review | Tenant check present? | Tested? |
|---|---|---|---|
| `/api/admin/members`, `/[id]`, `/search`, `/subscribe` | GET/POST/PATCH: ADMIN/OWNER plus permissions where configured; DELETE: OWNER | Yes, via live account + tenant guard and club-scoped lookups | NO |
| `/api/admin/coaches`, `/[id]`, `/api/admin/staff`, `/[id]`, invitations resend | ADMIN/OWNER or OWNER for staff/invitation management | Yes, club-scoped | NO |
| `/api/admin/schedule`, `/[id]`, `/plan/[id]`, `/api/admin/sessions/[id]` | ADMIN/OWNER; plan activation/archive includes OWNER-only operations; per-action permissions in most operations | Yes, club-scoped; session DELETE permission inconsistency in SEC-04 | NO |
| `/api/admin/bookings`, `/payments`, `/subscriptions`, `/billing/*`, `/analytics`, `/stats`, `/logs` | ADMIN/OWNER or OWNER per route/action; log purge OWNER | Yes for club data | NO |
| `/api/admin/notifications*`, `/promotions*`, `/roles`, `/reports*`, `/member-reports*`, `/settings`, `/page-content`, `/website-*`, `/setup-status`, `/system` | ADMIN/OWNER plus granular permissions; OWNER for sensitive config/roles where specified | Yes for club data | NO |
| `/api/dashboard/*` member endpoints | `requireUser` (MEMBER/COACH/ADMIN/OWNER according to route) | Yes, current DB account club compared with resolved tenant | NO |
| `/api/dashboard/coach/*` | `requireCoach` | Yes, coach and session queries scoped to user's club/own sessions | NO |
| `/api/platform/*` | `requireSuperAdmin` | Platform-wide by design; no club tenant restriction | NO |
| `/api/auth/*` | Public auth flows; session/bridge/logout apply their own token/nonce rules | Tenant-scoped where a club is required; login resolves by host | NO |
| `/api/onboarding/*` | Public, rate-limited and schema-validated | Creates a tenant transactionally by source review | NO |
| `/api/settings/public`, `/api/plans/public`, `/api/coaches/public`, `/api/schedule/public`, `/api/content/public/*`, `/api/posts*`, `/api/clubs/search`, `/api/saas-plans`, `/api/health` | Public by design; mutations on posts require user/admin roles | Tenant host scope on club-specific responses; global plans/health are platform-wide | NO |
| `/api/bookings`, `/api/upload`, `/api/billing/*` | User/admin/owner guards by operation | User-owned rows and club media/billing are scoped in handlers by source review | NO |
| `/api/payments/konnect/webhook`, `/api/cron/*` | Public gateway redirect with server-side payment re-fetch; cron secret required | Payment club ID comes from stored record; cron is platform operation | NO |
| `/api/sse` | Authenticated `requireUser` | Authenticated user ID and tenant validated | NO |

| Caller role | `/api/dashboard/*` | `/api/admin/*` | `/api/platform/*` | Runtime matrix tested? |
|---|---|---|---|---|
| Guest | Denied except explicitly public APIs | Denied | Denied | NO |
| MEMBER | User-scoped routes only | Denied | Denied | NO |
| COACH | Coach-specific routes plus routes using `requireUser` | Denied | Denied | NO |
| ADMIN | Routes whose handler permits admin, subject to fine-grained permissions | Admin operations subject to permissions; some operations owner-only | Denied | NO |
| OWNER | Owner/admin permitted routes and owner-only operations | Full club operations per handler guards | Denied | NO |
| SUPER_ADMIN | Denied by gym `requireUser`/role guards | Denied | Platform operations | NO |

The matrix above is not a substitute for the requested Gym A/Gym B IDOR request matrix or a per-endpoint/per-method/per-role live test. Those require a local/test DB seeded with two clubs and role accounts. The suite includes mocked tenant tests, but those tests currently fail in cases shown above.

### Mobile Contract Review (Initial Snapshot)

At the initial audit, `getTokenFromRequest()` supported `Authorization: Bearer`, and login conditionally returned `token` for `x-client-type: mobile-app`, but the proxy demanded a cookie on protected API prefixes. That code defect has since been fixed and has focused unit coverage. No mobile types or live responses were available: `../app_gymos` is absent. No response JSON was compared with mobile expectations, and no response shape was changed.

## Performance and Reliability

| Measure/check | Result |
|---|---|
| Lighthouse mobile/desktop (home, login, dashboard, admin members) | NOT RUN: no app server/browser run. No LCP, CLS, or TBT numbers available. |
| `next build` bundle sizes | NOT RUN: build invokes Prisma generation and may evaluate database-backed routes. |
| Autocannon/k6 endpoint load test | NOT RUN: no local server/test DB. No p50/p95 or error rates available. |
| DB query latency/plans/N+1/index efficacy | NOT MEASURED: no DB access allowed. Static issues are PERF-01 and PERF-02. |
| Booking capacity and cancellation race | READ-ONLY: source uses an atomic conditional update inside a transaction and prevents decrement below zero; no concurrent DB test was run. |
| Subscription/payment concurrency/idempotency | READ-ONLY: webhook uses a transaction and conditional payment claim; no Konnect or DB replay was executed. |
| Redis/Resend/TextBee/Cloudinary outage handling | NOT EXERCISED against live providers: configuration and third-party services unavailable/untested. Unit tests cover Resend/TextBee request and failure paths; rate-limit and SSE fallback behavior is described above. |
| Sentry | NOT VERIFIED at runtime. Repository docs (`DEPLOYMENT.md`) describe Sentry as stubbed/not wired; no event was sent. |

## Quality, Accessibility, and SEO

- **Quality (initial snapshot):** TypeScript passed. The initial lint/test details are in Baseline Results. Vitest worktree discovery has since been excluded.
- **Input validation:** source review found Zod use on many auth, booking, onboarding, and write routes; route-by-route request validation was not runtime fuzzed.
- **Raw SQL:** inspected booking SQL is parameterized through Prisma's tagged SQL template. `npm audit` and static search were run, but this is not a proof that every SQL path is safe.
- **XSS/HTML:** reviewed root inline scripts are constant source strings; no full `dangerouslySetInnerHTML`/user-content data-flow audit or browser XSS test was performed.
- **Accessibility:** no browser keyboard, contrast, screen-reader, or responsive tests. Native dialog semantics, focus trapping/restoration, and Escape handling were added; browser behavior remains unverified. Labels and contrast across every view remain unverified.
- **SEO/i18n:** tenant-aware root metadata and request-host sitemap generation were added; browser/crawler output remains unverified. French default is present in root layout; language parity/content consistency was not audited exhaustively.
- **Dead code/dev output:** lint reports unused `WebsiteSetupFlags`; provider/OTP logging was removed from the touched paths. No full git-history secret scan was run.

## Top 15 Prioritized Improvements

| Priority | Improvement | Impact | Effort |
|---:|---|---|---|
| 1 | Rotate the Resend and TextBee keys exposed in chat; set fresh values in the secret store | Critical | Low |
| 2 | Provision an isolated local/staging DB; run migrations, seed, build, and the full site smoke suite | Critical | Medium |
| 3 | Execute Gym A/Gym B route-by-route IDOR and role matrix against a disposable test DB | Critical | High |
| 4 | Compare mobile responses and bearer behavior against the actual `fedimezz/app_gymos` contract | High | Medium |
| 5 | Send Resend verification/reset/invitation emails from a verified sender and verify delivery/non-enumeration | High | Low |
| 6 | Send TextBee SMS from the paired Android device; verify queued and final delivered/failed states | High | Low |
| 7 | Run desktop/mobile E2E for guest, member, coach, admin, owner and SUPER_ADMIN flows | High | High |
| 8 | Run Lighthouse and 3-endpoint load test; set measured LCP/CLS/TBT and p95 budgets | High | Medium |
| 9 | Convert capped high-volume lists to cursor pagination with compatible API contracts | High | Medium/High |
| 10 | Run DB `EXPLAIN (ANALYZE, BUFFERS)` for activity logs and add only evidence-backed indexes | Medium | Medium |
| 11 | Verify CSP nonce, iframe preview, dialog keyboard/focus, contrast and mobile layouts in browser | High | Medium |
| 12 | Exercise Konnect sandbox webhook replay/idempotency and amount units; test failed/duplicate events | High | Medium |
| 13 | Verify production Resend/TextBee/Redis/Cloudinary outage behavior and alerting | High | Medium |
| 14 | Wire and smoke-test Sentry, cron routes, database backups, and restore procedure | High | Medium/High |
| 15 | Reduce remaining 55 lint warnings where safe and maintain green CI gates | Medium | Medium |

## SUPER_ADMIN Setup

### Development

1. Configure `DATABASE_URL` and `DIRECT_URL` to a local/test PostgreSQL database only. Apply migrations before seeding. The current configured URL is remote and must not be used for this audit.
2. Ensure `APP_URL=http://localhost:3000` and a development `JWT_SECRET` of at least 32 characters. Do not set `DEV_DEFAULT_CLUB_SLUG` while testing the platform apex login; unset it in the shell for the test.
3. Set `SEED_PLANS_ONLY=1`, `SUPER_ADMIN_EMAIL`, and `SUPER_ADMIN_PASSWORD` (12+ characters) in the local process environment, then run `npx prisma db seed`. In this mode the seed writes SaaS plans and creates/updates the platform user with `clubId=null`, and does not create demo clubs/accounts.
4. Start the app only after the DB is local/test and migrations/seed are done. Visit `http://localhost:3000/platform/login`. Use the configured email and password. The platform session cookie is host-only for SUPER_ADMIN.
5. Do not paste the password into this report/chat or commit it. Enter it directly in your local shell/secret manager.

Example PowerShell shape (replace placeholders locally; never use the current remote URL):

```powershell
$env:SEED_PLANS_ONLY = '1'
$env:SUPER_ADMIN_EMAIL = 'you@example.test'
# Enter SUPER_ADMIN_PASSWORD directly in your shell without sharing it here.
Remove-Item Env:DEV_DEFAULT_CLUB_SLUG -ErrorAction SilentlyContinue
npx prisma db seed
```

### Production

- Configure `DATABASE_URL` (runtime pooler), `DIRECT_URL` (direct migration connection), `JWT_SECRET` (32+ chars), `APP_URL` (canonical HTTPS apex), and `NEXT_PUBLIC_APP_URL` (same canonical base).
- Configure `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` (12+ chars) in the deployment secret store. Run `npx prisma migrate deploy`, then run `NODE_ENV=production npx prisma db seed` as a deliberate deployment operation. Production-mode seed upserts plans and creates/updates only the SUPER_ADMIN; it does not seed demo clubs.
- Configure Upstash (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`), `CRON_SECRET` (at least 16 chars), Resend (`RESEND_API_KEY`, verified `RESEND_FROM`), TextBee (`TEXTBEE_API_KEY` and a paired online device if SMS is enabled), Cloudinary, Konnect, and Google OAuth values if enabled.
- Set wildcard DNS and TLS for `*.yourdomain.com`; use the documented apex + wildcard routing. Leave `COOKIE_DOMAIN` unset unless cross-subdomain sharing is deliberately required. SUPER_ADMIN cookie is host-only; tenant cookie handling depends on correct canonical host/DNS/TLS.
- Verify in a production-like staging environment: login, tenant owner/member login, logout cookie removal, tenant switching rejection, onboarding bridge, password reset email, sandbox payment + replay, cron auth, upload, and mobile bearer API responses.

### Plain localhost limitations

- Platform SUPER_ADMIN login can use `localhost:3000`; its host-only, non-Secure cookie is suitable for local HTTP.
- A cookie set on `localhost` is not shared with `{slug}.localhost`; owner-to-club handoff therefore uses the bridge flow. Tenant testing needs a `{slug}.localhost` host or the app's explicit development tenant mechanism.
- Plain HTTP localhost cannot validate production Secure-cookie, wildcard DNS/TLS, custom-domain, proxy-header, or cross-subdomain browser behavior. Do not configure `DEV_DEFAULT_CLUB_SLUG` for the platform-apex bootstrap verification because it can turn an apex request into a tenant request.

**Not completed:** no SUPER_ADMIN was seeded or logged in, because that would write to the current remote Supabase database. The user's email is still needed for the isolated local setup; the password must be set privately in the shell/secret store.

## Before-Launch Checklist

- [ ] Rotate and revoke the provider credentials pasted into chat; set replacement Resend/TextBee values in deployment secrets.
- [ ] Confirm the Resend sender domain is verified and the production `RESEND_FROM` matches it.
- [ ] Pair and keep online a TextBee Android device; configure `TEXTBEE_DEVICE_ID` if not using its default device.
- [ ] Apply migrations, seed only a disposable local/staging DB, run `npm run build`, and verify all six roles end to end.
- [ ] Add/run DB-backed Gym A/Gym B isolation tests and per-role API matrices.
- [ ] Validate mobile bearer response and JSON contracts against the app client's declared types.
- [ ] Run browser E2E, desktop/mobile Lighthouse, accessibility, and API load tests; record actual metrics.
- [ ] Use production PostgreSQL with connection pooling/runtime URL, direct migration URL, migrations, automated backups, and a tested restore procedure.
- [ ] Require shared Upstash for production rate limits, one-time token consumption, and cross-instance SSE.
- [ ] Configure and test JWT secret, canonical app URLs, wildcard DNS/TLS, cookie behavior, and do not set broad `COOKIE_DOMAIN` by default.
- [ ] Verify Resend registration/reset/invitation delivery and account-enumeration behavior.
- [ ] Verify TextBee SMS delivery, rate limits, country allow-list, and offline-device behavior if SMS verification is enabled.
- [ ] Configure Cloudinary upload restrictions and verify body-size limits at both hosting edge and handler.
- [ ] Configure Konnect in sandbox first; verify webhook signatures/lookup, amount units, duplicate/replay handling, and then live-mode credentials.
- [ ] Set and rotate `CRON_SECRET`; verify all scheduled endpoints and fail-closed behavior.
- [ ] Wire Sentry and structured alerting; ensure logs do not contain passwords, OTPs, access tokens, or unnecessary PII.
- [ ] Run browser E2E, mobile/desktop Lighthouse, a 3-endpoint load test, accessibility checks, and cross-tenant RBAC matrix in staging.
- [ ] Create and verify the SUPER_ADMIN from an isolated and controlled seed operation.

## Not Tested / Why

1. Prisma client generation, migrations, seed, and DB-backed isolation: `DATABASE_URL` points at a remote Supabase pooler; local Docker is absent and port 5433 is closed. No DB write was attempted.
2. SUPER_ADMIN creation/login/dashboard: requires a DB write and a user-provided email; neither was performed. Password must remain private.
3. Website and API live workflow tests, including per-role CRUD, stale JWT, invitation, onboarding, session bridge, and cross-tenant host spoofing: no safe DB/server was available.
4. Mobile response/type contract: mobile repository `fedimezz/app_gymos` is not present in this workspace; only this server's source was reviewed.
5. Playwright, Lighthouse, autocannon/k6: no declared project dependency or running test deployment was established; installing/running browser tooling would modify the workspace and still require a safe test environment.
6. `npm run build`: invokes Prisma generation and may evaluate database-backed routes; intentionally not run against the current remote DB configuration.
7. Konnect live/sandbox callbacks, Google OAuth, Resend, TextBee delivery/device availability, Cloudinary, cron scheduling, Redis outage/scale-out, production cookie/DNS behavior: live credentials/services and staging environment were not exercised.
8. Per-route request fuzzing, complete SQL injection/XSS/SSRF/open-redirect review, secret scan of Git history, full keyboard/screen-reader/contrast testing, and real query plans: not completed in this bounded safe pass.

## Remediation Status

The user subsequently requested replacing Brevo/Twilio with Resend/TextBee. The shared email/SMS helpers and registration/verification flow were updated; the earlier no-email instruction is superseded by this newer request. No API route response shapes were changed.

| Finding | Current status after fixes | Evidence / remaining limitation |
|---|---|---|
| SEC-01 fixed verification code | FIXED in code | Registration now generates a cryptographically random six-digit code, stores only its hash, and sends it through Resend; `/api/auth/verify` accepts only a matching hash. A focused test rejects the old `123456` value. Live email delivery was not tested. |
| Email provider | IMPLEMENTED, live delivery unverified | `lib/email.ts` calls Resend's documented `POST https://api.resend.com/emails` endpoint using `RESEND_API_KEY` and `RESEND_FROM`; registration, resend-code, password reset, invitations, notifications and cron mail keep their existing helper contract. Production startup requires both settings. |
| SMS provider | IMPLEMENTED, live delivery unverified | `lib/sms.ts` calls TextBee's documented `POST /api/v1/gateway/send-sms` endpoint with `x-api-key`, E.164 `recipients`, and `message`. `TEXTBEE_DEVICE_ID` is optional; TextBee defaults to the account's enabled device. TextBee's 200 response indicates acceptance/queueing, not delivery. |
| SEC-02 mobile bearer at proxy | FIXED in code | Proxy accepts bearer JWTs for protected API routes while page routes remain cookie-only; unit test covers member access, role denial, missing credentials, and page CSP. Mobile consumer types/runtime are not available. |
| SEC-03 critical Next advisory | FIXED | Installed Next is `16.3.8`; `npm audit --omit=dev` reports `found 0 vulnerabilities`. `npm audit fix` returned nonzero because npm reported dev-tool advisories with a breaking `eslint-config-next@14` downgrade suggestion; no forced downgrade was applied. |
| QA-01 failing/duplicated tests | FIXED for current configured suite | Excluded `.kilo/**`; updated current password expectation and mocks. Latest `npm test`: 34 files passed, 292 tests passed. |
| QA-02 lint errors | FIXED | Current `npm run lint`: 0 errors, 55 warnings. Remaining warnings are primarily `react-hooks/set-state-in-effect`. |
| SEC-04 session delete permission | FIXED in code | DELETE now checks `planning.manage`; focused route test confirms denied ADMIN does not query the session. |
| SEC-05 forwarded-host CSRF trust | FIXED in code | `x-forwarded-host` no longer independently authorizes Origin; focused CSRF suite passed. Actual ingress host normalization still needs staging verification. |
| PERF-01 high-volume lists | PARTIALLY MITIGATED | Added hard query bounds to bookings, public schedule/posts, admin coaches/staff/plans/reports/schedule, coach sessions/roster, including nested post engagement. Existing response roots/JSON keys are unchanged. These are caps, not client-driven pagination; results beyond each cap are not currently retrievable in the UI. |
| PERF-02 admin log deep offset | PARTIALLY MITIGATED | Requested page is capped at 1000 and ordering now ties on `id`; no index/migration added because production query plans and a safe DB were unavailable. |
| REL-01 Redis rate limiting / one-time use | FIXED for production configuration path | Production env validation requires both Upstash variables; rate limits and one-time consumption fail closed when absent/unavailable; health reports missing production Redis as degraded. Focused tests pass. |
| REL-02 SSE scale-out | MITIGATED BY REQUIRED CONFIG | Production boot now requires Redis through env validation. SSE itself still has a local fallback if invoked outside normal validated production startup; cross-instance SSE was not integration-tested. |
| SEC-06 inline script CSP | FIXED in code | Proxy generates per-request nonce CSP for page requests and root inline scripts receive the nonce. Script policy no longer grants `unsafe-inline`; browser/CSP behavior and website preview remain untested. |
| SEC-07 upload body memory | FIXED in handler | Actual request bytes are counted/capped before multipart parsing, even without `Content-Length`; upload regression tests passed. Hosting-edge maximums and production memory profile were not measured. |
| A11Y-01 dialog focus | FIXED in code | Native dialog semantics, initial focus, tab containment, Escape, and focus restoration are implemented. No browser or screen-reader run was available. |
| SEO-01 tenant metadata/sitemap | FIXED in code | Root metadata and sitemap resolve the incoming tenant and canonical origin. No build, crawler, or live custom-domain verification was run. |

**Post-initial-remediation verification (historical VERIFIED snapshot):** `npm test` completed with 282 tests passed. `npm run typecheck` completed with no diagnostics. `npm run lint` completed with 0 errors and 56 warnings. `npm audit --omit=dev` returned 0 vulnerabilities. `npm ls next eslint-config-next --depth=0` reported `next@16.3.8` and `eslint-config-next@16.2.9`.

**Provider-change verification (VERIFIED):** `npm test`: 34 files passed, 292 tests passed. `npm run typecheck` completed with no diagnostics. `npm run lint` completed with 0 errors and 55 warnings. `npm audit --omit=dev` returned `found 0 vulnerabilities`. Resend/TextBee requests were not sent to the live providers; their request contracts were checked against provider documentation and unit-tested with mocked fetch. No user-provided key was used or stored.

**Still not run:** `npm run build`, Prisma generation/migrations/seed, dev server, SUPER_ADMIN login, API requests against a local DB, mobile type-contract comparison, Lighthouse, load testing, and cross-tenant/role matrices. The configured database remains remote and no local PostgreSQL service is available. No DB writes were attempted.
