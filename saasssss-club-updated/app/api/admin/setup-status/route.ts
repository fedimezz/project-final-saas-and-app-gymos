// GET /api/admin/setup-status
//
// Powers the "getting started" checklist an owner sees on /admin until their
// club is set up. Deliberately has NO separate progress table to keep in
// sync — each step's "done" state is derived live from whether the owner has
// actually done the thing (a plan exists, a coach exists, ...). That means
// the checklist can never drift from reality, and an owner who does things
// out of order or from a different page still gets correct checkmarks.
//
// Two views of the same live data:
//   • `steps`  — the short getting-started checklist (unchanged shape, plus a
//                `guidance` sentence per step);
//   • `checks` — the granular "configuration status" of the public website
//                (name, logo, hero, contact, hours, social, content, plans,
//                coaches, schedule) with a `percent` and the `missing` list.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// "Configured" = at least one day is open with both an opening and a closing
// time. Null (never saved) or every day closed counts as not configured.
function hasConfiguredHours(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some((day) => {
    if (!day || typeof day !== "object") return false;
    const d = day as { open?: unknown; close?: unknown; closed?: unknown };
    return d.closed !== true && typeof d.open === "string" && d.open !== "" && typeof d.close === "string" && d.close !== "";
  });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const clubId = auth.user.clubId as string;

    const [settings, planCount, coachCount, weeklyPlanCount, stripeConfigured] = await Promise.all([
      prisma.gymSettings.findUnique({
        where: { clubId },
        select: {
          name: true, logoUrl: true, heroTitle: true,
          phone: true, email: true, address: true, workingHours: true,
          facebookUrl: true, instagramUrl: true, tiktokUrl: true,
          twitterUrl: true, youtubeUrl: true, websiteUrl: true,
        },
      }),
      prisma.membershipPlan.count({ where: { clubId, isActive: true } }),
      prisma.coach.count({ where: { clubId, isActive: true } }),
      prisma.weeklyPlan.count({ where: { clubId } }),
      Promise.resolve(Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)),
    ]);

    const filled = (v: string | null | undefined) => Boolean(v && v.trim());

    const brandingDone = Boolean(
      settings && (settings.logoUrl || settings.heroTitle) && settings.phone
    );

    // ── Granular website checks ──────────────────────────────────────────────
    const hoursConfigured = hasConfiguredHours(settings?.workingHours);
    const socialConfigured = Boolean(
      settings &&
        [settings.facebookUrl, settings.instagramUrl, settings.tiktokUrl, settings.twitterUrl, settings.youtubeUrl, settings.websiteUrl].some(filled)
    );
    const contactConfigured = Boolean(
      settings && filled(settings.phone) && filled(settings.email) && filled(settings.address)
    );

    const checks = [
      { id: "name", label: "Nom du club", done: Boolean(settings && filled(settings.name) && settings.name !== "My Gym"), href: "/admin/settings", guidance: "Donnez un nom à votre club dans l'onglet Identité." },
      { id: "logo", label: "Logo", done: Boolean(settings && filled(settings.logoUrl)), href: "/admin/settings", guidance: "Ajoutez votre logo pour personnaliser le site et les emails." },
      { id: "content", label: "Titre d'accueil", done: Boolean(settings && filled(settings.heroTitle)), href: "/admin/settings", guidance: "Rédigez un titre d'accueil accrocheur." },
      { id: "contact", label: "Coordonnées (téléphone, email, adresse)", done: contactConfigured, href: "/admin/settings", guidance: "Renseignez téléphone, email et adresse pour que vos membres puissent vous joindre." },
      { id: "hours", label: "Horaires d'ouverture", done: hoursConfigured, href: "/admin/settings", guidance: "Enregistrez vos horaires dans l'onglet Horaires." },
      { id: "social", label: "Réseaux sociaux", done: socialConfigured, href: "/admin/settings", guidance: "Ajoutez au moins un lien (Instagram, Facebook, site web…)." },
      { id: "plans", label: "Formule d'abonnement", done: planCount > 0, href: "/admin/plans", guidance: "Créez au moins une formule active." },
      { id: "coaches", label: "Coach", done: coachCount > 0, href: "/admin/staff", guidance: "Ajoutez votre premier coach." },
      { id: "schedule", label: "Planning", done: weeklyPlanCount > 0, href: "/admin/schedule", guidance: "Créez la première semaine de séances." },
    ];
    const checksDone = checks.filter((c) => c.done).length;
    const percent = Math.round((checksDone / checks.length) * 100);
    const missing = checks.filter((c) => !c.done).map(({ id, label, href, guidance }) => ({ id, label, href, guidance }));

    const steps = [
      {
        id: "branding",
        title: "Personnalisez votre club",
        description: "Logo et coordonnées",
        guidance: "Ajoutez votre logo et votre téléphone via l'assistant du site.",
        done: brandingDone,
        href: "/admin/settings",
      },
      {
        id: "plans",
        title: "Créez vos formules d'abonnement",
        description: "Au moins une formule active pour que les membres puissent s'inscrire",
        guidance: "Créez une formule (nom, prix, durée) pour ouvrir les inscriptions.",
        done: planCount > 0,
        href: "/admin/plans",
      },
      {
        id: "coaches",
        title: "Ajoutez vos coachs",
        description: "Pour pouvoir leur assigner des séances",
        guidance: "Ajoutez un coach : il recevra une invitation par email pour activer son compte.",
        done: coachCount > 0,
        href: "/admin/staff",
      },
      {
        id: "schedule",
        title: "Construisez votre planning",
        description: "Créez la première semaine de séances",
        guidance: "Créez une semaine de séances pour que les membres puissent réserver.",
        done: weeklyPlanCount > 0,
        href: "/admin/schedule",
      },
      {
        id: "payments",
        title: "Configurez les paiements en ligne",
        description: stripeConfigured
          ? "Vérifiez la configuration Stripe"
          : "Optionnel — les clubs tunisiens peuvent enregistrer des paiements à l'accueil",
        guidance: "Configurez Stripe pour les paiements internationaux. En Tunisie, les membres règlent à l'accueil et les propriétaires contactent le support pour la facturation SaaS.",
        done: stripeConfigured,
        href: "/admin/billing",
        optional: true,
      },
    ];

    const requiredSteps = steps.filter((s) => !s.optional);
    const completedCount = requiredSteps.filter((s) => s.done).length;

    return NextResponse.json({
      steps,
      completedCount,
      totalCount: requiredSteps.length,
      allDone: completedCount === requiredSteps.length,
      checks,
      percent,
      missing,
    });
  } catch (error) {
    console.error("Setup status GET error:", error);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
