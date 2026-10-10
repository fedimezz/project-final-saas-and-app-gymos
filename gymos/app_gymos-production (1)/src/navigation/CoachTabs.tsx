import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useTheme } from "@/theme/ThemeContext";
import { baseTabOptions, tabIcon } from "@/navigation/tabOptions";
import type { CoachTabParamList } from "@/navigation/types";
import { UnreadProvider, useUnread } from "@/notifications/UnreadContext";
import CoachProfileScreen from "@/screens/coach/CoachProfileScreen";
import CoachTodayScreen from "@/screens/coach/CoachTodayScreen";
import CoachScheduleScreen from "@/screens/coach/CoachScheduleScreen";
import CoachPlanningScreen from "@/screens/coach/CoachPlanningScreen";
import NotificationsScreen from "@/screens/shared/NotificationsScreen";

const Tab = createBottomTabNavigator<CoachTabParamList>();

function Tabs() {
  const { colors } = useTheme();
  const { unread, refresh } = useUnread();
  return (
    <Tab.Navigator screenOptions={baseTabOptions(colors)} screenListeners={{ focus: () => refresh() }}>
      <Tab.Screen name="Today" component={CoachTodayScreen} options={{ title: "Accueil", headerShown: false, tabBarIcon: tabIcon("home", "home-outline") }} />
      <Tab.Screen name="CoachPlanning" component={CoachPlanningScreen} options={{ title: "Planning", tabBarIcon: tabIcon("calendar", "calendar-outline") }} />
      <Tab.Screen name="CoachSessions" component={CoachScheduleScreen} options={{ title: "Mes séances", tabBarIcon: tabIcon("barbell", "barbell-outline") }} />
      <Tab.Screen
        name="CoachNotifications"
        component={NotificationsScreen}
        options={{ title: "Notifications", tabBarIcon: tabIcon("notifications", "notifications-outline"), tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined }}
      />
      <Tab.Screen name="CoachProfile" component={CoachProfileScreen} options={{ title: "Profil", tabBarIcon: tabIcon("person", "person-outline") }} />
    </Tab.Navigator>
  );
}

export default function CoachTabs() {
  return (
    <UnreadProvider>
      <Tabs />
    </UnreadProvider>
  );
}
