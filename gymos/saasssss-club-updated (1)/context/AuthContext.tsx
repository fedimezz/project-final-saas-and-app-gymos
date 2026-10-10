"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: string;
  [key: string]: unknown;
}

interface AuthContextValue {
  isLoggedIn: boolean;
  userRole: string | null;
  user: StoredUser | null;
  isLoading: boolean;
  login: (role: string, user?: StoredUser) => void;
  logout: () => void;
  updateUser: (patch: Partial<StoredUser>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Custom event name used to notify other components in the SAME tab that
// auth state changed. The native "storage" event only fires in OTHER tabs,
// so without this, the Navbar wouldn't update instantly after login/logout
// in the tab where the action happened.
const AUTH_CHANGE_EVENT = "auth-change";
const SESSION_CHECK_TIMEOUT_MS = 8000;

function clearMirror() {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("user");
    localStorage.removeItem("userName");
  } catch {
    /* storage unavailable */
  }
}

function readAuthFromStorage(): { role: string | null; user: StoredUser | null } {
  if (typeof window === "undefined") {
    return { role: null, user: null };
  }
  const role = localStorage.getItem("role");
  const rawUser = localStorage.getItem("user");
  let user: StoredUser | null = null;
  if (rawUser) {
    try {
      user = JSON.parse(rawUser) as StoredUser;
    } catch {
      // Corrupted value — clear it rather than crash on every render.
      localStorage.removeItem("user");
      user = null;
    }
  }
  return { role, user };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    // Never let a slow/hung request keep the whole app on a loading screen.
    const timeout = window.setTimeout(() => controller.abort(), SESSION_CHECK_TIMEOUT_MS);

    const { role, user: storedUser } = readAuthFromStorage();
    const hasMirror = Boolean(role && storedUser);

    // localStorage is only a UI mirror of the httpOnly session cookie: it is
    // never trusted on its own. A stale mirror (another account used earlier
    // in this browser, an expired or revoked session, an invitation just
    // accepted) used to bounce users between /admin, /dashboard and /login
    // forever. So: paint instantly from the mirror when there is one, then
    // ALWAYS reconcile with what the server says about the cookie.
    if (hasMirror) {
      setUserRole(role);
      setUser(storedUser);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    fetch("/api/auth/session", { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) return { state: "anonymous" as const };
        if (!r.ok) return { state: "unknown" as const };
        const data = await r.json().catch(() => null);
        return data?.user ? { state: "user" as const, user: data.user as StoredUser } : { state: "anonymous" as const };
      })
      .then((result) => {
        if (cancelled) return;
        if (result.state === "user") {
          // Server wins over the mirror (role changes, other account, ...).
          // Extra display fields (avatar, phone) of the SAME account are kept.
          const merged: StoredUser =
            storedUser && storedUser.id === result.user.id ? { ...storedUser, ...result.user } : result.user;
          try {
            localStorage.setItem("role", merged.role);
            localStorage.setItem("user", JSON.stringify(merged));
          } catch {
            /* storage unavailable — state below still updates */
          }
          setUserRole(merged.role);
          setUser(merged);
        } else if (result.state === "anonymous") {
          // The cookie is gone/invalid: drop the stale mirror so no layout
          // keeps treating this browser as logged in.
          clearMirror();
          setUserRole(null);
          setUser(null);
        }
        // "unknown" (5xx / network hiccup): keep whatever the mirror said.
      })
      .catch(() => {
        // Timeout or offline: keep the mirror (if any); never block the UI.
      })
      .finally(() => {
        window.clearTimeout(timeout);
        // React Strict Mode cancels the first effect before the fetch
        // resolves — don't flip isLoading to false for that aborted run.
        if (!cancelled) setIsLoading(false);
      });

    const syncFromStorage = () => {
      const { role: r, user: u } = readAuthFromStorage();
      setUserRole(r);
      setUser(u);
    };

    // Cross-tab sync.
    window.addEventListener("storage", syncFromStorage);
    // Same-tab sync (fired by login()/logout()/updateUser() below).
    window.addEventListener(AUTH_CHANGE_EVENT, syncFromStorage);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener(AUTH_CHANGE_EVENT, syncFromStorage);
    };
  }, []);

  const login = useCallback((role: string, userData?: StoredUser) => {
    // Note: the httpOnly auth cookie is set by the server response itself
    // (Set-Cookie header from /api/auth/login or /api/auth/register).
    // localStorage here is only a convenience mirror for instant client UI
    // (Navbar, Sidebar) — it is never used for actual route protection, and
    // deliberately never stores the JWT itself (that lived here before —
    // it's what let any XSS anywhere in the app steal the token and
    // authenticate as the user via the Authorization header fallback).
    localStorage.setItem("role", role);
    if (userData) {
      localStorage.setItem("user", JSON.stringify(userData));
    }
    setUserRole(role);
    setUser(userData ?? null);
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
  }, []);

  const logout = useCallback(() => {
    clearMirror();
    setUserRole(null);
    setUser(null);
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));

    // Clear the httpOnly cookie server-side. Fire-and-forget: even if this
    // request fails, the local UI state is already cleared, and the cookie
    // will simply expire naturally per AUTH_COOKIE_OPTIONS maxAge.
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {
      /* network error during logout is non-fatal for the UI */
    });
  }, []);

  // updateUser: merge a partial patch into the current user, update both
  // React state and localStorage atomically, then broadcast so Navbar and
  // DashboardHeader re-render immediately — no page refresh needed.
  // Used by the profile page after a successful avatar/name/phone save.
  const updateUser = useCallback((patch: Partial<StoredUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem("user", JSON.stringify(next));
      } catch {
        // localStorage quota exceeded — state still updates in memory
      }
      return next;
    });
    // Dispatch after the state update so any listener that re-reads
    // localStorage gets the freshly written value.
    setTimeout(() => window.dispatchEvent(new Event(AUTH_CHANGE_EVENT)), 0);
  }, []);

  const value: AuthContextValue = {
    isLoggedIn: Boolean(userRole),
    userRole,
    user,
    isLoading,
    login,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}