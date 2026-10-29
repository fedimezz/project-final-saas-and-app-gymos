import { describe, it, expect, afterEach } from "vitest";
import { isAuthorizedCron } from "../cron-auth";

const req = (auth?: string) =>
  new Request("http://localhost/api/cron/x", {
    headers: auth ? { authorization: auth } : {},
  });

describe("isAuthorizedCron", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("rejects everything when CRON_SECRET is unset (no 'Bearer undefined' bypass)", () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCron(req("Bearer undefined"))).toBe(false);
    expect(isAuthorizedCron(req("Bearer "))).toBe(false);
    expect(isAuthorizedCron(req())).toBe(false);
  });

  it("rejects a secret that is too short", () => {
    process.env.CRON_SECRET = "short";
    expect(isAuthorizedCron(req("Bearer short"))).toBe(false);
  });

  it("accepts the exact bearer token", () => {
    process.env.CRON_SECRET = "a-long-enough-cron-secret-123";
    expect(isAuthorizedCron(req("Bearer a-long-enough-cron-secret-123"))).toBe(true);
  });

  it("rejects wrong, missing, or differently-cased tokens", () => {
    process.env.CRON_SECRET = "a-long-enough-cron-secret-123";
    expect(isAuthorizedCron(req("Bearer wrong-secret-of-same-len-xx"))).toBe(false);
    expect(isAuthorizedCron(req("a-long-enough-cron-secret-123"))).toBe(false);
    expect(isAuthorizedCron(req("bearer a-long-enough-cron-secret-123"))).toBe(false);
    expect(isAuthorizedCron(req())).toBe(false);
  });
});
