import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";
import type { ActivityType } from "@/api/types";

export type IconName = ComponentProps<typeof Ionicons>["name"];

// One recognisable icon per activity, so the planning can be scanned at a glance.
export const ACTIVITY_ICONS: Record<ActivityType, IconName> = {
  BODYBUILDING: "barbell-outline",
  FITNESS: "fitness-outline",
  CARDIO: "pulse-outline",
  CROSSFIT: "flame-outline",
  YOGA: "flower-outline",
  PILATES: "body-outline",
  BOXE: "hand-left-outline",
  MMA: "flash-outline",
  AQUAGYM: "water-outline",
  PADEL: "tennisball-outline",
  ZUMBA: "musical-notes-outline",
  SPINNING: "bicycle-outline",
};

/** Falls back to a dumbbell if the backend ever adds an activity this build doesn't know. */
export const activityIcon = (activity: ActivityType): IconName => ACTIVITY_ICONS[activity] ?? "barbell-outline";
