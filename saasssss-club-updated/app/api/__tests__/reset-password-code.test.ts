import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { hashSecret } from "@/lib/otp";

const userFindFirst = vi.fn();
const userFindMany = vi.fn();
const userUpdateMany = vi.fn();
const sendEmail = vi.fn();
const resolveTenant = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 5, resetAt: 0 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@/lib/tenant", () => ({ resolveTenantFromRequest: (...args: unknown[]) => resolveTenant(...args) }));
vi.mock("@/lib/bcrypt", () => ({ hashPassword: vi.fn().mockResolvedValue("new-hashed-password") }));
vi.mock("@/lib/otp", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/otp")>();
  return { ...original, generateVerificationCode: () => "123456" };
});
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  passwordResetCodeEmail: (code: string) => ({ subject: "Reset", html: code }),
}));
vi.mock("@/lib/after", () => ({
  runAfter: (callback: () => Promise<unknown>) => { void callback(); },
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findFirst: (...args: unknown[]) => userFindFirst(...args),
      findMany: (...args: unknown[]) => userFindMany(...args),
      updateMany: (...args: unknown[]) => userUpdateMany(...args),
    },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = "https://yoursaas.test";
  resolveTenant.mockResolvedValue({ id: "club-1", slug: "gym-a", status: "ACTIVE" });
  userFindFirst.mockResolvedValue({
    id: "user-1", email: "owner@example.test", isActive: true,
    resetTokenHash: hashSecret("123456"), resetTokenExpiry: new Date(Date.now() + 60_000),
    role: "OWNER", club: { name: "Gym A", slug: "gym-a" },
  });
  userFindMany.mockResolvedValue([]);
  userUpdateMany.mockResolvedValue({ count: 1 });
  transaction.mockImplementation((callback: (tx: unknown) => Promise<unknown>) =>
    callback({ user: { updateMany: (...args: unknown[]) => userUpdateMany(...args) } })
  );
  sendEmail.mockResolvedValue(undefined);
});

function request(method: "POST" | "PATCH", body: unknown, url = "https://gym-a.yoursaas.test/api/auth/reset-password") {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("email-code password reset", () => {
  it("emails a six-digit code and responds generically", async () => {
    const { POST } = await import("@/app/api/auth/reset-password/route");
    const response = await POST(request("POST", { email: "owner@example.test" }));

    expect(response.status).toBe(200);
    expect((await response.json()).message).toContain("Si ce compte existe");
    expect(userUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["user-1"] }, isActive: true },
      data: { resetTokenHash: hashSecret("123456"), resetTokenExpiry: expect.any(Date) },
    }));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "owner@example.test", html: "123456" }));
  });

  it("consumes a matching code atomically and revokes earlier sessions", async () => {
    const { PATCH } = await import("@/app/api/auth/reset-password/route");
    const response = await PATCH(request("PATCH", {
      email: "owner@example.test", code: "123456", newPassword: "NewSecure123!",
    }));

    expect(response.status).toBe(200);
    expect(userUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1", resetTokenHash: hashSecret("123456"), resetTokenExpiry: { gt: expect.any(Date) } },
      data: expect.objectContaining({
        password: "new-hashed-password",
        resetTokenHash: null,
        resetTokenExpiry: null,
        passwordChangedAt: expect.any(Date),
      }),
    }));
  });

  it("targets only the superadmin account from the platform host", async () => {
    resolveTenant.mockResolvedValue(null);
    userFindMany.mockResolvedValue([]);
    const { POST } = await import("@/app/api/auth/reset-password/route");
    const response = await POST(request(
      "POST",
      { email: "root@example.test", portal: "platform" },
      "https://yoursaas.test/api/auth/reset-password"
    ));

    expect(response.status).toBe(200);
    expect(userFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: "root@example.test", isActive: true, role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] } },
    }));
  });

  it("requires selecting one club account after validating a platform code", async () => {
    resolveTenant.mockResolvedValue(null);
    userFindMany.mockResolvedValue([
      {
        id: "owner-a", email: "owner@example.test", role: "OWNER", isActive: true,
        resetTokenHash: hashSecret("123456"), resetTokenExpiry: new Date(Date.now() + 60_000),
        club: { name: "Gym A", slug: "gym-a" },
      },
      {
        id: "owner-b", email: "owner@example.test", role: "ADMIN", isActive: true,
        resetTokenHash: hashSecret("123456"), resetTokenExpiry: new Date(Date.now() + 60_000),
        club: { name: "Gym B", slug: "gym-b" },
      },
    ]);
    const { PATCH } = await import("@/app/api/auth/reset-password/route");
    const response = await PATCH(request(
      "PATCH",
      { email: "owner@example.test", portal: "platform", code: "123456", newPassword: "NewSecure123!" },
      "https://yoursaas.test/api/auth/reset-password"
    ));
    const result = await response.json();

    expect(response.status).toBe(409);
    expect(result.requiresAccountSelection).toBe(true);
    expect(result.accounts).toHaveLength(2);
    expect(userUpdateMany).not.toHaveBeenCalled();
  });
});
