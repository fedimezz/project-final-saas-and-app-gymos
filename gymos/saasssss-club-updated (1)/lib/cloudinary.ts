// Cloudinary config + upload helper.
//
// Requires these three env vars to be set (Cloudinary dashboard → Account
// Details, or a Cloudinary "API Environment variable" if you prefer):
//   CLOUDINARY_CLOUD_NAME
//   CLOUDINARY_API_KEY
//   CLOUDINARY_API_SECRET
//
// On Vercel (or any host with a read-only/ephemeral filesystem), writing
// uploads to disk doesn't survive redeploys — Cloudinary is the fix.
import { v2 as cloudinary } from "cloudinary";

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

export const isCloudinaryConfigured = Boolean(CLOUD_NAME && API_KEY && API_SECRET);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true,
  });
}

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  bytes: number;
  format?: string;
}

/**
 * Uploads a Buffer to Cloudinary and resolves with the result (secure_url,
 * public_id, etc). Rejects if Cloudinary isn't configured or the upload
 * fails.
 */
export function uploadBufferToCloudinary(
  buffer: Buffer,
  options: { folder: string; resourceType?: "image" | "video" | "raw" | "auto" }
): Promise<CloudinaryUploadResult> {
  if (!isCloudinaryConfigured) {
    return Promise.reject(
      new Error(
        "Cloudinary n'est pas configuré : définissez CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET."
      )
    );
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      // 60s hard ceiling: a stalled Cloudinary call must not pin the function.
      { folder: options.folder, resource_type: options.resourceType ?? "auto", timeout: 60_000 },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Échec du téléversement Cloudinary"));
          return;
        }
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
          bytes: result.bytes,
          format: result.format,
        });
      }
    );
    stream.end(buffer);
  });
}

export default cloudinary;
