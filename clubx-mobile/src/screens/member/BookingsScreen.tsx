import { useMemo, useState, type ReactNode } from "react";
import { Alert, Text, View } from "react-native";
import { useAsync } from "@/hooks/useAsync";
import { useNotice } from "@/hooks/useNotice";
import { useNow } from "@/hooks/useNow";
import { useReloadOnFocus } from "@/hooks/useReloadOnFocus";
import { ApiError } from "@/api/client";
import { fetchBookings } from "@/api/bookings";
import { cancelBooking } from "@/api/schedule";
import type { BookingItem } from "@/api/types";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";
import ScreenContainer from "@/components/ScreenContainer";
import SegmentedControl from "@/components/SegmentedControl";
import NoticeBanner from "@/components/NoticeBanner";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import FadeIn from "@/components/FadeIn";
import { EmptyState, ErrorState } from "@/components/StateViews";
import { ListSkeleton } from "@/components/Skeleton";
import { activityLabel } from "@/lib/labels";
import { formatDayLong, mondayOf, parseDateOnly, sessionStart, timeAgo } from "@/lib/dates";

type Tab = "upcoming" | "past" | "cancelled";

/** Real start/end instants of a booking: its plan's Monday + the session's weekday and times. */
function instants(b: BookingItem) {
  const monday = mondayOf(parseDateOnly(b.weeklyPlan.weekStart));
  return { start: sessionStart(monday, b.session.day, b.session.startTime), end: sessionStart(monday, b.session.day, b.session.endTime) };
}

function BookingCard({ booking, now, tab, onCancel, busy }: { booking: BookingItem; now: Date; tab: Tab; onCancel: () => void; busy: boolean }) {
  const { colors } = useTheme();
  const { start, end } = instants(booking);
  const s = booking.session;
  const over = end <= now;
  const canCancel = tab === "upcoming" && !over;

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {formatDayLong(start)} · {s.startTime} – {s.endTime}
          </Text>
          <Text style={[typography.h1, { color: colors.text, marginTop: 2 }]}>{activityLabel(s.activity)}</Text>
          <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
            {s.coach} · {s.location}
          </Text>
        </View>
        {tab === "cancelled" ? (
          <Badge label="Annulée" tone="danger" />
        ) : tab === "past" || over ? (
          <Badge label="Terminée" tone="neutral" />
        ) : now >= start ? (
          <Badge label="En cours" tone="success" />
        ) : (
          <Badge label="Confirmée" tone="success" />
        )}
      </View>
      {tab === "cancelled" && booking.cancelledAt ? (
        <Text style={[typography.small, { color: colors.textMuted }]}>Annulée {timeAgo(new Date(booking.cancelledAt), now).toLowerCase()}</Text>
      ) : null}
      {canCancel ? <Button label="Annuler la réservation" variant="secondary" loading={busy} onPress={onCancel} fullWidth /> : null}
    </Card>
  );
}

export default function BookingsScreen() {
  const { colors } = useTheme();
  const now = useNow(60_000);
  const { data, loading, refreshing, error, reload } = useAsync(fetchBookings, []);
  useReloadOnFocus(reload);

  const [tab, setTab] = useState<Tab>("upcoming");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useNotice();

  const lists = useMemo(() => {
    const byStart = (a: BookingItem, b: BookingItem) => instants(a).start.getTime() - instants(b).start.getTime();
    return {
      upcoming: [...(data?.upcoming ?? [])].sort(byStart),
      past: [...(data?.past ?? [])].sort((a, b) => byStart(b, a)),
      cancelled: [...(data?.cancelled ?? [])].sort((a, b) => (b.cancelledAt ?? "").localeCompare(a.cancelledAt ?? "")),
    };
  }, [data]);

  const doCancel = async (b: BookingItem) => {
    setBusyId(b.id);
    setActionError(null);
    try {
      const res = await cancelBooking(b.sessionId);
      setNotice(res.message);
      reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Annulation impossible. Vérifiez votre connexion.");
      if (e instanceof ApiError && e.status === 409) reload(); // our list was stale
    } finally {
      setBusyId(null);
    }
  };

  const confirmCancel = (b: BookingItem) =>
    Alert.alert("Annuler la réservation ?", `${activityLabel(b.session.activity)} · ${formatDayLong(instants(b).start)} à ${b.session.startTime}`, [
      { text: "Garder", style: "cancel" },
      { text: "Annuler la réservation", style: "destructive", onPress: () => void doCancel(b) },
    ]);

  const items = lists[tab];
  const emptyCopy: Record<Tab, { title: string; message: string }> = {
    upcoming: { title: "Aucune réservation à venir", message: "Réservez une séance depuis l'onglet Planning." },
    past: { title: "Aucune séance passée", message: "Vos séances terminées apparaîtront ici." },
    cancelled: { title: "Aucune annulation", message: "Les réservations que vous annulez apparaîtront ici." },
  };

  let body: ReactNode;
  if (loading || (!data && !error)) {
    body = <ListSkeleton count={3} />;
  } else if (!data) {
    body = <ErrorState title="Réservations indisponibles" message={error ?? undefined} actionLabel="Réessayer" onAction={reload} />;
  } else if (items.length === 0) {
    body = <EmptyState icon="ticket-outline" title={emptyCopy[tab].title} message={emptyCopy[tab].message} actionLabel="Actualiser" onAction={reload} />;
  } else {
    body = (
      <View style={{ gap: spacing.md }}>
        {items.map((b, i) => (
          <FadeIn key={b.id} delay={Math.min(i, 5) * 40}>
            <BookingCard booking={b} now={now} tab={tab} busy={busyId === b.id} onCancel={() => confirmCancel(b)} />
          </FadeIn>
        ))}
      </View>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={reload} contentStyle={{ gap: spacing.lg }}>
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: "upcoming", label: "À venir", count: data ? lists.upcoming.length : undefined },
          { value: "past", label: "Passées", count: data ? lists.past.length : undefined },
          { value: "cancelled", label: "Annulées", count: data ? lists.cancelled.length : undefined },
        ]}
      />
      <NoticeBanner message={notice} />
      {actionError ? (
        <Card style={{ borderColor: colors.danger }}>
          <Text style={[typography.body, { color: colors.danger }]}>{actionError}</Text>
        </Card>
      ) : null}
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
