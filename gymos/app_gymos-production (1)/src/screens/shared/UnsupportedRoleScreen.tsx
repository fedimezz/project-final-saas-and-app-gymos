import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthContext";
import { useTheme } from "@/theme/ThemeContext";
import ScreenContainer from "@/components/ScreenContainer";
import { EmptyState } from "@/components/StateViews";

/**
 * ADMIN / OWNER accounts can log in (the backend's login route accepts them)
 * but the mobile app is scoped to members and coaches by design — those roles
 * use the web dashboard. Without this screen they'd land in a member UI whose
 * data isn't theirs. Rendered without a navigator header, hence the SafeAreaView.
 */
export default function UnsupportedRoleScreen() {
  const { colors } = useTheme();
  const { logout } = useAuth();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenContainer scroll={false} contentStyle={{ justifyContent: "center" }}>
        <EmptyState
          icon="desktop-outline"
          title="Espace réservé au web"
          message="L'application mobile est réservée aux membres et aux coachs. Connectez-vous au tableau de bord web de votre salle."
          actionLabel="Se déconnecter"
          onAction={() => void logout()}
        />
      </ScreenContainer>
    </SafeAreaView>
  );
}
