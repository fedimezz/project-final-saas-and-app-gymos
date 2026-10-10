"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Loader2, RefreshCw, CalendarX, Clock, MapPin, X, Check,
  ChevronLeft, ChevronRight, CalendarDays, Calendar as CalendarIcon,
  Users, Zap, BookCheck, AlertCircle,
} from "lucide-react";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const DAY_LABELS_SHORT: Record<string, string> = {
  MONDAY: "Lun", TUESDAY: "Mar", WEDNESDAY: "Mer",
  THURSDAY: "Jeu", FRIDAY: "Ven", SATURDAY: "Sam", SUNDAY: "Dim",
};
const DAY_LABELS_FULL: Record<string, string> = {
  MONDAY: "Lundi", TUESDAY: "Mardi", WEDNESDAY: "Mercredi",
  THURSDAY: "Jeudi", FRIDAY: "Vendredi", SATURDAY: "Samedi", SUNDAY: "Dimanche",
};
const DAY_INDEX: Record<string, number> = {
  MONDAY: 0, TUESDAY: 1, WEDNESDAY: 2, THURSDAY: 3, FRIDAY: 4, SATURDAY: 5, SUNDAY: 6,
};

const ACTIVITIES = [
  "BODYBUILDING", "FITNESS", "CARDIO", "CROSSFIT", "YOGA",
  "PILATES", "BOXE", "MMA", "AQUAGYM", "PADEL", "ZUMBA", "SPINNING",
];
const ACTIVITY_LABELS: Record<string, string> = {
  BODYBUILDING: "Musculation", FITNESS: "Fitness", CARDIO: "Cardio",
  CROSSFIT: "CrossFit", YOGA: "Yoga", PILATES: "Pilates",
  BOXE: "Boxe", MMA: "MMA", AQUAGYM: "Aquagym",
  PADEL: "Padel", ZUMBA: "Zumba", SPINNING: "Spinning",
};
const ACTIVITY_COLORS: Record<string, { bg: string; border: string; text: string; dot: string; bar: string }> = {
  BODYBUILDING: { bg: "bg-orange-500/15", border: "border-orange-500/40", text: "text-orange-700 dark:text-orange-400", dot: "bg-orange-500", bar: "bg-orange-500" },
  FITNESS:      { bg: "bg-blue-500/15",   border: "border-blue-500/40",   text: "text-blue-700 dark:text-blue-400",   dot: "bg-blue-500",   bar: "bg-blue-500" },
  CARDIO:       { bg: "bg-red-500/15",    border: "border-red-500/40",    text: "text-red-700 dark:text-red-400",     dot: "bg-red-500",    bar: "bg-red-500" },
  CROSSFIT:     { bg: "bg-amber-500/15",  border: "border-amber-500/40",  text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500",  bar: "bg-amber-500" },
  YOGA:         { bg: "bg-emerald-500/15",border: "border-emerald-500/40",text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500", bar: "bg-emerald-500" },
  PILATES:      { bg: "bg-teal-500/15",   border: "border-teal-500/40",   text: "text-teal-700 dark:text-teal-400",   dot: "bg-teal-500",   bar: "bg-teal-500" },
  BOXE:         { bg: "bg-rose-500/15",   border: "border-rose-500/40",   text: "text-rose-700 dark:text-rose-400",   dot: "bg-rose-500",   bar: "bg-rose-500" },
  MMA:          { bg: "bg-rose-600/15",   border: "border-rose-600/40",   text: "text-rose-800 dark:text-rose-400",   dot: "bg-rose-600",   bar: "bg-rose-600" },
  AQUAGYM:      { bg: "bg-cyan-500/15",   border: "border-cyan-500/40",   text: "text-cyan-700 dark:text-cyan-400",   dot: "bg-cyan-500",   bar: "bg-cyan-500" },
  PADEL:        { bg: "bg-lime-500/15",   border: "border-lime-500/40",   text: "text-lime-700 dark:text-lime-400",   dot: "bg-lime-500",   bar: "bg-lime-500" },
  ZUMBA:        { bg: "bg-pink-500/15",   border: "border-pink-500/40",   text: "text-pink-700 dark:text-pink-400",   dot: "bg-pink-500",   bar: "bg-pink-500" },
  SPINNING:     { bg: "bg-violet-500/15", border: "border-violet-500/40", text: "text-violet-700 dark:text-violet-400", dot: "bg-violet-500", bar: "bg-violet-500" },
};
const DEFAULT_COLOR = { bg: "bg-[var(--primary)]/15", border: "border-[var(--primary)]/40", text: "text-[var(--primary)]", dot: "bg-[var(--primary)]", bar: "bg-[var(--primary)]" };

const DAY_START_MIN = 6 * 60;
const DAY_END_MIN = 22 * 60;
const PX_PER_MIN = 1.15;
const GRID_HEIGHT = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;
const HOUR_MARKS = Array.from(
  { length: (DAY_END_MIN - DAY_START_MIN) / 60 + 1 },
  (_, i) => DAY_START_MIN + i * 60
);

const AUTO_REFRESH_MS = 45_000;

interface Session {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  activity: string;
  coach: string;
  capacity: number;
  currentBookings: number;
  location: string;
  description: string | null;
  isBookedByUser: boolean;
  isFull: boolean;
  spotsLeft: number;
}

interface ScheduleData {
  weeklyPlan: { id: string; weekStart: string; weekEnd: string } | null;
  sessions: Session[];
}

function toMinutes(time: string): number | null {
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function formatHourLabel(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  return `${String(h).padStart(2, "0")}:00`;
}

function getMonday(date: Date): Date {
  const jsDay = date.getUTCDay();
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + diff));
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Capacity status helpers
function getCapacityStatus(currentBookings: number, capacity: number) {
  const pct = capacity > 0 ? currentBookings / capacity : 1;
  if (pct >= 1) return { label: "Complet", color: "text-red-500", barColor: "bg-red-500" };
  if (pct >= 0.8) return { label: "Presque complet", color: "text-amber-500", barColor: "bg-amber-500" };
  if (pct >= 0.5) return { label: "Disponible", color: "text-emerald-500", barColor: "bg-emerald-500" };
  return { label: "Disponible", color: "text-emerald-500", barColor: "bg-emerald-500" };
}

// ─── Capacity Bar ──────────────────────────────────────────────────────────

function CapacityBar({
  currentBookings,
  capacity,
  showLabel = true,
}: {
  currentBookings: number;
  capacity: number;
  showLabel?: boolean;
}) {
  const pct = capacity > 0 ? Math.min(currentBookings / capacity, 1) : 1;
  const status = getCapacityStatus(currentBookings, capacity);
  const spotsLeft = Math.max(0, capacity - currentBookings);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted flex items-center gap-1">
          <Users size={11} />
          {currentBookings}/{capacity} participants
        </span>
        {showLabel && (
          <span className={`font-medium ${status.color}`}>
            {pct >= 1 ? "Complet" : `${spotsLeft} place${spotsLeft > 1 ? "s" : ""} restante${spotsLeft > 1 ? "s" : ""}`}
          </span>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${status.barColor}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

// ─── Toast ──────────────────────────────────────────────────────────────────

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg border text-sm font-medium animate-fade-in max-w-sm
        ${type === "success"
          ? "bg-card border-green-500/30 text-green-600 dark:text-green-400"
          : "bg-card border-red-500/30 text-red-600 dark:text-red-400"
        }`}
    >
      {type === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="ml-2 opacity-50 hover:opacity-100 transition-opacity" aria-label="Fermer">
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Session Card (list view) ───────────────────────────────────────────────

function SessionCard({
  session,
  onBook,
  onCancel,
  pending,
}: {
  session: Session;
  onBook: (id: string) => void;
  onCancel: (id: string) => void;
  pending: boolean;
}) {
  const color = ACTIVITY_COLORS[session.activity] ?? DEFAULT_COLOR;
  const isBooked = session.isBookedByUser;
  const isFull = session.isFull && !isBooked;

  return (
    <div className={`rounded-xl border p-4 transition-all ${color.border} ${color.bg} ${isBooked ? "ring-2 ring-[var(--primary)]/30" : ""}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-card ${color.text}`}>
            {ACTIVITY_LABELS[session.activity] ?? session.activity}
          </span>
          {isBooked && (
            <span className="flex-shrink-0 flex items-center gap-1 text-[11px] font-semibold text-[var(--primary)] bg-[var(--primary)]/10 px-2 py-0.5 rounded-full">
              <BookCheck size={10} />
              Réservé
            </span>
          )}
        </div>
        {/* Action button */}
        {isBooked ? (
          <button
            onClick={() => onCancel(session.id)}
            disabled={pending}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 border border-red-500/30 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            {pending ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
            Annuler
          </button>
        ) : (
          <button
            onClick={() => onBook(session.id)}
            disabled={pending || isFull}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
              ${isFull
                ? "bg-muted text-muted cursor-not-allowed opacity-60"
                : "bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)] disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
          >
            {pending ? <Loader2 size={12} className="animate-spin" /> : isFull ? null : <Check size={12} />}
            {isFull ? "Complet" : "Réserver"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted mb-3">
        <span className="flex items-center gap-1.5 font-medium text-primary col-span-2">{session.coach}</span>
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {session.startTime}–{session.endTime}
        </span>
        <span className="flex items-center gap-1">
          <MapPin size={11} />
          {session.location}
        </span>
      </div>

      <CapacityBar currentBookings={session.currentBookings} capacity={session.capacity} />

      {session.description && (
        <p className="text-xs text-muted mt-2.5 leading-relaxed">{session.description}</p>
      )}
    </div>
  );
}

// ─── Session Detail Modal ───────────────────────────────────────────────────

function SessionModal({
  session,
  onClose,
  onBook,
  onCancel,
  pending,
}: {
  session: Session;
  onClose: () => void;
  onBook: (id: string) => void;
  onCancel: (id: string) => void;
  pending: boolean;
}) {
  const color = ACTIVITY_COLORS[session.activity] ?? DEFAULT_COLOR;
  const isBooked = session.isBookedByUser;
  const isFull = session.isFull && !isBooked;
  const pct = session.capacity > 0 ? Math.min(session.currentBookings / session.capacity, 1) : 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Colored header strip */}
        <div className={`px-5 pt-5 pb-4 ${color.bg} border-b ${color.border}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full bg-card ${color.text}`}>
                {ACTIVITY_LABELS[session.activity] ?? session.activity}
              </span>
              <p className="text-base font-bold text-primary mt-2">{session.coach}</p>
              <p className="text-sm text-muted">{DAY_LABELS_FULL[session.day]}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-muted transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Meta info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-xs text-muted mb-0.5">Horaire</p>
              <p className="text-sm font-semibold text-primary flex items-center gap-1.5">
                <Clock size={13} className="text-muted" />
                {session.startTime}–{session.endTime}
              </p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-xs text-muted mb-0.5">Salle</p>
              <p className="text-sm font-semibold text-primary flex items-center gap-1.5">
                <MapPin size={13} className="text-muted" />
                {session.location}
              </p>
            </div>
          </div>

          {/* Capacity section — the main focus of the modal */}
          <div className="bg-muted/50 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <Users size={13} />
                Capacité
              </p>
              <p className={`text-xs font-bold ${pct >= 1 ? "text-red-500" : pct >= 0.8 ? "text-amber-500" : "text-emerald-500"}`}>
                {pct >= 1
                  ? "Complet"
                  : `${session.spotsLeft} place${session.spotsLeft > 1 ? "s" : ""} disponible${session.spotsLeft > 1 ? "s" : ""}`}
              </p>
            </div>
            {/* Detailed capacity bar */}
            <div>
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    pct >= 1 ? "bg-red-500" : pct >= 0.8 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${pct * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-muted mt-1.5">
                <span>{session.currentBookings} inscrits</span>
                <span>{session.capacity} max</span>
              </div>
            </div>

            {/* Seat pills: show individual spots for small classes */}
            {session.capacity <= 20 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {Array.from({ length: session.capacity }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-5 h-5 rounded-md transition-colors ${
                      i < session.currentBookings
                        ? isBooked && i === session.currentBookings - 1
                          ? "bg-[var(--primary)]"
                          : pct >= 1 ? "bg-red-400" : pct >= 0.8 ? "bg-amber-400" : "bg-emerald-400"
                        : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Status badge */}
          {isBooked && (
            <div className="flex items-center gap-2 bg-[var(--primary)]/10 border border-[var(--primary)]/20 rounded-xl px-3.5 py-2.5">
              <BookCheck size={15} className="text-[var(--primary)]" />
              <p className="text-sm font-semibold text-[var(--primary)]">Vous êtes inscrit à cette session</p>
            </div>
          )}

          {session.description && (
            <p className="text-sm text-muted leading-relaxed">{session.description}</p>
          )}

          {/* CTA */}
          {isBooked ? (
            <button
              onClick={() => onCancel(session.id)}
              disabled={pending}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-red-500 border-2 border-red-500/30 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              {pending ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
              Annuler ma réservation
            </button>
          ) : (
            <button
              onClick={() => onBook(session.id)}
              disabled={pending || isFull}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors
                ${isFull
                  ? "bg-muted text-muted cursor-not-allowed opacity-60"
                  : "bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)] disabled:opacity-40"
                }`}
            >
              {pending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : isFull ? (
                <Users size={16} />
              ) : (
                <Zap size={16} />
              )}
              {isFull ? "Session complète" : "Réserver cette session"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Week Grid ───────────────────────────────────────────────────────────────

function WeekGrid({
  sessions,
  onSelect,
}: {
  sessions: Session[];
  onSelect: (s: Session) => void;
}) {
  const byDay = useMemo(() => {
    const map: Record<string, Session[]> = {};
    for (const day of DAYS) {
      map[day] = sessions
        .filter((s) => s.day === day)
        .slice()
        .sort((a, b) => (toMinutes(a.startTime) ?? 0) - (toMinutes(b.startTime) ?? 0));
    }
    return map;
  }, [sessions]);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <div className="grid grid-cols-[56px_repeat(7,minmax(120px,1fr))] min-w-[820px]">
          {/* Header */}
          <div className="border-b border-border" />
          {DAYS.map((day) => (
            <div key={day} className="border-b border-l border-border px-2 py-2.5 text-center">
              <p className="text-xs font-semibold text-primary">{DAY_LABELS_SHORT[day]}</p>
            </div>
          ))}

          {/* Time axis */}
          <div className="relative" style={{ height: GRID_HEIGHT }}>
            {HOUR_MARKS.map((m) => (
              <div key={m} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted" style={{ top: (m - DAY_START_MIN) * PX_PER_MIN }}>
                {formatHourLabel(m)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAYS.map((day) => (
            <div key={day} className="relative border-l border-border" style={{ height: GRID_HEIGHT }}>
              {HOUR_MARKS.map((m) => (
                <div key={m} className="absolute left-0 right-0 border-t border-border/50" style={{ top: (m - DAY_START_MIN) * PX_PER_MIN }} />
              ))}

              {byDay[day].map((s) => {
                const start = toMinutes(s.startTime);
                const end = toMinutes(s.endTime);
                if (start === null || end === null) return null;

                const clampedStart = Math.max(start, DAY_START_MIN);
                const clampedEnd = Math.min(Math.max(end, clampedStart + 15), DAY_END_MIN);
                const top = (clampedStart - DAY_START_MIN) * PX_PER_MIN;
                const height = Math.max((clampedEnd - clampedStart) * PX_PER_MIN, 28);
                const color = ACTIVITY_COLORS[s.activity] ?? DEFAULT_COLOR;
                const pct = s.capacity > 0 ? Math.min(s.currentBookings / s.capacity, 1) : 1;

                return (
                  <button
                    key={s.id}
                    onClick={() => onSelect(s)}
                    style={{ top, height }}
                    className={`absolute left-1 right-1 rounded-lg border ${color.border} ${color.bg} px-1.5 py-1 text-left overflow-hidden hover:brightness-95 dark:hover:brightness-110 transition-all
                      ${s.isBookedByUser ? "ring-2 ring-[var(--primary)]/50" : ""}`}
                  >
                    <p className={`text-[11px] font-bold truncate ${color.text}`}>
                      {ACTIVITY_LABELS[s.activity] ?? s.activity}
                    </p>
                    <p className="text-[10px] text-muted truncate">{s.startTime}–{s.endTime}</p>
                    {/* Tiny capacity bar in week block */}
                    {height > 36 && (
                      <div className="absolute bottom-1 left-1.5 right-1.5 h-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct >= 1 ? "bg-red-500" : pct >= 0.8 ? "bg-amber-400" : "bg-emerald-400"}`}
                          style={{ width: `${pct * 100}%` }}
                        />
                      </div>
                    )}
                    {s.isBookedByUser && (
                      <div className="absolute top-1 right-1">
                        <div className="w-2 h-2 rounded-full bg-[var(--primary)]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Month Grid ──────────────────────────────────────────────────────────────

function MonthGrid({
  monthAnchor,
  sessionsByDate,
  selectedDate,
  onSelectDate,
}: {
  monthAnchor: Date;
  sessionsByDate: Record<string, Session[]>;
  selectedDate: string | null;
  onSelectDate: (iso: string) => void;
}) {
  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = getMonday(firstOfMonth);

  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(Date.UTC(gridStart.getUTCFullYear(), gridStart.getUTCMonth(), gridStart.getUTCDate() + i)));
  }

  const todayISO = toISODate(new Date());

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border">
        {DAYS.map((day) => (
          <div key={day} className="px-2 py-2.5 text-center">
            <p className="text-xs font-semibold text-muted">{DAY_LABELS_SHORT[day]}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const iso = toISODate(d);
          const inMonth = d.getUTCMonth() === month;
          const daySessions = sessionsByDate[iso] ?? [];
          const isToday = iso === todayISO;
          const isSelected = iso === selectedDate;
          const bookedCount = daySessions.filter((s) => s.isBookedByUser).length;

          return (
            <button
              key={iso}
              onClick={() => onSelectDate(iso)}
              className={`relative flex flex-col items-start gap-1 p-2 h-20 sm:h-24 border-b border-r border-border text-left transition-colors
                ${inMonth ? "bg-card" : "bg-muted/30"}
                ${isSelected ? "bg-[var(--primary)]/10 ring-2 ring-inset ring-[var(--primary)]/30" : "hover:bg-muted/50"}`}
            >
              <span
                className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full
                  ${isToday ? "bg-[var(--primary)] text-white" : inMonth ? "text-primary" : "text-muted"}`}
              >
                {d.getUTCDate()}
              </span>
              {daySessions.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {daySessions.slice(0, 3).map((s) => {
                    const color = ACTIVITY_COLORS[s.activity] ?? DEFAULT_COLOR;
                    return (
                      <span
                        key={s.id}
                        className={`w-1.5 h-1.5 rounded-full ${color.dot} ${s.isBookedByUser ? "ring-2 ring-[var(--primary)]/60 ring-offset-1" : ""}`}
                      />
                    );
                  })}
                  {daySessions.length > 3 && (
                    <span className="text-[10px] text-muted">+{daySessions.length - 3}</span>
                  )}
                </div>
              )}
              {/* "booked" indicator badge */}
              {bookedCount > 0 && (
                <span className="absolute bottom-1 right-1.5 text-[10px] font-bold text-[var(--primary)] bg-[var(--primary)]/10 rounded px-1">
                  {bookedCount}✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

type ViewMode = "week" | "month";

export default function SchedulePage() {
  const [view, setView] = useState<ViewMode>("week");
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => getMonday(new Date()));
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [weekData, setWeekData] = useState<ScheduleData | null>(null);
  const [monthSessionsByDate, setMonthSessionsByDate] = useState<Record<string, Session[]>>({});

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activityFilter, setActivityFilter] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
  }, []);

  const fetchWeek = useCallback(
    async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      else setIsRefreshing(true);
      try {
        const params = new URLSearchParams({ weekStart: toISODate(weekAnchor) });
        if (activityFilter) params.set("activity", activityFilter);
        const res = await fetch(`/api/dashboard/schedule?${params.toString()}`, {
          credentials: "include",
        });
        const json = await res.json();
        if (res.ok) setWeekData(json);
        else if (showLoading) showToast(json.error || "Erreur de chargement", "error");
      } catch {
        if (showLoading) showToast("Erreur serveur", "error");
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [weekAnchor, activityFilter, showToast]
  );

  const fetchMonth = useCallback(
    async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      else setIsRefreshing(true);
      try {
        const gridStart = getMonday(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1));
        const mondays: Date[] = [];
        for (let i = 0; i < 6; i++) {
          mondays.push(new Date(Date.UTC(gridStart.getUTCFullYear(), gridStart.getUTCMonth(), gridStart.getUTCDate() + i * 7)));
        }

        const results = await Promise.all(
          mondays.map((monday) => {
            const p = new URLSearchParams({ weekStart: toISODate(monday) });
            if (activityFilter) p.set("activity", activityFilter);
            return fetch(`/api/dashboard/schedule?${p.toString()}`, {
              credentials: "include",
            })
              .then((r) => r.json())
              .catch(() => ({ weeklyPlan: null, sessions: [] }));
          })
        );

        const byDate: Record<string, Session[]> = {};
        results.forEach((json: ScheduleData, idx) => {
          if (!json.weeklyPlan) return;
          for (const s of json.sessions) {
            const offset = DAY_INDEX[s.day] ?? 0;
            const m = mondays[idx];
            const d = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate() + offset));
            const iso = toISODate(d);
            if (!byDate[iso]) byDate[iso] = [];
            byDate[iso].push(s);
          }
        });
        for (const iso in byDate) {
          byDate[iso].sort((a, b) => (toMinutes(a.startTime) ?? 0) - (toMinutes(b.startTime) ?? 0));
        }
        setMonthSessionsByDate(byDate);
      } catch {
        if (showLoading) showToast("Erreur serveur", "error");
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [monthAnchor, activityFilter, showToast]
  );

  const fetchCurrent = useCallback(
    (showLoading: boolean) => {
      if (view === "week") fetchWeek(showLoading);
      else fetchMonth(showLoading);
    },
    [view, fetchWeek, fetchMonth]
  );

  useEffect(() => {
    fetchCurrent(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, weekAnchor, monthAnchor, activityFilter]);

  useEffect(() => {
    pollRef.current = setInterval(() => fetchCurrent(false), AUTO_REFRESH_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, weekAnchor, monthAnchor, activityFilter]);

  // Optimistic update helper — reflects booking state immediately in UI
  // so there's no visual lag between click and server response.
  const optimisticUpdate = useCallback((sessionId: string, booked: boolean) => {
    const patch = (s: Session): Session => {
      if (s.id !== sessionId) return s;
      const delta = booked ? 1 : -1;
      const newBookings = s.currentBookings + delta;
      return {
        ...s,
        isBookedByUser: booked,
        currentBookings: newBookings,
        isFull: newBookings >= s.capacity,
        spotsLeft: Math.max(0, s.capacity - newBookings),
      };
    };

    setWeekData((prev) =>
      prev ? { ...prev, sessions: prev.sessions.map(patch) } : prev
    );
    setMonthSessionsByDate((prev) => {
      const next: Record<string, Session[]> = {};
      for (const iso in prev) next[iso] = prev[iso].map(patch);
      return next;
    });
    setSelectedSession((prev) => (prev ? patch(prev) : null));
  }, []);

  const handleBook = async (sessionId: string) => {
    setPendingId(sessionId);
    optimisticUpdate(sessionId, true);
    try {
      const res = await fetch("/api/dashboard/schedule/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();
      if (res.ok) {
        showToast("Session réservée !", "success");
        // Revert optimistic update with real data from server
        fetchCurrent(false);
      } else {
        // Roll back optimistic update on error
        optimisticUpdate(sessionId, false);
        showToast(json.error || "Erreur de réservation", "error");
      }
    } catch {
      optimisticUpdate(sessionId, false);
      showToast("Erreur serveur", "error");
    } finally {
      setPendingId(null);
    }
  };

  const handleCancel = async (sessionId: string) => {
    setPendingId(sessionId);
    optimisticUpdate(sessionId, false);
    try {
      const res = await fetch("/api/dashboard/schedule/book", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();
      if (res.ok) {
        showToast("Réservation annulée", "success");
        fetchCurrent(false);
      } else {
        optimisticUpdate(sessionId, true);
        showToast(json.error || "Erreur d'annulation", "error");
      }
    } catch {
      optimisticUpdate(sessionId, true);
      showToast("Erreur serveur", "error");
    } finally {
      setPendingId(null);
    }
  };

  const goToday = () => {
    setWeekAnchor(getMonday(new Date()));
    setMonthAnchor(new Date());
    setSelectedDate(toISODate(new Date()));
  };

  const weekLabel = useMemo(() => {
    const end = new Date(Date.UTC(weekAnchor.getUTCFullYear(), weekAnchor.getUTCMonth(), weekAnchor.getUTCDate() + 6));
    const s = weekAnchor.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
    const e = end.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    return `${s} – ${e}`;
  }, [weekAnchor]);

  const monthLabel = useMemo(
    () => monthAnchor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
    [monthAnchor]
  );

  const selectedDaySessions = selectedDate ? monthSessionsByDate[selectedDate] ?? [] : [];

  // Summary stats for the current week view
  const weekStats = useMemo(() => {
    if (!weekData?.sessions) return null;
    const booked = weekData.sessions.filter((s) => s.isBookedByUser).length;
    const available = weekData.sessions.filter((s) => !s.isFull && !s.isBookedByUser).length;
    return { booked, available, total: weekData.sessions.length };
  }, [weekData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={44} className="animate-spin text-[var(--primary)]" />
          <p className="text-sm text-muted">Chargement du planning...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-primary">Planning</h1>
          <p className="mt-1 text-muted">Réservez vos prochaines sessions.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Week / Month toggle */}
          <div className="flex items-center bg-muted rounded-xl p-1">
            <button
              onClick={() => setView("week")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${view === "week" ? "bg-card text-primary shadow-sm" : "text-muted hover:text-primary"}`}
            >
              <CalendarDays size={14} />
              Semaine
            </button>
            <button
              onClick={() => setView("month")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${view === "month" ? "bg-card text-primary shadow-sm" : "text-muted hover:text-primary"}`}
            >
              <CalendarIcon size={14} />
              Mois
            </button>
          </div>
          <button
            onClick={goToday}
            className="px-3 py-2 rounded-xl bg-muted hover:bg-muted/70 transition-colors text-xs font-medium text-primary"
          >
            Aujourd&apos;hui
          </button>
          <button
            onClick={() => fetchCurrent(false)}
            disabled={isRefreshing}
            className="p-2.5 rounded-xl bg-muted hover:bg-muted/70 transition-colors disabled:opacity-50"
            title="Actualiser"
          >
            {isRefreshing ? (
              <Loader2 size={16} className="animate-spin text-muted" />
            ) : (
              <RefreshCw size={16} className="text-muted" />
            )}
          </button>
        </div>
      </div>

      {/* Week stats bar */}
      {view === "week" && weekStats && weekStats.total > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3.5 py-2 bg-[var(--primary)]/10 rounded-xl">
            <BookCheck size={13} className="text-[var(--primary)]" />
            <span className="text-xs font-semibold text-[var(--primary)]">
              {weekStats.booked} réservée{weekStats.booked > 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-2 bg-emerald-500/10 rounded-xl">
            <Zap size={13} className="text-emerald-500" />
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {weekStats.available} disponible{weekStats.available > 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-2 bg-muted rounded-xl">
            <CalendarDays size={13} className="text-muted" />
            <span className="text-xs font-semibold text-muted">
              {weekStats.total} session{weekStats.total > 1 ? "s" : ""} cette semaine
            </span>
          </div>
        </div>
      )}

      {/* Activity filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          onClick={() => setActivityFilter(null)}
          className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors
            ${!activityFilter ? "bg-[var(--primary)] text-white" : "bg-muted text-muted hover:bg-muted/70"}`}
        >
          Toutes
        </button>
        {ACTIVITIES.map((a) => (
          <button
            key={a}
            onClick={() => setActivityFilter(a)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors
              ${activityFilter === a ? "bg-[var(--primary)] text-white" : "bg-muted text-muted hover:bg-muted/70"}`}
          >
            {ACTIVITY_LABELS[a]}
          </button>
        ))}
      </div>

      {/* Period navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            if (view === "week") {
              setWeekAnchor(new Date(Date.UTC(weekAnchor.getUTCFullYear(), weekAnchor.getUTCMonth(), weekAnchor.getUTCDate() - 7)));
            } else {
              const d = new Date(monthAnchor);
              d.setMonth(d.getMonth() - 1);
              setMonthAnchor(d);
              setSelectedDate(null);
            }
          }}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-semibold text-primary capitalize">
          {view === "week" ? `Semaine du ${weekLabel}` : monthLabel}
        </p>
        <button
          onClick={() => {
            if (view === "week") {
              setWeekAnchor(new Date(Date.UTC(weekAnchor.getUTCFullYear(), weekAnchor.getUTCMonth(), weekAnchor.getUTCDate() + 7)));
            } else {
              const d = new Date(monthAnchor);
              d.setMonth(d.getMonth() + 1);
              setMonthAnchor(d);
              setSelectedDate(null);
            }
          }}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Main content */}
      {view === "week" ? (
        !weekData?.weeklyPlan ? (
          <div className="bg-card border border-border rounded-2xl flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <CalendarX size={28} className="text-muted" />
            </div>
            <div className="text-center">
              <p className="text-primary font-semibold">Aucun planning pour cette semaine</p>
              <p className="text-sm text-muted mt-1">Essayez une autre semaine ou revenez plus tard.</p>
            </div>
          </div>
        ) : (
          <WeekGrid sessions={weekData.sessions} onSelect={setSelectedSession} />
        )
      ) : (
        <div className="space-y-4">
          <MonthGrid
            monthAnchor={monthAnchor}
            sessionsByDate={monthSessionsByDate}
            selectedDate={selectedDate}
            onSelectDate={(iso) => setSelectedDate((cur) => (cur === iso ? null : iso))}
          />

          {selectedDate && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <p className="text-sm font-semibold text-primary mb-3 capitalize">
                {new Date(selectedDate + "T12:00:00").toLocaleDateString("fr-FR", {
                  weekday: "long", day: "numeric", month: "long",
                })}
              </p>
              {selectedDaySessions.length === 0 ? (
                <div className="flex items-center gap-3 text-sm text-muted py-4">
                  <CalendarX size={16} />
                  Aucune session ce jour-là.
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedDaySessions.map((s) => (
                    <SessionCard
                      key={s.id}
                      session={s}
                      onBook={handleBook}
                      onCancel={handleCancel}
                      pending={pendingId === s.id}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Session detail modal (week-view click) */}
      {selectedSession && (
        <SessionModal
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
          onBook={handleBook}
          onCancel={handleCancel}
          pending={pendingId === selectedSession.id}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}