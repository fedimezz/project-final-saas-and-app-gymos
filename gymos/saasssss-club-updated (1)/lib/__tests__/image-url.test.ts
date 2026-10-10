import { describe, it, expect } from "vitest";
import { safeImageUrl, safeImageList } from "@/lib/image-url";

describe("safeImageUrl", () => {
  it("accepts allow-listed https hosts and same-origin paths", () => {
    expect(safeImageUrl("https://res.cloudinary.com/x/image/upload/a.jpg")).toContain("res.cloudinary.com");
    expect(safeImageUrl("/images/hero.jpg")).toBe("/images/hero.jpg");
  });
  it.each([
    "http://res.cloudinary.com/a.jpg", "https://evil.example.com/a.jpg", "javascript:alert(1)",
    "data:image/svg+xml;base64,AAAA", "//evil.com/a.jpg", "/../etc/passwd", "", "   ", null, undefined, 42,
  ])("rejects %s", (v) => expect(safeImageUrl(v as unknown)).toBeNull());
});

describe("safeImageList", () => {
  it("drops bad urls, de-duplicates and caps", () => {
    const ok = "https://res.cloudinary.com/a.jpg";
    expect(safeImageList([ok, ok, "http://x.com/a.jpg", "/p.jpg"], 12)).toEqual([ok, "/p.jpg"]);
    expect(safeImageList(Array.from({ length: 20 }, (_, i) => `/i${i}.jpg`), 12)).toHaveLength(12);
    expect(safeImageList("nope", 5)).toEqual([]);
  });
});
