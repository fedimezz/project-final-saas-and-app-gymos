"use client";

import Image from "next/image";
import { useEditableContent } from "@/hooks/useEditableContent";
import { useClubSettings } from "@/context/ClubSettingsContext";
import { safeImageUrl } from "@/lib/image-url";

// Empty by default: shown only when the owner wrote a title/text (wizard →
// "Accueil") or filled the club description. No made-up figures, no stock copy.
// An optional owner photo sits BESIDE the text; it never touches the hero.
export default function ClubIntro() {
  const { t, loading } = useEditableContent("home");
  const { description } = useClubSettings();

  const title = t("introTitle", "").trim();
  const text = t("introText", description || "").trim();
  const photo = safeImageUrl(t("introImage", ""));

  if (loading || (!title && !text)) return null;

  return (
    <section className="theme-section-alt py-16 md:py-20">
      <div className={`mx-auto max-w-7xl px-6 ${photo ? "grid items-center gap-10 md:grid-cols-2" : "text-center"}`}>
        <div>
          {title && <h2 className="theme-heading text-3xl md:text-5xl">{title}</h2>}
          {text && (
            <p className={`mt-6 text-lg text-[var(--text-secondary)] ${photo ? "" : "max-w-3xl mx-auto"}`}>{text}</p>
          )}
        </div>
        {photo && (
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-[var(--bg-muted)]">
            <Image src={photo} alt={title || "Photo du club"} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
          </div>
        )}
      </div>
    </section>
  );
}
