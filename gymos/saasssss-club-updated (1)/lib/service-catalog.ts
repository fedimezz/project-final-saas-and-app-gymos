// lib/service-catalog.ts — client-safe description of the optional paid
// services. Contains NO prices: amounts live only in the service_prices table
// (managed by SUPER_ADMIN) and are snapshotted onto each request when created.

export const SERVICE_TYPES = [
  "CUSTOM_DOMAIN",
  "PROFESSIONAL_SETUP",
  "WEBSITE_PERSONALIZATION",
  "PREMIUM_CUSTOMIZATION",
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

// CUSTOM_DOMAIN is ordered through the dedicated domain-request flow (it needs
// a domain name and a DNS workflow); the generic service form excludes it.
export const ORDERABLE_SERVICE_TYPES = SERVICE_TYPES.filter(
  (t): t is Exclude<ServiceType, "CUSTOM_DOMAIN"> => t !== "CUSTOM_DOMAIN"
);

export const SERVICE_META: Record<ServiceType, { label: string; description: string }> = {
  CUSTOM_DOMAIN: {
    label: "Domaine personnalisé",
    description: "Votre site sur votre propre nom de domaine (ex. www.monclub.tn).",
  },
  PROFESSIONAL_SETUP: {
    label: "Installation professionnelle",
    description: "Notre équipe configure votre club à votre place.",
  },
  WEBSITE_PERSONALIZATION: {
    label: "Personnalisation du site",
    description: "Pages, contenus et design adaptés à votre identité.",
  },
  PREMIUM_CUSTOMIZATION: {
    label: "Personnalisation premium",
    description: "Demande sur mesure, étudiée avec notre équipe.",
  },
};

export const DOMAIN_STATUS_META = {
  PENDING: "En attente",
  APPROVED: "Approuvée",
  REJECTED: "Refusée",
  CONFIGURING: "Configuration en cours",
  ACTIVE: "Active",
} as const;

export const SERVICE_STATUS_META = {
  PENDING: "En attente",
  APPROVED: "Approuvée",
  REJECTED: "Refusée",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
} as const;
