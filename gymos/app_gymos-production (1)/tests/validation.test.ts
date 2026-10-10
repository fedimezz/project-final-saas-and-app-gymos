import "./setup";
import test from "node:test";
import assert from "node:assert/strict";
import {
  passwordChecks,
  validateCode,
  validateConfirm,
  validateEmail,
  validateNewPassword,
  validatePhone,
} from "../src/lib/validation";

test("password rule mirrors the backend passwordSchema (8+, lower, upper, digit)", () => {
  assert.equal(validateNewPassword("Abcdef12"), null);
  assert.match(validateNewPassword("Abc12")!, /8 caractères/);
  assert.match(validateNewPassword("abcdefg1")!, /majuscule/);
  assert.match(validateNewPassword("ABCDEFG1")!, /minuscule/);
  assert.match(validateNewPassword("Abcdefgh")!, /chiffre/);
  assert.deepEqual(passwordChecks("Abcdef12"), { length: true, lower: true, upper: true, digit: true });
});

test("email, phone, code, confirm", () => {
  assert.equal(validateEmail("a@b.co"), null);
  assert.ok(validateEmail("nope"));
  assert.ok(validateEmail("  "));
  assert.equal(validatePhone("+216 20 123 456"), null);
  assert.ok(validatePhone("12"));
  assert.equal(validateCode("123456"), null);
  assert.ok(validateCode("12a"));
  assert.equal(validateConfirm("x", "x"), null);
  assert.ok(validateConfirm("x", "y"));
});
