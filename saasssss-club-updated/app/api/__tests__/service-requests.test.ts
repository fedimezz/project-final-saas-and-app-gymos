/**
 * Custom-domain + paid-service requests: validation, price snapshot,
 * no hardcoded fallback price, tenant scoping, SUPER_ADMIN-only management.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { normalizeDomain, canTransition, DOMAIN_TRANSITIONS, SERVICE_TRANSITIONS } from "@/lib/domain-requests";

const requireOwner = vi.fn();
const requireSuperAdmin = vi.fn();
vi.mock("@/lib/auth", async (orig) => {
  const real = await orig<typeof import("@/lib/auth")>();
  return {
    ...real,
    requireOwner: (...a: unknown[]) => requireOwner(...a),
    requireSuperAdmin: (...a: unknown[]) => requireSuperAdmin(...a),
  };
});
vi.mock("@/lib/activity-log", () => ({ logAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/after", () => ({ runAfter: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 5, resetAt: 0 }),
  getClientIp: () => "1.2.3.4",
}));

const db = {
  servicePrice: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
  domainRequest: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  serviceRequest: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  club: { update: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
};
vi.mock("@/lib/prisma", () => ({ default: db }));

const owner = { ok: true, user: { id: "u1", name: "Own", role: "OWNER", clubId: "clubA" } };
const post = (url: string, body: unknown) =>
  new NextRequest(`https://clubA.test${url}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
const patch = (url: string, body: unknown) =>
  new NextRequest(`https://yoursaas.test${url}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  requireOwner.mockResolvedValue(owner);
  requireSuperAdmin.mockResolvedValue({ ok: true, user: { id: "sa", name: "Root", role: "SUPER_ADMIN", clubId: null } });
  db.domainRequest.findFirst.mockResolvedValue(null);
});

describe("normalizeDomain", () => {
  it.each([
    ["https://WWW.MonClub.tn/path?x=1", "www.monclub.tn"],
    ["monclub.com.", "monclub.com"],
    ["gym.example.org:8443", "gym.example.org"],
  ])("normalises %s", (input, out) => expect(normalizeDomain(input)).toBe(out));

  it.each(["", "localhost", "monclub", "192.168.1.10", "-bad.com", "a b.com", "user@x.com", "x.local", "exa_mple.com"])(
    "rejects %s", (input) => expect(normalizeDomain(input)).toBeNull()
  );
});

describe("status workflow", () => {
  it("follows PENDING → APPROVED/REJECTED → CONFIGURING → ACTIVE", () => {
    expect(canTransition(DOMAIN_TRANSITIONS, "PENDING", "APPROVED")).toBe(true);
    expect(canTransition(DOMAIN_TRANSITIONS, "PENDING", "ACTIVE")).toBe(false);
    expect(canTransition(DOMAIN_TRANSITIONS, "APPROVED", "CONFIGURING")).toBe(true);
    expect(canTransition(DOMAIN_TRANSITIONS, "CONFIGURING", "ACTIVE")).toBe(true);
    expect(canTransition(DOMAIN_TRANSITIONS, "REJECTED", "PENDING")).toBe(false);
    expect(canTransition(SERVICE_TRANSITIONS, "COMPLETED", "PENDING")).toBe(false);
  });
});

describe("owner POST /api/admin/domain-request", () => {
  it("snapshots price+currency from service_prices and scopes to the session club", async () => {
    db.servicePrice.findUnique.mockResolvedValue({ price: 120, currency: "TND", isActive: true });
    db.domainRequest.create.mockResolvedValue({ id: "d1" });
    const { POST } = await import("@/app/api/admin/domain-request/route");
    const res = await POST(post("/api/admin/domain-request", { domain: "https://www.MyGym.tn/", clubId: "clubB" }));
    expect(res.status).toBe(201);
    expect(db.domainRequest.create.mock.calls[0][0].data).toMatchObject({
      clubId: "clubA", requestedBy: "u1", domain: "www.mygym.tn", priceAtRequest: 120, currency: "TND",
    });
  });

  it("refuses (503) instead of inventing a price when none is configured", async () => {
    db.servicePrice.findUnique.mockResolvedValue(null);
    const { POST } = await import("@/app/api/admin/domain-request/route");
    const res = await POST(post("/api/admin/domain-request", { domain: "mygym.tn" }));
    expect(res.status).toBe(503);
    expect(db.domainRequest.create).not.toHaveBeenCalled();
  });

  it("refuses (503) when the price is deactivated", async () => {
    db.servicePrice.findUnique.mockResolvedValue({ price: 50, currency: "TND", isActive: false });
    const { POST } = await import("@/app/api/admin/domain-request/route");
    expect((await POST(post("/api/admin/domain-request", { domain: "mygym.tn" }))).status).toBe(503);
  });

  it("rejects invalid domains and a second live request", async () => {
    const { POST } = await import("@/app/api/admin/domain-request/route");
    expect((await POST(post("/api/admin/domain-request", { domain: "not a domain" }))).status).toBe(400);
    db.domainRequest.findFirst.mockResolvedValue({ id: "old" });
    expect((await POST(post("/api/admin/domain-request", { domain: "mygym.tn" }))).status).toBe(409);
  });

  it("is owner-only", async () => {
    requireOwner.mockResolvedValue({ ok: false, status: 403 });
    const { POST } = await import("@/app/api/admin/domain-request/route");
    expect((await POST(post("/api/admin/domain-request", { domain: "mygym.tn" }))).status).toBe(403);
  });
});

describe("owner POST /api/admin/service-request", () => {
  it("snapshots the current price and cannot order CUSTOM_DOMAIN here", async () => {
    db.serviceRequest.findFirst.mockResolvedValue(null);
    db.servicePrice.findUnique.mockResolvedValue({ price: 300, currency: "EUR", isActive: true });
    db.serviceRequest.create.mockResolvedValue({ id: "s1" });
    const { POST } = await import("@/app/api/admin/service-request/route");
    expect((await POST(post("/api/admin/service-request", { type: "CUSTOM_DOMAIN" }))).status).toBe(400);
    const res = await POST(post("/api/admin/service-request", { type: "PROFESSIONAL_SETUP", description: "aide" }));
    expect(res.status).toBe(201);
    expect(db.serviceRequest.create.mock.calls[0][0].data).toMatchObject({
      clubId: "clubA", type: "PROFESSIONAL_SETUP", priceAtRequest: 300, currency: "EUR",
    });
  });
});

describe("SUPER_ADMIN management", () => {
  it("price changes are SUPER_ADMIN-only and validated", async () => {
    const { PUT } = await import("@/app/api/platform/service-prices/route");
    const mk = (b: unknown) => new NextRequest("https://yoursaas.test/api/platform/service-prices", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
    });
    requireSuperAdmin.mockResolvedValueOnce({ ok: false, status: 403 });
    expect((await PUT(mk({ serviceType: "CUSTOM_DOMAIN", price: 10, currency: "TND" }))).status).toBe(403);
    expect((await PUT(mk({ serviceType: "BOGUS", price: 10, currency: "TND" }))).status).toBe(400);
    expect((await PUT(mk({ serviceType: "CUSTOM_DOMAIN", price: -1, currency: "TND" }))).status).toBe(400);
    expect((await PUT(mk({ serviceType: "CUSTOM_DOMAIN", price: 10.123456, currency: "EUR" }))).status).toBe(400);
    db.servicePrice.upsert.mockResolvedValue({ isActive: true });
    expect((await PUT(mk({ serviceType: "CUSTOM_DOMAIN", price: 99.5, currency: "TND" }))).status).toBe(200);
  });

  it("rejects illegal transitions and a missing request (404, not 500)", async () => {
    const { PATCH } = await import("@/app/api/platform/domain-requests/[id]/route");
    db.domainRequest.findUnique.mockResolvedValue(null);
    expect((await PATCH(patch("/x", { status: "APPROVED" }), { params: Promise.resolve({ id: "nope" }) })).status).toBe(404);
    db.domainRequest.findUnique.mockResolvedValue({ id: "d1", clubId: "clubA", domain: "g.tn", status: "PENDING" });
    expect((await PATCH(patch("/x", { status: "ACTIVE" }), { params: Promise.resolve({ id: "d1" }) })).status).toBe(409);
  });

  it("ACTIVE sets the club's customDomain in the same transaction as the status change", async () => {
    db.domainRequest.findUnique.mockResolvedValue({ id: "d1", clubId: "clubA", domain: "g.tn", status: "CONFIGURING" });
    db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
    db.domainRequest.update.mockResolvedValue({ id: "d1", status: "ACTIVE" });
    const { PATCH } = await import("@/app/api/platform/domain-requests/[id]/route");
    const res = await PATCH(patch("/x", { status: "ACTIVE" }), { params: Promise.resolve({ id: "d1" }) });
    expect(res.status).toBe(200);
    expect(db.club.update).toHaveBeenCalledWith({ where: { id: "clubA" }, data: { customDomain: "g.tn" } });
  });

  it("a club owner token can never reach platform management", async () => {
    requireSuperAdmin.mockResolvedValue({ ok: false, status: 403 });
    const { PATCH } = await import("@/app/api/platform/service-requests/[id]/route");
    expect((await PATCH(patch("/x", { status: "APPROVED" }), { params: Promise.resolve({ id: "s1" }) })).status).toBe(403);
  });
});
