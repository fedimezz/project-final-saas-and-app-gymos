"use client";

import { Palette } from "lucide-react";
import OwnerOnly from "@/components/admin/OwnerOnly";
import WebsiteChangeRequestPanel from "@/components/admin/WebsiteChangeRequestPanel";

// Replaces the old owner "Analytiques" page: the owner asks the platform team
// for a theme / design change here and follows the status of each request.
export default function ThemeRequestsPage() {
  return (
    <OwnerOnly>
      <div className="space-y-6 max-w-2xl animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-primary flex items-center gap-2">
            <Palette size={26} className="text-[var(--primary)]" />
            Demande de changement de thème
          </h1>
          <p className="text-muted mt-1">
            Décrivez le changement de thème ou de design souhaité. Vous suivez ici l&apos;état de chaque demande.
          </p>
        </div>
        <WebsiteChangeRequestPanel showLockedBanner={false} />
      </div>
    </OwnerOnly>
  );
}
