import { describe, it, expect } from "vitest";
import { extractSlugFromHost, isTenantHost } from "../host";

describe("extractSlugFromHost", () => {
  it("treats bare localhost as the platform host (no tenant)", () => {
    expect(extractSlugFromHost("localhost")).toBeNull();
    expect(extractSlugFromHost("localhost:3000")).toBeNull();
    expect(extractSlugFromHost("127.0.0.1:3000")).toBeNull();
  });

  it("resolves a *.localhost host to its tenant slug", () => {
    expect(extractSlugFromHost("club-a.localhost")).toBe("club-a");
    expect(extractSlugFromHost("club-a.localhost:3000")).toBe("club-a");
    expect(extractSlugFromHost("Club-A.Localhost:3000")).toBe("club-a");
  });

  it("does not treat www.<slug>.localhost as a tenant", () => {
    expect(extractSlugFromHost("www.club-a.localhost:3000")).toBeNull();
  });

  it("treats a bare production apex domain as the platform host", () => {
    expect(extractSlugFromHost("gymos.com")).toBeNull();
    expect(extractSlugFromHost("www.gymos.com")).toBeNull();
  });

  it("resolves a production subdomain to its tenant slug", () => {
    expect(extractSlugFromHost("club-a.gymos.com")).toBe("club-a");
    expect(extractSlugFromHost("club-a.gymos.com:443")).toBe("club-a");
  });
});

describe("isTenantHost", () => {
  it("mirrors extractSlugFromHost's null/non-null result", () => {
    expect(isTenantHost("localhost:3000")).toBe(false);
    expect(isTenantHost("club-a.localhost:3000")).toBe(true);
    expect(isTenantHost("gymos.com")).toBe(false);
    expect(isTenantHost("club-a.gymos.com")).toBe(true);
  });
});