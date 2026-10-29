import { describe, it, expect, vi, afterEach } from "vitest";
import { toE164, isSmsDestinationAllowed, sendSms, verificationCodeSms } from "../sms";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("toE164", () => {
  it.each([
    ["+216 20 123 456", "+21620123456"],
    ["00216 20-123-456", "+21620123456"],
    ["20 123 456", "+21620123456"],
    ["(+33) 6 12 34 56 78", "+33612345678"],
  ])("%s → %s", (input, expected) => expect(toE164(input)).toBe(expected));

  it.each(["", "abc", "123", "+0123456789", "+216", "20123456789012345678"])("rejects %j", (input) =>
    expect(toE164(input)).toBeNull()
  );
});

describe("destination allow-list (anti SMS-pumping)", () => {
  it("allows Tunisia by default and nothing else", () => {
    expect(isSmsDestinationAllowed("+21620123456")).toBe(true);
    expect(isSmsDestinationAllowed("+33612345678")).toBe(false);
    expect(isSmsDestinationAllowed("+882345678901")).toBe(false); // international premium-style
  });

  it("is widened explicitly through SMS_ALLOWED_COUNTRY_CODES", () => {
    vi.stubEnv("SMS_ALLOWED_COUNTRY_CODES", "+216, +33");
    expect(isSmsDestinationAllowed("+33612345678")).toBe(true);
  });

  it("sendSms refuses a disallowed destination", async () => {
    await expect(sendSms({ to: "+33612345678", body: "x" })).rejects.toThrow(/rejected/);
  });

  it("the rejection message never contains the phone number", async () => {
    await expect(sendSms({ to: "+33612345678", body: "x" })).rejects.not.toThrow(/612345678/);
  });
});

describe("no secrets in logs", () => {
  it("production without TextBee fails without logging the OTP or number", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendSms({ to: "+21620123456", body: verificationCodeSms("424242", "Club A") })).rejects.toThrow("SMS provider is not configured");

    const everything = [...log.mock.calls, ...err.mock.calls].flat().join(" ");
    expect(everything).not.toContain("424242");
    expect(everything).not.toContain("20123456");
  });

  it("development without TextBee warns without printing the message", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await sendSms({ to: "+21620123456", body: "code 111111" });
    expect(log.mock.calls.flat().join(" ")).not.toContain("111111");
    expect(warn.mock.calls.flat().join(" ")).not.toContain("111111");
  });
});

describe("TextBee REST delivery", () => {
  it("sends the normalized destination, message, and optional device id", async () => {
    vi.stubEnv("TEXTBEE_API_KEY", "textbee-test-key");
    vi.stubEnv("TEXTBEE_DEVICE_ID", "device-123");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { success: true } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendSms({ to: "20 123 456", body: "Hello" });

    expect(fetchMock).toHaveBeenCalledWith("https://api.textbee.dev/api/v1/gateway/send-sms", expect.objectContaining({
      method: "POST",
      headers: { "x-api-key": "textbee-test-key", "Content-Type": "application/json" },
      body: JSON.stringify({ recipients: ["+21620123456"], message: "Hello", deviceId: "device-123" }),
    }));
  });

  it("uses the TextBee default device if no device id is configured", async () => {
    vi.stubEnv("TEXTBEE_API_KEY", "textbee-test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendSms({ to: "+21620123456", body: "Hello" });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      recipients: ["+21620123456"],
      message: "Hello",
    });
  });

  it("reports provider status without exposing its response body", async () => {
    vi.stubEnv("TEXTBEE_API_KEY", "textbee-test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private provider details", { status: 401 })));

    await expect(sendSms({ to: "+21620123456", body: "Hello" })).rejects.toThrow("TextBee SMS send failed (401)");
    await expect(sendSms({ to: "+21620123456", body: "Hello" })).rejects.not.toThrow("private provider details");
  });
});

describe("branding", () => {
  it("uses the club's name, not a hardcoded one", () => {
    expect(verificationCodeSms("246810", "Fit Club Sousse")).toContain("Fit Club Sousse");
    expect(verificationCodeSms("246810", "Fit Club Sousse")).not.toContain("Gammarth");
  });
});
