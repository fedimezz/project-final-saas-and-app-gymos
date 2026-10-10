import { useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "@/auth/AuthContext";
import { requestPasswordReset } from "@/api/auth";
import { ApiError } from "@/api/client";
import type { RootStackParamList } from "@/navigation/types";
import AuthLayout, { FormError, FormNotice, LinkButton } from "@/components/AuthLayout";
import TextField from "@/components/TextField";
import Button from "@/components/Button";
import { validateEmail } from "@/lib/validation";

type Props = NativeStackScreenProps<RootStackParamList, "ForgotPassword">;

export default function ForgotPasswordScreen({ navigation, route }: Props) {
  const { club } = useAuth();
  const [email, setEmail] = useState(route.params?.email ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const submit = async () => {
    if (loading) return;
    setError(null);
    const invalid = validateEmail(email);
    if (invalid) {
      setError(invalid);
      return;
    }
    setLoading(true);
    try {
      const res = await requestPasswordReset(email.trim());
      setSent(res.message); // generic on purpose: the server never reveals whether the account exists
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Envoi impossible. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Mot de passe oublié"
      subtitle="Saisissez votre email : nous vous enverrons un code de réinitialisation."
      club={club}
      onBack={() => navigation.goBack()}
      footer={<LinkButton label="Retour à la connexion" muted onPress={() => navigation.navigate("Login")} />}
    >
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={() => void submit()}
      />
      <FormError message={error} />
      <FormNotice message={sent} />
      <Button label="Envoyer le code" loading={loading} onPress={() => void submit()} fullWidth />
      {sent ? (
        <Button
          label="J'ai reçu le code"
          variant="secondary"
          onPress={() => navigation.navigate("ResetPassword", { email: email.trim() })}
          fullWidth
        />
      ) : null}
    </AuthLayout>
  );
}
