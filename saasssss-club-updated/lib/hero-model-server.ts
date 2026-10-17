// lib/hero-model-server.ts — DB-side helpers for the custom 3D hero model.
// Metadata queries NEVER select the `data` column (it can be several MB).
import prisma from "@/lib/prisma";
import { TtlCache } from "@/lib/ttl-cache";
import type { HeroModelTransform } from "@/lib/hero-model";

const META_SELECT = {
  fileName: true, format: true, contentType: true, byteSize: true, sha256: true,
  scale: true, rotationX: true, rotationY: true, rotationZ: true,
  positionX: true, positionY: true, positionZ: true, autoRotate: true, updatedAt: true,
} as const;

export type HeroModelMeta = NonNullable<Awaited<ReturnType<typeof loadMeta>>>;

async function loadMeta(clubId: string) {
  return prisma.clubHeroModel.findUnique({ where: { clubId }, select: META_SELECT });
}

const cache = new TtlCache<HeroModelMeta | null>(15_000);

export function getHeroModelMeta(clubId: string): Promise<HeroModelMeta | null> {
  return cache.get(clubId, () => loadMeta(clubId));
}

export function invalidateHeroModelMeta(clubId: string): void {
  cache.invalidate(clubId);
}

export function metaToTransform(meta: Pick<HeroModelMeta, "scale" | "rotationX" | "rotationY" | "rotationZ" | "positionX" | "positionY" | "positionZ" | "autoRotate">): HeroModelTransform {
  return {
    scale: meta.scale,
    rotation: { x: meta.rotationX, y: meta.rotationY, z: meta.rotationZ },
    position: { x: meta.positionX, y: meta.positionY, z: meta.positionZ },
    autoRotate: meta.autoRotate,
  };
}

/** Same-origin URL; `v` (content hash) makes the response immutable-cacheable. */
export function heroModelUrl(sha256: string): string {
  return `/api/hero-model?v=${sha256.slice(0, 16)}`;
}

/** What the PUBLIC site needs: where to load it and how to place it. No file name, no ids. */
export function toPublicHeroModel(meta: HeroModelMeta) {
  return {
    url: heroModelUrl(meta.sha256),
    format: meta.format as "glb" | "gltf",
    byteSize: meta.byteSize,
    transform: metaToTransform(meta),
  };
}
