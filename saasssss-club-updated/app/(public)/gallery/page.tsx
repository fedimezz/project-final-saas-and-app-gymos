"use client";

import Image from "next/image";
import GalleryCategory from "@/components/gallery/GalleryCategory";
import PagePublishGate from "@/components/layout/PagePublishGate";
import { useEditableContent } from "@/hooks/useEditableContent";
import { MAX_GALLERY_IMAGES } from "@/lib/page-content-schema";

export default function GalleryPage() {
  const { t, img, list, loading } = useEditableContent("gallery");
  const heroImage = img("heroImage", "");
  const fitness = list("galleryFitness", []).slice(0, MAX_GALLERY_IMAGES);
  const padel = list("galleryPadel", []).slice(0, MAX_GALLERY_IMAGES);
  const pool = list("galleryPool", []).slice(0, MAX_GALLERY_IMAGES);
  const noPhotos = !loading && fitness.length + padel.length + pool.length === 0;

  return (
    <PagePublishGate pageKey="gallery">
    <main>

      {/* Hero */}

      <section className="relative h-[60vh] bg-primary">
        {heroImage && (
          <Image
            src={heroImage}
            alt="Gallery"
            fill
            className="object-cover"
          />
        )}

        <div className="absolute inset-0 bg-black/60" />

        <div className="relative z-10 flex h-full items-center justify-center">
          <h1 className="text-6xl font-bold text-white">
            {t("heroTitle", "Gallery")}
          </h1>
        </div>
      </section>

      {/* Only the photos the owner chose are shown — no built-in stock photos,
          and a category with no photo is simply not rendered. */}
      {fitness.length > 0 && (
        <GalleryCategory
          title="Fitness"
          description="Premium fitness facilities."
          images={fitness}
        />
      )}

      {padel.length > 0 && (
        <GalleryCategory
          title="Padel"
          description="Professional padel courts."
          images={padel}
        />
      )}

      {pool.length > 0 && (
        <GalleryCategory
          title="Swimming Pool"
          description="Relax and train."
          images={pool}
        />
      )}

      {noPhotos && (
        <p className="py-24 text-center text-muted">
          Les photos arrivent bientôt.
        </p>
      )}

    </main>
    </PagePublishGate>
  );
}