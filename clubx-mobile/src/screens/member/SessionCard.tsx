import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, spacing, radius, typography } from "@/theme/ThemeContext";
import Card from "@/components/Card";
import Badge, { type BadgeTone } from "@/components/Badge";
import CapacityBar from "@/components/CapacityBar";
import { activityLabel } from "@/lib/labels";
import { activityIcon } from "@/lib/activityIcons";
import { plural } from "@/lib/dates";
import type { ScheduleSession } from "@/api/types";

/** Where a session sits relative to "now" — drives the dimming and the live highlight. */
export type SessionPhase = "past" | "live" | "upcoming";

const RAIL_WIDTH = 52;

/**
 * One session in the day timeline: time rail on the left, card on the right.
 * Tapping opens SessionSheet (members only — coaches get a read-only card).
 */
export default function SessionCard({
  session,
  onPress,
  phase = "upcoming",
}: {
  session: ScheduleSession;
  onPress?: () => void;
  phase?: SessionPhase;
}) {
  const { colors } = useTheme();
  const booked = session.isBookedByUser;
  const full = session.isFull && !booked;
  const almostFull = !full && session.capacity > 0 && session.spotsLeft <= Math.ceil(session.capacity * 0.2);
  const past = phase === "past";
  const live = phase === "live";

  // The accent says what matters most: yours (primary), unavailable (danger), or just a session.
  const accent = booked || live ? colors.primary : full ? colors.danger : colors.secondary;

  let badge: { label: string; tone: BadgeTone };
  if (past) badge = { label: "Terminé", tone: "neutral" };
  else if (live) badge = { label: "En cours", tone: "primary" };
  else if (booked) badge = { label: "Réservé", tone: "success" };
  else if (full) badge = { label: "Complet", tone: "danger" };
  else badge = { label: plural(session.spotsLeft, "place"), tone: almostFull ? "warning" : "neutral" };

  const status = past ? ", terminé" : live ? ", en cours" : booked ? ", réservé" : full ? ", complet" : "";

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={`${activityLabel(session.activity)}, ${session.startTime} à ${session.endTime}, ${session.coach}${status}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        gap: spacing.md,
        opacity: past ? 0.6 : pressed ? 0.85 : 1,
      })}
    >
      {/* Time rail */}
      <View style={{ width: RAIL_WIDTH, alignItems: "center", paddingTop: spacing.xs }}>
        <Text style={[typography.h2, { color: live ? colors.primary : colors.text }]}>{session.startTime}</Text>
        <Text style={[typography.small, { color: colors.textMuted, marginTop: 2 }]}>{session.endTime}</Text>
        <View
          style={{
            flex: 1,
            width: 2,
            marginTop: spacing.sm,
            borderRadius: radius.pill,
            backgroundColor: live || booked ? colors.primary : colors.border,
          }}
        />
      </View>

      {/* Card */}
      <Card
        style={{
          flex: 1,
          padding: spacing.md,
          gap: spacing.md,
          borderColor: booked || live ? colors.primary : colors.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: radius.pill,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: accent + "1f",
            }}
          >
            <Ionicons name={activityIcon(session.activity)} size={22} color={accent} />
          </View>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <Text style={[typography.h1, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>
                {activityLabel(session.activity)}
              </Text>
              {booked && !past ? <Ionicons name="checkmark-circle" size={18} color={colors.success} /> : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: 2 }}>
              <Ionicons name="person-outline" size={13} color={colors.textMuted} />
              <Text style={[typography.caption, { color: colors.textMuted, flexShrink: 1 }]} numberOfLines={1}>
                {session.coach}
              </Text>
            </View>
          </View>

          <Badge label={badge.label} tone={badge.tone} />
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
          <Ionicons name="location-outline" size={14} color={colors.textMuted} />
          <Text style={[typography.caption, { color: colors.textMuted, flex: 1 }]} numberOfLines={1}>
            {session.location}
          </Text>
        </View>

        <View style={{ gap: spacing.xs }}>
          <CapacityBar current={session.currentBookings} capacity={session.capacity} />
          <Text style={[typography.small, { color: colors.textMuted }]}>
            {session.currentBookings}/{session.capacity} inscrits
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}
