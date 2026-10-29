import { useRef, useState } from "react";
import type { TextInput } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "@/auth/AuthContext";
import { register } from "@/api/auth";
import { ApiError } from "@/api/client";
import type { RootStackParamList } from "@/navigation/types";
import AuthLayout, { FormError, LinkButton } from "@/components/AuthLayout";
import TextField from "@/components/TextField";
import PasswordField from "@/components/PasswordField";
import Button from "@/components/Button";
import { validateConfirm, validateEmail, validateName, validateNewPassword, validatePhone } from "@/lib/validation";

type Props = NativeStackScreenProps<RootStackParamList, "Register">;

export default function RegisterScreen({ navigation }: Props) {
  const { club } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const pwRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const errors = {
    firstName: validateName(firstName, "Prénom"),
    lastName: validateName(lastName, "Nom"),
    email: validateEmail(email),
    phone: validatePhone(phone),
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
      const res = await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        confirmPassword: confirm,
      });
      navigation.replace("VerifyEmail", { email: res.email ?? email.trim().toLowerCase(), fromRegister: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Inscription impossible. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Créer un compte"
      subtitle="Rejoignez votre salle en quelques secondes."
      club={club}
      onBack={() => navigation.goBack()}
      footer={<LinkButton label="J'ai déjà un compte" onPress={() => navigation.goBack()} />}
    >
      <TextField label="Prénom" value={firstName} onChangeText={setFirstName} autoCapitalize="words" autoComplete="given-name" textContentType="givenName" returnKeyType="next" onSubmitEditing={() => lastRef.current?.focus()} error={show("firstName")} />
      <TextField label="Nom" value={lastName} onChangeText={setLastName} autoCapitalize="words" autoComplete="family-name" textContentType="familyName" inputRef={lastRef} returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} error={show("lastName")} />
      <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" inputRef={emailRef} returnKeyType="next" onSubmitEditing={() => phoneRef.current?.focus()} error={show("email")} />
      <TextField label="Téléphone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="+216 20 123 456" inputRef={phoneRef} returnKeyType="next" onSubmitEditing={() => pwRef.current?.focus()} error={show("phone")} />
      <PasswordField label="Mot de passe" value={password} onChangeText={setPassword} showRules autoComplete="new-password" textContentType="newPassword" inputRef={pwRef} returnKeyType="next" onSubmitEditing={() => confirmRef.current?.focus()} error={show("password")} />
      <PasswordField label="Confirmer le mot de passe" value={confirm} onChangeText={setConfirm} autoComplete="new-password" textContentType="newPassword" inputRef={confirmRef} returnKeyType="go" onSubmitEditing={() => void submit()} error={show("confirm")} />

      <FormError message={error} />
      <Button label="Créer mon compte" loading={loading} onPress={() => void submit()} fullWidth />
    </AuthLayout>
  );
}
