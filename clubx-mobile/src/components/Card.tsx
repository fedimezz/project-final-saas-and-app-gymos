import { View, type ViewProps, StyleSheet } from "react-native";
import { useTheme, radius, spacing } from "@/theme/ThemeContext";

export default function Card({ style, ...props }: ViewProps) {
  const { colors, isDark } = useTheme();
  return (
    <View
      {...props}
      style={[
        styles.base,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          // Soft shadow on light mode; on dark mode a shadow is invisible
          // against a dark background, a subtle border reads better instead.
          ...(isDark
            ? {}
            : { shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 2 }),
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
  },
});
