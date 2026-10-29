import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, spacing, radius, typography } from "@/theme/ThemeContext";

interface StateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

function StateBlock({ icon, title, message, actionLabel, onAction, tint }: StateProps & { tint: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      {icon && (
        <View style={[styles.iconWrap, { backgroundColor: tint + "1a" }]}>
          <Ionicons name={icon} size={28} color={tint} />
        </View>
      )}
      <Text style={[typography.h1, { color: colors.text, marginTop: spacing.md, textAlign: "center" }]}>{title}</Text>
      {message && (
        <Text style={[typography.body, { color: colors.textMuted, marginTop: spacing.xs, textAlign: "center" }]}>
          {message}
        </Text>
      )}
      {actionLabel && onAction && (
        <Pressable
          onPress={onAction}
          style={[styles.button, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
        >
          <Text style={{ color: colors.primaryText, fontWeight: "700" }}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function EmptyState(props: StateProps) {
  const { colors } = useTheme();
  return <StateBlock {...props} icon={props.icon ?? "calendar-outline"} tint={colors.textMuted} />;
}

export function ErrorState(props: StateProps) {
  const { colors } = useTheme();
  return <StateBlock {...props} icon={props.icon ?? "alert-circle-outline"} title={props.title} tint={colors.danger} />;
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  iconWrap: { width: 56, height: 56, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  button: { marginTop: spacing.lg, paddingVertical: 12, paddingHorizontal: spacing.xl, borderRadius: radius.pill },
});
