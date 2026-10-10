import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { fetchNotifications } from "@/api/notifications";

const MIN_INTERVAL_MS = 30_000; // never ask the server more than twice a minute

interface UnreadValue {
  unread: number;
  /** Re-read the unread count (throttled unless `force`). */
  refresh: (force?: boolean) => void;
  /** Apply a count we already know (after mark-as-read) without another request. */
  setUnread: (n: number) => void;
}

const Ctx = createContext<UnreadValue | null>(null);

/** Unread-notification badge state, shared by the tab bar and the Notifications tab. */
export function UnreadProvider({ children }: { children: ReactNode }) {
  const [unread, setUnread] = useState(0);
  const lastFetch = useRef(0);
  const inFlight = useRef(false);

  const refresh = useCallback((force = false) => {
    const now = Date.now();
    if (inFlight.current || (!force && now - lastFetch.current < MIN_INTERVAL_MS)) return;
    inFlight.current = true;
    lastFetch.current = now;
    fetchNotifications(1)
      .then((r) => setUnread(r.unreadCount))
      .catch(() => {
        /* the badge is secondary; a failed refresh just keeps the last known count */
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, []);

  useEffect(() => {
    refresh(true);
    const sub = AppState.addEventListener("change", (s) => s === "active" && refresh());
    return () => sub.remove();
  }, [refresh]);

  const value = useMemo(() => ({ unread, refresh, setUnread }), [unread, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUnread(): UnreadValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUnread must be used within UnreadProvider");
  return v;
}
