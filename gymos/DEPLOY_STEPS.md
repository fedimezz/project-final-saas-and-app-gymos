# GymOS — deploy steps (do them in this order)

Folders: `saasssss-club-updated (1)` = website/SaaS (Next.js), `app_gymos-production (1)` = mobile app (Expo).
Copy the contents of each folder over your repo, review `git diff`, then commit yourself.

## A. Before anything
1. Node 22 (see `.nvmrc`). In the website folder: `npm ci`, `npx prisma generate`, `npx prisma validate`.
2. `npm test` and `npm run build` on YOUR machine — must be green. (Green here, but with Prisma 6 types because the sandbox could not download Prisma 5.22 engines — so this re-check matters.)
3. Create a STAGING database first. Never test migrations on production.

## B. Database
4. Set `DATABASE_URL` (pooled) and `DIRECT_URL` (direct) for staging.
5. `npx prisma migrate deploy` applies 2 new migrations:
   - `20261008000000_domain_service_requests` (3 tables + 3 enums)
   - `20261008000100_subscription_plan_index` (1 index)
6. Drift check: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <empty scratch db>` must report no difference. If it prints SQL, send it to me.
7. Production only after staging works, with a backup first. Rollback SQL is in DEPLOYMENT.md.

## C. Environment variables (names only; values go in your host dashboard, never in git)
Required: DATABASE_URL, DIRECT_URL, APP_URL, NEXT_PUBLIC_APP_URL, JWT_SECRET, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, RESEND_API_KEY, RESEND_FROM, CRON_SECRET,
SUPER_ADMIN_EMAIL + SUPER_ADMIN_PASSWORD (bootstrap only; remove once the first Super Admin exists).
Payments: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (plus your Konnect variables if you use it for TND).
Optional: GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI, TEXTBEE_*, SMS_*, SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN, COOKIE_DOMAIN.
Details: DEPLOYMENT.md sections 2–6; `.env.example` is the checklist.

## D. Website deploy
8. Deploy to a Vercel PREVIEW first (daily crons in `vercel.json`, 06:00 UTC).
9. DNS: wildcard `*.yourplatform.com` + apex to the host (DEPLOYMENT.md section 7).
10. Stripe TEST mode: webhook endpoint `/api/payments/stripe/webhook`; put its signing secret in STRIPE_WEBHOOK_SECRET.
11. Run DEPLOYMENT.md section 9 smoke test on the preview, then promote to production.

## E. First actions in the product
12. Log in at `/platform/login` as Super Admin.
13. Platform → Services & domaines → Tarifs: set a price per service (no price = cannot be ordered).
14. Create a test club via `/onboarding`, finish the wizard (logo + photos in "Accueil"), then check: logo on login/register/verify, browser tab icon, an invitation email.

## F. Mobile (Expo)
15. Mobile folder: `npm ci`, `npm test`, `npx tsc --noEmit`, `npm run lint` (all green here).
16. Create `.env.local` from `.env.example`: `EXPO_PUBLIC_PLATFORM_API_BASE_URL=https://<your production API>` (https required in production builds).
17. `eas build --profile preview --platform android` (and ios). On a real phone: register, verify, login, close/reopen (session restore), book a class, airplane-mode error state. Theme check: change the club theme on the website, put the app in the background, reopen it — colors should update within a minute (try Minimaliste in dark mode to see the contrast safety).
18. Only then `eas build --profile production` and store submission.

## G. Custom domain requests (manual by design)
Owner requests a domain → you approve → add the domain at your host → send DNS records in the request note → wait for DNS/SSL → set ACTIVE (this switches the domain on for the club).

## H. Do NOT launch publicly until
- staging migration + smoke test passed;
- a Stripe TEST checkout and webhook were exercised, and Konnect (TND) tested in its sandbox (Stripe cannot charge TND);
- large uploads tested on your host (serverless body limits are ~4.5 MB on Vercel; the 10 MB image / 100 MB video caps need direct-to-Cloudinary uploads or another host);
- the mobile app tested on real devices.
