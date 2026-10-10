import { apiGet, apiPost } from "@/api/client";
import type { MembershipResponse } from "@/api/types";

export function fetchMembership(): Promise<MembershipResponse> {
  return apiGet<MembershipResponse>("/api/dashboard/membership");
}

export function fetchPaymentCountry(): Promise<{ countryCode: string | null }> {
  return apiGet<{ countryCode: string | null }>("/api/payments/country");
}

interface SubscribeResponse {
  message: string;
  subscription: { id: string; status: string };
  payment: { id: string; amount: number; currency: string; status: string; paymentMethod: string };
  // ONLINE only. The field is `paymentUrl` (not `payUrl`) — see
  // app/api/dashboard/membership/subscribe/route.ts. Open it in an in-app browser.
  paymentUrl?: string;
}

export function subscribeToPlan(
  planId: string,
  paymentMethod: "ONLINE" | "ONSITE",
  countryCode: string,
  promoCode?: string
): Promise<SubscribeResponse> {
  return apiPost<SubscribeResponse>("/api/dashboard/membership/subscribe", {
    planId,
    paymentMethod,
    countryCode,
    // The backend schema accepts a missing or empty code; never send whitespace.
    promoCode: promoCode?.trim() || undefined,
  });
}

/** Re-opens a fresh payment session for a PENDING subscription started with ONLINE payment. */
export function resumePayment(): Promise<{ paymentUrl: string }> {
  return apiPost<{ paymentUrl: string }>("/api/dashboard/membership/resume-payment");
}
