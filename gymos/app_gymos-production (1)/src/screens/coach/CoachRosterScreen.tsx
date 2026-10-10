import { useEffect, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";
import { useResettableState } from "@/hooks/useResettableState";
import { useAsync } from "@/hooks/useAsync";
import { ApiError } from "@/api/client";
import { fetchRoster, setAttendance } from "@/api/coach";
import type { RootStackParamList } from "@/navigation/types";
import ScreenContainer from "@/components/ScreenContainer";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import Avatar from "@/components/Avatar";
import { EmptyState, ErrorState } from "@/components/StateViews";
import { ListSkeleton } from "@/components/Skeleton";
import { activityLabel } from "@/lib/labels";
import { DAY_LABELS_FULL, dayOfWeekOf } from "@/lib/dates";

const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : "Action impossible. Vérifiez votre connexion.");

/**
 * Who booked one of this coach's sessions, and who has been checked in.
 * The backend records attendance per calendar DAY ("checked in today"), not
 * per session date — so check-in is only offered on the session's own weekday,
 * otherwise a Wednesday class could be ticked off on a Monday.
 */
const NO_OVERRIDES: Record<string, boolean> = {};

export default function CoachRosterScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { sessionId } = useRoute<RouteProp<RootStackParamList, "CoachRoster">>().params;

  const { data, loading, refreshing, error, reload } = useAsync(() => fetchRoster(sessionId), [sessionId]);

  const [overrides, setOverrides] = useResettableState<Record<string, boolean>>(NO_OVERRIDES, data);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (data) navigation.setOptions({ title: activityLabel(data.session.activity) });
  }, [data, navigation]);

  const roster = (data?.roster ?? []).map((m) => ({ ...m, checkedIn: overrides[m.userId] ?? m.checkedIn }));
  const presentCount = roster.filter((m) => m.checkedIn).length;
  const canCheckIn = !!data && data.session.day === dayOfWeekOf(new Date());

  const toggle = async (userId: string, currentlyCheckedIn: boolean) => {
    if (pendingIds.has(userId) || bulkPending) return;
    setActionError(null);
    setPendingIds((prev) => new Set(prev).add(userId));
    try {
      const res = await setAttendance(sessionId, userId, currentlyCheckedIn); // undo = it was already checked in
      setOverrides((prev) => ({ ...prev, [userId]: res.checkedIn }));
    } catch (e) {
      setActionError(messageOf(e));
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  // No bulk endpoint exists, so this is one request per member; failures are counted, not hidden.
  const markAllPresent = async () => {
    const todo = roster.filter((m) => !m.checkedIn);
    if (todo.length === 0) return;
    setBulkPending(true);
    setActionError(null);
    const results = await Promise.allSettled(todo.map((m) => setAttendance(sessionId, m.userId, false)));
    const applied: Record<string, boolean> = {};
    let failed = 0;
    results.forEach((r, i) => {
      if (r.status === "fulfilled") applied[todo[i].userId] = r.value.checkedIn;
      else failed += 1;
    });
    setOverrides((prev) => ({ ...prev, ...applied }));
    if (failed > 0) setActionError(`${failed} présence${failed > 1 ? "s" : ""} n'${failed > 1 ? "ont" : "a"} pas pu être enregistrée${failed > 1 ? "s" : ""}. Réessayez.`);
    setBulkPending(false);
  };

  let body: ReactNode;
  if (loading || (!data && !error)) {
    body = <ListSkeleton count={4} />;
  } else if (!data) {
    body = <ErrorState title="Liste indisponible" message={error ?? undefined} actionLabel="Réessayer" onAction={reload} />;
  } else if (roster.length === 0) {
    body = (
      <EmptyState
        icon="people-outline"
        title="Aucune réservation"
        message="Personne n'est inscrit à cette séance pour le moment."
        actionLabel="Actualiser"
        onAction={reload}
      />
    );
  } else {
    body = (
      <>
        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[typography.h1, { color: colors.text }]}>
              {presentCount}/{roster.length} présent{presentCount > 1 ? "s" : ""}
            </Text>
            <Badge label={`${DAY_LABELS_FULL[data.session.day]} ${data.session.startTime}`} tone="neutral" />
          </View>
          {!canCheckIn ? (
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              Le pointage se fait le jour de la séance ({DAY_LABELS_FULL[data.session.day].toLowerCase()}).
            </Text>
          ) : presentCount < roster.length ? (
            <Button label="Tout marquer présent" variant="secondary" loading={bulkPending} onPress={() => void markAllPresent()} fullWidth />
          ) : null}
        </Card>

        <View style={{ gap: spacing.sm }}>
          {roster.map((m) => {
            const busy = pendingIds.has(m.userId);
            return (
              <Pressable
                key={m.userId}
                onPress={() => void toggle(m.userId, m.checkedIn)}
                disabled={!canCheckIn || busy || bulkPending}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: m.checkedIn, disabled: !canCheckIn }}
                accessibilityLabel={m.name}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              >
                <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, borderColor: m.checkedIn ? colors.success : colors.border }}>
                  <Avatar name={m.name} uri={m.avatar} size={40} />
                  <Text style={[typography.h2, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                    {m.name}
                  </Text>
                  {busy ? (
                    <Text style={[typography.caption, { color: colors.textMuted }]}>…</Text>
                  ) : (
                    <Ionicons
                      name={m.checkedIn ? "checkmark-circle" : "ellipse-outline"}
                      size={28}
                      color={m.checkedIn ? colors.success : colors.textMuted}
                    />
                  )}
                </Card>
              </Pressable>
            );
          })}
        </View>
      </>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={reload} contentStyle={{ gap: spacing.lg }}>
      {actionError ? (
        <Card style={{ borderColor: colors.danger }}>
          <Text style={[typography.body, { color: colors.danger }]}>{actionError}</Text>
        </Card>
      ) : null}
      {body}
    </ScreenContainer>
  );
}
