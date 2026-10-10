// Calendar-date helpers for the weekly schedule. Everything works in the
// device's LOCAL calendar: the backend stores each plan under its Monday and
// each session as (day-of-week, "HH:mm") with no absolute date, so a session's
// real date is always `monday + dayIndex`. No Intl / toLocaleDateString on
// purpose — French names are static tables, so output is identical on every
// device and JS engine.
import type { DayOfWeek } from "@/api/types";

export const DAYS: DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

export const DAY_LABELS_SHORT: Record<DayOfWeek, string> = {
  MONDAY: "Lun",
  TUESDAY: "Mar",
  WEDNESDAY: "Mer",
  THURSDAY: "Jeu",
  FRIDAY: "Ven",
  SATURDAY: "Sam",
  SUNDAY: "Dim",
};

export const DAY_LABELS_FULL: Record<DayOfWeek, string> = {
  MONDAY: "Lundi",
  TUESDAY: "Mardi",
  WEDNESDAY: "Mercredi",
  THURSDAY: "Jeudi",
  FRIDAY: "Vendredi",
  SATURDAY: "Samedi",
  SUNDAY: "Dimanche",
};

const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MONTHS_LONG = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" of a LOCAL date. Never `toISOString()` — that converts to UTC and can shift the day. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** The Monday (00:00 local) of the week containing `d` — weeks run Monday→Sunday, like the backend. */
export function mondayOf(d: Date): Date {
  const jsDay = d.getDay(); // 0 = Sunday
  return addDays(startOfDay(d), jsDay === 0 ? -6 : 1 - jsDay);
}

/** JS getDay() (0 = Sunday) → the backend's DayOfWeek. */
export function dayOfWeekOf(d: Date): DayOfWeek {
  return DAYS[(d.getDay() + 6) % 7];
}

/** The calendar date of `day` inside the week that starts on `weekMonday`. */
export function dateOfDay(weekMonday: Date, day: DayOfWeek): Date {
  return addDays(weekMonday, DAYS.indexOf(day));
}

/** "22 – 28 sept." or "29 sept. – 5 oct." */
export function formatWeekRange(monday: Date): string {
  const end = addDays(monday, 6);
  if (monday.getMonth() === end.getMonth()) {
    return `${monday.getDate()} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`;
  }
  return `${monday.getDate()} ${MONTHS_SHORT[monday.getMonth()]} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`;
}

/** "Lundi 22 septembre" */
export function formatDayLong(d: Date): string {
  return `${DAY_LABELS_FULL[dayOfWeekOf(d)]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

/** "12 sept. 2026" */
export function formatDateShort(d: Date): string {
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** Local Date at which a session starts, given its plan's Monday. `time` is "HH:mm". */
export function sessionStart(weekMonday: Date, day: DayOfWeek, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const date = dateOfDay(weekMonday, day);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h || 0, m || 0);
}

/** "1 place" / "3 places" */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

/** "En cours" / "Dans 25 min" / "Dans 2 h 05" / "Demain à 18:00" / "Jeudi à 18:00" — for a session starting at `start` and ending at `end`. */
export function whenLabel(start: Date, end: Date, now: Date, startTime: string): string {
  if (now >= start && now < end) return "En cours";
  const minutes = Math.max(0, Math.ceil((start.getTime() - now.getTime()) / 60000));
  if (isSameDay(start, now)) {
    if (minutes < 60) return `Dans ${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `Dans ${h} h` : `Dans ${h} h ${pad(m)}`;
  }
  if (isSameDay(start, addDays(now, 1))) return `Demain à ${startTime}`;
  return `${DAY_LABELS_FULL[dayOfWeekOf(start)]} à ${startTime}`;
}

/** "À l'instant" / "Il y a 5 min" / "Il y a 3 h" / "Hier" / "Il y a 4 j" / "12 sept. 2026" */
export function timeAgo(date: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86400000);
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days} j`;
  return formatDateShort(date);
}

/** A backend date ("2026-09-28" or "2026-09-28T00:00:00.000Z") as a LOCAL calendar date — never shifted by the timezone. */
export function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
