import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { hashPassword } from "@/lib/bcrypt";
import { resolveTenantFromRequest, isClubUsable } from "@/lib/tenant";
import { checkLimit } from "@/lib/plan-limits";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { generateVerificationCode, hashSecret, minutesFromNow } from "@/lib/otp";
import { sendEmail, verificationCodeEmail } from "@/lib/email";
import { sendSms, verificationCodeSms } from "@/lib/sms";
import { runAfter } from "@/lib/after";
import { logAction } from "@/lib/activity-log";
import {
    registrationSchema,
    formatZodError,
} from "@/lib/validation";

export async function POST(request: NextRequest) {
    try {
        const ip = getClientIp(request);

        const rl = await checkRateLimit(
            `register:${ip}`,
            5,
            15 * 60 * 1000
        );

        if (!rl.allowed) {
            return NextResponse.json(
                {
                    error:
                        "Trop de tentatives. Réessayez dans quelques minutes.",
                },
                { status: 429 }
            );
        }

        const tenant = await resolveTenantFromRequest(request);

        if (!isClubUsable(tenant)) {
            return NextResponse.json(
                {
                    error:
                        "Ce club n'est pas disponible pour les inscriptions.",
                },
                { status: 404 }
            );
        }

        const rawBody = await request.json().catch(() => null);

        const parsed = registrationSchema.safeParse(rawBody);

        if (!parsed.success) {
            return NextResponse.json(
                {
                    error: formatZodError(parsed.error),
                },
                { status: 400 }
            );
        }

        const trimmedName = parsed.data.name;
        const normalizedEmail = parsed.data.email;
        const normalizedPhone = parsed.data.phone;
        const country = parsed.data.country;
        const password = parsed.data.password;

        const existingUser = await prisma.user.findFirst({
            where: {
                clubId: tenant.id,
                email: normalizedEmail,
            },
        });

        // A previous attempt that created the account but never got verified (e.g. the
        // verification email failed) must not lock the person out with "email already
        // used". The account is still unverified, so it is safe to let the new
        // submission replace its details and send a fresh code — whoever verifies it
        // proves they own the mailbox.
        const retryUnverified =
            !!existingUser &&
            existingUser.role === "MEMBER" &&
            !existingUser.emailVerified &&
            !existingUser.invitationToken;

        if (existingUser && !retryUnverified) {
            return NextResponse.json(
                {
                    error: "Cet email est déjà utilisé",
                },
                { status: 409 }
            );
        }

        const limitCheck = retryUnverified
            ? { ok: true as const }
            : await checkLimit(tenant.id, "maxMembers");

        if (!limitCheck.ok) {
            return NextResponse.json(
                {
                    error:
                        "Ce club n'accepte plus de nouvelles inscriptions pour le moment.",
                },
                { status: 402 }
            );
        }

        const hashedPassword = await hashPassword(password);

        const user = retryUnverified && existingUser
            ? await prisma.user.update({
                where: { id: existingUser.id },
                data: {
                    name: trimmedName,
                    phone: normalizedPhone,
                    country,
                    password: hashedPassword,
                },
                select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
            })
            : await prisma.$transaction(
            async (tx: Prisma.TransactionClient) => {
                const createdUser = await tx.user.create({
                    data: {
                        clubId: tenant.id,
                        name: trimmedName,
                        email: normalizedEmail,
                        phone: normalizedPhone,
                        country,
                        password: hashedPassword,
                        role: "MEMBER",
                        isActive: true,
                    },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        role: true,
                        createdAt: true,
                    },
                });

                const cardNumber = `LCG${Date.now()}${randomInt(0, 1000)}`;

                const expiresAt = new Date();

                expiresAt.setFullYear(
                    expiresAt.getFullYear() + 1
                );

                await tx.membershipCard.create({
                    data: {
                        clubId: tenant.id,
                        userId: createdUser.id,
                        cardNumber,
                        qrCode: `QR-${cardNumber}`,
                        expiresAt,
                    },
                });

                return createdUser;
            }
        );

        const verificationCode = generateVerificationCode();

        await prisma.user.update({
            where: {
                id: user.id,
            },
            data: {
                verificationCodeHash: hashSecret(verificationCode),
                verificationCodeExpiry: minutesFromNow(15),
            },
        });

        await logAction(request, {
            clubId: tenant.id,
            actorId: user.id,
            actorName: user.name,
            actorRole: user.role,
            action: "MEMBER_REGISTERED",
            category: "MEMBER",
            targetId: user.id,
            targetName: user.name,
            detail: { requiresEmailVerification: true },
        });

        // The account exists at this point: a mail-provider problem must not turn the
        // registration into a 500 (the person would retry and hit "email already used").
        // Report it instead; the verify page offers "Renvoyer le code".
        let emailSent = true;
        try {
            const { subject, html } = verificationCodeEmail(verificationCode);
            await sendEmail({ to: user.email, subject, html });
        } catch (emailError) {
            emailSent = false;
            console.error(
                "Registration: verification email failed:",
                emailError instanceof Error ? emailError.message : emailError
            );
        }

        // ============================================================
        // SMS VERIFICATION
        // ============================================================

        if (
            user.phone &&
            process.env.SMS_VERIFICATION_ENABLED === "true"
        ) {
            const phone = user.phone;
            const clubName = tenant.name;

            const [perPhone, perClub] = await Promise.all([
                checkRateLimit(
                    `sms-verify-phone:${phone}`,
                    3,
                    60 * 60 * 1000
                ),
                checkRateLimit(
                    `sms-verify-club:${tenant.id}`,
                    300,
                    24 * 60 * 60 * 1000
                ),
            ]);

            if (perPhone.allowed && perClub.allowed) {
                runAfter(() =>
                    sendSms({
                        to: phone,
                        body: verificationCodeSms(
                            verificationCode,
                            clubName
                        ),
                    }).catch((err) =>
                        console.error(
                            "Failed to send verification SMS:",
                            err instanceof Error
                                ? err.message
                                : err
                        )
                    )
                );
            }
        }

        // Do not log the user in before verification.
        return NextResponse.json(
            {
                message: emailSent
                    ? "Inscription réussie, vérifiez votre email"
                    : "Inscription réussie, mais l'email n'a pas pu être envoyé. Utilisez « Renvoyer le code ».",
                requiresVerification: true,
                emailSent,
                email: user.email,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error("Registration error:", error);

        return NextResponse.json(
            {
                error:
                    "Une erreur est survenue lors de l'inscription",
            },
            { status: 500 }
        );
    }
}