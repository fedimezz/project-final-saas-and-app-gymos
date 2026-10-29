// src/lib/auth-server.ts
//
// This file was imported by several routes (admin/plans, admin/members/[id]/subscribe,
// dashboard/membership/*) but never existed in the repo — those routes would
// fail to build/run. Implemented here as a thin async wrapper around the
// cookie-first helpers in lib/auth.ts so all existing call sites
// (`const auth = await requireUser(request); if (isAuthResponse(auth)) return auth;`)
// work as originally intended.

import { NextRequest, NextResponse } from "next/server";
import { requireUser as requireUserSync, type JWTPayload } from "@/lib/auth";

export async function requireUser(
  request: NextRequest
): Promise<JWTPayload | NextResponse> {
  const result = await requireUserSync(request);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.status === 401 ? "Non authentifié" : "Accès refusé" },
      { status: result.status }
    );
  }
  return result.user;
}

export function isAuthResponse(
  value: JWTPayload | NextResponse
): value is NextResponse {
  return value instanceof NextResponse;
}
