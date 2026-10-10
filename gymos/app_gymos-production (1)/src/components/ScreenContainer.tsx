import { ScrollView, View, RefreshControl, StyleSheet, type ViewStyle } from "react-native";
import { useTheme, spacing } from "@/theme/ThemeContext";

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: ViewStyle;
}

export default function ScreenContainer({ children, scroll = true, refreshing, onRefresh, contentStyle }: Props) {
  const { colors } = useTheme();

  if (!scroll) {
    return <View style={[styles.flex, { backgroundColor: colors.background, padding: spacing.lg }, contentStyle]}>{children}</View>;
  }

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, contentStyle]}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined
      }
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
});
