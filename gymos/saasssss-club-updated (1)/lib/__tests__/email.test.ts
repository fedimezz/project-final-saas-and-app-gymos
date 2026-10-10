import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "../email";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sendEmail via Resend", () => {
  it("sends the existing email fields to the Resend REST API", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-test-key");
    vi.stubEnv("RESEND_FROM", "GymOS <no-reply@example.test>");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email-id" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail({ to: "person@example.test", subject: "Welcome", html: "<p>Hello</p>" });

    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer resend-test-key",
      },
      body: JSON.stringify({
        from: "GymOS <no-reply@example.test>",
        to: ["person@example.test"],
        subject: "Welcome",
        html: "<p>Hello</p>",
      }),
    }));
  });

  it("fails clearly when credentials or a verified sender are missing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendEmail({ to: "person@example.test", subject: "Secret", html: "private" })).rejects.toThrow("Email provider is not configured");
    expect(error.mock.calls.flat().join(" ")).not.toContain("person@example.test");
    expect(error.mock.calls.flat().join(" ")).not.toContain("private");
  });

  it("throws only the HTTP status when Resend rejects a request", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-test-key");
    vi.stubEnv("RESEND_FROM", "no-reply@example.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("provider details", { status: 422 })));

    await expect(sendEmail({ to: "person@example.test", subject: "Welcome", html: "<p>Hello</p>" })).rejects.toThrow("Resend send failed (422)");
    await expect(sendEmail({ to: "person@example.test", subject: "Welcome", html: "<p>Hello</p>" })).rejects.not.toThrow("provider details");
  });
});