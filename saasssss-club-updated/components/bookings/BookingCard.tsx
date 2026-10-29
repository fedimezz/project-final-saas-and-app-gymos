"use client";

import { Clock, MapPin, CalendarDays, X, Loader2 } from "lucide-react";

const DAY_LABELS: Record<string, string> = {
  MONDAY: "Lundi",
  TUESDAY: "Mardi",
  WEDNESDAY: "Mercredi",
  THURSDAY: "Jeudi",
  FRIDAY: "Vendredi",
  SATURDAY: "Samedi",
  SUNDAY: "Dimanche",
};

const ACTIVITY_LABELS: Record<string, string> = {
  BODYBUILDING: "Musculation",
  FITNESS: "Fitness",
  CARDIO: "Cardio",
  CROSSFIT: "CrossFit",
  YOGA: "Yoga",
  PILATES: "Pilates",
  BOXE: "Boxe",
  MMA: "MMA",
  AQUAGYM: "Aquagym",
  PADEL: "Padel",
  ZUMBA: "Zumba",
  SPINNING: "Spinning",
};

export interface Booking {
  id: string;
  sessionId: string;
  bookedAt: string;
  cancelledAt: string | null;
  isCancelled: boolean;
  session: {
    day: string;
    startTime: string;
    endTime: string;
    activity: string;
    coach: string;
    location: string;
  };
  weeklyPlan: {
    weekStart: string;
    weekEnd: string;
    isArchived: boolean;
  };
}

interface Props {
  booking: Booking;
  onCancel?: (sessionId: string) => void;
  cancelling?: boolean;
}

export default function BookingCard({ booking, onCancel, cancelling }: Props) {
  const { session } = booking;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 transition-all hover:shadow-md">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
            {ACTIVITY_LABELS[session.activity] ?? session.activity}
          </span>
          {booking.isCancelled && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-danger/10 text-danger">
              Annulée
            </span>
          )}
        </div>

        <p className="font-semibold text-primary">{session.coach}</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <CalendarDays size={13} />
            {DAY_LABELS[session.day] ?? session.day}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={13} />
            {session.startTime} – {session.endTime}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin size={13} />
            {session.location}
          </span>
        </div>
      </div>

      {onCancel && !booking.isCancelled && (
        <button
          onClick={() => onCancel(booking.sessionId)}
          disabled={cancelling}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-danger border border-danger/20 rounded-xl hover:bg-danger/10 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          {cancelling ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
          Annuler
        </button>
      )}
    </div>
  );
}