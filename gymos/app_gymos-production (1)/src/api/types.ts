// Mirrors the backend's actual response shapes (see the corresponding
// route.ts files in the web repo) — kept minimal, extend as screens need
// more fields rather than guessing a full shape up front.

export type Role = "MEMBER" | "COACH" | "ADMIN" | "OWNER";
// Note: SUPER_ADMIN deliberately excluded — the mobile app is scoped to
// members and coaches only (owner/admin stays on the web dashboard).

export type ClubSearchResult = ClubRef;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  // Informational only. The app NEVER sends a clubId anywhere: the backend
  // derives the club from the host + the signed token on every request.
  clubId?: string | null;
}

export interface LoginResponse {
  message: string;
  user: SessionUser & { phone: string | null; avatar: string | null };
  token: string; // present because we always send the mobile client header
}

export interface ApiErrorBody {
  error: string;
  requiresVerification?: boolean;
  email?: string;
  retryAfterSeconds?: number; // resend-code 429
}

/** A club the app can point at. `apiBaseUrl` is where its API lives (per-club subdomain). */
export interface ClubRef {
  slug: string;
  name: string;
  logoUrl: string | null;
  apiBaseUrl: string;
}

// ── Auth flows ───────────────────────────────────────────────────────────────
export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}
export interface RegisterResponse {
  message: string;
  requiresVerification: boolean;
  email: string;
}
export interface VerifyEmailResponse {
  message: string;
  loggedIn: boolean; // web-only convenience (sets a cookie); the app signs in with login() afterwards
}
export interface ResendCodeResponse {
  message: string;
  cooldownSeconds?: number;
}

// ── Bookings (GET /api/bookings) ─────────────────────────────────────────────
export interface BookingItem {
  id: string;
  sessionId: string;
  bookedAt: string;
  cancelledAt: string | null;
  isCancelled: boolean;
  session: {
    id: string;
    day: DayOfWeek;
    startTime: string;
    endTime: string;
    activity: ActivityType;
    coach: string;
    location: string;
  };
  weeklyPlan: { weekStart: string; weekEnd: string; isArchived: boolean };
}
export interface BookingsResponse {
  upcoming: BookingItem[];
  past: BookingItem[];
  cancelled: BookingItem[];
}

// ── Schedule / bookings ─────────────────────────────────────────────────────
export type DayOfWeek = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
export type ActivityType =
  | "BODYBUILDING" | "FITNESS" | "CARDIO" | "CROSSFIT" | "YOGA" | "PILATES"
  | "BOXE" | "MMA" | "AQUAGYM" | "PADEL" | "ZUMBA" | "SPINNING";

export interface WeeklyPlanInfo {
  id: string;
  weekStart: string;
  weekEnd: string;
}

export interface ScheduleSession {
  id: string;
  weeklyPlanId: string;
  day: DayOfWeek;
  startTime: string; // "HH:mm"
  endTime: string;
  activity: ActivityType;
  coach: string;
  coachId: string | null;
  capacity: number;
  currentBookings: number;
  description: string | null;
  location: string;
  isBookedByUser: boolean;
  isFull: boolean;
  spotsLeft: number;
}

export interface ScheduleResponse {
  weeklyPlan: WeeklyPlanInfo | null;
  sessions: ScheduleSession[];
}

// ── Membership ───────────────────────────────────────────────────────────────
export interface MembershipCard {
  cardNumber: string;
  isActive: boolean;
  expiresAt: string | null;
}

export interface SubscriptionPayment {
  status: "PENDING" | "PAID" | "FAILED";
  paymentMethod: "ONLINE" | "ONSITE";
  amount?: number;
  currency?: string;
  paidAt?: string | null;
}

export type SubscriptionStatus = "ACTIVE" | "PENDING" | "EXPIRED" | "CANCELLED" | "SUSPENDED";

export interface MembershipSubscription {
  id: string;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  plan: { id: string; name: string; price: number; currency: string };
  payments: SubscriptionPayment[];
}

export interface MembershipPlan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  durationDays: number;
  features: string[];
}

// The backend selects only { name, price } for past subscriptions' plan
// (app/api/dashboard/membership/route.ts) — no plan id, unlike the current one.
export type PastSubscription = Omit<MembershipSubscription, "plan"> & { plan: { name: string; price: number; currency: string } };

export interface MembershipResponse {
  card: MembershipCard | null;
  activeSubscription: MembershipSubscription | null;
  plans: MembershipPlan[];
  history: PastSubscription[];
}

// ── Notifications ────────────────────────────────────────────────────────────
export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  sentAt: string; // the Notification model has sentAt/readAt — there is no createdAt
  readAt: string | null;
  data?: Record<string, unknown> | null;
}

export interface NotificationsResponse {
  notifications: AppNotification[];
  unreadCount: number;
}

// ── Profile ──────────────────────────────────────────────────────────────────
export interface FullProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  role: Role;
  createdAt?: string;
  // GET only — the PUT response's `user` doesn't include it
  _count?: { attendances: number; userSessions: number };
}

// ── Coach ────────────────────────────────────────────────────────────────────
export interface CoachSession {
  id: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  activity: ActivityType;
  location: string;
  capacity: number;
  currentBookings: number;
}

export interface CoachSessionsResponse {
  coach: { id: string; name: string };
  sessions: CoachSession[];
}

export interface RosterMember {
  userId: string;
  name: string;
  avatar: string | null;
  checkedIn: boolean;
}

export interface RosterResponse {
  session: { id: string; activity: ActivityType; day: DayOfWeek; startTime: string };
  roster: RosterMember[];
}

export interface CoachStats {
  coachId: string;
  coachName: string;
  totalSessions: number;
  totalBookings: number;
  totalAttendances: number;
  fillRate: number;
}

// ── Posts / actualités ───────────────────────────────────────────────────────
// Mirrors the Post model + what GET /api/posts includes. Media is
// mediaUrl + mediaType (there is no imageUrl); title is optional.
export interface Post {
  id: string;
  title: string | null;
  content: string;
  mediaUrl: string | null;
  mediaType: "image" | "video" | "audio" | null;
  musicUrl: string | null;
  createdAt: string;
  author: { id: string; name: string; avatar: string | null };
  likes: { userId: string }[];
  comments: PostComment[];
}

export interface PostComment {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string; avatar: string | null };
}


// ── Member dashboard (GET /api/dashboard) ────────────────────────────────────
export interface MemberDashboard {
  userName: string;
  stats: {
    totalBookings: number;
    completedAttendances: number;
    membershipStatus: "Active" | "Inactive"; // computed by the server from the subscription's end date
    daysUntilExpiry: number | null;
    planName: string | null;
  };
  upcomingSession: {
    activity: ActivityType;
    day: DayOfWeek;
    startTime: string;
    endTime: string;
    coach: string;
    location: string;
  } | null;
  weeklyActivity: number[]; // Mon..Sun, 0-100 (relative to the busiest day)
  recentAttendances: { id: string; activity: ActivityType | null; checkInTime: string }[];
}
