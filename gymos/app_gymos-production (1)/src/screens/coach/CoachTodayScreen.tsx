import { useCallback, useMemo, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CoachStatsCard from "@/screens/coach/CoachStatsCard";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useAuth } from "@/auth/AuthContext";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";
import { useAsync } from "@/hooks/useAsync";
import { useReloadOnFocus } from "@/hooks/useReloadOnFocus";
import { useNow } from "@/hooks/useNow";
import { fetchCoachSessions, fetchCoachStats } from "@/api/coach";
import type { CoachSession } from "@/api/types";
import type { CoachTabParamList } from "@/navigation/types";
import ScreenContainer from "@/components/ScreenContainer";
import Card from "@/components/Card";
import Button from "@/components/Button";
import { EmptyState, ErrorState } from "@/components/StateViews";
import { ListSkeleton } from "@/components/Skeleton";
import { dayOfWeekOf, formatDayLong, mondayOf, sessionStart, startOfDay } from "@/lib/dates";
import CoachSessionCard from "@/screens/coach/CoachSessionCard";
import { useOpenRoster } from "@/screens/coach/useOpenRoster";

export default function CoachTodayScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const now = useNow();
  const navigation = useNavigation<BottomTabNavigationProp<CoachTabParamList, "Today">>();
  const openRoster = useOpenRoster();
  const insets = useSafeAreaInsets();
  const stats = useAsync(fetchCoachStats, []);
  const reloadStats = stats.reload;

  const { data, loading, refreshing, error, reload } = useAsync(fetchCoachSessions, []);
  const reloadAll = useCallback(() => {
    reload();
    reloadStats();
  }, [reload, reloadStats]);
  useReloadOnFocus(reloadAll);

  // Sessions only carry a weekday, and this endpoint returns the club's ACTIVE
  // plan without saying which week that is — so "today" means "the sessions
  // scheduled on today's weekday", assuming the active plan is the current week.
  const todayDay = dayOfWeekOf(now);
  const monday = mondayOf(startOfDay(now));
  const today = useMemo(
    () => (data?.sessions ?? []).filter((s) => s.day === todayDay).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [data, todayDay]
  );

  const badgeFor = (s: CoachSession) => {
    const start = sessionStart(monday, s.day, s.startTime);
    const end = sessionStart(monday, s.day, s.endTime);
    if (now >= end) return { label: "Terminée", tone: "neutral" as const };
    if (now >= start) return { label: "En cours", tone: "success" as const };
    return { label: "À venir", tone: "primary" as const };
  };

  let body: ReactNode;
  if (loading || (!data && !error)) {
    body = <ListSkeleton count={3} />;
  } else if (!data) {
    body = <ErrorState title="Séances indisponibles" message={error ?? undefined} actionLabel="Réessayer" onAction={reload} />;
  } else if (today.length === 0) {
    body = (
      <EmptyState
        icon="cafe-outline"
        title="Aucune séance aujourd'hui"
        message={data.sessions.length === 0 ? "Aucune séance ne vous est attribuée dans le planning actif." : "Rien de prévu pour vous aujourd'hui."}
        actionLabel="Voir mes séances"
        onAction={() => navigation.navigate("CoachSessions")}
      />
    );
  } else {
    body = (
      <View style={{ gap: spacing.md }}>
        {today.map((s) => (
          <CoachSessionCard key={s.id} session={s} badge={badgeFor(s)} onPress={() => openRoster(s.id)} />
        ))}
      </View>
    );
  }

  return (
    <ScreenContainer
      refreshing={refreshing || stats.refreshing}
      onRefresh={reloadAll}
      contentStyle={{ gap: spacing.lg, paddingTop: insets.top + spacing.lg }}
    >
      <View>
        <Text style={[typography.title, { color: colors.text }]}>Bonjour, {user?.name.split(" ")[0]}</Text>
        <Text style={[typography.body, { color: colors.textMuted, marginTop: 2 }]}>{formatDayLong(now)}</Text>
      </View>
      {error && data ? (
        <Card style={{ borderColor: colors.danger, gap: spacing.sm }}>
          <Text style={[typography.body, { color: colors.danger }]}>{error}</Text>
          <Button label="Réessayer" variant="secondary" onPress={reload} />
        </Card>
      ) : null}
      {body}
      <CoachStatsCard stats={stats} />
    </ScreenContainer>
  );
}
