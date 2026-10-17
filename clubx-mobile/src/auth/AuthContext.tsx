import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { storage } from "@/lib/storage";
import { STORAGE_KEYS, PREF_KEYS, PLATFORM_API_BASE_URL, DEV_CLUB_API_BASE_URL, isAllowedUrl, normalizeBaseUrl } from "@/config";
import { ApiError, setApiBaseUrl, setClubSlug, setAuthToken, setUnauthorizedHandler } from "@/api/client";
import { login as apiLogin, logout as apiLogout, fetchSession } from "@/api/auth";
import { unregisterStoredPushToken } from "@/notifications/pushToken";
import { loadSavedClubs, loadSlug, persistSavedClubs, persistSlug, sortClubs, upsertClub } from "@/lib/clubStore";
import type { ClubRef, SessionUser } from "@/api/types";

interface AuthContextValue {
  /** undefined = still restoring the session at launch. */
  user: SessionUser | null | undefined;
  /** The club the app is currently pointed at (null → "Mes salles" screen). */
  club: ClubRef | null;
  /** Saved clubs, already in display order (authenticated club first, then last used). */
  savedClubs: ClubRef[];
  homeClubSlug: string | null;
  lastClubSlug: string | null;
  restoreFailed: boolean;
  retryRestore: () => void;
  /** Offline-safe escape hatch: drops the stored session + club locally (no network) and goes back to "Mes salles". */
  resetClub: () => Promise<void>;
  /** True after the server rejected our token (expired / revoked); shown once on the login screen. */
  sessionExpired: boolean;
  dismissSessionExpired: () => void;
  selectClub: (club: ClubRef) => Promise<void>;
  /** Signed-out only: forget the current club selection and go back to "Mes salles". */
  clearClub: () => Promise<void>;
  saveClub: (club: ClubRef) => void;
  removeClub: (slug: string) => void;
  login: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  logout: () => Promise<void>;
  /** Signs out and returns to "Mes salles". */
  switchClub: () => Promise<void>;
  patchUser: (patch: Partial<SessionUser>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// The mobile app is for members and coaches only. Owner/admin accounts keep
// using the web dashboard, so their token is never kept on the phone.
const isMobileRole = (role: string) => role === "MEMBER" || role === "COACH";

/** Where this club's API lives: the single local backend in dev, the club's own host in production. */
const resolveBaseUrl = (club: ClubRef): string =>
    __DEV__ ? (DEV_CLUB_API_BASE_URL ?? PLATFORM_API_BASE_URL) : normalizeBaseUrl(club.apiBaseUrl);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [club, setClub] = useState<ClubRef | null>(null);
  const [savedRaw, setSavedRaw] = useState<ClubRef[]>([]);
  const [homeClubSlug, setHomeClubSlug] = useState<string | null>(null);
  const [lastClubSlug, setLastClubSlug] = useState<string | null>(null);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Refs let stable callbacks read the latest values without re-creating themselves.
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const loggingOut = useRef(false);

  const savedClubs = useMemo(() => sortClubs(savedRaw, homeClubSlug, lastClubSlug), [savedRaw, homeClubSlug, lastClubSlug]);

  const commitSaved = useCallback((next: ClubRef[]) => {
    setSavedRaw(next);
    void persistSavedClubs(next);
  }, []);

  const clearSession = useCallback(async () => {
    setAuthToken(null);
    await storage.deleteItemAsync(STORAGE_KEYS.token);
    setUser(null);
  }, []);

  const restoreSession = useCallback(async () => {
    const [storedBaseUrl, storedSlug, storedName, storedLogo, storedToken, saved, last, home] = await Promise.all([
      storage.getItemAsync(STORAGE_KEYS.clubApiBaseUrl),
      storage.getItemAsync(STORAGE_KEYS.clubSlug),
      storage.getItemAsync(STORAGE_KEYS.clubName),
      storage.getItemAsync(STORAGE_KEYS.clubLogoUrl),
      storage.getItemAsync(STORAGE_KEYS.token),
      loadSavedClubs(),
      loadSlug(PREF_KEYS.lastClub),
      loadSlug(PREF_KEYS.homeClubSlug),
    ]);
    setSavedRaw(saved);
    setLastClubSlug(last);
    setHomeClubSlug(home);

    if (!storedBaseUrl || !storedToken || !isAllowedUrl(storedBaseUrl)) {
      // No usable session (never signed in, signed out, or a stored host that
      // production refuses): drop any leftover token so it can't be replayed.
      if (storedToken) await storage.deleteItemAsync(STORAGE_KEYS.token);
      setUser(null);
      return;
    }

    const restoredClub: ClubRef = {
      slug: storedSlug ?? "",
      name: storedName ?? "",
      logoUrl: storedLogo || null,
      apiBaseUrl: storedBaseUrl,
    };
    // Dev: the stored host is whatever .env.local said when the club was
    // picked (an old LAN IP, a subdomain that doesn't exist locally…), so
    // re-resolve it from the current env instead of trusting it. Production
    // keeps the stored club host.
    const baseUrl = __DEV__ ? resolveBaseUrl(restoredClub) : storedBaseUrl;
    restoredClub.apiBaseUrl = baseUrl;
    setApiBaseUrl(baseUrl);
    setClubSlug(__DEV__ && storedSlug ? storedSlug : null);
    setAuthToken(storedToken);
    setClub(restoredClub);

    try {
      const { user: restoredUser } = await fetchSession();
      if (restoredUser && isMobileRole(restoredUser.role)) {
        setUser(restoredUser);
      } else {
        await clearSession();
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        // Expired or revoked while the app was closed → sign-in screen.
        await clearSession();
        setSessionExpired(true);
      } else {
        // Offline / server hiccup: keep the stored session (don't log the
        // person out over a bad connection) but let them retry.
        setRestoreFailed(true);
      }
    }
  }, [clearSession]);

  // One-time load of the persisted session/clubs on launch. restoreSession is async: it
  // only touches state after awaiting storage, never synchronously inside the effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void restoreSession();
  }, [restoreSession]);

  // Any later 401 on an authenticated request = the session is gone.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (loggingOut.current || userRef.current === null) return;
      void clearSession().then(() => setSessionExpired(true));
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const selectClub = useCallback(async (selected: ClubRef) => {
    if (userRef.current) return; // switching clubs while signed in would mix sessions: sign out first
    const baseUrl = resolveBaseUrl(selected);
    if (!isAllowedUrl(baseUrl)) throw new Error("Adresse du club non sécurisée");

    const next: ClubRef = { ...selected, apiBaseUrl: baseUrl };
    setApiBaseUrl(baseUrl);
    setClubSlug(__DEV__ ? selected.slug : null);
    setClub(next);
    setLastClubSlug(selected.slug);
    setSessionExpired(false);
    await Promise.all([
      storage.setItemAsync(STORAGE_KEYS.clubApiBaseUrl, baseUrl),
      storage.setItemAsync(STORAGE_KEYS.clubSlug, selected.slug),
      storage.setItemAsync(STORAGE_KEYS.clubName, selected.name),
      storage.setItemAsync(STORAGE_KEYS.clubLogoUrl, selected.logoUrl ?? ""),
      persistSlug(PREF_KEYS.lastClub, selected.slug),
    ]);
  }, []);

  const clearClub = useCallback(async () => {
    if (userRef.current) return;
    setApiBaseUrl(null);
    setClubSlug(null);
    setClub(null);
    setSessionExpired(false);
    await Promise.all([
      storage.deleteItemAsync(STORAGE_KEYS.clubApiBaseUrl),
      storage.deleteItemAsync(STORAGE_KEYS.clubSlug),
      storage.deleteItemAsync(STORAGE_KEYS.clubName),
      storage.deleteItemAsync(STORAGE_KEYS.clubLogoUrl),
    ]);
  }, []);

  const saveClub = useCallback(
      (c: ClubRef) => commitSaved(upsertClub(savedRaw, c)),
      [savedRaw, commitSaved]
  );

  const removeClub = useCallback(
      (slug: string) => {
        commitSaved(savedRaw.filter((c) => c.slug !== slug));
        if (homeClubSlug === slug) {
          setHomeClubSlug(null);
          void persistSlug(PREF_KEYS.homeClubSlug, null);
        }
        if (lastClubSlug === slug) {
          setLastClubSlug(null);
          void persistSlug(PREF_KEYS.lastClub, null);
        }
      },
      [savedRaw, homeClubSlug, lastClubSlug, commitSaved]
  );

  const login = useCallback(
      async (email: string, password: string, rememberMe: boolean) => {
        const res = await apiLogin(email, password, rememberMe);

        if (!isMobileRole(res.user.role)) {
          // Valid credentials, but not a member/coach account. Don't keep an
          // owner/admin token on a phone: revoke the session we were just given.
          setAuthToken(res.token);
          loggingOut.current = true;
          try {
            await apiLogout();
          } catch {
            /* best-effort */
          } finally {
            loggingOut.current = false;
            setAuthToken(null);
          }
          throw new ApiError(
              "L'application mobile est réservée aux membres et aux coachs. Utilisez le tableau de bord web de votre salle.",
              403,
              null
          );
        }

        setAuthToken(res.token);
        await storage.setItemAsync(STORAGE_KEYS.token, res.token);
        setSessionExpired(false);
        setUser({ id: res.user.id, name: res.user.name, email: res.user.email, role: res.user.role });

        // This is now the user's club: save it (if needed) and rank it first.
        if (club) {
          commitSaved(upsertClub(savedRaw, club));
          setHomeClubSlug(club.slug);
          void persistSlug(PREF_KEYS.homeClubSlug, club.slug);
        }
      },
      [club, savedRaw, commitSaved]
  );

  const logout = useCallback(async () => {
    loggingOut.current = true;
    // Stop pushes for this account on this phone while the session still works.
    await unregisterStoredPushToken();
    try {
      await apiLogout();
    } catch {
      /* token might already be invalid, or we're offline — local sign-out still happens */
    } finally {
      loggingOut.current = false;
    }
    await clearSession();
  }, [clearSession]);

  const switchClub = useCallback(async () => {
    await logout();
    await clearClub();
  }, [logout, clearClub]);

  const resetClub = useCallback(async () => {
    setRestoreFailed(false);
    await clearSession();
    await clearClub();
  }, [clearSession, clearClub]);

  const patchUser = useCallback((patch: Partial<SessionUser>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value = useMemo<AuthContextValue>(
      () => ({
        user,
        club,
        savedClubs,
        homeClubSlug,
        lastClubSlug,
        restoreFailed,
        retryRestore: () => {
          setRestoreFailed(false);
          void restoreSession();
        },
        resetClub,
        sessionExpired,
        dismissSessionExpired: () => setSessionExpired(false),
        selectClub,
        clearClub,
        saveClub,
        removeClub,
        login,
        logout,
        switchClub,
        patchUser,
      }),
      [user, club, savedClubs, homeClubSlug, lastClubSlug, restoreFailed, restoreSession, resetClub, sessionExpired, selectClub, clearClub, saveClub, removeClub, login, logout, switchClub, patchUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}