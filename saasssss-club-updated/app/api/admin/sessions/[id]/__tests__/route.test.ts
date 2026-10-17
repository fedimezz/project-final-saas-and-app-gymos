import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAdmin = vi.fn();
const hasPermission = vi.fn();
const sessionFindFirst = vi.fn();
vi.mock("@/lib/auth", () => ({ requireAdmin: (...args: unknown[]) => requireAdmin(...args) }));
vi.mock("@/lib/permissions", () => ({ hasPermission: (...args: unknown[]) => hasPermission(...args) }));
vi.mock("@/lib/prisma", () => ({ default: { session: { findFirst: (...args: unknown[]) => sessionFindFirst(...args) } } }));
vi.mock("@/lib/notify", () => ({ notifyUsers: vi.fn() }));
vi.mock("@/lib/after", () => ({ runAfter: vi.fn() }));

describe("DELETE /api/admin/sessions/[id]", () => {
  it("denies an ADMIN without planning.manage before reading the session", async () => {
    requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: "admin-1", name: "Admin", role: "ADMIN", clubId: "club-1" },
    });
    hasPermission.mockResolvedValue(false);

    const { DELETE } = await import("@/app/api/admin/sessions/[id]/route");
    const response = await DELETE(
      new NextRequest("https://club-a.test/api/admin/sessions/session-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "session-1" }) }
    );

    expect(response.status).toBe(403);
    expect(sessionFindFirst).not.toHaveBeenCalled();
  });
});