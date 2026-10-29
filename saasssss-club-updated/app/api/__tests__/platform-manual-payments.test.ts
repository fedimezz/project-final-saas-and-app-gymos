/**
 * Alternative (non-Stripe) subscription requests, SUPER_ADMIN side:
 *   PENDING → approve → APPROVED (activates nothing) → verify payment + reference → activate → CONFIRMED.
 * Prisma is mocked; the single conditional UPDATE (status = expected) is what prevents double activation,
 * so the mocks model it with a tiny in-memory row.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireSuperAdmin = vi.fn();
type Row = Record<string, unknown> & { status: string };
let row: Row;
let clubStatus = "TRIAL";
let existingSubscription: Record<string, unknown> = { id: "sub-1", clubId: "club-1" };

const saasPaymentCreate = vi.fn();
const subscriptionUpdate = vi.fn();
const clubUpdateMany = vi.fn();

vi.mock("@/lib/auth", () => ({ requireSuperAdmin: (...a: unknown[]) => requireSuperAdmin(...a) }));
vi.mock("@/lib/csrf", () => ({ verifyOrigin: () => null }));
vi.mock("@/lib/activity-log", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ invalidateClubCache: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), escapeHtml: (s: string) => s }));

function manualDelegate() {
  return {
    findUnique: async () => (row ? { ...row } : null),
    findUniqueOrThrow: async () => ({ ...row }),
    // updateMany with `status` (string or {in:[]}) in the where behaves like a compare-and-set
    updateMany: async ({ where, data }: { where: { status: string | { in: string[] } }; data: Record<string, unknown> }) => {
      const ok = typeof where.status === "string" ? row.status === where.status : where.status.in.includes(row.status);
      if (!ok) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  };
}
vi.mock("@/lib/prisma", () => {
  const prisma = {
    manualPaymentRequest: manualDelegate(),
    club: { findUnique: async () => ({ slug: "gym-a", status: clubStatus }) },
    // like a real transaction: if the callback throws, every change to the row is rolled back
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const before = row ? { ...row } : row;
      try {
        return await cb({
        manualPaymentRequest: manualDelegate(),
        club: { findUnique: async () => ({ status: clubStatus }), updateMany: (...a: unknown[]) => clubUpdateMany(...a) },
        clubSubscription: {
          findUniqueOrThrow: async () => ({ ...existingSubscription }),
          update: (...a: unknown[]) => subscriptionUpdate(...a),
        },
        saasPayment: { create: (...a: unknown[]) => saasPaymentCreate(...a) },
        });
      } catch (e) {
        row = before;
        throw e;
      }
    },
  };
  return { default: prisma };
});

beforeEach(() => {
  vi.clearAllMocks();
  clubStatus = "TRIAL";
  existingSubscription = { id: "sub-1", clubId: "club-1" };
  row = { id: "req-1", clubId: "club-1", planId: "plan-pro", billingPeriod: "MONTHLY", amount: 79, currency: "USD", status: "PENDING" };
  requireSuperAdmin.mockResolvedValue({ ok: true, user: { id: "root", name: "Root" } });
});

async function patch(body: unknown, id = "req-1") {
  const { PATCH } = await import("@/app/api/platform/manual-payments/[id]/route");
  return PATCH(
    new NextRequest(`https://yoursaas.test/api/platform/manual-payments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "https://yoursaas.test" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

describe("approve / reject", () => {
  it("approving moves PENDING → APPROVED and activates NOTHING", async () => {
    const res = await patch({ action: "approve", note: "ok" });
    expect(res.status).toBe(200);
    expect(row.status).toBe("APPROVED");
    expect(row.reviewedBy).toBe("root");
    expect(saasPaymentCreate).not.toHaveBeenCalled();
    expect(subscriptionUpdate).not.toHaveBeenCalled();
    expect(clubUpdateMany).not.toHaveBeenCalled();
  });

  it("approving twice is refused (409), the second click changes nothing", async () => {
    await patch({ action: "approve" });
    const again = await patch({ action: "approve" });
    expect(again.status).toBe(409);
  });

  it("rejecting a PENDING or an APPROVED request closes it without activating", async () => {
    expect((await patch({ action: "reject", note: "no" })).status).toBe(200);
    expect(row.status).toBe("REJECTED");
    row.status = "APPROVED";
    expect((await patch({ action: "reject", note: "payment never came" })).status).toBe(200);
    expect(row.status).toBe("REJECTED");
    expect(saasPaymentCreate).not.toHaveBeenCalled();
    expect(subscriptionUpdate).not.toHaveBeenCalled();
  });

  it("an already activated (CONFIRMED) request cannot be rejected or re-approved", async () => {
    row.status = "CONFIRMED";
    expect((await patch({ action: "reject" })).status).toBe(409);
    expect((await patch({ action: "approve" })).status).toBe(409);
    expect(row.status).toBe("CONFIRMED");
  });
});

describe("activate", () => {
  it("is refused for a request that was never approved (PENDING): nothing is written", async () => {
    const res = await patch({ action: "activate", paymentReference: "VIR-2026-0042" });
    expect(res.status).toBe(409);
    expect(row.status).toBe("PENDING");
    expect(saasPaymentCreate).not.toHaveBeenCalled();
    expect(subscriptionUpdate).not.toHaveBeenCalled();
  });

  it("is refused without a payment / agreement reference (400)", async () => {
    row.status = "APPROVED";
    for (const body of [{ action: "activate" }, { action: "activate", paymentReference: "" }, { action: "activate", paymentReference: "x" }]) {
      expect((await patch(body)).status).toBe(400);
    }
    expect(row.status).toBe("APPROVED");
    expect(saasPaymentCreate).not.toHaveBeenCalled();
  });

  it("activates an APPROVED monthly request: PAID ledger row, 1-month period, club re-opened", async () => {
    row.status = "APPROVED";
    const res = await patch({ action: "activate", paymentReference: "VIR-2026-0042", note: "reçu le 21/10" });
    expect(res.status).toBe(200);
    expect(row).toMatchObject({ status: "CONFIRMED", paymentReference: "VIR-2026-0042", verifiedBy: "root" });
    expect(saasPaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ clubId: "club-1", amount: 79, status: "PAID", paymentProvider: "MANUAL", providerRef: "manual:req-1", billingPeriod: "MONTHLY" }),
    });
    const sub = subscriptionUpdate.mock.calls[0][0].data;
    expect(sub).toMatchObject({ planId: "plan-pro", billingPeriod: "MONTHLY", status: "ACTIVE", trialEndsAt: null });
    const days = (sub.currentPeriodEnd.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
    expect(clubUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "club-1", status: { not: "CANCELLED" } },
      data: expect.objectContaining({ status: "ACTIVE", trialEndsAt: null, suspendedAt: null, suspendedReason: null }),
    }));
  });

  it("activates a YEARLY request for one year", async () => {
    row.status = "APPROVED";
    row.billingPeriod = "YEARLY";
    row.amount = 790;
    await patch({ action: "activate", paymentReference: "D17-998877" });
    const sub = subscriptionUpdate.mock.calls[0][0].data;
    expect(sub.billingPeriod).toBe("YEARLY");
    const days = (sub.currentPeriodEnd.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(364);
    expect(days).toBeLessThan(367);
    expect(saasPaymentCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: 790, billingPeriod: "YEARLY" }) });
  });

  it("renewing the same plan before it ends continues from the running period's end; a plan change starts now", async () => {
    existingSubscription = { id: "sub-1", clubId: "club-1", planId: "plan-pro", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 10 * 86_400_000) };
    row.status = "APPROVED";
    await patch({ action: "activate", paymentReference: "VIR-RENEW" });
    let days = (subscriptionUpdate.mock.calls[0][0].data.currentPeriodEnd.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(36);
    expect(days).toBeLessThan(42);

    subscriptionUpdate.mockClear();
    existingSubscription = { id: "sub-1", clubId: "club-1", planId: "plan-basic", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 10 * 86_400_000) };
    row = { ...row, status: "APPROVED" };
    await patch({ action: "activate", paymentReference: "VIR-CHANGE" });
    days = (subscriptionUpdate.mock.calls[0][0].data.currentPeriodEnd.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
  });

  it("cannot be activated twice (double click / two admins / replay): exactly one payment and one period", async () => {
    row.status = "APPROVED";
    const first = await patch({ action: "activate", paymentReference: "VIR-1" });
    const second = await patch({ action: "activate", paymentReference: "VIR-1" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(saasPaymentCreate).toHaveBeenCalledTimes(1);
    expect(subscriptionUpdate).toHaveBeenCalledTimes(1);
  });

  it("never re-opens a club the platform banned (CANCELLED): 409 and the request stays APPROVED", async () => {
    row.status = "APPROVED";
    clubStatus = "CANCELLED";
    const res = await patch({ action: "activate", paymentReference: "VIR-1" });
    expect(res.status).toBe(409);
    expect(saasPaymentCreate).not.toHaveBeenCalled();
    expect(subscriptionUpdate).not.toHaveBeenCalled();
    expect(row.status).toBe("APPROVED"); // the claim was rolled back with the transaction
  });
});

describe("access control", () => {
  it("only SUPER_ADMIN may review (403 otherwise) and nothing is touched", async () => {
    requireSuperAdmin.mockResolvedValue({ ok: false, status: 403 });
    row.status = "APPROVED";
    const res = await patch({ action: "activate", paymentReference: "VIR-1" });
    expect(res.status).toBe(403);
    expect(row.status).toBe("APPROVED");
    expect(saasPaymentCreate).not.toHaveBeenCalled();
  });

  it("404 for an unknown request, 400 for an unknown action", async () => {
    (row as unknown as null) = null as never;
    expect((await patch({ action: "approve" }, "nope")).status).toBe(404);
    row = { id: "req-1", clubId: "club-1", status: "PENDING", billingPeriod: "MONTHLY" };
    expect((await patch({ action: "confirm" })).status).toBe(400); // the old one-step action no longer exists
  });
});
