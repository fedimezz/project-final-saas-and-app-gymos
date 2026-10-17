import "./setup";
import test from "node:test";
import assert from "node:assert/strict";
import { heroPlan, MAX_CUSTOM_MODEL_BYTES, parseClubBrand } from "../src/lib/clubBrand";
import { arrayBufferToBase64 } from "../src/lib/base64";
import { SUPPORTED_HERO_MODELS } from "../src/hero3d/heroModels.generated";

const MODELS = ["dumbbell", "kettlebell", "boxing-glove"];
const customPayload = (over: Record<string, unknown> = {}) => ({
  name: "Boxing Club",
  heroMode: "custom",
  heroModel: "boxing-glove",
  heroCustomModel: {
    url: "/api/hero-model?v=0123456789abcdef",
    format: "glb",
    byteSize: 500_000,
    transform: { scale: 1.4, rotation: { x: 10, y: 20, z: 0 }, position: { x: 0, y: -0.3, z: 0 }, autoRotate: false },
    ...over,
  },
});

test("a normal payload becomes the club's brand (name, logo, colors, theme, built-in 3D object)", () => {
  const b = parseClubBrand(
    { name: " Gammarth Gym ", logoUrl: "https://cdn.example.com/l.png", primaryColor: "#DC2626", secondaryColor: "#111827", themeId: "boxing", heroModel: "boxing-glove", heroMode: "builtin" },
    MODELS
  );
  assert.equal(b.name, "Gammarth Gym");
  assert.equal(b.logoUrl, "https://cdn.example.com/l.png");
  assert.equal(b.primaryColor, "#dc2626");
  assert.equal(b.themeId, "boxing");
  assert.deepEqual(heroPlan(b), { kind: "builtin", model: "boxing-glove" });
});

test("garbage or a missing payload degrades to safe defaults and never throws", () => {
  for (const raw of [null, undefined, 42, "x", [], {}]) {
    const b = parseClubBrand(raw, MODELS);
    assert.equal(b.name, "");
    assert.equal(b.logoUrl, null);
    assert.equal(b.primaryColor, null);
    assert.equal(b.themeId, "modern");
    assert.equal(b.heroMode, "builtin");
    assert.deepEqual(heroPlan(b), { kind: "builtin", model: "dumbbell" }); // the safe default object
  }
});

test("only https/http logos and #rrggbb colors are accepted", () => {
  const b = parseClubBrand({ logoUrl: "javascript:alert(1)", primaryColor: "red", secondaryColor: "#12345" }, MODELS);
  assert.equal(b.logoUrl, null);
  assert.equal(b.primaryColor, null);
  assert.equal(b.secondaryColor, null);
  assert.equal(parseClubBrand({ logoUrl: "data:image/png;base64,AAAA" }, MODELS).logoUrl, null);
});

test("a 3D object id the viewer cannot draw falls back to the default object", () => {
  const b = parseClubBrand({ heroModel: "hologram-9000" }, MODELS);
  assert.equal(b.heroModel, null);
  assert.deepEqual(heroPlan(b), { kind: "builtin", model: "dumbbell" });
});

test("a club that turned the 3D hero off gets no 3D", () => {
  assert.deepEqual(heroPlan(parseClubBrand({ heroMode: "none", heroModel: "dumbbell" }, MODELS)), { kind: "none" });
  assert.deepEqual(heroPlan(null), { kind: "none" });
});

test("a custom upload is used, with the owner's placement, and keeps its built-in object as fallback", () => {
  const plan = heroPlan(parseClubBrand(customPayload(), MODELS));
  assert.equal(plan.kind, "custom");
  if (plan.kind !== "custom") return;
  assert.equal(plan.url, "/api/hero-model?v=0123456789abcdef");
  assert.equal(plan.model, "boxing-glove");
  assert.equal(plan.transform.scale, 1.4);
  assert.equal(plan.transform.autoRotate, false);
});

test("a custom model is refused when too big, off-origin or in an unknown format → built-in object instead", () => {
  const cases = [
    customPayload({ byteSize: MAX_CUSTOM_MODEL_BYTES + 1 }),
    customPayload({ url: "https://evil.example.com/m.glb" }),
    customPayload({ url: "/api/hero-model?v=../../etc/passwd" }),
    customPayload({ format: "fbx" }),
    customPayload({ byteSize: 0 }),
    { name: "x", heroMode: "custom", heroModel: "kettlebell" }, // custom mode but no file described
  ];
  for (const raw of cases) {
    const plan = heroPlan(parseClubBrand(raw, MODELS));
    assert.equal(plan.kind, "builtin", JSON.stringify(raw));
  }
});

test("the owner's transform is clamped to the same ranges as the website", () => {
  const plan = heroPlan(
    parseClubBrand(customPayload({ transform: { scale: 99, rotation: { x: 999, y: -999, z: "bad" }, position: { x: 50, y: -50, z: NaN } } }), MODELS)
  );
  assert.equal(plan.kind, "custom");
  if (plan.kind !== "custom") return;
  assert.equal(plan.transform.scale, 3);
  assert.deepEqual(plan.transform.rotation, { x: 180, y: -180, z: 0 });
  assert.deepEqual(plan.transform.position, { x: 2, y: -2, z: 0 });
  assert.equal(plan.transform.autoRotate, true);
});

test("an unsafe theme id is replaced by the default", () => {
  assert.equal(parseClubBrand({ themeId: "../../x" }, MODELS).themeId, "modern");
  assert.equal(parseClubBrand({ themeId: "yoga" }, MODELS).themeId, "yoga");
});

test("the generated list of supported 3D objects matches what the website offers", () => {
  for (const id of ["dumbbell", "dumbbell-classic", "kettlebell", "barbell", "boxing-glove"]) {
    assert.ok(SUPPORTED_HERO_MODELS.includes(id), id);
  }
  assert.ok(SUPPORTED_HERO_MODELS.length >= 10);
});

test("arrayBufferToBase64 matches Buffer for small and multi-chunk inputs", () => {
  for (const n of [0, 1, 2, 3, 100, 0x8000, 0x8000 + 7, 200_000]) {
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = (i * 31 + 7) & 255;
    assert.equal(arrayBufferToBase64(bytes.buffer), Buffer.from(bytes).toString("base64"), `n=${n}`);
  }
});
