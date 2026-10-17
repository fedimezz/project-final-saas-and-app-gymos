-- Custom 3D hero model: one owner-uploaded .glb/.gltf per club, stored in the
-- database and served only through /api/hero-model (tenant resolved from host).
CREATE TABLE "club_hero_models" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "scale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "rotationX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotationY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotationZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positionX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positionY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positionZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "autoRotate" BOOLEAN NOT NULL DEFAULT true,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_hero_models_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "club_hero_models_clubId_key" ON "club_hero_models"("clubId");

ALTER TABLE "club_hero_models" ADD CONSTRAINT "club_hero_models_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
