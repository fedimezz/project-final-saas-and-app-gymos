# ClubX — deploy tonight (Vercel + Neon + Upstash)

Order matters. Budget ~2–3 h the first time. Do NOT skip step 0.

## 0. Before anything (10 min)
1. **Rotate every secret that was ever pasted in chat / committed** (Neon password, Stripe, Resend, Cloudinary, Upstash). Use the new ones below.
2. Replace placeholders: `clubx-mobile/eas.json` → `REPLACE-WITH-YOUR-APEX-DOMAIN` (3 places) with `https://yourdomain.com`.
3. Footer emails `hello@clubx.app` / `support@clubx.app` and the "Confidentialité / Conditions" links (`#`) in `components/landing/LandingFooter.tsx` → your real addresses and real pages. Stripe and the stores require a privacy policy URL.
4. Decide: **Vercel Pro** ($20/mo). Hobby forbids commercial use — you sell subscriptions, so use Pro.

## 1. Database — Neon (15 min)
1. Neon → project → branch `production`. Copy two URLs: **pooled** (`-pooler` in host) → `DATABASE_URL`; **direct** → `DIRECT_URL`. Both need `?sslmode=require`.
2. From your PC (PowerShell), in `saasssss-club-updated`:
   ```
   $env:DATABASE_URL="<direct url>"; $env:DIRECT_URL="<direct url>"
   npm ci
   npx prisma migrate deploy
   ```
   Must apply all migrations, last one = `20261015000000_trial_manual_payments_premium`. Take a Neon branch/backup first.
3. Seed plans + your super admin (once):
   ```
   $env:NODE_ENV="production"; $env:SUPER_ADMIN_EMAIL="you@domain.com"; $env:SUPER_ADMIN_PASSWORD="12+ chars"
   npx prisma db seed
   ```
   Check plans in `/platform/plans` after deploy: Starter 29 / Pro 79 / Business 199 USD (see PRICING_AND_REVENUE.md).

## 2. Upstash Redis (5 min)
Create a Redis DB (region near your Vercel region) → `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`. Not optional in production (rate limits + one-time login handoff break without it).

## 3. Email + uploads (15 min)
- **Resend**: add your domain, add the DNS records, wait for "Verified" → `RESEND_API_KEY`, `RESEND_FROM`. Signup is impossible without email (verification code).
- **Cloudinary**: `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` (profile photos, logos, gallery).

## 4. Vercel project (20 min)
1. Import the GitHub repo. **Root Directory = `saasssss-club-updated`** (the repo has two apps). Framework: Next.js. Build command stays `prisma generate && next build`.
2. Environment variables → copy everything from `.env.example` (Production). Generate `JWT_SECRET` (`openssl rand -base64 48`) and `CRON_SECRET` (`openssl rand -hex 32`). `APP_URL` = `NEXT_PUBLIC_APP_URL` = `https://yourdomain.com` (no `www`, no trailing slash).
3. Fill `MANUAL_PAYMENT_INSTRUCTIONS` with your RIB / D17 number / WhatsApp — Tunisian owners see this text after asking to pay.
4. Domains: add `yourdomain.com` **and** `*.yourdomain.com`. Wildcard needs Vercel nameservers (`ns1/ns2.vercel-dns.com`) at your registrar — or the `_acme-challenge` NS records (DEPLOYMENT.md §7). DNS can take up to a few hours: start this FIRST, before the rest.
5. Deploy. First deploy must go green (env validation runs at boot).

## 5. Stripe (optional tonight — manual payments cover Tunisia)
Stripe Dashboard → Developers → Webhooks → endpoint `https://yourdomain.com/api/payments/stripe/webhook`, events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` → copy signing secret to `STRIPE_WEBHOOK_SECRET`, redeploy. Your Stripe account must be in a country Stripe supports (as far as I know, Tunisia is not one — verify on stripe.com/global). Without Stripe, cards are off but trial + manual payments work.

## 6. Smoke test (20 min) — do all of it
1. `https://yourdomain.com` loads; footer → "Application mobile" → `/download` loads.
2. `/platform/login` with your super admin → open `/platform/plans`.
3. `/onboarding`: create a test club (pick Tunisia) → **no payment asked**, you land in the owner setup wizard. Check email code arrived.
4. `https://testclub.yourdomain.com` shows the club site; owner can log in there. Upload a logo.
5. Appearance: choose a Premium theme (Gold Elite) → must say "Premium 🔒". In `/platform` mark a test `PREMIUM_CUSTOMIZATION` service request COMPLETED → the theme unlocks.
6. `/admin/billing` as owner → pick a plan → manual payment form → submit. In `/platform/manual-payments` click **Confirmer** → club becomes ACTIVE, payment shows PAID.
7. Expired-trial path: in the Neon SQL editor run `update clubs set "trialEndsAt" = now() - interval '1 day' where slug = 'testclub';` then call `GET /api/cron/trial-check` with header `Authorization: Bearer <CRON_SECRET>` → club SUSPENDED → open `/reactivate`, log in with the owner email, file a manual request, confirm it → club works again.
8. Crons: Vercel → project → Cron Jobs shows 3 jobs (trial-check, subscription-renewal, session-reminders).
9. Delete the test clubs.

## 7. Mobile app (Android tonight, iPhone later)
```
cd clubx-mobile
npm install
npx eas login
npx eas build --platform android --profile apk
```
Download the `.apk` from the EAS link → create a GitHub Release (or any HTTPS storage) → set `NEXT_PUBLIC_ANDROID_APK_URL` (+ `..._VERSION`) in Vercel → redeploy. `/download` then shows the button.
Push notifications: set `EXPO_ACCESS_TOKEN` on Vercel and run one real device test.
**iPhone without the App Store**: nothing native works without an Apple Developer account ($99/yr). Free option = the site installed as an app: Safari → Share → "Add to Home Screen" (already explained on `/download`; manifest included). With the paid account: `eas build --platform ios --profile production` + TestFlight public link → `NEXT_PUBLIC_IOS_TESTFLIGHT_URL`.

## 8. Known risks to accept or fix this week
- Large uploads: Vercel serverless bodies ≈ 4.5 MB; phone photos are compressed (quality 0.7) so avatars pass, big gallery videos will not.
- `/reactivate` and manual payments are manual operations: you must watch `/platform/manual-payments` and the alert email.
- TND: plans are in USD; tell owners the TND amount in `MANUAL_PAYMENT_INSTRUCTIONS` (≈ 3 TND per USD — check the current rate) or add TND prices later.
- Trials without a card can be abused (many throwaway emails): rate limit + email verification are in place; watch `/platform/clubs`.
