import { useEffect, useState } from "react";
import { Animated, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsOnline } from "@/hooks/useNetwork";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";

/** Slim banner shown while the device has no connection. Pointer-events none: never blocks a tap. */
export default function OfflineBanner() {
  const online = useIsOnline();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(anim, { toValue: online ? 0 : 1, duration: 220, useNativeDriver: true }).start();
  }, [online, anim]);

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        paddingTop: insets.top + spacing.xs,
        paddingBottom: spacing.xs,
        backgroundColor: colors.warning,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.sm,
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }],
      }}
    >
      <Ionicons name="cloud-offline-outline" size={16} color="#000" />
      <Text style={[typography.caption, { color: "#000", fontWeight: "700" }]}>Hors connexion — données non actualisées</Text>
    </Animated.View>
  );
}
