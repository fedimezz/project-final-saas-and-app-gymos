import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, spacing, radius, typography } from "@/theme/ThemeContext";
import type { AsyncState } from "@/hooks/useAsync";
import type { MemberDashboard } from "@/api/types";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import { ListSkeleton } from "@/components/Skeleton";
import { DAYS, DAY_LABELS_SHORT, plural } from "@/lib/dates";

function Kpi({ value, label }: { value: number; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={[typography.title, { color: colors.text }]}>{value}</Text>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

/**
 * Member dashboard card (GET /api/dashboard): membership status, totals and the
 * last 7 days of attendance. Tapping it opens the full membership screen.
 */
export default function MembershipSummary({ state, onPress }: { state: AsyncState<MemberDashboard>; onPress: () => void }) {
  const { colors } = useTheme();
  const { data, error, reload } = state;

  if (!data && !error) return <ListSkeleton count={1} />;
  if (!data) {
    return (
      <Card style={{ borderColor: colors.danger, gap: spacing.sm }}>
        <Text style={[typography.body, { color: colors.danger }]}>{error}</Text>
        <Button label="Réessayer" variant="secondary" onPress={reload} />
      </Card>
    );
  }

  const { stats, weeklyActivity } = data;
  const active = stats.membershipStatus === "Active";
  const expiring = active && stats.daysUntilExpiry !== null && stats.daysUntilExpiry <= 7;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Mon abonnement" style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
      <Card style={{ gap: spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>Mon abonnement</Text>
            <Text style={[typography.h1, { color: colors.text }]} numberOfLines={1}>
              {stats.planName ?? "Aucun abonnement actif"}
            </Text>
          </View>
          <Badge label={expiring ? "Expire bientôt" : active ? "Actif" : "Inactif"} tone={expiring ? "warning" : active ? "success" : "danger"} />
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>

        {active && stats.daysUntilExpiry !== null ? (
          <Text style={[typography.body, { color: expiring ? colors.warning : colors.textMuted }]}>
            {stats.daysUntilExpiry === 0 ? "Expire aujourd'hui" : `${plural(stats.daysUntilExpiry, "jour")} restant${stats.daysUntilExpiry > 1 ? "s" : ""}`}
          </Text>
        ) : !active ? (
          <Text style={[typography.body, { color: colors.textMuted }]}>Choisissez une formule pour réserver vos séances.</Text>
        ) : null}

        <View style={{ flexDirection: "row" }}>
          <Kpi value={stats.totalBookings} label="Réservations" />
          <Kpi value={stats.completedAttendances} label="Présences" />
        </View>

        {/* Last 7 days of check-ins, Mon..Sun, relative to the busiest day */}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.xs, height: 64 }} accessibilityLabel="Activité des 7 derniers jours">
          {DAYS.map((d, i) => {
            const v = weeklyActivity[i] ?? 0;
            return (
              <View key={d} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                <View style={{ flex: 1, width: "100%", justifyContent: "flex-end" }}>
                  <View
                    style={{
                      height: `${Math.max(v, 6)}%`,
                      borderRadius: radius.sm,
                      backgroundColor: v > 0 ? colors.primary : colors.border,
                    }}
                  />
                </View>
                <Text style={[typography.small, { color: colors.textMuted }]}>{DAY_LABELS_SHORT[d].charAt(0)}</Text>
              </View>
            );
          })}
        </View>
      </Card>
    </Pressable>
  );
}
