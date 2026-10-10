import { Text, View } from "react-native";
import { useTheme, spacing, radius, typography } from "@/theme/ThemeContext";
import BottomSheet from "@/components/BottomSheet";
import Button from "@/components/Button";
import { formatPrice } from "@/lib/format";
import type { MembershipPlan } from "@/api/types";

export type PaymentMethod = "ONLINE" | "ONSITE";

interface Props {
  visible: boolean;
  plan: MembershipPlan | null;
  promoCode: string;
  method: PaymentMethod;
  countryCode: string;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export default function SubscribeSheet({ visible, plan, promoCode, method, countryCode, pending, error, onClose, onConfirm }: Props) {
  const { colors } = useTheme();
  if (!plan) return null;
  const tunisian = countryCode === "TN";
  const stripeCurrencySupported = ["USD", "EUR", "GBP", "CAD", "CHF"].includes(plan.currency);
  const canPay = !!countryCode && (tunisian || stripeCurrencySupported);

  return (
    <BottomSheet visible={visible} onClose={pending ? () => {} : onClose}>
      <View style={{ gap: spacing.md }}>
        <View>
          <Text style={[typography.h1, { color: colors.text }]}>{plan.name}</Text>
          <Text style={[typography.body, { color: colors.textMuted }]}>
            {countryCode
              ? formatPrice(plan.price, plan.currency)
              : "Choisissez un pays pour afficher le tarif"}
            {" · "}{plan.durationDays} jours
          </Text>
          {promoCode.trim() ? (
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs }]}>
              Code promo {promoCode.trim().toUpperCase()} — vérifié à la confirmation.
            </Text>
          ) : null}
        </View>

        <View style={{
          padding: spacing.md,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          gap: spacing.xs,
        }}>
          <Text style={[typography.h2, { color: colors.text }]}>
            {tunisian
              ? "Paiement à l'accueil"
              : countryCode
                ? stripeCurrencySupported ? "Paiement sécurisé par Stripe" : `Stripe indisponible en ${plan.currency}`
                : "Pays requis"}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {tunisian
              ? "Réglez à la salle ; l'équipe confirmera l'abonnement."
              : countryCode
                ? stripeCurrencySupported
                  ? "Vous serez redirigé vers Stripe. L'abonnement est activé uniquement après confirmation du paiement."
                  : "Demandez au club de proposer cette offre en USD, EUR, GBP, CAD ou CHF pour le paiement en ligne."
                : "Sélectionnez votre pays dans l'écran précédent pour choisir le moyen de paiement."}
          </Text>
        </View>

        {error ? (
          <Text accessibilityLiveRegion="polite" style={[typography.body, { color: colors.danger, fontWeight: "600" }]}>
            {error}
          </Text>
        ) : null}

        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <Button label={method === "ONLINE" ? "Payer par Stripe" : "Confirmer"} loading={pending} disabled={!canPay} onPress={onConfirm} fullWidth />
          <Button label="Fermer" variant="secondary" disabled={pending} onPress={onClose} fullWidth />
        </View>
      </View>
    </BottomSheet>
  );
}
