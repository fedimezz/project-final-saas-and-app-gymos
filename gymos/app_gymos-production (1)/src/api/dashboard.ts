import { apiGet } from "@/api/client";
import type { MemberDashboard } from "@/api/types";

/** Member KPIs: totals, membership status, weekly attendance histogram, recent check-ins. */
export function fetchDashboard(): Promise<MemberDashboard> {
  return apiGet<MemberDashboard>("/api/dashboard");
}
