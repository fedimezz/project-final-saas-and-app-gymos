import { useMemo, type ReactNode } from "react";
import { useReloadOnFocus } from "@/hooks/useReloadOnFocus";
import { Text, View } from "react-native";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";
import { useAsync } from "@/hooks/useAsync";
import { fetchCoachSessions } from "@/api/coach";
import type { CoachSession, DayOfWeek } from "@/api/types";
import ScreenContainer from "@/components/ScreenContainer";
import Card from "@/components/Card";
import Button from "@/components/Button";
import { EmptyState, ErrorState } from "@/components/StateViews";
import { ListSkeleton } from "@/components/Skeleton";
import { DAYS, DAY_LABELS_FULL, dayOfWeekOf } from "@/lib/dates";
import CoachSessionCard from "@/screens/coach/CoachSessionCard";
import { useOpenRoster } from "@/screens/coach/useOpenRoster";

/** The coach's whole week in the club's active plan, grouped by weekday. */
export default function CoachScheduleScreen() {
  const { colors } = useTheme();
  const openRoster = useOpenRoster();
  const { data, loading, refreshing, error, reload } = useAsync(fetchCoachSessions, []);
  useReloadOnFocus(reload);

  const byDay = useMemo(() => {
    const groups = new Map<DayOfWeek, CoachSession[]>();
    for (const s of data?.sessions ?? []) groups.set(s.day, [...(groups.get(s.day) ?? []), s]);
    for (const list of groups.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return groups;
  }, [data]);

  const todayDay = dayOfWeekOf(new Date());

  let body: ReactNode;
  if (loading || (!data && !error)) {
    body = <ListSkeleton count={4} />;
  } else if (!data) {
    body = <ErrorState title="Planning indisponible" message={error ?? undefined} actionLabel="Réessayer" onAction={reload} />;
  } else if (data.sessions.length === 0) {
    body = (
      <EmptyState
        icon="calendar-outline"
        title="Aucune séance attribuée"
        message="Aucune séance ne vous est attribuée dans le planning actif du club."
        actionLabel="Actualiser"
        onAction={reload}
      />
    );
  } else {
    body = (
      <View style={{ gap: spacing.xl }}>
        {DAYS.filter((d) => byDay.has(d)).map((day) => (
          <View key={day} style={{ gap: spacing.md }}>
            <Text style={[typography.h1, { color: day === todayDay ? colors.primary : colors.text }]}>
              {DAY_LABELS_FULL[day]}
              {day === todayDay ? " · aujourd'hui" : ""}
            </Text>
            {byDay.get(day)!.map((s) => (
              <CoachSessionCard key={s.id} session={s} onPress={() => openRoster(s.id)} />
            ))}
          </View>
        ))}
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          Planning actif du club — la liste des inscrits est accessible en touchant une séance.
        </Text>
      </View>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={reload} contentStyle={{ gap: spacing.lg }}>
      {error && data ? (
        <Card style={{ borderColor: colors.danger, gap: spacing.sm }}>
          <Text style={[typography.body, { color: colors.danger }]}>{error}</Text>
          <Button label="Réessayer" variant="secondary" onPress={reload} />
        </Card>
      ) : null}
      {body}
    </ScreenContainer>
  );
}
