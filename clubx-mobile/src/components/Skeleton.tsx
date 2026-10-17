import { useEffect, useState } from "react";
import { Animated, View, StyleSheet, type ViewStyle } from "react-native";
import { useTheme, radius, spacing } from "@/theme/ThemeContext";

function SkeletonBlock({ style }: { style?: ViewStyle }) {
  const { colors } = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.4));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[{ backgroundColor: colors.border, borderRadius: radius.sm, opacity }, style]} />;
}

/** A skeleton shaped like a session/list card — used across Schedule, Home, Coach Today. */
export function SessionCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <SkeletonBlock style={{ width: "40%", height: 14, marginBottom: spacing.sm }} />
        <SkeletonBlock style={{ width: "70%", height: 18, marginBottom: spacing.sm }} />
        <SkeletonBlock style={{ width: "50%", height: 12 }} />
      </View>
      <SkeletonBlock style={{ width: 64, height: 32, borderRadius: radius.pill }} />
    </View>
  );
}

export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: spacing.md }}>
      {Array.from({ length: count }).map((_, i) => (
        <SessionCardSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
});
