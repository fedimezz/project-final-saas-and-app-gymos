import { useMemo, useState, type ReactNode } from "react";
import { useReloadOnFocus } from "@/hooks/useReloadOnFocus";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, spacing, radius, typography } from "@/theme/ThemeContext";
import { useAsync } from "@/hooks/useAsync";
import { fetchSchedule } from "@/api/schedule";
import type { DayOfWeek } from "@/api/types";
import ScreenContainer from "@/components/ScreenContainer";
import NoticeBanner from "@/components/NoticeBanner";
import Card from "@/components/Card";
import Button from "@/components/Button";
import { EmptyState, ErrorState } from "@/components/StateViews";
import { ListSkeleton } from "@/components/Skeleton";
import {
  DAYS,
  DAY_LABELS_FULL,
  DAY_LABELS_SHORT,
  addDays,
  dateOfDay,
  dayOfWeekOf,
  formatDayLong,
  formatWeekRange,
  isSameDay,
  mondayOf,
  startOfDay,
  toISODate,
} from "@/lib/dates";
import SessionCard from "@/screens/member/SessionCard";
import SessionSheet from "@/screens/member/SessionSheet";
import { useBookingFlow } from "@/screens/member/useBookingFlow";

/**
 * Weekly club planning. Members tap a session to book/cancel; with `readOnly`
 * (coaches) the same planning is shown without any booking action.
 */
export default function ScheduleScreen({ readOnly = false }: { readOnly?: boolean }) {
  const { colors } = useTheme();

  // ── Which week / day ────────────────────────────────────────────────────
  const today = startOfDay(new Date());
  const todayDay = dayOfWeekOf(today);
  const currentMonday = mondayOf(today);

  const [weekOffset, setWeekOffset] = useState(0); // 0 = this week
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(todayDay);
  const weekMonday = addDays(currentMonday, weekOffset * 7);
  const weekKey = toISODate(weekMonday);

  const goToWeek = (offset: number) => {
    setWeekOffset(offset);
    setSelectedDay(offset === 0 ? todayDay : "MONDAY");
  };

  // ── Data ────────────────────────────────────────────────────────────────
  // Always pass weekStart: omitting it makes the backend return whichever plan
  // staff marked "active", which may not be the calendar week we're showing.
  // `weekKey` rides along so a response can never be shown under another week's header.
  const { data, refreshing, error, reload } = useAsync(
    async () => ({ weekKey, ...(await fetchSchedule(weekKey)) }),
    [weekKey]
  );
  const schedule = data && data.weekKey === weekKey ? data : null;
  useReloadOnFocus(reload); // a booking made on Home / Réservations shows up here

  const flow = useBookingFlow({ sessions: schedule?.sessions, weekMonday, reload });
  const sessions = flow.sessions;
  const daySessions = useMemo(() => sessions.filter((s) => s.day === selectedDay), [sessions, selectedDay]);
  const sessionCountByDay = useMemo(() => {
    const counts: Partial<Record<DayOfWeek, number>> = {};
    for (const s of sessions) counts[s.day] = (counts[s.day] ?? 0) + 1;
    return counts;
  }, [sessions]);

  // ── Body: loading / error / empty / success ─────────────────────────────
  const nextDayWithSessions = DAYS.slice(DAYS.indexOf(selectedDay) + 1).find((d) => (sessionCountByDay[d] ?? 0) > 0);

  let body: ReactNode;
  if (!schedule && !error) {
    body = <ListSkeleton count={3} />;
  } else if (!schedule) {
    body = (
      <ErrorState
        title="Planning indisponible"
        message={error ?? undefined}
        actionLabel="Réessayer"
        onAction={reload}
      />
    );
  } else if (!schedule.weeklyPlan) {
    body = (
      <EmptyState
        title="Aucun planning"
        message="Le planning de cette semaine n'a pas encore été publié."
        actionLabel={weekOffset === 0 ? "Actualiser" : "Revenir à cette semaine"}
        onAction={weekOffset === 0 ? reload : () => goToWeek(0)}
      />
    );
  } else if (daySessions.length === 0) {
    body = (
      <EmptyState
        title="Aucune session ce jour-là"
        message={`Rien de prévu ${DAY_LABELS_FULL[selectedDay].toLowerCase()}.`}
        actionLabel={nextDayWithSessions ? `Voir ${DAY_LABELS_FULL[nextDayWithSessions].toLowerCase()}` : "Semaine suivante"}
        onAction={nextDayWithSessions ? () => setSelectedDay(nextDayWithSessions) : () => goToWeek(weekOffset + 1)}
      />
    );
  } else {
    body = (
      <View style={{ gap: spacing.md }}>
        {daySessions.map((s) => (
          <SessionCard key={s.id} session={s} onPress={readOnly ? undefined : () => flow.openSheet(s.id)} />
        ))}
      </View>
    );
  }

  const weekCaption = weekOffset === 0 ? "Cette semaine" : weekOffset === 1 ? "Semaine prochaine" : weekOffset === -1 ? "Semaine dernière" : null;

  return (
    <>
      <ScreenContainer refreshing={refreshing} onRefresh={reload} contentStyle={{ gap: spacing.lg }}>
        {/* Week navigator — stays usable while loading or after an error */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable
            onPress={() => goToWeek(weekOffset - 1)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Semaine précédente"
            style={{ padding: spacing.sm }}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>

          <View style={{ alignItems: "center" }}>
            <Text style={[typography.h1, { color: colors.text }]}>{formatWeekRange(weekMonday)}</Text>
            {weekCaption ? (
              <Text style={[typography.caption, { color: colors.textMuted }]}>{weekCaption}</Text>
            ) : (
              <Pressable onPress={() => goToWeek(0)} hitSlop={8} accessibilityRole="button">
                <Text style={[typography.caption, { color: colors.primary, fontWeight: "700" }]}>Aujourd&apos;hui</Text>
              </Pressable>
            )}
          </View>

          <Pressable
            onPress={() => goToWeek(weekOffset + 1)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Semaine suivante"
            style={{ padding: spacing.sm }}
          >
            <Ionicons name="chevron-forward" size={24} color={colors.text} />
          </Pressable>
        </View>

        {/* Day strip — a dot marks days that have sessions */}
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          {DAYS.map((day) => {
            const date = dateOfDay(weekMonday, day);
            const selected = day === selectedDay;
            const isToday = isSameDay(date, today);
            const hasSessions = (sessionCountByDay[day] ?? 0) > 0;
            return (
              <Pressable
                key={day}
                onPress={() => setSelectedDay(day)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={formatDayLong(date)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: spacing.sm,
                  borderRadius: radius.md,
                  backgroundColor: selected ? colors.primary : colors.surface,
                  borderWidth: 1,
                  borderColor: selected || isToday ? colors.primary : colors.border,
                }}
              >
                <Text style={[typography.small, { color: selected ? colors.primaryText : colors.textMuted }]}>
                  {DAY_LABELS_SHORT[day]}
                </Text>
                <Text style={[typography.h2, { color: selected ? colors.primaryText : colors.text }]}>{date.getDate()}</Text>
                <View
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: radius.pill,
                    marginTop: 4,
                    backgroundColor: hasSessions ? (selected ? colors.primaryText : colors.primary) : "transparent",
                  }}
                />
              </Pressable>
            );
          })}
        </View>

        {/* A refresh that failed while we still have data to show */}
        {error && schedule ? (
          <Card style={{ borderColor: colors.danger, gap: spacing.sm }}>
            <Text style={[typography.body, { color: colors.danger }]}>{error}</Text>
            <Button label="Réessayer" variant="secondary" onPress={reload} />
          </Card>
        ) : null}

        <NoticeBanner message={flow.notice} />

        {body}
      </ScreenContainer>

      {readOnly ? null : <SessionSheet {...flow.sheetProps} />}
    </>
  );
}
