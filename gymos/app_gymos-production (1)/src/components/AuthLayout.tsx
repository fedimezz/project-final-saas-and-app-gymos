import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";
import ClubLogo from "@/components/ClubLogo";
import FadeIn from "@/components/FadeIn";

interface Props {
  title: string;
  subtitle?: string;
  club?: { name: string; logoUrl: string | null } | null;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Shared shell for every signed-out screen: safe areas, keyboard avoidance,
 * back button, club identity and a title block. Colors always come from the theme.
 */
export default function AuthLayout({ title, subtitle, club, onBack, children, footer }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: spacing.xl,
          gap: spacing.xl,
        }}
      >
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Retour" style={{ alignSelf: "flex-start" }}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
        ) : null}

        <FadeIn>
          <View style={{ gap: spacing.md }}>
            {club ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <ClubLogo name={club.name} uri={club.logoUrl} size={44} />
                <Text style={[typography.h2, { color: colors.textMuted, flex: 1 }]} numberOfLines={1}>
                  {club.name}
                </Text>
              </View>
            ) : null}
            <Text accessibilityRole="header" style={[typography.title, { color: colors.text }]}>
              {title}
            </Text>
            {subtitle ? <Text style={[typography.body, { color: colors.textMuted }]}>{subtitle}</Text> : null}
          </View>
        </FadeIn>

        <FadeIn delay={80} style={{ gap: spacing.lg }}>
          {children}
        </FadeIn>

        {footer ? <View style={{ marginTop: "auto", alignItems: "center", gap: spacing.sm }}>{footer}</View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Inline error box used by the auth forms. */
export function FormError({ message }: { message: string | null }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <View
      accessibilityLiveRegion="assertive"
      style={{ flexDirection: "row", gap: spacing.sm, padding: spacing.md, borderRadius: 12, backgroundColor: colors.danger + "14", borderWidth: 1, borderColor: colors.danger + "55" }}
    >
      <Ionicons name="alert-circle" size={18} color={colors.danger} style={{ marginTop: 1 }} />
      <Text style={[typography.body, { color: colors.danger, flex: 1 }]}>{message}</Text>
    </View>
  );
}

export function FormNotice({ message }: { message: string | null }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ flexDirection: "row", gap: spacing.sm, padding: spacing.md, borderRadius: 12, backgroundColor: colors.success + "14", borderWidth: 1, borderColor: colors.success + "55" }}
    >
      <Ionicons name="checkmark-circle" size={18} color={colors.success} style={{ marginTop: 1 }} />
      <Text style={[typography.body, { color: colors.success, flex: 1 }]}>{message}</Text>
    </View>
  );
}

export function LinkButton({ label, onPress, muted }: { label: string; onPress: () => void; muted?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="link" style={{ paddingVertical: spacing.xs }}>
      <Text style={[typography.body, { color: muted ? colors.textMuted : colors.primary, fontWeight: "700" }]}>{label}</Text>
    </Pressable>
  );
}
