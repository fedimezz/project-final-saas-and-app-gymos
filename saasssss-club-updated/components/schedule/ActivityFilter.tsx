"use client";

import {  } from "lucide-react";

export const ACTIVITY_LABELS: Record<string, string> = {
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

const ACTIVITIES = Object.keys(ACTIVITY_LABELS);

interface Props {
  selected: string | null;
  onSelect: (activity: string | null) => void;
}

export default function ActivityFilter({ selected, onSelect }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
      <button
        onClick={() => onSelect(null)}
        className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
          selected === null
            ? "bg-[var(--primary)] text-white shadow-sm"
            : "bg-muted text-muted hover:bg-muted/70"
        }`}
      >
        Toutes
      </button>
      {ACTIVITIES.map((activity) => (
        <button
          key={activity}
          onClick={() => onSelect(activity)}
          className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
            selected === activity
              ? "bg-[var(--primary)] text-white shadow-sm"
              : "bg-muted text-muted hover:bg-muted/70"
          }`}
        >
          {ACTIVITY_LABELS[activity]}
        </button>
      ))}
    </div>
  );
}