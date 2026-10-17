// POST /api/auth/resend-code  { email }
// Issues a fresh verification code and emails it. Rate-limited per
// email since this is an unauthenticated, enumeration-sensitive endpoint,
// with a 60-second cooldown between sends that the client can display.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateVerificationCode, hashSecret, minutesFromNow } from "@/lib/otp";
import { sendEmail, verificationCodeEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { formatZodError, resendCodeSchema } from "@/lib/validation";
import { resolveTenantFromRequest } from "@/lib/tenant";

const RESEND_COOLDOWN_SECONDS = 60;

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = resendCodeSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { email: normalizedEmail } = parsed.data;

    // Cooldown first (keyed by email only, so it applies identically whether or
    // not the account exists — no enumeration signal). `retryAfterSeconds`
    // drives the countdown on the verification page.
    const cooldown = await checkRateLimit(`resend-cooldown:${normalizedEmail}`, 1, RESEND_COOLDOWN_SECONDS * 1000);
    if (!cooldown.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil((cooldown.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: `Veuillez patienter ${retryAfterSeconds} s avant de redemander un code.`, retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      );
    }

    const rl = await checkRateLimit(`resend-code:${normalizedEmail}`, 3, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Trop de demandes. Réessayez dans quelques minutes." },
        { status: 429 }
      );
    }

    // Scoped to the current gym — email is unique per-club, not globally.
    // No tenant resolved (apex/platform host) means no matching gym user
    // can exist, so fall straight through to the generic "success" response
    // below without a lookup.
    const tenant = await resolveTenantFromRequest(request);
    const user = tenant
      ? await prisma.user.findFirst({ where: { clubId: tenant.id, email: normalizedEmail } })
      : null;

    // Always return success even if the user doesn't exist or is already
    // verified — don't let this endpoint be used to enumerate accounts.
    if (user && !user.emailVerified && !user.invitationToken) {
      const code = generateVerificationCode();
      await prisma.user.update({
        where: { id: user.id },
        data: {
          verificationCodeHash: hashSecret(code),
          verificationCodeExpiry: minutesFromNow(15),
        },
      });
      const { subject, html } = verificationCodeEmail(code);
      try {
        await sendEmail({ to: user.email, subject, html });
      } catch (emailError) {
        // Still answer generically (no enumeration); the cause is in the server log.
        console.error("Resend code: email failed:", emailError instanceof Error ? emailError.message : emailError);
      }
    }

    return NextResponse.json({
      message: "Si ce compte existe, un nouveau code a été envoyé.",
      cooldownSeconds: RESEND_COOLDOWN_SECONDS,
    });
  } catch (error) {
    console.error("Resend code error:", error);
    return NextResponse.json(
      { error: "Une erreur est survenue" },
      { status: 500 }
    );
  }
}
