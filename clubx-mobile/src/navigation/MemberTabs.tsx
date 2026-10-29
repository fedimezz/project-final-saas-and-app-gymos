import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useTheme } from "@/theme/ThemeContext";
import { baseTabOptions, tabIcon } from "@/navigation/tabOptions";
import type { MemberTabParamList } from "@/navigation/types";
import { UnreadProvider, useUnread } from "@/notifications/UnreadContext";
import HomeScreen from "@/screens/member/HomeScreen";
import ScheduleScreen from "@/screens/member/ScheduleScreen";
import BookingsScreen from "@/screens/member/BookingsScreen";
import NotificationsScreen from "@/screens/shared/NotificationsScreen";
import ProfileScreen from "@/screens/shared/ProfileScreen";

const Tab = createBottomTabNavigator<MemberTabParamList>();

function Tabs() {
  const { colors } = useTheme();
  const { unread, refresh } = useUnread();
  return (
    <Tab.Navigator screenOptions={baseTabOptions(colors)} screenListeners={{ focus: () => refresh() }}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: "Accueil", headerShown: false, tabBarIcon: tabIcon("home", "home-outline") }} />
      <Tab.Screen name="Schedule" component={ScheduleScreen} options={{ title: "Planning", tabBarIcon: tabIcon("calendar", "calendar-outline") }} />
      <Tab.Screen name="Bookings" component={BookingsScreen} options={{ title: "Réservations", tabBarIcon: tabIcon("ticket", "ticket-outline") }} />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: "Notifications", tabBarIcon: tabIcon("notifications", "notifications-outline"), tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: "Profil", tabBarIcon: tabIcon("person", "person-outline") }} />
    </Tab.Navigator>
  );
}

export default function MemberTabs() {
  return (
    <UnreadProvider>
      <Tabs />
    </UnreadProvider>
  );
}
