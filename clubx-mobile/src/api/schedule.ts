import { apiGet, apiPost, apiDelete } from "@/api/client";
import type { ScheduleResponse } from "@/api/types";

interface BookOrCancelResponse {
  message: string;
  session: {
    id: string;
    currentBookings: number;
    capacity: number;
    isFull: boolean;
    spotsLeft: number;
  };
}

/** weekStart: "YYYY-MM-DD" (a Monday) — omit for the club's currently active week. */
export function fetchSchedule(weekStart?: string): Promise<ScheduleResponse> {
  const qs = weekStart ? `?weekStart=${weekStart}` : "";
  return apiGet<ScheduleResponse>(`/api/dashboard/schedule${qs}`);
}

export function bookSession(sessionId: string): Promise<BookOrCancelResponse> {
  return apiPost<BookOrCancelResponse>("/api/dashboard/schedule/book", { sessionId });
}

export function cancelBooking(sessionId: string): Promise<BookOrCancelResponse> {
  return apiDelete<BookOrCancelResponse>("/api/dashboard/schedule/book", { sessionId });
}
