# GymOS (`fedimezz/saasssss-club`) — Production Review

> **Superseded in part**: see `CHANGES.md` for a later pass (security/IDOR fixes, Phases 2–4 cleanup, dependency pruning). Sections 4.1 and 4.5 below are resolved; the rest of this document still reflects its original review date.

Reviewed: `main` @ 4 commits (cloned 2026-09-18). Method: full clone, `npm ci`, lint, unit tests, static review of the auth / tenancy / payments / cron / config paths, `npm audit`.

## 0. Verification status (read this first)

| Check | Result |
|---|---|
| `npm ci` | ✅ 629 packages |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| ESLint | ✅ 0 errors (96 warnings — mostly `react-hooks/set-state-in-effect`) |
| Vitest | ✅ 117/117 before my changes → **124/124 after** |
| `prisma generate` / `tsc` / `next build` | ⚠️ **NOT run** — Prisma's engine download (binaries.prisma.sh) is blocked in my sandbox. Your CI `build` job (real Postgres + `migrate deploy` + `next build`) and `npm run typecheck` are the proof. |
| Live end-to-end (login, payments, Konnect webhook) | ⚠️ **NOT run** — findings below come from reading the code, not from exercising it. |

Note: the GitHub `main` has **117** tests. If your local copy has more, it is not pushed.

## 1. Verdict

Architecture is sound for a v1 multi-tenant SaaS: every API route (except an intentional public list) goes through `requireX()`, which re-reads role / `isActive` / `clubId` from the DB instead of trusting the JWT; Konnect webhook is idempotent and re-verifies amount/status server-side; CSRF and write rate-limit are centralised in `proxy.ts`; migrations are tracked and CI applies them to a real Postgres.

It was **not** ready to hand to real customers because of: a fail-open cron guard, a rate limiter that 500'd every auth route without Redis, no way to seed production safely, a setup path that didn't work on a fresh clone, and Google sign-in that can't work on tenant subdomains. The first four are fixed in this pass; the last one needs a design decision (section 4).

## 2. Fixed in this pass

| # | Severity | Problem | Fix |
|---|---|---|---|
| 1 | **High** | `/api/cron/*` compared `Bearer ${process.env.CRON_SECRET}`. If `CRON_SECRET` was unset the expected value was the literal `Bearer undefined` → anyone could trigger trial-suspension / renewals. | New `lib/cron-auth.ts`: fails closed when secret missing/<16 chars, constant-time compare. Wired into all 3 cron routes. +4 tests. |
| 2 | **High** | `lib/rate-limit.ts` called `Redis.fromEnv()` with no credentials → every `checkRateLimit()` threw → `/api/auth/login`, register, onboarding returned 500 on any install without Upstash. Also the proxy write limiter "failed open" on any Redis error. | Upstash when configured; per-process in-memory fallback when not configured **or** when Upstash errors (still throttles). +3 tests. |
| 3 | **High** | `prisma db seed` was not configured (`package.json` had no `prisma.seed`, `tsx` not installed) — README's step 5 failed. And the seed always created a SUPER_ADMIN with password `Demo123!` plus demo clubs, with no way to seed *only* the SaaS plans that onboarding requires. | Added `prisma.seed` + `tsx`. In production mode (`NODE_ENV=production` / `SEED_PLANS_ONLY=1`) the seed creates plans only, and a SUPER_ADMIN only from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` (12+ chars). Never demo accounts. |
| 4 | **High** | Fresh-clone setup broken: README said `.env.local` (Prisma CLI only reads `.env`), `DEV_DEFAULT_CLUB_SLUG=demo` (seed creates `club-a`/`club-b`), and setting that variable makes the super-admin login impossible on plain localhost. | `scripts/fresh-start.sh`, `docker-compose.yml`, corrected README/`.env.example`. Dev routing: `club-a.localhost:3000` / `club-b.localhost:3000` / `localhost:3000` (platform). |
| 5 | Medium | `build` didn't run `prisma generate` (stale-client failures on Vercel's cached installs). | `postinstall` + `build` now run `prisma generate`. Added `typecheck`, `validate`, `db:*` scripts, `engines`, `.nvmrc`. CI now also runs typecheck. |
| 6 | Medium | `lib/email.ts` printed the full HTML body (verification links, OTPs, reset tokens) to logs when `BREVO_API_KEY` was missing — in production too. | Body only logged in dev; in prod logs an error line without the body. |
| 7 | Medium | `JWT_SECRET` length (documented as ≥32) never enforced. | Enforced in production inside `getJwtSecret()`. |
| 8 | Low | CSRF check trusted `Origin: localhost` in production. | `localhost` / `*.localhost` only outside production. |
| 9 | Low | Docs drift: cron routes are `GET` (README said `POST`; Vercel Cron uses GET so the code is right), Google callback path was wrong, `SMTP_URL` documented but the code uses Brevo's REST API (`BREVO_API_KEY` undocumented), `SameSite=Strict` claimed but code uses `Lax`, "Sentry ✅" but not wired, SSE "in-memory" tech-debt already resolved. | README + `.env.example` corrected. |

## 3. Things that are good (keep)

- DB-verified auth on every request (`getVerifiedAccount`), `clubId` never taken from the client, `@@unique([clubId, email])`, composite indexes.
- Konnect webhook: idempotent, server-side re-verification (`getKonnectPaymentDetails`), `clubId` from the payment row.
- Atomic onboarding transaction; cookie is `httpOnly`, host-scoped by default (safe for multi-tenant).
- Tracked migrations + CI that runs `migrate deploy` against Postgres 16 (catches schema drift).
- Structured logger with PII redaction; global error boundary; health endpoint.
- `npm audit`: 0 known vulnerabilities in production dependencies.

## 4. Open issues (not fixed — ordered by priority)

### 4.1 Google OAuth on subdomains — RESOLVED (see CHANGES.md)
Implemented option (b) from the original note: `/api/auth/google` folds the club id into a signed `state` param and sets a platform-wide (`Domain=.<apex>`) cookie instead of a subdomain-scoped one. The apex callback resolves the tenant from `state`, not the Host header, then sets the session cookie and redirects back to the club's own origin. Covered by `app/api/__tests__/google-oauth.test.ts`.

### 4.2 Sentry is not wired — Medium
`sentry.{client,server,edge}.config.ts` are 10-byte `export {};` stubs and `@sentry/nextjs` isn't a dependency. Today production errors go only to Vercel logs. If you add Sentry, extend the CSP `connect-src` (currently `'self' blob: data:`).

### 4.3 Email delivery — Medium
Historical note: the original review referred to Brevo. Current email delivery uses Resend (`RESEND_API_KEY`, verified `RESEND_FROM`) and SMS uses TextBee (`TEXTBEE_API_KEY`).

### 4.4 Tests mock Prisma everywhere — Medium
14 test files for 88 API routes; the "tenant isolation" suite proves the guards call `where: { clubId }` against a mock, not against real data. CI already has a Postgres service — add a small integration suite (seed two clubs, assert club A's token gets 403/empty on club B's ids) for bookings, payments, members, notifications.

### 4.5 Password policy — RESOLVED
`passwordSchema` raised to `min(8)` (see CHANGES.md). A common-password blocklist is still not implemented.

### 4.6 Smaller items
- `/api/onboarding/check-slug` has no rate limit (slug enumeration / cheap DB hits).
- CSP allows `script-src 'unsafe-inline'` (needed by the two theme/lang init scripts). Move to nonces when you can.
- Two JWT libraries (`jsonwebtoken` in `lib/auth.ts`, `jose` in `proxy.ts`) — consolidate on `jose`.
- `lib/auth-server.ts` still has 7 importers alongside `lib/auth.ts` (listed in your own tech debt).
- Duplicate login/onboarding pages (`/login` vs `/user/login`, `/onboarding` vs `/user/onboarding`) — also in your tech debt.
- `.idea/` and `auth-test.js` are committed. Untrack: `git rm -r --cached .idea && git rm auth-test.js` (`.idea/` is now in `.gitignore`).
- No `app/not-found.tsx`, `robots.ts`, `sitemap.ts` (default English 404 for a French-first product; no SEO basics for the marketing site).
- `three` + `@react-three/*` are used only in `components/home/HeroSection.tsx` — make sure it's `next/dynamic` with `ssr: false` so it doesn't hit the LCP of the landing page.
- README counts (108 pages, 72 routes) no longer match the tree (58 `page.tsx`, 88 `route.ts`).
- `eslint-config-next` is pinned to 16.2.9 while `next` is `^16.3.0`.
- Cron: `subscription-renewal` and `trial-check` both run at 06:00 — fine, but make sure each is idempotent if Vercel retries.

## 5. Production deploy checklist (Vercel + managed Postgres)

1. Env vars: `DATABASE_URL` (pooled), `DIRECT_URL` (non-pooled), `APP_URL`, `NEXT_PUBLIC_APP_URL`, `JWT_SECRET` (`openssl rand -base64 48`), `CRON_SECRET` (`openssl rand -hex 32`), `UPSTASH_REDIS_REST_URL/_TOKEN`, `BREVO_API_KEY`, `SMTP_FROM`, `CLOUDINARY_*`, `KONNECT_*`. Leave `COOKIE_DOMAIN` and `DEV_DEFAULT_CLUB_SLUG` **unset**.
2. From your machine or CI (not in the Vercel build):
   ```bash
   export DATABASE_URL="…" DIRECT_URL="…"
   npx prisma migrate deploy
   NODE_ENV=production SUPER_ADMIN_EMAIL="you@yourdomain.com" SUPER_ADMIN_PASSWORD="long-unique-password" npx prisma db seed
   ```
3. Domain: apex + wildcard `*.yourdomain.com` on the Vercel project; DNS `CNAME *` → `cname.vercel-dns.com`.
4. Deploy: `vercel --prod`. Then: `GET /api/health` → `ok`; create a club via `/onboarding`; open its subdomain; run one Konnect **sandbox** payment; check the first Vercel Cron run (Authorization header = `CRON_SECRET`).
5. Konnect: point the webhook to `https://<apex>/api/payments/konnect/webhook` and confirm it works for a payment started on a tenant subdomain.
6. Rotate any secret that ever lived in a committed file or a shared chat.

## 6. Suggested order of work

1. Merge this pass, push, confirm CI is green (typecheck + build are the checks I couldn't run).
2. Decide on Google OAuth (4.1) — hide or fix.
3. Wire Sentry (4.2) and set `BREVO_API_KEY` (4.3).
4. Real-DB integration tests for tenant isolation (4.4).
5. Password policy, `check-slug` rate limit, cleanup items (4.5, 4.6).
