/**
 * lib/activity-log.ts
 *
 * Thin wrapper around Prisma's ActivityLog model.
 * Call logAction() from any API route — it never throws so a logging
 * failure never breaks the primary operation.
 *
 * Usage:
 *   await logAction(request, {
 *     actorId: admin.id, actorName: admin.name, actorRole: admin.role,
 *     action: "MEMBER_SUSPENDED",
 *     category: "MEMBER",
 *     targetId: member.id, targetName: member.name,
 *     detail: { reason: "non-payment" },
 *   });
 */

import prisma from "@/lib/prisma";
import { NextRequest } from "next/server";
import { resolveTenantFromRequest } from "@/lib/tenant";
import { detectDevice } from "@/lib/device";

export type LogCategory =
    | "AUTH"
    | "BOOKING"
    | "MEMBER"
    | "SESSION"
    | "PAYMENT"
    | "SUBSCRIPTION"
    | "SETTINGS"
    | "NOTIFICATION"
    | "SYSTEM"
    | "REPORT"
    | "STAFF"
    | "CONTENT";

export interface LogPayload {
  // Optional explicit override — pass this only when there's no tenant
  // host to resolve from (e.g. a SUPER_ADMIN platform action targeting a
  // specific club, or a cron job). Otherwise leave unset: logAction
  // resolves it from the request's Host header, same as every other
  // tenant-scoped query in this codebase.
  clubId?: string | null;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  action: string;
  category: LogCategory;
  targetId?: string;
  targetName?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail?: Record<string, any>;
}

function extractIp(req: NextRequest | Request): string | undefined {
  const r = req as NextRequest;
  return (
      r.headers?.get?.("x-forwarded-for")?.split(",")[0]?.trim() ??
      r.headers?.get?.("x-real-ip") ??
      undefined
  );
}

export async function logAction(
    req: NextRequest | Request | null,
    payload: LogPayload
): Promise<void> {
  try {
    // Resolve clubId from the request's tenant (Host header, with the
    // same dev fallbacks every other tenant query uses) unless the caller
    // passed one explicitly. This was previously never populated at all,
    // which silently broke every clubId-scoped log query (e.g.
    // GET /api/admin/logs always returned zero rows).
    let clubId = payload.clubId ?? null;
    if (clubId === null && payload.clubId === undefined && req) {
      try {
        const tenant = await resolveTenantFromRequest(req);
        clubId = tenant?.id ?? null;
      } catch {
        clubId = null;
      }
    }

    await prisma.activityLog.create({
      data: {
        clubId,
        actorId: payload.actorId ?? null,
        actorName: payload.actorName ?? null,
        actorRole: payload.actorRole ?? null,
        action: payload.action,
        category: payload.category,
        targetId: payload.targetId ?? null,
        targetName: payload.targetName ?? null,
        detail: req
          ? { ...(payload.detail ?? {}), device: detectDevice(req.headers) }
          : payload.detail ?? undefined,
        ip: req ? extractIp(req) : null,
        userAgent: req ? (req.headers?.get?.("user-agent") ?? null) : null,
      },
    });
  } catch {
    // Never propagate — logging must never break the caller.
  }
}

/** Convenience: log a SYSTEM action with no actor. */
export async function logSystem(action: string, detail?: Record<string, unknown>): Promise<void> {
  await logAction(null, {
    actorRole: "SYSTEM",
    action,
    category: "SYSTEM",
    detail,
  });
}