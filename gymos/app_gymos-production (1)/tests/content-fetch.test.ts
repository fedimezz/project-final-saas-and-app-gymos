import "./setup";
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

type Fetch = typeof fetch;
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("member planning fetch requests the selected calendar week", async () => {
  const client = await import("../src/api/client");
  const { fetchSchedule } = await import("../src/api/schedule");
  client.setApiBaseUrl("https://club.example.com");
  client.setAuthToken("member-token");

  let requestedUrl = "";
  globalThis.fetch = (async (url: string) => {
    requestedUrl = url;
    return json({ weeklyPlan: null, sessions: [] });
  }) as unknown as Fetch;

  await fetchSchedule("2026-10-05");

  assert.equal(requestedUrl, "https://club.example.com/api/dashboard/schedule?weekStart=2026-10-05");
});

test("member news fetch requests the published club feed", async () => {
  const client = await import("../src/api/client");
  const { fetchPosts } = await import("../src/api/posts");
  client.setApiBaseUrl("https://club.example.com");
  client.setAuthToken("member-token");

  let requestedUrl = "";
  globalThis.fetch = (async (url: string) => {
    requestedUrl = url;
    return json([]);
  }) as unknown as Fetch;

  await fetchPosts();

  assert.equal(requestedUrl, "https://club.example.com/api/posts");
});

test("member can toggle a like on a news post", async () => {
  const client = await import("../src/api/client");
  const { togglePostLike } = await import("../src/api/posts");
  client.setApiBaseUrl("https://club.example.com");
  client.setAuthToken("member-token");

  let requestedUrl = "";
  let requestedMethod = "";
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    requestedUrl = url;
    requestedMethod = init.method ?? "";
    return json({ liked: true });
  }) as unknown as Fetch;

  assert.deepEqual(await togglePostLike("post/one"), { liked: true });
  assert.equal(requestedUrl, "https://club.example.com/api/posts/post%2Fone/like");
  assert.equal(requestedMethod, "POST");
});

test("member can submit a comment to a news post", async () => {
  const client = await import("../src/api/client");
  const { addPostComment } = await import("../src/api/posts");
  client.setApiBaseUrl("https://club.example.com");
  client.setAuthToken("member-token");

  let requestedUrl = "";
  let requestedBody: unknown;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    requestedUrl = url;
    requestedBody = JSON.parse(String(init.body));
    return json({
      id: "comment-1",
      content: "Bravo !",
      createdAt: "2026-10-05T12:00:00.000Z",
      user: { id: "member-1", name: "Membre", avatar: null },
    });
  }) as unknown as Fetch;

  const comment = await addPostComment("post-1", "Bravo !");
  assert.equal(requestedUrl, "https://club.example.com/api/posts/post-1/comments");
  assert.deepEqual(requestedBody, { content: "Bravo !" });
  assert.equal(comment.id, "comment-1");
  assert.equal(comment.user.name, "Membre");
});
