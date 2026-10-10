"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import { Loader2 } from "lucide-react";

export default function DashboardLayout({
                                          children,
                                        }: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isLoggedIn, userRole, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isLoggedIn) {
      router.replace("/user/login");
      return;
    }

    const roleUpper = userRole?.toUpperCase();
    if (roleUpper === "ADMIN" || roleUpper === "OWNER") {
      router.replace("/admin");
    }
  }, [isLoading, isLoggedIn, userRole, router]);

  const roleUpper = userRole?.toUpperCase();
  const authorized =
      !isLoading && isLoggedIn && roleUpper !== "ADMIN" && roleUpper !== "OWNER";

  if (isLoading || !authorized) {
    return (
        <div className="flex items-center justify-center min-h-screen bg-[var(--bg-primary)]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 size={44} className="animate-spin text-[var(--primary)]" />
            <p className="text-sm text-muted">Chargement du tableau de bord...</p>
          </div>
        </div>
    );
  }

  return (
      <div className="h-screen overflow-hidden bg-[var(--bg-primary)]">
        <DashboardSidebar />
        <div className="lg:pl-72 flex flex-col h-full">
          <DashboardHeader />
          <main className="flex-1 overflow-y-auto pt-16 lg:pt-16 px-4 sm:px-6 lg:px-8 pb-8 mt-16">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
  );
}