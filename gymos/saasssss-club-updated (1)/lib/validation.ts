// src/lib/validation.ts
//
// Reusable Zod primitives for API route input validation. The project has
// had `zod` installed (used by react-hook-form on the client) but zero API
// routes actually validated with it server-side — routes instead used
// ad-hoc `typeof x !== "string"` checks, which don't catch things like
// missing max-length bounds, and can throw uncaught TypeErrors when a
// client sends the wrong JSON type for an "optional" field (e.g.
// `transactionId?.trim()` on a client-sent number).
//
// This file is a starting set covering the fields that show up across
// several routes (email, phone, password, pagination, ids) — not a
// project-wide validation layer yet. Extend it as more routes are
// migrated; don't duplicate these primitives inline in a route.
import { HERO_MODEL_IDS } from "@/lib/website-themes";
import { z } from "zod";
import { MEMBERSHIP_CURRENCIES } from "@/lib/payment-currencies";
import { isValidCountryCode } from "@/lib/countries";
import { toE164 } from "@/lib/phone";
import { normalizeDomain } from "@/lib/domain-requests";
import { safeImageUrl } from "@/lib/image-url";
import { SERVICE_TYPES, ORDERABLE_SERVICE_TYPES } from "@/lib/service-catalog";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email("Adresse email invalide");

// Used wherever a NEW password is chosen (register, reset, change, invitation
// acceptance, staff/coach creation): 8+ chars with at least one lower-case
// letter, one upper-case letter and one digit. Login deliberately does NOT use
// this (see loginSchema) so legacy weaker passwords can still sign in.
export const passwordSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères")
  .max(200)
  .refine((v) => /[a-z]/.test(v), "Le mot de passe doit contenir au moins une minuscule")
  .refine((v) => /[A-Z]/.test(v), "Le mot de passe doit contenir au moins une majuscule")
  .refine((v) => /\d/.test(v), "Le mot de passe doit contenir au moins un chiffre");

// ISO 3166-1 alpha-2, validated against the known list (lib/countries.ts).
export const countrySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isValidCountryCode, "Pays invalide");

// Tunisian/international-ish phone formats: digits, spaces, +, -, (), 7-20
// chars. Matches the regex already used in dashboard/profile PUT, so both
// paths that accept a phone number are consistent with each other.
export const phoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(20)
  .regex(/^[+]?[\d\s\-().]{7,20}$/, "Format de téléphone invalide");

// A phone number that must normalise to a valid E.164 value; the parsed value
// IS the E.164 string ("+21620123456"), ready to store. Bare 8-digit numbers
// are assumed Tunisian. (registrationSchema below additionally uses the
// request's `country` to interpret national-format numbers.)
export const phoneWithCountrySchema = z
  .string()
  .trim()
  .min(7, "Numéro de téléphone invalide")
  .max(25, "Numéro de téléphone invalide")
  .transform((v, ctx) => {
    const e164 = toE164(v);
    if (!e164) {
      ctx.addIssue({ code: "custom", message: "Numéro de téléphone invalide" });
      return z.NEVER;
    }
    return e164;
  });

export const nameSchema = z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(100);

export const cuidSchema = z.string().trim().min(1, "Identifiant requis");

// A safe, bounded free-text field for things like bios/descriptions that
// get rendered back to users — bounds length, doesn't attempt HTML
// sanitization here (that's the CMS content pipeline's job for rich text).
export const shortTextSchema = (max: number) => z.string().trim().max(max);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Optional ISO date string -> Date. Used across promotions/schedule/reports
// wherever a client sends a date as JSON (JSON has no Date type).
export const dateStringSchema = z.coerce.date();

// Money/decimal fields (promotion discount values, plan prices, payment
// amounts). Bounded well above any real gym price to catch fat-finger or
// malicious huge values without hardcoding a "real" business ceiling.
export const positiveAmountSchema = z.coerce.number().finite().positive().max(1_000_000);

export const promotionSchema = z
  .object({
    code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/, "Le code ne doit contenir que lettres, chiffres, - et _"),
    title: z.string().trim().min(2).max(150),
    description: shortTextSchema(1000).optional().or(z.literal("")),
    discountType: z.enum(["PERCENT", "FIXED"]),
    discountValue: positiveAmountSchema,
    startDate: dateStringSchema.optional(),
    endDate: dateStringSchema.nullable().optional(),
    maxUses: z.coerce.number().int().positive().max(1_000_000).nullable().optional(),
    isActive: z.boolean().optional(),
    // Show this offer on the club's public pages (default: yes).
    isPublic: z.boolean().optional(),
  })
  .refine((d) => d.discountType !== "PERCENT" || d.discountValue <= 100, {
    message: "Un pourcentage ne peut pas dépasser 100",
    path: ["discountValue"],
  });

// Same shape as promotionSchema but every field optional (PATCH) — no
// .refine() percent<=100 check here since a PATCH might change discountType
// and discountValue in separate requests; that invariant is still enforced
// route-side using the merged existing+incoming values.
export const promotionUpdateSchema = z.object({
  title: z.string().trim().min(2).max(150).optional(),
  description: shortTextSchema(1000).nullable().optional(),
  discountType: z.enum(["PERCENT", "FIXED"]).optional(),
  discountValue: positiveAmountSchema.optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.nullable().optional(),
  maxUses: z.coerce.number().int().positive().max(1_000_000).nullable().optional(),
  isActive: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

export const memberReportSchema = z.object({
  subject: z.string().trim().min(1, "Le sujet est requis").max(150),
  message: z.string().trim().min(1, "Le message est requis").max(3000),
});

export const memberReportUpdateSchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "RESOLVED"]).optional(),
  adminNote: shortTextSchema(2000).nullable().optional(),
});

export const recordPaymentSchema = z.object({
  subscriptionId: cuidSchema,
  amount: positiveAmountSchema,
  paymentMethod: z.enum(["CASH", "CARD", "TRANSFER"]),
  transactionId: z.string().trim().max(200).optional().or(z.literal("")),
});

export const subscriptionUpdateSchema = z.object({
  status: z.enum(["PENDING", "ACTIVE", "EXPIRED", "CANCELLED", "SUSPENDED"]).optional(),
  endDate: dateStringSchema.optional(),
  autoRenew: z.boolean().optional(),
});

export const subscriptionActionSchema = z.object({
  subscriptionId: cuidSchema,
  action: z.enum(["approve", "cancel", "suspend"]),
});

export const planSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: shortTextSchema(1000).optional().or(z.literal("")).nullable(),
  price: positiveAmountSchema,
  currency: z.enum(MEMBERSHIP_CURRENCIES).default("TND"),
  durationDays: z.coerce.number().int().positive().max(3650),
  features: z.array(z.string().trim().max(200)).max(50).optional(),
});

export const planUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: shortTextSchema(1000).nullable().optional(),
  price: positiveAmountSchema.optional(),
  currency: z.enum(MEMBERSHIP_CURRENCIES).optional(),
  durationDays: z.coerce.number().int().positive().max(3650).optional(),
  features: z.array(z.string().trim().max(200)).max(50).optional(),
  isActive: z.boolean().optional(),
});

export const permissionUpdateSchema = z.object({
  key: z.string().trim().min(1).max(100),
  allowed: z.boolean(),
  // Which role the toggle applies to (defaults to ADMIN for older clients).
  role: z.enum(["ADMIN", "COACH"]).optional(),
});

export const weeklyPlanSchema = z
  .object({
    weekStart: dateStringSchema,
    weekEnd: dateStringSchema,
    isActive: z.boolean().optional(),
  })
  .refine((d) => d.weekEnd > d.weekStart, {
    message: "weekEnd doit être après weekStart",
    path: ["weekEnd"],
  });

export const weeklyPlanActionSchema = z.object({
  action: z.enum(["activate", "archive"]),
});

const optionalUrl = () =>
  z.string().trim().url("URL invalide").max(2000).optional().or(z.literal(""));
// Image URLs that get rendered with next/image: https on an allow-listed host
// (Cloudinary) or a same-origin path. Anything else is refused at save time.
const optionalImageUrl = () =>
  z.string().trim().max(2000)
    .refine((v) => v === "" || safeImageUrl(v) !== null, "URL d'image non autorisée (utilisez l'envoi de fichier)")
    .optional();
const optionalHexColor = () =>
  z.string().trim().regex(/^#[0-9a-fA-F]{3,8}$/, "Couleur invalide (format hex attendu)").optional().or(z.literal(""));

export const gymSettingsSchema = z.object({
  name: z.string().trim().min(1, "Le nom du club ne peut pas être vide").max(150).optional(),
  logoUrl: optionalImageUrl(),
  address: shortTextSchema(300).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email("Email invalide").max(200).optional().or(z.literal("")),
  workingHours: z.record(z.string(), z.unknown()).optional(),
  facebookUrl: optionalUrl(),
  instagramUrl: optionalUrl(),
  tiktokUrl: optionalUrl(),
  twitterUrl: optionalUrl(),
  youtubeUrl: optionalUrl(),
  websiteUrl: optionalUrl(),
  description: shortTextSchema(1000).optional().or(z.literal("")),
  secondaryColor: optionalHexColor(),
  primaryColor: optionalHexColor(),
  backgroundColor: optionalHexColor(),
  backgroundColorDark: optionalHexColor(),
  enabledPages: z.record(z.string(), z.unknown()).optional(),
  heroTitle: shortTextSchema(200).optional().or(z.literal("")),
  heroSubtitle: shortTextSchema(300).optional().or(z.literal("")),
  heroImageUrl: optionalImageUrl(),
  // One of THEME_PRESETS' ids (lib/website-themes.ts), or "custom" once the
  // owner tweaks a preset's colors. Not strictly validated against the list
  // here — an unknown id just means the picker shows no theme selected,
  // which is harmless — but capped in length like any other free string.
  themeId: z.string().trim().min(1).max(40).optional(),
  // 3D hero object (lib/website-themes.ts HERO_MODEL_IDS); null = the theme's default.
  heroModel: z.enum(HERO_MODEL_IDS).nullable().optional(),
});

// ─── Guided website setup ───────────────────────────────────────────────────

export const websiteSetupActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("complete") }),
  // Right after paying: how does the owner want to build the site?
  z.object({
    action: z.literal("choose"),
    mode: z.enum(["WIZARD", "PRO", "MANUAL"]),
    description: z.string().trim().max(2000).optional(),
  }),
]);

export const websiteChangeRequestSchema = z.object({
  description: z
    .string()
    .trim()
    .min(10, "Décrivez le changement souhaité (10 caractères minimum)")
    .max(2000, "2000 caractères maximum"),
});

export const websiteChangeRequestReviewSchema = z.object({
  action: z.enum(["approve", "reject", "apply"]),
  note: shortTextSchema(1000).optional().or(z.literal("")),
});

export const coachUpdateSchema = z.object({
  name: nameSchema.optional(),
  bio: shortTextSchema(2000).nullable().optional(),
  photoUrl: optionalImageUrl().nullable(),
  specialties: z.array(z.string().trim().max(100)).max(30).optional(),
  phone: phoneSchema.nullable().optional().or(z.literal("")),
  isActive: z.boolean().optional(),
  createAccount: z.boolean().optional(),
  email: z.preprocess((v) => (v === null || v === "" ? undefined : v), emailSchema.optional()),
});

export const adminNotificationSchema = z.object({
  title: z.string().trim().min(1, "Le titre est requis").max(150),
  message: z.string().trim().min(1, "Le message est requis").max(2000),
  type: z.string().trim().max(50).optional(),
  target: z.union([
    z.literal("ALL"),
    z.literal("ACTIVE"),
    z.array(cuidSchema).min(1),
    cuidSchema,
  ]),
  channels: z.array(z.enum(["SITE", "EMAIL", "SMS"])).optional(),
});

// page-content's per-field validation is already handled dynamically
// against PAGE_CONTENT_SCHEMA in the route (allowed-key filtering) — this
// just guards the top-level envelope shape before that logic runs.
export const pageContentEnvelopeSchema = z.object({
  pageKey: z.string().trim().min(1),
  content: z.record(z.string(), z.unknown()),
});

// Public self-registration. Accepts firstName + lastName (preferred) or the
// legacy single `name` field, so older clients keep working. The parsed
// output always has a final `name` and an E.164 `phone`.
export const registrationSchema = z
  .object({
    firstName: z.string().trim().min(1, "Le prénom est requis").max(60).optional(),
    lastName: z.string().trim().min(1, "Le nom est requis").max(60).optional(),
    name: nameSchema.optional(),
    email: emailSchema,
    phone: z.string().trim().min(7, "Numéro de téléphone invalide").max(25, "Numéro de téléphone invalide"),
    country: countrySchema.optional(),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => (d.firstName && d.lastName) || d.name, {
    message: "Le prénom et le nom sont requis",
    path: ["firstName"],
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  })
  .transform((d, ctx) => {
    const phone = toE164(d.phone, d.country);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "Numéro de téléphone invalide", path: ["phone"] });
      return z.NEVER;
    }
    const name = d.firstName && d.lastName ? `${d.firstName} ${d.lastName}`.trim() : (d.name as string);
    return { name, email: d.email, phone, country: d.country ?? null, password: d.password };
  });

// Owner/admin-created accounts (members, staff): NO password — the invitee
// sets their own via the emailed link. `role` is validated against what the
// caller may assign in the route (lib/invitation.ts → canAssignRole).
export const inviteUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema.optional().or(z.literal("")),
  country: countrySchema.optional(),
  role: z.enum(["OWNER", "ADMIN", "COACH", "MEMBER", "SUPER_ADMIN"]).optional(),
});

export const acceptInvitationSchema = z
  .object({
    email: emailSchema,
    token: z.string().trim().min(10).max(500),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

// Login-specific: intentionally NOT reusing passwordSchema's min(6) — that
// rule is for setting a new password, not for validating one against an
// existing hash. A legacy account could have a shorter password; rejecting
// the login attempt before even checking the hash would lock them out for
// the wrong reason. Just bound length to stop abuse (huge payloads).
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(254),
  password: z.string().min(1, "Mot de passe requis").max(200),
  rememberMe: z.boolean().optional(),
});

export const otpSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(254),
  code: z.string().trim().regex(/^\d{4,8}$/, "Code invalide"),
});

export const resendCodeSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(254),
});

export const resetPasswordRequestSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(254),
  portal: z.enum(["platform"]).optional(),
});

export const resetPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(254),
  code: z.string().trim().regex(/^\d{6}$/, "Code invalide"),
  newPassword: passwordSchema,
  portal: z.enum(["platform"]).optional(),
  accountId: z.string().min(1).optional(),
});

export const userPreferencesSchema = z.object({
  language: z.enum(["FR", "EN", "AR"]).optional(),
  darkMode: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  smsNotifications: z.boolean().optional(),
});

export const attendanceCheckinSchema = z.object({
  sessionId: cuidSchema,
  userId: cuidSchema,
  undo: z.boolean().optional(),
});

export const subscribeSchema = z.object({
  planId: cuidSchema,
  paymentMethod: z.enum(["ONLINE", "ONSITE"]),
  countryCode: z.string().trim().length(2).transform((code) => code.toUpperCase()),
  promoCode: z.string().trim().max(30).optional().or(z.literal("")),
});

// Custom (not the generic urlSchema) since avatar accepts either a real
// https:// URL (Cloudinary) OR a data:image/... URL (fallback when
// Cloudinary isn't configured) — see ProfileAvatar.tsx. The 2MB data-URL
// size cap is still enforced separately in the route since Zod's .max()
// on a string only bounds character count, and base64 overhead means the
// "2MB of image bytes" ceiling isn't a clean string-length check.
export const avatarSchema = z
  .string()
  .refine((v) => /^https:\/\//.test(v) || v.startsWith("data:image/"), "Format d'image invalide");

export const profileUpdateSchema = z.object({
  name: nameSchema.optional(),
  phone: phoneSchema.optional().or(z.literal("")),
  avatar: avatarSchema.nullable().optional(),
});

export const accountDeleteSchema = z.object({
  password: z.string().min(1, "Mot de passe requis").max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis").max(200),
  newPassword: passwordSchema,
});

export const bookSessionSchema = z.object({
  sessionId: cuidSchema,
});

export const postSchema = z.object({
  title: z.string().trim().max(200).optional().or(z.literal("")),
  content: z.string().trim().min(1, "Le contenu est requis").max(5000),
  mediaUrl: optionalUrl().nullable(),
  mediaType: z.enum(["image", "video", "audio"]).nullable().optional(),
  musicUrl: optionalUrl().nullable(),
});

export const postUpdateSchema = z.object({
  title: z.string().trim().max(200).nullable().optional(),
  content: z.string().trim().min(1).max(5000).optional(),
  mediaUrl: optionalUrl().nullable(),
  mediaType: z.enum(["image", "video", "audio"]).nullable().optional(),
  musicUrl: optionalUrl().nullable(),
  isPublished: z.boolean().optional(),
});

export const commentSchema = z.object({
  content: z.string().trim().min(1, "Le contenu du commentaire est requis").max(1000),
});

export const commentDeleteSchema = z.object({
  commentId: cuidSchema,
});

/**
 * Parses `body` against `schema` and returns either the parsed data or a
 * ready-to-return 400 NextResponse. Callers should check `"response" in
 * result` before using `result.data`. Keeps the Zod error → French,
 * no-stack-trace, no-internal-detail response shape consistent across
 * routes instead of every route hand-rolling its own zod error mapping.
 */
export function formatZodError(error: z.ZodError): string {
  const first = error.issues[0];
  return first?.message || "Requête invalide";
}


// ─── Custom domain / paid service requests ────────────────────────────────────
export const domainRequestCreateSchema = z.object({
  domain: z
    .string()
    .trim()
    .max(300)
    .transform((v, ctx) => {
      const host = normalizeDomain(v);
      if (!host) {
        ctx.addIssue({ code: "custom", message: "Nom de domaine invalide (ex. www.monclub.tn)" });
        return z.NEVER;
      }
      return host;
    }),
});

export const serviceRequestCreateSchema = z.object({
  type: z.enum(ORDERABLE_SERVICE_TYPES as unknown as [string, ...string[]]),
  description: shortTextSchema(2000).optional().or(z.literal("")),
});

export const servicePriceUpdateSchema = z.object({
  serviceType: z.enum(SERVICE_TYPES),
  price: z.number().finite().min(0).max(1_000_000),
  currency: z.enum(MEMBERSHIP_CURRENCIES),
  isActive: z.boolean().optional(),
});

export const domainRequestReviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "CONFIGURING", "ACTIVE"]).optional(),
  reviewNote: shortTextSchema(1000).optional().or(z.literal("")),
  // Free text shown to the owner (DNS records to create). Not machine-applied.
  dnsInstructions: shortTextSchema(2000).nullable().optional(),
});

export const serviceRequestReviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  reviewNote: shortTextSchema(1000).optional().or(z.literal("")),
});
