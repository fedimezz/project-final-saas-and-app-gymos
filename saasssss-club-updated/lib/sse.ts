// src/lib/sse.ts
//
// Server-Sent Events hub — Phase 10: backed by Upstash Redis pub/sub
// instead of an in-memory Map, so broadcasts reach every server instance
// (Vercel serverless, multiple containers behind a load balancer, etc.),
// not just the one that happens to hold the recipient's connection.
//
// Channels:
//   sse:user:{userId}     — one recipient (broadcastToUser)
//   sse:broadcast:all     — every connected client (broadcastToAll)
//
// Each SSE connection (app/api/sse/route.ts) opens its own Upstash Redis
// SSE subscription (redis.subscribe(...) — REST/fetch-based, so this is
// edge/serverless-safe, not a raw TCP Redis connection) to `sse:user:{id}`
// and `sse:broadcast:all`, and forwards whatever it receives into the
// browser's own SSE stream. Publishing (lib/notify.ts) just calls
// redis.publish(channel, json) — no knowledge of which instance holds the
// recipient's connection is needed anymore.
//
// DEV FALLBACK: if UPSTASH_REDIS_REST_URL/TOKEN aren't set (e.g. local dev
// without a configured Redis), this transparently falls back to the
// original in-memory Map behavior instead of failing outright. That only
// works correctly for a single running instance, which is exactly the
// local-dev case, so nothing regresses there.

import { Redis } from "@upstash/redis";

const REDIS_CONFIGURED = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);
const redis = REDIS_CONFIGURED ? Redis.fromEnv() : null;

const USER_CHANNEL = (userId: string) => `sse:user:${userId}`;
const ALL_CHANNEL = "sse:broadcast:all";

type Client = {
  userId: string;
  controller: ReadableStreamDefaultController;
  // Only set in Redis mode — lets unregisterClient tear down the
  // subscription. Undefined in the in-memory fallback.
  unsubscribe?: () => void;
};

// In-memory fallback store — only used when Redis isn't configured.
const memoryClients = new Set<Client>();

function send(controller: ReadableStreamDefaultController, event: string, data: unknown) {
  try {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    controller.enqueue(new TextEncoder().encode(payload));
  } catch {
    // Controller is already closed (client disconnected mid-broadcast).
    // The disconnect's own cleanup (in the route's cancel handler) is
    // responsible for removing it from `clients` — nothing to do here.
  }
}

/**
 * Registers one browser connection to receive events for `userId`.
 * Call unregisterClient(client) when the connection closes.
 */
export function registerClient(
  userId: string,
  controller: ReadableStreamDefaultController
): Client {
  if (!redis) {
    const client: Client = { userId, controller };
    memoryClients.add(client);
    return client;
  }

  const client: Client = { userId, controller };

  const subscriber = redis.subscribe([USER_CHANNEL(userId), ALL_CHANNEL]);
  subscriber.on("message", (payload: { channel: string; message: unknown }) => {
    const parsed = payload.message as { event: string; data: unknown };
    send(controller, parsed.event, parsed.data);
  });
  subscriber.on("error", () => {
    // Best-effort: a dropped Redis SSE subscription just means this one
    // browser tab stops receiving live updates until it reconnects;
    // nothing to recover here server-side.
  });

  client.unsubscribe = () => subscriber.unsubscribe();
  return client;
}

export function unregisterClient(client: Client) {
  if (redis) {
    client.unsubscribe?.();
    return;
  }
  memoryClients.delete(client);
}

/** Push an event to every connection belonging to one specific user. */
export async function broadcastToUser(userId: string, event: string, data: unknown) {
  if (redis) {
    await redis.publish(USER_CHANNEL(userId), JSON.stringify({ event, data })).catch(() => {});
    return;
  }
  for (const client of memoryClients) {
    if (client.userId === userId) send(client.controller, event, data);
  }
}

/** Push an event to a specific list of user IDs (e.g. "all members"). */
export async function broadcastToUsers(userIds: string[], event: string, data: unknown) {
  if (redis) {
    await Promise.all(
      userIds.map((id) =>
        redis!.publish(USER_CHANNEL(id), JSON.stringify({ event, data })).catch(() => {})
      )
    );
    return;
  }
  const idSet = new Set(userIds);
  for (const client of memoryClients) {
    if (idSet.has(client.userId)) send(client.controller, event, data);
  }
}

/** Only meaningful in the in-memory fallback — Redis mode has no single
 * process-wide count to report, since connections are spread across
 * however many server instances are running. Returns 0 in Redis mode. */
export function getConnectedClientCount() {
  return redis ? 0 : memoryClients.size;
}
