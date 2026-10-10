# GymOS Mobile — build status

Expo SDK 57 · React Native · React Navigation · TypeScript strict. Members and coaches only
(OWNER/ADMIN never get a navigator; their token is revoked on the spot if they sign in here).

## Screens
- **Signed out:** Mes salles (saved clubs) · Recherche · Connexion · Inscription · Vérification email · Mot de passe oublié · Réinitialisation
- **Member tabs:** Accueil · Planning · Réservations · Notifications · Profil (+ Abonnement pushed from Home/Profile)
- **Coach tabs:** Accueil · Planning (read-only) · Mes séances (→ roster + attendance) · Notifications · Profil

## Backend endpoints used (all existing, no new routes)
Auth: `POST /api/auth/{login,logout,register,verify,resend-code,reset-password}`, `PATCH /api/auth/reset-password`, `GET /api/auth/session`
Clubs: `GET /api/clubs/search` · Theme: `GET /api/settings/public` · Feed: `GET /api/posts`
Member: `GET /api/dashboard`, `GET /api/bookings`, `GET|POST|DELETE /api/dashboard/schedule[/book]`, `GET /api/dashboard/membership`, `POST …/membership/{subscribe,resume-payment}`
Shared: `GET|PUT /api/dashboard/profile`, `GET /api/dashboard/notifications`, `PUT …/notifications/{id}/read`, `PUT …/notifications/read-all`
Coach: `GET /api/dashboard/coach/{sessions,stats}`, `GET …/sessions/{id}/roster`, `POST …/coach/attendance`

## Checks (run `npm run check`)
`tsc --noEmit` · `eslint --max-warnings=0` · `tsx --test tests/*.test.ts` (15 tests) · `expo export` for Android + iOS · `expo-doctor`

## Security model
- The backend is the only authority. The app never sends a `clubId`; the club comes from the host + signed token.
- The session token lives in SecureStore only (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`) and is sent only to the selected club's host.
- Release builds refuse any non-HTTPS API/club/payment URL. No `console.*` in the app → nothing to leak in logs.
- A 401 on an authenticated request clears the session and returns to sign-in.
- Saved clubs (public directory info) are in AsyncStorage and re-validated on every load.

## Not verified here (needs a device / your backend)
See the final report: real-device runs, EAS builds, store submission, and the backend email-code issue.
