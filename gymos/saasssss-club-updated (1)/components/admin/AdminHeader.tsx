"use client";

import { usePathname } from "next/navigation";
import { Menu, ShieldCheck, Sun, Moon } from "lucide-react";
import { adminLinks } from "@/lib/navigation";
import { useTheme } from "@/context/ThemeContext";

interface Props {
  onMobileMenu: () => void;
  role: "ADMIN" | "OWNER";
}

export default function AdminHeader({ onMobileMenu, role }: Props) {
  const pathname = usePathname();
  const { isDark, toggleTheme } = useTheme();

  const current = adminLinks.find((l) =>
    l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href)
  );

  return (
    <header className="sticky top-0 z-20 h-16 bg-card border-b border-border flex items-center px-6 gap-4">
      <button
        onClick={onMobileMenu}
        className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors"
        aria-label="Menu"
      >
        <Menu size={20} className="text-primary" />
      </button>

      <div className="flex-1">
        <p className="text-sm text-muted">Administration</p>
        <h2 className="text-base font-semibold text-primary leading-none">
          {current?.name ?? "Dashboard"}
        </h2>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          aria-label="Basculer le thème"
        >
          {isDark ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-primary" />}
        </button>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--primary)]/10">
          <ShieldCheck size={14} className="text-[var(--primary)]" />
          <span className="text-xs font-semibold text-[var(--primary)]">{role}</span>
        </div>
      </div>
    </header>
  );
}
