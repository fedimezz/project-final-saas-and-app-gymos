import { useEffect, useState } from "react";
import { Alert, FlatList, Pressable, Text, View, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthContext";
import { searchClubs } from "@/api/auth";
import { ApiError } from "@/api/client";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";
import type { RootStackParamList } from "@/navigation/types";
import type { ClubRef } from "@/api/types";
import Card from "@/components/Card";
import ClubLogo from "@/components/ClubLogo";
import TextField from "@/components/TextField";
import { EmptyState, ErrorState } from "@/components/StateViews";

type Props = NativeStackScreenProps<RootStackParamList, "ClubSearch">;

const MIN_QUERY = 2;
const DEBOUNCE_MS = 350; // the backend rate-limits search (30/min/IP): never fire per keystroke

export default function ClubSearchScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { savedClubs, saveClub, removeClub, selectClub } = useAuth();

  const [query, setQuery] = useState("");
  // The outcome of the LAST FINISHED search, tagged with the term it answered.
  // "Loading" is derived (current term has no outcome yet) instead of being a flag
  // that a superseded request could leave switched on forever.
  const [settled, setSettled] = useState<{ term: string; clubs: ClubRef[]; error: string | null } | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const term = query.trim();
  const tooShort = term.length < MIN_QUERY;

  useEffect(() => {
    if (term.length < MIN_QUERY) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      let outcome: { term: string; clubs: ClubRef[]; error: string | null };
      try {
        const { clubs } = await searchClubs(term);
        outcome = { term, clubs, error: null };
      } catch (e) {
        outcome = {
          term,
          clubs: [],
          error: e instanceof ApiError ? e.message : "Recherche impossible. Vérifiez votre connexion.",
        };
      }
      if (!cancelled) setSettled(outcome); // a newer query supersedes this one
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, retryKey]);

  const answered = !tooShort && settled?.term === term;
  const shownResults: ClubRef[] = tooShort ? [] : (settled?.clubs ?? []); // keep the previous list visible while typing
  const shownError = answered ? (settled?.error ?? null) : null;
  const isLoading = !tooShort && !answered;
  const searched = answered;

  const isSaved = (slug: string) => savedClubs.some((c) => c.slug === slug);
  const toggleSaved = (club: ClubRef) => (isSaved(club.slug) ? removeClub(club.slug) : saveClub(club));

  const open = async (club: ClubRef) => {
    try {
      await selectClub(club); // RootNavigator swaps to Login once a club is selected
    } catch {
      Alert.alert("Salle indisponible", "L'adresse de cette salle n'est pas sécurisée.");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + spacing.md }}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Retour">
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
          <Text accessibilityRole="header" style={[typography.title, { color: colors.text }]}>
            Trouver une salle
          </Text>
        </View>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Nom de la salle"
          autoFocus
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Nom de la salle"
          right={isLoading ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="search" size={18} color={colors.textMuted} />}
        />
      </View>

      <FlatList
        data={shownResults}
        keyExtractor={(c) => c.slug}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md, flexGrow: 1 }}
        ListEmptyComponent={
          shownError ? (
            <ErrorState title="Recherche impossible" message={shownError} actionLabel="Réessayer" onAction={() => { setSettled(null); setRetryKey((k) => k + 1); }} />
          ) : searched && !isLoading && !tooShort ? (
            <EmptyState icon="search-outline" title="Aucune salle trouvée" message="Vérifiez l'orthographe ou essayez une partie du nom." />
          ) : tooShort ? (
            <EmptyState icon="search-outline" title="Recherchez votre salle" message="Saisissez au moins 2 lettres du nom de votre salle." />
          ) : null
        }
        renderItem={({ item }) => {
          const saved = isSaved(item.slug);
          return (
            <Pressable
              onPress={() => void open(item)}
              accessibilityRole="button"
              accessibilityLabel={`Choisir ${item.name}`}
              style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
            >
              <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <ClubLogo name={item.name} uri={item.logoUrl} size={48} />
                <Text style={[typography.h2, { color: colors.text, flex: 1 }]} numberOfLines={2}>
                  {item.name}
                </Text>
                <Pressable
                  onPress={() => toggleSaved(item)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={saved ? `Retirer ${item.name} de mes salles` : `Enregistrer ${item.name}`}
                  accessibilityState={{ selected: saved }}
                  style={{ padding: spacing.xs }}
                >
                  <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={22} color={saved ? colors.primary : colors.textMuted} />
                </Pressable>
              </Card>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
