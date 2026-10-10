import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useResettableState } from "@/hooks/useResettableState";
import { useReloadOnFocus } from "@/hooks/useReloadOnFocus";
import { useUnread } from "@/notifications/UnreadContext";
import { Pressable, Text, View } from "react-native";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";
import { useAsync } from "@/hooks/useAsync";
import { ApiError } from "@/api/client";
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from "@/api/notifications";
import type { AppNotification } from "@/api/types";
import ScreenContainer from "@/components/ScreenContainer";
import Card from "@/components/Card";
import Button from "@/components/Button";
import PushPermissionBanner from "@/components/PushPermissionBanner";
import { EmptyState, ErrorState } from "@/components/StateViews";
import { ListSkeleton } from "@/components/Skeleton";
import { timeAgo } from "@/lib/dates";

const NO_READ: Record<string, true> = {};

/** Notifications tab (member and coach). Read state changes are applied locally after the server confirms. */
export default function NotificationsScreen() {
  const { colors } = useTheme();
  const { data, loading, refreshing, error, reload } = useAsync(() => fetchNotifications(), []);
  useReloadOnFocus(reload);
  const { setUnread } = useUnread();

  // Local "just marked read" state; dropped automatically when fresh server data arrives.
  const [readIds, updateReadIds] = useResettableState<Record<string, true>>(NO_READ, data);
  const [allRead, updateAllRead] = useResettableState<boolean>(false, data);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const now = new Date();
  const isRead = (n: AppNotification) => n.isRead || allRead || readIds[n.id];
  const unread = useMemo(
    () => (data?.notifications ?? []).filter((n) => !(n.isRead || allRead || readIds[n.id])).length,
    [data, allRead, readIds]
  );

  // Keep the tab-bar badge in step with what this screen shows.
  useEffect(() => {
    if (data) setUnread(unread);
  }, [data, unread, setUnread]);

  const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : "Action impossible. Vérifiez votre connexion.");

  const open = async (n: AppNotification) => {
    if (isRead(n)) return;
    setActionError(null);
    try {
      await markNotificationRead(n.id);
      updateReadIds((prev) => ({ ...prev, [n.id]: true }));
    } catch (e) {
      setActionError(messageOf(e));
    }
  };

  const markAll = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await markAllNotificationsRead();
      updateAllRead(() => true);
    } catch (e) {
      setActionError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  let body: ReactNode;
  if (loading || (!data && !error)) {
    body = <ListSkeleton count={4} />;
  } else if (!data) {
    body = <ErrorState title="Notifications indisponibles" message={error ?? undefined} actionLabel="Réessayer" onAction={reload} />;
  } else if (data.notifications.length === 0) {
    body = (
      <EmptyState
        icon="notifications-outline"
        title="Aucune notification"
        message="Les messages de votre salle apparaîtront ici."
        actionLabel="Actualiser"
        onAction={reload}
      />
    );
  } else {
    body = (
      <View style={{ gap: spacing.md }}>
        {unread > 0 ? (
          <Button label={`Tout marquer comme lu (${unread})`} variant="secondary" loading={busy} onPress={() => void markAll()} fullWidth />
        ) : null}
        {data.notifications.map((n) => {
          const read = isRead(n);
          return (
            <Pressable
              key={n.id}
              onPress={() => void open(n)}
              accessibilityRole="button"
              accessibilityLabel={`${read ? "" : "Non lue. "}${n.title}`}
            >
              <Card style={{ flexDirection: "row", gap: spacing.md, borderColor: read ? colors.border : colors.primary }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    marginTop: 6,
                    backgroundColor: read ? "transparent" : colors.primary,
                  }}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[typography.h2, { color: colors.text, fontWeight: read ? "500" : "700" }]}>{n.title}</Text>
                  <Text style={[typography.body, { color: colors.textMuted }]} numberOfLines={4}>
                    {n.message}
                  </Text>
                  <Text style={[typography.small, { color: colors.textMuted, marginTop: spacing.xs }]}>
                    {timeAgo(new Date(n.sentAt), now)}
                  </Text>
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={reload} contentStyle={{ gap: spacing.lg }}>
      <PushPermissionBanner />
      {actionError ? (
        <Card style={{ borderColor: colors.danger }}>
          <Text style={[typography.body, { color: colors.danger }]}>{actionError}</Text>
        </Card>
      ) : null}
      {body}
    </ScreenContainer>
  );
}
