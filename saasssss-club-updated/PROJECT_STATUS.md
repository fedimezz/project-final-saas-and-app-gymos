# ClubX — SaaS Multi-Tenant — Project Status


## 2026-10-21 — Onboarding, trial, monthly/yearly billing, alternative payments (read this section first)

| Area | State | Proof |
|---|---|---|
| App download in onboarding | `DownloadAppCard` (plan step of `/onboarding` and `/admin/get-started`): Google Play / signed-APK buttons only when `lib/app-release.ts` says the release is real, an "install the web app" button when the browser offers it, and always a link to `/download`. The link is built **server-side from `APP_URL`** (`GET /api/app-download`), so it is correct from a club subdomain too (the old link used `NEXT_PUBLIC_APP_URL`, empty → broken on tenants). | `app-download.test.ts` |
| 14-day trial | Already built; now an explicit, selectable choice in onboarding ("Essai gratuit" default / "Payer maintenant"). No card, no ledger row, no Stripe. Expiry enforced per request. | `onboarding-e2e`, `trial.test.ts` |
| Monthly / yearly | `SaasPlan.priceYearly` (null = yearly not offered), `BillingPeriod` on `ClubSubscription`, `SaasPayment`, `ManualPaymentRequest`. Price always read from the plan row server-side. Editable in `/platform/plans`. Landing pricing, onboarding, `/admin/billing`, `/reactivate` all use the same helpers (`lib/billing-period.ts`). | `billing-period`, `billing-checkout`, `stripe-webhook`, `onboarding-e2e` tests |
| Stripe | Paid plan → Stripe Checkout → activation **only** from the signed webhook; period end computed from the period stored in OUR ledger row (metadata mismatch → 400, nothing activated); replays do nothing. | `stripe-webhook.test.ts` (14) |
| Paid period expiry | **Gap fixed:** a paid month/year used to stay ACTIVE forever. `isClubUsable` now refuses an ACTIVE club past `currentPeriodEnd` + `PAID_PERIOD_GRACE_DAYS` (default 3); clubs with no period end (platform-managed) never expire by date; the renewal cron records it (`Subscription expired`) and `/reactivate` accepts it. | `subscription-expiry`, `subscription-expiry-cron` tests |
| Alternative payment | Request carries plan + period (+ price snapshot). SUPER_ADMIN: **Approve/Reject → verify payment → Activate with a payment/agreement reference**. Approving activates nothing; activation needs `APPROVED` + reference, is a compare-and-set (no double activation), writes one PAID ledger row, never re-opens a banned (CANCELLED) club. One open request per club. | `platform-manual-payments` (12), `manual-payments` (12) |
| Auto-renewing cards | **Built, OFF by default** (`STRIPE_RECURRING_ENABLED=true` to enable). Card checkout becomes a Stripe Subscription (month/year interval, price from the plan row). Signed events: first invoice settled by `checkout.session.completed` (stores `providerSubscriptionId`/`providerCustomerId`); `invoice.paid` (renewal) → one ledger row per invoice (advisory-locked, idempotent) + next period; `invoice.payment_failed` → `PAST_DUE` (renewal cron suspends after grace); `customer.subscription.deleted` → renewal stops, access kept to the end of the paid period. Guards: a second subscription for a plan already auto-renewing is refused (409 + portal); a plan/period switch cancels the previous Stripe subscription after settlement; a one-time period still running on the same plan stays one-time (unused days kept). Owner button "Gérer l'abonnement" → Stripe Customer Portal (`POST /api/billing/portal`). Auto-renewing clubs get no reminder e-mails. | `saas-recurring`, `stripe-recurring-events`, `billing-portal`, `billing-checkout`, `stripe-webhook`, `onboarding-*` tests |
| Renewal reminders | New cron `/api/cron/renewal-reminders` (daily 08:00): e-mails the OWNER 7, 3 and 1 day before a paid period ends, once per threshold per period (state keyed on the period end, so renewals need no reset); a failed e-mail is not marked as sent. | `renewal-reminders`, `renewal-reminders-cron` tests |
| Early renewal | Renewing the **same plan** while the paid period is running continues from its end (Stripe webhook and manual activation). A plan change, a trial, a lapsed or suspended club starts now. | `billing-period`, `stripe-webhook`, `platform-manual-payments` tests |
| Pay without card at signup | Onboarding third option "Payer sans carte" (method + phone). Creates the club **closed** (`SUSPENDED`, reason `Awaiting manual payment`) with a PENDING request; no session, no Stripe; works from Tunisia; amount from the DB. SUPER_ADMIN approves → verifies → activates; the owner can edit the request from `/reactivate`. | `onboarding-e2e` (5 new), `manual-payments` tests |
| Legal pages | `/legal/terms` and `/legal/privacy` (French, linked from the landing footer). Publisher identity from `LEGAL_ENTITY_NAME`, `LEGAL_ADDRESS`, `LEGAL_REGISTRATION`. **Draft: have a lawyer review before real customers** (refund and jurisdiction wording are my assumptions). | `legal-pages` test |
| Pack Premium | Kept; relabelled "Pack Design Premium (accompagnement)" with an honest description (themes/models are free). Price and request flow unchanged. | — |
| Themes / 3D | Every theme and every built-in 3D model is free on every plan (the `premium` concept is removed from code; `GymSettings.premiumUnlocks` column kept). **"Add my own 3D model"** is the plan feature `limits.customHeroModel` (PRO/BUSINESS = true by migration; configurable per plan). Enforced server-side (upload, placement, selecting "custom" in settings, design-change request and apply → 402 `PLAN_UPGRADE_REQUIRED`); UI shows the lock + upgrade link. Removing an existing custom model is always allowed. | `hero-model`, `design-change`, `plan-feature-guard`, `themes-unlocked` tests |

### Verified (this session)
- `tsc --noEmit` clean; `eslint` 0 errors; `vitest` 85 files / 768 tests pass; `next build` succeeds (dummy env); built app started: pages 200, unauthenticated calls to platform/admin endpoints 401, unsigned webhook 400.
- All 23 migrations apply in order on PostgreSQL 16; the two new ones (`20261020000000`, `20261021000000`) were checked for backfill values (yearly = 10 × monthly, `customHeroModel` PRO/BUSINESS) and for not overwriting edited values.

### NOT verified — do not claim these
- No live Stripe test (no keys): Checkout creation and webhook signature are unit-tested with mocks only. Run one test-mode monthly and one yearly payment with the Stripe CLI before launch.
- UI screens were type-checked, linted and server-rendered, **not clicked through in a browser**.
- `prisma migrate deploy` was not run through Prisma (SQL applied with psql); `prisma migrate diff` not run.
- No signed APK exists; the APK button stays hidden until the `ANDROID_APK_*` variables are set.

### Decisions to review
1. **Existing paid clubs:** clubs activated by an earlier payment have `currentPeriodEnd` = 1 month after that payment. Because expiry was never enforced before, any such club older than that (+ grace) is suspended on the next request after deploy. Before deploying, run `select c.slug, s."currentPeriodEnd" from club_subscriptions s join clubs c on c.id=s."clubId" where s.status='ACTIVE' and s."currentPeriodEnd" < now()` and either renew them or set `currentPeriodEnd = null` (platform-managed) for the ones you want to keep free of date checks.
2. **Yearly price default** = 10 × monthly (two months free), applied by the migration only where empty. Change in `/platform/plans`.
3. **Stripe auto-renewal is built but OFF and never run against real Stripe.** Before setting `STRIPE_RECURRING_ENABLED=true`: in Stripe test mode enable the Customer Portal, add `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted` to the webhook, then run: a monthly signup, a renewal (`stripe trigger invoice.paid` is not enough — use a test clock to advance a real subscription), a failed renewal, a cancel from the portal, and a plan switch (check the old subscription is cancelled). Known simplification: switching plan/period starts a fresh period today (no proration, leftover days of the old period are not credited).
4. **Abandoned "pay without card" signups** stay as closed clubs (slug reserved) until SUPER_ADMIN rejects/handles them; there is no automatic cleanup.
5. Legal pages are a draft (see above); refund policy ("a paid period is not refunded") and jurisdiction ("Tunisian law") are assumptions to confirm.

## 2026-10-18 — Hardening pass (historical; the 2026-10-21 section above supersedes it where they differ)

Everything in "Verified" was actually run in the sandbox. Everything in "NOT verified" was not, and must not be
described as done.

### Done in code
| Area | What changed | Proof |
|---|---|---|
| Plans | `SaasPlan.isPublic`. STARTER is withdrawn from new offers but its rows and subscribers are untouched. Onboarding, checkout, reactivation and manual payment accept only active + public plans (a club keeps access to its own current plan). SUPER_ADMIN toggles `isPublic`/prices/limits in `/platform/plans`; the last public plan cannot be withdrawn. Seed no longer overwrites SUPER_ADMIN edits. | `saas-plan-visibility`, `platform-plans`, `manual-payments` tests |
| Theme / 3D lock | A club's theme and hero model lock once setup is done (`GymSettings.designLockedAt`, never clearable). Owner files ONE request → SUPER_ADMIN approves/rejects in `/platform/design-requests` → approval is a single-use grant (7 days) spent by `/api/admin/design-change/apply`. Enforced in the API (423 `DESIGN_LOCKED`) AND by Postgres triggers, so a direct SQL write or a forgotten route cannot bypass it. Club A's grant is useless to club B. | 22 route tests + `prisma/tests/design-lock.test.sql` (24 cases, real Postgres 16) |
| Duplicate theme | `luxury` was a free near-clone of the premium `gold` (same layout, black + gold, serif). It is **retired from new choices** (`retired: true`): hidden from pickers, refused by onboarding and design-change requests, still valid for clubs already using it. 17 selectable themes remain. | `website-themes.test.ts` |
| 14-day trial | Start/end dates, days left (`GET /api/billing/trial`, billing banner), expiry enforced **per request** in `isClubUsable` (the cron only tidies up), owner redirected to `/reactivate?expired=1`, login explains an expired trial, data is never deleted. `DEFAULT_TRIAL_DAYS` env (1–90, default 14). SUPER_ADMIN can extend. Anti-abuse: same mailbox via `+tag` alias or same phone as an existing OWNER → 409 `TRIAL_ALREADY_USED`. | `trial.test.ts`, onboarding tests |
| Mobile photo upload | Resize/convert before upload, multipart sent without a hand-written Content-Type, 90 s upload timeout, readable errors for 413/429/5xx/offline, tenant taken from the session (no clubId in the body). Release builds are refused unless `EXPO_PUBLIC_PLATFORM_API_BASE_URL` is a real https domain (`scripts/check-release-env.mjs`). | `clubx-mobile` `npm test` 55/55 |
| APK download | `/download` shows the APK button only when URL (https, non-placeholder), semver, SHA-256, release notes AND `ANDROID_APK_SIGNED=true` are all set (`lib/app-release.ts`). Version, notes, checksum and install steps are shown. Links from the landing footer, owner sidebar and onboarding. | `app-release.test.ts` |
| Security fixes | Google sign-in can no longer take over an unverified password account (password cleared); onboarding hand-off token is single-use; password change/reset invalidate the cached session immediately; http(s)-only URL fields. | `google-oauth`, `onboarding-payment-complete` tests |
| Branding | Visible text is ClubX. Footer mailto links now come from `NEXT_PUBLIC_CONTACT_EMAIL` (hidden when unset) instead of an unowned `clubx.app` domain. Internal keys (`gymos:` storage keys, reserved slug, `com.gymos.mobile`-style ids) intentionally unchanged. | grep |

### Verified (this session)
- Web: `tsc --noEmit` clean; `vitest` 73 files / 632 tests pass; `eslint` 0 errors (79 pre-existing warnings, none in files added or changed here); `next build` succeeds (run with dummy env values).
- All 21 migrations apply in order on an empty PostgreSQL 16 database; the 24 design-lock cases pass on it.
- Mobile: `tsc` clean, 55/55 tests.

### NOT verified — do not claim these
- **No signed APK or AAB exists.** The sandbox cannot run an EAS build; nothing was installed on a real Android phone, so the photo upload fix is unit-tested but **not confirmed on a device**.
- No real deployment, no `prisma migrate deploy` through Prisma itself (the SQL was applied with psql), no live Stripe/Resend/Cloudinary/Upstash calls, no real wildcard DNS/TLS.
- `prisma migrate diff` (schema ↔ migrations drift) was not run.

### Known remaining items
1. Existing clubs created in MANUAL setup mode are not retroactively locked (they lock on their next settings save).
2. No owner data-export for an expired club (data is kept, but the owner can only reactivate; an export endpoint is not built).
3. `/api/upload` has no magic-byte check for video/audio and no per-club storage quota; `admin/logs` and `admin/system` routes lack zod.
4. Rate limits read the first `X-Forwarded-For` value — safe on Vercel, spoofable behind other proxies.
5. `GET /api/onboarding/cancel` deletes the abandoned signup (it is Stripe's `cancel_url`, so it cannot be POST-only).
6. Legal pages (`Confidentialité`, `Conditions`) are `#` placeholders — required before real customers.
7. Sentry is still a stub.

## Stack
- Next.js 16 (App Router) · TypeScript · Prisma 5 · PostgreSQL
- Tailwind CSS v4 · Custom CSS variables theming
- JWT (jsonwebtoken) · httpOnly cookies · Jose (Edge)
- Upstash Redis (rate limiting) · Cloudinary (image uploads)
- Konnect payment gateway · Resend email + TextBee SMS
- Vitest (86 tests)

## Architecture: Multi-Tenant by Subdomain
- Each gym = one `Club` row + unique `slug` → subdomain `slug.yoursaas.com`
- Tenant resolved via `lib/tenant.ts` → `resolveTenantFromRequest()`
- Edge proxy (`proxy.ts`) injects `x-club-slug` header + JWT auth guard
- Every DB query MUST include `clubId` — never trust client-supplied clubId
- `lib/auth.ts`: `requireUser/requireAdmin/requireOwner/requireCoach/requireSuperAdmin`
- Email: Resend (`RESEND_API_KEY`, verified `RESEND_FROM`); SMS: TextBee (`TEXTBEE_API_KEY`, optional `TEXTBEE_DEVICE_ID`)

## Roles
- SUPER_ADMIN  — platform staff, no clubId, → /platform
- OWNER        — gym owner, full access + SaaS plan management
- ADMIN        — gym admin, operational access (no analytics/billing)
- COACH        — coach, only their sessions + roster
- MEMBER       — gym member, dashboard only

## Phases Completed (0–8)

### Phase 0 — Remise en route ✅
- tsc: 0 errors | vitest: 86/86 | build: 108 pages
- Fixed 4 tenant isolation bugs (coach sessions, resume-payment, webhook)
- Fixed Prisma.sql → sqltag, all $transaction callbacks typed

### Phase 1–4 — Multi-tenancy foundation ✅ (pre-existing)
- Club, SaasPlan, ClubSubscription, GymSettings models in schema
- All 72 API routes scoped by clubId (verified by grep audit)
- Prisma migrations: init, add_activity_log, multi_tenancy

### Phase 5 — Dashboards ✅
- Owner dashboard: KPI cards + SaasPlan widget (usage bars vs limits)
- Admin dashboard: same minus SaaS column
- Member dashboard: fully clubId-scoped
- Coach dashboard: stats (totalSessions, bookings, attendances, fillRate) + session roster
- New: GET /api/dashboard/coach/stats

### Phase 6 — Website Builder ✅
- proxy.ts: x-club-slug injection + JWT auth + role guards
- GET /api/admin/settings: now returns club.slug + publicUrl
- Settings page: URL publique widget (copy + open) in Identité tab
- GymSettings: primaryColor, logo, heroImage, enabledPages, workingHours, socialLinks
- ClubSettingsContext: applies --primary CSS var + page gates in real-time

### Phase 7 — Plan Limits ✅
- lib/plan-limits.ts: checkLimit(), checkFeature(), getFullUsage()
- Enforced: maxMembers (members POST + register), maxCoaches, maxAdmins, maxBookingsPerMonth
- Feature-gated: advancedAnalytics, revenueAnalytics → 402 + upgrade:true
- GET /api/saas-plans: public plan listing
- Analytics page: upgrade-aware error state with CTA

### Phase 8 — Onboarding ✅
- POST /api/onboarding/create-club: creates a suspended club, owner, SaaS subscription, settings, and pending Stripe payment ledger
- No trial or owner session is granted for new paid signups; the verified webhook/return activates the club
- Failed and expired signup checkout is cleaned up so the user can retry
- /onboarding: 4-step wizard (account → club → theme → paid plan)

## What Remains (Phases 9–12)

### Phase 9 — SaaS Billing Architecture
- Trial expiry enforcement (cron job → suspend club)
- Upgrade/downgrade flow (POST /api/billing/upgrade)
- Payment webhook for SaaS subscriptions (currently only gym membership webhook exists)
- Konnect or Stripe integration for SaaS billing
- /admin/billing page: current plan, invoices, upgrade/downgrade buttons

### Phase 10 — Security + Performance
- CSRF protection on state-mutating routes
- SQL injection audit (raw queries in book/route.ts)
- Rate limiting on all write endpoints (currently only auth + onboarding)
- Response caching for public routes (/api/coaches/public, /api/plans/public)
- Image optimization: next/image everywhere, WebP conversion
- DB indexes audit (check all clubId + userId composite queries)
- Prisma connection pooling (PgBouncer or Prisma Accelerate)

### Phase 11 — Tests
- Critical: Gym A / Gym B isolation test (create 2 clubs, prove zero data leak)
- Integration tests for plan limits (hitting maxMembers → 402)
- E2E test for onboarding flow (create club → admin dashboard)
- Test the webhook idempotency (same transactionId called twice)
- Coach isolation tests (can't see other gym's roster)

### Phase 12 — Production Readiness
- Audit /10 on: architecture, security, DB, multi-tenancy, performance, UI/UX, code quality
- .env.example with all required vars documented
- Vercel deployment config (vercel.json exists, verify wildcard domain setup)
- Seed script for demo data (2 gyms, plans, members, sessions)
- Health endpoint (/api/health) returning DB + Redis status
- Error monitoring (Sentry or similar)
- Logging strategy (structured logs, no PII)

## Key Files to Know
- prisma/schema.prisma        — full schema, 782 lines
- lib/auth.ts                 — all requireX() guards + JWT
- lib/tenant.ts               — subdomain → clubId resolution
- lib/plan-limits.ts          — SaaS limit enforcement service
- proxy.ts                    — Next.js 16 edge proxy (auth guard + slug injection)
- lib/permissions.ts          — granular RBAC permission matrix
- lib/rate-limit.ts           — Upstash Redis rate limiter
- lib/notify.ts               — in-app + SSE notifications
- lib/session-date.ts         — day-of-week ↔ Date conversion utilities
- lib/validation.ts           — shared Zod schemas
- prisma/seed.ts              — seeds SaasPlan rows (STARTER/PRO/BUSINESS)

## Known Issues / Tech Debt
1. Prisma binary blocked in sandbox → use real env for `prisma generate + migrate`
2. /user/onboarding/page.tsx (Google OAuth phone step) and /onboarding/page.tsx (new gym wizard) coexist — the old one should be deprecated or merged
3. lib/auth-server.ts may be a duplicate of lib/auth.ts — audit and remove
4. app/login/page.tsx duplicates app/user/login/page.tsx — consolidate
5. coaching/page.tsx and activites/* are static marketing pages — not yet connected to DB content
6. SUPER_ADMIN /platform route tree doesn't exist yet (proxy guards it but no pages)
7. SSE (/api/sse) uses in-memory Map — won't work across multiple server instances; needs Redis pub/sub

## Environment Variables Required
DATABASE_URL, DIRECT_URL, JWT_SECRET, APP_URL, NEXT_PUBLIC_APP_URL,
UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI,
KONNECT_API_KEY, KONNECT_BASE_URL, KONNECT_WALLET_ID,
RESEND_API_KEY, RESEND_FROM, TEXTBEE_API_KEY, TEXTBEE_DEVICE_ID,
CRON_SECRET, DEV_DEFAULT_CLUB_SLUG (dev only)

## 2026-10-10 update (see ../CHANGES_2026-10-10.md)
- Logout fixed (awaited server clear + hard redirect); horizontal PlanRowCard pricing everywhere; custom .glb/.gltf upload (ClubHeroModel table — run `prisma migrate deploy`); interactive 3D hero; 10 themes (luxury, neon, powerlifting, urban, minimalist added).
- Env: optional `HERO_MODEL_MAX_BYTES` (default 4 MB — Vercel's request body limit is 4.5 MB).
