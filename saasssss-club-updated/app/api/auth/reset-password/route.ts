import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/bcrypt";
import { generateVerificationCode, hashSecret, minutesFromNow } from "@/lib/otp";
import { sendEmail, passwordResetCodeEmail } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { formatZodError, resetPasswordRequestSchema, resetPasswordSchema } from "@/lib/validation";
import { resolveTenantFromRequest } from "@/lib/tenant";
import { isPlatformHost } from "@/lib/tenant-url";
import { runAfter } from "@/lib/after";

function platformRequest(request: NextRequest): boolean {
  const host = request.headers.get("host")
    ?? request.nextUrl.host;
  const hostname = host.split(":")[0].toLowerCase();
  return isPlatformHost(host) ||
    (process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(hostname));
}

async function findResetUsers(request: NextRequest, email: string, portal?: "platform") {
  const tenant = await resolveTenantFromRequest(request);
  if (tenant) {
    const user = await prisma.user.findFirst({
      where: { clubId: tenant.id, email, isActive: true },
      select: {
        id: true,
        email: true,
        resetTokenHash: true,
        resetTokenExpiry: true,
        isActive: true,
        role: true,
        club: { select: { name: true, slug: true } },
      },
    });
    return user ? [user] : [];
  }
  if (portal === "platform" && platformRequest(request)) {
    return prisma.user.findMany({
      where: {
        email,
        isActive: true,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
      },
      select: {
        id: true,
        email: true,
        resetTokenHash: true,
        resetTokenExpiry: true,
        isActive: true,
        role: true,
        club: { select: { name: true, slug: true } },
      },
    });
  }
  return [];
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = resetPasswordRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { email, portal } = parsed.data;

    const [emailLimit, ipLimit] = await Promise.all([
      checkRateLimit(`reset-request:${portal ?? "club"}:${email}`, 3, 15 * 60 * 1000),
      checkRateLimit(`reset-request-ip:${getClientIp(request)}`, 10, 15 * 60 * 1000),
    ]);
    if (!emailLimit.allowed || !ipLimit.allowed) {
      return NextResponse.json(
        { error: "Trop de demandes. Réessayez dans quelques minutes." },
        { status: 429 }
      );
    }

    const users = await findResetUsers(request, email, portal);
    if (users.length > 0) {
      const code = generateVerificationCode();
      await prisma.user.updateMany({
        where: { id: { in: users.map((user) => user.id) }, isActive: true },
        data: {
          resetTokenHash: hashSecret(code),
          resetTokenExpiry: minutesFromNow(15),
        },
      });

      const { subject, html } = passwordResetCodeEmail(code);
      runAfter(() =>
        sendEmail({ to: email, subject, html }).catch((error) => {
          console.error("Password reset email delivery failed:", error instanceof Error ? error.message : error);
        })
      );
    }

    return NextResponse.json({
      message: "Si ce compte existe, un code de réinitialisation a été envoyé.",
    });
  } catch (error) {
    console.error("Reset password request error:", error);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = resetPasswordSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { email, code, newPassword, portal, accountId } = parsed.data;

    const [emailLimit, ipLimit] = await Promise.all([
      checkRateLimit(`reset-confirm:${portal ?? "club"}:${email}`, 8, 15 * 60 * 1000),
      checkRateLimit(`reset-confirm-ip:${getClientIp(request)}`, 30, 15 * 60 * 1000),
    ]);
    if (!emailLimit.allowed || !ipLimit.allowed) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez plus tard." },
        { status: 429 }
      );
    }

    const invalidResponse = NextResponse.json({ error: "Code invalide ou expiré." }, { status: 400 });
    const now = new Date();
    const users = await findResetUsers(request, email, portal);
    const codeHash = hashSecret(code);
    const matchingUsers = users.filter((user) =>
      user.resetTokenHash === codeHash &&
      user.resetTokenExpiry !== null &&
      user.resetTokenExpiry > now
    );
    if (matchingUsers.length === 0) return invalidResponse;

    if (portal === "platform" && !accountId && matchingUsers.length > 1) {
      return NextResponse.json({
        error: "Plusieurs comptes correspondent à cette adresse. Choisissez le compte à réinitialiser.",
        requiresAccountSelection: true,
        accounts: matchingUsers.map((user) => ({
          id: user.id,
          label: user.role === "SUPER_ADMIN"
            ? "Compte Super Admin"
            : `${user.role === "OWNER" ? "Propriétaire" : "Administrateur"} — ${user.club?.name ?? user.club?.slug ?? "Club"}`,
        })),
      }, { status: 409 });
    }

    const user = accountId
      ? matchingUsers.find((candidate) => candidate.id === accountId)
      : matchingUsers[0];
    if (!user) return invalidResponse;

    const hashedPassword = await hashPassword(newPassword);
    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: {
          id: user.id,
          resetTokenHash: codeHash,
          resetTokenExpiry: { gt: now },
        },
        data: {
          password: hashedPassword,
          resetTokenHash: null,
          resetTokenExpiry: null,
          passwordChangedAt: now,
        },
      });
      if (changed.count !== 1) return 0;

      const otherAccountIds = matchingUsers
        .filter((candidate) => candidate.id !== user.id)
        .map((candidate) => candidate.id);
      if (otherAccountIds.length > 0) {
        await tx.user.updateMany({
          where: { id: { in: otherAccountIds }, resetTokenHash: codeHash },
          data: { resetTokenHash: null, resetTokenExpiry: null },
        });
      }
      return changed.count;
    });
    if (updated !== 1) return invalidResponse;

    return NextResponse.json({ message: "Mot de passe réinitialisé avec succès" });
  } catch (error) {
    console.error("Reset password confirm error:", error);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
