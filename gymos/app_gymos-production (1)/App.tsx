import { useEffect } from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { ThemeProvider, useTheme } from "@/theme/ThemeContext";
import ThemeSync from "@/theme/ThemeSync";
import RootNavigator from "@/navigation/RootNavigator";
import OfflineBanner from "@/components/OfflineBanner";
import { PushProvider } from "@/notifications/PushContext";

// Keep the native splash up until the stored session has been checked, so
// there is no flash of the sign-in screen for someone who is already signed in.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// Reads the resolved theme AFTER ThemeProvider mounts (a component can't
// read the context it's wrapped by), just to set the status bar + root
// background to match — everything else reads useTheme() directly.
//
// Deliberately NOT a SafeAreaView: the navigators own the safe-area insets
// (header on top, tab bar on the bottom). Wrapping them here as well would
// pad the top and bottom twice.
function Shell() {
  const { colors, isDark } = useTheme();
  const { user, restoreFailed } = useAuth();

  // `user === undefined` = still restoring; once known (or the restore failed
  // and the retry screen is showing) the splash can go.
  const ready = user !== undefined || restoreFailed;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemeSync />
      <RootNavigator />
      <OfflineBanner />
      <StatusBar style={isDark ? "light" : "dark"} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider>
          <PushProvider>
            <Shell />
          </PushProvider>
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
