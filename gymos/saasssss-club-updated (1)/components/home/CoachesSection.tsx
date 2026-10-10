"use client";

import { useState, useEffect } from "react";
import { Dumbbell } from "lucide-react";
import Image from "next/image";

interface RealCoach {
  id: string;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  specialties: string[];
  activities: string[];
}

const ACTIVITY_LABELS: Record<string, string> = {
  BODYBUILDING: "Musculation", FITNESS: "Fitness", CARDIO: "Cardio",
  CROSSFIT: "CrossFit", YOGA: "Yoga", PILATES: "Pilates",
  BOXE: "Boxe", MMA: "MMA", AQUAGYM: "Aquagym",
  PADEL: "Padel", ZUMBA: "Zumba", SPINNING: "Spinning",
};

// Was 3 hardcoded fake coaches (name/photo/speciality baked into the
// component). Now pulled from the real Coach model so it always reflects
// who's actually on staff.
export default function CoachesSection() {
  const [coaches, setCoaches] = useState<RealCoach[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/coaches/public");
        const data = await res.json();
        if (!cancelled) setCoaches(Array.isArray(data.coaches) ? data.coaches.slice(0, 3) : []);
      } catch {
        // section just won't render below
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // No coaches configured yet, or still loading — don't show an empty/fake section.
  if (loading || coaches.length === 0) return null;

  return (
    <section className="theme-section py-24">
      <div className="container mx-auto px-4">
        <div className="mb-14 text-center">
          <h2 className="theme-heading text-4xl text-[var(--text-primary)]">
            Nos Coachs
          </h2>

          <p className="mt-4 text-gray-500 dark:text-gray-400 transition-colors duration-300">
            Une équipe expérimentée pour vous accompagner.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {coaches.map((coach) => (
            <div
              key={coach.id}
              className="
                overflow-hidden
                theme-card
                bg-white
                dark:bg-neutral-900
                border
                border-transparent
                dark:border-neutral-800/60
                shadow-lg
                dark:shadow-none
                transition-all
                duration-300
                hover:-translate-y-2
              "
            >
              <div className="relative h-80 bg-gray-200 dark:bg-neutral-800 transition-colors duration-300 flex items-center justify-center">
                {coach.photoUrl ? (
                  <Image
                    src={coach.photoUrl}
                    alt={coach.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                  />
                ) : (
                  <Dumbbell size={40} className="text-gray-400 dark:text-neutral-700" />
                )}
              </div>

              <div className="p-6">
                <h3 className="text-xl font-bold text-[var(--text-primary)]">
                  {coach.name}
                </h3>

                {(coach.specialties.length > 0 || coach.activities.length > 0) && (
                  <p className="mt-2 text-gray-500 dark:text-gray-400 transition-colors duration-300">
                    {coach.specialties.length > 0
                      ? coach.specialties.join(" · ")
                      : coach.activities.map((a) => ACTIVITY_LABELS[a] ?? a).join(" · ")}
                  </p>
                )}

                <a
                  href="/coaching"
                  className="
                    inline-block
                    mt-5
                    rounded-xl
                    bg-[var(--site-deep)]
                    hover:bg-[var(--site-deep-hover)]
                    dark:bg-[var(--site-deep-hover)]
                    dark:hover:bg-[var(--site-deep)]
                    px-5
                    py-3
                    text-white
                    font-medium
                    transition-colors
                    duration-300
                  "
                >
                  Voir Profil
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
