import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/** Longest side of the uploaded avatar. 1024 px is far more than the 84 px it is shown at, even on a 3x screen. */
export const AVATAR_MAX_SIDE = 1024;
const JPEG_QUALITY = 0.8;

export interface PreparedAvatar {
  uri: string;
  mimeType: "image/jpeg";
}

/**
 * Shrinks a freshly picked photo and re-encodes it as JPEG before upload.
 *
 * Why this exists: with `allowsEditing` the cropped file keeps the camera's full resolution,
 * and the picker's `quality` only changes JPEG compression, not the pixel count. A 12-50 MP
 * phone photo is several MB, which exceeds the ~4.5 MB request limit of serverless hosting
 * (the request is rejected before it reaches our API) and is slow to send on mobile data.
 * Re-encoding as JPEG also removes HEIC/PNG-with-alpha surprises: the backend only accepts
 * JPEG/PNG/WebP/GIF/AVIF and checks the real bytes.
 */
export async function prepareAvatar(asset: { uri: string; width?: number | null; height?: number | null }): Promise<PreparedAvatar> {
  const context = ImageManipulator.manipulate(asset.uri);
  try {
    const width = asset.width ?? 0;
    const height = asset.height ?? 0;
    // Only ever downscale. Unknown dimensions: cap the width, the manipulator keeps the ratio.
    if (!width || !height) {
      context.resize({ width: AVATAR_MAX_SIDE });
    } else if (Math.max(width, height) > AVATAR_MAX_SIDE) {
      context.resize(width >= height ? { width: AVATAR_MAX_SIDE } : { height: AVATAR_MAX_SIDE });
    }
    const rendered = await context.renderAsync();
    try {
      const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
      return { uri: saved.uri, mimeType: "image/jpeg" };
    } finally {
      rendered.release();
    }
  } finally {
    context.release();
  }
}
