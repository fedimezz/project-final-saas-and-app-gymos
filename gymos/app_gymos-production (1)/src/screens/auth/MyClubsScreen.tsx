import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthContext";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";
import type { RootStackParamList } from "@/navigation/types";
import type { ClubRef } from "@/api/types";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import ClubLogo from "@/components/ClubLogo";
import FadeIn from "@/components/FadeIn";
import { EmptyState } from "@/components/StateViews";

type Props = NativeStackScreenProps<RootStackParamList, "MyClubs">;

/** Landing screen when signed out: the clubs saved on this device, the user's own club first. */
export default function MyClubsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { savedClubs, homeClubSlug, lastClubSlug, selectClub, removeClub, sessionExpired } = useAuth();

  const choose = async (club: ClubRef) => {
    try {
      await selectClub(club);
    } catch {
      Alert.alert("Salle indisponible", "L'adresse de cette salle n'est pas sécurisée. Recherchez-la de nouveau.");
    }
  };

  const confirmRemove = (club: ClubRef) =>
    Alert.alert("Retirer cette salle ?", `${club.name} sera retirée de vos salles enregistrées sur cet appareil.`, [
      { text: "Annuler", style: "cancel" },
      { text: "Retirer", style: "destructive", onPress: () => removeClub(club.slug) },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + spacing.xl }}>
      <FadeIn style={{ paddingHorizontal: spacing.xl, gap: spacing.xs }}>
        <Text style={[typography.title, { color: colors.text }]}>Mes salles</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          {savedClubs.length > 0 ? "Choisissez votre salle pour vous connecter." : "Trouvez votre salle pour commencer."}
        </Text>
        {sessionExpired ? (
          <Text style={[typography.caption, { color: colors.warning, marginTop: spacing.xs }]}>Votre session a expiré. Reconnectez-vous.</Text>
        ) : null}
      </FadeIn>

      <FlatList
        data={savedClubs}
        keyExtractor={(c) => c.slug}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 110, gap: spacing.md, flexGrow: 1 }}
        ListEmptyComponent={
          <EmptyState
            icon="barbell-outline"
            title="Aucune salle enregistrée"
            message="Recherchez votre salle et enregistrez-la pour la retrouver à chaque ouverture."
          />
        }
        renderItem={({ item, index }) => (
          <FadeIn delay={Math.min(index, 6) * 50}>
            <Pressable
              onPress={() => void choose(item)}
              accessibilityRole="button"
              accessibilityLabel={`Se connecter à ${item.name}`}
              style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
            >
              <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, borderColor: item.slug === homeClubSlug ? colors.primary : colors.border }}>
                <ClubLogo name={item.name} uri={item.logoUrl} size={52} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[typography.h2, { color: colors.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.slug === homeClubSlug ? (
                    <Badge label="Ma salle" tone="primary" />
                  ) : item.slug === lastClubSlug ? (
                    <Badge label="Dernière utilisée" tone="neutral" />
                  ) : null}
                </View>
                <Pressable
                  onPress={() => confirmRemove(item)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={`Retirer ${item.name}`}
                  style={{ padding: spacing.xs }}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
                </Pressable>
              </Card>
            </Pressable>
          </FadeIn>
        )}
      />

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: spacing.xl,
          paddingBottom: insets.bottom + spacing.lg,
          backgroundColor: colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Button label="Rechercher une salle" icon="search" onPress={() => navigation.navigate("ClubSearch")} fullWidth />
      </View>
    </View>
  );
}
