# Continuation Prompt — GymOS / Le Club de Gammarth SaaS (mis à jour 29/08/2026)

Tu es un architecte SaaS senior et développeur full-stack. Tu reprends la
construction de la plateforme SaaS multi-tenant de gestion de salles de
sport (repo `fedimezz/saasssss-club`).

**Stack** : Next.js 16 (App Router, `proxy.ts` remplace `middleware.ts`) ·
TypeScript strict · Prisma 5 · PostgreSQL · Tailwind CSS v4 · JWT httpOnly
cookies · Upstash Redis · Cloudinary · Konnect

Lis ce fichier en entier avant de commencer. Il documente l'état réel après
la session du 29/08/2026 (landing page SaaS + Phase 9 + Phase 10 + dashboard
`/platform`), pas seulement le plan initial.

---

## RÈGLES ABSOLUES (jamais violées)

1. Ne jamais réécrire depuis zéro — étendre les fichiers existants
2. Ne jamais faire confiance à un `clubId` venant du client — toujours résoudre via `requireX()` → DB
3. Chaque query Prisma sur des données tenant DOIT inclure `{ clubId }` dans le WHERE
4. Une phase à la fois — après chaque phase : montrer les fichiers modifiés, lancer `tsc` + `vitest` + `build`, corriger toutes les erreurs avant de continuer
5. Ne jamais dire qu'une chose "fonctionne" sans montrer la sortie réelle de la commande
6. `proxy.ts` est le middleware dans Next.js 16 — pas `middleware.ts`
7. Les limites de plans sont appliquées par `lib/plan-limits.ts` — jamais de chiffres codés en dur
8. **Nouveau** : CSRF et rate-limit sont désormais centralisés dans `proxy.ts` (voir section dédiée) — ne pas les redupliquer dans chaque route handler, étendre plutôt la logique centrale si un cas particulier l'exige

---

## ÉTAPE 0 — Obligatoire au début de chaque session

```bash
npm install
npx prisma generate
npx prisma migrate deploy    # applique aussi la nouvelle migration SaasPayment + index (20260829120000)
npx tsc --noEmit
npm run build
npx vitest run                # doit être 86/86
npm run lint                  # doit être 0 erreur
```

Puis l'audit tenant isolation habituel (grep sur `app/api`, voir `PROJECT_STATUS.md`).

**Note sandbox** : si `prisma generate` échoue avec une erreur 403 sur
`binaries.prisma.sh`, c'est un blocage réseau de l'environnement d'exécution,
pas un bug de code — `tsc` affichera alors des erreurs "implicit any" /
"Module has no exported member" en cascade tant que le client Prisma n'est
pas généré. Ce n'était pas résolu à la fin de la session du 29/08.

---

## ÉTAT RÉEL DU PROJET — Phases 0 à 10

### Phases 0–8 — ✅ (confirmées au début de la session du 29/08)
Fondation multi-tenant complète : 72+ routes API scopées clubId, dashboards
par rôle, website builder, plan limits (Phase 7), onboarding wizard (Phase 8).

### Landing page SaaS (hors roadmap initial, ajoutée cette session)
Le domaine apex (sans tenant résolu) affiche désormais un vrai site marketing
SaaS au lieu de la page du gym par défaut :
- `components/landing/*` — Navbar, Footer, Hero (mockup dashboard réutilisant
  `StatCard`), TrustSection, Features, ProductShowcase (onglets interactifs),
  HowItWorks, MultiTenantSection, CustomizationSection, Pricing (vraies
  données `/api/saas-plans`, aucun prix inventé), FAQ, FinalCTA
- Bascule via un flag `hasTenant: boolean` de bout en bout : `/api/settings/public`
  → `ClubSettingsContext` → `Navbar`/`Footer`/`app/(public)/page.tsx`. Les
  gyms existants gardent leur rendu exact, inchangé.

### Phase 9 — Billing SaaS — ✅
- `GET /api/cron/trial-check`, `GET /api/cron/subscription-renewal` (enregistrés dans `vercel.json`)
- `POST /api/billing/upgrade` (OWNER only, transaction atomique, log)
- `GET /api/billing/status` (usage réel via `getFullUsage()`, plan actuel)
- `app/admin/billing/page.tsx` — barres d'usage, sélection de plan, modal de confirmation
- **Nouveau modèle `SaasPayment`** (`prisma/schema.prisma`) — ledger de paiement
  SaaS réel, distinct de `Payment` (qui est le paiement d'un MEMBRE à son club).
  Vide tant qu'aucun provider de paiement SaaS (Konnect/Stripe) n'est branché
  dessus — volontairement, pour ne pas fabriquer de fausses données.

### Dashboard plateforme `/platform` (SUPER_ADMIN) — ✅ nouveau
Comble le bug connu "SUPER_ADMIN n'a aucune page" :
- API : `app/api/platform/{overview,clubs,clubs/[id],plans,logs,system}/route.ts`
- UI : `/platform` (vue d'ensemble MRR/clubs), `/platform/clubs` (liste +
  recherche + filtre statut), `/platform/clubs/[id]` (détail + suspendre/
  réactiver/changer de plan), `/platform/plans` (lecture seule), `/platform/logs`
  (journal cross-tenant), `/platform/system` (santé plateforme-wide)
- `components/platform/{PlatformSidebar,PlatformHeader}.tsx`

### Phase 10 — Sécurité + Performance — presque complète
- **CSRF** : `lib/csrf.ts` + vérification centralisée dans `proxy.ts` pour
  TOUTES les routes `/api/*` non-GET (pas dupliqué dans chaque handler —
  voir commentaire dans `proxy.ts` pour pourquoi c'est un choix délibéré,
  et pourquoi la regex CSRF originale du prompt était cassée pour un domaine apex)
- **Rate-limit** : backstop général (60 req/min/utilisateur) centralisé dans
  `proxy.ts` pour `/admin`, `/dashboard`, `/platform`. Les routes auth gardent
  leurs limites propres, plus strictes.
- **SSE Redis pub/sub** : `lib/sse.ts` réécrit — bascule sur Redis (Upstash)
  si `UPSTASH_REDIS_REST_URL`/`TOKEN` sont configurés, sinon fallback
  identique au Map en mémoire (zéro régression en dev local sans Redis)
- **Index DB** : ajoutés (`ClubSubscription`, `Subscription`, `Session`,
  `Notification`, `Payment`, `SaasPayment`, tous `clubId`-first) + migration
  `prisma/migrations/20260829120000_billing_and_perf_indexes/migration.sql`
- **`<img>` → `next/image`** : PAS FAIT. 25 occurrences sur 18 fichiers.
  Non fait cette session car impossible à vérifier visuellement sans
  navigateur — à faire avec un preview réel, fichier par fichier, en
  vérifiant chaque `fill`/`sizes` ne casse pas la mise en page.

### Bug corrigé en cours de route (pas dans la roadmap initiale)
`lib/activity-log.ts` : `logAction` ne renseignait jamais `clubId` sur
les entrées créées, cassant silencieusement `GET /admin/logs` (toujours 0
résultat). Corrigé — résout le tenant depuis la requête, avec `clubId`
explicite possible pour les actions plateforme/cron.

---

## PHASES RESTANTES

### Phase 11 — Tests (PRIORITÉ ABSOLUE — pas commencée)

Aucun fichier `lib/__tests__/tenant-isolation.test.ts` n'existe encore.
C'est la priorité #1 avant toute mise en production. Setup GymA/GymB, tests
MEMBER/ADMIN/COACH cross-tenant, plan limits, webhook idempotency, booking
atomique — rien n'a changé sur le contenu attendu de cette phase, juste son
ordre de priorité qui devrait sans doute passer AVANT de fignoler la Phase 10.

### Phase 12 — Audit Production /10 (pas commencée)

Livrables :
- `GET /api/health` — doit être accessible SANS authentification (pour
  un load balancer/monitoring externe), contrairement à
  `/api/platform/system` qui existe déjà mais est protégé SUPER_ADMIN et ne
  peut donc pas servir de health-check public
- `.env.example` complet — déjà fait, à revérifier après ajout des nouvelles
  variables si le provider de paiement SaaS est branché
- Seed avec 2 gyms demo — déjà fait (`club-a`, `club-b` dans `prisma/seed.ts`)
- Score final /10 avec plan d'action

---

## PAGES ET ROUTES ENCORE MANQUANTES (hors phases numérotées)

| Élément | Pourquoi | Priorité |
|---|---|---|
| `GET /api/health` | Livrable Phase 12, doit être public | Haute |
| `/privacy`, `/terms` | Le footer SaaS y pointe déjà (liens `#` actuellement) | Haute (légal) |
| `/auth/phone-setup` | Renommage de `/user/onboarding` (confond avec le wizard `/onboarding`) — bug connu, jamais traité | Moyenne |
| `/platform/billing` | `SaasPayment` existe en DB mais rien n'agrège les paiements de tous les clubs | Moyenne |
| `POST/PATCH /api/platform/plans` | Créer/désactiver un plan sans Prisma Studio | Basse |
| `DELETE /api/platform/clubs/[id]` | Pas de suppression réelle de club (offboarding) | Basse |
| Suppression de compte membre (RGPD) | Rien trouvé dans le repo — à évaluer | À évaluer |

## BUGS CONNUS TOUJOURS OUVERTS (jamais traités, aucune session ne les a pris)

- `app/login/page.tsx` duplique `app/user/login/page.tsx` — à supprimer
- `lib/auth-server.ts` — vérifier si doublon de `lib/auth.ts`, supprimer si oui
- Pages marketing statiques (`/coaching`, `/activites/*`) non connectées au modèle `PageContent`

---

## FICHIERS CLÉS AJOUTÉS CETTE SESSION (en plus de ceux du prompt original)

```
lib/csrf.ts                 Vérification d'Origin (CSRF), centralisée via proxy.ts
components/landing/*        12 composants de la landing page SaaS
components/platform/*       Sidebar + Header du dashboard plateforme
app/platform/*               6 pages du dashboard SUPER_ADMIN
app/api/platform/*           6 routes API cross-tenant (SUPER_ADMIN only)
app/api/billing/*            status + upgrade
app/api/cron/trial-check, subscription-renewal
app/admin/billing/page.tsx
prisma/migrations/20260829120000_billing_and_perf_indexes/
```

## VARIABLES D'ENVIRONNEMENT — inchangées depuis le prompt original

Voir la liste complète dans `PROJECT_STATUS.md` / `.env.example`. Aucune
nouvelle variable requise cette session (le ledger `SaasPayment` n'a pas
encore de provider branché dessus).
