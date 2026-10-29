"use client";

// LandingMascot — the ClubX mascot walks along the bottom edge of the screen
// and follows the visitor:
//  - desktop: it chases the mouse horizontally (smooth spring), its eyes and
//    head look at the pointer and its body leans into the movement;
//  - touch: it follows the finger / last tap, and drifts with the scroll;
//  - any click or tap makes it flex and say "Allez !".
// It never captures the pointer (pointer-events: none), pauses while the tab is
// hidden, and with "reduce motion" it stays still in the corner.
// All movement is written straight to the DOM (no React re-render per frame);
// the visual rules live in app/landing-mono.css (`cxm-*`).
import { useEffect, useRef } from "react";
import { ClubXMascot } from "@/components/brand/ClubXMascot";

const FLEX_MS = 900;

export default function LandingMascot() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduceMotion = motionQuery.matches;

    const size = () => el.offsetWidth || 120;
    const margin = 8;
    const minX = () => margin;
    const maxX = () => Math.max(minX(), window.innerWidth - size() - margin);
    const clampX = (x: number) => Math.min(maxX(), Math.max(minX(), x));

    // Start parked in the bottom-right corner.
    let x = maxX();
    let target = x;
    let lean = 0;
    const look = { x: 0, y: 0 };
    const pointer = { x: window.innerWidth * 0.6, y: window.innerHeight * 0.4 };
    let lastScroll = window.scrollY;
    let raf = 0;
    let running = false;
    let last = 0;
    let walking = false;
    let flexTimer = 0;

    const paint = () => {
      el.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
      el.style.setProperty("--lean", lean.toFixed(2));
      el.style.setProperty("--lx", look.x.toFixed(3));
      el.style.setProperty("--ly", look.y.toFixed(3));
    };

    const aim = () => {
      // The head sits roughly 75% of the way up the figure.
      const rect = el.getBoundingClientRect();
      const hx = rect.left + rect.width / 2;
      const hy = rect.top + rect.height * 0.25;
      const dx = pointer.x - hx;
      const dy = pointer.y - hy;
      const dist = Math.hypot(dx, dy) || 1;
      const strength = Math.min(1, dist / 220);
      return { x: (dx / dist) * strength, y: (dy / dist) * strength };
    };

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;

      // Critically-damped-ish follow: frame-rate independent exponential ease.
      const k = 1 - Math.exp(-dt * 5.5);
      const prev = x;
      x += (target - x) * k;
      const v = (x - prev) / (dt || 1 / 60); // px / second

      lean += (Math.max(-9, Math.min(9, v / 60)) - lean) * (1 - Math.exp(-dt * 10));

      const a = aim();
      look.x += (a.x - look.x) * (1 - Math.exp(-dt * 12));
      look.y += (a.y - look.y) * (1 - Math.exp(-dt * 12));

      const isWalking = Math.abs(v) > 22;
      if (isWalking !== walking) {
        walking = isWalking;
        el.dataset.walking = isWalking ? "true" : "false";
      }
      paint();
      raf = requestAnimationFrame(step);
    };

    const start = () => {
      if (running || reduceMotion || document.hidden) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(step);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const onMove = (e: PointerEvent) => {
      if (reduceMotion) return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      target = clampX(e.clientX - size() / 2);
    };

    const flex = () => {
      el.dataset.flex = "true";
      window.clearTimeout(flexTimer);
      flexTimer = window.setTimeout(() => { el.dataset.flex = "false"; }, FLEX_MS);
    };
    const onDown = (e: PointerEvent) => {
      onMove(e);
      if (!reduceMotion) flex();
    };

    // Touch devices have no hover: let the page scroll nudge him along too.
    const onScroll = () => {
      const dy = window.scrollY - lastScroll;
      lastScroll = window.scrollY;
      if (reduceMotion) return;
      target = clampX(target + dy * 0.35);
    };

    const onResize = () => {
      target = clampX(target);
      x = clampX(x);
      paint();
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onMotionChange = () => {
      reduceMotion = motionQuery.matches;
      if (reduceMotion) {
        stop();
        target = maxX();
        x = target;
        lean = 0;
        look.x = 0;
        look.y = 0;
        el.dataset.walking = "false";
        paint();
      } else {
        start();
      }
    };

    el.dataset.walking = "false";
    el.dataset.flex = "false";
    paint();

    // Always attached; each handler ignores input while "reduce motion" is on,
    // so flipping the OS setting at runtime just works.
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    motionQuery.addEventListener("change", onMotionChange);
    start();

    return () => {
      stop();
      window.clearTimeout(flexTimer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      motionQuery.removeEventListener("change", onMotionChange);
    };
  }, []);

  return (
    <div ref={rootRef} className="cxm cxm-follower" aria-hidden="true" data-walking="false" data-flex="false">
      <span className="cxm-bubble">Allez !</span>
      <ClubXMascot />
    </div>
  );
}
