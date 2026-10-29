// src/lib/notify.ts
//
// Single entry point for "tell user(s) something happened, both
// persistently (DB row, so the bell still shows it after a refresh or for
// users who were offline) and live (SSE push, so connected users see it
// instantly without refreshing)."
//
// Deliberately mirrors your existing Notification model fields exactly —
// title / message / type / data — so nothing else in your schema needs to
// change.

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { broadcastToUser } from "@/lib/sse";
import { sendPushToUsers } from "@/lib/push";
import { runAfter } from "@/lib/after";

/**
 * Push (phone) delivery rides on every in-app notification: same title/body,
 * plus `type` and the original data so the app can deep-link. Runs after the
 * response so a slow push service never slows the request, and never throws.
 */
function pushInBackground(clubId: string, userIds: string[], input: NotifyInput) {
  runAfter(() =>
    sendPushToUsers(clubId, userIds, {
      title: input.title,
      body: input.message,
      data: { ...(input.data ?? {}), type: input.type },
    })
  );
}

interface NotifyInput {
  title: string;
  message: string;
  type: string;
  data?: Record<string, unknown>;
}

/** Notify a single user. clubId must be the caller's own verified club — never client input. */
export async function notifyUser(clubId: string, userId: string, input: NotifyInput) {
  const notification = await prisma.notification.create({
    data: {
      clubId,
      userId,
      title: input.title,
      message: input.message,
      type: input.type,
      data: input.data ? (input.data as unknown as Prisma.InputJsonValue) : undefined,
    },
  });

  await broadcastToUser(userId, "notification", notification);
  pushInBackground(clubId, [userId], input);
  return notification;
}

/**
 * Notify many users at once (e.g. "all members"). Each user gets their
 * own Notification row (so each can independently mark theirs read/unread
 * later), then each gets their own SSE push.
 *
 * clubId must be the caller's own verified club — never client input — and
 * every userId passed in must already be known to belong to that club
 * (callers derive userIds from a clubId-scoped query, never from raw input).
 *
 * For a gym-sized member list (tens to low thousands) a Promise.all loop
 * is fine. If your membership grows into the tens of thousands, switch
 * the write to prisma.notification.createMany and re-fetch by a batch
 * marker instead of creating one row per await.
 */
export async function notifyUsers(clubId: string, userIds: string[], input: NotifyInput) {
  if (userIds.length === 0) return [];

  const notifications = await Promise.all(
    userIds.map((userId) =>
      prisma.notification.create({
        data: {
          clubId,
          userId,
          title: input.title,
          message: input.message,
          type: input.type,
          data: input.data ? (input.data as unknown as Prisma.InputJsonValue) : undefined,
        },
      })
    )
  );

  await Promise.all(
    notifications.map((n) => broadcastToUser(n.userId, "notification", n))
  );
  pushInBackground(clubId, userIds, input);

  return notifications;
}

/** Notify every member of ONE gym (all roles, all active states). */
export async function notifyAllMembers(clubId: string, input: NotifyInput) {
  const members = await prisma.user.findMany({
    where: { clubId },
    select: { id: true },
  });
  return notifyUsers(clubId, members.map((m) => m.id), input);
}
