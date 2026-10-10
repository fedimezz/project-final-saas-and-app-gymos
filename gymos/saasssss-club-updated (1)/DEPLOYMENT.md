# GymOS — Deployment Runbook

Target: Vercel (this repo's `vercel.json` already defines the wildcard-subdomain
rewrite, security headers, and the three cron schedules). If you deploy
somewhere else, the crons, subdomain rewrite, and Edge-runtime proxy need
their own equivalent.

Do the steps in this file in order. Each one names the thing that breaks if
you skip it.

---

## 1. Database

1. Provision Postgres (Vercel Postgres, Neon, Supabase, RDS — anything).
2. Set `DATABASE_URL` (pooled, used at runtime) and `DIRECT_URL` (direct
   connection, used only for migrations — same DB, bypass any pooler like
   PgBouncer).
3. **Run the migration before deploying any code:**
   ```
   npx prisma migrate deploy
   ```
   The most recent migration (`20261008000000_domain_service_requests`) creates
   the custom-domain request, service request and service price tables — they
   existed in `schema.prisma` before but had no migration. It is purely
   additive (new enums + tables). **Rollback:** `DROP TABLE domain_requests,
   service_requests, service_prices;` then drop the three enums
   (`DomainRequestStatus`, `ServiceRequestType`, `ServiceRequestStatus`), and
   `DELETE FROM "_prisma_migrations" WHERE migration_name =
   '20261008000000_domain_service_requests';`. Take a DB backup first. Earlier
   note: the previous migration adds the one-time onboarding email-verification
   challenge table. Deploy every pending migration before deploying the code.

## 2. Required environment variables

The app throws at boot (`instrumentation.ts` → `lib/env.ts`) if any of these
are missing or malformed — fails the deploy health check instead of failing
silently on the first real request:

| Var | Requirement |
|---|---|
| `DATABASE_URL` | set |
| `JWT_SECRET` | ≥32 chars — `openssl rand -base64 48` |
| `APP_URL` | valid absolute URL, bare apex, no trailing slash |

Set `NEXT_PUBLIC_APP_URL` to the same value as `APP_URL` — several routes
read one or the other.

## 3. Upstash Redis — required in production, not optional

`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. Without it:
- Rate limiting (`lib/rate-limit.ts`) falls back to per-process memory —
  broken across serverless instances, since consecutive requests can land on
  different lambdas with no shared state.
- The bridge-token single-use check (`lib/one-time.ts`, used by the
  onboarding → subdomain handoff) has the same problem.

Not fatal to boot, but functionally required for anything beyond a demo.

## 4. Third-party services

Each of these degrades gracefully if unset (logs a warning, feature no-ops)
— but decide deliberately, don't just leave them out:

- **Stripe** (international payments): configure server-only
  `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, then register
  `https://<APP_URL>/api/payments/stripe/webhook` for
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, and `checkout.session.expired`.
  This webhook verifies both member payments and SaaS signup payments.
  Paid SaaS signups stay suspended until Stripe confirms settlement; Tunisia
  paid signups are directed to support. Tunisian members continue to pay onsite.
  Membership offer Stripe currencies are USD, EUR, GBP, CAD, and CHF; TND is
  displayable and available for onsite payments only.
- **Google OAuth** (optional): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_REDIRECT_URI` = `https://<APP_URL>/api/auth/callback/google`,
  registered *exactly* in Google Cloud Console (this is the one fixed URL
  every club subdomain's sign-in flow routes through — see
  `app/api/auth/google/route.ts`). Do one real sign-in from a club
  subdomain after deploy.
- **Cloudinary** (uploads): `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
  `CLOUDINARY_API_SECRET`.
- **Resend** (transactional email): `RESEND_API_KEY`, `RESEND_FROM` (a sender
  address on a verified domain). Both are required at production startup because
  account verification, onboarding email verification, password-reset codes,
  invitations, and reminders use email.
- **TextBee** (SMS): `TEXTBEE_API_KEY`; optionally set `TEXTBEE_DEVICE_ID` to
  choose a paired Android device (otherwise TextBee uses the default enabled
  device). The phone must remain online with SMS permission and an active SIM.
  SMS verification is opt-in with `SMS_VERIFICATION_ENABLED=true`; when enabled,
  production startup also requires the API key. `SMS_ALLOWED_COUNTRY_CODES`
  defaults to `+216`.

Create the Resend key and verify `RESEND_FROM`'s domain in Resend before
deploying. TextBee needs an Android device paired in its dashboard and kept
online; a successful API response means the SMS was queued, not delivered.
Rotate any provider key that has been pasted into chat, tickets, or source
control, and enter its replacement only in a secret manager.

## 5. Cron auth

`CRON_SECRET` — 16+ chars, `openssl rand -hex 32`. Vercel Cron sends
`Authorization: Bearer <CRON_SECRET>` automatically once this env var is set
and the crons in `vercel.json` are picked up on deploy; nothing else to
configure. Unset or under 16 chars = every `/api/cron/*` call is rejected
(fails closed by design — see `lib/cron-auth.ts`).

## 6. Optional flags

- `ENABLE_MANUAL_PLAN_SWITCH=true` — only if `/api/billing/upgrade` should
  work in production as-is (it changes the plan, charges nothing). Leave
  unset until that's actually wired to a payment step.
- `COOKIE_DOMAIN` — leave unset. Only set this if you deliberately want one
  session cookie shared across every subdomain; the default (host-scoped per
  club) is the safer multi-tenant behavior.

## 7. DNS

Vercel needs a wildcard TLS cert for `*.yourdomain.com`, which requires
DNS-01 verification — a plain wildcard CNAME alone isn't sufficient.

**Path A — point the domain's nameservers at Vercel (default choice):**
1. Vercel dashboard → project → Settings → Domains → add `yourdomain.com`
   and `*.yourdomain.com`.
2. At your registrar, set nameservers to `ns1.vercel-dns.com` /
   `ns2.vercel-dns.com`.
3. Vercel issues the wildcard cert and handles everything after that.

**Path B — keep your current DNS provider:**
1. Add both domains in Vercel as above.
2. On the apex domain's page in Vercel, click **Enable Vercel DNS**.
3. At your DNS provider, add:

   | Type | Name | Value |
   |---|---|---|
   | NS | `_acme-challenge` | `ns1.vercel-dns.com.` |
   | NS | `_acme-challenge` | `ns2.vercel-dns.com.` |

4. Then the actual routing records, also at your provider:

   | Type | Name | Value |
   |---|---|---|
   | A | `@` | `76.76.21.21` |
   | CNAME | `*` | `cname.vercel-dns.com` |

Either path: apex serves the platform landing page, every
`clubname.yourdomain.com` resolves automatically — no per-club DNS work.

**Per-club custom domains** (`Club.customDomain` in the schema): each one
needs its own CNAME, at *that club's* DNS, pointing to `cname.vercel-dns.com`,
and needs adding as a domain on this Vercel project (dashboard, or Vercel's
Domains API for self-serve).

## 8. Platform bootstrap

Set `SUPER_ADMIN_EMAIL` + `SUPER_ADMIN_PASSWORD` (12+ chars), then:
```
NODE_ENV=production npx prisma db seed
```
Seeds the SaaS plan catalog and your platform super-admin only — never the
demo clubs/accounts.

## 9. Post-deploy smoke test

- [ ] Log in as the platform super-admin (apex host)
- [ ] Onboard one test club end-to-end — confirm it lands on
      `{slug}.yourdomain.com`, not stuck on the apex
- [ ] Real Google sign-in from that club's subdomain
- [ ] Stripe test Checkout from a non-Tunisian country; verify the signed
      webhook marks the payment paid and activates the subscription
- [ ] Log out — confirm the session cookie is actually gone (check dev tools,
      not just the redirect)
- [ ] Trigger each cron route manually once
      (`curl -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/trial-check`)
      to confirm the secret and DB access work before the schedule fires
- [ ] Upload a club logo/avatar — confirms Cloudinary credentials
- [ ] Trigger a password reset — confirms Resend credentials and that the
      email lands on the club's own domain, not the apex

## Custom domains & paid services — what is and isn't automated

- Prices live ONLY in the `service_prices` table (Platform → *Services &
  domaines* → *Tarifs*). A service with no active price cannot be ordered.
  Every request stores the price/currency at creation time.
- Nothing is charged by these requests: payment for services is arranged
  manually. Do not describe this as an automated checkout.
- Custom domains are a **manual** workflow. After approving a request the
  platform operator must (1) add the domain in the hosting provider, (2) give
  the owner the DNS records (note field on the request), (3) wait for DNS/SSL,
  and only then move the request to `ACTIVE`, which sets `Club.customDomain`
  (read by tenant routing). Moving it away from `ACTIVE` clears it again.
- Standard addresses remain `club-slug.<platform domain>`.

## Payments — limits

- Stripe cannot charge TND. TND memberships/plans must use the Konnect flow;
  verify it with Konnect's sandbox before launch. No payment provider has been
  exercised against real money from this repository's tests.
- Uploads: the 10 MB image / 100 MB video caps in `/api/upload` exceed the
  request-body limit of many serverless hosts (Vercel functions: ~4.5 MB).
  Verify large uploads on your actual host or move them to direct-to-Cloudinary
  signed uploads.

## Known gaps (see `CHANGES.md` for the full list)

- Error monitoring (Sentry) is stubbed, not wired — production errors only
  reach your hosting platform's logs today.
- 52 lint warnings (`react-hooks/set-state-in-effect`), all non-blocking —
  build/types/tests are unaffected.
