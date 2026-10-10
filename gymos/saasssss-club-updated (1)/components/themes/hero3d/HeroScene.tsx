"use client";

// One reusable WebGL scene for every theme's hero (and the owner's live
// preview). Loaded with next/dynamic({ ssr: false }) so `three` only ships to
// browsers that actually show a hero. It:
//  - sizes itself to its container (ResizeObserver), so it works as a full-page
//    hero background or as a small preview panel;
//  - renders with a transparent background so the theme's own CSS backdrop
//    (gradients, spotlights, textures) shows through;
//  - respects prefers-reduced-motion (renders a still frame, no mouse follow);
//  - pauses when scrolled out of view or when the tab is hidden;
//  - rebuilds only the model (not the renderer) when the owner changes model
//    or brand colors, and disposes GPU resources on unmount.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildHeroModel, disposeModel, MODEL_MOTION } from "@/components/themes/hero3d/models";
import type { HeroModelId } from "@/lib/website-themes";

export interface HeroSceneProps {
  model: HeroModelId;
  primary: string;
  secondary: string;
  isDark: boolean;
  /** Follow the pointer (hero background). Off for small previews. */
  interactive?: boolean;
  /** Overall motion energy: 0.6 calm (yoga) … 1.4 aggressive (crossfit). */
  energy?: number;
  className?: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const safeHex = (v: string, fallback: string) => (HEX.test(v) ? v : fallback);

export default function HeroScene({
  model,
  primary,
  secondary,
  isDark,
  interactive = true,
  energy = 1,
  className = "",
}: HeroSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Live values read inside the render loop (no scene teardown on change).
  const live = useRef({ model, primary, secondary, isDark, energy, interactive });
  const rebuild = useRef<(() => void) | null>(null);
  const lightsRef = useRef<{ key: THREE.DirectionalLight; a: THREE.PointLight; b: THREE.PointLight; amb: THREE.AmbientLight } | null>(null);

  useEffect(() => {
    live.current = { model, primary, secondary, isDark, energy, interactive };
    rebuild.current?.();
    const l = lightsRef.current;
    if (l) {
      l.a.color.set(safeHex(primary, "#22c55e"));
      l.b.color.set(safeHex(secondary, "#3b82f6"));
      l.key.intensity = isDark ? 2.2 : 2.8;
      l.amb.intensity = isDark ? 0.35 : 0.8;
    }
  }, [model, primary, secondary, isDark, energy, interactive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    } catch {
      return; // WebGL unavailable: the CSS backdrop alone is still a complete hero
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

    const pivot = new THREE.Group();
    scene.add(pivot);
    let current: THREE.Object3D | null = null;
    let builtFor = "";

    const build = () => {
      const { model: m, primary: p, secondary: s } = live.current;
      const sig = `${m}|${p}|${s}`;
      if (sig === builtFor) return;
      builtFor = sig;
      if (current) {
        pivot.remove(current);
        disposeModel(current);
      }
      current = buildHeroModel(m, { primary: safeHex(p, "#22c55e"), secondary: safeHex(s, "#3b82f6") });
      pivot.add(current);
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
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let mx = 0;
    let my = 0;
    const onMove = (e: MouseEvent) => {
      const r = host.getBoundingClientRect();
      mx = ((e.clientX - r.left) / Math.max(r.width, 1) - 0.5) * 2;
      my = ((e.clientY - r.top) / Math.max(r.height, 1) - 0.5) * 2;
    };
    if (!reduceMotion) window.addEventListener("mousemove", onMove);

    let visible = true;
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), { threshold: 0 });
    io.observe(host);

    let frame = 0;
    const start = performance.now();
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      const t = reduceMotion ? 0.8 : (performance.now() - start) / 1000;
      const { model: m, energy: e, interactive: inter } = live.current;
      const style = MODEL_MOTION[m];

      pivot.rotation.set(0, 0, 0);
      pivot.position.set(0, 0, 0);
      pivot.scale.setScalar(1);
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
        pivot.scale.setScalar(1 + Math.sin(t * 0.8 * e) * 0.025);
      } else {
        // swing (punching bag): pendulum around the top
        pivot.rotation.z = Math.sin(t * 1.1 * e) * 0.16;
        pivot.rotation.y = t * 0.3 * e;
      }
      if (inter && !reduceMotion) {
        pivot.rotation.x += my * 0.25;
        pivot.rotation.y += mx * 0.35;
        pivot.position.x = mx * 0.35;
      }
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("mousemove", onMove);
      rebuild.current = null;
      lightsRef.current = null;
      if (current) disposeModel(current);
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`block h-full w-full ${className}`}
      aria-hidden="true"
      data-testid="hero-3d-canvas"
    />
  );
}
