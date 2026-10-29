// /api/admin/hero-model — OWNER-only management of the club's custom 3D model.
//   GET     metadata (never the file bytes) + the upload limit
//   POST    multipart `file` (.glb/.gltf) — validated from the real bytes, then
//           stored for THIS club (the club id comes from the session, never the request)
//   PUT     JSON transform (scale / rotation / position / autoRotate)
//   DELETE  removes the file and, if it was the selected hero, resets the selection
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { denyIfWebsiteLocked } from "@/lib/website-setup";
import { denyIfFeatureLocked, isFeatureAllowed } from "@/lib/plan-feature-guard";
import { designLockedResponse, findActiveGrant, isDesignLockError } from "@/lib/design-lock";
import { invalidatePublicSettings } from "@/lib/club-public-settings";
import { getHeroModelMeta, invalidateHeroModelMeta, metaToTransform, heroModelUrl } from "@/lib/hero-model-server";
import { logAction } from "@/lib/activity-log";
import {
  getHeroModelMaxBytes,
  HERO_TRANSFORM_RANGES as R,
  sanitizeFileName,
  validateHeroModelFile,
} from "@/lib/hero-model";

const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const UPLOADS_PER_HOUR = 20;

const transformSchema = z.object({
  scale: z.number().min(R.scale.min).max(R.scale.max),
  rotation: z.object({
    x: z.number().min(R.rotation.min).max(R.rotation.max),
    y: z.number().min(R.rotation.min).max(R.rotation.max),
    z: z.number().min(R.rotation.min).max(R.rotation.max),
  }),
  position: z.object({
    x: z.number().min(R.position.min).max(R.position.max),
    y: z.number().min(R.position.min).max(R.position.max),
    z: z.number().min(R.position.min).max(R.position.max),
  }),
  autoRotate: z.boolean(),
});

async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function view(meta: NonNullable<Awaited<ReturnType<typeof getHeroModelMeta>>>) {
  return {
    fileName: meta.fileName,
    format: meta.format,
    byteSize: meta.byteSize,
    url: heroModelUrl(meta.sha256),
    transform: metaToTransform(meta),
    updatedAt: meta.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé au propriétaire" }, { status: auth.status });
    const clubId = auth.user.clubId as string;
    // Not the shared cache: the owner must see the file they just uploaded.
    invalidateHeroModelMeta(clubId);
    const meta = await getHeroModelMeta(clubId);
    const customModelAllowed = await isFeatureAllowed(clubId, "customHeroModel");
    return NextResponse.json(
      { model: meta ? view(meta) : null, maxBytes: getHeroModelMaxBytes(), customModelAllowed },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Hero model admin GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé au propriétaire" }, { status: auth.status });
    const owner = auth.user;
    const clubId = owner.clubId as string;

    // "Add my own 3D model" is a plan feature (SaasPlan.limits.customHeroModel). Checked before the
    // body is read so a locked club cannot even stream a file at the server.
    const featureDenied = await denyIfFeatureLocked(clubId, "customHeroModel");
    if (featureDenied) return featureDenied;

    // Theme/3D-model lock (lib/design-lock.ts). Uploading is only a model CHANGE when the custom model
    // is the one on display; otherwise it merely stages a file, and selecting it needs the grant. An
    // owner holding an approved grant for "custom" may therefore stage a file even when the rest of
    // the site is frozen.
    const design = await prisma.gymSettings.findUnique({ where: { clubId }, select: { designLockedAt: true, heroModel: true } });
    const grant = design?.designLockedAt ? await findActiveGrant(clubId) : null;
    const customGrant = grant?.requestedHeroModel === "custom";
    if (design?.designLockedAt && design.heroModel === "custom" && !customGrant) return designLockedResponse();
    if (!customGrant) {
      const locked = await denyIfWebsiteLocked(clubId);
      if (locked) return locked;
    }

    const rl = await checkRateLimit(`hero-model:${owner.id}`, UPLOADS_PER_HOUR, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Trop de téléversements, réessayez plus tard." }, { status: 429 });
    }

    const maxBytes = getHeroModelMaxBytes();
    const hardCap = maxBytes + MULTIPART_OVERHEAD_BYTES;
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > hardCap) {
      return NextResponse.json({ error: `Fichier trop volumineux. Maximum : ${Math.floor(maxBytes / 1048576)} Mo.` }, { status: 413 });
    }
    const body = await readBoundedBody(request, hardCap);
    if (!body) {
      return NextResponse.json({ error: `Fichier trop volumineux ou vide. Maximum : ${Math.floor(maxBytes / 1048576)} Mo.` }, { status: 413 });
    }

    let file: FormDataEntryValue | null;
    try {
      const form = await new Request(request.url, { method: "POST", headers: request.headers, body }).formData();
      file = form.get("file");
    } catch {
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }
    if (!(file instanceof File)) return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const verdict = validateHeroModelFile(file.name, bytes, maxBytes);
    if (!verdict.ok) return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: 400 });

    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const data = {
      fileName: sanitizeFileName(file.name),
      format: verdict.summary.format,
      contentType: verdict.summary.contentType,
      byteSize: bytes.byteLength,
      sha256,
      data: Buffer.from(bytes),
      uploadedBy: owner.id,
    };
    // A new file keeps the owner's placement only if they upload the same model
    // again; a different model starts from the neutral transform.
    const previous = await prisma.clubHeroModel.findUnique({ where: { clubId }, select: { sha256: true } });
    const reset = previous?.sha256 !== sha256;
    try {
      await prisma.clubHeroModel.upsert({
        where: { clubId },
        create: { clubId, ...data },
        update: {
          ...data,
          ...(reset && { scale: 1, rotationX: 0, rotationY: 0, rotationZ: 0, positionX: 0, positionY: 0, positionZ: 0, autoRotate: true }),
        },
        select: { id: true },
      });
    } catch (e) {
      if (isDesignLockError(e)) return designLockedResponse();
      throw e;
    }

    invalidateHeroModelMeta(clubId);
    invalidatePublicSettings(clubId);
    await logAction(request, {
      clubId, actorId: owner.id, actorName: owner.name, actorRole: owner.role,
      action: "HERO_MODEL_UPLOADED", category: "SETTINGS",
      detail: { bytes: bytes.byteLength, format: verdict.summary.format, triangles: verdict.summary.triangles },
    });

    const meta = await getHeroModelMeta(clubId);
    return NextResponse.json({ model: meta ? view(meta) : null, summary: verdict.summary }, { status: 201 });
  } catch (error) {
    console.error("Hero model admin POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé au propriétaire" }, { status: auth.status });
    const clubId = auth.user.clubId as string;

    const featureDenied = await denyIfFeatureLocked(clubId, "customHeroModel");
    if (featureDenied) return featureDenied;

    const locked = await denyIfWebsiteLocked(clubId);
    if (locked) return locked;

    const parsed = transformSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Réglages invalides." }, { status: 400 });
    const t = parsed.data;

    const existing = await prisma.clubHeroModel.findUnique({ where: { clubId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Aucun modèle téléversé." }, { status: 404 });

    await prisma.clubHeroModel.update({
      where: { clubId },
      data: {
        scale: t.scale,
        rotationX: t.rotation.x, rotationY: t.rotation.y, rotationZ: t.rotation.z,
        positionX: t.position.x, positionY: t.position.y, positionZ: t.position.z,
        autoRotate: t.autoRotate,
      },
      select: { id: true },
    });
    invalidateHeroModelMeta(clubId);
    invalidatePublicSettings(clubId);

    const meta = await getHeroModelMeta(clubId);
    return NextResponse.json({ model: meta ? view(meta) : null });
  } catch (error) {
    console.error("Hero model admin PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé au propriétaire" }, { status: auth.status });
    const owner = auth.user;
    const clubId = owner.clubId as string;

    const locked = await denyIfWebsiteLocked(clubId);
    if (locked) return locked;

    // Removing the custom model while it is on display would change the club's 3D model (and reset it
    // to the theme default): that is a locked change. Switching to another model first (via a
    // change request) frees the file for deletion.
    const design = await prisma.gymSettings.findUnique({ where: { clubId }, select: { designLockedAt: true, heroModel: true } });
    if (design?.designLockedAt && design.heroModel === "custom") return designLockedResponse();

    try {
      await prisma.$transaction([
        prisma.clubHeroModel.deleteMany({ where: { clubId } }),
        // If the custom model was the selected hero, fall back to the theme default.
        prisma.gymSettings.updateMany({ where: { clubId, heroModel: "custom" }, data: { heroModel: null } }),
      ]);
    } catch (e) {
      if (isDesignLockError(e)) return designLockedResponse();
      throw e;
    }
    invalidateHeroModelMeta(clubId);
    invalidatePublicSettings(clubId);
    await logAction(request, {
      clubId, actorId: owner.id, actorName: owner.name, actorRole: owner.role,
      action: "HERO_MODEL_REMOVED", category: "SETTINGS",
    });

    return NextResponse.json({ model: null });
  } catch (error) {
    console.error("Hero model admin DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
