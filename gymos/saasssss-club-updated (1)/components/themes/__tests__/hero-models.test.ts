// Every selectable 3D hero object must build (no WebGL needed — geometry only),
// be non-empty, centered and normalized to the radius the scene is framed for,
// and dispose cleanly.
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildHeroModel, disposeModel, MODEL_MOTION } from "../hero3d/models";
import { HERO_MODEL_IDS } from "@/lib/website-themes";

describe.each(HERO_MODEL_IDS)("hero model %s", (id) => {
  it("builds a centered object of the expected size", () => {
    const model = buildHeroModel(id, { primary: "#ef4444", secondary: "#f59e0b" });
    let meshes = 0;
    model.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes += 1; });
    expect(meshes).toBeGreaterThan(2);
    const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
    expect(sphere.radius).toBeGreaterThan(1.3);
    expect(sphere.radius).toBeLessThan(1.7);
    expect(sphere.center.length()).toBeLessThan(0.05);
    expect(MODEL_MOTION[id]).toBeTruthy();
    expect(() => disposeModel(model)).not.toThrow();
  });
});
