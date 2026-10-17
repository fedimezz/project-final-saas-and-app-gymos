// lib/platform-clubs.ts
//
// Shared building blocks for the SUPER_ADMIN club CRUD
// (/api/platform/clubs and /api/platform/clubs/[id]): validation schemas,
// club provisioning, cascade deletion and a few small helpers.
//
// Kept out of the route files so the rules live in one testable place.
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { slugSchema } from "@/lib/slug";
import { emailSchema, passwordSchema, phoneSchema } from "@/lib/validation";

export const DEFAULT_TRIAL_DAYS = 14;
export const MAX_TRIAL_DAYS = 90;
export const TRIAL_EXPIRED_REASON = "Trial expired"; // must match app/api/cron/trial-check

export const DEFAULT_ENABLED_PAGES = { home: true, schedule: true, coaches: true, pricing: true, contact: true };

const DAY_MS = 86_400_000;

// ─── Custom domain ───────────────────────────────────────────────────────────

/** Hostname of the platform itself (APP_URL), without a leading "www.". */
export function platformHostname(): string | null {
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return null;
  try {
    return new URL(appUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** "https://WWW.MonGym.tn:443/path" → "www.mongym.tn" */
export function normalizeCustomDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

const HOSTNAME_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function isValidCustomDomain(host: string): boolean {
  return HOSTNAME_RE.test(host);
}

/** A custom domain must never be (or sit under) the platform's own domain. */
export function collidesWithPlatform(host: string): boolean {
  const base = platformHostname();
  if (!base) return false;
  return host === base || host === `www.${base}` || host.endsWith(`.${base}`);
}

export const customDomainSchema = z
  .string()
  .max(300, "Domaine trop long")
  .nullable()
  .optional()
  .transform((v) => {
    if (v == null) return v;
    const normalized = normalizeCustomDomain(v);
    return normalized === "" ? null : normalized;
  })
  .refine((v) => v == null || isValidCustomDomain(v), "Domaine invalide (ex : www.mongym.tn)")
  .refine((v) => v == null || !collidesWithPlatform(v), "Ce domaine appartient à la plateforme");

// ─── Schemas ─────────────────────────────────────────────────────────────────

const clubNameSchema = z.string().trim().min(2, "Nom du club trop court").max(100, "Nom du club trop long");
const personNameSchema = z.string().trim().min(2, "Nom trop court").max(80, "Nom trop long");
const optionalPhoneSchema = z
  .union([phoneSchema, z.literal("")])
  .optional()
  .transform((v) => (v ? v : undefined));

export const createClubSchema = z.object({
  name: clubNameSchema,
  slug: slugSchema,
  planId: z.string().min(1, "Plan obligatoire"),
  ownerName: personNameSchema,
  ownerEmail: emailSchema,
  ownerPhone: optionalPhoneSchema,
  ownerPassword: passwordSchema,
  trialDays: z.number().int().min(1, "Essai : 1 jour minimum").max(MAX_TRIAL_DAYS, `Essai : ${MAX_TRIAL_DAYS} jours maximum`).optional(),
  customDomain: customDomainSchema,
});
export type CreateClubInput = z.infer<typeof createClubSchema>;

export const updateClubSchema = z
  .object({
    name: clubNameSchema.optional(),
    slug: slugSchema.optional(),
    customDomain: customDomainSchema,
    owner: z
      .object({
        name: personNameSchema.optional(),
        email: emailSchema.optional(),
        phone: z.union([phoneSchema, z.literal("")]).optional(),
      })
      .optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.slug !== undefined || v.customDomain !== undefined || v.owner !== undefined,
    "Aucune modification fournie",
  );
export type UpdateClubInput = z.infer<typeof updateClubSchema>;

const reasonSchema = z.string().trim().max(500, "Motif trop long (500 caractères max.)").optional();

export const clubActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suspend"), reason: reasonSchema }),
  z.object({ action: z.literal("freeze"), reason: reasonSchema }), // legacy alias of "suspend"
  z.object({ action: z.literal("activate") }),
  z.object({ action: z.literal("unfreeze") }), // legacy alias of "activate"
  z.object({ action: z.literal("ban"), reason: reasonSchema }),
  z.object({ action: z.literal("change_plan"), planId: z.string().min(1, "planId requis pour changer de plan") }),
  z.object({
    action: z.literal("extend_trial"),
    days: z.number().int().min(1, "Minimum 1 jour").max(MAX_TRIAL_DAYS, `Maximum ${MAX_TRIAL_DAYS} jours`),
  }),
  z.object({ action: z.literal("reset_owner_password"), password: passwordSchema }),
]);
export type ClubAction = z.infer<typeof clubActionSchema>;

export const deleteClubSchema = z.object({ confirmSlug: z.string().trim().min(1, "Confirmation requise") });

// ─── Query params for the list endpoint ──────────────────────────────────────

export const CLUB_SORT_FIELDS = ["createdAt", "name", "status"] as const;
export type ClubSortField = (typeof CLUB_SORT_FIELDS)[number];

export function parseSort(sort: string | null, order: string | null): { field: ClubSortField; order: "asc" | "desc" } {
  const field = (CLUB_SORT_FIELDS as readonly string[]).includes(sort ?? "") ? (sort as ClubSortField) : "createdAt";
  const dir = order === "asc" ? "asc" : "desc";
  return { field, order: dir };
}

// ─── Errors ──────────────────────────────────────────────────────────────────

/** True for a Prisma unique-constraint violation; optionally on a specific column. */
export function isUniqueViolation(error: unknown, column?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  if (!column) return true;
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.some((t) => String(t).toLowerCase().includes(column.toLowerCase()));
  if (typeof target === "string") return target.toLowerCase().includes(column.toLowerCase());
  return false;
}

// ─── Provisioning ────────────────────────────────────────────────────────────

/**
 * Creates Club + OWNER + TRIALING ClubSubscription + GymSettings atomically.
 * Mirrors /api/onboarding/create-club so a club created by the platform team
 * is indistinguishable from a self-service one (same default pages, same
 * trial handling — including `enabledPages`, which the public site relies on).
 */
export async function provisionClub(input: {
  name: string;
  slug: string;
  planId: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string;
  passwordHash: string;
  trialDays?: number;
  customDomain?: string | null;
}) {
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + (input.trialDays ?? DEFAULT_TRIAL_DAYS) * DAY_MS);

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const club = await tx.club.create({
      data: {
        name: input.name,
        slug: input.slug,
        status: "TRIAL",
        trialEndsAt,
        ...(input.customDomain ? { customDomain: input.customDomain } : {}),
      },
    });
    const owner = await tx.user.create({
      data: {
        clubId: club.id,
        name: input.ownerName,
        email: input.ownerEmail,
        phone: input.ownerPhone ?? null,
        password: input.passwordHash,
        role: "OWNER",
        isActive: true,
        emailVerified: now,
      },
      select: { id: true, name: true, email: true },
    });
    await tx.clubSubscription.create({
      data: { clubId: club.id, planId: input.planId, status: "TRIALING", trialEndsAt, currentPeriodStart: now, currentPeriodEnd: trialEndsAt },
    });
    await tx.gymSettings.create({
      data: { clubId: club.id, name: input.name, enabledPages: DEFAULT_ENABLED_PAGES },
    });
    return { club, owner };
  });
}

// ─── Deletion ────────────────────────────────────────────────────────────────

/**
 * Permanently removes a club and everything it owns.
 *
 * `User.clubId` is `onDelete: Restrict` (and `Subscription.planId` →
 * `MembershipPlan` is Restrict too), so a bare `club.delete()` fails as soon
 * as the club has a single user — i.e. always. Children are therefore removed
 * explicitly, in dependency order, inside one transaction; everything else
 * hangs off Club with ON DELETE CASCADE.
 */
export async function deleteClubCascade(clubId: string): Promise<void> {
  await prisma.$transaction([
    prisma.subscription.deleteMany({ where: { clubId } }),
    prisma.user.deleteMany({ where: { clubId } }),
    prisma.club.delete({ where: { id: clubId } }),
  ]);
}

// ─── Trial helpers ───────────────────────────────────────────────────────────

/** New trial end: extends from the later of (now, current end) so days are never lost. */
export function computeExtendedTrialEnd(current: Date | null, days: number, now: Date = new Date()): Date {
  const base = current && current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + days * DAY_MS);
}