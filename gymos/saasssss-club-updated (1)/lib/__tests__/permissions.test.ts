import { describe, it, expect, vi } from "vitest";

// permissions.ts imports the Prisma client at module scope (for the
// DB-backed hasPermission() check), but this file only tests the pure,
// DB-free helpers (PERMISSION_CATALOG, isValidPermissionKey). Mock it out
// so these tests don't require a generated Prisma client / live database.
const rolePermissionFindUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: { rolePermission: { findUnique: (...args: unknown[]) => rolePermissionFindUniqueMock(...args) } },
}));

const { PERMISSION_CATALOG, PERMISSION_KEYS, isValidPermissionKey, hasPermission } = await import(
  "../permissions"
);

describe("PERMISSION_CATALOG", () => {
  it("has no duplicate keys", () => {
    const unique = new Set(PERMISSION_KEYS);
    expect(unique.size).toBe(PERMISSION_KEYS.length);
  });

  it("every entry has a non-empty key, label, group, and description", () => {
    for (const perm of PERMISSION_CATALOG) {
      expect(perm.key.length).toBeGreaterThan(0);
      expect(perm.label.length).toBeGreaterThan(0);
      expect(perm.group.length).toBeGreaterThan(0);
      expect(perm.description.length).toBeGreaterThan(0);
    }
  });

  it("includes the reports.view permission used by the admin reports routes", () => {
    expect(PERMISSION_KEYS).toContain("reports.view");
  });
});

describe("isValidPermissionKey", () => {
  it("returns true for a real key", () => {
    expect(isValidPermissionKey("members.write")).toBe(true);
  });

  it("returns false for an unknown key", () => {
    expect(isValidPermissionKey("not.a.real.key")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(isValidPermissionKey("MEMBERS.WRITE")).toBe(false);
  });
});

describe("hasPermission", () => {
  it("OWNER always has every permission, without a DB lookup", async () => {
    const result = await hasPermission(
      { id: "u1", email: "o@x.com", role: "OWNER", name: "Owner", clubId: "club_a" },
      "members.write"
    );
    expect(result).toBe(true);
    expect(rolePermissionFindUniqueMock).not.toHaveBeenCalled();
  });

  it("SUPER_ADMIN (no clubId) has no gym permissions", async () => {
    const result = await hasPermission(
      { id: "s1", email: "s@platform.local", role: "SUPER_ADMIN", name: "Super", clubId: null },
      "members.write"
    );
    expect(result).toBe(false);
  });

  it("defaults to allowed when no override row exists for this club", async () => {
    rolePermissionFindUniqueMock.mockResolvedValueOnce(null);
    const result = await hasPermission(
      { id: "a1", email: "a@x.com", role: "ADMIN", name: "Admin", clubId: "club_a" },
      "members.write"
    );
    expect(result).toBe(true);
  });

  it("respects an explicit revoke for THIS club", async () => {
    rolePermissionFindUniqueMock.mockResolvedValueOnce({ allowed: false });
    const result = await hasPermission(
      { id: "a1", email: "a@x.com", role: "ADMIN", name: "Admin", clubId: "club_a" },
      "members.write"
    );
    expect(result).toBe(false);
  });

  it("scopes the lookup to the admin's OWN club — Gym A's override never applies to Gym B's admin", async () => {
    rolePermissionFindUniqueMock.mockResolvedValueOnce(null);
    await hasPermission(
      { id: "a1", email: "a@x.com", role: "ADMIN", name: "Admin", clubId: "club_b" },
      "members.write"
    );
    expect(rolePermissionFindUniqueMock).toHaveBeenCalledWith({
      where: { clubId_role_key: { clubId: "club_b", role: "ADMIN", key: "members.write" } },
    });
  });
});
