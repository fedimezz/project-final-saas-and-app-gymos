import { describe, it, expect } from "vitest";
import { gymSettingsSchema } from "@/lib/validation";

describe("club settings links accept http(s) only", () => {
  for (const field of ["facebookUrl", "instagramUrl", "tiktokUrl", "twitterUrl", "youtubeUrl", "websiteUrl"] as const) {
    it(`${field}: javascript: and data: are refused, https is fine, empty clears`, () => {
      expect(gymSettingsSchema.safeParse({ [field]: "javascript:alert(1)" }).success).toBe(false);
      expect(gymSettingsSchema.safeParse({ [field]: "data:text/html,<script>1</script>" }).success).toBe(false);
      expect(gymSettingsSchema.safeParse({ [field]: "https://example.com/club" }).success).toBe(true);
      expect(gymSettingsSchema.safeParse({ [field]: "" }).success).toBe(true);
    });
  }
  it("themeId must be a known theme (or a legacy id that still resolves)", () => {
    expect(gymSettingsSchema.safeParse({ themeId: "boxing" }).success).toBe(true);
    expect(gymSettingsSchema.safeParse({ themeId: "classic" }).success).toBe(true);
    expect(gymSettingsSchema.safeParse({ themeId: "<script>" }).success).toBe(false);
  });
});
