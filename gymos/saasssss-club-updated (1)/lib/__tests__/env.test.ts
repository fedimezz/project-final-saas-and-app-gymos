import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { validateEnv } from "../env";

const REQUIRED = { DATABASE_URL: "postgres://u:p@host/db", JWT_SECRET: "x".repeat(32), APP_URL: "https://yoursaas.test" };
const savedEnv = { ...process.env };

beforeEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, REQUIRED);
});
afterEach(() => {
  vi.unstubAllEnvs();
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, savedEnv);
});

describe("validateEnv", () => {
  it("passes with all required vars set correctly", () => {
    expect(() => validateEnv()).not.toThrow();
  });

  it("throws listing every missing required var", () => {
    delete process.env.JWT_SECRET;
    delete process.env.APP_URL;
    expect(() => validateEnv()).toThrow(/(JWT_SECRET[\s\S]*APP_URL|APP_URL[\s\S]*JWT_SECRET)/);
  });

  it("rejects a JWT_SECRET that's too short", () => {
    process.env.JWT_SECRET = "short";
    expect(() => validateEnv()).toThrow(/JWT_SECRET/);
  });

  it("rejects an APP_URL that isn't a valid URL", () => {
    process.env.APP_URL = "not-a-url";
    expect(() => validateEnv()).toThrow(/APP_URL/);
  });

  it("allows optional providers to be unset outside production", () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    delete process.env.TEXTBEE_API_KEY;
    expect(() => validateEnv()).not.toThrow();
  });

  it("requires both shared Redis credentials in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => validateEnv()).toThrow(/UPSTASH_REDIS_REST_URL/);
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM = "no-reply@example.test";
    expect(() => validateEnv()).not.toThrow();
  });

  it("requires a Resend key and verified sender in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => validateEnv()).toThrow(/RESEND_API_KEY/);
    process.env.RESEND_API_KEY = "re_test";
    expect(() => validateEnv()).toThrow(/RESEND_FROM/);
    process.env.RESEND_FROM = "GymOS <no-reply@example.test>";
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    expect(() => validateEnv()).not.toThrow();
  });

  it("requires TextBee when production SMS verification is enabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM = "no-reply@example.test";
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    process.env.SMS_VERIFICATION_ENABLED = "true";
    expect(() => validateEnv()).toThrow(/TEXTBEE_API_KEY/);
    process.env.TEXTBEE_API_KEY = "txb_test";
    expect(() => validateEnv()).not.toThrow();
  });
});
