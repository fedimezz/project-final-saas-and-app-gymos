import type { NavigatorScreenParams } from "@react-navigation/native";

// Param lists for every navigator. A screen that needs data to render gets
// it through its route params here (typed), never through module-level state.
export type RootStackParamList = {
  // Signed out
  MyClubs: undefined;
  ClubSearch: undefined;
  Login: { email?: string; notice?: string } | undefined;
  Register: undefined;
  VerifyEmail: { email: string; fromRegister?: boolean };
  ForgotPassword: { email?: string } | undefined;
  ResetPassword: { email?: string } | undefined;
  // Signed in — exactly one of these is mounted, chosen by `user.role`
  MemberTabs: NavigatorScreenParams<MemberTabParamList> | undefined;
  CoachTabs: NavigatorScreenParams<CoachTabParamList> | undefined;
  UnsupportedRole: undefined;
  // Member: pushed over the tabs (reached from Home and Profile)
  Membership: undefined;
  // Coach only: one session's booked members + attendance
  CoachRoster: { sessionId: string };
};

// Member: Accueil / Planning / Réservations / Notifications / Profil
export type MemberTabParamList = {
  Home: undefined;
  Schedule: undefined;
  Bookings: undefined;
  Notifications: undefined;
  Profile: undefined;
};

// Coach: Accueil / Planning / Mes séances / Notifications / Profil
export type CoachTabParamList = {
  Today: undefined;
  CoachPlanning: undefined;
  CoachSessions: undefined;
  CoachNotifications: undefined;
  CoachProfile: undefined;
};
