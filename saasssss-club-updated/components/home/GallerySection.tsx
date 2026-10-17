"use client";

import Image from "next/image";
import Link from "next/link";
import { useEditableContent } from "@/hooks/useEditableContent";
import { safeImageList } from "@/lib/image-url";

// Home photo area (separate from the hero). Uses the photos the owner chose
// for the home page; if none, falls back to the Gallery page photos. Nothing
// is shown until the club adds some — never a stock or another club's picture.
export default function GallerySection() {
  const home = useEditableContent("home");
  const gallery = useEditableContent("gallery");

  const own = safeImageList(home.list("homeGallery", []), 6);
  const images = own.length > 0
    ? own
    : safeImageList(
        [
          ...gallery.list("galleryFitness", []),
          ...gallery.list("galleryPadel", []),
          ...gallery.list("galleryPool", []),
        ],
        6
      );

  if (home.loading || gallery.loading || images.length === 0) return null;

  return (
    <section className="theme-section py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center">
          <h2 className="theme-heading text-3xl md:text-5xl">Le club en images</h2>
          <p className="mt-4 text-gray-500">Découvrez nos installations et notre ambiance.</p>
        </div>

        <div className="mt-12 grid gap-4 md:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {images.map((image, i) => (
            <div key={image} className="group relative h-[260px] md:h-[320px] overflow-hidden theme-card bg-muted/30">
              <Image
                src={image}
                alt={`Photo du club ${i + 1}`}
                fill
                sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                className="object-cover transition duration-700 group-hover:scale-110"
              />
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link href="/gallery" className="inline-flex theme-btn px-8 py-4 font-semibold">
            Voir toute la galerie
          </Link>
        </div>
      </div>
    </section>
  );
}
