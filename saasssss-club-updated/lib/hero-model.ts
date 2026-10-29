// lib/hero-model.ts
//
// Everything about an owner-uploaded 3D hero model (.glb / .gltf) that does NOT
// need the database or Node-only APIs, so the SAME rules run on the server
// (authoritative validation) and in the browser (instant feedback in
// /admin/appearance): limits, error messages, transform ranges and the file
// validator itself.
//
// Security model: a glTF file is data, not code — but it is still untrusted
// input. We therefore (1) check the real bytes, not the extension or MIME type
// sent by the client, (2) accept only self-contained files (no external URIs
// that could make a visitor's browser fetch a third-party URL), (3) accept only
// glTF extensions the viewer can decode locally (no Draco / KTX2, whose
// decoders would have to be fetched from a CDN that the site's CSP forbids),
// and (4) cap geometry/texture counts so a hostile or careless file cannot
// freeze a visitor's phone.

export const HERO_MODEL_DEFAULT_MAX_BYTES = 4 * 1024 * 1024; // fits Vercel's 4.5 MB body limit
export const HERO_MODEL_ABSOLUTE_MAX_BYTES = 25 * 1024 * 1024;
export const HERO_MODEL_MAX_TRIANGLES = 400_000;

const MAX_JSON_BYTES = 8 * 1024 * 1024;
const LIMITS = { meshes: 500, nodes: 5000, materials: 200, textures: 64, images: 64, animations: 64 } as const;

/** Server-side limit: HERO_MODEL_MAX_BYTES env (bytes), clamped to a sane range. */
export function getHeroModelMaxBytes(env: Record<string, string | undefined> = process.env): number {
  const raw = Number(env.HERO_MODEL_MAX_BYTES);
  if (!Number.isFinite(raw) || raw <= 0) return HERO_MODEL_DEFAULT_MAX_BYTES;
  return Math.min(Math.max(Math.floor(raw), 256 * 1024), HERO_MODEL_ABSOLUTE_MAX_BYTES);
}

// ─── Transform (owner adjustments) ─────────────────────────────────────────

export interface HeroModelTransform {
  /** Uniform scale multiplier on top of the auto-fit (1 = fits the frame). */
  scale: number;
  /** Degrees. */
  rotation: { x: number; y: number; z: number };
  /** Scene units; the camera frames roughly ±2 horizontally / ±1.5 vertically. */
  position: { x: number; y: number; z: number };
  /** Slow idle spin around the vertical axis. */
  autoRotate: boolean;
}

export const HERO_TRANSFORM_RANGES = {
  scale: { min: 0.2, max: 3, step: 0.05 },
  rotation: { min: -180, max: 180, step: 1 },
  position: { min: -2, max: 2, step: 0.05 },
} as const;

export const DEFAULT_HERO_TRANSFORM: HeroModelTransform = {
  scale: 1,
  rotation: { x: 0, y: 0, z: 0 },
  position: { x: 0, y: 0, z: 0 },
  autoRotate: true,
};

const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

/** Any input → a transform that is guaranteed to be inside the allowed ranges. */
export function sanitizeTransform(input: unknown): HeroModelTransform {
  const t = (input && typeof input === "object" ? input : {}) as Partial<HeroModelTransform> & {
    rotation?: Partial<HeroModelTransform["rotation"]>;
    position?: Partial<HeroModelTransform["position"]>;
  };
  const R = HERO_TRANSFORM_RANGES;
  return {
    scale: clamp(t.scale, R.scale.min, R.scale.max, 1),
    rotation: {
      x: clamp(t.rotation?.x, R.rotation.min, R.rotation.max, 0),
      y: clamp(t.rotation?.y, R.rotation.min, R.rotation.max, 0),
      z: clamp(t.rotation?.z, R.rotation.min, R.rotation.max, 0),
    },
    position: {
      x: clamp(t.position?.x, R.position.min, R.position.max, 0),
      y: clamp(t.position?.y, R.position.min, R.position.max, 0),
      z: clamp(t.position?.z, R.position.min, R.position.max, 0),
    },
    autoRotate: typeof t.autoRotate === "boolean" ? t.autoRotate : true,
  };
}

// ─── File validation ───────────────────────────────────────────────────────

export type HeroModelFormat = "glb" | "gltf";

export interface HeroModelSummary {
  format: HeroModelFormat;
  contentType: string;
  meshes: number;
  materials: number;
  textures: number;
  triangles: number;
  animations: number;
}

export type HeroModelValidation =
  | { ok: true; summary: HeroModelSummary }
  | { ok: false; code: string; message: string };

const fail = (code: string, message: string): HeroModelValidation => ({ ok: false, code, message });

const CONTENT_TYPES: Record<HeroModelFormat, string> = { glb: "model/gltf-binary", gltf: "model/gltf+json" };

// Extensions the in-browser loader decodes WITHOUT fetching anything.
const SUPPORTED_REQUIRED_EXTENSIONS = new Set([
  "KHR_mesh_quantization",
  "KHR_texture_transform",
  "KHR_lights_punctual",
  "KHR_materials_unlit",
  "KHR_materials_emissive_strength",
  "KHR_materials_clearcoat",
  "KHR_materials_transmission",
  "KHR_materials_volume",
  "KHR_materials_ior",
  "KHR_materials_specular",
  "KHR_materials_sheen",
  "KHR_materials_iridescence",
  "KHR_materials_anisotropy",
  "KHR_materials_dispersion",
  "EXT_texture_webp",
  "EXT_mesh_gpu_instancing",
]);
// These need a WebAssembly/Worker decoder; the site's CSP (no 'wasm-unsafe-eval',
// no third-party hosts) deliberately does not allow that.
const UNSUPPORTED_COMPRESSION: Record<string, string> = {
  KHR_draco_mesh_compression: "la compression Draco",
  EXT_meshopt_compression: "la compression meshopt",
  KHR_texture_basisu: "les textures KTX2/Basis",
};

const ALLOWED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const ALLOWED_BUFFER_DATA_MIME = /^data:(application\/octet-stream|application\/gltf-buffer);base64,/i;
const ALLOWED_IMAGE_DATA_URI = /^data:(image\/png|image\/jpeg|image\/webp);base64,/i;

export function extensionOf(fileName: string): HeroModelFormat | null {
  const m = /\.(glb|gltf)$/i.exec(fileName.trim());
  return m ? (m[1].toLowerCase() as HeroModelFormat) : null;
}

/** File name safe to store and display (no path, no control chars, bounded). */
export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "model";
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim();
  return (cleaned || "model").slice(0, 120);
}

function readGlbJson(bytes: Uint8Array): { json: unknown } | { error: HeroModelValidation } {
  if (bytes.byteLength < 28) return { error: fail("glb_truncated", "Fichier .glb incomplet ou corrompu.") };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) {
    return { error: fail("glb_magic", "Ce fichier n'est pas un vrai .glb (en-tête « glTF » absent).") };
  }
  if (view.getUint32(4, true) !== 2) {
    return { error: fail("glb_version", "Seul le format glTF 2.0 est pris en charge.") };
  }
  if (view.getUint32(8, true) !== bytes.byteLength) {
    return { error: fail("glb_length", "Fichier .glb corrompu (taille déclarée incohérente).") };
  }

  // Walk every chunk: lengths must be consistent, the first must be JSON.
  let offset = 12;
  let json: unknown;
  let jsonSeen = false;
  let binChunks = 0;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) return { error: fail("glb_chunk", "Fichier .glb corrompu (bloc tronqué).") };
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;
    if (chunkLength % 4 !== 0 || dataEnd > bytes.byteLength) {
      return { error: fail("glb_chunk", "Fichier .glb corrompu (bloc invalide).") };
    }
    if (!jsonSeen) {
      if (chunkType !== 0x4e4f534a) return { error: fail("glb_json", "Fichier .glb invalide (description de scène absente).") };
      if (chunkLength > MAX_JSON_BYTES) return { error: fail("json_big", "La description de la scène est trop volumineuse.") };
      try {
        json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(dataStart, dataEnd)));
      } catch {
        return { error: fail("glb_json", "Fichier .glb invalide (description de scène illisible).") };
      }
      jsonSeen = true;
    } else if (chunkType === 0x004e4942) {
      binChunks += 1;
      if (binChunks > 1) return { error: fail("glb_chunk", "Fichier .glb invalide (plusieurs blocs binaires).") };
    }
    offset = dataEnd;
  }
  if (!jsonSeen) return { error: fail("glb_json", "Fichier .glb invalide (description de scène absente).") };
  return { json };
}

function readGltfJson(bytes: Uint8Array): { json: unknown } | { error: HeroModelValidation } {
  if (bytes.byteLength > MAX_JSON_BYTES * 2) return { error: fail("too_large", "Fichier .gltf trop volumineux.") };
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "").trimStart();
    if (!text.startsWith("{")) return { error: fail("gltf_json", "Ce fichier n'est pas un .gltf valide.") };
    return { json: JSON.parse(text) };
  } catch {
    return { error: fail("gltf_json", "Ce fichier n'est pas un .gltf valide.") };
  }
}

type Json = Record<string, unknown>;
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Json[]) : []);

function countTriangles(doc: Json): number {
  const accessors = arr(doc.accessors);
  let triangles = 0;
  for (const mesh of arr(doc.meshes)) {
    for (const prim of arr(mesh.primitives)) {
      const mode = typeof prim.mode === "number" ? prim.mode : 4;
      if (mode !== 4 && mode !== 5 && mode !== 6) continue; // points/lines add no triangles
      const idx = typeof prim.indices === "number" ? accessors[prim.indices] : undefined;
      const pos = prim.attributes && typeof prim.attributes === "object" ? (prim.attributes as Json).POSITION : undefined;
      const posAcc = typeof pos === "number" ? accessors[pos] : undefined;
      const count = Number((idx ?? posAcc)?.count ?? 0);
      if (Number.isFinite(count) && count > 0) triangles += mode === 4 ? Math.floor(count / 3) : Math.max(count - 2, 0);
    }
  }
  return triangles;
}

/**
 * Validates an uploaded model from its REAL bytes. Pure and synchronous.
 * `isGlb` follows the file extension, but the content must then match it.
 */
export function validateHeroModelFile(fileName: string, bytes: Uint8Array, maxBytes: number): HeroModelValidation {
  const format = extensionOf(fileName);
  if (!format) return fail("extension", "Format non pris en charge : choisissez un fichier .glb ou .gltf.");
  if (bytes.byteLength === 0) return fail("empty", "Le fichier est vide.");
  if (bytes.byteLength > maxBytes) {
    return fail("too_large", `Fichier trop volumineux (${(bytes.byteLength / 1048576).toFixed(1)} Mo). Maximum : ${(maxBytes / 1048576).toFixed(0)} Mo. Optimisez le modèle (textures plus petites, moins de polygones).`);
  }

  const parsed = format === "glb" ? readGlbJson(bytes) : readGltfJson(bytes);
  if ("error" in parsed) return parsed.error;
  const doc = parsed.json;
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return fail("gltf_json", "Fichier glTF invalide.");
  const gltf = doc as Json;

  const version = String((gltf.asset as Json | undefined)?.version ?? "");
  if (!/^2\.\d+$/.test(version)) return fail("version", "Seul le format glTF 2.0 est pris en charge.");

  const meshes = arr(gltf.meshes);
  if (meshes.length === 0) return fail("no_mesh", "Ce fichier ne contient aucun objet 3D (aucun maillage).");

  const counts = {
    meshes: meshes.length,
    nodes: arr(gltf.nodes).length,
    materials: arr(gltf.materials).length,
    textures: arr(gltf.textures).length,
    images: arr(gltf.images).length,
    animations: arr(gltf.animations).length,
  };
  for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    if (counts[key] > LIMITS[key]) return fail("complexity", `Modèle trop complexe (${counts[key]} ${key}, maximum ${LIMITS[key]}).`);
  }

  // Required extensions: only what the viewer can decode offline.
  const required = Array.isArray(gltf.extensionsRequired) ? (gltf.extensionsRequired as unknown[]).map(String) : [];
  for (const ext of required) {
    if (UNSUPPORTED_COMPRESSION[ext]) {
      return fail("extension_unsupported", `Ce modèle utilise ${UNSUPPORTED_COMPRESSION[ext]}, non prise en charge. Réexportez-le sans compression Draco/meshopt/KTX2 (réduisez plutôt la taille des textures).`);
    }
    if (!SUPPORTED_REQUIRED_EXTENSIONS.has(ext)) {
      return fail("extension_unsupported", `Extension glTF non prise en charge : ${ext.slice(0, 60)}.`);
    }
  }
  const used = Array.isArray(gltf.extensionsUsed) ? (gltf.extensionsUsed as unknown[]).map(String) : [];
  for (const ext of used) {
    if (UNSUPPORTED_COMPRESSION[ext] && !required.includes(ext)) {
      return fail("extension_unsupported", `Ce modèle utilise ${UNSUPPORTED_COMPRESSION[ext]}, non prise en charge. Réexportez-le sans compression Draco/meshopt/KTX2.`);
    }
  }

  // Self-contained only: no URI may point outside the file.
  for (const buffer of arr(gltf.buffers)) {
    if (buffer.uri === undefined) {
      if (format === "gltf") return fail("external_uri", "Ce .gltf dépend d'un fichier externe. Exportez en .glb (tout-en-un).");
      continue; // GLB: the BIN chunk
    }
    if (typeof buffer.uri !== "string" || !ALLOWED_BUFFER_DATA_MIME.test(buffer.uri)) {
      return fail("external_uri", "Ce modèle référence des fichiers externes (.bin, URL…). Exportez-le en .glb tout-en-un.");
    }
  }
  for (const image of arr(gltf.images)) {
    if (image.uri !== undefined && (typeof image.uri !== "string" || !ALLOWED_IMAGE_DATA_URI.test(image.uri))) {
      return fail("external_uri", "Ce modèle référence des textures externes. Exportez-le en .glb avec textures intégrées.");
    }
    if (image.mimeType !== undefined && !ALLOWED_IMAGE_MIME.has(String(image.mimeType))) {
      return fail("image_type", "Textures non prises en charge : utilisez PNG, JPEG ou WebP.");
    }
  }

  const triangles = countTriangles(gltf);
  if (triangles > HERO_MODEL_MAX_TRIANGLES) {
    return fail("complexity", `Modèle trop lourd (${triangles.toLocaleString("fr-FR")} triangles, maximum ${HERO_MODEL_MAX_TRIANGLES.toLocaleString("fr-FR")}). Simplifiez-le pour garder un site fluide sur mobile.`);
  }

  return {
    ok: true,
    summary: {
      format,
      contentType: CONTENT_TYPES[format],
      meshes: counts.meshes,
      materials: counts.materials,
      textures: counts.textures,
      triangles,
      animations: counts.animations,
    },
  };
}
