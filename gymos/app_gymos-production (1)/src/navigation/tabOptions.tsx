import { Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import type { Palette } from "@/theme/palette";

type IconName = keyof typeof Ionicons.glyphMap;

/** Filled icon when the tab is focused, outline otherwise. */
export function tabIcon(focused: IconName, unfocused: IconName): NonNullable<BottomTabNavigationOptions["tabBarIcon"]> {
  return function TabIcon({ focused: isFocused, color, size }) {
    return <Ionicons name={isFocused ? focused : unfocused} size={size} color={color} />;
  };
}

/**
 * Options shared by the member and coach tab bars. Header/tab-bar background,
 * text and border colors come from the NavigationContainer theme built in
 * RootNavigator (derived from useTheme().colors), so only the tints are set here.
 */
export function baseTabOptions(colors: Palette): BottomTabNavigationOptions {
  return {
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textMuted,
    tabBarLabelStyle: { fontSize: 10.5, fontWeight: "600", marginBottom: Platform.OS === "android" ? 4 : 0 },
    tabBarStyle: { borderTopColor: colors.border, borderTopWidth: 1 },
    tabBarBadgeStyle: { backgroundColor: colors.danger, color: "#fff", fontSize: 10 },
    headerTitleStyle: { fontWeight: "700", fontSize: 17 },
    headerShadowVisible: false,
    sceneStyle: { backgroundColor: colors.background },
  };
}
