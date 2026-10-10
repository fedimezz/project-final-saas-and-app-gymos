import { describe, it, expect, afterEach, vi } from "vitest";
import { verifyOrigin } from "../csrf";

function req(headers: Record<string, string>, url = "https://club-a.yoursaas.test/api/x") {
  return new Request(url, { method: "POST", headers });
}

afterEach(() => vi.unstubAllEnvs());

describe("verifyOrigin (same-origin rule)", () => {
  it("allows a same-origin write on a tenant subdomain", () => {
    const r = req({ host: "club-a.yoursaas.test", origin: "https://club-a.yoursaas.test" });
    expect(verifyOrigin(r)).toBeNull();
  });

  it("allows a same-origin write from a CUSTOM domain club", () => {
    const r = req({ host: "gym.example.com", origin: "https://gym.example.com" }, "https://gym.example.com/api/x");
    expect(verifyOrigin(r)).toBeNull();
  });

  it("does not trust a caller-controlled x-forwarded-host", () => {
    const r = req(
      { host: "internal:3000", "x-forwarded-host": "club-a.yoursaas.test", origin: "https://club-a.yoursaas.test" },
      "https://internal:3000/api/x"
    );
    expect(verifyOrigin(r)?.status).toBe(403);
  });

  it("REJECTS another tenant's subdomain (a hostile club's page must not write to yours)", () => {
    const r = req({ host: "club-a.yoursaas.test", origin: "https://club-evil.yoursaas.test" });
    expect(verifyOrigin(r)?.status).toBe(403);
  });

  it("REJECTS a tenant subdomain writing to the apex / platform API", () => {
    const r = req({ host: "yoursaas.test", origin: "https://club-evil.yoursaas.test" }, "https://yoursaas.test/api/platform/x");
    expect(verifyOrigin(r)?.status).toBe(403);
  });

  it("REJECTS a foreign site and the opaque 'null' origin", () => {
    expect(verifyOrigin(req({ host: "club-a.yoursaas.test", origin: "https://evil.com" }))?.status).toBe(403);
    expect(verifyOrigin(req({ host: "club-a.yoursaas.test", origin: "null" }))?.status).toBe(403);
  });

  it("does not confuse a look-alike host suffix", () => {
    const r = req({ host: "club-a.yoursaas.test", origin: "https://club-a.yoursaas.test.evil.com" });
    expect(verifyOrigin(r)?.status).toBe(403);
  });

  it("no Origin: allowed for server-to-server, refused when the browser says cross-site", () => {
    expect(verifyOrigin(req({ host: "club-a.yoursaas.test" }))).toBeNull();
    expect(verifyOrigin(req({ host: "club-a.yoursaas.test", "sec-fetch-site": "cross-site" }))?.status).toBe(403);
    expect(verifyOrigin(req({ host: "club-a.yoursaas.test", "sec-fetch-site": "same-origin" }))).toBeNull();
  });

  it("dev only: localhost <-> *.localhost is tolerated, production is not", () => {
    const r = () => req({ host: "localhost:3000", origin: "http://club-a.localhost:3000" }, "http://localhost:3000/api/x");
    vi.stubEnv("NODE_ENV", "development");
    expect(verifyOrigin(r())).toBeNull();
    vi.stubEnv("NODE_ENV", "production");
    expect(verifyOrigin(r())?.status).toBe(403);
  });
});
