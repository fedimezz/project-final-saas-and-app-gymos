import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const requireAdminMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}));

const hasPermissionMock = vi.fn();
vi.mock("@/lib/permissions", () => ({
  hasPermission: (...args: unknown[]) => hasPermissionMock(...args),
}));

const sendEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

const sendSmsMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/sms", () => ({
  sendSms: (...args: unknown[]) => sendSmsMock(...args),
}));

const userFindManyMock = vi.fn();
const notificationCreateManyMock = vi.fn();
const notificationFindManyMock = vi.fn();
const notificationDeleteMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findMany: (...args: unknown[]) => userFindManyMock(...args), findUnique: vi.fn() },
    notification: {
      createMany: (...args: unknown[]) => notificationCreateManyMock(...args),
      findMany: (...args: unknown[]) => notificationFindManyMock(...args),
      delete: (...args: unknown[]) => notificationDeleteMock(...args),
    },
  },
}));

const { POST } = await import("../notifications/route");

const ADMIN = { id: "admin_1", email: "admin@club.test", role: "ADMIN", name: "Admin" };

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.test/api/admin/notifications", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminMock.mockResolvedValue({ ok: true, user: ADMIN });
  hasPermissionMock.mockResolvedValue(true);
});

describe("POST /api/admin/notifications — auth & validation", () => {
  it("rejects non-admins", async () => {
    requireAdminMock.mockResolvedValueOnce({ ok: false, status: 403 });
    const res = await POST(makeRequest({ title: "t", message: "m", target: "ALL" }));
    expect(res.status).toBe(403);
  });

  it("rejects an admin lacking the notifications.send permission", async () => {
    hasPermissionMock.mockResolvedValueOnce(false);
    const res = await POST(makeRequest({ title: "t", message: "m", target: "ALL" }));
    expect(res.status).toBe(403);
    expect(notificationCreateManyMock).not.toHaveBeenCalled();
  });

  it("rejects an empty title/message with a 400, not a 500", async () => {
    const res = await POST(makeRequest({ title: "", message: "", target: "ALL" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/notifications — SITE-only (default channel)", () => {
  it("creates a site notification per member and never touches email/SMS", async () => {
    userFindManyMock.mockResolvedValueOnce([{ id: "u1" }, { id: "u2" }]);
    notificationCreateManyMock.mockResolvedValueOnce({ count: 2 });

    const res = await POST(makeRequest({ title: "Hi", message: "Hello", target: "ALL" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.count).toBe(2);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendSmsMock).not.toHaveBeenCalled();
    // Only one findMany for resolving the "ALL" target — no second lookup
    // for email/SMS recipients since neither channel was requested.
    expect(userFindManyMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/admin/notifications — EMAIL/SMS dispatch (this session's new logic)", () => {
  it("sends email only to members who haven't opted out, skips those without an address", async () => {
    // First findMany resolves the "ALL" target list of ids.
    userFindManyMock.mockResolvedValueOnce([{ id: "u1" }, { id: "u2" }, { id: "u3" }]);
    notificationCreateManyMock.mockResolvedValueOnce({ count: 3 });
    // Second findMany fetches email/phone/preferences for dispatch.
    userFindManyMock.mockResolvedValueOnce([
      { id: "u1", email: "u1@test.com", phone: null, preferences: { emailNotifications: true, smsNotifications: false } },
      { id: "u2", email: "u2@test.com", phone: null, preferences: { emailNotifications: false, smsNotifications: false } }, // opted out
      { id: "u3", email: null, phone: null, preferences: null }, // no address on file, defaults to opted-in but nothing to send to
    ]);

    const res = await POST(
      makeRequest({ title: "Maintenance", message: "Pool closed", target: "ALL", channels: ["SITE", "EMAIL"] })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "u1@test.com", subject: "Maintenance" })
    );
    expect(json.emailsSent).toBe(1);
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("respects the SMS opt-in default (false) — a user with no preferences row gets no SMS", async () => {
    userFindManyMock.mockResolvedValueOnce([{ id: "u1" }]);
    notificationCreateManyMock.mockResolvedValueOnce({ count: 1 });
    userFindManyMock.mockResolvedValueOnce([
      { id: "u1", email: null, phone: "+21612345678", preferences: null },
    ]);

    const res = await POST(
      makeRequest({ title: "t", message: "m", target: "ALL", channels: ["SMS"] })
    );
    const json = await res.json();
    expect(sendSmsMock).not.toHaveBeenCalled();
    expect(json.smsSent).toBe(0);
  });

  it("sends SMS when a user has explicitly opted in and has a phone number", async () => {
    userFindManyMock.mockResolvedValueOnce([{ id: "u1" }]);
    notificationCreateManyMock.mockResolvedValueOnce({ count: 1 });
    userFindManyMock.mockResolvedValueOnce([
      { id: "u1", email: null, phone: "+21612345678", preferences: { emailNotifications: true, smsNotifications: true } },
    ]);

    const res = await POST(
      makeRequest({ title: "Rappel", message: "Séance à 18h", target: "ALL", channels: ["SMS"] })
    );
    const json = await res.json();
    expect(sendSmsMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+21612345678" })
    );
    expect(json.smsSent).toBe(1);
  });

  it("one recipient's delivery failure doesn't fail the request or block other recipients", async () => {
    userFindManyMock.mockResolvedValueOnce([{ id: "u1" }, { id: "u2" }]);
    notificationCreateManyMock.mockResolvedValueOnce({ count: 2 });
    userFindManyMock.mockResolvedValueOnce([
      { id: "u1", email: "fails@test.com", phone: null, preferences: { emailNotifications: true, smsNotifications: false } },
      { id: "u2", email: "ok@test.com", phone: null, preferences: { emailNotifications: true, smsNotifications: false } },
    ]);
    sendEmailMock.mockImplementationOnce(() => Promise.reject(new Error("Resend unavailable")));
    sendEmailMock.mockImplementationOnce(() => Promise.resolve());

    const res = await POST(
      makeRequest({ title: "t", message: "m", target: "ALL", channels: ["EMAIL"] })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    // The in-app notifications were still created for both...
    expect(json.count).toBe(2);
    // ...and exactly one of the two emails actually succeeded.
    expect(json.emailsSent).toBe(1);
  });
});
