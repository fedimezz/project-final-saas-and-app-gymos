import { Text, View } from "react-native";
import { useState } from "react";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";
import Card from "@/components/Card";
import Button from "@/components/Button";
import { usePush } from "@/notifications/PushContext";

/**
 * In-app prompt shown BEFORE the system permission dialog (so the person knows
 * why we ask), and a path to the system settings if they already refused.
 * Renders nothing once notifications are on, while checking, or when the
 * build/device can't do push at all.
 */
export default function PushPermissionBanner() {
  const { colors } = useTheme();
  const { status, enable, openSettings } = usePush();
  const [busy, setBusy] = useState(false);

  if (status !== "undetermined" && status !== "denied") return null;

  return (
    <Card style={{ borderColor: colors.primary, gap: spacing.sm }}>
      <View style={{ gap: 2 }}>
        <Text style={[typography.h2, { color: colors.text }]}>Activer les notifications</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          {status === "denied"
            ? "Les notifications sont désactivées pour GymOS. Activez-les dans les réglages de votre téléphone pour recevoir changements de planning, rappels de séances et annonces du club."
            : "Recevez les changements de planning, les rappels de séances, vos réservations et les annonces du club."}
        </Text>
      </View>
      {status === "denied" ? (
        <Button label="Ouvrir les réglages" variant="secondary" onPress={openSettings} fullWidth />
      ) : (
        <Button
          label="Activer"
          icon="notifications"
          loading={busy}
          onPress={() => {
            setBusy(true);
            void enable().finally(() => setBusy(false));
          }}
          fullWidth
        />
      )}
    </Card>
  );
}
