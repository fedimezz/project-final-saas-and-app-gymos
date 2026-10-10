// lib/push.ts
//
// Real push delivery through Expo's push service (the mobile app registers an
// Expo push token per device — see /api/devices). Nothing here is simulated:
// every call below goes to https://exp.host/--/api/v2/push/send, and tokens
// the service reports as dead (DeviceNotRegistered) are deactivated so we stop
// sending to them.
//
// Tenant safety: every send is scoped by clubId AND the explicit userId list
// the caller derived from a clubId-scoped query. A token row whose clubId does
// not match is never selected.
//
// Optional hardening: set EXPO_ACCESS_TOKEN (Expo "enhanced push security")
// and the Bearer header is sent automatically.
import prisma from "@/lib/prisma";
import { log as logger } from "@/lib/logger";

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100; // Expo's documented per-request maximum
const REQUEST_TIMEOUT_MS = 10_000;

// ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx] (legacy prefix "ExpoPushToken[...]" is also valid).
const EXPO_TOKEN_RE = /^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]{8,64}\]$/;

export function isValidExpoPushToken(token: unknown): token is string {
  return typeof token === "string" && token.length <= 120 && EXPO_TOKEN_RE.test(token);
}

export interface PushPayload {
  title: string;
  body: string;
  /** Delivered to the app as notification.request.content.data (used for deep links). */
  data?: Record<string, unknown>;
}

export interface PushResult {
  attempted: number;
  accepted: number;
  rejected: number;
  deactivated: number;
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

const EMPTY: PushResult = { attempted: 0, accepted: 0, rejected: 0, deactivated: 0 };

/**
 * Send a push to the given users of ONE club. Never throws: a push outage must
 * not fail the request that triggered it (the persistent Notification row and
 * the SSE event are the source of truth; push is best-effort delivery).
 */
export async function sendPushToUsers(clubId: string, userIds: string[], payload: PushPayload): Promise<PushResult> {
  const uniqueIds = Array.from(new Set(userIds));
  if (!clubId || uniqueIds.length === 0) return { ...EMPTY };

  try {
    const devices = await prisma.deviceToken.findMany({
      where: {
        clubId,
        userId: { in: uniqueIds },
        isActive: true,
        // Respect the user's own switch (no preferences row = default ON),
        // and never push to a deactivated account.
        user: {
          isActive: true,
          OR: [{ preferences: { is: null } }, { preferences: { is: { pushNotifications: true } } }],
        },
      },
      select: { token: true },
    });

    const tokens = devices.map((d) => d.token).filter(isValidExpoPushToken);
    if (tokens.length === 0) return { ...EMPTY };

    const result: PushResult = { attempted: tokens.length, accepted: 0, rejected: 0, deactivated: 0 };
    const dead: string[] = [];

    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
      const chunk = tokens.slice(i, i + CHUNK_SIZE);
      const tickets = await postChunk(chunk, payload);
      if (!tickets) {
        result.rejected += chunk.length;
        continue;
      }
      tickets.forEach((ticket, idx) => {
        if (ticket.status === "ok") {
          result.accepted += 1;
        } else {
          result.rejected += 1;
          if (ticket.details?.error === "DeviceNotRegistered") dead.push(chunk[idx]);
        }
      });
    }

    if (dead.length > 0) {
      const { count } = await prisma.deviceToken.updateMany({
        where: { clubId, token: { in: dead } },
        data: { isActive: false },
      });
      result.deactivated = count;
    }

    return result;
  } catch (err) {
    logger.error("push_send_failed", { clubId, error: err instanceof Error ? err.message : String(err) });
    return { ...EMPTY };
  }
}

async function postChunk(tokens: string[], payload: PushPayload): Promise<ExpoTicket[] | null> {
  const messages = tokens.map((to) => ({
    to,
    title: payload.title.slice(0, 120),
    body: payload.body.slice(0, 400),
    data: payload.data ?? {},
    sound: "default",
    priority: "high",
    channelId: "default", // Android channel created by the app
  }));

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(messages),
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn("push_http_error", { status: res.status });
      return null;
    }
    const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[] } | null;
    if (!json || !Array.isArray(json.data) || json.data.length !== tokens.length) {
      logger.warn("push_bad_response", { expected: tokens.length });
      return null;
    }
    return json.data;
  } catch (err) {
    logger.warn("push_request_failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
