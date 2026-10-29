import { ApiError, apiUpload } from "@/api/client";

/** Types the picker may hand us. HEIC/HEIF come from iPhones and some Androids; prepareAvatar turns them into JPEG. */
const ACCEPTED_SOURCE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
/** What the backend's /api/upload accepts as a profile photo (it also checks the real bytes). */
const UPLOADABLE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Originals above this are refused up front instead of spending seconds resizing them. */
export const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
/**
 * Serverless hosts (Vercel) answer 413 above ~4.5 MB, and members are capped at 5 MB by the
 * backend. After prepareAvatar a photo is a few hundred KB; this guards the unexpected case.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

/**
 * The picker's `mimeType` is sometimes missing (Android after a crop) or non-standard
 * ("image/jpg"). Normalise it, falling back to the file extension, then to JPEG.
 */
export function normalizeMime(mimeType: string | null | undefined, uri = ""): string {
  const raw = (mimeType ?? "").trim().toLowerCase();
  if (raw === "image/jpg" || raw === "image/pjpeg") return "image/jpeg";
  if (raw.startsWith("image/")) return raw;
  const ext = uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? "image/jpeg";
}

export function extensionFor(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export interface PickedImage {
  uri: string;
  mimeType?: string | null;
  fileSize?: number | null;
}

/** French message when the picked file cannot be used as a profile photo, else null. */
export function validatePickedImage(asset: PickedImage): string | null {
  if (!asset.uri) return "Aucune image sélectionnée.";
  const mime = normalizeMime(asset.mimeType, asset.uri);
  if (!(ACCEPTED_SOURCE_TYPES as readonly string[]).includes(mime)) {
    return "Format non pris en charge. Choisissez une photo JPEG, PNG ou WebP.";
  }
  if (typeof asset.fileSize === "number" && asset.fileSize > MAX_SOURCE_BYTES) {
    return "Cette photo est trop lourde (30 Mo maximum). Choisissez-en une plus légère.";
  }
  return null;
}

/** Uploads a prepared local image (file:// uri) and returns its public https URL. */
export async function uploadImage(uri: string, mimeType = "image/jpeg"): Promise<string> {
  const mime = normalizeMime(mimeType, uri);
  if (!(UPLOADABLE_TYPES as readonly string[]).includes(mime)) {
    throw new ApiError("Format non pris en charge. Choisissez une photo JPEG, PNG ou WebP.", 400, null);
  }
  const form = new FormData();
  // React Native's FormData accepts { uri, name, type } for files.
  form.append("file", { uri, name: `avatar.${extensionFor(mime)}`, type: mime } as unknown as Blob);
  const body = await apiUpload<{ url?: string }>("/api/upload", form);
  if (typeof body?.url !== "string" || !/^https:\/\//i.test(body.url)) {
    throw new ApiError("Réponse inattendue du serveur. Réessayez.", 502, null);
  }
  return body.url;
}
