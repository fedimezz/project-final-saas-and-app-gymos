import { CalendarX } from "lucide-react";

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

interface Props {
  session: {
    activity: string;
    day: string;
    startTime: string;
    endTime: string;
    coach: string;
    location: string;
  } | null;
}

export default function UpcomingSession({ session }: Props) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <h2 className="text-xl font-bold text-primary mb-4">Prochaine session</h2>

      {session ? (
        <div className="space-y-2">
          <h3 className="font-semibold text-primary">
            {ACTIVITY_LABELS[session.activity] ?? session.activity}
          </h3>
          <p className="text-muted">
            {DAY_LABELS[session.day] ?? session.day} • {session.startTime} – {session.endTime}
          </p>
          <p className="text-muted">Coach {session.coach}</p>
          <p className="text-muted text-sm">{session.location}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center py-6 gap-3">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <CalendarX size={22} className="text-muted" />
          </div>
          <p className="text-sm text-muted">Aucune session à venir.</p>
          <a
            href="/dashboard/schedule"
            className="text-sm text-[var(--primary)] hover:underline font-medium"
          >
            Voir le planning →
          </a>
        </div>
      )}
    </div>
  );
}