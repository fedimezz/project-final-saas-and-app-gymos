"use client";

interface Activity {
  id: string;
  user: string;
  action: string;
  time: string;
  avatar: string;
}

const activities: Activity[] = [
  { id: "1", user: "Sarah Johnson", action: "Joined Yoga Class", time: "5 minutes ago", avatar: "SJ" },
  { id: "2", user: "Mike Chen", action: "Completed 100 workouts", time: "1 hour ago", avatar: "MC" },
  { id: "3", user: "Emma Williams", action: "Upgraded to Premium", time: "3 hours ago", avatar: "EW" },
  { id: "4", user: "David Brown", action: "Set new personal record", time: "5 hours ago", avatar: "DB" },
];

export default function RecentActivity() {
  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-primary mb-4">Recent Activity</h3>
      <div className="space-y-4">
        {activities.map((activity) => (
          <div
            key={activity.id}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
          >
            <div className="h-10 w-10 rounded-full bg-primary-light/10 flex items-center justify-center text-primary-light font-semibold">
              {activity.avatar}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-primary">
                {activity.user}
              </p>
              <p className="text-xs text-secondary">
                {activity.action}
              </p>
            </div>
            <p className="text-xs text-secondary">{activity.time}</p>
          </div>
        ))}
      </div>
    </div>
  );
}