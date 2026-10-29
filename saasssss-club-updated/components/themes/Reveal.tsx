"use client";

// Scroll-reveal for the home page sections. Each section plays its theme's OWN
// entrance (slam for Musculation, slide for CrossFit, soft fade for Yoga, …)
// the first time it scrolls into view — see `[data-reveal]` in app/themes.css.
//
// It only ever touches the DOM attribute (no state, no re-render), leaves
// anything already on screen alone (so there is never a flash on load), and does
// nothing under prefers-reduced-motion or when IntersectionObserver is missing —
// in all of those cases the section is simply visible, as before.
import { useEffect, useRef, type ReactNode } from "react";

export default function Reveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Already visible on load (or restored mid-page): don't hide it just to animate it.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;

    el.dataset.reveal = "pending";
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.dataset.reveal = "in";
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.01 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      delete el.dataset.reveal;
    };
  }, []);

  return <div ref={ref}>{children}</div>;
}
