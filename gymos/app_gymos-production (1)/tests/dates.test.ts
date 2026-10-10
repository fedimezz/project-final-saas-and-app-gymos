import "./setup";
import test from "node:test";
import assert from "node:assert/strict";
import { mondayOf, parseDateOnly, sessionStart, toISODate } from "../src/lib/dates";

test("parseDateOnly keeps the calendar day (no timezone shift) for date and ISO-datetime input", () => {
  for (const input of ["2026-09-28", "2026-09-28T00:00:00.000Z", "2026-09-28T23:59:59.000Z"]) {
    const d = parseDateOnly(input);
    assert.equal(toISODate(d), "2026-09-28");
  }
});

test("a booking's start instant = plan Monday + weekday + time", () => {
  const monday = mondayOf(parseDateOnly("2026-09-28T00:00:00.000Z")); // Monday 28 Sept 2026
  const start = sessionStart(monday, "WEDNESDAY", "18:30");
  assert.equal(toISODate(start), "2026-09-30");
  assert.equal(start.getHours(), 18);
  assert.equal(start.getMinutes(), 30);
});
