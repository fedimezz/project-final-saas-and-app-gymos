"use client";

import { Palette } from "lucide-react";
import OwnerOnly from "@/components/admin/OwnerOnly";
import DesignChangePanel from "@/components/admin/DesignChangePanel";
import WebsiteChangeRequestPanel from "@/components/admin/WebsiteChangeRequestPanel";

// Theme + 3D model are locked after setup. The owner asks for a one-time change here; SUPER_ADMIN
// approves or rejects it (/platform/design-requests). Other website changes keep the free-text
// request form below.
export default function ThemeRequestsPage() {
  return (
    <OwnerOnly>
      <div className="max-w-2xl space-y-8 animate-fade-in">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-primary">
            <Palette size={26} className="text-[var(--primary)]" />
            Thème et modèle 3D
          </h1>
          <p className="mt-1 text-muted">
            Votre thème et votre modèle 3D sont choisis lors de la configuration, puis verrouillés. Demandez ici un changement unique.
          </p>
        </div>
        <DesignChangePanel />
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-primary">Autres modifications du site</h2>
          <WebsiteChangeRequestPanel showLockedBanner={false} />
        </section>
      </div>
    </OwnerOnly>
  );
}
