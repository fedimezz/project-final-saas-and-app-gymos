// Procedural 3D hero objects (three.js primitives — no extra assets to download).
// Every builder returns a Group centered on the origin and normalized so its
// bounding sphere has radius ~1.5, so the scene can frame any model the same.
// Colors come from the club's brand (primary = accents, secondary = details).
import * as THREE from "three";
import type { HeroModelId } from "@/lib/website-themes";

export interface ModelPalette {
  primary: THREE.ColorRepresentation;
  secondary: THREE.ColorRepresentation;
}

const metal = (color: THREE.ColorRepresentation, rough = 0.32) =>
  new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: rough });
const matte = (color: THREE.ColorRepresentation, rough = 0.7) =>
  new THREE.MeshStandardMaterial({ color, metalness: 0.05, roughness: rough });
const rubber = () => matte(0x1b1b1f, 0.85);

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number] = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  return m;
}

function cyl(rTop: number, rBottom: number, h: number, mat: THREE.Material, seg = 48) {
  return mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), mat);
}

/** Scale/center so the bounding sphere radius is `radius`. */
function normalize(group: THREE.Group, radius = 1.5): THREE.Group {
  const box = new THREE.Box3().setFromObject(group);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const wrapper = new THREE.Group();
  group.position.sub(sphere.center);
  wrapper.add(group);
  wrapper.scale.setScalar(radius / Math.max(sphere.radius, 0.0001));
  return wrapper;
}

// A weight plate: extruded disc with a real center hole + raised rim + colored ring.
function plate(radius: number, thickness: number, accent: THREE.ColorRepresentation): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, radius * 0.16, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSize: thickness * 0.18,
    bevelThickness: thickness * 0.18,
    bevelSegments: 3,
    curveSegments: 64,
  });
  geo.translate(0, 0, -thickness / 2);
  g.add(mesh(geo, rubber()));
  // raised outer rim + inner ring in the brand color, both faces
  for (const z of [thickness / 2 + 0.005, -thickness / 2 - 0.005]) {
    const rim = mesh(new THREE.TorusGeometry(radius * 0.9, radius * 0.025, 12, 96), metal(accent, 0.35), [0, 0, z]);
    const inner = mesh(new THREE.TorusGeometry(radius * 0.34, radius * 0.03, 12, 64), metal(accent, 0.35), [0, 0, z]);
    g.add(rim, inner);
  }
  return g;
}

function dumbbell(p: ModelPalette): THREE.Group {
  const g = new THREE.Group();
  const steel = metal(0xb8bcc4, 0.28);
  const handle = cyl(0.11, 0.11, 2.2, steel, 32);
  handle.rotation.z = Math.PI / 2;
  g.add(handle);
  // knurled grip band
  const grip = cyl(0.125, 0.125, 0.9, metal(0x4a4a52, 0.5), 32);
  grip.rotation.z = Math.PI / 2;
  g.add(grip);
  for (const side of [-1, 1]) {
    // hexagonal heads (the shape that doesn't roll away)
    const head = cyl(0.62, 0.62, 0.55, rubber(), 6);
    head.rotation.z = Math.PI / 2;
    head.position.x = side * 1.2;
    const cap = cyl(0.4, 0.4, 0.62, metal(p.primary, 0.3), 6);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = side * 1.2;
    const collar = cyl(0.17, 0.17, 0.2, steel, 24);
    collar.rotation.z = Math.PI / 2;
    collar.position.x = side * 0.82;
    g.add(head, cap, collar);
  }
  return g;
}

function barbell(p: ModelPalette): THREE.Group {
  const g = new THREE.Group();
  const bar = cyl(0.07, 0.07, 6, metal(0xcfd3da, 0.22), 24);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  const sizes = [
    { r: 1.05, t: 0.2, c: p.primary },
    { r: 0.88, t: 0.17, c: p.secondary },
    { r: 0.7, t: 0.14, c: p.primary },
  ];
  for (const side of [-1, 1]) {
    let x = side * 1.55;
    for (const s of sizes) {
      const pl = plate(s.r, s.t, s.c);
      pl.rotation.y = Math.PI / 2;
      pl.position.x = x;
      g.add(pl);
      x += side * (s.t + 0.06);
    }
    const collar = cyl(0.14, 0.14, 0.16, metal(0x2a2a30, 0.35), 24);
    collar.rotation.z = Math.PI / 2;
    collar.position.x = x + side * 0.1;
    g.add(collar);
  }
  g.rotation.z = 0.18;
  return g;
}

function kettlebell(p: ModelPalette): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(1, 64, 48), metal(0x23232a, 0.42));
  body.scale.set(1, 0.93, 1);
  g.add(body);
  // flat base
  g.add(mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.12, 48), metal(0x18181d, 0.5), [0, -0.9, 0]));
  // handle: thick torus arc rising from the shoulders
  const handle = mesh(new THREE.TorusGeometry(0.62, 0.15, 24, 64, Math.PI * 1.08), metal(0x23232a, 0.4));
  handle.rotation.z = -Math.PI * 0.04 + Math.PI * 0.46;
  handle.position.set(0, 0.62, 0);
  handle.scale.set(1, 1.12, 1);
  g.add(handle);
  // brand-colored label band
  const band = mesh(new THREE.TorusGeometry(0.98, 0.07, 16, 80), metal(p.primary, 0.3), [0, 0.02, 0]);
  band.rotation.x = Math.PI / 2;
  band.scale.set(1, 1, 1.8);
  g.add(band);
  const disc = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 40), matte(p.primary, 0.5), [0, 0.02, 0.975]);
  disc.rotation.x = Math.PI / 2;
  g.add(disc);
  return g;
}

function boxingGlove(p: ModelPalette): THREE.Group {
  const g = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ color: p.primary, metalness: 0.15, roughness: 0.38 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x151518, metalness: 0.1, roughness: 0.6 });
  // fist: big rounded mass
  const fist = mesh(new THREE.SphereGeometry(1, 56, 44), leather, [0, 0.35, 0]);
  fist.scale.set(1.0, 0.92, 0.88);
  g.add(fist);
  // back padding
  const pad = mesh(new THREE.SphereGeometry(0.75, 40, 32), leather, [0, 0.05, -0.38]);
  pad.scale.set(1.0, 1.1, 0.9);
  g.add(pad);
  // thumb
  const thumb = mesh(new THREE.CapsuleGeometry(0.28, 0.55, 12, 24), leather, [0.78, -0.02, 0.32]);
  thumb.rotation.set(0.2, 0, -0.9);
  g.add(thumb);
  // cuff + strap
  const cuff = cyl(0.6, 0.66, 0.85, dark, 48);
  cuff.position.set(0, -0.95, -0.12);
  g.add(cuff);
  const strap = mesh(new THREE.TorusGeometry(0.64, 0.07, 14, 64), matte(p.secondary, 0.5), [0, -0.78, -0.12]);
  strap.rotation.x = Math.PI / 2;
  g.add(strap);
  // laces/stitch line
  const stitch = mesh(new THREE.TorusGeometry(0.98, 0.022, 10, 80, Math.PI * 0.9), matte(0xf5f5f5, 0.7), [0, 0.28, 0.02]);
  stitch.rotation.set(0, Math.PI / 2, Math.PI * 0.55);
  g.add(stitch);
  g.rotation.set(0.1, -0.5, -0.35);
  return g;
}

function weightPlate(p: ModelPalette): THREE.Group {
  const g = new THREE.Group();
  g.add(plate(1.5, 0.34, p.primary));
  // hub
  g.add(mesh(new THREE.TorusGeometry(0.28, 0.06, 14, 48), metal(0xc9ccd2, 0.3), [0, 0, 0.2]));
  g.rotation.set(0.25, 0, 0);
  return g;
}

function medicineBall(p: ModelPalette): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(1, 64, 48), matte(p.primary, 0.55)));
  const seam = matte(0x0e0e11, 0.8);
  const t1 = mesh(new THREE.TorusGeometry(1.002, 0.028, 12, 96), seam);
  const t2 = mesh(new THREE.TorusGeometry(1.002, 0.028, 12, 96), seam);
  t2.rotation.y = Math.PI / 2;
  const t3 = mesh(new THREE.TorusGeometry(0.72, 0.024, 12, 80), seam, [0, 0.7, 0]);
  t3.rotation.x = Math.PI / 2;
  const t4 = mesh(new THREE.TorusGeometry(0.72, 0.024, 12, 80), seam, [0, -0.7, 0]);
  t4.rotation.x = Math.PI / 2;
  const band = mesh(new THREE.TorusGeometry(1.004, 0.06, 14, 96), matte(p.secondary, 0.5));
  band.rotation.x = Math.PI / 2;
  g.add(t1, t2, t3, t4, band);
  return g;
}

function punchingBag(p: ModelPalette): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(0.62, 1.9, 16, 40), new THREE.MeshStandardMaterial({ color: p.primary, metalness: 0.1, roughness: 0.5 }), [0, -0.5, 0]);
  g.add(body);
  for (const y of [-1.05, 0.05]) {
    const strap = mesh(new THREE.TorusGeometry(0.635, 0.05, 12, 64), matte(0x151518, 0.6), [0, y, 0]);
    strap.rotation.x = Math.PI / 2;
    g.add(strap);
  }
  const top = cyl(0.5, 0.62, 0.22, matte(0x151518, 0.6), 40);
  top.position.y = 0.62;
  g.add(top);
  // chains
  for (let i = 0; i < 4; i++) {
    const link = mesh(new THREE.TorusGeometry(0.1, 0.028, 10, 24), metal(0xc9ccd2, 0.3), [0, 0.88 + i * 0.2, 0]);
    link.rotation.y = i % 2 ? 0 : Math.PI / 2;
    g.add(link);
  }
  const stripe = mesh(new THREE.TorusGeometry(0.632, 0.07, 12, 64), matte(p.secondary, 0.5), [0, -0.45, 0]);
  stripe.rotation.x = Math.PI / 2;
  g.add(stripe);
  return g;
}

function zenStones(p: ModelPalette): THREE.Group {
  const g = new THREE.Group();
  const specs: Array<{ r: number; y: number; color: THREE.ColorRepresentation; sx: number; sz: number }> = [
    { r: 1.0, y: -0.7, color: 0x8a8580, sx: 1.18, sz: 1.0 },
    { r: 0.78, y: -0.12, color: 0xb7aea3, sx: 1.12, sz: 0.95 },
    { r: 0.56, y: 0.35, color: p.secondary, sx: 1.08, sz: 1.0 },
    { r: 0.36, y: 0.72, color: 0xd9d2c8, sx: 1.05, sz: 1.0 },
  ];
  for (const s of specs) {
    const stone = mesh(new THREE.SphereGeometry(s.r, 48, 36), matte(s.color, 0.85), [0, s.y, 0]);
    stone.scale.set(s.sx, 0.5, s.sz);
    g.add(stone);
  }
  // soft halo ring in the brand color
  const halo = mesh(new THREE.TorusGeometry(1.5, 0.025, 12, 128), new THREE.MeshStandardMaterial({ color: p.primary, emissive: p.primary, emissiveIntensity: 0.6 }), [0, 0.2, 0]);
  halo.rotation.x = Math.PI / 2.4;
  g.add(halo);
  return g;
}

const BUILDERS: Record<HeroModelId, (p: ModelPalette) => THREE.Group> = {
  dumbbell,
  kettlebell,
  barbell,
  "boxing-glove": boxingGlove,
  "weight-plate": weightPlate,
  "medicine-ball": medicineBall,
  "punching-bag": punchingBag,
  "zen-stones": zenStones,
};

export function buildHeroModel(id: HeroModelId, palette: ModelPalette): THREE.Group {
  return normalize(BUILDERS[id](palette));
}

/** Free GPU memory for a model built by buildHeroModel. */
export function disposeModel(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

/** Per-model motion: how the object moves so each feels like what it is. */
export type MotionStyle = "spin" | "tumble" | "jab" | "float" | "swing";
export const MODEL_MOTION: Record<HeroModelId, MotionStyle> = {
  dumbbell: "spin",
  kettlebell: "tumble",
  barbell: "spin",
  "boxing-glove": "jab",
  "weight-plate": "spin",
  "medicine-ball": "tumble",
  "punching-bag": "swing",
  "zen-stones": "float",
};
