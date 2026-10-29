-- Database-level tests for the theme / 3D model lock (migration 20261017000100_design_lock).
-- Run against a DISPOSABLE database that already has every migration applied:
--   psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/tests/design-lock.test.sql
-- Every statement is its OWN transaction (autocommit) on purpose: the grant is consumed per
-- transaction, so a single wrapping transaction would hide cross-request behaviour. Test rows use
-- the ids tA/tB and are removed at the start and the end. Prints PASS/FAIL per case and raises
-- at the end if any case failed.
CREATE TEMP TABLE _results(name text, ok boolean);
DELETE FROM clubs WHERE id IN ('tA','tB','tC');

-- run a statement, report whether it raised DESIGN_LOCKED
CREATE FUNCTION pg_temp.blocked(sql text) RETURNS boolean AS $$
BEGIN
  EXECUTE sql;
  RETURN false;
EXCEPTION WHEN check_violation THEN
  RETURN SQLERRM LIKE 'DESIGN_LOCKED%';
END $$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.violates(sql text) RETURNS boolean AS $$
BEGIN
  EXECUTE sql;
  RETURN false;
EXCEPTION WHEN unique_violation OR check_violation THEN
  RETURN true;
END $$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.expect(n text, c boolean) RETURNS void AS $$
BEGIN INSERT INTO _results VALUES (n, COALESCE(c, false)); END $$ LANGUAGE plpgsql;

INSERT INTO clubs(id, slug, name, status, "updatedAt") VALUES ('tA','t-a','Club A','ACTIVE', now()), ('tB','t-b','Club B','ACTIVE', now());
INSERT INTO gym_settings(id, "clubId", "themeId", "heroModel", "updatedAt") VALUES ('sA','tA','modern',NULL, now()), ('sB','tB','modern',NULL, now());

-- 1. before the lock the owner may change freely
UPDATE gym_settings SET "themeId" = 'boxing' WHERE "clubId" = 'tA';
SELECT pg_temp.expect('unlocked club can change theme', (SELECT "themeId" FROM gym_settings WHERE "clubId"='tA') = 'boxing');

-- 2. lock both clubs
UPDATE gym_settings SET "designLockedAt" = now() WHERE "clubId" IN ('tA','tB');
SELECT pg_temp.expect('locked: theme change blocked', pg_temp.blocked($$UPDATE gym_settings SET "themeId"='neon' WHERE "clubId"='tA'$$));
SELECT pg_temp.expect('locked: hero change blocked', pg_temp.blocked($$UPDATE gym_settings SET "heroModel"='kettlebell' WHERE "clubId"='tA'$$));
SELECT pg_temp.expect('locked: other fields stay editable', NOT pg_temp.blocked($$UPDATE gym_settings SET name='Renamed' WHERE "clubId"='tA'$$));

-- 3. the lock cannot be cleared
UPDATE gym_settings SET "designLockedAt" = NULL WHERE "clubId" = 'tA';
SELECT pg_temp.expect('lock cannot be cleared', (SELECT "designLockedAt" IS NOT NULL FROM gym_settings WHERE "clubId"='tA'));

-- 4. a PENDING request grants nothing
INSERT INTO design_change_requests(id, "clubId", "requestedBy", "requestedThemeId", status, "updatedAt") VALUES ('r1','tA','u1','neon','PENDING', now());
SELECT pg_temp.expect('pending request does not unlock', pg_temp.blocked($$UPDATE gym_settings SET "themeId"='neon' WHERE "clubId"='tA'$$));
-- only one open request per club
SELECT pg_temp.expect('second open request rejected', pg_temp.violates($$INSERT INTO design_change_requests(id,"clubId","requestedBy","requestedThemeId",status,"updatedAt") VALUES ('r1b','tA','u1','urban','PENDING', now())$$));

-- 5. approval is a grant for EXACTLY what was approved
UPDATE design_change_requests SET status='APPROVED', "reviewedAt"=now(), "expiresAt"=now()+interval '7 days' WHERE id='r1';
SELECT pg_temp.expect('grant cannot be spent on another theme', pg_temp.blocked($$UPDATE gym_settings SET "themeId"='urban' WHERE "clubId"='tA'$$));
SELECT pg_temp.expect('theme grant cannot change the 3D model', pg_temp.blocked($$UPDATE gym_settings SET "heroModel"='kettlebell' WHERE "clubId"='tA'$$));
SELECT pg_temp.expect('grant of club A does not help club B', pg_temp.blocked($$UPDATE gym_settings SET "themeId"='neon' WHERE "clubId"='tB'$$));
UPDATE gym_settings SET "themeId" = 'neon' WHERE "clubId" = 'tA';
SELECT pg_temp.expect('approved change goes through', (SELECT "themeId" FROM gym_settings WHERE "clubId"='tA') = 'neon');
SELECT pg_temp.expect('grant is consumed by that change', (SELECT status::text FROM design_change_requests WHERE id='r1') = 'CONSUMED');

-- 6. one-time: a second change is blocked
-- (neon -> boxing is exactly what a replay of the spent grant would have to allow; neon is the value it approved)
UPDATE gym_settings SET "themeId" = 'urban' WHERE "clubId" = 'tB' AND false;
SELECT pg_temp.expect('spent grant cannot approve a second change', pg_temp.blocked($$UPDATE gym_settings SET "themeId"='boxing' WHERE "clubId"='tA'$$));
SELECT pg_temp.expect('spent grant cannot be replayed for its own value', pg_temp.blocked($$UPDATE gym_settings SET "themeId"='crossfit' WHERE "clubId"='tA'$$));
SELECT pg_temp.expect('after consumption a new theme change is blocked', pg_temp.blocked($$UPDATE gym_settings SET "themeId"='urban' WHERE "clubId"='tA'$$));

-- 7. expired grants are dead
INSERT INTO design_change_requests(id, "clubId", "requestedBy", "requestedThemeId", status, "reviewedAt", "expiresAt", "updatedAt")
  VALUES ('r2','tA','u1','urban','APPROVED', now()-interval '8 days', now()-interval '1 day', now());
SELECT pg_temp.expect('expired grant is ignored', pg_temp.blocked($$UPDATE gym_settings SET "themeId"='urban' WHERE "clubId"='tA'$$));
UPDATE design_change_requests SET status='EXPIRED' WHERE id='r2';

-- 8. theme + model in one approved grant, applied as one logical change
INSERT INTO design_change_requests(id, "clubId", "requestedBy", "requestedThemeId", "requestedHeroModel", status, "reviewedAt", "expiresAt", "updatedAt")
  VALUES ('r3','tA','u1','urban','punching-bag','APPROVED', now(), now()+interval '7 days', now());
UPDATE gym_settings SET "themeId"='urban', "heroModel"='punching-bag' WHERE "clubId"='tA';
SELECT pg_temp.expect('theme+model grant applies in one statement', (SELECT "themeId"||'/'||"heroModel" FROM gym_settings WHERE "clubId"='tA') = 'urban/punching-bag');
SELECT pg_temp.expect('and is then spent', pg_temp.blocked($$UPDATE gym_settings SET "heroModel"='kettlebell' WHERE "clubId"='tA'$$));

-- 9. live custom 3D model file is locked too
UPDATE design_change_requests SET status='CANCELLED' WHERE "clubId"='tA' AND status IN ('PENDING','APPROVED');
INSERT INTO design_change_requests(id, "clubId", "requestedBy", "requestedHeroModel", status, "reviewedAt", "expiresAt", "updatedAt")
  VALUES ('r4','tA','u1','custom','APPROVED', now(), now()+interval '7 days', now());
-- staging an upload while custom is NOT selected is fine
INSERT INTO club_hero_models(id,"clubId","fileName",format,"contentType","byteSize",sha256,data,"updatedAt") VALUES ('h1','tA','a.glb','glb','model/gltf-binary',1,'aaa','\x00', now());
SELECT pg_temp.expect('staging a custom file while not selected is allowed', (SELECT count(*) FROM club_hero_models WHERE "clubId"='tA') = 1);
-- selecting it consumes the grant
UPDATE gym_settings SET "heroModel"='custom' WHERE "clubId"='tA';
SELECT pg_temp.expect('selecting custom needs and consumes the grant', (SELECT status::text FROM design_change_requests WHERE id='r4') = 'CONSUMED');
-- now it is live: replacing / deleting the file is blocked
SELECT pg_temp.expect('replacing the live custom file is blocked', pg_temp.blocked($$UPDATE club_hero_models SET sha256='bbb' WHERE "clubId"='tA'$$));
SELECT pg_temp.expect('deleting the live custom file is blocked', pg_temp.blocked($$DELETE FROM club_hero_models WHERE "clubId"='tA'$$));
SELECT pg_temp.expect('placement tweaks stay possible', NOT pg_temp.blocked($$UPDATE club_hero_models SET scale=1.5 WHERE "clubId"='tA'$$));

-- 10. deleting a whole club (cascade) must never be blocked by the lock, even with a live custom model
INSERT INTO clubs(id, slug, name, status, "updatedAt") VALUES ('tC','t-c','Club C','ACTIVE', now());
INSERT INTO gym_settings(id, "clubId", "themeId", "heroModel", "updatedAt") VALUES ('sC','tC','modern','custom', now());
INSERT INTO club_hero_models(id,"clubId","fileName",format,"contentType","byteSize",sha256,data,"updatedAt") VALUES ('hC','tC','c.glb','glb','model/gltf-binary',1,'ccc','\x00', now());
UPDATE gym_settings SET "designLockedAt" = now() WHERE "clubId" = 'tC';
DELETE FROM clubs WHERE id = 'tC';
SELECT pg_temp.expect('club deletion cascades despite the lock', (SELECT count(*) FROM club_hero_models WHERE "clubId"='tC') = 0 AND (SELECT count(*) FROM clubs WHERE id='tC') = 0);

DO $$
DECLARE r record; failed int := 0;
BEGIN
  FOR r IN SELECT * FROM _results LOOP
    RAISE NOTICE '% %', CASE WHEN r.ok THEN 'PASS' ELSE 'FAIL' END, r.name;
    IF NOT r.ok THEN failed := failed + 1; END IF;
  END LOOP;
  IF failed > 0 THEN RAISE EXCEPTION '% design-lock case(s) failed', failed; END IF;
  RAISE NOTICE 'ALL % design-lock cases passed', (SELECT count(*) FROM _results);
END $$;

DELETE FROM clubs WHERE id IN ('tA','tB','tC');
