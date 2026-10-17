// Client-safe constants for manual payments (no server imports).
export const MANUAL_METHODS = ["BANK_TRANSFER", "D17", "FLOUCI", "CASH", "OTHER"] as const;
export type ManualMethod = (typeof MANUAL_METHODS)[number];
export const MANUAL_METHOD_LABEL: Record<ManualMethod, string> = {
  BANK_TRANSFER: "Virement bancaire",
  D17: "D17 (La Poste)",
  FLOUCI: "Flouci",
  CASH: "Espèces / en main propre",
  OTHER: "Autre (on me contacte)",
};
