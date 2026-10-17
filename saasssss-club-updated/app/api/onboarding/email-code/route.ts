import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { generateVerificationCode, hashSecret, minutesFromNow } from "@/lib/otp";
import { sendEmail, verificationCodeEmail } from "@/lib/email";

const emailSchema = z.object({
  email: z.string().trim().email("Email invalide").toLowerCase().max(254),
});

const verifySchema = emailSchema.extend({
  code: z.string().trim().regex(/^\d{6}$/, "Code invalide"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = emailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });
    }

    const { email } = parsed.data;
    const [emailLimit, ipLimit] = await Promise.all([
      checkRateLimit(`onboarding-email:${email}`, 3, 60 * 60 * 1000),
      checkRateLimit(`onboarding-email-ip:${getClientIp(request)}`, 10, 15 * 60 * 1000),
    ]);
    if (!emailLimit.allowed || !ipLimit.allowed) {
      return NextResponse.json({ error: "Trop de demandes. Réessayez plus tard." }, { status: 429 });
    }

    const existingUser = await prisma.user.findFirst({ where: { email }, select: { id: true } });
    if (existingUser) {
      return NextResponse.json({ error: "Cet email est déjà associé à un compte." }, { status: 409 });
    }

    const now = new Date();
    await prisma.onboardingEmailVerification.deleteMany({ where: { expiresAt: { lte: now } } });

    const code = generateVerificationCode();
    await prisma.onboardingEmailVerification.upsert({
      where: { email },
      create: {
        email,
        codeHash: hashSecret(code),
        expiresAt: minutesFromNow(15),
      },
      update: {
        codeHash: hashSecret(code),
        verificationTokenHash: null,
        expiresAt: minutesFromNow(15),
        verifiedAt: null,
        consumedAt: null,
      },
    });

    const { subject, html } = verificationCodeEmail(code);
    await sendEmail({ to: email, subject, html });

    return NextResponse.json({ message: "Un code de vérification a été envoyé par email." });
  } catch (error) {
    console.error("Onboarding email-code POST error:", error);
    return NextResponse.json({ error: "Impossible d'envoyer le code. Réessayez." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Email ou code invalide." }, { status: 400 });
    }

    const { email, code } = parsed.data;
    const [emailLimit, ipLimit] = await Promise.all([
      checkRateLimit(`onboarding-email-verify:${email}`, 8, 15 * 60 * 1000),
      checkRateLimit(`onboarding-email-verify-ip:${getClientIp(request)}`, 30, 15 * 60 * 1000),
    ]);
    if (!emailLimit.allowed || !ipLimit.allowed) {
      return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
    }

    const verification = await prisma.onboardingEmailVerification.findUnique({
      where: { email },
      select: { id: true, codeHash: true, expiresAt: true, consumedAt: true },
    });
    if (
      !verification ||
      verification.consumedAt ||
      verification.expiresAt <= new Date() ||
      hashSecret(code) !== verification.codeHash
    ) {
      return NextResponse.json({ error: "Code invalide ou expiré." }, { status: 400 });
    }

    const verificationToken = randomBytes(32).toString("base64url");
    const result = await prisma.onboardingEmailVerification.updateMany({
      where: {
        id: verification.id,
        codeHash: verification.codeHash,
        expiresAt: { gt: new Date() },
        consumedAt: null,
      },
      data: {
        codeHash: "",
        verificationTokenHash: hashSecret(verificationToken),
        verifiedAt: new Date(),
      },
    });
    if (result.count !== 1) {
      return NextResponse.json({ error: "Code invalide ou expiré." }, { status: 400 });
    }

    return NextResponse.json({ verified: true, verificationToken });
  } catch (error) {
    console.error("Onboarding email-code PATCH error:", error);
    return NextResponse.json({ error: "Impossible de vérifier le code. Réessayez." }, { status: 500 });
  }
}
