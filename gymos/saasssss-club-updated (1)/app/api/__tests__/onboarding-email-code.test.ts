import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { hashSecret } from "@/lib/otp";

const verificationDeleteMany = vi.fn();
const verificationUpsert = vi.fn();
const verificationFindUnique = vi.fn();
const verificationUpdateMany = vi.fn();
const userFindFirst = vi.fn();
const sendEmail = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 5, resetAt: 0 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  verificationCodeEmail: (code: string) => ({ subject: "Verify", html: `<p>${code}</p>` }),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    onboardingEmailVerification: {
      deleteMany: (...args: unknown[]) => verificationDeleteMany(...args),
      upsert: (...args: unknown[]) => verificationUpsert(...args),
      findUnique: (...args: unknown[]) => verificationFindUnique(...args),
      updateMany: (...args: unknown[]) => verificationUpdateMany(...args),
    },
    user: { findFirst: (...args: unknown[]) => userFindFirst(...args) },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  verificationDeleteMany.mockResolvedValue({ count: 0 });
  verificationUpsert.mockResolvedValue({});
  verificationUpdateMany.mockResolvedValue({ count: 1 });
  userFindFirst.mockResolvedValue(null);
  sendEmail.mockResolvedValue(undefined);
});

function request(method: "POST" | "PATCH", body: unknown) {
  return new NextRequest("https://yoursaas.test/api/onboarding/email-code", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/onboarding/email-code", () => {
  it("sends a code and only stores its hash", async () => {
    const { POST } = await import("@/app/api/onboarding/email-code/route");
    const response = await POST(request("POST", { email: " owner@example.test " }));

    expect(response.status).toBe(200);
    expect(verificationUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: "owner@example.test" },
      create: expect.objectContaining({ email: "owner@example.test", codeHash: expect.any(String) }),
    }));
    const email = sendEmail.mock.calls[0][0] as { html: string };
    const code = email.html.match(/\d{6}/)?.[0];
    expect(code).toBeTruthy();
    expect(verificationUpsert.mock.calls[0][0].create.codeHash).toBe(hashSecret(code!));
  });

  it("issues a one-time verification token only after a valid, unexpired code", async () => {
    verificationFindUnique.mockResolvedValue({
      id: "challenge-1",
      codeHash: hashSecret("123456"),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    const { PATCH } = await import("@/app/api/onboarding/email-code/route");
    const response = await PATCH(request("PATCH", { email: "owner@example.test", code: "123456" }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.verified).toBe(true);
    expect(result.verificationToken).toEqual(expect.any(String));
    expect(verificationUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "challenge-1", codeHash: hashSecret("123456"), expiresAt: { gt: expect.any(Date) }, consumedAt: null },
      data: expect.objectContaining({
        codeHash: "",
        verificationTokenHash: hashSecret(result.verificationToken),
      }),
    }));
  });

  it("rejects an invalid code without issuing a token", async () => {
    verificationFindUnique.mockResolvedValue({
      id: "challenge-1",
      codeHash: hashSecret("654321"),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    const { PATCH } = await import("@/app/api/onboarding/email-code/route");
    const response = await PATCH(request("PATCH", { email: "owner@example.test", code: "123456" }));

    expect(response.status).toBe(400);
    expect(verificationUpdateMany).not.toHaveBeenCalled();
  });
});
