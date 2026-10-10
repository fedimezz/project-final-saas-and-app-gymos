import { useState } from "react";
import { Text } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "@/auth/AuthContext";
import { resendVerificationCode, verifyEmail } from "@/api/auth";
import { ApiError } from "@/api/client";
import { useCooldown } from "@/hooks/useCooldown";
import { useTheme, typography } from "@/theme/ThemeContext";
import type { RootStackParamList } from "@/navigation/types";
import AuthLayout, { FormError, FormNotice, LinkButton } from "@/components/AuthLayout";
import TextField from "@/components/TextField";
import Button from "@/components/Button";
import { validateCode } from "@/lib/validation";

type Props = NativeStackScreenProps<RootStackParamList, "VerifyEmail">;

export default function VerifyEmailScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { club } = useAuth();
  const { email, fromRegister } = route.params;
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(fromRegister ? "Compte créé. Saisissez le code reçu par email." : null);
  const cooldown = useCooldown(fromRegister ? 30 : 0); // avoid an immediate "resend" right after the register email went out

  const submit = async () => {
    if (loading) return;
    setError(null);
    const invalid = validateCode(code);
    if (invalid) {
      setError(invalid);
      return;
    }
    setLoading(true);
    try {
      await verifyEmail(email, code.trim());
      // The verify endpoint signs web clients in with a cookie; the app signs in explicitly.
      navigation.reset({ index: 0, routes: [{ name: "Login", params: { email, notice: "Email vérifié. Vous pouvez vous connecter." } }] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Vérification impossible. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (resending || cooldown.active) return;
    setResending(true);
    setError(null);
    setInfo(null);
    try {
      const res = await resendVerificationCode(email);
      cooldown.start(res.cooldownSeconds ?? 60);
      setInfo(res.message);
    } catch (e) {
      if (e instanceof ApiError && e.body?.retryAfterSeconds) cooldown.start(e.body.retryAfterSeconds);
      setError(e instanceof ApiError ? e.message : "Envoi impossible. Réessayez.");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout
      title="Vérifiez votre email"
      subtitle={`Un code de vérification a été envoyé à ${email}.`}
      club={club}
      onBack={() => navigation.goBack()}
      footer={<LinkButton label="Retour à la connexion" muted onPress={() => navigation.navigate("Login")} />}
    >
      <FormNotice message={info} />
      <TextField
        label="Code de vérification"
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 8))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={8}
        placeholder="123456"
        style={{ letterSpacing: 6, fontSize: 20, fontWeight: "700" }}
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      <FormError message={error} />
      <Button label="Vérifier" loading={loading} onPress={() => void submit()} fullWidth />
      <Text style={[typography.caption, { color: colors.textMuted, textAlign: "center" }]}>Le code est valable 15 minutes.</Text>
      <Button
        label={cooldown.active ? `Renvoyer le code (${cooldown.seconds} s)` : "Renvoyer le code"}
        variant="secondary"
        loading={resending}
        disabled={cooldown.active}
        onPress={() => void resend()}
        fullWidth
      />
    </AuthLayout>
  );
}
