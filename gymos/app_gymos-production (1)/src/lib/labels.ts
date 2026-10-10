import type { ActivityType } from "@/api/types";

// Same French labels the web dashboard uses (app/dashboard/schedule/page.tsx).
export const ACTIVITY_LABELS: Record<ActivityType, string> = {
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

/** Falls back to the raw enum value if the backend ever adds an activity this build doesn't know. */
export const activityLabel = (activity: ActivityType): string => ACTIVITY_LABELS[activity] ?? activity;
