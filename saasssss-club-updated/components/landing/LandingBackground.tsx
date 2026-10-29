"use client";

// LandingBackground — the moving black & white backdrop of the ClubX home page.
//  - a slowly drifting grid and two blurred gray orbs (pure CSS, see
//    app/landing-mono.css),
//  - a canvas "constellation": soft dots that float, link to their neighbours
//    and gently lean toward the pointer.
// It is fixed behind the page (pointer-events: none), follows the light/dark
// mode live, pauses when the tab is hidden and shows a single still frame when
// the visitor prefers reduced motion.
import { useEffect, useRef } from "react";

interface Dot { x: number; y: number; vx: number; vy: number; r: number }

export default function LandingBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const root = document.documentElement;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduceMotion = motionQuery.matches;
    let isDark = root.classList.contains("dark");
    let width = 0;
    let height = 0;
    let dots: Dot[] = [];
    let raf = 0;
    let running = false;
    const pointer = { x: -9999, y: -9999, active: false };
    const LINK = 150;

    const seed = () => {
      const count = Math.max(28, Math.min(84, Math.round((width * height) / 22000)));
      dots = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: 1 + Math.random() * 1.6,
      }));
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      draw();
    };

    function draw() {
      ctx!.clearRect(0, 0, width, height);
      const ink = isDark ? "250,250,250" : "9,9,11";
      for (let i = 0; i < dots.length; i++) {
        const a = dots[i];
        for (let j = i + 1; j < dots.length; j++) {
          const b = dots[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < LINK) {
            ctx!.strokeStyle = `rgba(${ink},${(1 - d / LINK) * (isDark ? 0.22 : 0.16)})`;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
        if (pointer.active) {
          const d = Math.hypot(a.x - pointer.x, a.y - pointer.y);
          if (d < 190) {
            ctx!.strokeStyle = `rgba(${ink},${(1 - d / 190) * 0.4})`;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(pointer.x, pointer.y);
            ctx!.stroke();
          }
        }
        ctx!.fillStyle = `rgba(${ink},${isDark ? 0.7 : 0.55})`;
        ctx!.beginPath();
        ctx!.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    function step() {
      for (const d of dots) {
        if (pointer.active) {
          const dx = pointer.x - d.x;
          const dy = pointer.y - d.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 220 && dist > 1) {
            d.vx += (dx / dist) * 0.012;
            d.vy += (dy / dist) * 0.012;
          }
        }
        d.vx *= 0.995;
        d.vy *= 0.995;
        // keep a minimum drift so the field never freezes
        const speed = Math.hypot(d.vx, d.vy);
        if (speed < 0.12) { d.vx += (Math.random() - 0.5) * 0.04; d.vy += (Math.random() - 0.5) * 0.04; }
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < -20) d.x = width + 20;
        if (d.x > width + 20) d.x = -20;
        if (d.y < -20) d.y = height + 20;
        if (d.y > height + 20) d.y = -20;
      }
      draw();
      raf = requestAnimationFrame(step);
    }

    const start = () => {
      if (running || reduceMotion || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(step);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const onPointer = (e: PointerEvent) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true; };
    const onLeave = () => { pointer.active = false; };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onMotion = () => { reduceMotion = motionQuery.matches; if (reduceMotion) { stop(); draw(); } else start(); };

    // Follow the light/dark toggle without a reload.
    const observer = new MutationObserver(() => {
      isDark = root.classList.contains("dark");
      if (!running) draw();
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    resize();
    start();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    motionQuery.addEventListener("change", onMotion);

    return () => {
      stop();
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      motionQuery.removeEventListener("change", onMotion);
    };
  }, []);

  return (
    <div className="mono-bg" aria-hidden="true">
      <div className="mono-bg-orb a" />
      <div className="mono-bg-orb b" />
      <div className="mono-bg-grid" />
      <canvas ref={canvasRef} className="mono-bg-canvas" />
      <div className="mono-bg-vignette" />
    </div>
  );
}
