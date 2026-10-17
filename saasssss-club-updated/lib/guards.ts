import { NextResponse } from "next/server";

/**
 * Asserts that clubId is a non-null string.
 * Use right after requireAdmin/requireOwner/requireUser/requireCoach
 * in every route that scopes queries by clubId.
 *
 * Usage:
 *   const admin = await requireAdmin(request);
 *   if (admin instanceof NextResponse) return admin;
 *   const { clubId, error } = assertClubId(admin.clubId);
 *   if (error) return error;
 *   // clubId is now `string`
 */
export function assertClubId(
  clubId: string | null | undefined
): { clubId: string; error?: never } | { clubId?: never; error: NextResponse } {
  if (!clubId) {
    return {
      error: NextResponse.json(
        { error: "Club introuvable pour cet utilisateur." },
        { status: 400 }
      ),
    };
  }
  return { clubId };
}
