// lib/slug.ts
//
// Single source of truth for club slugs (= the tenant subdomain).
// Used by onboarding, the public slug checker and the SUPER_ADMIN club CRUD.
//
// A slug becomes a DNS label (`slug.yoursaas.com`), so besides the usual
// format rules it must never collide with a hostname the platform itself
// needs (www, api, mail, admin, …). Without this list, a club called "www"
// or "api" would be created successfully and then be unreachable — or worse,
// shadow infrastructure subdomains.
import { z } from "zod";

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // web / infra
  "www", "api", "app", "apps", "admin", "administrator", "root", "system",
  "platform", "dashboard", "console", "portal", "localhost",
  // auth / onboarding paths
  "login", "logout", "signin", "signup", "register", "onboarding", "auth", "oauth", "sso", "account", "accounts",
  // mail / dns / network
  "mail", "email", "smtp", "imap", "pop", "pop3", "webmail", "mx", "ns", "ns1", "ns2", "dns", "ftp", "sftp", "vpn",
  "autodiscover", "autoconfig", "cpanel", "whm",
  // assets / content
  "cdn", "static", "assets", "img", "images", "media", "files", "uploads", "download", "downloads",
  // product / marketing
  "blog", "docs", "help", "support", "status", "news", "about", "contact", "pricing", "offres", "tarifs",
  "billing", "pay", "payment", "payments", "checkout", "secure", "security", "legal", "privacy", "terms",
  // environments
  "dev", "staging", "stage", "preview", "beta", "sandbox", "internal",
  // brand
  "gymos", "club", "clubs", "saas", "webhook", "webhooks", "cron", "health",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

/** "Le Club de Gammarth" → "le-club-de-gammarth" (accents stripped, max SLUG_MAX chars). */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

/**
 * Zod schema for a club slug. Lower-cases + trims first, then enforces:
 * length, [a-z0-9-] only, no leading/trailing/double hyphen, not reserved.
 */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(SLUG_MIN, `Slug trop court (${SLUG_MIN} caractères min.)`)
  .max(SLUG_MAX, `Slug trop long (${SLUG_MAX} caractères max.)`)
  .regex(/^[a-z0-9-]+$/, "Slug : minuscules, chiffres et tirets uniquement")
  .refine((s) => !s.startsWith("-") && !s.endsWith("-"), "Le slug ne peut pas commencer ou finir par un tiret")
  .refine((s) => !s.includes("--"), "Le slug ne peut pas contenir deux tirets consécutifs")
  .refine((s) => !isReservedSlug(s), "Ce sous-domaine est réservé, choisissez-en un autre");