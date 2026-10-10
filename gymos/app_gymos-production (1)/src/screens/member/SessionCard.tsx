import { Pressable, Text, View } from "react-native";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import CapacityBar from "@/components/CapacityBar";
import { activityLabel } from "@/lib/labels";
import { plural } from "@/lib/dates";
import type { ScheduleSession } from "@/api/types";

/** One bookable session in the member's day list. Tapping opens SessionSheet. */
export default function SessionCard({ session, onPress }: { session: ScheduleSession; onPress?: () => void }) {
  const { colors } = useTheme();
  const booked = session.isBookedByUser;
  const full = session.isFull && !booked;
  const almostFull = !full && session.capacity > 0 && session.spotsLeft <= Math.ceil(session.capacity * 0.2);

  const status = booked ? ", réservé" : full ? ", complet" : "";

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={`${activityLabel(session.activity)}, ${session.startTime} à ${session.endTime}, ${session.coach}${status}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card style={booked ? { borderColor: colors.primary } : undefined}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {session.startTime} – {session.endTime}
            </Text>
            <Text style={[typography.h1, { color: colors.text, marginTop: 2 }]}>{activityLabel(session.activity)}</Text>
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
              {session.coach} · {session.location}
            </Text>
          </View>
          {booked ? (
            <Badge label="Réservé" tone="success" />
          ) : full ? (
            <Badge label="Complet" tone="danger" />
          ) : (
            <Badge label={plural(session.spotsLeft, "place")} tone={almostFull ? "warning" : "neutral"} />
          )}
        </View>

        <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
          <CapacityBar current={session.currentBookings} capacity={session.capacity} />
          <Text style={[typography.small, { color: colors.textMuted }]}>
            {session.currentBookings}/{session.capacity} inscrits
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}
