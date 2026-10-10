/**
 * Seeds the SaaS plan catalog, two demo gyms (Club A / Club B — deliberately
 * two, not one, so the tenant-isolation tests have real cross-tenant data
 * to check against without any extra setup), a platform SUPER_ADMIN, and
 * per-club membership plans + demo accounts.
 *
 * Run with: npx prisma db seed        (or: npm run db:seed)
 *
 * PRODUCTION MODE (NODE_ENV=production or SEED_PLANS_ONLY=1):
 *   - seeds ONLY the SaaS plan catalog (required for onboarding to work)
 *   - creates/updates the platform SUPER_ADMIN ONLY if SUPER_ADMIN_EMAIL and
 *     SUPER_ADMIN_PASSWORD (>= 12 chars) are set in the environment
 *   - never creates the demo clubs / demo accounts (they share a known
 *     password and must never exist on a real deployment)
 */
import { PrismaClient, Role, SaasPlanTier, ClubStatus, PlatformSubscriptionStatus } from "@prisma/client";
import { hashPassword } from "../lib/bcrypt";

const prisma = new PrismaClient();

// ── SaaS plan catalog (spec section 6) ──────────────────────────────────────
// `limits` is the single source of truth read by the feature-limit service
// (lib/plan-limits.ts, Phase 7) — nothing in application code should
// hardcode these numbers.
const SAAS_PLANS = [
  {
    tier: SaasPlanTier.STARTER,
    name: "Starter",
    priceMonthly: 29,
    limits: {
      maxMembers: 100,
      maxCoaches: 3,
      maxAdmins: 2,
      storageGB: 2,
      maxBookingsPerMonth: 500,
      maxCustomPages: 3,
      customDomain: false,
      advancedAnalytics: false,
      revenueAnalytics: false,
      apiAccess: false,
      whiteLabel: false,
    },
  },
  {
    tier: SaasPlanTier.PRO,
    name: "Pro",
    priceMonthly: 79,
    limits: {
      maxMembers: 500,
      maxCoaches: 15,
      maxAdmins: 10,
      storageGB: 10,
      maxBookingsPerMonth: 3000,
      maxCustomPages: 10,
      customDomain: true,
      advancedAnalytics: true,
      revenueAnalytics: true,
      apiAccess: false,
      whiteLabel: false,
    },
  },
  {
    tier: SaasPlanTier.BUSINESS,
    name: "Business",
    priceMonthly: 199,
    limits: {
      // null = unlimited/fair-use, per spec section 6
      maxMembers: null,
      maxCoaches: null,
      maxAdmins: null,
      storageGB: 50,
      maxBookingsPerMonth: null,
      maxCustomPages: null,
      customDomain: true,
      advancedAnalytics: true,
      revenueAnalytics: true,
      apiAccess: true,
      whiteLabel: true,
    },
  },
];

// ── Demo tenants ─────────────────────────────────────────────────────────────
// Two clubs on purpose. This is what the "Gym A user -> Gym B data = denied"
// tests in Phase 11 run against.
const CLUBS = [
  {
    slug: "club-a",
    name: "Club Demo A",
    planTier: SaasPlanTier.PRO,
    gymMembershipPlans: [
      { name: "Mensuel", description: "Idéal pour essayer, sans engagement.", price: 80, durationDays: 30, features: ["Accès illimité à la salle", "Accès aux cours collectifs", "1 séance avec un coach offerte"] },
      { name: "Annuel", description: "Le plus économique pour les habitués.", price: 720, durationDays: 365, features: ["Accès illimité à la salle", "Accès aux cours collectifs", "Séances coach illimitées"] },
    ],
    users: [
      { name: "Owner A", email: "owner.a@demo.local", phone: "+21622100001", password: "Demo123!", role: Role.OWNER },
      { name: "Admin A", email: "admin.a@demo.local", phone: "+21622100002", password: "Demo123!", role: Role.ADMIN },
      { name: "Coach A", email: "coach.a@demo.local", phone: "+21622100003", password: "Demo123!", role: Role.COACH },
      { name: "Membre A", email: "member.a@demo.local", phone: "+21622100004", password: "Demo123!", role: Role.MEMBER },
    ],
  },
  {
    slug: "club-b",
    name: "Club Demo B",
    planTier: SaasPlanTier.STARTER,
    gymMembershipPlans: [
      { name: "Mensuel", description: "Formule mensuelle sans engagement.", price: 60, durationDays: 30, features: ["Accès salle", "Cours collectifs"] },
    ],
    users: [
      { name: "Owner B", email: "owner.b@demo.local", phone: "+21622200001", password: "Demo123!", role: Role.OWNER },
      { name: "Admin B", email: "admin.b@demo.local", phone: "+21622200002", password: "Demo123!", role: Role.ADMIN },
      { name: "Membre B", email: "member.b@demo.local", phone: "+21622200003", password: "Demo123!", role: Role.MEMBER },
    ],
  },
];

const PROD_MODE =
  process.env.NODE_ENV === "production" || process.env.SEED_PLANS_ONLY === "1";

const SUPER_ADMIN = {
  name: "Platform Super Admin",
  email: PROD_MODE
    ? (process.env.SUPER_ADMIN_EMAIL ?? "").trim().toLowerCase()
    : "superadmin@platform.local",
  phone: "+21600000000",
  password: PROD_MODE ? (process.env.SUPER_ADMIN_PASSWORD ?? "") : "Demo123!",
};

async function main() {
  // 1. SaaS plan catalog — upsert by tier (stable, not by name).
  const planIdByTier = new Map<SaasPlanTier, string>();
  for (const plan of SAAS_PLANS) {
    const row = await prisma.saasPlan.upsert({
      where: { tier: plan.tier },
      update: { name: plan.name, priceMonthly: plan.priceMonthly, limits: plan.limits, isActive: true },
      create: { tier: plan.tier, name: plan.name, priceMonthly: plan.priceMonthly, limits: plan.limits },
    });
    planIdByTier.set(plan.tier, row.id);
    console.log(`SaaS plan ready: ${plan.name}`);
  }

  // 2. Platform SUPER_ADMIN — clubId is null (platform-level, not gym-level).
  if (PROD_MODE && (!SUPER_ADMIN.email || SUPER_ADMIN.password.length < 12)) {
    console.log(
      "Production mode: SUPER_ADMIN skipped (set SUPER_ADMIN_EMAIL and a SUPER_ADMIN_PASSWORD of 12+ chars to create it)."
    );
  } else {
    const hashedPassword = await hashPassword(SUPER_ADMIN.password);
    const existing = await prisma.user.findFirst({
      where: { email: SUPER_ADMIN.email, clubId: null },
    });
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { name: SUPER_ADMIN.name, phone: SUPER_ADMIN.phone, password: hashedPassword, isActive: true, role: Role.SUPER_ADMIN, emailVerified: new Date() },
      });
      console.log(`Updated SUPER_ADMIN: ${SUPER_ADMIN.email}`);
    } else {
      await prisma.user.create({
        data: { ...SUPER_ADMIN, password: hashedPassword, role: Role.SUPER_ADMIN, clubId: null, emailVerified: new Date() },
      });
      console.log(`Created SUPER_ADMIN: ${SUPER_ADMIN.email}`);
    }
  }

  if (PROD_MODE) {
    console.log("Production mode: demo clubs and demo accounts NOT created.");
    return;
  }

  // 3. Clubs, each with its own SaaS subscription, gym membership plans,
  //    and demo users. Every lookup below is explicitly scoped by clubId —
  //    this is exactly the pattern every real API route must follow too.
  for (const clubDef of CLUBS) {
    const club = await prisma.club.upsert({
      where: { slug: clubDef.slug },
      update: { name: clubDef.name, status: ClubStatus.ACTIVE },
      create: { slug: clubDef.slug, name: clubDef.name, status: ClubStatus.ACTIVE },
    });
    console.log(`Club ready: ${club.name} (${club.slug})`);

    await prisma.clubSubscription.upsert({
      where: { clubId: club.id },
      update: { planId: planIdByTier.get(clubDef.planTier)! },
      create: {
        clubId: club.id,
        planId: planIdByTier.get(clubDef.planTier)!,
        status: PlatformSubscriptionStatus.ACTIVE,
      },
    });

    await prisma.gymSettings.upsert({
      where: { clubId: club.id },
      update: { name: clubDef.name },
      create: { clubId: club.id, name: clubDef.name },
    });

    for (const plan of clubDef.gymMembershipPlans) {
      const existingPlan = await prisma.membershipPlan.findFirst({
        where: { clubId: club.id, name: plan.name },
      });
      if (existingPlan) {
        await prisma.membershipPlan.update({
          where: { id: existingPlan.id },
          data: { ...plan, isActive: true },
        });
      } else {
        await prisma.membershipPlan.create({
          data: { ...plan, clubId: club.id, isActive: true },
        });
      }
      console.log(`  Membership plan ready: ${plan.name}`);
    }

    for (const demoUser of clubDef.users) {
      const hashedPassword = await hashPassword(demoUser.password);
      // Email uniqueness is now per-club, so lookups must include clubId —
      // a plain findUnique({ where: { email } }) is no longer valid.
      const existing = await prisma.user.findFirst({
        where: { clubId: club.id, email: demoUser.email },
      });
      if (existing) {
        await prisma.user.update({
          where: { id: existing.id },
          data: { name: demoUser.name, phone: demoUser.phone, role: demoUser.role, password: hashedPassword, isActive: true, emailVerified: new Date() },
        });
        console.log(`  Updated demo user: ${demoUser.email} (${demoUser.role})`);
      } else {
        await prisma.user.create({
          data: { ...demoUser, clubId: club.id, isActive: true, emailVerified: new Date() },
        });
        console.log(`  Created demo user: ${demoUser.email} (${demoUser.role})`);
      }
    }

    const coachUser = await prisma.user.findFirst({
      where: { clubId: club.id, role: Role.COACH },
      select: { id: true, name: true, phone: true },
    });
    if (coachUser) {
      await prisma.coach.upsert({
        where: { userId: coachUser.id },
        update: { clubId: club.id, name: coachUser.name, phone: coachUser.phone, isActive: true },
        create: { clubId: club.id, userId: coachUser.id, name: coachUser.name, phone: coachUser.phone, specialties: [], isActive: true },
      });
      console.log(`  Coach profile ready: ${coachUser.name}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
