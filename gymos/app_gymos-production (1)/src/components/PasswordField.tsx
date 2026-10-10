import { useState } from "react";
import type { Ref } from "react";
import { Pressable, Text, View, type TextInput, type TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TextField from "@/components/TextField";
import { passwordChecks } from "@/lib/validation";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";

interface Props extends Omit<TextInputProps, "secureTextEntry"> {
  label?: string;
  error?: string | null;
  /** Show the live "8 caractères, majuscule…" checklist (use when CHOOSING a password). */
  showRules?: boolean;
  inputRef?: Ref<TextInput>;
}

/** Password input with a show/hide toggle and an optional strength checklist. */
export default function PasswordField({ showRules, value, ...props }: Props) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const checks = passwordChecks(value ?? "");

  const rules: [boolean, string][] = [
    [checks.length, "8 caractères minimum"],
    [checks.upper, "Une majuscule"],
    [checks.lower, "Une minuscule"],
    [checks.digit, "Un chiffre"],
  ];

  return (
    <View style={{ gap: spacing.sm }}>
      <TextField
        {...props}
        value={value}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        right={
          <Pressable
            onPress={() => setVisible((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
          </Pressable>
        }
      />
      {showRules && (value?.length ?? 0) > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: spacing.lg, rowGap: 2 }}>
          {rules.map(([ok, label]) => (
            <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name={ok ? "checkmark-circle" : "ellipse-outline"} size={14} color={ok ? colors.success : colors.textMuted} />
              <Text style={[typography.caption, { color: ok ? colors.success : colors.textMuted }]}>{label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
