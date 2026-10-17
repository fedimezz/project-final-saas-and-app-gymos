import { describe, expect, it } from "vitest";
import { detectDevice } from "@/lib/device";

describe("detectDevice", () => {
  it("recognizes the mobile app even when its user agent is generic", () => {
    expect(detectDevice(new Headers({ "x-client-type": "mobile-app", "user-agent": "okhttp" }))).toBe("PHONE");
  });

  it("recognizes a mobile browser", () => {
    expect(detectDevice(new Headers({ "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile" }))).toBe("PHONE");
  });

  it("recognizes a desktop browser", () => {
    expect(detectDevice(new Headers({ "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }))).toBe("COMPUTER");
  });

  it("reports unknown when request device headers are unavailable", () => {
    expect(detectDevice(new Headers())).toBe("UNKNOWN");
  });
});
