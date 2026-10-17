import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";
import BottomSheet from "@/components/BottomSheet";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import CapacityBar from "@/components/CapacityBar";
import { activityLabel } from "@/lib/labels";
import { plural } from "@/lib/dates";
import type { ScheduleSession } from "@/api/types";

interface Props {
  visible: boolean;
  session: ScheduleSession | null;
  /** e.g. "Lundi 22 septembre" — the session only knows its weekday, the screen knows the week. */
  dateLabel: string;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  /** Books the session, or cancels the booking if it's already booked. */
  onConfirm: () => void;
}

function InfoRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{text}</Text>
    </View>
  );
}

/** The confirmation step for booking AND cancelling — one sheet, the button flips on `isBookedByUser`. */
export default function SessionSheet({ visible, session, dateLabel, pending, error, onClose, onConfirm }: Props) {
  const { colors } = useTheme();
  if (!session) return null;

  const booked = session.isBookedByUser;
  const full = session.isFull && !booked;

  return (
    <BottomSheet visible={visible} onClose={pending ? () => {} : onClose}>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Text style={[typography.h1, { color: colors.text, flexShrink: 1 }]}>{activityLabel(session.activity)}</Text>
          {booked ? <Badge label="Réservé" tone="success" /> : full ? <Badge label="Complet" tone="danger" /> : null}
        </View>

        <View style={{ gap: spacing.sm }}>
          <InfoRow icon="calendar-outline" text={`${dateLabel} · ${session.startTime} – ${session.endTime}`} />
          <InfoRow icon="person-outline" text={session.coach} />
          <InfoRow icon="location-outline" text={session.location} />
        </View>

        <View style={{ gap: spacing.xs }}>
          <CapacityBar current={session.currentBookings} capacity={session.capacity} />
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {session.currentBookings}/{session.capacity} inscrits ·{" "}
            {session.spotsLeft > 0 ? `${plural(session.spotsLeft, "place")} restante${session.spotsLeft > 1 ? "s" : ""}` : "complet"}
          </Text>
        </View>

        {session.description ? (
          <Text style={[typography.body, { color: colors.textMuted }]}>{session.description}</Text>
        ) : null}

        {booked ? (
          <Text style={[typography.body, { color: colors.text }]}>
            Vous êtes inscrit à cette session. Voulez-vous annuler votre réservation ?
          </Text>
        ) : null}

        {error ? (
          <Text accessibilityLiveRegion="polite" style={[typography.body, { color: colors.danger, fontWeight: "600" }]}>
            {error}
          </Text>
        ) : null}

        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {booked ? (
            <Button label="Annuler ma réservation" variant="danger" loading={pending} onPress={onConfirm} fullWidth />
          ) : (
            <Button
              label={full ? "Session complète" : "Confirmer la réservation"}
              disabled={full}
              loading={pending}
              onPress={onConfirm}
              fullWidth
            />
          )}
          <Button label="Fermer" variant="secondary" disabled={pending} onPress={onClose} fullWidth />
        </View>
      </View>
    </BottomSheet>
  );
}
