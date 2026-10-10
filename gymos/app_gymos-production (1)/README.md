# GymOS Mobile

Expo and React Native app for GymOS members and coaches. Owners and admins
continue to use the web dashboard; they do not get a mobile app navigator.

## Features

- Club search and saved clubs
- Sign in, registration, email verification, password reset, and sign out
- Secure session restoration and handling for expired sessions
- Member home, weekly schedule, bookings, membership, notifications, and profile
- Published club news with expandable posts, likes, and comments
- Coach dashboard, weekly planning, session rosters, attendance, and profile
- Club-branded light and dark themes, plus offline and loading states
- Meaningful member actions are recorded in the website's owner activity log,
  including phone/desktop device type; screen views and routine fetches are not logged

The app uses existing GymOS backend endpoints. The backend remains the
authority for permissions, memberships, and bookings.

## Setup

Install dependencies and copy the example environment file:

```powershell
npm ci
Copy-Item .env.example .env.local
```

On macOS or Linux, use `cp .env.example .env.local` instead.

Set `EXPO_PUBLIC_PLATFORM_API_BASE_URL` in `.env.local` to the platform API
host. For a local backend, use the machine's LAN address when testing on a
physical phone; `localhost` on the phone refers to the phone itself. Restart
Expo with a cleared cache after changing environment values:

```sh
npx expo start -c
```

Production builds require an HTTPS API URL. Never put secrets in
`EXPO_PUBLIC_*` variables because Expo includes them in the app bundle.

## Checks

```sh
npm run check
npx expo export --platform android --platform ios
npx expo-doctor
```

`npm run check` runs TypeScript, ESLint, and the unit tests. Export and
Expo Doctor checks validate the platform bundles and project configuration;
they do not replace real-device testing or integration tests against your
backend.

## Project layout

- `src/api/` — backend client and feature endpoints
- `src/auth/` — session and club selection state
- `src/navigation/` — auth flow and role-specific member/coach tabs
- `src/screens/` — auth, member, coach, and shared screens
- `src/components/` — reusable UI components
- `src/theme/` — club theme loading and light/dark palettes
- `tests/` — API, configuration, club storage, date, and validation tests
