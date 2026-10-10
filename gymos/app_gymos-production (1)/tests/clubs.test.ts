import "./setup";
import test from "node:test";
import assert from "node:assert/strict";
import { MAX_SAVED_CLUBS, sortClubs, upsertClub } from "../src/lib/clubOrder";
import type { ClubRef } from "../src/api/types";

const club = (slug: string, name = slug): ClubRef => ({ slug, name, logoUrl: null, apiBaseUrl: `https://${slug}.example.com` });

test("the authenticated user's club is ranked first, then the last used, then A→Z", () => {
  const list = [club("zen", "Zen"), club("alpha", "Alpha"), club("mid", "Mid"), club("home", "Home Gym")];
  assert.deepEqual(sortClubs(list, "home", "mid").map((c) => c.slug), ["home", "mid", "alpha", "zen"]);
  assert.deepEqual(sortClubs(list, null, null).map((c) => c.slug), ["alpha", "home", "mid", "zen"]);
});

test("upsert never duplicates a slug and refreshes its data in place", () => {
  const a = club("a");
  const list = upsertClub([a, club("b")], { ...a, name: "A renamed" });
  assert.equal(list.length, 2);
  assert.equal(list[0].name, "A renamed");
});

test("saved list is capped", () => {
  let list: ClubRef[] = [];
  for (let i = 0; i < MAX_SAVED_CLUBS + 5; i++) list = upsertClub(list, club(`c${i}`));
  assert.equal(list.length, MAX_SAVED_CLUBS);
});
