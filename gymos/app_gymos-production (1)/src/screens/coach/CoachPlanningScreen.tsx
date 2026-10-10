import ScheduleScreen from "@/screens/member/ScheduleScreen";

/** The club's weekly planning, read-only (coaches don't book sessions). */
export default function CoachPlanningScreen() {
  return <ScheduleScreen readOnly />;
}
