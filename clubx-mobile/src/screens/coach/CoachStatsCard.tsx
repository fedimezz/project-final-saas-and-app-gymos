import { Text, View } from "react-native";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";
import type { AsyncState } from "@/hooks/useAsync";
import type { CoachStats } from "@/api/types";
import Card from "@/components/Card";
import { EmptyState, ErrorState } from "@/components/StateViews";
import { ListSkeleton } from "@/components/Skeleton";

function Tile({ value, label }: { value: string; label: string }) {
  const { colors } = useTheme();
  return (
    <Card style={{ flex: 1, alignItems: "center", gap: 2 }}>
      <Text style={[typography.title, { color: colors.text }]}>{value}</Text>
      <Text style={[typography.caption, { color: colors.textMuted, textAlign: "center" }]}>{label}</Text>
    </Card>
  );
}

/**
 * The coach's numbers from GET /api/dashboard/coach/stats. They cover ALL of
 * this coach's sessions across every weekly plan (not just the active one),
 * and the fill rate is bookings ÷ total capacity — as the backend defines them.
 */
export default function CoachStatsCard({ stats }: { stats: AsyncState<CoachStats> }) {
  const { colors } = useTheme();
  const { data, loading, error, reload } = stats;

  if (loading || (!data && !error)) return <ListSkeleton count={1} />;
  if (!data) return <ErrorState title="Statistiques indisponibles" message={error ?? undefined} actionLabel="Réessayer" onAction={reload} />;
  if (data.totalSessions === 0) {
    return (
      <EmptyState
        icon="stats-chart-outline"
        title="Pas encore de statistiques"
        message="Elles apparaîtront dès que des séances vous seront attribuées."
        actionLabel="Actualiser"
        onAction={reload}
      />
    );
  }
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={[typography.h1, { color: colors.text }]}>Mes statistiques</Text>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <Tile value={String(data.totalSessions)} label="Séances" />
        <Tile value={String(data.totalBookings)} label="Réservations" />
      </View>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <Tile value={String(data.totalAttendances)} label="Présences" />
        <Tile value={`${data.fillRate} %`} label="Taux de remplissage" />
      </View>
    </View>
  );
}
