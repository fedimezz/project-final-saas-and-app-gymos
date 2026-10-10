import { View, Text, StyleSheet } from "react-native";
import { useTheme, radius, spacing, typography } from "@/theme/ThemeContext";

export type BadgeTone = "success" | "warning" | "danger" | "neutral" | "primary";

export default function Badge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  const { colors } = useTheme();
  const toneColor: Record<BadgeTone, string> = {
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    neutral: colors.textMuted,
    primary: colors.primary,
  };
  const c = toneColor[tone];

  return (
    <View style={[styles.pill, { backgroundColor: c + "1f" }]}>
      <Text style={[typography.small, { color: c, fontWeight: "700" }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: radius.pill, alignSelf: "flex-start" },
});
