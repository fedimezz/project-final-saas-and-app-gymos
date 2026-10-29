import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { catalogForRole, isValidPermissionKeyForRole, defaultAllowedForRole, type ConfigurableRole } from "@/lib/permissions";
import { formatZodError, permissionUpdateSchema } from "@/lib/validation";

// ADMIN and COACH permissions are configurable. OWNER always has everything and
// MEMBER has none of these permissions to begin with.
function parseRole(value: string | null | undefined): ConfigurableRole {
  return value?.toUpperCase() === "COACH" ? "COACH" : "ADMIN";
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé au propriétaire" }, { status: auth.status });

    const role = parseRole(new URL(request.url).searchParams.get("role"));
    const rows = await prisma.rolePermission.findMany({
      where: { clubId: auth.user.clubId as string, role },
    });
    const overrides = new Map(rows.map((r: { key: string; allowed: boolean }) => [r.key, r.allowed]));

    const permissions = catalogForRole(role).map((p) => ({
      ...p,
      allowed: overrides.has(p.key) ? overrides.get(p.key) : defaultAllowedForRole(role, p.key),
    }));

    const [adminCount, ownerCount, coachCount] = await Promise.all([
      prisma.user.count({ where: { clubId: auth.user.clubId as string, role: "ADMIN" } }),
      prisma.user.count({ where: { clubId: auth.user.clubId as string, role: "OWNER" } }),
      prisma.user.count({ where: { clubId: auth.user.clubId as string, role: "COACH" } }),
    ]);

    return NextResponse.json({ role, permissions, adminCount, ownerCount, coachCount });
  } catch (error) {
    console.error("Admin roles GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé au propriétaire" }, { status: auth.status });
    const owner = auth.user;

    const rawBody = await request.json().catch(() => null);
    const parsed = permissionUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { key, allowed } = parsed.data;
    const role = parseRole(parsed.data.role);

    // Zod validates shape/type, this validates the value is a real key FOR THAT ROLE.
    if (!isValidPermissionKeyForRole(role, key)) {
      return NextResponse.json({ error: "Permission inconnue" }, { status: 400 });
    }

    const row = await prisma.rolePermission.upsert({
      where: { clubId_role_key: { clubId: owner.clubId as string, role, key } },
      update: { allowed, updatedBy: owner.id },
      create: { clubId: owner.clubId as string, role, key, allowed, updatedBy: owner.id },
    });

    return NextResponse.json({ permission: row });
  } catch (error) {
    console.error("Admin roles PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
