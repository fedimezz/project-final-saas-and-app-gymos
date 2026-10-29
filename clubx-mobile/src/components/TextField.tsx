import { useState, type ReactNode, type Ref } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { useTheme, spacing, radius, typography } from "@/theme/ThemeContext";

interface Props extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
  /** Element rendered inside the field, on the right (e.g. the show/hide-password toggle). */
  right?: ReactNode;
  inputRef?: Ref<TextInput>;
}

/** Themed text input with label, focus ring, inline error and optional trailing element. */
export default function TextField({ label, error, hint, right, inputRef, style, onFocus, onBlur, ...props }: Props) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={{ gap: spacing.xs }}>
      {label ? <Text style={[typography.caption, { color: colors.textMuted, fontWeight: "600" }]}>{label}</Text> : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: focused ? 1.5 : 1,
          borderColor,
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
        }}
      >
        <TextInput
          ref={inputRef}
          accessibilityLabel={props.accessibilityLabel ?? label}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[{ flex: 1, color: colors.text, paddingVertical: 13, fontSize: 16 }, style]}
        />
        {right}
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: colors.danger }]}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={[typography.caption, { color: colors.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}
