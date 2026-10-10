import { useRef, useState } from "react";
import type { TextInput } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "@/auth/AuthContext";
import { confirmPasswordReset } from "@/api/auth";
import { ApiError } from "@/api/client";
import type { RootStackParamList } from "@/navigation/types";
import AuthLayout, { FormError, LinkButton } from "@/components/AuthLayout";
import TextField from "@/components/TextField";
import PasswordField from "@/components/PasswordField";
import Button from "@/components/Button";
import { validateConfirm, validateEmail, validateNewPassword } from "@/lib/validation";

type Props = NativeStackScreenProps<RootStackParamList, "ResetPassword">;

export default function ResetPasswordScreen({ navigation, route }: Props) {
  const { club } = useAuth();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState(route.params?.email ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<TextInput>(null);

  const effectiveEmail = email.trim();

  const errors = {
    code: /^\d{6}$/.test(code.trim()) ? null : "Code à 6 chiffres",
    email: validateEmail(effectiveEmail),
    password: validateNewPassword(password),
    confirm: validateConfirm(password, confirm),
  };
  const show = (k: keyof typeof errors) => (showErrors ? errors[k] : null);

  const submit = async () => {
    if (loading) return;
    setShowErrors(true);
    setError(null);
    if (Object.values(errors).some(Boolean)) return;
    setLoading(true);
    try {
      await confirmPasswordReset(effectiveEmail, code.trim(), password);
      navigation.reset({
        index: 0,
        routes: [{ name: "Login", params: { email: effectiveEmail, notice: "Mot de passe modifié. Connectez-vous avec le nouveau." } }],
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Réinitialisation impossible. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Nouveau mot de passe"
      subtitle="Saisissez le code reçu par email, puis choisissez un nouveau mot de passe."
      club={club}
      onBack={() => navigation.goBack()}
      footer={<LinkButton label="Retour à la connexion" muted onPress={() => navigation.navigate("Login")} />}
    >
      <TextField
        label="Code reçu par email"
        value={code}
        onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        placeholder="123456"
        style={{ letterSpacing: 6, fontSize: 20, fontWeight: "700" }}
        error={show("code")}
      />
      {!route.params?.email ? (
        <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" error={show("email")} />
      ) : null}
      <PasswordField label="Nouveau mot de passe" value={password} onChangeText={setPassword} showRules autoComplete="new-password" textContentType="newPassword" returnKeyType="next" onSubmitEditing={() => confirmRef.current?.focus()} error={show("password")} />
      <PasswordField label="Confirmer" value={confirm} onChangeText={setConfirm} autoComplete="new-password" textContentType="newPassword" inputRef={confirmRef} returnKeyType="go" onSubmitEditing={() => void submit()} error={show("confirm")} />
      <FormError message={error} />
      <Button label="Réinitialiser" loading={loading} onPress={() => void submit()} fullWidth />
    </AuthLayout>
  );
}
