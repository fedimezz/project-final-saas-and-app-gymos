-- Theme / 3D-model lock with one-time, SUPER_ADMIN-approved change grants.
-- Additive: one enum, one table, one nullable column, two trigger functions.
-- Nothing is deleted. Existing clubs that already finished setup are locked (backfill below).

CREATE TYPE "DesignChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CONSUMED', 'CANCELLED', 'EXPIRED');

ALTER TABLE "gym_settings" ADD COLUMN "designLockedAt" TIMESTAMP(3);

CREATE TABLE "design_change_requests" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedThemeId" TEXT,
    "requestedHeroModel" TEXT,
    "reason" TEXT,
    "status" "DesignChangeStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "consumedTxid" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "design_change_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "design_change_requests_something_requested" CHECK ("requestedThemeId" IS NOT NULL OR "requestedHeroModel" IS NOT NULL),
    CONSTRAINT "design_change_requests_approved_has_expiry" CHECK ("status" <> 'APPROVED' OR "expiresAt" IS NOT NULL)
);

CREATE INDEX "design_change_requests_clubId_status_idx" ON "design_change_requests"("clubId", "status");
CREATE INDEX "design_change_requests_status_createdAt_idx" ON "design_change_requests"("status", "createdAt");

-- At most ONE open (pending or approved) request per club: no queue flooding, no stacked grants.
CREATE UNIQUE INDEX "design_change_requests_one_open_per_club"
  ON "design_change_requests"("clubId") WHERE "status" IN ('PENDING', 'APPROVED');

ALTER TABLE "design_change_requests"
  ADD CONSTRAINT "design_change_requests_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Grant consumption ────────────────────────────────────────────────────────────
-- Returns true when this change is covered by a grant, consuming it. Rules:
--  * the grant belongs to the same club, is APPROVED and not expired and not yet consumed
--    (or was consumed earlier in THIS transaction: one logical change may take several statements);
--  * every field being changed must equal what the grant approved, so an approval for
--    "theme = boxing" cannot be spent on "theme = neon" or on a 3D-model change.
CREATE OR REPLACE FUNCTION design_lock_consume(
  p_club text, p_theme_changed boolean, p_theme text, p_hero_changed boolean, p_hero text
) RETURNS boolean AS $$
DECLARE
  v_id text;
  v_status "DesignChangeStatus";
BEGIN
  SELECT "id", "status" INTO v_id, v_status
  FROM "design_change_requests"
  WHERE "clubId" = p_club
    AND (
      ("status" = 'APPROVED' AND "expiresAt" > now() AND "consumedAt" IS NULL)
      OR ("status" = 'CONSUMED' AND "consumedTxid" = txid_current())
    )
    AND (NOT p_theme_changed OR "requestedThemeId" = p_theme)
    AND (NOT p_hero_changed OR "requestedHeroModel" = p_hero)
  ORDER BY ("status" = 'CONSUMED') DESC, "reviewedAt" ASC
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NULL THEN
    RETURN false;
  END IF;
  IF v_status = 'APPROVED' THEN
    UPDATE "design_change_requests"
    SET "status" = 'CONSUMED', "consumedAt" = now(), "consumedTxid" = txid_current(), "updatedAt" = now()
    WHERE "id" = v_id;
  END IF;
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- ─── gym_settings: theme / heroModel are frozen once designLockedAt is set ────────
CREATE OR REPLACE FUNCTION design_lock_gym_settings() RETURNS trigger AS $$
DECLARE
  v_theme_changed boolean;
  v_hero_changed boolean;
BEGIN
  IF OLD."designLockedAt" IS NULL THEN
    RETURN NEW;
  END IF;
  -- The lock itself can never be cleared through an UPDATE.
  NEW."designLockedAt" := OLD."designLockedAt";

  v_theme_changed := NEW."themeId" IS DISTINCT FROM OLD."themeId";
  v_hero_changed  := NEW."heroModel" IS DISTINCT FROM OLD."heroModel";
  IF NOT (v_theme_changed OR v_hero_changed) THEN
    RETURN NEW;
  END IF;

  IF NOT design_lock_consume(NEW."clubId", v_theme_changed, NEW."themeId", v_hero_changed, NEW."heroModel") THEN
    RAISE EXCEPTION 'DESIGN_LOCKED: theme and 3D model are locked; an approved change request is required'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "gym_settings_design_lock"
  BEFORE UPDATE ON "gym_settings"
  FOR EACH ROW EXECUTE FUNCTION design_lock_gym_settings();

-- ─── club_hero_models: replacing/removing the LIVE custom model is a model change ─
-- Uploading while "custom" is not the selected model is allowed (it is only staged: selecting it
-- is what needs a grant). Placement tweaks (scale/rotation/position) never touch the file.
CREATE OR REPLACE FUNCTION design_lock_hero_model() RETURNS trigger AS $$
DECLARE
  v_club text;
  v_locked timestamp;
  v_hero text;
BEGIN
  -- Deleting a whole club cascades to its model file (nested trigger depth): never block that.
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  v_club := CASE WHEN TG_OP = 'DELETE' THEN OLD."clubId" ELSE NEW."clubId" END;
  SELECT "designLockedAt", "heroModel" INTO v_locked, v_hero FROM "gym_settings" WHERE "clubId" = v_club;
  IF v_locked IS NULL OR v_hero IS DISTINCT FROM 'custom' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."sha256" = OLD."sha256" THEN
    RETURN NEW;
  END IF;
  IF NOT design_lock_consume(v_club, false, NULL, true, 'custom') THEN
    RAISE EXCEPTION 'DESIGN_LOCKED: the live custom 3D model is locked; an approved change request is required'
      USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "club_hero_models_design_lock"
  BEFORE INSERT OR UPDATE OR DELETE ON "club_hero_models"
  FOR EACH ROW EXECUTE FUNCTION design_lock_hero_model();

-- ─── Backfill: clubs that already finished the guided setup are locked now ────────
UPDATE "gym_settings" SET "designLockedAt" = CURRENT_TIMESTAMP
WHERE "designLockedAt" IS NULL
  AND ("websiteSetupCompleted" = true OR "websiteExtraEditUsed" = true OR "websiteCustomizationLocked" = true);
