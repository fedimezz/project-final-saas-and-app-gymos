// Procedural 3D hero objects (three.js primitives — no extra assets to download).
// Every builder returns a Group centered on the origin and normalized so its
// bounding sphere has radius ~1.5, so the scene can frame any model the same.
// Colors come from the club's brand (primary = accents, secondary = details).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
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


// ── Added objects (second batch) ─────────────────────────────────────────────

function trophy(p: ModelPalette): THREE.Group {
  const g = new THREE.Group();
  const gold = metal(p.primary, 0.2);
  const dark = matte(0x15151a, 0.55);
  // two-tier base
  g.add(cyl(0.95, 1.05, 0.2, dark, 56), cyl(0.72, 0.84, 0.22, metal(p.secondary, 0.3), 56));
  g.children[0].position.y = -1.55;
  g.children[1].position.y = -1.34;
  // stem + knop
  const stem = cyl(0.15, 0.22, 0.75, gold, 32);
  stem.position.y = -0.85;
  const knop = mesh(new THREE.SphereGeometry(0.3, 32, 24), gold, [0, -0.45, 0]);
  knop.scale.y = 0.8;
  g.add(stem, knop);
  // cup: a lathe profile, open at the top, visible from inside
  const profile = [
    [0.06, -0.42], [0.26, -0.32], [0.52, -0.05], [0.8, 0.4], [0.93, 0.9], [0.96, 1.3],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const cupMat = new THREE.MeshStandardMaterial({ color: p.primary, metalness: 0.9, roughness: 0.2, side: THREE.DoubleSide });
  g.add(mesh(new THREE.LatheGeometry(profile, 64), cupMat));
  g.add(mesh(new THREE.TorusGeometry(0.96, 0.05, 16, 80), gold, [0, 1.3, 0]).rotateX(Math.PI / 2));
  // handles
  for (const side of [-1, 1]) {
    const h = mesh(new THREE.TorusGeometry(0.42, 0.07, 16, 40, Math.PI * 1.2), gold, [side * 0.9, 0.78, 0]);
    h.rotation.z = side === 1 ? -Math.PI * 0.6 : Math.PI * 0.4;
    g.add(h);
  }
  // engraved band
  const band = mesh(new THREE.TorusGeometry(0.7, 0.04, 12, 64), metal(p.secondary, 0.3), [0, 0.2, 0]);
  band.rotation.x = Math.PI / 2;
  g.add(band);
  return g;
}

function stopwatch(p: ModelPalette): THREE.Group {
  const g = new THREE.Group();
  const steel = metal(0xc9ccd2, 0.25);
  const body = cyl(1.1, 1.1, 0.5, steel, 64);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  g.add(mesh(new THREE.TorusGeometry(1.1, 0.1, 20, 80), metal(p.primary, 0.28), [0, 0, 0.25]));
  const face = cyl(1.0, 1.0, 0.02, matte(0xf4f4f0, 0.5), 64);
  face.rotation.x = Math.PI / 2;
  face.position.z = 0.26;
  g.add(face);
  // 12 ticks (quarters in the brand color)
  for (let i = 0; i < 12; i++) {
    const major = i % 3 === 0;
    const tick = mesh(new THREE.BoxGeometry(major ? 0.08 : 0.04, major ? 0.2 : 0.12, 0.02), matte(major ? p.primary : 0x1b1b1f, 0.5));
    const a = (i / 12) * Math.PI * 2;
    tick.position.set(Math.sin(a) * 0.8, Math.cos(a) * 0.8, 0.285);
    tick.rotation.z = -a;
    g.add(tick);
  }
  // hand + hub
  const handGeo = new THREE.BoxGeometry(0.06, 0.78, 0.02);
  handGeo.translate(0, 0.3, 0);
  const hand = mesh(handGeo, matte(p.secondary, 0.4), [0, 0, 0.3]);
  hand.rotation.z = -0.9;
  g.add(hand);
  const hub = cyl(0.09, 0.09, 0.06, steel, 24);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 0.32;
  g.add(hub);
  // crown + side button
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 24), steel, [0, 1.28, 0]));
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 24), metal(p.primary, 0.3), [0, 1.5, 0]));
  const side = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.28, 20), steel, [0.8, 0.8, 0]);
  side.rotation.z = -Math.PI / 4;
  g.add(side);
  return g;
}

function proteinShaker(p: ModelPalette): THREE.Group {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.0, roughness: 0.08, transparent: true, opacity: 0.32 });
  g.add(mesh(new THREE.CylinderGeometry(0.64, 0.5, 2.1, 56, 1, true), glass));
  // protein inside
  g.add(mesh(new THREE.CylinderGeometry(0.58, 0.47, 1.25, 48), matte(p.primary, 0.55), [0, -0.38, 0]));
  g.add(cyl(0.5, 0.5, 0.1, matte(0x15151a, 0.6), 48));
  g.children[g.children.length - 1].position.y = -1.08;
  // measuring rings
  for (const y of [-0.2, 0.25, 0.7]) {
    const ring = mesh(new THREE.TorusGeometry(0.6 - (0.7 - y) * 0.045, 0.012, 8, 56), matte(0xffffff, 0.5), [0, y, 0]);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }
  // lid, spout and flip cap
  g.add(mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.3, 56), matte(0x15151a, 0.5), [0, 1.2, 0]));
  g.add(mesh(new THREE.CylinderGeometry(0.4, 0.56, 0.26, 40), matte(0x15151a, 0.5), [0, 1.48, 0]));
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.22, 28), matte(p.primary, 0.4), [0, 1.7, 0]));
  const loop = mesh(new THREE.TorusGeometry(0.22, 0.045, 12, 32), matte(p.secondary, 0.5), [0.36, 1.6, 0]);
  g.add(loop);
  return g;
}

function yogaMat(p: ModelPalette): THREE.Group {
  const g = new THREE.Group();
  const roll = cyl(0.82, 0.82, 2.6, matte(p.primary, 0.62), 64);
  roll.rotation.z = Math.PI / 2;
  g.add(roll);
  // the spiral you see on each end of a rolled mat
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 140; i++) {
    const t = i / 140;
    const a = t * Math.PI * 2 * 3.4;
    const r = 0.1 + t * 0.7;
    pts.push(new THREE.Vector3(0, Math.sin(a) * r, Math.cos(a) * r));
  }
  const spiral = new THREE.CatmullRomCurve3(pts);
  for (const side of [-1, 1]) {
    const m = mesh(new THREE.TubeGeometry(spiral, 160, 0.02, 6, false), matte(p.secondary, 0.6), [side * 1.305, 0, 0]);
    g.add(m);
  }
  // two straps
  for (const x of [-0.75, 0.75]) {
    const strap = mesh(new THREE.TorusGeometry(0.84, 0.05, 12, 64), matte(p.secondary, 0.5), [x, 0, 0]);
    strap.rotation.y = Math.PI / 2;
    g.add(strap);
  }
  g.rotation.set(0.35, -0.5, 0.1);
  return g;
}

function plyoBox(p: ModelPalette): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new RoundedBoxGeometry(2.1, 1.7, 1.7, 4, 0.12), matte(0xc79a5b, 0.7)));
  // pad on top, brand stripe around the sides, logo disc on the front
  g.add(mesh(new RoundedBoxGeometry(1.8, 0.06, 1.4, 2, 0.02), matte(p.primary, 0.55), [0, 0.86, 0]));
  g.add(mesh(new THREE.BoxGeometry(2.13, 0.22, 1.73), matte(p.primary, 0.55), [0, -0.1, 0]));
  const logo = cyl(0.3, 0.3, 0.03, matte(p.secondary, 0.4), 40);
  logo.rotation.x = Math.PI / 2;
  logo.position.set(0, -0.1, 0.875);
  g.add(logo);
  g.rotation.set(0.4, 0.55, 0);
  return g;
}

function jumpRope(p: ModelPalette): THREE.Group {
  const g = new THREE.Group();
  const grip = matte(p.primary, 0.5);
  const steel = metal(0xc9ccd2, 0.3);
  for (const side of [-1, 1]) {
    const h = cyl(0.14, 0.14, 1.0, grip, 28);
    h.position.set(side * 1.2, -0.95, 0);
    const cap = mesh(new THREE.SphereGeometry(0.14, 20, 14), steel, [side * 1.2, -1.45, 0]);
    const ring = cyl(0.17, 0.17, 0.1, steel, 24);
    ring.position.set(side * 1.2, -0.42, 0);
    g.add(h, cap, ring);
  }
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.2, -0.35, 0), new THREE.Vector3(-1.75, 0.45, 0.25), new THREE.Vector3(-1.25, 1.35, 0.45),
    new THREE.Vector3(0, 1.95, 0.55), new THREE.Vector3(1.25, 1.35, 0.45), new THREE.Vector3(1.75, 0.45, 0.25),
    new THREE.Vector3(1.2, -0.35, 0),
  ]);
  g.add(mesh(new THREE.TubeGeometry(curve, 140, 0.05, 10, false), matte(p.secondary, 0.55)));
  return g;
}

function lotus(p: ModelPalette): THREE.Group {
  const g = new THREE.Group();
  const rings = [
    { n: 8, tilt: 1.2, size: 1.0, offset: 0, color: p.secondary },
    { n: 8, tilt: 0.8, size: 0.88, offset: Math.PI / 8, color: p.primary },
    { n: 6, tilt: 0.38, size: 0.7, offset: 0.2, color: p.primary },
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const arm = new THREE.Group();
      arm.rotation.y = ring.offset + (i / ring.n) * Math.PI * 2;
      const tilt = new THREE.Group();
      tilt.rotation.z = -ring.tilt;
      const geo = new THREE.SphereGeometry(1, 18, 10);
      geo.translate(0, 1, 0); // base of the petal at the origin
      const petal = mesh(geo, matte(ring.color, 0.5));
      petal.scale.set(0.3 * ring.size, 0.95 * ring.size, 0.13 * ring.size);
      tilt.add(petal);
      arm.add(tilt);
      g.add(arm);
    }
  }
  g.add(mesh(new THREE.SphereGeometry(0.2, 20, 16), matte(0xf4c542, 0.5), [0, 0.35, 0]));
  // lily pad
  g.add(mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.05, 56), matte(0x2f6b45, 0.7), [0, -0.05, 0]));
  return g;
}

function gymRings(p: ModelPalette): THREE.Group {
  const g = new THREE.Group();
  const wood = matte(0xc79a5b, 0.5);
  const strapMat = matte(p.primary, 0.6);
  const steel = metal(0xc9ccd2, 0.3);
  const bar = cyl(0.07, 0.07, 3.3, steel, 24);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 2.3;
  g.add(bar);
  for (const side of [-1, 1]) {
    const x = side * 1.05;
    const strap = cyl(0.05, 0.05, 2.4, strapMat, 12);
    strap.position.set(x, 1.1, 0);
    const buckle = mesh(new THREE.BoxGeometry(0.22, 0.34, 0.1), steel, [x, 0.1, 0]);
    // rings turned slightly toward each other and offset in depth, so the pair keeps
    // real volume from every angle instead of reading as two flat discs
    const ring = mesh(new THREE.TorusGeometry(0.74, 0.075, 20, 64), wood, [x, -0.75, side * 0.28]);
    ring.rotation.set(0.28, -side * 0.5, 0);
    g.add(strap, buckle, ring);
  }
  return g;
}

// ─── Premium models ───────────────────────────────────────────────────────────
const gold = () => new THREE.MeshStandardMaterial({ color: 0xd9a932, metalness: 0.95, roughness: 0.22 });

function crown(p: ModelPalette): THREE.Group {
  const g = new THREE.Group();
  const goldMat = gold();
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.55, 48, 1, true), goldMat);
  (band.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  g.add(band);
  const rim = mesh(new THREE.TorusGeometry(1.0, 0.07, 16, 64), goldMat, [0, -0.27, 0]);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const gem = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.primary as THREE.ColorRepresentation), metalness: 0.3, roughness: 0.1 });
  const points = 6;
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const x = Math.cos(a) * 0.98;
    const z = Math.sin(a) * 0.98;
    const spike = mesh(new THREE.ConeGeometry(0.2, 0.75, 4), goldMat, [x, 0.62, z]);
    const ball = mesh(new THREE.SphereGeometry(0.11, 16, 16), gem, [x, 1.05, z]);
    g.add(spike, ball);
  }
  return g;
}

function diamond(p: ModelPalette): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(p.primary as THREE.ColorRepresentation),
    metalness: 0.2,
    roughness: 0.05,
    flatShading: true,
  });
  const crownPart = mesh(new THREE.CylinderGeometry(0.6, 1.05, 0.5, 8), mat, [0, 0.25, 0]);
  const pavilion = mesh(new THREE.ConeGeometry(1.05, 1.2, 8), mat, [0, -0.6, 0]);
  pavilion.rotation.x = Math.PI;
  const table = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.04, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color(p.secondary as THREE.ColorRepresentation), metalness: 0.4, roughness: 0.08, flatShading: true }), [0, 0.51, 0]);
  g.add(crownPart, pavilion, table);
  return g;
}

function goldDumbbell(p: ModelPalette): THREE.Group {
  const g = new THREE.Group();
  const goldMat = gold();
  const handle = cyl(0.13, 0.13, 2.2, goldMat, 24);
  handle.rotation.z = Math.PI / 2;
  g.add(handle);
  const accent = metal(new THREE.Color(p.primary as THREE.ColorRepresentation), 0.25);
  for (const side of [-1, 1]) {
    const head = cyl(0.62, 0.62, 0.55, goldMat, 6);
    head.rotation.z = Math.PI / 2;
    head.position.x = side * 1.05;
    const ring = cyl(0.66, 0.66, 0.1, accent, 6);
    ring.rotation.z = Math.PI / 2;
    ring.position.x = side * 1.36;
    g.add(head, ring);
  }
  return g;
}

const BUILDERS: Record<HeroModelId, (p: ModelPalette) => THREE.Group> = {
  dumbbell,
  // Placeholder / fallback: the real "dumbbell-classic" is the .glb loaded by
  // HeroScene (CLASSIC_DUMBBELL_URL); if that file cannot load, this shows.
  "dumbbell-classic": dumbbell,
  kettlebell,
  barbell,
  "boxing-glove": boxingGlove,
  "weight-plate": weightPlate,
  "medicine-ball": medicineBall,
  "punching-bag": punchingBag,
  "zen-stones": zenStones,
  trophy,
  stopwatch,
  "protein-shaker": proteinShaker,
  "yoga-mat": yogaMat,
  "plyo-box": plyoBox,
  "jump-rope": jumpRope,
  lotus,
  "gym-rings": gymRings,
  crown,
  diamond,
  "gold-dumbbell": goldDumbbell,
};

export function buildHeroModel(id: HeroModelId, palette: ModelPalette): THREE.Group {
  return normalize(BUILDERS[id](palette));
}

/** Center any object (e.g. a loaded glTF scene) and scale it to the frame every hero is composed for. */
export function fitModelToFrame(object: THREE.Object3D, radius = 1.5): THREE.Group {
  const holder = new THREE.Group();
  holder.add(object);
  return normalize(holder, radius);
}

const TEXTURE_SLOTS = [
  "map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap",
  "alphaMap", "bumpMap", "displacementMap", "envMap", "lightMap", "clearcoatMap",
  "transmissionMap", "thicknessMap", "sheenColorMap", "specularIntensityMap",
] as const;

function disposeMaterial(mat: THREE.Material): void {
  const slots = mat as unknown as Record<string, unknown>;
  for (const slot of TEXTURE_SLOTS) {
    const tex = slots[slot];
    if (tex && (tex as THREE.Texture).isTexture) (tex as THREE.Texture).dispose();
  }
  mat.dispose();
}

/** Free GPU memory (geometries, materials AND their textures) of a model. */
export function disposeModel(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach(disposeMaterial);
    else if (mat) disposeMaterial(mat);
  });
}

/** Per-model motion: how the object moves so each feels like what it is. */
export type MotionStyle = "spin" | "tumble" | "jab" | "float" | "swing";
/** Static file behind the "dumbbell-classic" choice (served from /public). */
export const CLASSIC_DUMBBELL_URL = "/models/dumbbell.glb";

export const MODEL_MOTION: Record<HeroModelId, MotionStyle> = {
  dumbbell: "spin",
  "dumbbell-classic": "spin",
  kettlebell: "tumble",
  barbell: "spin",
  "boxing-glove": "jab",
  "weight-plate": "spin",
  "medicine-ball": "tumble",
  "punching-bag": "swing",
  "zen-stones": "float",
  trophy: "spin",
  stopwatch: "float",
  "protein-shaker": "tumble",
  "yoga-mat": "float",
  "plyo-box": "tumble",
  "jump-rope": "swing",
  lotus: "float",
  "gym-rings": "swing",
  crown: "spin",
  diamond: "spin",
  "gold-dumbbell": "spin",
};
