// lib/saas-plan-features.ts
// Human-readable feature lines for a SaaS plan's `limits` JSON (shared by the
// public landing pricing and the owner's billing page). Pure, client-safe.

const LIMIT_LABELS: { key: string; label: string }[] = [
  { key: "maxMembers", label: "membres" },
  { key: "maxCoaches", label: "coachs" },
  { key: "maxAdmins", label: "administrateurs" },
  { key: "maxBookingsPerMonth", label: "réservations / mois" },
];

const FEATURE_FLAGS: { key: string; label: string }[] = [
  { key: "customDomain", label: "Domaine personnalisé" },
  { key: "advancedAnalytics", label: "Analytique avancée" },
  { key: "revenueAnalytics", label: "Analytique des revenus" },
  { key: "apiAccess", label: "Accès API" },
  { key: "whiteLabel", label: "Marque blanche" },
];

export function formatLimit(value: unknown): string {
  if (value === null || value === undefined) return "Illimité";
  return String(value);
}

export function planFeatureLines(limits: Record<string, unknown> | null | undefined): string[] {
  const l = limits ?? {};
  return [
    ...LIMIT_LABELS.map(({ key, label }) => `${formatLimit(l[key])} ${label}`),
    ...FEATURE_FLAGS.filter((f) => l[f.key] === true).map((f) => f.label),
  ];
}
