"use client";

import { useEffect, useState } from "react";

interface PublicSession {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  activity: string;
  coach: string;
  location: string;
}

// Monday → Sunday, so the weekend is always part of the week.
const DAYS: { key: string; label: string; weekend?: boolean }[] = [
  { key: "MONDAY", label: "Lundi" },
  { key: "TUESDAY", label: "Mardi" },
  { key: "WEDNESDAY", label: "Mercredi" },
  { key: "THURSDAY", label: "Jeudi" },
  { key: "FRIDAY", label: "Vendredi" },
  { key: "SATURDAY", label: "Samedi", weekend: true },
  { key: "SUNDAY", label: "Dimanche", weekend: true },
];

const ACTIVITY_LABELS: Record<string, string> = {
  BODYBUILDING: "Musculation", FITNESS: "Fitness", CARDIO: "Cardio",
  CROSSFIT: "CrossFit", YOGA: "Yoga", PILATES: "Pilates",
  BOXE: "Boxe", MMA: "MMA", AQUAGYM: "Aquagym",
  PADEL: "Padel", ZUMBA: "Zumba", SPINNING: "Spinning",
};

// Real sessions from the club's active weekly plan. Empty by default: nothing
// is rendered until the owner has published a plan.
export default function CalendarPreview() {
  const [sessions, setSessions] = useState<PublicSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/schedule/public", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      } catch {
        // section simply stays hidden
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || sessions.length === 0) return null;

  // Only show days that actually have sessions (weekend included when used).
  const days = DAYS.map((d) => ({
    ...d,
    items: sessions
      .filter((s) => s.day === d.key)
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
  })).filter((d) => d.items.length > 0);

  return (
    <section className="theme-section-alt py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center">
          <h2 className="theme-heading text-4xl md:text-5xl text-[var(--text-primary)]">
            Planning de la semaine
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400">
            Nos séances, du lundi au dimanche.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {days.map((day) => (
            <div
              key={day.key}
              className={`theme-card p-6 border transition-colors ${
                day.weekend
                  ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/30"
                  : "bg-white dark:bg-neutral-900 border-transparent dark:border-neutral-800/60 shadow-sm dark:shadow-none"
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-[var(--text-primary)]">{day.label}</h3>
                {day.weekend && (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    Week-end
                  </span>
                )}
              </div>

              <ul className="mt-4 space-y-3">
                {day.items.map((s) => (
                  <li key={s.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 dark:text-gray-100 truncate">
                        {ACTIVITY_LABELS[s.activity] ?? s.activity}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {s.coach}
                        {s.location ? ` · ${s.location}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--brand)] px-3 py-1 text-xs font-bold text-[var(--brand-contrast)]">
                      {s.startTime}–{s.endTime}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
