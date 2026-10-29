import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidExpoPushToken, pushTabFor, resolveProjectId } from "../src/notifications/pushCore";

test("isValidExpoPushToken accepts Expo tokens only", () => {
  assert.equal(isValidExpoPushToken("ExponentPushToken[abcdefghijklmnopqrstuv]"), true);
  assert.equal(isValidExpoPushToken("ExpoPushToken[abcdefghij]"), true);
  for (const bad of [null, undefined, 12, "", "abc", "ExponentPushToken[]", "ExponentPushToken[a b c d e f g h]", "fcm:123", `ExponentPushToken[${"a".repeat(200)}]`]) {
    assert.equal(isValidExpoPushToken(bad), false, String(bad));
  }
});

test("resolveProjectId prefers extra.eas.projectId, falls back to easConfig, else null", () => {
  assert.equal(resolveProjectId({ expoConfig: { extra: { eas: { projectId: " abc-123 " } } }, easConfig: { projectId: "zzz" } }), "abc-123");
  assert.equal(resolveProjectId({ expoConfig: null, easConfig: { projectId: "from-eas" } }), "from-eas");
  assert.equal(resolveProjectId({ expoConfig: { extra: {} }, easConfig: null }), null);
  assert.equal(resolveProjectId({ expoConfig: { extra: { eas: { projectId: "" } } } }), null);
  assert.equal(resolveProjectId({ expoConfig: { extra: { eas: { projectId: 42 } } } }), null);
});

test("pushTabFor routes member notifications to the matching tab", () => {
  assert.deepEqual(pushTabFor("MEMBER", { type: "SESSION_REMINDER" }), { navigator: "MemberTabs", screen: "Bookings" });
  assert.deepEqual(pushTabFor("MEMBER", { type: "BOOKING", kind: "booking_confirmed" }), { navigator: "MemberTabs", screen: "Bookings" });
  assert.deepEqual(pushTabFor("MEMBER", { type: "WARNING", kind: "schedule_change" }), { navigator: "MemberTabs", screen: "Schedule" });
  assert.deepEqual(pushTabFor("MEMBER", { type: "INFO", kind: "announcement" }), { navigator: "MemberTabs", screen: "Notifications" });
});

test("pushTabFor routes coach notifications to coach tabs", () => {
  assert.deepEqual(pushTabFor("COACH", { type: "BOOKING", kind: "coach_new_booking" }), { navigator: "CoachTabs", screen: "CoachSessions" });
  assert.deepEqual(pushTabFor("COACH", { kind: "coach_session_reminder", type: "SESSION_REMINDER" }), { navigator: "CoachTabs", screen: "CoachSessions" });
  assert.deepEqual(pushTabFor("COACH", { kind: "schedule_change" }), { navigator: "CoachTabs", screen: "CoachPlanning" });
  assert.deepEqual(pushTabFor("COACH", { type: "INFO" }), { navigator: "CoachTabs", screen: "CoachNotifications" });
});

test("pushTabFor never throws on malformed payloads", () => {
  for (const data of [undefined, null, "x", 5, [], { kind: 7, type: {} }]) {
    assert.deepEqual(pushTabFor("MEMBER", data), { navigator: "MemberTabs", screen: "Notifications" });
    assert.deepEqual(pushTabFor("COACH", data), { navigator: "CoachTabs", screen: "CoachNotifications" });
  }
});
