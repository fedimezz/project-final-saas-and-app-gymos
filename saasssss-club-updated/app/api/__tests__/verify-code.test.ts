import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { hashSecret } from "@/lib/otp";

const userFindFirst = vi.fn();
const userUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: { user: { findFirst: (...args: unknown[]) => userFindFirst(...args), update: (...args: unknown[]) => userUpdate(...args) } },
}));
vi.mock("@/lib/tenant", () => ({
  resolveTenantFromRequest: vi.fn().mockResolvedValue({ id: "club-1", slug: "club-a", status: "ACTIVE" }),
  isClubUsable: vi.fn().mockReturnValue(true),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@/lib/auth", () => ({ generateToken: vi.fn().mockReturnValue("session-token") }));

const USER = {
  id: "user-1",
  email: "member@example.test",
  name: "Member",
  role: "MEMBER",
  clubId: "club-1",
  isActive: true,
  invitationToken: null,
  verificationCodeHash: hashSecret("654321"),
  verificationCodeExpiry: new Date(Date.now() + 60_000),
};

function request(code: string) {
  return new NextRequest("https://club-a.example.test/api/auth/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: USER.email, code }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = "unit-test-secret-that-is-long-enough-123";
  userFindFirst.mockResolvedValue(USER);
  userUpdate.mockResolvedValue({});
});

describe("POST /api/auth/verify", () => {
  it("rejects the former fixed code when it does not match the stored hash", async () => {
    const { POST } = await import("@/app/api/auth/verify/route");
    const response = await POST(request("123456"));

    expect(response.status).toBe(400);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("accepts the actual emailed code and consumes its hash", async () => {
    const { POST } = await import("@/app/api/auth/verify/route");
    const response = await POST(request("654321"));

    expect(response.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { emailVerified: expect.any(Date), verificationCodeHash: null, verificationCodeExpiry: null },
    }));
  });
});