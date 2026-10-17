import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashSecret } from "@/lib/otp";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
    formatZodError,
    otpSchema,
} from "@/lib/validation";
import {
    resolveTenantFromRequest,
    isClubUsable,
} from "@/lib/tenant";
import { generateToken } from "@/lib/auth";
import { setAuthCookie } from "@/lib/auth-cookie";

// POST /api/auth/verify { email, code }

export async function POST(request: NextRequest) {
    try {
        const rawBody = await request.json().catch(() => null);

        const parsed = otpSchema.safeParse(rawBody);

        if (!parsed.success) {
            return NextResponse.json(
                {
                    error: formatZodError(parsed.error),
                },
                { status: 400 }
            );
        }

        const {
            email: normalizedEmail,
            code,
        } = parsed.data;

        // Rate limiting.
        const emailLimit = await checkRateLimit(
            `verify:email:${normalizedEmail}`,
            8,
            15 * 60 * 1000
        );

        const ipLimit = await checkRateLimit(
            `verify:ip:${getClientIp(request)}`,
            30,
            15 * 60 * 1000
        );

        if (!emailLimit.allowed || !ipLimit.allowed) {
            return NextResponse.json(
                {
                    error:
                        "Trop de tentatives. Réessayez dans quelques minutes.",
                },
                { status: 429 }
            );
        }

        // Resolve tenant from the request host.
        const tenant = await resolveTenantFromRequest(request);

        const user = tenant
            ? await prisma.user.findFirst({
                where: {
                    clubId: tenant.id,
                    email: normalizedEmail,
                },
            })
            : null;

        const invalidResponse = NextResponse.json(
            {
                error: "Code invalide ou expiré",
            },
            { status: 400 }
        );

        if (!user?.verificationCodeHash || !user.verificationCodeExpiry) {
            return invalidResponse;
        }

        // Staff-created accounts use invitations.
        if (user.invitationToken) {
            return invalidResponse;
        }

        // Check expiration.
        if (
            user.verificationCodeExpiry < new Date()
        ) {
            return invalidResponse;
        }

        if (hashSecret(code) !== user.verificationCodeHash) {
            return invalidResponse;
        }

        // Mark email as verified and consume the code.
        await prisma.user.update({
            where: {
                id: user.id,
            },
            data: {
                emailVerified: new Date(),
                verificationCodeHash: null,
                verificationCodeExpiry: null,
            },
        });

        // Automatically log in active normal users.
        if (
            user.isActive &&
            tenant &&
            isClubUsable(tenant) &&
            user.role !== "SUPER_ADMIN"
        ) {
            const token = generateToken(
                {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    name: user.name,
                    clubId: user.clubId,
                },
                "7d"
            );

            const response = NextResponse.json({
                message: "Email vérifié avec succès",
                loggedIn: true,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                },
            });

            setAuthCookie(
                response,
                token,
                request.url,
                {
                    maxAgeSeconds: 60 * 60 * 24 * 7,
                }
            );

            return response;
        }

        return NextResponse.json({
            message: "Email vérifié avec succès",
            loggedIn: false,
        });
    } catch (error) {
        console.error(
            "Verify error:",
            error
        );

        return NextResponse.json(
            {
                error:
                    "Une erreur est survenue lors de la vérification",
            },
            { status: 500 }
        );
    }
}