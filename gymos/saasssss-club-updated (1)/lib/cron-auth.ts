// lib/cron-auth.ts — shared guard for /api/cron/* routes.
//
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` on every invocation.
//
// The previous inline check (`auth !== \`Bearer ${process.env.CRON_SECRET}\``)
// had a fail-open bug: when CRON_SECRET was unset, the expected string became
// the literal "Bearer undefined", so anyone could trigger the crons by sending
// exactly that header. This guard fails CLOSED when the secret is missing or
// too short, and compares in constant time.

import { timingSafeEqual } from "node:crypto";

const MIN_SECRET_LENGTH = 16;

export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
