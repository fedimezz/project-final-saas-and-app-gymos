// lib/domain-requests.ts — pure helpers (no DB) for custom-domain and service
// requests: hostname normalisation/validation and the allowed status workflow.
import { platformHostname } from "@/lib/tenant-url";

export type DomainStatus = "PENDING" | "APPROVED" | "REJECTED" | "CONFIGURING" | "ACTIVE";
export type ServiceStatus =
  | "PENDING" | "APPROVED" | "REJECTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

// PENDING → APPROVED/REJECTED → CONFIGURING → ACTIVE (REJECTED is terminal;
// an ACTIVE domain can be sent back to CONFIGURING if DNS/SSL needs rework).
export const DOMAIN_TRANSITIONS: Record<DomainStatus, readonly DomainStatus[]> = {
  PENDING: ["APPROVED", "REJECTED"],
  APPROVED: ["CONFIGURING", "REJECTED"],
  CONFIGURING: ["ACTIVE", "REJECTED"],
  ACTIVE: ["CONFIGURING"],
  REJECTED: [],
};

export const SERVICE_TRANSITIONS: Record<ServiceStatus, readonly ServiceStatus[]> = {
  PENDING: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["IN_PROGRESS", "REJECTED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function canTransition<S extends string>(
  table: Record<S, readonly S[]>, from: S, to: S
): boolean {
  return table[from]?.includes(to) ?? false;
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD = /^[a-z]{2,24}$|^xn--[a-z0-9-]{2,59}$/;

/**
 * Returns the bare lower-case hostname ("www.monclub.tn") or null when the
 * input is not a registrable-looking domain. Accepts pasted URLs
 * ("https://www.monclub.tn/") and strips scheme, path, port and trailing dot.
 * Rejects IPs, single-label hosts, localhost and the platform's own domain
 * (and its subdomains) so an owner can never claim the platform host.
 */
export function normalizeDomain(input: string): string | null {
  let host = input.trim().toLowerCase();
  if (!host || host.length > 253) return null;
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  host = host.split(/[/?#]/)[0];
  host = host.replace(/:\d+$/, "").replace(/\.$/, "");
  if (host.includes("@") || host.includes(" ")) return null;
  const labels = host.split(".");
  if (labels.length < 2) return null;
  if (!labels.every((l) => LABEL.test(l))) return null;
  if (!TLD.test(labels[labels.length - 1])) return null; // also rejects IPv4
  const apex = platformHostname();
  if (apex && (host === apex || host.endsWith(`.${apex}`))) return null;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return null;
  return host;
}
