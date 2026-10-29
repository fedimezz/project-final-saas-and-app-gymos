"use client";

// A single 3D object that follows the visitor down the home page: it appears as
// the hero scrolls away, sweeps from side to side between the sections, turns
// with the scroll, and fades out at the very bottom. It is the same object the
// club's hero shows (built-in model or the owner's own .glb), so it needs no
// extra setup — and it honours the owner's "no 3D object" choice.
//
// Safe by construction: pointer-events none (never blocks a click or the
// scroll), aria-hidden, not rendered at all for prefers-reduced-motion or when
// WebGL is unavailable, and the page's scroll position is only read in a
// passive, rAF-throttled listener that writes styles straight to the DOM.
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { SceneBoundary, useHeroData } from "@/components/themes/Heroes";
import { companionPose } from "@/lib/scroll-companion";

// `three` is code-split, like the hero's own scene.
const HeroScene = dynamic(() => import("@/components/themes/hero3d/HeroScene"), { ssr: false, loading: () => null });

const noopSubscribe = () => () => {};

// The companion is a SECOND WebGL context (plus its own environment map), on top of the hero's.
// That is fine on a capable machine but is exactly what makes weak phones/laptops stutter and
// lose their GPU context, so it is only mounted when the device can afford it, and only after
// the hero (the thing the visitor actually looks at first) has been given the main thread.
function deviceCanAffordCompanion(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return false;
  const cores = nav.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory ?? 8;
  if (cores < 4 || memory < 4) return false;
  const coarse = window.matchMedia("(pointer: coarse)").matches; // phones/tablets
  return !(coarse && cores < 6);
}

function useAfterIdle(active: boolean): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!active) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
    if (w.requestIdleCallback) {
      const h = w.requestIdleCallback(() => setReady(true), { timeout: 2500 });
      return () => w.cancelIdleCallback?.(h);
    }
    const h = window.setTimeout(() => setReady(true), 1500);
    return () => window.clearTimeout(h);
  }, [active]);
  return ready;
}
const REDUCED = "(prefers-reduced-motion: reduce)";

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const q = window.matchMedia(REDUCED);
      q.addEventListener("change", onChange);
      return () => q.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED).matches,
    () => true // server: render nothing
  );
}

export default function ScrollCompanion({ forceDark }: { forceDark?: boolean }) {
  const d = useHeroData();
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const reduceMotion = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);

  const capable = isClient && !reduceMotion && !failed && d.heroMode !== "none" && deviceCanAffordCompanion();
  const enabled = useAfterIdle(capable) && capable;

  useEffect(() => {
    if (!enabled) return;
    const el = hostRef.current;
    if (!el) return;

    let raf = 0;
    let lastSize = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      const pose = companionPose({
        scrollY: window.scrollY,
        maxScroll: document.documentElement.scrollHeight - vh,
        vw: window.innerWidth,
        vh,
      });
      progress.current = pose.progress;
      if (pose.opacity <= 0.01) {
        // display:none also pauses the WebGL loop (the scene stops when its host is off-screen)
        el.style.display = "none";
        return;
      }
      el.style.display = "block";
      if (pose.size !== lastSize) {
        lastSize = pose.size;
        el.style.width = `${pose.size}px`;
        el.style.height = `${pose.size}px`;
      }
      el.style.opacity = String(pose.opacity);
      el.style.transform = `translate3d(${Math.round(pose.x - pose.size / 2)}px, ${Math.round(pose.y - pose.size / 2)}px, 0)`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    // Sections load their data after first paint, so the page height keeps changing.
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    update();

    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled]);

  if (!enabled) return null;

  return createPortal(
    <div
      ref={hostRef}
      aria-hidden="true"
      data-testid="scroll-companion"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        display: "none",
        pointerEvents: "none",
        zIndex: 30,
        willChange: "transform, opacity",
        transition: "transform 0.28s cubic-bezier(0.2, 0.7, 0.2, 1), opacity 0.25s linear",
      }}
    >
      <SceneBoundary>
        <HeroScene
          model={d.model}
          custom={d.heroMode === "custom" && d.customModel ? { url: d.customModel.url, transform: d.customModel.transform } : null}
          primary={d.primary}
          secondary={d.secondary}
          isDark={forceDark ?? d.isDark}
          energy={0.9}
          interactive={false}
          scrollRef={progress}
          onStatus={(status) => {
            if (status === "unsupported") setFailed(true);
          }}
        />
      </SceneBoundary>
    </div>,
    document.body
  );
}
