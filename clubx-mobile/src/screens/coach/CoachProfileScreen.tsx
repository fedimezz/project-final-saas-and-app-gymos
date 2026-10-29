import { useState } from "react";
import { Text } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";
import { useAsync } from "@/hooks/useAsync";
import { ApiError } from "@/api/client";
import { fetchCoachProfile, updateCoachProfile } from "@/api/coach";
import {
  formatSpecialties,
  parseSpecialties,
  validateBio,
  validateCoachName,
  validateCoachPhone,
  validateSpecialties,
  MAX_BIO,
} from "@/lib/coachProfile";
import Card from "@/components/Card";
import Button from "@/components/Button";
import TextField from "@/components/TextField";
import ProfileScreen from "@/screens/shared/ProfileScreen";

/**
 * The coach's own information. Saved through PATCH /api/dashboard/coach/profile,
 * which updates BOTH the account and the public coach profile (the page the
 * club's visitors see) in one transaction — so the app and the website never
 * show two different names/bios.
 */
function CoachInfoCard({ onSaved }: { onSaved: (message: string) => void }) {
  const { colors } = useTheme();
  const { patchUser } = useAuth();
  const profile = useAsync(fetchCoachProfile, []);
  const data = profile.data;

  // null = untouched → show the server value.
  const [nameEdit, setName] = useState<string | null>(null);
  const [phoneEdit, setPhone] = useState<string | null>(null);
  const [bioEdit, setBio] = useState<string | null>(null);
  const [specEdit, setSpec] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (profile.loading || (!data && !profile.error)) {
    return (
      <Card>
        <Text style={[typography.body, { color: colors.textMuted }]}>Chargement du profil…</Text>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card style={{ gap: spacing.md }}>
        <Text style={[typography.body, { color: colors.danger }]}>{profile.error ?? "Profil indisponible"}</Text>
        <Button label="Réessayer" variant="secondary" onPress={profile.reload} fullWidth />
      </Card>
    );
  }

  const { profile: p, editable } = data;
  const canEdit = editable.length > 0;
  const name = nameEdit ?? p.name;
  const phone = phoneEdit ?? p.phone;
  const bio = bioEdit ?? p.bio;
  const specialties = specEdit ?? formatSpecialties(p.specialties);

  const nameError = showErrors ? validateCoachName(name) : null;
  const phoneError = showErrors ? validateCoachPhone(phone) : null;
  const bioError = showErrors ? validateBio(bio) : null;
  const specError = showErrors ? validateSpecialties(specialties) : null;

  const dirty =
    name.trim() !== p.name ||
    phone.trim() !== p.phone ||
    bio.trim() !== p.bio ||
    formatSpecialties(parseSpecialties(specialties)) !== formatSpecialties(p.specialties);

  const save = async () => {
    if (saving || !canEdit) return;
    setShowErrors(true);
    if (validateCoachName(name) || validateCoachPhone(phone) || validateBio(bio) || validateSpecialties(specialties)) return;
    setSaving(true);
    setSaveError(null);
    try {
      const patch: Parameters<typeof updateCoachProfile>[0] = {};
      if (name.trim() !== p.name) patch.name = name.trim();
      if (phone.trim() !== p.phone) patch.phone = phone.trim();
      if (bio.trim() !== p.bio) patch.bio = bio.trim();
      const nextSpecialties = parseSpecialties(specialties);
      if (formatSpecialties(nextSpecialties) !== formatSpecialties(p.specialties)) patch.specialties = nextSpecialties;
      const res = await updateCoachProfile(patch);
      patchUser({ name: res.profile.name });
      setName(null);
      setPhone(null);
      setBio(null);
      setSpec(null);
      setShowErrors(false);
      onSaved("Profil mis à jour");
      profile.reload();
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : "Action impossible. Vérifiez votre connexion.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ gap: spacing.md }}>
      <Text style={[typography.h1, { color: colors.text }]}>Mon profil coach</Text>
      <Text style={[typography.caption, { color: colors.textMuted }]}>
        {canEdit
          ? p.isPublished
            ? "Ces informations sont affichées sur la page publique de votre salle."
            : "Votre profil n'est pas publié sur le site de la salle pour le moment."
          : "La modification du profil est désactivée par votre salle."}
      </Text>
      <TextField label="Nom" value={name} onChangeText={setName} autoCapitalize="words" maxLength={100} error={nameError} editable={canEdit} />
      <TextField
        label="Téléphone"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        maxLength={20}
        placeholder="Non renseigné"
        error={phoneError}
        editable={canEdit}
      />
      <TextField
        label="Spécialités"
        value={specialties}
        onChangeText={setSpec}
        placeholder="Boxe, Cardio, Yoga"
        hint="Séparées par des virgules (8 maximum)"
        error={specError}
        editable={canEdit}
      />
      <TextField
        label="Bio"
        value={bio}
        onChangeText={setBio}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
        maxLength={MAX_BIO}
        placeholder="Présentez-vous en quelques lignes"
        hint={`${bio.length}/${MAX_BIO}`}
        error={bioError}
        editable={canEdit}
        style={{ minHeight: 110 }}
      />
      {saveError ? <Text style={[typography.body, { color: colors.danger }]}>{saveError}</Text> : null}
      <Button label="Enregistrer" loading={saving} disabled={!dirty || !canEdit} onPress={() => void save()} fullWidth />
    </Card>
  );
}

export default function CoachProfileScreen() {
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <ProfileScreen
      infoSection={<CoachInfoCard onSaved={setNotice} />}
      header={notice ? <Text accessibilityLiveRegion="polite" style={{ textAlign: "center", fontWeight: "700" }}>{notice}</Text> : null}
    />
  );
}
