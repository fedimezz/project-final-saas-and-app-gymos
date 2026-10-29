import { apiGet, apiPut } from "@/api/client";
import type { FullProfile } from "@/api/types";

export function fetchProfile(): Promise<{ user: FullProfile }> {
  return apiGet<{ user: FullProfile }>("/api/dashboard/profile");
}

export function updateProfile(data: { name?: string; phone?: string; avatar?: string }): Promise<{ user: FullProfile }> {
  return apiPut<{ user: FullProfile }>("/api/dashboard/profile", data);
}
