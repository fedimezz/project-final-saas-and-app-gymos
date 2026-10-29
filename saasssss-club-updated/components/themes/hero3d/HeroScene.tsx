"use client";

// One reusable WebGL scene for every theme's hero (and the owner's live
// preview). Loaded with next/dynamic({ ssr: false }) so `three` only ships to
// browsers that actually show a hero. It:
//  - renders either a built-in procedural object OR the owner's own .glb/.gltf
//    (fetched same-origin, parsed locally, fitted to the frame, placed with the
//    owner's scale/rotation/position, disposed on replace/unmount);
//  - falls back to the built-in object if the custom file fails to load, and to
//    the theme's plain CSS backdrop if WebGL itself is unavailable or lost;
//  - follows the pointer with damped (smooth) motion, supports horizontal
//    drag-to-rotate on the canvas, and NEVER blocks page scroll (touch-action:
//    pan-y, passive listeners, no wheel capture) or clicks on overlapping UI;
//  - honours prefers-reduced-motion live (static frame, no loop, no pointer
//    follow) and pauses when off-screen or when the tab is hidden;
//  - lowers its pixel ratio by itself on slow devices.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildHeroModel, CLASSIC_DUMBBELL_URL, disposeModel, fitModelToFrame, MODEL_MOTION } from "@/components/themes/hero3d/models";
import { DEFAULT_HERO_TRANSFORM, HERO_MODEL_ABSOLUTE_MAX_BYTES, type HeroModelTransform } from "@/lib/hero-model";
import type { HeroModelId } from "@/lib/website-themes";

export type HeroSceneStatus = "loading" | "ready" | "error" | "unsupported";

export interface HeroSceneCustomModel {
  /** Same-origin URL (/api/hero-model?v=…). */
  url: string;
  transform: HeroModelTransform;
}

export interface HeroSceneProps {
  /** Built-in object (also the fallback when the custom model cannot load). */
  model: HeroModelId;
  /** The owner's own model; takes precedence over `model` when it loads. */
  custom?: HeroSceneCustomModel | null;
  primary: string;
  secondary: string;
  isDark: boolean;
  /** Follow the pointer + allow drag-to-rotate (hero). Off for small previews. */
  interactive?: boolean;
  /** Overall motion energy: 0.6 calm (yoga) … 1.4 aggressive (crossfit). */
  energy?: number;
  /**
   * Page scroll progress in [0, 1], written by the caller (no re-render per
   * scroll event). When given, the object also turns with the scroll — used by
   * the scroll-following companion; heroes leave it out.
   */
  scrollRef?: { current: number };
  className?: string;
  /** Loading / ready / error reporting (the admin preview shows the message). */
  onStatus?: (status: HeroSceneStatus, detail?: string) => void;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const safeHex = (v: string, fallback: string) => (HEX.test(v) ? v : fallback);
const LOAD_TIMEOUT_MS = 25_000;
const DEG = Math.PI / 180;

const damp = (current: number, target: number, lambda: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));

async function loadCustomModel(url: string, signal: AbortSignal): Promise<THREE.Object3D> {
  const res = await fetch(url, { signal, credentials: "same-origin" });
  if (!res.ok) throw new Error(`Chargement impossible (${res.status})`);
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > HERO_MODEL_ABSOLUTE_MAX_BYTES) throw new Error("Modèle trop volumineux");
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > HERO_MODEL_ABSOLUTE_MAX_BYTES) throw new Error("Modèle trop volumineux");

  // The loader is only needed for custom models: keep it out of the main chunk.
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
    new GLTFLoader().parse(buffer, "", resolve, (e) => reject(e instanceof Error ? e : new Error("Modèle illisible")));
  });
  return gltf.scene;
}

export default function HeroScene({
  model,
  custom = null,
  primary,
  secondary,
  isDark,
  interactive = true,
  energy = 1,
  scrollRef,
  className = "",
  onStatus,
}: HeroSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Live values read inside the render loop (no scene teardown on change).
  const live = useRef({ model, custom, primary, secondary, isDark, energy, interactive, scrollRef });
  const rebuild = useRef<(() => void) | null>(null);
  const requestRender = useRef<(() => void) | null>(null);
  const statusRef = useRef(onStatus);
  const lightsRef = useRef<{ key: THREE.DirectionalLight; a: THREE.PointLight; b: THREE.PointLight; amb: THREE.AmbientLight } | null>(null);

  useEffect(() => {
    statusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    live.current = { model, custom, primary, secondary, isDark, energy, interactive, scrollRef };
    rebuild.current?.();
    const l = lightsRef.current;
    if (l) {
      l.a.color.set(safeHex(primary, "#22c55e"));
      l.b.color.set(safeHex(secondary, "#3b82f6"));
      l.key.intensity = isDark ? 2.2 : 2.8;
      l.amb.intensity = isDark ? 0.35 : 0.8;
    }
    requestRender.current?.(); // static (reduced-motion) mode: show the change
  }, [model, custom, primary, secondary, isDark, energy, interactive, scrollRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const report = (status: HeroSceneStatus, detail?: string) => {
      canvas.dataset.state = status;
      statusRef.current?.(status, detail);
    };

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: window.devicePixelRatio < 2,
        powerPreference: coarse ? "default" : "high-performance",
      });
    } catch {
      report("unsupported", "WebGL indisponible");
      return; // the theme's CSS backdrop alone is still a complete hero
    }
    let pixelRatio = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.9;

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 7);

    const amb = new THREE.AmbientLight(0xffffff, live.current.isDark ? 0.35 : 0.8);
    const key = new THREE.DirectionalLight(0xffffff, live.current.isDark ? 2.2 : 2.8);
    key.position.set(4, 5, 6);
    const a = new THREE.PointLight(safeHex(live.current.primary, "#22c55e"), 40, 20);
    a.position.set(-4, 2, 3);
    const b = new THREE.PointLight(safeHex(live.current.secondary, "#3b82f6"), 30, 20);
    b.position.set(4, -2, 3);
    scene.add(amb, key, a, b);
    lightsRef.current = { key, a, b, amb };

    // pivot  = scene motion (idle spin, pointer tilt, drag)
    // placer = the owner's scale / rotation / position (custom models only)
    const pivot = new THREE.Group();
    const placer = new THREE.Group();
    pivot.add(placer);
    scene.add(pivot);
    let current: THREE.Object3D | null = null;
    let currentIsCustom = false;
    let builtFor = "";
    let loadToken = 0;
    let loadAbort: AbortController | null = null;
    let appear = 0; // 0 → 1 entrance ease after (re)build
    let disposed = false;
    let contextLost = false;

    const clearCurrent = () => {
      if (current) {
        placer.remove(current);
        disposeModel(current);
        current = null;
      }
    };

    const showBuiltin = () => {
      const { model: m, primary: p, secondary: s } = live.current;
      clearCurrent();
      current = buildHeroModel(m, { primary: safeHex(p, "#22c55e"), secondary: safeHex(s, "#3b82f6") });
      currentIsCustom = false;
      placer.add(current);
      appear = 0;
    };

    const build = () => {
      const { model: m, custom: c, primary: p, secondary: s } = live.current;
      // "dumbbell-classic" is a built-in choice backed by a static .glb: it is
      // loaded like a custom file but without the owner's scale/rotation/position.
      const classic = !c && m === "dumbbell-classic";
      const sig = c ? `c|${c.url}` : classic ? "k|dumbbell-classic" : `b|${m}|${p}|${s}`;
      if (sig === builtFor) return;
      builtFor = sig;
      loadAbort?.abort();
      const token = ++loadToken;

      if (!c && !classic) {
        showBuiltin();
        report("ready");
        return;
      }

      // File-based model: keep whatever is on screen until the new file is ready.
      report("loading");
      const ctl = new AbortController();
      loadAbort = ctl;
      const timer = window.setTimeout(() => ctl.abort(), LOAD_TIMEOUT_MS);
      loadCustomModel(c ? c.url : CLASSIC_DUMBBELL_URL, ctl.signal)
        .then((object) => {
          if (disposed || token !== loadToken) {
            disposeModel(object);
            return;
          }
          clearCurrent();
          current = fitModelToFrame(object);
          currentIsCustom = Boolean(c);
          placer.add(current);
          appear = 0;
          report("ready");
          requestRender.current?.();
        })
        .catch((err: unknown) => {
          if (disposed || token !== loadToken) return;
          // Never leave the hero empty: fall back to the built-in object.
          showBuiltin();
          const aborted = ctl.signal.aborted;
          report("error", aborted ? "Le chargement du modèle a pris trop de temps." : err instanceof Error ? err.message : "Modèle illisible");
          requestRender.current?.();
        })
        .finally(() => window.clearTimeout(timer));
    };
    build();
    rebuild.current = build;

    const resize = () => {
      const w = Math.max(host.clientWidth, 1);
      const h = Math.max(host.clientHeight, 1);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // keep the object fully visible on tall/narrow (mobile) containers
      camera.position.z = camera.aspect < 0.9 ? 7 / Math.max(camera.aspect, 0.55) : 7;
      camera.updateProjectionMatrix();
      requestRender.current?.();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // ── Reduced motion (live: follows the OS setting without a reload) ──────
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduceMotion = motionQuery.matches;

    // ── Pointer: smoothed parallax + horizontal drag-to-rotate ──────────────
    let tx = 0; // target pointer position in [-1, 1]
    let ty = 0;
    let sx = 0; // smoothed
    let sy = 0;
    const drag = { active: false, id: -1, startX: 0, startY: 0, lastX: 0, yaw: 0, pitch: 0, vel: 0, intent: false };
    const onMove = (e: PointerEvent) => {
      if (reduceMotion) return;
      const r = host.getBoundingClientRect();
      tx = ((e.clientX - r.left) / Math.max(r.width, 1) - 0.5) * 2;
      ty = ((e.clientY - r.top) / Math.max(r.height, 1) - 0.5) * 2;
      if (drag.active && e.pointerId === drag.id) {
        const dx = e.clientX - drag.lastX;
        if (!drag.intent && Math.abs(e.clientX - drag.startX) > 6 && Math.abs(e.clientX - drag.startX) > Math.abs(e.clientY - drag.startY)) {
          drag.intent = true; // horizontal gesture: now it is ours
          try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
        }
        if (drag.intent) {
          drag.yaw += dx * 0.012;
          drag.vel = dx * 0.012;
        }
        drag.lastX = e.clientX;
      }
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
    };
    const onDown = (e: PointerEvent) => {
      if (reduceMotion || !live.current.interactive) return;
      drag.active = true;
      drag.id = e.pointerId;
      drag.startX = drag.lastX = e.clientX;
      drag.startY = e.clientY;
      drag.intent = false;
    };
    const endDrag = (e: PointerEvent) => {
      if (e.pointerId !== drag.id) return;
      drag.active = false;
      drag.intent = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave, { passive: true });
    canvas.addEventListener("pointerdown", onDown, { passive: true });
    canvas.addEventListener("pointerup", endDrag, { passive: true });
    canvas.addEventListener("pointercancel", endDrag, { passive: true });

    // ── Render loop ─────────────────────────────────────────────────────────
    let visible = true;
    let frame = 0;
    let running = false;
    let last = performance.now();
    const start = last;
    let emaMs = 16;
    let slowSince = 0;

    const renderFrame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const t = reduceMotion ? 0.8 : (now - start) / 1000;
      const { model: m, custom: c, energy: e, interactive: inter } = live.current;
      const motionOn = !reduceMotion;

      sx = damp(sx, motionOn && inter ? tx : 0, 5, dt);
      sy = damp(sy, motionOn && inter ? ty : 0, 5, dt);
      appear = reduceMotion ? 1 : Math.min(1, appear + dt / 0.9);
      const ease = 1 - Math.pow(1 - appear, 3);

      pivot.rotation.set(0, 0, 0);
      pivot.position.set(0, 0, 0);
      pivot.scale.setScalar(0.88 + 0.12 * ease);

      if (currentIsCustom && c) {
        const tr = c.transform ?? DEFAULT_HERO_TRANSFORM;
        placer.scale.setScalar(tr.scale);
        placer.rotation.set(tr.rotation.x * DEG, tr.rotation.y * DEG, tr.rotation.z * DEG);
        placer.position.set(tr.position.x, tr.position.y, tr.position.z);
        if (tr.autoRotate && motionOn) pivot.rotation.y = t * 0.35 * e;
        if (motionOn) {
          pivot.position.y = Math.sin(t * 0.9 * e) * 0.07; // subtle idle float
          pivot.scale.multiplyScalar(1 + Math.sin(t * 0.7 * e) * 0.012);
        }
      } else {
        placer.scale.setScalar(1);
        placer.rotation.set(0, 0, 0);
        placer.position.set(0, 0, 0);
        const style = MODEL_MOTION[m];
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
          // swing (punching bag): pendulum around the top
          pivot.rotation.z = Math.sin(t * 1.1 * e) * 0.16;
          pivot.rotation.y = t * 0.3 * e;
        }
      }

      // Scroll-following companion: the page's scroll progress turns and tips
      // the object, so it visibly "travels" with the visitor down the page.
      const scrollProgress = live.current.scrollRef?.current ?? 0;
      if (motionOn && scrollProgress > 0) {
        pivot.rotation.y += scrollProgress * Math.PI * 6;
        pivot.rotation.x += Math.sin(scrollProgress * Math.PI * 8) * 0.22;
      }

      // Drag offset keeps a little inertia, then eases back to the idle pose.
      if (!drag.active) {
        drag.yaw += drag.vel;
        drag.vel = damp(drag.vel, 0, 4, dt);
        drag.yaw = damp(drag.yaw, 0, 0.7, dt);
        drag.pitch = damp(drag.pitch, 0, 0.7, dt);
      }
      if (motionOn && inter) {
        pivot.rotation.x += sy * 0.25 + drag.pitch;
        pivot.rotation.y += sx * 0.35 + drag.yaw;
        pivot.position.x += sx * 0.35;
      }

      renderer.render(scene, camera);

      // Adaptive quality: a slow device quietly renders fewer pixels.
      if (!reduceMotion) {
        emaMs = emaMs * 0.92 + dt * 1000 * 0.08;
        if (emaMs > 26 && pixelRatio > 1) {
          slowSince = slowSince || now;
          if (now - slowSince > 1200) {
            pixelRatio = Math.max(1, pixelRatio - 0.25);
            renderer.setPixelRatio(pixelRatio);
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
      frame = requestAnimationFrame(loop);
      renderFrame(now);
    };
    const shouldRun = () => !reduceMotion && visible && !document.hidden && !contextLost;
    const sync = () => {
      const want = shouldRun();
      if (want && !running) {
        running = true;
        last = performance.now();
        frame = requestAnimationFrame(loop);
      } else if (!want && running) {
        running = false;
        cancelAnimationFrame(frame);
      }
    };
    // One still frame (reduced motion, or a prop/size change while paused).
    let stillQueued = false;
    requestRender.current = () => {
      if (running || stillQueued || disposed || contextLost) return;
      stillQueued = true;
      requestAnimationFrame((now) => {
        stillQueued = false;
        if (!disposed && !contextLost) renderFrame(now);
      });
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    }, { threshold: 0 });
    io.observe(host);
    const onVisibility = () => sync();
    document.addEventListener("visibilitychange", onVisibility);
    const onMotionChange = () => {
      reduceMotion = motionQuery.matches;
      if (reduceMotion) {
        tx = ty = sx = sy = 0;
        drag.yaw = drag.pitch = drag.vel = 0;
      }
      canvas.style.cursor = reduceMotion || !live.current.interactive ? "" : "grab";
      sync();
      requestRender.current?.();
    };
    motionQuery.addEventListener("change", onMotionChange);

    // ── WebGL context loss (mobile GPUs reclaim contexts under memory pressure)
    const onContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
      sync();
      report("unsupported", "Contexte WebGL perdu");
    };
    const onContextRestored = () => {
      contextLost = false;
      builtFor = ""; // GPU resources are gone: rebuild everything
      build();
      sync();
      requestRender.current?.();
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);

    canvas.style.cursor = reduceMotion || !live.current.interactive ? "" : "grab";
    sync();
    requestRender.current?.();

    return () => {
      disposed = true;
      loadAbort?.abort();
      running = false;
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      motionQuery.removeEventListener("change", onMotionChange);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      rebuild.current = null;
      requestRender.current = null;
      lightsRef.current = null;
      clearCurrent();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      // pan-y: vertical swipes keep scrolling the page; horizontal drags rotate the model.
      style={{ touchAction: "pan-y" }}
      className={`block h-full w-full ${className}`}
      aria-hidden="true"
      data-testid="hero-3d-canvas"
    />
  );
}
