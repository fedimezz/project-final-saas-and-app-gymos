"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Bell, Menu, ChevronDown, X, LogOut, Sun, Moon } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { dashboardLinks, coachLinks, isLinkActive } from "@/lib/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";

export default function DashboardHeader() {
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<Array<{id:string; title:string; message:string; isRead:boolean; sentAt:string}>>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const pathname = usePathname();
  const { logout, isLoggedIn, userRole, user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const links = userRole?.toUpperCase() === "COACH" ? coachLinks : dashboardLinks;

  const loadNotifications = useCallback(async () => {
    if (!isLoggedIn) {
      setNotifications([]);
      setUnreadCount(0);
      setLoadingNotifications(false);
      return;
    }
    try {
      const res = await fetch("/api/dashboard/notifications?limit=5", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(Number.isFinite(data.unreadCount) ? Math.max(0, data.unreadCount) : 0);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoadingNotifications(false);
    }
  }, [isLoggedIn]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  useEffect(() => {
    const interval = window.setInterval(loadNotifications, 60_000);
    return () => window.clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showNotifications && !(event.target as HTMLElement).closest(".notifications-dropdown")) setShowNotifications(false);
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showNotifications]);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  const handleLogout = () => {
    logout();
    window.location.href = "/";
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-30 bg-primary border-b border-border lg:pl-72">
        <div className="flex items-center justify-between px-6 h-16">
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Ouvrir le menu">
            {mobileMenuOpen ? <X size={20} className="text-primary" /> : <Menu size={20} className="text-primary" />}
          </button>
          <div className="lg:hidden"><h1 className="text-lg font-semibold text-primary">Le Club</h1></div>

          <div className="flex items-center gap-3 ml-auto">
            <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Basculer le thème">
              {isDark ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-primary" />}
            </button>

            <div className="relative notifications-dropdown">
              <button onClick={() => setShowNotifications(!showNotifications)} className="p-2 rounded-lg hover:bg-muted transition-colors relative" aria-label={unreadCount > 0 ? `${unreadCount} notifications non lues` : "Notifications"}>
                <Bell size={20} className={unreadCount > 0 ? "text-primary" : "text-muted"} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] leading-[18px] text-center font-bold ring-2 ring-[var(--bg-primary)]">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-xl shadow-lg z-50">
                  <div className="p-3 border-b border-border flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-primary">Notifications</h3>
                      {unreadCount > 0 && <p className="text-[11px] text-red-600 font-medium mt-0.5">{unreadCount} non lue{unreadCount > 1 ? "s" : ""}</p>}
                    </div>
                    <Link href="/dashboard/notifications" onClick={() => setShowNotifications(false)} className="text-xs text-primary hover:underline">Tout voir</Link>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {loadingNotifications ? <div className="p-3 text-sm text-muted">Chargement...</div> : notifications.length === 0 ? <div className="p-3 text-sm text-muted">Aucune notification</div> : notifications.map((item) => (
                      <NotificationItem key={item.id} title={item.title} message={item.message} time={new Date(item.sentAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} unread={!item.isRead} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Link href="/dashboard/profile" className="flex items-center gap-3 hover:bg-muted rounded-lg p-2 transition-colors" aria-label="Mon profil">
              <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white font-bold text-sm overflow-hidden">
                {typeof user?.avatar === "string" && user.avatar.startsWith("https://") ? <Image src={user.avatar} alt="" width={32} height={32} className="w-full h-full object-cover" /> : (user?.name?.trim()?.charAt(0)?.toUpperCase() || "?")}
              </div>
              <div className="hidden md:block text-left max-w-[130px]">
                <p className="text-xs font-semibold text-primary truncate">{user?.name || "Mon profil"}</p>
                <p className="text-[10px] text-muted truncate">{userRole || "MEMBER"}</p>
              </div>
              <ChevronDown size={16} className="text-muted hidden sm:block" />
            </Link>
          </div>
        </div>
      </header>

      {mobileMenuOpen && <>
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden animate-fade-in" onClick={() => setMobileMenuOpen(false)} />
        <aside className="fixed left-0 top-0 h-full w-72 bg-primary border-r border-border z-50 lg:hidden animate-slide-in overflow-y-auto">
          <div className="p-6 border-b border-border"><h2 className="text-2xl font-bold text-primary">Le Club</h2><p className="text-xs text-muted -mt-1">de Gammarth</p></div>
          <nav className="p-4 space-y-1">{links.map((link) => { const Icon = link.icon; const active = isLinkActive(pathname, link.href); return <Link key={link.href} href={link.href} onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${active ? "bg-nav-active text-white shadow-sm" : "text-muted hover:bg-muted hover:text-primary"}`}><Icon size={18} className="flex-shrink-0" /><span className="font-medium">{link.name}</span></Link>; })}</nav>
          <div className="p-4 border-t border-border"><button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-danger hover:bg-danger/10 transition-colors"><LogOut size={20} /><span className="font-medium">Déconnexion</span></button></div>
        </aside>
      </>}
    </>
  );
}

function NotificationItem({ title, message, time, unread }: { title: string; message?: string; time: string; unread?: boolean }) {
  return <div className={`p-3 hover:bg-muted transition-colors border-b border-border last:border-0 ${unread ? "bg-muted/40" : ""}`}><div className="flex items-start gap-2">{unread && <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-red-600 flex-shrink-0" />}<div className="flex-1 min-w-0"><p className="text-sm font-medium text-primary">{title}</p>{message && <p className="text-xs text-muted mt-1 line-clamp-2">{message}</p>}<p className="text-[11px] text-muted mt-1">{time}</p></div></div></div>;
}
