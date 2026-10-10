import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const findMany = vi.fn();
const updateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: { deviceToken: { findMany: (...a: unknown[]) => findMany(...a), updateMany: (...a: unknown[]) => updateMany(...a) } },
}));

const { sendPushToUsers, isValidExpoPushToken, EXPO_PUSH_URL } = await import("../push");

const tok = (i: number) => `ExponentPushToken[token${String(i).padStart(6, "0")}]`;
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  updateMany.mockResolvedValue({ count: 0 });
});
afterEach(() => vi.unstubAllGlobals());

function okTickets(n: number) {
  return { ok: true, status: 200, json: async () => ({ data: Array.from({ length: n }, () => ({ status: "ok", id: "x" })) }) };
}

describe("isValidExpoPushToken", () => {
  it("accepts Expo tokens and nothing else", () => {
    expect(isValidExpoPushToken(tok(1))).toBe(true);
    expect(isValidExpoPushToken("ExpoPushToken[abcdefghij]")).toBe(true);
    for (const bad of [null, 42, "", "abc", "ExponentPushToken[]", "ExponentPushToken[a b c d e f g h]", "fcm:123"]) {
      expect(isValidExpoPushToken(bad)).toBe(false);
    }
  });
});

describe("sendPushToUsers", () => {
  it("does nothing (no HTTP call) with no recipients or no registered devices", async () => {
    expect((await sendPushToUsers("c1", [], { title: "t", body: "b" })).attempted).toBe(0);
    findMany.mockResolvedValue([]);
    expect((await sendPushToUsers("c1", ["u1"], { title: "t", body: "b" })).attempted).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("selects only this club's active devices of active users who haven't turned push off", async () => {
    findMany.mockResolvedValue([]);
    await sendPushToUsers("club_a", ["u1", "u1", "u2"], { title: "t", body: "b" });
    const where = (findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.clubId).toBe("club_a");
    expect(where.userId).toEqual({ in: ["u1", "u2"] });
    expect(where.isActive).toBe(true);
    expect(JSON.stringify(where.user)).toContain("pushNotifications");
  });

  it("posts to Expo in chunks of 100 with title/body/data", async () => {
    findMany.mockResolvedValue(Array.from({ length: 250 }, (_, i) => ({ token: tok(i) })));
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => okTickets(JSON.parse(init.body).length));
    const r = await sendPushToUsers("c1", ["u1"], { title: "Hello", body: "World", data: { type: "INFO" } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe(EXPO_PUSH_URL);
    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(first).toHaveLength(100);
    expect(first[0]).toMatchObject({ title: "Hello", body: "World", data: { type: "INFO" }, channelId: "default" });
    expect(r).toMatchObject({ attempted: 250, accepted: 250, rejected: 0 });
  });

  it("deactivates tokens Expo reports as DeviceNotRegistered", async () => {
    findMany.mockResolvedValue([{ token: tok(1) }, { token: tok(2) }]);
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ data: [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }] }),
    });
    updateMany.mockResolvedValue({ count: 1 });
    const r = await sendPushToUsers("c1", ["u1"], { title: "t", body: "b" });
    expect(updateMany).toHaveBeenCalledWith({ where: { clubId: "c1", token: { in: [tok(2)] } }, data: { isActive: false } });
    expect(r).toMatchObject({ accepted: 1, rejected: 1, deactivated: 1 });
  });

  it("never throws when the push service is down", async () => {
    findMany.mockResolvedValue([{ token: tok(1) }]);
    fetchMock.mockRejectedValue(new Error("network"));
    await expect(sendPushToUsers("c1", ["u1"], { title: "t", body: "b" })).resolves.toMatchObject({ rejected: 1 });
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    await expect(sendPushToUsers("c1", ["u1"], { title: "t", body: "b" })).resolves.toMatchObject({ rejected: 1 });
  });

  it("never throws when the database fails", async () => {
    findMany.mockRejectedValue(new Error("db down"));
    await expect(sendPushToUsers("c1", ["u1"], { title: "t", body: "b" })).resolves.toMatchObject({ attempted: 0 });
  });
});
