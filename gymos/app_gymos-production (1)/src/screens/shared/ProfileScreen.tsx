import { useState, type ReactNode } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "@/auth/AuthContext";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";
import { useAsync } from "@/hooks/useAsync";
import { useNotice } from "@/hooks/useNotice";
import { ApiError } from "@/api/client";
import { fetchProfile, updateProfile } from "@/api/profile";
import type { RootStackParamList } from "@/navigation/types";
import ScreenContainer from "@/components/ScreenContainer";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import Avatar from "@/components/Avatar";
import TextField from "@/components/TextField";
import SegmentedControl from "@/components/SegmentedControl";
import ClubLogo from "@/components/ClubLogo";
import NoticeBanner from "@/components/NoticeBanner";
import { ErrorState } from "@/components/StateViews";
import { ListSkeleton } from "@/components/Skeleton";
import { formatDateShort } from "@/lib/dates";

// Same rules as the backend (nameSchema / phoneSchema in lib/validation.ts) so
// people get the message before a round trip; the server stays the authority.
const PHONE_RE = /^[+]?[\d\s\-().]{7,20}$/;
const validateName = (v: string) => (v.trim().length < 2 ? "Le nom doit contenir au moins 2 caractères" : v.trim().length > 100 ? "Le nom est trop long" : null);
const validatePhone = (v: string) => {
  const t = v.trim();
  if (t === "") return null; // clearing the number is allowed
  return t.length >= 7 && t.length <= 20 && PHONE_RE.test(t) ? null : "Format de téléphone invalide";
};

const MODES = [
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
  { value: "system", label: "Système" },
] as const;

const ROLE_LABEL: Record<string, string> = { MEMBER: "Membre", COACH: "Coach" };

interface Props {
  /** Extra content under the identity block (the coach's stats). */
  header?: ReactNode;
  /** Pull-to-refresh also reloads whatever `header` shows. */
  onRefreshExtra?: () => void;
  extraRefreshing?: boolean;
  /** Replaces the default "Mes informations" form (the coach uses its own, which also saves the public coach profile). */
  infoSection?: ReactNode;
}

/**
 * Shared by members and coaches: identity, edit name/phone, notifications
 * entry, light/dark/system theme, logout. There is no "empty" state here — a
 * profile always has content — so the four states reduce to loading / error /
 * success plus the inline form validation.
 */
export default function ProfileScreen({ header, onRefreshExtra, extraRefreshing = false, infoSection }: Props) {
  const { colors, mode, setMode } = useTheme();
  const { logout, switchClub, patchUser, club, user: sessionUser } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const profile = useAsync(fetchProfile, []);
  const user = profile.data?.user;

  // ── Edit form ───────────────────────────────────────────────────────────
  // `null` = untouched → show the server value. Avoids copying props into state in an effect.
  const [nameEdit, setName] = useState<string | null>(null);
  const [phoneEdit, setPhone] = useState<string | null>(null);
  const name = nameEdit ?? user?.name ?? "";
  const phone = phoneEdit ?? user?.phone ?? "";
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useNotice();

  const nameError = showErrors ? validateName(name) : null;
  const phoneError = showErrors ? validatePhone(phone) : null;
  const dirty = !!user && (name.trim() !== user.name || phone.trim() !== (user.phone ?? ""));

  const save = async () => {
    if (!user || saving) return;
    setShowErrors(true);
    if (validateName(name) || validatePhone(phone)) return;
    setSaving(true);
    setSaveError(null);
    try {
      const patch: { name?: string; phone?: string } = {};
      if (name.trim() !== user.name) patch.name = name.trim();
      if (phone.trim() !== (user.phone ?? "")) patch.phone = phone.trim();
      const res = await updateProfile(patch);
      patchUser({ name: res.user.name });
      setName(null);
      setPhone(null);
      setShowErrors(false);
      setNotice("Profil mis à jour");
      profile.reload();
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : "Action impossible. Vérifiez votre connexion.");
    } finally {
      setSaving(false);
    }
  };

  const confirmSwitch = () =>
    Alert.alert("Changer de salle ?", "Vous serez déconnecté de cette salle.", [
      { text: "Annuler", style: "cancel" },
      { text: "Continuer", onPress: () => void switchClub() },
    ]);

  // ── Body: loading / error / success ─────────────────────────────────────
  let body: ReactNode;
  if (profile.loading || (!user && !profile.error)) {
    body = <ListSkeleton count={3} />;
  } else if (!user) {
    body = <ErrorState title="Profil indisponible" message={profile.error ?? undefined} actionLabel="Réessayer" onAction={profile.reload} />;
  } else {
    body = (
      <>
        <View style={{ alignItems: "center", gap: spacing.xs }}>
          <Avatar name={user.name} uri={user.avatar} size={84} />
          <Text style={[typography.title, { color: colors.text, marginTop: spacing.sm }]}>{user.name}</Text>
          <Text style={[typography.body, { color: colors.textMuted }]}>{user.email}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs }}>
            <Badge label={ROLE_LABEL[user.role] ?? user.role} tone="primary" />
            {user.createdAt ? (
              <Text style={[typography.caption, { color: colors.textMuted }]}>Depuis le {formatDateShort(new Date(user.createdAt))}</Text>
            ) : null}
          </View>
        </View>

        {header}

        {infoSection ?? (
        <Card style={{ gap: spacing.md }}>
          <Text style={[typography.h1, { color: colors.text }]}>Mes informations</Text>
          <TextField label="Nom" value={name} onChangeText={setName} autoCapitalize="words" maxLength={100} error={nameError} />
          <TextField
            label="Téléphone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            maxLength={20}
            placeholder="Non renseigné"
            error={phoneError}
          />
          {saveError ? <Text style={[typography.body, { color: colors.danger }]}>{saveError}</Text> : null}
          <Button label="Enregistrer" loading={saving} disabled={!dirty} onPress={() => void save()} fullWidth />
        </Card>
        )}

        {club ? (
          <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <ClubLogo name={club.name} uri={club.logoUrl} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={[typography.caption, { color: colors.textMuted }]}>Ma salle</Text>
              <Text style={[typography.h2, { color: colors.text }]} numberOfLines={1}>
                {club.name}
              </Text>
            </View>
          </Card>
        ) : null}

        {sessionUser?.role === "MEMBER" ? (
          <Pressable onPress={() => navigation.navigate("Membership")} accessibilityRole="button" accessibilityLabel="Mon abonnement">
            <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <Ionicons name="card-outline" size={22} color={colors.text} />
              <Text style={[typography.h2, { color: colors.text, flex: 1 }]}>Mon abonnement</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Card>
          </Pressable>
        ) : null}

        <Card style={{ gap: spacing.md }}>
          <Text style={[typography.h1, { color: colors.text }]}>Apparence</Text>
          <SegmentedControl value={mode} onChange={setMode} options={MODES} />
        </Card>

        <Button label="Changer de salle" variant="secondary" icon="swap-horizontal-outline" onPress={() => confirmSwitch()} fullWidth />
        <Button label="Se déconnecter" variant="secondary" icon="log-out-outline" onPress={() => void logout()} fullWidth />
      </>
    );
  }

  return (
    <ScreenContainer
      refreshing={profile.refreshing || extraRefreshing}
      onRefresh={() => {
        profile.reload();
        onRefreshExtra?.();
      }}
      contentStyle={{ gap: spacing.lg }}
    >
      <NoticeBanner message={notice} />
      {body}
    </ScreenContainer>
  );
}
