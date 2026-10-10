// Pure push-notification helpers (no Expo / React imports) so they can be unit
// tested with the plain node test runner.

// ExponentPushToken[xxxxxxxx…] — same rule the server enforces in /api/devices.
const EXPO_TOKEN_RE = /^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]{8,64}\]$/;

export function isValidExpoPushToken(token: unknown): token is string {
  return typeof token === "string" && token.length <= 120 && EXPO_TOKEN_RE.test(token);
}

interface ProjectIdSources {
  expoConfig?: { extra?: { eas?: { projectId?: unknown } } | null } | null;
  easConfig?: { projectId?: unknown } | null;
}

/** The EAS project id Expo needs to mint a push token (set by `eas init`). */
export function resolveProjectId(constants: ProjectIdSources): string | null {
  const fromExtra = constants.expoConfig?.extra?.eas?.projectId;
  const fromEas = constants.easConfig?.projectId;
  for (const candidate of [fromExtra, fromEas]) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  }
  return null;
}

export type MobileRole = "MEMBER" | "COACH";

export type PushTab =
  | { navigator: "MemberTabs"; screen: "Home" | "Schedule" | "Bookings" | "Notifications" | "Profile" }
  | { navigator: "CoachTabs"; screen: "Today" | "CoachPlanning" | "CoachSessions" | "CoachNotifications" | "CoachProfile" };

/**
 * Which tab a tapped notification should open. The payload comes from the
 * server (lib/push.ts): `type` is the notification type, `kind` the finer event.
 * Unknown payloads fall back to the Notifications tab, never to a crash.
 */
export function pushTabFor(role: MobileRole, data: unknown): PushTab {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const kind = typeof d.kind === "string" ? d.kind : "";
  const type = typeof d.type === "string" ? d.type : "";
  const coach = role === "COACH";

  if (kind === "schedule_change") {
    return coach ? { navigator: "CoachTabs", screen: "CoachPlanning" } : { navigator: "MemberTabs", screen: "Schedule" };
  }
  if (type === "SESSION_REMINDER" || type === "BOOKING" || kind.includes("booking") || kind.includes("session")) {
    return coach ? { navigator: "CoachTabs", screen: "CoachSessions" } : { navigator: "MemberTabs", screen: "Bookings" };
  }
  return coach ? { navigator: "CoachTabs", screen: "CoachNotifications" } : { navigator: "MemberTabs", screen: "Notifications" };
}
