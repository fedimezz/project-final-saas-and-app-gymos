// The custom-model path end to end WITHOUT a browser: a real binary .glb is
// validated with the shared rules, parsed by three's GLTFLoader (what the hero
// scene uses), fitted to the frame the scene is composed for and disposed.
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { fitModelToFrame } from "../hero3d/models";
import { disposeModel } from "../hero3d/models";
import { validateHeroModelFile, HERO_MODEL_DEFAULT_MAX_BYTES } from "@/lib/hero-model";

/** A 10 × 10 × 10 pyramid-ish solid (4 vertices, 4 triangles) as a spec-compliant GLB. */
function pyramidGlb(): ArrayBuffer {
  const positions = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]);
  const indices = new Uint16Array([0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3]);
  const bin = new Uint8Array(positions.byteLength + indices.byteLength);
  bin.set(new Uint8Array(positions.buffer), 0);
  bin.set(new Uint8Array(indices.buffer), positions.byteLength);
  const json = {
    asset: { version: "2.0" },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [0, 0, 0], max: [10, 10, 10] },
      { bufferView: 1, componentType: 5123, count: 12, type: "SCALAR" },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }, { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength }],
    buffers: [{ byteLength: bin.byteLength }],
  };
  const pad = (b: Uint8Array, fill: number) => {
    const out = new Uint8Array(b.length + ((4 - (b.length % 4)) % 4)).fill(fill);
    out.set(b);
    return out;
  };
  const j = pad(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const b = pad(bin, 0);
  const total = 12 + 8 + j.length + 8 + b.length;
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true); v.setUint32(4, 2, true); v.setUint32(8, total, true);
  v.setUint32(12, j.length, true); v.setUint32(16, 0x4e4f534a, true); out.set(j, 20);
  const o = 20 + j.length;
  v.setUint32(o, b.length, true); v.setUint32(o + 4, 0x004e4942, true); out.set(b, o + 8);
  return out.buffer;
}

describe("custom hero model pipeline", () => {
  it("validates, parses, fits to the hero frame, and disposes", async () => {
    const buffer = pyramidGlb();
    const verdict = validateHeroModelFile("pyramid.glb", new Uint8Array(buffer), HERO_MODEL_DEFAULT_MAX_BYTES);
    expect(verdict).toMatchObject({ ok: true, summary: { meshes: 1, triangles: 4 } });

    const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => new GLTFLoader().parse(buffer, "", resolve, reject));
    const fitted = fitModelToFrame(gltf.scene);

    const sphere = new THREE.Box3().setFromObject(fitted).getBoundingSphere(new THREE.Sphere());
    expect(sphere.radius).toBeGreaterThan(1.3); // same frame as the built-in objects
    expect(sphere.radius).toBeLessThan(1.7);
    expect(sphere.center.length()).toBeLessThan(0.05); // centered
    expect(() => disposeModel(fitted)).not.toThrow();
  });

  it("surfaces a corrupt file as a loader error (the scene then falls back to the built-in object)", async () => {
    const bad = new Uint8Array(pyramidGlb());
    bad.fill(0x41, 20, 60); // trash the JSON chunk
    await expect(new Promise((resolve, reject) => new GLTFLoader().parse(bad.buffer, "", resolve, reject))).rejects.toBeDefined();
  });
});
