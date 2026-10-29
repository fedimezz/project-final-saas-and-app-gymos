import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatSpecialties,
  parseSpecialties,
  validateBio,
  validateCoachName,
  validateCoachPhone,
  validateSpecialties,
} from "../src/lib/coachProfile";

test("parseSpecialties splits on commas/newlines/semicolons, trims and de-dups case-insensitively", () => {
  assert.deepEqual(parseSpecialties("Boxe, Cardio ,boxe\nYoga;  "), ["Boxe", "Cardio", "Yoga"]);
  assert.deepEqual(parseSpecialties("  ,, "), []);
  assert.equal(formatSpecialties(["A", "B"]), "A, B");
});

test("validateSpecialties enforces the server limits (8 items, 40 chars)", () => {
  assert.equal(validateSpecialties("a,b,c"), null);
  assert.ok(validateSpecialties("1,2,3,4,5,6,7,8,9"));
  assert.ok(validateSpecialties("x".repeat(41)));
  assert.equal(validateSpecialties("x".repeat(40)), null);
});

test("validateBio caps at 1000 characters", () => {
  assert.equal(validateBio("a".repeat(1000)), null);
  assert.ok(validateBio("a".repeat(1001)));
});

test("name and phone rules match the server (empty phone allowed)", () => {
  assert.ok(validateCoachName("A"));
  assert.equal(validateCoachName("Sami"), null);
  assert.ok(validateCoachName("x".repeat(101)));
  assert.equal(validateCoachPhone(""), null);
  assert.equal(validateCoachPhone("+216 20 123 456"), null);
  assert.ok(validateCoachPhone("abc"));
});
