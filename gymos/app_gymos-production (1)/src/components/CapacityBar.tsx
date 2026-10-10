import { View, StyleSheet } from "react-native";
import { useTheme, radius } from "@/theme/ThemeContext";

/** Thin fill bar: green while there's room, amber from 80%, red when full. */
export default function CapacityBar({ current, capacity }: { current: number; capacity: number }) {
  const { colors } = useTheme();
  const ratio = capacity > 0 ? Math.min(current / capacity, 1) : 1;
  const fill = ratio >= 1 ? colors.danger : ratio >= 0.8 ? colors.warning : colors.success;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: capacity, now: Math.min(current, capacity) }}
      style={[styles.track, { backgroundColor: colors.border }]}
    >
      <View style={{ width: `${ratio * 100}%`, height: "100%", backgroundColor: fill, borderRadius: radius.pill }} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: radius.pill, overflow: "hidden" },
});
