// POST /api/upload — accepts a multipart file (image for everyone; video/audio for staff) and
// stores it on Cloudinary, returning its public URL.
//
// HISTORY: this route used to write files to public/uploads on the local
// filesystem. That works on a traditional always-on server, but breaks on
// platforms with an ephemeral or read-only filesystem (Vercel, most
// serverless hosts): every uploaded file disappears on the next deploy,
// so returned URLs eventually 404. Cloudinary gives persistent, CDN-backed
// storage instead, so uploads survive deploys and scale-to-zero.
//
// Requires CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
// to be set — see lib/cloudinary.ts.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { uploadBufferToCloudinary, isCloudinaryConfigured } from "@/lib/cloudinary";
import { checkRateLimit } from "@/lib/rate-limit";

const ALLOWED_PREFIXES = ["image/", "video/", "audio/"] as const;
// image/svg+xml is deliberately excluded even though it matches the
// "image/" prefix: SVGs can embed <script> and are a known stored-XSS
// vector if the returned Cloudinary URL is later opened directly rather
// than only rendered inside an <img>. Nothing in this app needs user-
// uploaded SVGs (photos/avatars/media only), so it's excluded outright
// rather than relying on Cloudinary account settings to sandbox it.
const BLOCKED_IMAGE_TYPES = new Set(["image/svg+xml"]);
const MAX_SIZE_BY_KIND: Record<string, number> = {
  "image/": 10 * 1024 * 1024, // 10MB
  "video/": 100 * 1024 * 1024, // 100MB (staff only; news posts)
  "audio/": 20 * 1024 * 1024, // 20MB (staff only; news posts)
};
const MAX_STAFF_BYTES = Math.max(...Object.values(MAX_SIZE_BY_KIND));

// Who may upload what. Every admin page that uploads (news media, content,
// settings, coaches) is staff-only; the one member-facing use is the profile
// avatar. Members used to be able to push 100MB videos into the platform's
// Cloudinary account, so they are now limited to small images.
const STAFF_ROLES = new Set(["ADMIN", "OWNER"]);
const MEMBER_MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

// Uploads per user per hour. Staff need headroom (a news post with several
// media, a coach roster); members only change an avatar now and then.
const STAFF_UPLOADS_PER_HOUR = 60;
const MEMBER_UPLOADS_PER_HOUR = 10;

/** The declared MIME type is client-controlled; check the real bytes for images. */
function looksLikeImage(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isGif = buf.subarray(0, 4).toString("ascii") === "GIF8";
  const isWebp = buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP";
  const isAvif =
    buf.subarray(4, 8).toString("ascii") === "ftyp" && /^(avif|avis)$/.test(buf.subarray(8, 12).toString("ascii"));
  return isJpeg || isPng || isGif || isWebp || isAvif;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) {
      return NextResponse.json({ error: "Non autorisé" }, { status: auth.status });
    }

    const isStaff = STAFF_ROLES.has(auth.user.role.toUpperCase());
    const clubId = auth.user.clubId;
    if (!clubId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const rl = await checkRateLimit(
      `upload:${auth.user.id}`,
      isStaff ? STAFF_UPLOADS_PER_HOUR : MEMBER_UPLOADS_PER_HOUR,
      60 * 60 * 1000
    );
    if (!rl.allowed) {
      return NextResponse.json({ error: "Trop de téléversements, réessayez plus tard." }, { status: 429 });
    }

    // Reject declared oversize requests early, then enforce the same cap on
    // actual streamed bytes before multipart parsing.
    const declaredLength = Number(req.headers.get("content-length") ?? "0");
    const hardCap = (isStaff ? MAX_STAFF_BYTES : MEMBER_MAX_IMAGE_BYTES) + MULTIPART_OVERHEAD_BYTES;
    if (Number.isFinite(declaredLength) && declaredLength > hardCap) {
      return NextResponse.json({ error: "Fichier trop volumineux" }, { status: 413 });
    }

    const requestBody = await readBoundedBody(req, hardCap);
    if (!requestBody) {
      return NextResponse.json({ error: "Fichier trop volumineux ou corps vide" }, { status: 413 });
    }

    if (!isCloudinaryConfigured) {
      console.error(
        "Cloudinary env vars missing (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET)."
      );
      return NextResponse.json(
        { error: "Le stockage des fichiers n'est pas configuré côté serveur (Cloudinary)." },
        { status: 500 }
      );
    }

    const boundedRequest = new Request(req.url, {
      method: "POST",
      headers: req.headers,
      body: requestBody,
    });
    const formData = await boundedRequest.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    if (BLOCKED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Le format SVG n'est pas autorisé" },
        { status: 400 }
      );
    }

    const prefix = ALLOWED_PREFIXES.find((p) => file.type.startsWith(p));
    if (!prefix) {
      return NextResponse.json(
        { error: "Type de fichier non autorisé (image, vidéo ou audio)" },
        { status: 400 }
      );
    }

    if (!isStaff && prefix !== "image/") {
      return NextResponse.json(
        { error: "Seules les images sont autorisées pour votre compte" },
        { status: 403 }
      );
    }

    const maxSize = isStaff ? MAX_SIZE_BY_KIND[prefix] : MEMBER_MAX_IMAGE_BYTES;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `Fichier trop volumineux (max ${Math.round(maxSize / (1024 * 1024))}MB)` },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (prefix === "image/" && !looksLikeImage(buffer)) {
      return NextResponse.json({ error: "Le fichier n'est pas une image valide" }, { status: 400 });
    }

    // Cloudinary stores audio under its "video" resource type. Video/audio is
    // staff-only (enforced above) and Cloudinary itself rejects bytes that are
    // not decodable media; images additionally get the magic-byte check above.
    const mediaType: "image" | "video" | "audio" =
      prefix === "video/" ? "video" : prefix === "audio/" ? "audio" : "image";
    const cloudinaryResourceType = mediaType === "image" ? "image" : "video";

    let result;
    try {
      result = await uploadBufferToCloudinary(buffer, {
        // One folder per club, so tenants' media never share a namespace and
        // a club's assets can be found (or purged) as a unit.
        folder: `clubs/${clubId}`,
        resourceType: cloudinaryResourceType,
      });
    } catch (err) {
      console.error("Cloudinary upload error:", err);
      return NextResponse.json({ error: "Échec du téléversement vers le stockage" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      filename: result.public_id,
      url: result.secure_url,
      size: result.bytes,
      mimeType: file.type,
      mediaType,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Échec du téléversement" }, { status: 500 });
  }
}
