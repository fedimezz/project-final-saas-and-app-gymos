import { useMemo } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { NavigationContainer, DefaultTheme, DarkTheme, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "@/auth/AuthContext";
import { useTheme } from "@/theme/ThemeContext";
import { ErrorState } from "@/components/StateViews";
import type { RootStackParamList } from "@/navigation/types";
import { navigationRef, flushPendingNavigation } from "@/navigation/navigationRef";
import MemberTabs from "@/navigation/MemberTabs";
import CoachTabs from "@/navigation/CoachTabs";
import MyClubsScreen from "@/screens/auth/MyClubsScreen";
import ClubSearchScreen from "@/screens/auth/ClubSearchScreen";
import LoginScreen from "@/screens/auth/LoginScreen";
import RegisterScreen from "@/screens/auth/RegisterScreen";
import VerifyEmailScreen from "@/screens/auth/VerifyEmailScreen";
import ForgotPasswordScreen from "@/screens/auth/ForgotPasswordScreen";
import ResetPasswordScreen from "@/screens/auth/ResetPasswordScreen";
import UnsupportedRoleScreen from "@/screens/shared/UnsupportedRoleScreen";
import MembershipScreen from "@/screens/member/MembershipScreen";
import CoachRosterScreen from "@/screens/coach/CoachRosterScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

// Screens pushed on top of the tabs get a real header with a back button
// (the stack itself is headerless: the auth screens and tabs draw their own).
const pushedScreenOptions = { headerShown: true, headerBackButtonDisplayMode: "minimal" as const, headerShadowVisible: false };

// Auth flow per the React Navigation docs: which screens exist depends on
// auth state, so signing in/out swaps the whole tree (and its navigation
// state) instead of imperatively navigating. Signed-in screens exist ONLY for
// the two mobile roles — owner/admin never get a navigator here.
export default function RootNavigator() {
  const { user, club, restoreFailed, retryRestore, resetClub } = useAuth();
  const { colors, isDark } = useTheme();

  // Header, tab bar and screen backgrounds all read from this theme, so they
  // follow the club's brand color and light/dark mode with no per-screen work.
  const navTheme: Theme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.danger,
      },
    };
  }, [colors, isDark]);

  if (user === undefined) {
    // Still restoring the session on launch.
    return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
          {restoreFailed ? (
              <>
                <ErrorState
                    icon="cloud-offline-outline"
                    title="Connexion impossible"
                    message="Impossible de joindre le serveur. Vérifiez votre connexion."
                    actionLabel="Réessayer"
                    onAction={retryRestore}
                />
                {/* Never leave the person stuck here: this works fully offline. */}
                <Pressable
                    onPress={() => void resetClub()}
                    accessibilityRole="button"
                    hitSlop={12}
                    style={{ marginTop: 16, paddingVertical: 8, paddingHorizontal: 16 }}
                >
                  <Text style={{ color: colors.textMuted, fontWeight: "600" }}>Changer de salle</Text>
                </Pressable>
              </>
          ) : (
              <ActivityIndicator size="large" color={colors.primary} />
          )}
        </View>
    );
  }

  return (
      <NavigationContainer ref={navigationRef} onReady={flushPendingNavigation} theme={navTheme}>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
          {!user ? (
              club ? (
                  <>
                    <Stack.Screen name="Login" component={LoginScreen} />
                    <Stack.Screen name="Register" component={RegisterScreen} />
                    <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
                    <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
                    <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
                  </>
              ) : (
                  <>
                    <Stack.Screen name="MyClubs" component={MyClubsScreen} />
                    <Stack.Screen name="ClubSearch" component={ClubSearchScreen} />
                  </>
              )
          ) : user.role === "MEMBER" ? (
              <>
                <Stack.Screen name="MemberTabs" component={MemberTabs} />
                <Stack.Screen name="Membership" component={MembershipScreen} options={{ ...pushedScreenOptions, title: "Abonnement" }} />
              </>
          ) : user.role === "COACH" ? (
              <>
                <Stack.Screen name="CoachTabs" component={CoachTabs} />
                <Stack.Screen name="CoachRoster" component={CoachRosterScreen} options={{ ...pushedScreenOptions, title: "Présences" }} />
              </>
          ) : (
              <Stack.Screen name="UnsupportedRole" component={UnsupportedRoleScreen} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
  );
}