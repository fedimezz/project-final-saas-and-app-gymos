// src/lib/navigation.ts
import {
  LayoutDashboard,
  User,
  CalendarDays,
  BookOpen,
  CreditCard,
  Bell,
  Settings,
  Palette,
  type LucideIcon,
} from "lucide-react";

export interface NavLink {
  name: string;
  href: string;
  icon: LucideIcon;
}

// Single source of truth for dashboard navigation.
// Used by both DashboardSidebar (desktop) and DashboardHeader (mobile menu)
export const dashboardLinks: NavLink[] = [
  { name: "Tableau de bord", href: "/dashboard", icon: LayoutDashboard },
  { name: "Profil", href: "/dashboard/profile", icon: User },
  { name: "Planning", href: "/dashboard/schedule", icon: CalendarDays },
  { name: "Réservations", href: "/dashboard/bookings", icon: BookOpen },
  { name: "Adhésion", href: "/dashboard/membership", icon: CreditCard },
  { name: "Notifications", href: "/dashboard/notifications", icon: Bell },
  { name: "Paramètres", href: "/dashboard/settings", icon: Settings },

];

// Coach navigation — a coach is not staff (no /admin access), just a
// member-side account with a dedicated "my schedule" home instead of the
// generic member dashboard.
export const coachLinks: NavLink[] = [
  { name: "Mon planning", href: "/dashboard/coach", icon: LayoutDashboard },
  { name: "Profil", href: "/dashboard/profile", icon: User },
  { name: "Notifications", href: "/dashboard/notifications", icon: Bell },
  { name: "Paramètres", href: "/dashboard/settings", icon: Settings },
];

// Admin navigation links — kept in sync with AdminSidebar's NAV tree so
// AdminHeader can look up the current page title. Longer/more specific
// hrefs are listed before their parents (e.g. "/admin/staff/coaches"
// before "/admin/staff") since AdminHeader does a startsWith() match.
export const adminLinks = [
  { name: "Vue d'ensemble", href: "/admin" },
  { name: "Membres", href: "/admin/members" },
  { name: "Coachs", href: "/admin/staff/coaches" },
  { name: "Administrateurs", href: "/admin/staff" },
  { name: "Planning", href: "/admin/schedule" },
  { name: "Réservations", href: "/admin/bookings" },
  { name: "Offres & tarifs", href: "/admin/plans" },
  { name: "Adhésions", href: "/admin/subscriptions" },
  { name: "Annonces", href: "/admin/news" },
  { name: "Notifications", href: "/admin/notifications" },
  { name: "Rapports", href: "/admin/reports" },
  { name: "Demande de thème", href: "/admin/theme-requests" },
  { name: "Promotions", href: "/admin/promotions" },
  { name: "Facturation & plan SaaS", href: "/admin/billing" },
  { name: "Rôles & permissions", href: "/admin/roles" },
  { name: "Paramètres du club", href: "/admin/settings" },
  { name: "Mon profil", href: "/admin/profile" },
];

// Owner only links
export const ownerLinks: NavLink[] = [
  { name: "Demande de thème", href: "/admin/theme-requests", icon: Palette },
];

// Platform (SUPER_ADMIN) navigation — clubId-less, cross-tenant. Longer/
// more specific hrefs listed before their parents, same convention as
// adminLinks above, for PlatformHeader's startsWith() title lookup.
export const platformLinks = [
  { name: "Vue d'ensemble", href: "/platform" },
  { name: "Clubs", href: "/platform/clubs" },
  { name: "Plans SaaS", href: "/platform/plans" },
  { name: "Journal d'activité", href: "/platform/logs" },
  { name: "Système", href: "/platform/system" },
];

export function isLinkActive(pathname: string, href: string): boolean {
  if (href === "/dashboard" || href === "/admin") {
    return pathname === href;
  }
  return pathname.startsWith(href);
}

// NOTE: these two helpers read localStorage directly and are NOT reactive —
// a component using them won't re-render when role changes elsewhere in the
// same tab. Prefer useAuth() from AuthContext in components. These remain
// only for non-component utility code (or a one-time read on mount) where
// pulling in the context isn't practical.
export function getUserRole(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("role");
}

export function isUserAdmin(): boolean {
  const role = getUserRole();
  return role?.toUpperCase() === "ADMIN" || role?.toUpperCase() === "OWNER";
}
