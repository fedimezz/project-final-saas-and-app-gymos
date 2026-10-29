import "./setup";
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function load() {
  const client = await import("../src/api/client");
  const upload = await import("../src/api/upload");
  client.setApiBaseUrl("https://club.example.com");
  client.setAuthToken("tok123");
  client.setUnauthorizedHandler(null);
  return { client, upload };
}

test("normalizeMime repairs the picker's odd/missing mime types", async () => {
  const { upload } = await load();
  assert.equal(upload.normalizeMime("image/jpg"), "image/jpeg");
  assert.equal(upload.normalizeMime("IMAGE/PNG"), "image/png");
  assert.equal(upload.normalizeMime(undefined, "file:///x/photo.WEBP?cache=1"), "image/webp");
  assert.equal(upload.normalizeMime(null, "file:///x/noextension"), "image/jpeg");
});

test("validatePickedImage refuses unsupported formats and oversized originals before any network call", async () => {
  const { upload } = await load();
  assert.equal(upload.validatePickedImage({ uri: "file:///a.jpg", mimeType: "image/jpeg", fileSize: 1000 }), null);
  assert.equal(upload.validatePickedImage({ uri: "file:///a.heic", mimeType: "image/heic" }), null); // converted to JPEG later
  assert.match(upload.validatePickedImage({ uri: "file:///a.gif", mimeType: "image/gif" }) ?? "", /Format non pris en charge/);
  assert.match(upload.validatePickedImage({ uri: "file:///a.jpg", mimeType: "image/jpeg", fileSize: 31 * 1024 * 1024 }) ?? "", /trop lourde/);
  assert.match(upload.validatePickedImage({ uri: "" }) ?? "", /Aucune image/);
});

test("uploadImage sends multipart WITHOUT a Content-Type (fetch must add the boundary), with the token, to /api/upload, and no clubId", async () => {
  const { upload } = await load();
  let seen: { url: string; init: RequestInit } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return json(200, { success: true, url: "https://res.cloudinary.com/demo/image/upload/avatar.jpg" });
  }) as unknown as typeof fetch;

  const url = await upload.uploadImage("file:///cache/avatar.jpg", "image/jpeg");

  assert.equal(url, "https://res.cloudinary.com/demo/image/upload/avatar.jpg");
  assert.equal(seen!.url, "https://club.example.com/api/upload");
  assert.equal(seen!.init.method, "POST");
  const headers = seen!.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer tok123");
  assert.equal(headers["x-client-type"], "mobile-app");
  assert.ok(!Object.keys(headers).some((h) => h.toLowerCase() === "content-type"), "a hand-written Content-Type breaks the multipart boundary on Android");
  assert.ok(seen!.init.body instanceof FormData);
  assert.ok(![...(seen!.init.body as FormData).keys()].includes("clubId"));
});

test("uploadImage refuses a response without an https URL", async () => {
  const { upload } = await load();
  globalThis.fetch = (async () => json(200, { url: "http://insecure.example.com/a.jpg" })) as unknown as typeof fetch;
  await assert.rejects(() => upload.uploadImage("file:///a.jpg", "image/jpeg"), /Réponse inattendue/);
});

test("uploadImage refuses formats the backend would reject, without calling the network", async () => {
  const { upload } = await load();
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return json(200, {});
  }) as unknown as typeof fetch;
  await assert.rejects(() => upload.uploadImage("file:///a.gif", "image/gif"), /Format non pris en charge/);
  assert.equal(called, false);
});

test("non-JSON failures from the host become readable messages (413 too large, 502, 429)", async () => {
  const { upload, client } = await load();
  for (const [status, expected] of [
    [413, /trop volumineux/],
    [429, /Trop de tentatives/],
    [502, /Le serveur rencontre un problème/],
  ] as const) {
    globalThis.fetch = (async () => new Response("<html>nope</html>", { status, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    await assert.rejects(
      () => upload.uploadImage("file:///a.jpg", "image/jpeg"),
      (e: unknown) => e instanceof client.ApiError && e.status === status && expected.test(e.message)
    );
  }
});

test("the server's own JSON error message is shown as-is", async () => {
  const { upload } = await load();
  globalThis.fetch = (async () => json(400, { error: "Image invalide" })) as unknown as typeof fetch;
  await assert.rejects(() => upload.uploadImage("file:///a.jpg", "image/jpeg"), /Image invalide/);
});

test("a 401 during upload signs the member out (expired session)", async () => {
  const { upload, client } = await load();
  let signedOut = false;
  client.setUnauthorizedHandler(() => {
    signedOut = true;
  });
  globalThis.fetch = (async () => json(401, { error: "Non authentifié" })) as unknown as typeof fetch;
  await assert.rejects(() => upload.uploadImage("file:///a.jpg", "image/jpeg"));
  assert.equal(signedOut, true);
});

test("a network failure is reported as a connection problem, not a crash", async () => {
  const { upload, client } = await load();
  globalThis.fetch = (async () => {
    throw new TypeError("Network request failed");
  }) as unknown as typeof fetch;
  await assert.rejects(
    () => upload.uploadImage("file:///a.jpg", "image/jpeg"),
    (e: unknown) => e instanceof client.ApiError && e.status === 0
  );
});
