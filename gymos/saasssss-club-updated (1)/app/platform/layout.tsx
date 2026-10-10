"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import PlatformSidebar from "@/components/platform/PlatformSidebar";
import PlatformHeader from "@/components/platform/PlatformHeader";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, userRole, isLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const authorized = isLoggedIn && userRole?.toUpperCase() === "SUPER_ADMIN";

  useEffect(() => {
    if (pathname === "/platform/login") return;
    if (isLoading) return;
    if (!isLoggedIn) { router.replace("/platform/login"); return; }
    if (userRole?.toUpperCase() !== "SUPER_ADMIN") router.replace("/dashboard");
  }, [isLoading, isLoggedIn, userRole, router, pathname]);

  if (pathname === "/platform/login") return children;

  if (isLoading || !authorized) {
    return <div className="fixed inset-0 flex items-center justify-center bg-background"><div className="flex flex-col items-center gap-3 text-muted"><Loader2 className="h-7 w-7 animate-spin text-emerald-500" /><p className="text-sm">Vérification des accès...</p></div></div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex overflow-hidden bg-background">
      <PlatformSidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col lg:ml-72">
        <PlatformHeader onMobileMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
