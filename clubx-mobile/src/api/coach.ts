import { apiGet, apiPatch, apiPost } from "@/api/client";
import type { CoachSessionsResponse, RosterResponse, CoachStats } from "@/api/types";

export function fetchCoachSessions(): Promise<CoachSessionsResponse> {
  return apiGet<CoachSessionsResponse>("/api/dashboard/coach/sessions");
}

export function fetchRoster(sessionId: string): Promise<RosterResponse> {
  return apiGet<RosterResponse>(`/api/dashboard/coach/sessions/${sessionId}/roster`);
}

export function setAttendance(
  sessionId: string,
  userId: string,
  undo: boolean
): Promise<{ checkedIn: boolean }> {
  return apiPost<{ checkedIn: boolean }>("/api/dashboard/coach/attendance", { sessionId, userId, undo });
}

export function fetchCoachStats(): Promise<CoachStats> {
  return apiGet<CoachStats>("/api/dashboard/coach/stats");
}

// ── Own coach profile (what the public club page shows) ─────────────────────
export interface CoachProfile {
  name: string;
  email: string;
  phone: string;
  bio: string;
  specialties: string[];
  photoUrl: string | null;
  isPublished: boolean;
}
export type CoachEditableField = "name" | "phone" | "bio" | "specialties" | "photoUrl";

export function fetchCoachProfile(): Promise<{ profile: CoachProfile; editable: CoachEditableField[] }> {
  return apiGet<{ profile: CoachProfile; editable: CoachEditableField[] }>("/api/dashboard/coach/profile");
}

export function updateCoachProfile(
  data: Partial<Pick<CoachProfile, "name" | "phone" | "bio" | "specialties">>
): Promise<{ profile: CoachProfile }> {
  return apiPatch<{ profile: CoachProfile }>("/api/dashboard/coach/profile", data);
}
