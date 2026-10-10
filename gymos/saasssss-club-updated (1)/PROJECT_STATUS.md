# Le Club de Gammarth — SaaS Multi-Tenant — Project Status

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
