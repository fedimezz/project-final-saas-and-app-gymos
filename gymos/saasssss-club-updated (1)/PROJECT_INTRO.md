# GymOS — Dossier de contexte complet du projet

> Ce document est écrit pour être lu par une IA (Claude, GPT, etc.) qui n'a
> aucune connaissance préalable du projet. Il doit permettre de comprendre
> l'intégralité de l'architecture, l'état d'avancement réel, et ce qui
> reste à faire, sans avoir à explorer le code au préalable.

---

## 1. C'est quoi, en une phrase

Une plateforme SaaS multi-tenant de gestion de salle de sport/club fitness :
chaque salle a son propre espace isolé (membres, coachs, planning, branding),
et un opérateur SUPER_ADMIN pilote l'ensemble depuis un dashboard plateforme
central (facturation, suspension de clients, plans tarifaires).

Le projet a évolué en trois étapes : (1) une app mono-établissement pour
"Le Club de Gammarth" → (2) conversion en plateforme multi-tenant → (3)
ajout d'une couche SaaS complète (facturation, onboarding self-service,
landing page marketing, dashboard de contrôle plateforme).

Repo : `fedimezz/saasssss-club`

---

## 2. Stack technique

| Domaine | Techno |
|---|---|
| Framework | Next.js 16 (App Router). **`proxy.ts` remplace `middleware.ts`** — les deux ne peuvent pas coexister dans cette version |
| Langage | TypeScript strict |
| Base de données | PostgreSQL via Prisma 5 (Supabase en hébergement) |
| Auth | JWT dans un cookie httpOnly, vérifié via `jose` dans `proxy.ts` (edge runtime) |
| Styling | Tailwind CSS v4 + variables CSS custom pour theming (dark/light) |
| Cache/Rate-limit/Pub-sub | Upstash Redis (REST-based, compatible edge) |
| Stockage fichiers | Cloudinary |
| Paiement membres | Konnect (paiement tunisien) |
| SMS | TextBee |
| Email | Resend |
| Animations | Framer Motion |
| Icônes | Lucide React |
| Tests | Vitest |
| Lint | ESLint (config stricte, `no-explicit-any` en erreur) |

---

## 3. Architecture multi-tenant — comment ça marche

- **Résolution du tenant** : `lib/tenant.ts` extrait le sous-domaine du
  header `Host` (ex. `gym1.yoursaas.com` → tenant `gym1`). En dev sans
  wildcard DNS, on peut forcer un tenant via le header `x-club-slug`, le
  query param `?club=`, ou la variable d'env `DEV_DEFAULT_CLUB_SLUG`
  (ces 3 mécanismes sont ignorés en production).
- **Domaine apex sans sous-domaine** (`yoursaas.com` tout court, ou
  `localhost` en dev sans tenant configuré) = pas de tenant résolu = la
  plateforme affiche son propre site marketing SaaS au lieu de la page
  d'un gym. Voir section 6.
- **Isolation des données** : chaque modèle Prisma "tenant" a un champ
  `clubId`. RÈGLE ABSOLUE : toute query sur ces modèles doit filtrer par
  `clubId`, résolu côté serveur via `requireUser`/`requireAdmin`/
  `requireOwner`/`requireSuperAdmin` (dans `lib/auth.ts`) — **jamais**
  faire confiance à un `clubId` envoyé par le client.
- **`proxy.ts`** (edge middleware) fait 3 choses à chaque requête :
  1. Injecte le header `x-club-slug` résolu depuis le Host
  2. Vérifie le JWT et bloque l'accès aux routes protégées
     (`/dashboard`, `/admin`, `/platform` et leurs équivalents `/api/*`)
  3. **Nouveau** : vérifie l'Origin (anti-CSRF) et applique un rate-limit
     général, pour TOUTES les routes `/api/*` non-GET — centralisé ici
     plutôt que dupliqué dans chaque route handler

---

## 4. Rôles utilisateurs

| Rôle | Portée | Accès |
|---|---|---|
| `SUPER_ADMIN` | Plateforme entière, cross-tenant | `/platform/*` uniquement — jamais un gym spécifique |
| `OWNER` | Un seul club | `/admin/*` complet, y compris facturation/plans |
| `ADMIN` | Un seul club | `/admin/*` sauf ce qui est marqué "owner only" (facturation, promotions) |
| `COACH` | Un seul club | `/dashboard/coach` — son roster, ses sessions |
| `MEMBER` | Un seul club | `/dashboard` — réservations, abonnement, profil |

---

## 5. Modèles de données (Prisma) — 25 modèles

```
Club, SaasPlan, ClubSubscription, SaasPayment        ← couche plateforme/SaaS
User, MembershipPlan, Subscription, Payment           ← club ↔ ses membres
WeeklyPlan, Session, Coach, UserSession                ← planning & réservations
MembershipCard, Attendance                             ← carte membre & présence
Notification, UserPreferences                          ← notifs
Post, Like, Comment                                    ← fil d'actualité social
Promotion, GymSettings, PageContent, RolePermission     ← config & contenu du club
MemberReport, ActivityLog                               ← rapports & audit log
```

Point important : **`Payment`** (un membre paie son abonnement au club) est
différent de **`SaasPayment`** (un club paie son abonnement SaaS à la
plateforme) — ne pas confondre, ce sont deux flux d'argent séparés.

---

## 6. Pages existantes (54 pages)

### Site public / marketing
- `/` — **double comportement** : si un tenant est résolu (sous-domaine
  d'un gym existant), affiche le site marketing de CE gym (hero, activités,
  galerie, coachs, tarifs). Si aucun tenant n'est résolu (domaine apex),
  affiche la landing page SaaS de la plateforme (`components/landing/*`).
  Le switch se fait via un flag `hasTenant: boolean` remonté par
  `/api/settings/public` → `ClubSettingsContext`.
- `/activites`, `/activites/{fight-club,kids,foot-a-5,squash,fitness,piscine}`
- `/coaching`, `/offres`, `/actualites`, `/(public)/gallery`

### Auth
- `/user/login`, `/user/register`, `/user/verify`, `/user/forgot-password`,
  `/user/reset-password`, `/user/onboarding` (capture téléphone post-Google
  OAuth — **nom ambigu, à renommer**, voir section 9)
- `/login` — **doublon** de `/user/login`, à supprimer (bug connu jamais traité)
- `/auth/sync`
- `/onboarding` — wizard 4 étapes self-service (compte → club → thème →
  plan payant); accès activé uniquement après confirmation Stripe

### Dashboard membre (`/dashboard/*`)
`page` (accueil), `schedule`, `bookings`, `membership`, `notifications`,
`profile`, `settings`, `actualites`, `coach` (si rôle coach)

### Dashboard gym (`/admin/*`, OWNER/ADMIN)
`page` (accueil KPI), `analytics`, `bookings`, `content`, `logs`, `members`,
`news`, `notifications`, `payments`, `plans`, `profile`, `promotions`,
`reports`, `roles`, `schedule`, `settings`, `staff`, `staff/coaches`,
`subscriptions`, `billing` (facturation SaaS du club)

### Dashboard plateforme (`/platform/*`, SUPER_ADMIN uniquement)
`page` (vue d'ensemble MRR/clubs), `clubs` (liste + recherche + filtre),
`clubs/[id]` (détail + suspendre/réactiver/changer de plan), `plans`
(lecture seule des `SaasPlan`), `logs` (journal cross-tenant), `system`
(santé plateforme)

---

## 7. Routes API existantes (85 routes)

Organisées par préfixe :
- `/api/auth/*` — login, register, logout, verify (OTP), reset-password,
  resend-code, session, google OAuth (callback + init)
- `/api/onboarding/create-club` — création atomique Club + User OWNER +
  ClubSubscription TRIALING + GymSettings
- `/api/dashboard/*` — tout ce que voit un membre (réservations, planning,
  abonnement, notifications, profil) + `/api/dashboard/coach/*` pour les coachs
- `/api/admin/*` — tout ce que gère un OWNER/ADMIN d'un club (35+ routes :
  members, staff, coaches, schedule, sessions, subscriptions, payments,
  promotions, analytics, reports, logs, roles, settings, page-content...)
- `/api/billing/{status,upgrade}` — facturation SaaS du club courant
- `/api/platform/*` — cross-tenant, SUPER_ADMIN only (overview, clubs,
  clubs/[id], plans, logs, system)
- `/api/cron/*` — `session-reminders`, `trial-check`, `subscription-renewal`
  (protégées par header `Authorization: Bearer CRON_SECRET`, appelées par
  Vercel Cron, voir `vercel.json`)
- `/api/payments/konnect/webhook` — retour de paiement Konnect (vérifié
  côté serveur, jamais fait confiance au redirect brut)
- `/api/posts/*` — fil d'actualité social (posts, likes, commentaires)
- `/api/{saas-plans,plans/public,coaches/public,settings/public,content/public}` —
  routes publiques non authentifiées
- `/api/sse` — Server-Sent Events pour les notifications temps réel
- `/api/upload` — upload Cloudinary

---

## 8. Sécurité — état actuel

- **Isolation tenant** : appliquée partout via `clubId` — MAIS **aucun
  test automatisé ne le prouve** (voir section 9, priorité #1)
- **CSRF** : vérification d'Origin centralisée dans `proxy.ts` pour toutes
  les routes `/api/*` non-GET (`lib/csrf.ts`)
- **Rate-limit** : backstop général 60 req/min/utilisateur dans `proxy.ts`
  pour les routes protégées, + limites plus strictes déjà en place sur les
  routes auth sensibles (login, register, OTP)
- **Headers de sécurité** : CSP, HSTS, X-Frame-Options, etc. configurés
  dans `next.config.ts`
- **JWT** : httpOnly, vérifié à chaque requête protégée, re-vérifié contre
  la DB (pas juste le contenu du token) pour le rôle/statut actif
- **SSE** : bascule sur Redis pub/sub (Upstash) si configuré, sinon
  fallback en mémoire (mono-instance, pour le dev local)

---

## 9. CE QUI N'EST PAS FAIT — dans l'ordre de priorité réelle

### Priorité 1 — Tests d'isolation tenant (jamais commencé)
Aucun fichier `lib/__tests__/tenant-isolation.test.ts` n'existe. C'est la
seule chose qui prouverait qu'un membre du Gym A ne peut jamais voir/modifier
les données du Gym B. **À faire avant toute mise en production réelle**,
peu importe le reste.

### Priorité 2 — Légal
Pages `/privacy` et `/terms` inexistantes — le footer y pointe déjà (liens
`#` actuellement). Obligatoire avant d'onboarder un vrai client payant.

### Priorité 3 — Health check public
`GET /api/health` n'existe pas. `/api/platform/system` fait presque la même
chose mais est protégé SUPER_ADMIN, donc inutilisable par un load
balancer/service de monitoring externe.

### Priorité 4 — Polish technique restant
- ~17 balises `<img>` pas encore converties en `next/image` (sur 28 au
  total, 11 converties) — surtout des images de posts à hauteur variable
  où la conversion est risquée sans preview visuel
- `lib/auth-server.ts` à vérifier — possible doublon de `lib/auth.ts`
- `app/login/page.tsx` doublon de `app/user/login/page.tsx`
- `/user/onboarding` à renommer en `/auth/phone-setup` (confond avec le
  vrai wizard `/onboarding`)
- Pages marketing statiques (`/coaching`, `/activites/*`) pas connectées
  au modèle `PageContent` (contenu en dur au lieu d'éditable depuis l'admin)

### Fonctionnalités membres manquantes (jamais évaluées comme "phase" mais utiles)
- QR code de check-in : le champ existe en DB (`qrCode` généré à
  l'inscription) mais n'est affiché nulle part et aucune route de scan
  n'existe — le check-in est 100% manuel actuellement
- Pause/gel d'abonnement
- Liste d'attente pour cours complets
- Parrainage
- Suivi de progression (poids, mensurations, photos)

### Business (hors code)
- Aucun provider de paiement SaaS branché sur `SaasPayment` (le modèle
  existe, le ledger reste vide tant que Konnect/Stripe n'est pas intégré
  pour la facturation plateforme — actuellement Konnect ne gère que les
  paiements membre→club, pas club→plateforme)
- Zéro client réel, zéro déploiement en production vérifié

---

## 10. Comment reprendre le travail

1. Lire ce document en entier
2. `npm install && npx prisma generate && npx prisma migrate deploy`
3. `npx tsc --noEmit && npm run build && npx vitest run && npm run lint`
   (doit être 0 erreur / 86+ tests / 0 erreur lint)
4. Lancer l'audit tenant isolation (script Python dans
   `CONTINUATION_PROMPT.md`, section Étape 0)
5. Attaquer la Priorité 1 (tests d'isolation) avant tout le reste

Voir aussi `CONTINUATION_PROMPT.md` (règles absolues + détail phase par
phase) et `PROJECT_STATUS.md` (historique complet des phases 0-8) à la
racine du repo pour plus de détails narratifs.
