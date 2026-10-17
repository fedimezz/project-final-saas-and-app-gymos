import { Pressable, Text, ActivityIndicator, StyleSheet, type PressableProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, radius, spacing } from "@/theme/ThemeContext";

interface ButtonProps extends Omit<PressableProps, "style"> {
  label: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
  fullWidth?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

export default function Button({ label, variant = "primary", loading, fullWidth, disabled, icon, ...props }: ButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  const bg = { primary: colors.primary, secondary: colors.surface, danger: colors.danger, ghost: "transparent" }[variant];
  const outlined = variant === "secondary";
  const textColor = variant === "secondary" ? colors.text : variant === "ghost" ? colors.primary : colors.primaryText;

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        fullWidth && { width: "100%" },
        {
          backgroundColor: bg,
          borderColor: colors.border,
          borderWidth: outlined ? 1 : 0,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.985 : 1 }],
          // Filled buttons get a soft brand-tinted glow so the main action reads as raised.
          ...(variant === "primary" && !isDisabled
            ? { shadowColor: colors.primary, shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 }
            : {}),
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={textColor} /> : null}
          <Text style={[styles.label, { color: textColor }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingVertical: 13,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  label: { fontWeight: "700", fontSize: 15, letterSpacing: 0.1 },
});
