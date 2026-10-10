import { describe, expect, it } from "vitest";
import { detectPaymentCountry, isSupportedPaymentCountry, isTunisia } from "@/lib/payment-country";

describe("payment country routing", () => {
  it("uses trusted deployment country headers and normalizes country codes", () => {
    expect(detectPaymentCountry(new Headers({ "x-vercel-ip-country": "tn" }))).toBe("TN");
    expect(detectPaymentCountry(new Headers({ "cf-ipcountry": "US" }))).toBe("US");
  });

  it("ignores user-controlled forwarded IP headers and invalid country codes", () => {
    expect(detectPaymentCountry(new Headers({ "x-forwarded-for": "1.2.3.4" }))).toBeNull();
    expect(detectPaymentCountry(new Headers({ "x-vercel-ip-country": "XX", "cf-ipcountry": "TN" }))).toBe("TN");
    expect(isSupportedPaymentCountry("ZZ")).toBe(false);
    expect(isSupportedPaymentCountry("US")).toBe(true);
  });

  it("routes Tunisia separately", () => {
    expect(isTunisia("TN")).toBe(true);
    expect(isTunisia("US")).toBe(false);
  });
});
