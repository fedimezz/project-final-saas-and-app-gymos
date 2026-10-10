import { Pressable, Text, View } from "react-native";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";
import Card from "@/components/Card";
import Badge, { type BadgeTone } from "@/components/Badge";
import CapacityBar from "@/components/CapacityBar";
import { activityLabel } from "@/lib/labels";
import type { CoachSession } from "@/api/types";

interface Props {
  session: CoachSession;
  badge?: { label: string; tone: BadgeTone };
  onPress: () => void;
}

/** A session the coach runs. Tapping opens its roster. */
export default function CoachSessionCard({ session, badge, onPress }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${activityLabel(session.activity)}, ${session.startTime} à ${session.endTime}, ${session.currentBookings} inscrits sur ${session.capacity}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {session.startTime} – {session.endTime}
            </Text>
            <Text style={[typography.h1, { color: colors.text, marginTop: 2 }]}>{activityLabel(session.activity)}</Text>
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
              {session.location}
            </Text>
          </View>
          {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
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
