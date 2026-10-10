import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";
import { useAsync } from "@/hooks/useAsync";
import { useNotice } from "@/hooks/useNotice";
import { ApiError } from "@/api/client";
import { fetchMembership, fetchPaymentCountry, subscribeToPlan, resumePayment } from "@/api/membership";
import type { MembershipPlan, MembershipSubscription, PastSubscription, SubscriptionStatus } from "@/api/types";
import ScreenContainer from "@/components/ScreenContainer";
import Card from "@/components/Card";
import Badge, { type BadgeTone } from "@/components/Badge";
import Button from "@/components/Button";
import TextField from "@/components/TextField";
import NoticeBanner from "@/components/NoticeBanner";
import { EmptyState, ErrorState } from "@/components/StateViews";
import { ListSkeleton } from "@/components/Skeleton";
import { formatDateShort } from "@/lib/dates";
import { isAllowedUrl } from "@/config";
import { formatPrice } from "@/lib/format";
import SubscribeSheet, { type PaymentMethod } from "@/screens/member/SubscribeSheet";
import PaymentCountryPicker from "@/components/PaymentCountryPicker";
import { getPaymentCountryName } from "@/lib/payment-country";

const STATUS_BADGE: Record<SubscriptionStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: "Actif", tone: "success" },
  PENDING: { label: "En attente", tone: "warning" },
  EXPIRED: { label: "Expiré", tone: "neutral" },
  CANCELLED: { label: "Annulé", tone: "danger" },
  SUSPENDED: { label: "Suspendu", tone: "warning" },
};

const DAY_MS = 86_400_000;

function SectionTitle({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <Text style={[typography.h1, { color: colors.text }]}>{children}</Text>;
}

export default function MembershipScreen() {
  const { colors } = useTheme();
  const { data, loading, refreshing, error, reload } = useAsync(fetchMembership, []);
  const paymentCountry = useAsync(fetchPaymentCountry, []);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const countryCode = selectedCountry ?? paymentCountry.data?.countryCode ?? "";
  const [notice, setNotice] = useNotice(6000);

  // Subscribe flow
  const [plan, setPlan] = useState<MembershipPlan | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const method: PaymentMethod = countryCode === "TN" ? "ONSITE" : "ONLINE";
  const [promo, setPromo] = useState("");
  const [pending, setPending] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  // Resume-payment flow
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  // The payment page is a web page on the club's own domain: show it in the
  // in-app browser, and re-read the membership once the user closes it (the
  // server flips the subscription to ACTIVE via a webhook, possibly a moment later).
  const openPayment = async (url: string) => {
    // The payment page handles money: never open anything that isn't HTTPS in a release build.
    if (!isAllowedUrl(url)) {
      setResumeError("Lien de paiement invalide. Contactez votre salle.");
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      console.error("Could not open the Stripe checkout page:", error);
      setResumeError("Impossible d'ouvrir le paiement sécurisé. Réessayez ou contactez votre salle.");
      reload();
      return;
    }
    setNotice("Si votre paiement est validé, l'abonnement s'active dans quelques instants. Tirez pour actualiser.");
    reload();
  };

  const openSubscribe = (p: MembershipPlan) => {
    setPlan(p);
    setSheetError(null);
    setSheetVisible(true);
  };

  const confirmSubscribe = async () => {
    if (!plan || pending || !countryCode) return;
    setPending(true);
    setSheetError(null);
    try {
      const res = await subscribeToPlan(plan.id, method, countryCode, promo);
      setSheetVisible(false);
      setPromo("");
      if (method === "ONLINE" && res.paymentUrl) {
        await openPayment(res.paymentUrl);
      } else {
        setNotice(res.message);
        reload();
      }
    } catch (e) {
      // 400 invalid promo, 409 already active/pending, 502 payment gateway down:
      // the server's message is French and user-ready.
      setSheetError(e instanceof ApiError ? e.message : "Action impossible. Vérifiez votre connexion.");
      if (e instanceof ApiError && e.status === 409) reload();
    } finally {
      setPending(false);
    }
  };

  const resume = async () => {
    setResuming(true);
    setResumeError(null);
    try {
      const { paymentUrl } = await resumePayment();
      await openPayment(paymentUrl);
    } catch (e) {
      setResumeError(e instanceof ApiError ? e.message : "Action impossible. Vérifiez votre connexion.");
    } finally {
      setResuming(false);
    }
  };

  // ── Sections ────────────────────────────────────────────────────────────
  const now = new Date();

  const cardSection = (card: NonNullable<typeof data>["card"]) => {
    if (!card) return null;
    const expiresAt = card.expiresAt ? new Date(card.expiresAt) : null;
    const expired = !card.isActive || (expiresAt !== null && expiresAt < now);
    return (
      <Card style={{ backgroundColor: colors.primary, borderColor: colors.primary, gap: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={[typography.caption, { color: colors.primaryText, opacity: 0.8 }]}>Carte de membre</Text>
          <Ionicons name="barbell-outline" size={22} color={colors.primaryText} />
        </View>
        <Text style={[typography.title, { color: colors.primaryText, letterSpacing: 2 }]}>{card.cardNumber}</Text>
        <Text style={[typography.caption, { color: colors.primaryText }]}>
          {expired ? "Expirée" : "Valide"}
          {expiresAt ? ` · jusqu'au ${formatDateShort(expiresAt)}` : ""}
        </Text>
      </Card>
    );
  };

  const currentSection = (sub: MembershipSubscription) => {
    const badge = STATUS_BADGE[sub.status];
    const daysLeft = Math.max(0, Math.ceil((new Date(sub.endDate).getTime() - now.getTime()) / DAY_MS));
    const lastPayment = sub.payments[0]; // newest first (orderBy createdAt desc in the route)
    const awaitingOnlinePayment =
      sub.status === "PENDING" &&
      lastPayment?.paymentMethod === "ONLINE" &&
      (lastPayment.status === "PENDING" || lastPayment.status === "FAILED");
    const awaitingOnsitePayment = sub.status === "PENDING" && lastPayment?.paymentMethod === "ONSITE";

    return (
      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={[typography.h1, { color: colors.text, flexShrink: 1 }]}>{sub.plan.name}</Text>
          <Badge label={badge.label} tone={badge.tone} />
        </View>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          {(lastPayment?.amount !== undefined && lastPayment.currency
            ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: lastPayment.currency }).format(lastPayment.amount)
            : formatPrice(sub.plan.price, sub.plan.currency))} · du {formatDateShort(new Date(sub.startDate))} au {formatDateShort(new Date(sub.endDate))}
        </Text>
        {sub.status === "ACTIVE" ? (
          <Text style={[typography.body, { color: colors.text, fontWeight: "600" }]}>
            {daysLeft} jour{daysLeft > 1 ? "s" : ""} restant{daysLeft > 1 ? "s" : ""}
          </Text>
        ) : null}
        {awaitingOnsitePayment ? (
          <Text style={[typography.body, { color: colors.text }]}>
            Finalisez le paiement à l&apos;accueil pour activer votre abonnement.
          </Text>
        ) : null}
        {awaitingOnlinePayment ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={[typography.body, { color: colors.text }]}>Votre paiement en ligne n&apos;a pas été finalisé.</Text>
            <Button label="Reprendre le paiement" loading={resuming} onPress={() => void resume()} fullWidth />
            {resumeError ? <Text style={[typography.body, { color: colors.danger }]}>{resumeError}</Text> : null}
          </View>
        ) : null}
        {sub.status === "ACTIVE" ? (
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            Vous pourrez renouveler votre abonnement une fois celui-ci expiré.
          </Text>
        ) : null}
      </Card>
    );
  };

  const plansSection = (plans: MembershipPlan[]) => (
    <View style={{ gap: spacing.md }}>
      <SectionTitle>Choisir une formule</SectionTitle>
      {plans.length === 0 ? (
        <EmptyState
          icon="pricetags-outline"
          title="Aucune formule disponible"
          message="Votre salle n'a pas encore publié de formule."
          actionLabel="Actualiser"
          onAction={reload}
        />
      ) : (
        <>
          <TextField
            label="Code promo (optionnel)"
            value={promo}
            onChangeText={setPromo}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={30}
            placeholder="EX : RENTREE"
          />
          <Pressable
            onPress={() => setCountryPickerVisible(true)}
            accessibilityRole="button"
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 14,
              padding: spacing.md,
              gap: spacing.xs,
            }}
          >
            <Text style={[typography.caption, { color: colors.textMuted }]}>Pays de paiement</Text>
            <Text style={[typography.body, { color: colors.text, fontWeight: "600" }]}>
              {getPaymentCountryName(countryCode) ?? "Choisir un pays"}
            </Text>
            {!countryCode ? (
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                Le pays n&apos;a pas été détecté automatiquement ; sélectionnez-le manuellement.
              </Text>
            ) : null}
          </Pressable>
          {plans.map((p) => (
            <Card key={p.id} style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <Text style={[typography.h1, { color: colors.text, flexShrink: 1 }]}>{p.name}</Text>
                <Text style={[typography.h1, { color: colors.primary }]}>
                  {countryCode
                    ? formatPrice(p.price, p.currency)
                    : "Choisir un pays"}
                </Text>
              </View>
              <Text style={[typography.caption, { color: colors.textMuted }]}>{p.durationDays} jours</Text>
              {p.description ? <Text style={[typography.body, { color: colors.textMuted }]}>{p.description}</Text> : null}
              {p.features.map((feature) => (
                <View key={feature} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{feature}</Text>
                </View>
              ))}
              <Button
                label="Choisir cette formule"
                onPress={() => openSubscribe(p)}
                disabled={!!countryCode && countryCode !== "TN" && !["USD", "EUR", "GBP", "CAD", "CHF"].includes(p.currency)}
                fullWidth
              />
            </Card>
          ))}
        </>
      )}
    </View>
  );

  const historyRow = (h: PastSubscription) => {
    const badge = STATUS_BADGE[h.status];
    return (
      <Card key={h.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.h2, { color: colors.text }]}>{h.plan.name}</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {formatDateShort(new Date(h.startDate))} – {formatDateShort(new Date(h.endDate))}
          </Text>
        </View>
        <Badge label={badge.label} tone={badge.tone} />
      </Card>
    );
  };

  // ── Body: loading / error / empty / success ─────────────────────────────
  let body: ReactNode;
  if (loading || (!data && !error)) {
    body = <ListSkeleton count={3} />;
  } else if (!data) {
    body = (
      <ErrorState title="Abonnement indisponible" message={error ?? undefined} actionLabel="Réessayer" onAction={reload} />
    );
  } else if (!data.card && !data.activeSubscription && data.plans.length === 0 && data.history.length === 0) {
    body = (
      <EmptyState
        icon="card-outline"
        title="Aucun abonnement"
        message="Votre salle n'a pas encore de formule à vous proposer."
        actionLabel="Actualiser"
        onAction={reload}
      />
    );
  } else {
    body = (
      <>
        {cardSection(data.card)}
        {data.activeSubscription ? (
          <View style={{ gap: spacing.md }}>
            <SectionTitle>Mon abonnement</SectionTitle>
            {currentSection(data.activeSubscription)}
          </View>
        ) : (
          plansSection(data.plans)
        )}
        {data.history.length > 0 ? (
          <View style={{ gap: spacing.md }}>
            <SectionTitle>Historique</SectionTitle>
            {data.history.map(historyRow)}
          </View>
        ) : null}
      </>
    );
  }

  return (
    <>
      <ScreenContainer refreshing={refreshing} onRefresh={reload} contentStyle={{ gap: spacing.xl }}>
        <NoticeBanner message={notice} />
        {error && data ? (
          <Card style={{ borderColor: colors.danger, gap: spacing.sm }}>
            <Text style={[typography.body, { color: colors.danger }]}>{error}</Text>
            <Button label="Réessayer" variant="secondary" onPress={reload} />
          </Card>
        ) : null}
        {body}
      </ScreenContainer>

      <SubscribeSheet
        visible={sheetVisible}
        plan={plan}
        promoCode={promo}
        method={method}
        countryCode={countryCode}
        pending={pending}
        error={sheetError}
        onClose={() => setSheetVisible(false)}
        onConfirm={() => void confirmSubscribe()}
      />
      <PaymentCountryPicker
        visible={countryPickerVisible}
        selectedCode={countryCode}
        onClose={() => setCountryPickerVisible(false)}
        onSelect={setSelectedCountry}
      />
    </>
  );
}
