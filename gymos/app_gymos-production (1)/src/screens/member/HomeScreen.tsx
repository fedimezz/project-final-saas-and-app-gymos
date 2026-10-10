import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthContext";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";
import { useAsync } from "@/hooks/useAsync";
import { useReloadOnFocus } from "@/hooks/useReloadOnFocus";
import { useNow } from "@/hooks/useNow";
import { fetchSchedule } from "@/api/schedule";
import { fetchPosts } from "@/api/posts";
import { fetchDashboard } from "@/api/dashboard";
import type { MemberTabParamList, RootStackParamList } from "@/navigation/types";
import ScreenContainer from "@/components/ScreenContainer";
import NoticeBanner from "@/components/NoticeBanner";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import { EmptyState, ErrorState } from "@/components/StateViews";
import { ListSkeleton } from "@/components/Skeleton";
import { activityLabel } from "@/lib/labels";
import { formatDayLong, mondayOf, sessionStart, startOfDay, toISODate, whenLabel } from "@/lib/dates";
import SessionSheet from "@/screens/member/SessionSheet";
import MembershipSummary from "@/screens/member/MembershipSummary";
import FadeIn from "@/components/FadeIn";
import PostCard from "@/screens/member/PostCard";
import { useBookingFlow } from "@/screens/member/useBookingFlow";

const FEED_LIMIT = 5; // GET /api/posts has no pagination — it returns everything, so show only the latest few

function Stat({ value, label }: { value: number; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={[typography.title, { color: colors.text }]}>{value}</Text>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { colors } = useTheme();
  const { user, club } = useAuth();
  const navigation = useNavigation<BottomTabNavigationProp<MemberTabParamList, "Home">>();
  const stackNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  // Re-renders the countdown; everything time-based derives from `now`.
  const now = useNow();

  const currentMonday = mondayOf(startOfDay(now));
  const weekKey = toISODate(currentMonday);

  const schedule = useAsync(async () => ({ weekKey, ...(await fetchSchedule(weekKey)) }), [weekKey]);
  const posts = useAsync(fetchPosts, []);
  const dashboard = useAsync(fetchDashboard, []);
  const scheduleData = schedule.data && schedule.data.weekKey === weekKey ? schedule.data : null;
  const reloadSchedule = schedule.reload;
  const reloadPosts = posts.reload;
  const reloadDashboard = dashboard.reload;

  const flow = useBookingFlow({ sessions: scheduleData?.sessions, weekMonday: currentMonday, reload: schedule.reload });

  // This week's booked sessions, with real start/end instants.
  const booked = useMemo(
    () =>
      flow.sessions
        .filter((s) => s.isBookedByUser)
        .map((s) => ({
          session: s,
          start: sessionStart(currentMonday, s.day, s.startTime),
          end: sessionStart(currentMonday, s.day, s.endTime),
        }))
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flow.sessions, weekKey]
  );
  const upcoming = booked.filter((b) => b.end > now);
  const next = upcoming[0];

  const goToSchedule = () => navigation.navigate("Schedule");
  const reloadAll = useCallback(() => {
    reloadSchedule();
    reloadPosts();
    reloadDashboard();
  }, [reloadSchedule, reloadPosts, reloadDashboard]);
  useReloadOnFocus(reloadAll);

  const firstName = user?.name.split(" ")[0] ?? "";

  // ── Next-session section: loading / error / empty / success ─────────────
  let nextSection;
  if (!scheduleData && !schedule.error) {
    nextSection = <ListSkeleton count={2} />;
  } else if (!scheduleData) {
    nextSection = (
      <ErrorState title="Planning indisponible" message={schedule.error ?? undefined} actionLabel="Réessayer" onAction={schedule.reload} />
    );
  } else if (!next) {
    nextSection = (
      <EmptyState
        title="Aucune session à venir"
        message={
          scheduleData.weeklyPlan
            ? "Vous n'avez rien de réservé pour la fin de cette semaine."
            : "Le planning de cette semaine n'a pas encore été publié."
        }
        actionLabel="Voir le planning"
        onAction={goToSchedule}
      />
    );
  } else {
    const s = next.session;
    nextSection = (
      <View style={{ gap: spacing.lg }}>
        <Card style={{ borderColor: colors.primary, gap: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>Votre prochaine session</Text>
            <Badge label={whenLabel(next.start, next.end, now, s.startTime)} tone="primary" />
          </View>
          <View>
            <Text style={[typography.title, { color: colors.text }]}>{activityLabel(s.activity)}</Text>
            <Text style={[typography.body, { color: colors.text, marginTop: 2 }]}>
              {formatDayLong(next.start)} · {s.startTime} – {s.endTime}
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
              {s.coach} · {s.location}
            </Text>
          </View>
          <Button label="Annuler la réservation" variant="secondary" onPress={() => flow.openSheet(s.id)} fullWidth />
        </Card>

        <Card>
          <View style={{ flexDirection: "row" }}>
            <Stat value={booked.length} label="Réservées" />
            <Stat value={upcoming.length} label="À venir" />
            <Stat value={booked.length - upcoming.length} label="Terminées" />
          </View>
          <Text style={[typography.small, { color: colors.textMuted, textAlign: "center", marginTop: spacing.sm }]}>
            Cette semaine
          </Text>
        </Card>
      </View>
    );
  }

  // ── Actualités: loading / error / empty / success ───────────────────────
  let feed;
  if (!posts.data && !posts.error) {
    feed = <ListSkeleton count={2} />;
  } else if (!posts.data) {
    feed = (
      <ErrorState title="Actualités indisponibles" message={posts.error ?? undefined} actionLabel="Réessayer" onAction={posts.reload} />
    );
  } else if (posts.data.length === 0) {
    feed = (
      <EmptyState
        icon="newspaper-outline"
        title="Aucune actualité"
        message="Les annonces de votre salle apparaîtront ici."
        actionLabel="Actualiser"
        onAction={posts.reload}
      />
    );
  } else {
    feed = (
      <View style={{ gap: spacing.md }}>
        {posts.data.slice(0, FEED_LIMIT).map((post) => (
          <PostCard key={post.id} post={post} now={now} />
        ))}
      </View>
    );
  }

  return (
    <>
      <ScreenContainer
        refreshing={schedule.refreshing || posts.refreshing || dashboard.refreshing}
        contentStyle={{ gap: spacing.xl, paddingTop: insets.top + spacing.lg }}
        onRefresh={reloadAll}
      >
        <FadeIn>
          <Text style={[typography.title, { color: colors.text }]}>Bonjour, {firstName}</Text>
          <Text style={[typography.body, { color: colors.textMuted, marginTop: 2 }]}>
            {formatDayLong(now)}
            {club?.name ? ` · ${club.name}` : ""}
          </Text>
        </FadeIn>

        <NoticeBanner message={flow.notice} />

        {schedule.error && scheduleData ? (
          <Card style={{ borderColor: colors.danger, gap: spacing.sm }}>
            <Text style={[typography.body, { color: colors.danger }]}>{schedule.error}</Text>
            <Button label="Réessayer" variant="secondary" onPress={schedule.reload} />
          </Card>
        ) : null}

        <MembershipSummary state={dashboard} onPress={() => stackNav.navigate("Membership")} />

        {nextSection}

        <View style={{ gap: spacing.md }}>
          <Text style={[typography.h1, { color: colors.text }]}>Actualités</Text>
          {feed}
        </View>
      </ScreenContainer>

      <SessionSheet {...flow.sheetProps} />
    </>
  );
}
