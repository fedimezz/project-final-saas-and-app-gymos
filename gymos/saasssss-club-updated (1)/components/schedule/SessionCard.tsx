"use client";

import { Clock, Users, CheckCircle2 } from "lucide-react";
import { ACTIVITY_LABELS } from "./ActivityFilter";

export interface ScheduleSession {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  activity: string;
  coach: string;
  capacity: number;
  currentBookings: number;
  description: string | null;
  location: string;
  isBookedByUser: boolean;
  isFull: boolean;
  spotsLeft: number;
}

const ACTIVITY_COLORS: Record<string, string> = {
  BODYBUILDING: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  FITNESS: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  CARDIO: "bg-red-500/10 text-red-600 dark:text-red-400",
  CROSSFIT: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  YOGA: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  PILATES: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  BOXE: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  MMA: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  AQUAGYM: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  PADEL: "bg-lime-500/10 text-lime-600 dark:text-lime-400",
  ZUMBA: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
  SPINNING: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

interface Props {
  session: ScheduleSession;
  onClick: () => void;
}

export default function SessionCard({ session, onClick }: Props) {
  const colorClass = ACTIVITY_COLORS[session.activity] ?? "bg-primary/10 text-primary";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all hover:shadow-md hover:-translate-y-0.5 ${
        session.isBookedByUser
          ? "border-success/40 bg-success/5"
          : session.isFull
          ? "border-border bg-muted/50 opacity-70"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${colorClass}`}>
          {ACTIVITY_LABELS[session.activity] ?? session.activity}
        </span>
        {session.isBookedByUser && (
          <CheckCircle2 size={14} className="text-success flex-shrink-0" />
        )}
      </div>

      <p className="text-xs text-muted flex items-center gap-1">
        <Clock size={11} />
        {session.startTime} – {session.endTime}
      </p>

      <p className="text-sm font-medium text-primary mt-1 truncate">{session.coach}</p>

      <p className="text-xs mt-1.5 flex items-center gap-1">
        <Users size={11} className={session.isFull ? "text-danger" : "text-muted"} />
        <span className={session.isFull ? "text-danger font-medium" : "text-muted"}>
          {session.isFull ? "Complet" : `${session.spotsLeft} place${session.spotsLeft > 1 ? "s" : ""}`}
        </span>
      </p>
    </button>
  );
}