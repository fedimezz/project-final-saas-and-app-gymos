// ClubX mobile 3D hero — the page that runs INSIDE the app's WebView.
//
// It is bundled by scripts/build-hero3d.mjs into src/hero3d/viewerHtml.generated.ts
// (one self-contained HTML string: three.js + the website's own model builders +
// this file), so the phone shows exactly the same objects as the club's website
// — same shapes, same colors, same motion per object — with no network request.
//
// React Native talks to it through three calls (injectJavaScript):
//   window.__clubx.config({ model, primary, secondary, isDark, energy, reduceMotion, custom? })
//   window.__clubx.pause()  /  window.__clubx.resume()
// and it answers with window.ReactNativeWebView.postMessage(JSON):
//   { type: "status", status: "loading" | "ready" | "error" | "unsupported", detail? }
//
// Performance rules: transparent canvas, pixel ratio capped (and lowered by
// itself on a slow phone), render loop stops when paused / hidden / reduced
// motion, GPU memory of replaced models is freed, 3D objects built on demand.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
// Resolved by the build script (alias) to the website's models.ts.
import { buildHeroModel, disposeModel, fitModelToFrame, MODEL_MOTION } from "@hero/models";

type Transform = {
  scale: number;
  rotation: { x: number; y: number; z: number };
  position: { x: number; y: number; z: number };
  autoRotate: boolean;
};
interface Config {
  model: string;
  primary: string;
  secondary: string;
  isDark: boolean;
  energy?: number;
  reduceMotion?: boolean;
  /** The club's own uploaded model: base64 file bytes + the owner's placement. */
  custom?: { b64: string; transform: Transform } | null;
}

declare global {
  interface Window {
    __clubx: { config: (c: Config) => void; pause: () => void; resume: () => void };
    __CLASSIC_B64__?: string;
    ReactNativeWebView?: { postMessage: (s: string) => void };
  }
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const safeHex = (v: string | undefined, fallback: string) => (v && HEX.test(v) ? v : fallback);
const DEG = Math.PI / 180;
const MAX_PIXEL_RATIO = 1.75;
const damp = (current: number, target: number, lambda: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));

const post = (msg: Record<string, unknown>) => {
  try {
    window.ReactNativeWebView?.postMessage(JSON.stringify(msg));
  } catch {
    /* running in a plain browser (tests / previews) */
  }
};

function b64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function parseGlb(b64: string): Promise<THREE.Object3D> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(
      b64ToBuffer(b64),
      "",
      (gltf) => resolve(gltf.scene),
      (e) => reject(e instanceof Error ? e : new Error("Modèle illisible"))
    );
  });
}

const canvas = document.getElementById("c") as HTMLCanvasElement;
let renderer: THREE.WebGLRenderer | null = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: (window.devicePixelRatio || 1) < 2, powerPreference: "default" });
} catch {
  post({ type: "status", status: "unsupported", detail: "WebGL indisponible" });
}

if (renderer) {
  const gl = renderer;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  gl.setPixelRatio(pixelRatio);
  gl.setClearColor(0x000000, 0);
  gl.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(gl);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.9;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 7);

  const amb = new THREE.AmbientLight(0xffffff, 0.8);
  const key = new THREE.DirectionalLight(0xffffff, 2.8);
  key.position.set(4, 5, 6);
  const lightA = new THREE.PointLight("#22c55e", 40, 20);
  lightA.position.set(-4, 2, 3);
  const lightB = new THREE.PointLight("#3b82f6", 30, 20);
  lightB.position.set(4, -2, 3);
  scene.add(amb, key, lightA, lightB);

  // pivot = idle motion · placer = the owner's scale/rotation/position (custom only)
  const pivot = new THREE.Group();
  const placer = new THREE.Group();
  pivot.add(placer);
  scene.add(pivot);

  let cfg: Config | null = null;
  let current: THREE.Object3D | null = null;
  let currentCustom: Transform | null = null;
  let builtFor = "";
  let token = 0;
  let appear = 0;
  let paused = false;
  let contextLost = false;
  let running = false;
  let raf = 0;
  let last = performance.now();
  const start = last;
  let emaMs = 16;
  let slowSince = 0;

  const clearCurrent = () => {
    if (current) {
      placer.remove(current);
      disposeModel(current);
      current = null;
    }
  };

  const showBuiltin = (c: Config) => {
    clearCurrent();
    current = buildHeroModel(c.model as never, { primary: safeHex(c.primary, "#22c55e"), secondary: safeHex(c.secondary, "#3b82f6") });
    currentCustom = null;
    placer.add(current);
    appear = 0;
  };

  const build = (c: Config) => {
    const classic = !c.custom && c.model === "dumbbell-classic" && !!window.__CLASSIC_B64__;
    const sig = c.custom ? `c|${c.custom.b64.length}|${c.custom.b64.slice(0, 64)}` : classic ? "k" : `b|${c.model}|${c.primary}|${c.secondary}`;
    if (sig === builtFor) return;
    builtFor = sig;
    const mine = ++token;

    if (!c.custom && !classic) {
      showBuiltin(c);
      post({ type: "status", status: "ready" });
      return;
    }

    post({ type: "status", status: "loading" });
    const source = c.custom ? c.custom.b64 : (window.__CLASSIC_B64__ as string);
    parseGlb(source)
      .then((object) => {
        if (mine !== token) {
          disposeModel(object);
          return;
        }
        clearCurrent();
        current = fitModelToFrame(object);
        currentCustom = c.custom ? c.custom.transform : null;
        placer.add(current);
        appear = 0;
        post({ type: "status", status: "ready" });
        schedule();
      })
      .catch((err: unknown) => {
        if (mine !== token) return;
        // Never leave the hero empty: show the built-in object instead.
        showBuiltin(c);
        post({ type: "status", status: "error", detail: err instanceof Error ? err.message : "Modèle illisible" });
        schedule();
      });
  };

  const resize = () => {
    const w = Math.max(window.innerWidth, 1);
    const h = Math.max(window.innerHeight, 1);
    gl.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = camera.aspect < 0.9 ? 7 / Math.max(camera.aspect, 0.55) : 7;
    camera.updateProjectionMatrix();
    schedule();
  };

  const renderFrame = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const c = cfg;
    if (!c) return;
    const reduce = !!c.reduceMotion;
    const t = reduce ? 0.8 : (now - start) / 1000;
    const e = c.energy ?? 1;
    const motionOn = !reduce;

    appear = reduce ? 1 : Math.min(1, appear + dt / 0.9);
    const ease = 1 - Math.pow(1 - appear, 3);

    pivot.rotation.set(0, 0, 0);
    pivot.position.set(0, 0, 0);
    pivot.scale.setScalar(0.88 + 0.12 * ease);

    if (currentCustom) {
      const tr = currentCustom;
      placer.scale.setScalar(tr.scale);
      placer.rotation.set(tr.rotation.x * DEG, tr.rotation.y * DEG, tr.rotation.z * DEG);
      placer.position.set(tr.position.x, tr.position.y, tr.position.z);
      if (tr.autoRotate && motionOn) pivot.rotation.y = t * 0.35 * e;
      if (motionOn) {
        pivot.position.y = Math.sin(t * 0.9 * e) * 0.07;
        pivot.scale.multiplyScalar(1 + Math.sin(t * 0.7 * e) * 0.012);
      }
    } else {
      placer.scale.setScalar(1);
      placer.rotation.set(0, 0, 0);
      placer.position.set(0, 0, 0);
      const style = (MODEL_MOTION as Record<string, string>)[c.model] ?? "spin";
      if (style === "spin") {
        pivot.rotation.y = t * 0.55 * e;
        pivot.rotation.x = 0.18;
      } else if (style === "tumble") {
        pivot.rotation.y = t * 0.8 * e;
        pivot.rotation.x = Math.sin(t * 0.9 * e) * 0.35;
      } else if (style === "jab") {
        pivot.rotation.y = -0.5 + Math.sin(t * 1.4 * e) * 0.45;
        pivot.position.z = Math.max(0, Math.sin(t * 2.8 * e)) * 0.7;
      } else if (style === "float") {
        pivot.rotation.y = t * 0.22 * e;
        pivot.position.y = Math.sin(t * 1.0 * e) * 0.16;
        pivot.scale.multiplyScalar(1 + Math.sin(t * 0.8 * e) * 0.025);
      } else {
        pivot.rotation.z = Math.sin(t * 1.1 * e) * 0.16;
        pivot.rotation.y = t * 0.3 * e;
      }
    }

    gl.render(scene, camera);

    // Adaptive quality: a slow phone quietly renders fewer pixels.
    if (motionOn) {
      emaMs = emaMs * 0.92 + dt * 1000 * 0.08;
      if (emaMs > 26 && pixelRatio > 1) {
        slowSince = slowSince || now;
        if (now - slowSince > 1200) {
          pixelRatio = Math.max(1, pixelRatio - 0.25);
          gl.setPixelRatio(pixelRatio);
          resize();
          emaMs = 16;
          slowSince = 0;
        }
      } else {
        slowSince = 0;
      }
    }
  };

  const loop = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    renderFrame(now);
  };
  const shouldRun = () => !!cfg && !cfg.reduceMotion && !paused && !document.hidden && !contextLost;
  const sync = () => {
    const want = shouldRun();
    if (want && !running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    } else if (!want && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  };
  // One still frame (reduced motion, or a change while the loop is stopped).
  let framePending = false;
  const schedule = () => {
    sync();
    if (running || framePending || contextLost || !cfg) return;
    framePending = true;
    requestAnimationFrame((now) => {
      framePending = false;
      renderFrame(now);
    });
  };

  canvas.addEventListener("webglcontextlost", (ev) => {
    ev.preventDefault();
    contextLost = true;
    sync();
    post({ type: "status", status: "unsupported", detail: "Contexte WebGL perdu" });
  });
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("resize", resize);

  window.__clubx = {
    config(input) {
      // An id this viewer does not know (e.g. a newer website) must never crash it.
      const c = input.model in MODEL_MOTION ? input : { ...input, model: "dumbbell" };
      cfg = c;
      lightA.color.set(safeHex(c.primary, "#22c55e"));
      lightB.color.set(safeHex(c.secondary, "#3b82f6"));
      key.intensity = c.isDark ? 2.2 : 2.8;
      amb.intensity = c.isDark ? 0.35 : 0.8;
      build(c);
      sync();
      schedule();
    },
    pause() {
      paused = true;
      sync();
    },
    resume() {
      paused = false;
      sync();
      schedule();
    },
  };

  resize();
  post({ type: "ready" });
}
