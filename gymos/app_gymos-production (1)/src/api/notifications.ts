import { apiGet, apiPut } from "@/api/client";
import type { AppNotification, NotificationsResponse } from "@/api/types";

export function fetchNotifications(limit = 50): Promise<NotificationsResponse> {
  return apiGet<NotificationsResponse>(`/api/dashboard/notifications?limit=${limit}`);
}

// Both write routes are PUT on the backend (…/[id]/read/route.ts, …/read-all/route.ts) — not POST.
export function markNotificationRead(id: string): Promise<AppNotification> {
  return apiPut<AppNotification>(`/api/dashboard/notifications/${id}/read`);
}

export function markAllNotificationsRead(): Promise<{ success: true; count: number }> {
  return apiPut<{ success: true; count: number }>("/api/dashboard/notifications/read-all");
}
