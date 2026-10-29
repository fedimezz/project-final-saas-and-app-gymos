import { useRef, useState } from "react";
import type { TextInput } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/auth/AuthContext";
import { ApiError } from "@/api/client";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";
import type { RootStackParamList } from "@/navigation/types";
import AuthLayout, { FormError, FormNotice, LinkButton } from "@/components/AuthLayout";
import TextField from "@/components/TextField";
import PasswordField from "@/components/PasswordField";
import Button from "@/components/Button";
import { validateEmail } from "@/lib/validation";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export default function LoginScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { club, login, switchClub, clearClub, sessionExpired } = useAuth();
  const [email, setEmail] = useState(route.params?.email ?? "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showErrors, setShowErrors] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const emailError = showErrors ? validateEmail(email) : null;
  const passwordError = showErrors && !password ? "Mot de passe requis" : null;

  const submit = async () => {
    if (loading) return;
    setShowErrors(true);
    setError(null);
    if (validateEmail(email) || !password) return;
    setLoading(true);
    try {
      await login(email.trim(), password, rememberMe);
      // No navigation call: RootNavigator swaps to the signed-in tree once `user` is set.
    } catch (e) {
      if (e instanceof ApiError && e.body?.requiresVerification) {
        // Account exists but the email isn't verified yet → straight to the code screen.
        navigation.navigate("VerifyEmail", { email: e.body.email ?? email.trim() });
        return;
      }
      setError(e instanceof ApiError ? e.message : "Connexion impossible. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Connexion"
      subtitle="Heureux de vous revoir."
      club={club}
      onBack={() => void clearClub()}
      footer={
        <>
          <View style={{ flexDirection: "row", gap: spacing.xs, alignItems: "center" }}>
            <Text style={[typography.body, { color: colors.textMuted }]}>Pas encore de compte ?</Text>
            <LinkButton label="Créer un compte" onPress={() => navigation.navigate("Register")} />
          </View>
          <LinkButton label="Changer de salle" muted onPress={() => void switchClub()} />
        </>
      }
    >
      {route.params?.notice ? <FormNotice message={route.params.notice} /> : null}
      {sessionExpired ? <FormError message="Votre session a expiré. Reconnectez-vous pour continuer." /> : null}

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={emailError}
      />
      <PasswordField
        label="Mot de passe"
        value={password}
        onChangeText={setPassword}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        inputRef={passwordRef}
        error={passwordError}
      />

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable
          onPress={() => setRememberMe((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: rememberMe }}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
        >
          <Ionicons name={rememberMe ? "checkbox" : "square-outline"} size={22} color={rememberMe ? colors.primary : colors.textMuted} />
          <Text style={[typography.body, { color: colors.text }]}>Rester connecté</Text>
        </Pressable>
        <LinkButton label="Mot de passe oublié ?" onPress={() => navigation.navigate("ForgotPassword", { email: email.trim() || undefined })} />
      </View>

      <FormError message={error} />
      <Button label="Se connecter" loading={loading} onPress={() => void submit()} fullWidth />
    </AuthLayout>
  );
}
