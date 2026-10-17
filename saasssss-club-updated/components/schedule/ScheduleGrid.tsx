"use client";

import SessionCard, { type ScheduleSession } from "./SessionCard";

const DAYS_ORDER = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

const DAY_LABELS: Record<string, string> = {
  MONDAY: "Lundi",
  TUESDAY: "Mardi",
  WEDNESDAY: "Mercredi",
  THURSDAY: "Jeudi",
  FRIDAY: "Vendredi",
  SATURDAY: "Samedi",
  SUNDAY: "Dimanche",
};

interface Props {
  sessions: ScheduleSession[];
  onSelectSession: (session: ScheduleSession) => void;
}

export default function ScheduleGrid({ sessions, onSelectSession }: Props) {
  const sessionsByDay = DAYS_ORDER.reduce<Record<string, ScheduleSession[]>>((acc, day) => {
    acc[day] = sessions.filter((s) => s.day === day);
    return acc;
  }, {});

  const today = new Date()
    .toLocaleDateString("en-US", { weekday: "long" })
    .toUpperCase();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-4">
      {DAYS_ORDER.map((day) => {
        const daySessions = sessionsByDay[day];
        const isToday = day === today;

        return (
          <div
            key={day}
            className={`bg-card border rounded-2xl p-4 min-h-[200px] flex flex-col ${
              isToday ? "border-primary/40 ring-1 ring-primary/20" : "border-border"
            }`}
          >
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <h3 className="font-semibold text-primary text-sm">{DAY_LABELS[day]}</h3>
              {isToday && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--primary)] text-white">
                  Aujourd&apos;hui
                </span>
              )}
            </div>

            <div className="space-y-2.5 flex-1">
              {daySessions.length === 0 ? (
                <p className="text-xs text-muted text-center py-6">Aucune session</p>
              ) : (
                daySessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    onClick={() => onSelectSession(session)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}