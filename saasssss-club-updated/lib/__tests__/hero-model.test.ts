import { describe, it, expect } from "vitest";
import {
  validateHeroModelFile, sanitizeTransform, sanitizeFileName, getHeroModelMaxBytes,
  DEFAULT_HERO_TRANSFORM, HERO_MODEL_DEFAULT_MAX_BYTES, HERO_MODEL_MAX_TRIANGLES,
} from "../hero-model";

const enc = new TextEncoder();

/** Builds a spec-shaped GLB: header + JSON chunk (+ optional BIN chunk). */
function glb(json: unknown, bin?: Uint8Array): Uint8Array {
  const pad = (b: Uint8Array, fill: number) => {
    const n = (4 - (b.length % 4)) % 4;
    const out = new Uint8Array(b.length + n).fill(fill);
    out.set(b);
    return out;
  };
  const j = pad(enc.encode(JSON.stringify(json)), 0x20);
  const b = bin ? pad(bin, 0) : null;
  const total = 12 + 8 + j.length + (b ? 8 + b.length : 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true); v.setUint32(4, 2, true); v.setUint32(8, total, true);
  v.setUint32(12, j.length, true); v.setUint32(16, 0x4e4f534a, true); out.set(j, 20);
  if (b) {
    const o = 20 + j.length;
    v.setUint32(o, b.length, true); v.setUint32(o + 4, 0x004e4942, true); out.set(b, o + 8);
  }
  return out;
}

const BASE = {
  asset: { version: "2.0" },
  scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  accessors: [{ count: 24 }, { count: 36 }],
  buffers: [{ byteLength: 8 }],
};
const MAX = HERO_MODEL_DEFAULT_MAX_BYTES;

describe("validateHeroModelFile", () => {
  it("accepts a valid self-contained .glb and reports a summary", () => {
    const r = validateHeroModelFile("Gloves.GLB", glb(BASE, new Uint8Array(8)), MAX);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.summary).toMatchObject({ format: "glb", contentType: "model/gltf-binary", meshes: 1, triangles: 12 });
  });

  it("accepts a .gltf only when buffers/images are embedded", () => {
    const embedded = { ...BASE, buffers: [{ byteLength: 8, uri: "data:application/octet-stream;base64,AAAAAAAAAAA=" }] };
    expect(validateHeroModelFile("m.gltf", enc.encode(JSON.stringify(embedded)), MAX).ok).toBe(true);
    const external = { ...BASE, buffers: [{ byteLength: 8, uri: "model.bin" }] };
    const r = validateHeroModelFile("m.gltf", enc.encode(JSON.stringify(external)), MAX);
    expect(r).toMatchObject({ ok: false, code: "external_uri" });
  });

  it("rejects wrong extensions, empty and oversized files", () => {
    expect(validateHeroModelFile("m.obj", glb(BASE), MAX)).toMatchObject({ ok: false, code: "extension" });
    expect(validateHeroModelFile("m.glb", new Uint8Array(0), MAX)).toMatchObject({ ok: false, code: "empty" });
    expect(validateHeroModelFile("m.glb", glb(BASE), 16)).toMatchObject({ ok: false, code: "too_large" });
  });

  it("checks the real bytes, not the name (renamed files are refused)", () => {
    expect(validateHeroModelFile("evil.glb", enc.encode("<html><script>alert(1)</script></html>".padEnd(64)), MAX)).toMatchObject({ ok: false, code: "glb_magic" });
    const bad = glb(BASE);
    new DataView(bad.buffer).setUint32(8, bad.length + 4, true); // lying length header
    expect(validateHeroModelFile("m.glb", bad, MAX)).toMatchObject({ ok: false, code: "glb_length" });
    const v1 = glb(BASE);
    new DataView(v1.buffer).setUint32(4, 1, true);
    expect(validateHeroModelFile("m.glb", v1, MAX)).toMatchObject({ ok: false, code: "glb_version" });
    expect(validateHeroModelFile("m.gltf", enc.encode("not json"), MAX)).toMatchObject({ ok: false, code: "gltf_json" });
  });

  it("rejects non-2.0 assets and files without any mesh", () => {
    expect(validateHeroModelFile("m.glb", glb({ ...BASE, asset: { version: "1.0" } }), MAX)).toMatchObject({ ok: false, code: "version" });
    expect(validateHeroModelFile("m.glb", glb({ asset: { version: "2.0" }, nodes: [{}] }), MAX)).toMatchObject({ ok: false, code: "no_mesh" });
  });

  it("rejects extensions that need a decoder the CSP does not allow", () => {
    for (const ext of ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"]) {
      const r = validateHeroModelFile("m.glb", glb({ ...BASE, extensionsRequired: [ext], extensionsUsed: [ext] }), MAX);
      expect(r).toMatchObject({ ok: false, code: "extension_unsupported" });
    }
    expect(validateHeroModelFile("m.glb", glb({ ...BASE, extensionsRequired: ["VENDOR_mystery"] }), MAX)).toMatchObject({ ok: false, code: "extension_unsupported" });
    expect(validateHeroModelFile("m.glb", glb({ ...BASE, extensionsUsed: ["KHR_materials_clearcoat"], extensionsRequired: ["KHR_materials_unlit"] }), MAX).ok).toBe(true);
  });

  it("rejects external / unsafe image sources", () => {
    const remote = { ...BASE, images: [{ uri: "https://evil.example/tex.png" }] };
    expect(validateHeroModelFile("m.glb", glb(remote), MAX)).toMatchObject({ ok: false, code: "external_uri" });
    const svg = { ...BASE, images: [{ uri: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" }] };
    expect(validateHeroModelFile("m.glb", glb(svg), MAX)).toMatchObject({ ok: false, code: "external_uri" });
    expect(validateHeroModelFile("m.glb", glb({ ...BASE, images: [{ bufferView: 0, mimeType: "image/svg+xml" }] }), MAX)).toMatchObject({ ok: false, code: "image_type" });
  });

  it("caps geometry so a phone cannot be frozen", () => {
    const heavy = { ...BASE, accessors: [{ count: 10 }, { count: (HERO_MODEL_MAX_TRIANGLES + 1) * 3 }] };
    expect(validateHeroModelFile("m.glb", glb(heavy), MAX)).toMatchObject({ ok: false, code: "complexity" });
    const tooManyMeshes = { ...BASE, meshes: Array.from({ length: 501 }, () => BASE.meshes[0]) };
    expect(validateHeroModelFile("m.glb", glb(tooManyMeshes), MAX)).toMatchObject({ ok: false, code: "complexity" });
  });
});

describe("transform + helpers", () => {
  it("clamps every transform value into the allowed range and fills defaults", () => {
    const t = sanitizeTransform({ scale: 99, rotation: { x: 999, y: -999, z: "12" }, position: { x: 50, y: NaN }, autoRotate: "yes" });
    expect(t.scale).toBe(3);
    expect(t.rotation).toEqual({ x: 180, y: -180, z: 12 });
    expect(t.position).toEqual({ x: 2, y: 0, z: 0 });
    expect(t.autoRotate).toBe(true);
    expect(sanitizeTransform(null)).toEqual(DEFAULT_HERO_TRANSFORM);
  });

  it("sanitizes file names and the env size limit", () => {
    expect(sanitizeFileName("../../etc/pass<wd>.glb")).toBe("passwd.glb");
    expect(sanitizeFileName("")).toBe("model");
    expect(getHeroModelMaxBytes({})).toBe(HERO_MODEL_DEFAULT_MAX_BYTES);
    expect(getHeroModelMaxBytes({ HERO_MODEL_MAX_BYTES: String(10 * 1048576) })).toBe(10 * 1048576);
    expect(getHeroModelMaxBytes({ HERO_MODEL_MAX_BYTES: "999999999999" })).toBeLessThanOrEqual(25 * 1048576);
    expect(getHeroModelMaxBytes({ HERO_MODEL_MAX_BYTES: "abc" })).toBe(HERO_MODEL_DEFAULT_MAX_BYTES);
  });
});
