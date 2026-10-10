# GymOS — final report

## Website
- Domain / paid-service / pricing finished: migration added; owner + Super Admin routes rewritten (validated, price+currency snapshot, no hardcoded price, 503 when no price, status workflow, ACTIVE sets club.customDomain atomically); owner page /admin/services; Super Admin page /platform/service-requests (domains, services, prices).
- Logo: single source GymSettings.logoUrl, always filtered through lib/image-url.ts. Shown on login, register, verify, navbar/footer/admin, favicon + social preview (new), invitation email (new). Replaced/invalid/deleted logos handled.
- Home photos: new "Accueil" fields (introImage, homeGallery) in separate areas beside/below the hero; the 3D dumbbell is untouched and not configurable. Falls back to Gallery-page photos; hidden when empty.
- Wizard: tiers Requis / Recommandé / Facultatif / Payant, skippable optional steps, new "Options & services" step.
- Uploads: staff video/audio restored (news admin offers it); members image-only.
- Existing product rule kept: after the wizard is completed once plus one extra edit session, the site locks and changes go through change requests.

## Mobile
- Club theme on mobile: the app now uses the owner's primary + secondary colors and light/dark backgrounds (same values the website uses, via /api/settings/public). Colors are contrast-checked so any owner choice stays readable; branding is cached for instant start and refreshed whenever the app returns to the foreground (at most once a minute). The app icon/splash screen stay generic (they are fixed at build time).
- Added missing expo-image dependency (app could not bundle). ClubLogo fixed (lint + replaced/broken logo).

## Security
- Image-URL allow-list (blocks javascript:/data:/foreign hosts and page crashes), applied on save and on public read.
- New routes: owner vs Super Admin separation, same-origin checks, rate limits, club taken from the session only.
- Reviewed: auth rate limits, httpOnly cookies, nonce CSP, session revocation, club-scoped lookups before id-based writes (heuristic scan of all API routes + existing tenant/IDOR tests). Not a penetration test.

## Performance
- Index on subscriptions.planId; new list endpoints paginated/capped. No profiling of real production queries.

## Cleanup
- Removed stale .kilo/worktrees duplicate (395 files), auth-test.js, unused recharts. Mobile deps flagged by depcheck were kept (likely native peers, unproven).

## Verified here
Web: tsc clean, 361/361 tests, eslint 0 errors (62 warnings), next build OK. Mobile: tsc clean, lint clean, 18/18 tests.
Caveat: web checks used Prisma 6 types + dummy env. Migrations were not run on a database.

## Not verified
Real-DB migration, Stripe/Konnect flows, email delivery, mobile on device, host upload limits, production performance, full penetration test.
