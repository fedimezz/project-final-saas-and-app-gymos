import "./setup";
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

type Fetch = typeof fetch;
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function load() {
  const client = await import("../src/api/client");
  client.setApiBaseUrl("https://club.example.com");
  client.setAuthToken(null);
  client.setUnauthorizedHandler(null);
  return client;
}

test("attaches the bearer token and mobile header, and never sends a clubId", async () => {
  const client = await load();
  client.setAuthToken("tok123");
  let seen: { url: string; init: RequestInit } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return json(200, { ok: true });
  }) as unknown as Fetch;
  await client.apiPost("/api/dashboard/schedule/book", { sessionId: "s1" });
  const h = seen!.init.headers as Record<string, string>;
  assert.equal(seen!.url, "https://club.example.com/api/dashboard/schedule/book");
  assert.equal(h.Authorization, "Bearer tok123");
  assert.equal(h["x-client-type"], "mobile-app");
  assert.equal(h["x-club-slug"], undefined, "dev-only header must never be sent in a release build");
  assert.ok(!String(seen!.init.body).includes("clubId"));
});

test("401 on an authenticated call fires the session-expired handler", async () => {
  const client = await load();
  client.setAuthToken("tok");
  let fired = 0;
  client.setUnauthorizedHandler(() => fired++);
  globalThis.fetch = (async () => json(401, { error: "Non autorisé" })) as unknown as Fetch;
  await assert.rejects(client.apiGet("/api/dashboard"), (e: unknown) => e instanceof client.ApiError && e.status === 401);
  assert.equal(fired, 1);
});

test("401 on a login attempt (no token) does NOT trigger the expiry handler", async () => {
  const client = await load();
  let fired = 0;
  client.setUnauthorizedHandler(() => fired++);
  globalThis.fetch = (async () => json(401, { error: "Email ou mot de passe incorrect." })) as unknown as Fetch;
  await assert.rejects(client.apiPost("/api/auth/login", {}), /incorrect/);
  assert.equal(fired, 0);
});

test("network failure becomes ApiError(status 0) with a French message", async () => {
  const client = await load();
  globalThis.fetch = (async () => {
    throw new TypeError("Network request failed");
  }) as unknown as Fetch;
  await assert.rejects(client.apiGet("/api/dashboard"), (e: unknown) => e instanceof client.ApiError && e.isNetwork && /connexion/i.test(e.message));
});

test("server error body message is surfaced; unparseable body falls back safely", async () => {
  const client = await load();
  globalThis.fetch = (async () => json(409, { error: "Cette session est complète" })) as unknown as Fetch;
  await assert.rejects(client.apiPost("/x"), /complète/);
  globalThis.fetch = (async () => new Response("<html>502</html>", { status: 502 })) as unknown as Fetch;
  await assert.rejects(client.apiGet("/x"), (e: unknown) => e instanceof client.ApiError && e.status === 502);
});

test("club search drops non-HTTPS hosts and malformed entries in a release build", async () => {
  const { searchClubs } = await import("../src/api/auth");
  globalThis.fetch = (async () =>
    json(200, {
      clubs: [
        { slug: "ok", name: "OK Gym", logoUrl: null, apiBaseUrl: "https://ok.example.com/" },
        { slug: "bad", name: "Plain HTTP", logoUrl: null, apiBaseUrl: "http://bad.example.com" },
        { slug: 42, name: "Malformed" },
        null,
      ],
    })) as unknown as Fetch;
  const { clubs } = await searchClubs("gym");
  assert.deepEqual(clubs.map((c) => c.slug), ["ok"]);
  assert.equal(clubs[0].apiBaseUrl, "https://ok.example.com"); // trailing slash normalised
});

test("config refuses plain-HTTP URLs when not in dev", async () => {
  const { isAllowedUrl, isSecureUrl, normalizeBaseUrl } = await import("../src/config/index");
  assert.equal(isAllowedUrl("https://a.com"), true);
  assert.equal(isAllowedUrl("http://a.com"), false);
  assert.equal(isSecureUrl("HTTPS://A.COM"), true);
  assert.equal(normalizeBaseUrl("https://a.com///"), "https://a.com");
});
