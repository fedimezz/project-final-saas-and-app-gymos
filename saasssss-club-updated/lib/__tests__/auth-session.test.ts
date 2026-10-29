import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

const userFindUniqueMock = vi.fn();
const clubFindUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...a: unknown[]) => userFindUniqueMock(...a) },
    club: { findUnique: (...a: unknown[]) => clubFindUniqueMock(...a) },
  },
}));

const SECRET = "test-secret-do-not-use-in-production";
beforeAll(() => {
  process.env.JWT_SECRET = SECRET;
});

const { generateToken, verifyToken, generateBridgeToken, verifyBridgeToken, hashBridgeNonce, requireUser, clearAccountCache } =
  await import("../auth");

// The per-request account check is cached for a few seconds; without this a
// previous test's user (same id) would be served to the next test.
beforeEach(() => clearAccountCache());

const DAY = 24 * 60 * 60 * 1000;
const club = { id: "club-s_id", slug: "club-s", name: "S", status: "ACTIVE" };
const account = { id: "u1", email: "a@b.com", role: "MEMBER", name: "U", isActive: true, clubId: club.id };

function request(token: string) {
  return new Request("https://club-s.example.test/api/x", {
    headers: { host: "club-s.example.test", cookie: `token=${token}` },
  });
}
function tokenIssuedAt(iat: number) {
  return jwt.sign({ id: "u1", email: "a@b.com", role: "MEMBER", name: "U", clubId: club.id, iat }, SECRET, { expiresIn: "7d" });
}

describe("session revocation (passwordChangedAt)", () => {
  it("accepts a token issued AFTER the last password change", async () => {
    clubFindUniqueMock.mockResolvedValue(club);
    userFindUniqueMock.mockResolvedValue({ ...account, passwordChangedAt: new Date(Date.now() - 2 * DAY) });
    const iat = Math.floor((Date.now() - 1 * DAY) / 1000);
    const res = await requireUser(request(tokenIssuedAt(iat)));
    expect(res.ok).toBe(true);
  });

  it("REJECTS (401) a token issued BEFORE the last password change", async () => {
    clubFindUniqueMock.mockResolvedValue(club);
    userFindUniqueMock.mockResolvedValue({ ...account, passwordChangedAt: new Date(Date.now() - 1 * DAY) });
    const iat = Math.floor((Date.now() - 2 * DAY) / 1000);
    const res = await requireUser(request(tokenIssuedAt(iat)));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it("a token minted in the same second as the change stays valid (re-issue on password change)", async () => {
    clubFindUniqueMock.mockResolvedValue(club);
    const changedAt = new Date(Math.floor(Date.now() / 1000) * 1000 + 750 - DAY);
    userFindUniqueMock.mockResolvedValue({ ...account, passwordChangedAt: changedAt });
    const iat = Math.floor(changedAt.getTime() / 1000);
    expect((await requireUser(request(tokenIssuedAt(iat)))).ok).toBe(true);
  });

  it("accounts that never changed their password are unaffected", async () => {
    clubFindUniqueMock.mockResolvedValue(club);
    userFindUniqueMock.mockResolvedValue({ ...account, passwordChangedAt: null });
    const token = generateToken({ id: "u1", email: "a@b.com", role: "MEMBER", name: "U", clubId: club.id });
    expect((await requireUser(request(token))).ok).toBe(true);
  });
});

describe("bridge tokens", () => {
  const nonceHash = hashBridgeNonce("nonce-123");

  it("round-trips through verifyBridgeToken", () => {
    const t = generateBridgeToken({ id: "u1", clubId: "c1", nonceHash });
    const p = verifyBridgeToken(t);
    expect(p).toMatchObject({ id: "u1", clubId: "c1", nonce: nonceHash });
    expect(p?.jti).toBeTruthy();
  });

  it("is NOT usable as a session token", () => {
    const t = generateBridgeToken({ id: "u1", clubId: "c1", nonceHash });
    expect(verifyToken(t)).toBeNull();
  });

  it("a regular SESSION token is NOT accepted as a bridge token (the old exploit)", () => {
    const session = generateToken({ id: "u1", email: "a@b.com", role: "OWNER", name: "U", clubId: "c1" });
    expect(verifyBridgeToken(session)).toBeNull();
  });

  it("every bridge token has a unique jti", () => {
    const a = verifyBridgeToken(generateBridgeToken({ id: "u1", clubId: "c1", nonceHash }));
    const b = verifyBridgeToken(generateBridgeToken({ id: "u1", clubId: "c1", nonceHash }));
    expect(a?.jti).not.toBe(b?.jti);
  });

  it("expires after two minutes", () => {
    const t = generateBridgeToken({ id: "u1", clubId: "c1", nonceHash });
    const { exp, iat } = jwt.decode(t) as { exp: number; iat: number };
    expect(exp - iat).toBe(120);
  });

  it("rejects tokens signed with another algorithm / key", () => {
    const forged = jwt.sign({ id: "u1", clubId: "c1", nonce: nonceHash, purpose: "bridge", jti: "x" }, "wrong-secret-wrong-secret-wrong!!");
    expect(verifyBridgeToken(forged)).toBeNull();
  });
});
