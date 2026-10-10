import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { useAuth } from "@/auth/AuthContext";
import { registerDevice } from "@/api/devices";
import { navigateToTab } from "@/navigation/navigationRef";
import { isValidExpoPushToken, pushTabFor, resolveProjectId, type MobileRole } from "@/notifications/pushCore";
import { setStoredPushToken } from "@/notifications/pushToken";

export type PushStatus =
  | "checking"
  | "undetermined" // permission never asked → show the in-app prompt
  | "granted" // permission granted and this phone is registered
  | "denied" // user refused; only the system settings can change it
  | "unavailable"; // simulator / web / no EAS project id

interface PushValue {
  status: PushStatus;
  /** Why push can't work on this build (shown to the user), when status is "unavailable". */
  reason: string | null;
  /** Ask for permission (system dialog) and register this phone. */
  enable: () => Promise<void>;
  openSettings: () => void;
}

const Ctx = createContext<PushValue | null>(null);

const CHANNEL_ID = "default"; // must match `channelId` sent by the server (lib/push.ts)
const REFRESH_MS = 24 * 60 * 60 * 1000; // re-confirm the token to the server at most daily

// Foreground behaviour: show the banner + list entry like a normal push.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Notifications du club",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
}

function unavailableReason(): string | null {
  if (Platform.OS === "web") return "Les notifications push ne sont pas disponibles sur le web.";
  if (!Device.isDevice) return "Les notifications push nécessitent un vrai téléphone (pas un simulateur).";
  if (!resolveProjectId(Constants)) return "Les notifications push ne sont pas configurées dans cette version de l'application.";
  return null;
}

export function PushProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role: MobileRole | null = user && (user.role === "MEMBER" || user.role === "COACH") ? user.role : null;
  const userId = user?.id ?? null;

  const [status, setStatus] = useState<PushStatus>("checking");
  const [reason, setReason] = useState<string | null>(null);
  const lastRegistered = useRef(0);

  // Fetch the Expo token and (re)register it for the signed-in account.
  const register = useCallback(async (force: boolean) => {
    if (!force && Date.now() - lastRegistered.current < REFRESH_MS) return;
    const projectId = resolveProjectId(Constants);
    if (!projectId) return;
    await ensureAndroidChannel();
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!isValidExpoPushToken(token)) throw new Error("Jeton de notification invalide");
    await registerDevice({
      token,
      platform: Platform.OS === "ios" ? "ios" : "android",
      deviceName: Device.deviceName ?? undefined,
      appVersion: Constants.expoConfig?.version,
    });
    await setStoredPushToken(token);
    lastRegistered.current = Date.now();
  }, []);

  // Read the current OS permission and, if already granted, register silently.
  const sync = useCallback(
    async (force: boolean) => {
      const why = unavailableReason();
      if (why) {
        setReason(why);
        setStatus("unavailable");
        return;
      }
      try {
        const perm = await Notifications.getPermissionsAsync();
        if (perm.granted) {
          await register(force);
          setStatus("granted");
        } else {
          setStatus(perm.canAskAgain ? "undetermined" : "denied");
        }
      } catch {
        // Network or token error: keep the permission state honest, retry on next focus.
        const perm = await Notifications.getPermissionsAsync().catch(() => null);
        setStatus(perm?.granted ? "granted" : perm && !perm.canAskAgain ? "denied" : "undetermined");
      }
    },
    [register]
  );

  // Sign-in (or app start with a session): check permission & register. Sign-out: reset.
  useEffect(() => {
    if (!userId) {
      lastRegistered.current = 0;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("checking");
      return;
    }
    void sync(true);
    // Coming back from the system settings (user may have changed permission).
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void sync(false);
    });
    return () => sub.remove();
  }, [userId, sync]);

  // Tap on a notification → open the relevant tab (also when the app was closed).
  useEffect(() => {
    if (!role || Platform.OS === "web") return;
    const open = (data: unknown) => navigateToTab(pushTabFor(role, data));
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      open(resp.notification.request.content.data);
      Notifications.clearLastNotificationResponse();
    });
    // Cold start: the notification that launched the app.
    void Notifications.getLastNotificationResponseAsync()
      .then((resp) => {
        if (resp) {
          open(resp.notification.request.content.data);
          Notifications.clearLastNotificationResponse();
        }
      })
      .catch(() => {});
    return () => sub.remove();
  }, [role]);

  const enable = useCallback(async () => {
    if (unavailableReason()) return;
    const perm = await Notifications.requestPermissionsAsync();
    if (perm.granted) {
      try {
        await register(true);
        setStatus("granted");
      } catch {
        setStatus("undetermined"); // permission OK but registration failed: let the user retry
      }
    } else {
      setStatus(perm.canAskAgain ? "undetermined" : "denied");
    }
  }, [register]);

  const openSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const value = useMemo(() => ({ status, reason, enable, openSettings }), [status, reason, enable, openSettings]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePush(): PushValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePush must be used within PushProvider");
  return v;
}

