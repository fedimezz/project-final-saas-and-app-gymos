# Phases 1–4 — security, correctness, and cleanup

## Provider switch — Resend + TextBee

- Replaced disabled Brevo mail handling with Resend's `POST /emails` API. Configure `RESEND_API_KEY` and `RESEND_FROM`; production startup requires both.
- Replaced Twilio REST SMS with TextBee `POST /api/v1/gateway/send-sms` using `TEXTBEE_API_KEY`; `TEXTBEE_DEVICE_ID` is optional and selects a paired Android device. The default TextBee device is used when omitted.
- Registration now generates a random six-digit code, stores only its hash, sends it via Resend, and no longer logs codes or accepts the old fixed `123456` bypass.
- Credentials pasted into chat were not written to source, `.env`, or this file. Rotate both keys and set fresh values in the secret store.

Verified in a sandbox (no live DB, no real Konnect/Google/Twilio/Cloudinary credentials): `tsc --noEmit` clean · Vitest **254/254** (was 124) · ESLint **0 errors, 52 warnings** (was 96) · `next build` passes.

## DEPLOY ORDER (important)
1. **Run the migration first**: `prisma/migrations/20260921000000_password_changed_at` (`prisma migrate deploy`). The auth layer now selects `User.passwordChangedAt` on every request; deploying the code before the column exists = every authenticated request 500s.
2. Deploy the code.
3. Env changes (all optional, all safe defaults):
   - `ENABLE_MANUAL_PLAN_SWITCH=true` — only if you want `/api/billing/upgrade` to work in production (it charges nothing). Default: blocked in prod.
   - `SMS_VERIFICATION_ENABLED=true` — registration SMS is now OFF by default. `SMS_ALLOWED_COUNTRY_CODES` defaults to `+216`.
   - `APP_URL` must be the bare platform apex (used to build club links).

## What changed, per finding
| # | Finding | Fix |
|---|---|---|
| 1 | Cross-tenant IDOR on `DELETE plan/[id]`; PATCH activate deactivated before checking | Every lookup/write scoped by `clubId`; activate verifies target first, then swaps in one transaction |
| 2 | `/api/auth/bridge` open redirect, session-token re-minting, not single-use, login-CSRF, token logged | New purpose-bound 2-min bridge token (`purpose:"bridge"`, `jti`, nonce); single-use via `lib/one-time.ts` (Upstash `SET NX`); must be redeemed on the club it was minted for; nonce cookie binds it to the creating browser (production); `safeRedirectPath()`; `console.log` removed; `Cache-Control: no-store` |
| 3 | Free paid-plan upgrade | Refused in production unless `ENABLE_MANUAL_PLAN_SWITCH=true` |
| 4 | Reserved slugs bypassed | `create-club` and `check-slug` both use `lib/slug.ts` |
| 5 | Sessions survive password change/reset; reset link on apex; webhook redirect on apex | `User.passwordChangedAt` + JWT `iat` check (401); change-password re-issues the current session; reset link and Konnect return URL built from the club's own host (`lib/tenant-url.ts`); reset email sent via `after()` (no timing leak) |
| 6 | Logout doesn't clear cookie; SUPER_ADMIN cookie shared to all subdomains | `lib/auth-cookie.ts`: one definition of cookie attributes; logout/proxy/account-delete expire every variant; SUPER_ADMIN cookie is host-only |
| 7 | CSRF trusts every subdomain, rejects custom domains | Same-origin rule (Origin host == request host) + `Sec-Fetch-Site` fallback |
| 8 | Login enumeration / timing / IP-only limit / non-deterministic owner portal | One generic message for every credential failure; dummy bcrypt compare; per-email throttle; owner portal orders deterministically and returns 409 + club list if the same password matches several clubs |
| 9 | Konnect webhook | Shape-check ref → DB lookup **before** calling Konnect → compare amount + orderId with our record → atomic PENDING→PAID claim; ref `encodeURIComponent`'d; 10 s timeout; rate-limited |
| 10 | `/api/upload` | Members: images only, ≤5 MB; staff keep 10/25/100 MB; per-user hourly limit; Content-Length pre-check; image magic-byte check; per-club Cloudinary folder `clubs/<clubId>`; 60 s timeout |
| 11 | Write rate-limit skipped upload/posts/billing/bookings | Proxy now limits **all** non-GET `/api/*` outside auth/cron (per user id, else per IP) |
| 12 | OTP + phone logged in production; SMS pumping | Nothing logged in prod; SMS off by default; when on: per-phone (3/h) + per-club (300/day) limits, E.164 normalisation, country allow-list |
| 13 | Double-subscribe race; promo leak | Per-user `pg_advisory_xact_lock` inside the transaction; promo use released if the gateway fails |
| 14 | Fire-and-forget | `runAfter()` (`after()` with safe fallback) for audit logs / notifications / emails |

Also fixed while in there (found by the new tests):
- **Checkout with a promo code always returned 500**: `payment.create` was passed a `promotionId` field that doesn't exist on `Payment`.
- **Custom domains with 3+ labels** (`app.mygym.tn`) were parsed as tenant slug `app` and never reached the custom-domain lookup.
- Tenant cache is now bounded (500 entries, oldest-first eviction, shorter TTL for misses), rejects non-DNS-label hosts, and never queries the DB for the platform apex/www.
- SMS text uses the club's name instead of "Le Club de Gammarth" (`sessionReminderSms` default is "GymOS" until the cron passes the club name — Phase 2).

## What changed, Phases 2–4
| Area | Fix |
|---|---|
| Google OAuth | Was **silently broken**: the flow starts on a club's subdomain, but Google's fixed `redirect_uri` always lands on the apex, and the old code tried to resolve the tenant from that apex Host header — so `resolveTenantFromRequest` returned null and every sign-in failed. Now the club id rides through in a signed `state` param plus a platform-wide (`Domain=.<apex>`) cookie set by `/api/auth/google` and read by the callback; session cookie and final redirect both land on the club's own host |
| Env validation | `lib/env.ts` + `instrumentation.ts`: required vars (`DATABASE_URL`, `JWT_SECRET` ≥32 chars, valid `APP_URL`) throw at boot instead of failing on the first request that touches them; missing optional vars (Brevo/Twilio/Cloudinary/Konnect/Google/Redis) log a warning, not fatal |
| Outbound timeouts | Brevo (`lib/email.ts`) now goes through `fetchWithTimeout` — Konnect, Twilio, Google and Cloudinary already had it from Phase 1 |
| Cron: session reminders | Notifications batched via `createMany` (was one write per booking); SMS sent with a concurrency cap instead of fully sequential; user query now selects only `id/phone/preferences` (was loading full rows, password hash included); SMS branded with the actual club name (was hardcoded) |
| Cron emails | Club/owner names HTML-escaped before interpolation into `<p>`/`<strong>` (was raw injection) |
| Password minimum | 6 → 8 characters |
| `maxAdmins` plan-limit bypass | `countAdmins()` now counts `OWNER` as well as `ADMIN` — a club could add unlimited staff by creating them as `OWNER` instead, since only `ADMIN` was counted |
| Staff audit logging | Create/update/promote/delete on `/api/admin/staff` now call `logAction` (none did before) |
| `broadcastToAll` | Removed — zero callers, and it was a live cross-tenant footgun (pushes to every connected client on the platform, any club) |
| `.env.example` | `KONNECT_BASE_URL` now includes `/api/v2`, matching the code's own default |
| Email "from" default | `no-reply@le-club-de-gammarth.com` → `no-reply@gymos.app` (was hardcoding the first tenant's own domain for every club) |
| SEO / hygiene | `poweredByHeader: false`; `app/robots.ts`, `app/sitemap.ts`, `app/not-found.tsx`; route-level `app/error.tsx` (alongside the existing `global-error.tsx`); `/api/settings/public` now sends `Cache-Control: public, max-age=30, stale-while-revalidate=300` (was fetched uncached on every page load) |
| Bundle size | `three` + `GLTFLoader` (~600KB) split out of `HeroSection.tsx` into `HeroDumbbellScene.tsx`, loaded via `next/dynamic(..., { ssr: false })` — only fetched for clubs with no hero photo configured, and never during SSR. Verified as its own chunk in the production build, separate from the main bundle |
| Dead dependencies | Removed 18 packages with zero imports anywhere in the app: `@getbrevo/brevo`, `@hookform/resolvers`, six `@radix-ui/*` primitives, `@react-three/drei`, `@react-three/fiber`, `@tanstack/react-query`, `axios`, `date-fns`, `nodemailer`, `qrcode`, `react-day-picker`, `react-dropzone`, `react-hook-form`, `react-qr-code`. Kept `react-dom`, `sharp` and `prisma` (the CLI) despite no direct source import — all three are genuine runtime/build dependencies. Added `@types/three` explicitly (was only present transitively via the now-removed `@react-three/*` packages) |
| Dead file | Deleted `components/settings/Card.tsx` — 10 lines, no export, zero importers anywhere |
| `<img>` → `next/image` | Converted all 5 remaining raw `<img>` tags (`HeroSection`, `app/coaching/page.tsx` ×3, `CoachesSection`, `ProfileAvatar`) to `next/image`. `ProfileAvatar`'s avatar can be a raw `data:` URL (the Cloudinary-not-configured fallback), so that one path is `unoptimized` explicitly rather than assumed safe |
| Lint warnings | 96 → 52: removed unused imports/vars across ~19 files, deleted the dead `Card.tsx`, and replaced two files' duplicated local dark-mode-detection (localStorage read + `MutationObserver`) with the existing shared `useTheme()` context — real duplication, not just a warning suppression. The remaining 52 are all `react-hooks/set-state-in-effect`, a newer/stricter lint rule; see "Not done yet" below |
| Tenant-scoping review | Completed the routes the Phase-1 pass left unchecked (`dashboard/*`, `platform/*`, posts/comments/likes, `admin/analytics`, `admin/reports`). No further IDORs found — `dashboard/notifications/[id]*` looked suspicious at a glance (`findUnique({ where: { id } })` with no `clubId` in the query) but is safe: it checks `notification.userId === auth.user.id` before any mutation, which is a stricter check than club-scoping since a user id can't cross clubs. `platform/*` writes are correctly gated behind `requireSuperAdmin` |

## Things to check on staging (not verifiable without your DB / Konnect / browser)
- **Konnect amount unit**: the webhook compares `details.amount` to `payment.amount * 1000` (millimes, matching what `initKonnectPayment` sends). Do one sandbox payment; if Konnect reports a different unit, legitimate payments will land on `?payment=error`.
- **Bridge nonce cookie** needs a cookie shared apex → `{slug}.apex` (same requirement the owner-portal login already has). If onboarding lands on `/platform/login?expired=1`, check `COOKIE_DOMAIN`.
- **Google OAuth** needs `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` set and the apex callback URL registered in Google Cloud Console. Do one real sign-in on a club subdomain — the fix here was structural (state/cookie plumbing) and passes 6 new tests, but couldn't be exercised against real Google endpoints.
- **CSRF** assumes the `Host` (or `x-forwarded-host`) your platform forwards equals the browser's origin host. True on Vercel.
- Existing sessions stay valid until each user's next password change (no backfill).

## Not done yet
- The 52 remaining `set-state-in-effect` lint warnings. These are spread across 40 files with genuinely different effect patterns (fetch-on-mount, filter-change refetch, conditional loading). Rewriting them safely needs per-file behavioral judgment I can't verify without a browser, so I left them rather than risk a subtle re-render bug for a cosmetic warning. `tsc`/tests/build are all clean regardless.
- The Google OAuth callback's `redirect_uri` (token exchange only) still points at the platform apex — required, since that's the single URL registered with Google; not a bug.

## New files
`lib/{auth-cookie,redirect,after,http,one-time,tenant-url,bridge-nonce,env}.ts`, `instrumentation.ts`, `app/{error,not-found,robots,sitemap}.tsx?`, `components/home/HeroDumbbellScene.tsx`. Tests under `lib/__tests__/` and `app/api/__tests__/`.

## New: owner setup checklist
Added a "getting started" checklist on `/admin` for a new club: branding,
membership plans, coaches, and first weekly schedule, plus an optional
payments step. Each step's "done" state is computed live from real data
(`GET /api/admin/setup-status`) rather than a stored progress flag, so it
can't drift from what the owner actually did and works no matter what order
they complete things in. Dismissible (stored in `localStorage`, not the
database — it's a per-browser UI preference, not business data). No schema
change, no migration.

New files: `app/api/admin/setup-status/route.ts`,
`components/admin/SetupChecklist.tsx`. Tests in
`app/api/__tests__/setup-status.test.ts`.

## New: mobile-app backend support
Two additions so a native mobile client can talk to this backend — the web
app and its cookie-based session are unchanged, byte-for-byte:

- **`GET /api/clubs/search?q=`** — public, rate-limited. Lets a mobile app
  (which has no subdomain/Host context the way a browser does) resolve a
  club name to that club's own API host before any login happens. Never
  surfaces `SUSPENDED`/`CANCELLED` clubs.
- **`POST /api/auth/login`** now returns the raw JWT in the response body,
  but *only* when the request carries `x-client-type: mobile-app`. The web
  client never sends that header, so its response is unchanged — this
  matters because unconditionally returning the token would hand any XSS on
  the web app a way to read it straight out of JSON, defeating the point of
  the httpOnly cookie. `/api/auth/session` already accepted a Bearer token
  via `Authorization` (turned out to already exist in `lib/auth.ts`, no
  change needed there) — so login + session together are enough for a
  mobile app to authenticate, restore state on launch, and call every other
  existing endpoint (`requireUser`/`requireAdmin`/etc. already accept a
  Bearer token as well as a cookie).

Tests: `app/api/__tests__/clubs-search.test.ts`, and three new cases in
`app/api/__tests__/login-hardening.test.ts` under "mobile client".

A separate Expo/React Native project (`gymos-mobile`) proves this end-to-end
— club search → login → session restore → logout — delivered separately.
Scope was deliberately stopped there (no member/coach feature screens yet)
pending a flow/design conversation.
