// Client-side mirrors of the backend rules (lib/validation.ts in the web repo)
// so people get feedback before a round trip. The server stays the authority —
// these only ever make a request fail EARLIER, never succeed.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s\-().]{7,25}$/;

export const validateEmail = (v: string): string | null => {
  const t = v.trim();
  if (!t) return "L'email est requis";
  return EMAIL_RE.test(t) && t.length <= 254 ? null : "Adresse email invalide";
};

export const validateName = (v: string, label: string): string | null => {
  const t = v.trim();
  if (!t) return `${label} requis`;
  return t.length > 60 ? `${label} trop long` : null;
};

export const validatePhone = (v: string): string | null => {
  const t = v.trim();
  if (!t) return "Le téléphone est requis";
  return PHONE_RE.test(t) ? null : "Numéro de téléphone invalide";
};

export interface PasswordChecks {
  length: boolean;
  lower: boolean;
  upper: boolean;
  digit: boolean;
}
/** Same rule as the backend's passwordSchema: 8+ chars, a lower-case, an upper-case, a digit. */
export const passwordChecks = (v: string): PasswordChecks => ({
  length: v.length >= 8,
  lower: /[a-z]/.test(v),
  upper: /[A-Z]/.test(v),
  digit: /\d/.test(v),
});
export const validateNewPassword = (v: string): string | null => {
  if (!v) return "Le mot de passe est requis";
  const c = passwordChecks(v);
  if (!c.length) return "Au moins 8 caractères";
  if (!c.lower) return "Au moins une minuscule";
  if (!c.upper) return "Au moins une majuscule";
  if (!c.digit) return "Au moins un chiffre";
  return v.length > 200 ? "Mot de passe trop long" : null;
};
export const validateConfirm = (password: string, confirm: string): string | null =>
  confirm && confirm !== password ? "Les mots de passe ne correspondent pas" : !confirm ? "Confirmez le mot de passe" : null;

export const validateCode = (v: string): string | null => (/^\d{4,8}$/.test(v.trim()) ? null : "Code à 4–8 chiffres");
