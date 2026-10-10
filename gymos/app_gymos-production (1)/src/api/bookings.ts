import { apiGet } from "@/api/client";
import type { BookingsResponse } from "@/api/types";

/** The signed-in member's reservations, split by the server into upcoming / past / cancelled. */
export function fetchBookings(): Promise<BookingsResponse> {
  return apiGet<BookingsResponse>("/api/bookings");
}
