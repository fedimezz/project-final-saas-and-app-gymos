"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

// Extra guard for pages under /admin that only the OWNER should see
// (Promotions, Roles & Permissions, Gym Settings, ...). The real
// enforcement happens in middleware.ts on the server side; this just
// avoids a flash of Admin-visible content and bounces ADMIN users back
// to /admin instead of showing them a page they shouldn't have.
export default function OwnerOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { userRole, isLoading } = useAuth();
  const roleUpper = userRole?.toUpperCase() ?? null;

  useEffect(() => {
    if (isLoading) return;
    if (roleUpper !== "OWNER") {
      router.replace("/admin");
    }
  }, [isLoading, roleUpper, router]);

  if (isLoading || roleUpper !== "OWNER") {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return <>{children}</>;
}
