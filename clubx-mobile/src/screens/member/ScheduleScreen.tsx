import { useMemo, useState, type ReactNode } from "react";
import { useReloadOnFocus } from "@/hooks/useReloadOnFocus";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, spacing, radius, typography } from "@/theme/ThemeContext";
import { useAsync } from "@/hooks/useAsync";
import { useNow } from "@/hooks/useNow";
import { fetchSchedule } from "@/api/schedule";
import type { ActivityType, DayOfWeek, ScheduleSession } from "@/api/types";
import ScreenContainer from "@/components/ScreenContainer";
import NoticeBanner from "@/components/NoticeBanner";
import Card from "@/components/Card";
import Button from "@/components/Button";
import FadeIn from "@/components/FadeIn";
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
  plural,
  sessionStart,
  startOfDay,
  toISODate,
} from "@/lib/dates";
import { activityLabel } from "@/lib/labels";
import { activityIcon } from "@/lib/activityIcons";
import SessionCard, { type SessionPhase } from "@/screens/member/SessionCard";
import SessionSheet from "@/screens/member/SessionSheet";
import { useBookingFlow } from "@/screens/member/useBookingFlow";

type ActivityFilter = ActivityType | "ALL";

/**
 * Weekly club planning. Members tap a session to book/cancel; with `readOnly`
 * (coaches) the same planning is shown without any booking action.
 */
export default function ScheduleScreen({ readOnly = false }: { readOnly?: boolean }) {
  const { colors } = useTheme();
  const now = useNow(60_000); // keeps "En cours" / "Terminé" honest while the screen stays open

  // ── Which week / day ────────────────────────────────────────────────────
  const today = startOfDay(now);
  const todayDay = dayOfWeekOf(today);
  const currentMonday = mondayOf(today);

  const [weekOffset, setWeekOffset] = useState(0); // 0 = this week
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(todayDay);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("ALL");
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

  // Activities present this week, in the order they first appear — drives the filter chips.
  const weekActivities = useMemo(() => {
    const seen: ActivityType[] = [];
    for (const s of sessions) if (!seen.includes(s.activity)) seen.push(s.activity);
    return seen;
  }, [sessions]);

  // A filter that no longer matches anything (changed week) must not leave an empty planning.
  const filter: ActivityFilter =
    activityFilter !== "ALL" && sessions.length > 0 && !weekActivities.includes(activityFilter) ? "ALL" : activityFilter;

  const visibleSessions = useMemo(
    () => (filter === "ALL" ? sessions : sessions.filter((s) => s.activity === filter)),
    [sessions, filter]
  );
  const daySessions = useMemo(() => visibleSessions.filter((s) => s.day === selectedDay), [visibleSessions, selectedDay]);
  const sessionCountByDay = useMemo(() => {
    const counts: Partial<Record<DayOfWeek, number>> = {};
    for (const s of visibleSessions) counts[s.day] = (counts[s.day] ?? 0) + 1;
    return counts;
  }, [visibleSessions]);

  const bookedThisWeek = useMemo(() => sessions.filter((s) => s.isBookedByUser).length, [sessions]);
  const bookedToday = daySessions.filter((s) => s.isBookedByUser).length;

  const phaseOf = (s: ScheduleSession): SessionPhase => {
    const start = sessionStart(weekMonday, s.day, s.startTime);
    const end = sessionStart(weekMonday, s.day, s.endTime);
    return now >= end ? "past" : now >= start ? "live" : "upcoming";
  };

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
        message={
          filter === "ALL"
            ? `Rien de prévu ${DAY_LABELS_FULL[selectedDay].toLowerCase()}.`
            : `Pas de ${activityLabel(filter).toLowerCase()} ${DAY_LABELS_FULL[selectedDay].toLowerCase()}.`
        }
        actionLabel={nextDayWithSessions ? `Voir ${DAY_LABELS_FULL[nextDayWithSessions].toLowerCase()}` : "Semaine suivante"}
        onAction={nextDayWithSessions ? () => setSelectedDay(nextDayWithSessions) : () => goToWeek(weekOffset + 1)}
      />
    );
  } else {
    body = (
      <View style={{ gap: spacing.md }}>
        {/* Day heading */}
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <Text style={[typography.h1, { color: colors.text }]}>{formatDayLong(dateOfDay(weekMonday, selectedDay))}</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {plural(daySessions.length, "séance")}
            {!readOnly && bookedToday > 0 ? ` · ${bookedToday} réservée${bookedToday > 1 ? "s" : ""}` : ""}
          </Text>
        </View>

        {daySessions.map((s, i) => (
          <FadeIn key={`${weekKey}-${selectedDay}-${s.id}`} delay={Math.min(i, 6) * 45}>
            <SessionCard session={s} phase={phaseOf(s)} onPress={readOnly ? undefined : () => flow.openSheet(s.id)} />
          </FadeIn>
        ))}
      </View>
    );
  }

  const weekCaption = weekOffset === 0 ? "Cette semaine" : weekOffset === 1 ? "Semaine prochaine" : weekOffset === -1 ? "Semaine dernière" : null;

  return (
    <>
      <ScreenContainer refreshing={refreshing} onRefresh={reload} contentStyle={{ gap: spacing.lg }}>
        {/* Week navigator — stays usable while loading or after an error */}
        <Card style={{ padding: spacing.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable
              onPress={() => goToWeek(weekOffset - 1)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Semaine précédente"
              style={{ padding: spacing.sm }}
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>

            <View style={{ alignItems: "center" }}>
              <Text style={[typography.h1, { color: colors.text }]}>{formatWeekRange(weekMonday)}</Text>
              {weekCaption ? (
                <Text style={[typography.caption, { color: colors.textMuted }]}>{weekCaption}</Text>
              ) : (
                <Pressable onPress={() => goToWeek(0)} hitSlop={8} accessibilityRole="button">
                  <Text style={[typography.caption, { color: colors.primary, fontWeight: "700" }]}>Revenir à aujourd&apos;hui</Text>
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
              <Ionicons name="chevron-forward" size={22} color={colors.text} />
            </Pressable>
          </View>
        </Card>

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
                  paddingVertical: spacing.md,
                  borderRadius: radius.lg,
                  backgroundColor: selected ? colors.primary : colors.surface,
                  borderWidth: 1,
                  borderColor: selected || isToday ? colors.primary : colors.border,
                }}
              >
                <Text style={[typography.small, { color: selected ? colors.primaryText : colors.textMuted }]}>
                  {DAY_LABELS_SHORT[day].toUpperCase()}
                </Text>
                <Text style={[typography.h1, { color: selected ? colors.primaryText : colors.text, marginTop: 2 }]}>{date.getDate()}</Text>
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: radius.pill,
                    marginTop: 6,
                    backgroundColor: hasSessions ? (selected ? colors.primaryText : colors.primary) : "transparent",
                  }}
                />
              </Pressable>
            );
          })}
        </View>

        {/* Week at a glance (members): how many sessions they're booked on */}
        {!readOnly && schedule?.weeklyPlan && bookedThisWeek > 0 ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              padding: spacing.md,
              borderRadius: radius.lg,
              backgroundColor: colors.primary + "1a",
            }}
          >
            <Ionicons name="calendar" size={18} color={colors.primary} />
            <Text style={[typography.caption, { color: colors.text, flex: 1 }]}>
              {bookedThisWeek === 1 ? "1 réservation" : `${bookedThisWeek} réservations`} cette semaine
            </Text>
          </View>
        ) : null}

        {/* Activity filter — only when the week offers more than one activity */}
        {weekActivities.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
            style={{ flexGrow: 0, marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg }}
          >
            {(["ALL", ...weekActivities] as ActivityFilter[]).map((a) => {
              const active = filter === a;
              const label = a === "ALL" ? "Tout" : activityLabel(a);
              return (
                <Pressable
                  key={a}
                  onPress={() => setActivityFilter(a)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={a === "ALL" ? "Toutes les activités" : `Filtrer : ${label}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.xs,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.pill,
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                  }}
                >
                  {a !== "ALL" ? (
                    <Ionicons name={activityIcon(a)} size={14} color={active ? colors.primaryText : colors.textMuted} />
                  ) : null}
                  <Text style={[typography.caption, { color: active ? colors.primaryText : colors.text, fontWeight: "600" }]}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

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
