import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "../redirect";

const ORIGIN = "https://club-a.yoursaas.test";

describe("safeRedirectPath", () => {
  it("keeps ordinary same-origin paths (with query and hash)", () => {
    expect(safeRedirectPath("/admin/settings?welcome=1", "/admin", ORIGIN)).toBe("/admin/settings?welcome=1");
    expect(safeRedirectPath("/dashboard#top", "/admin", ORIGIN)).toBe("/dashboard#top");
  });

  it.each([
    ["protocol-relative", "//evil.com"],
    ["protocol-relative with path", "//evil.com/admin"],
    ["backslash trick", "/\\evil.com"],
    ["embedded backslash", "/foo\\..\\evil.com"],
    ["absolute URL", "https://evil.com"],
    ["javascript scheme", "javascript:alert(1)"],
    ["no leading slash", "evil.com"],
    ["control character", "/foo\r\nSet-Cookie: x=1"],
    ["tab (browsers strip it → //)", "/\t/evil.com"],
  ])("rejects %s", (_name, input) => {
    expect(safeRedirectPath(input, "/admin", ORIGIN)).toBe("/admin");
  });

  it("falls back on empty / null", () => {
    expect(safeRedirectPath(null, "/admin", ORIGIN)).toBe("/admin");
    expect(safeRedirectPath("", "/admin", ORIGIN)).toBe("/admin");
  });
});
