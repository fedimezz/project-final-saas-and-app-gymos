"use client";
// Shown at the top of /download. On a club's own site (subdomain or custom domain) it tells members how to
// reach THIS club in the app; on the ClubX site it explains how to find any club. The app itself has a
// club search, so nobody needs a link per club.
import { Search } from "lucide-react";
import { useClubSettings } from "@/context/ClubSettingsContext";

export default function ClubDownloadIntro() {
  const { hasTenant, name } = useClubSettings();
  const clubName = hasTenant ? name.trim() : "";
  return (
    <section className="space-y-2 rounded-3xl border border-border bg-card p-6 shadow-sm" aria-labelledby="find-club-h">
      <h2 id="find-club-h" className="flex items-center gap-2 text-xl font-bold">
        <Search size={20} aria-hidden /> {clubName ? `Accéder à ${clubName} dans l'application` : "Trouver votre salle dans l'application"}
      </h2>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Installez l&apos;application ClubX (Android ou iPhone, ci-dessous).</li>
        <li>
          Ouvrez-la et cherchez {clubName ? <b>{clubName}</b> : "le nom de votre salle"} dans la recherche de clubs.
        </li>
        <li>Connectez-vous ou créez votre compte : planning, réservations et notifications de votre salle.</li>
      </ol>
    </section>
  );
}
