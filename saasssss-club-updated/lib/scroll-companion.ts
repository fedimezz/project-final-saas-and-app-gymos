// Pure math for the scroll-following 3D companion (components/themes/ScrollCompanion.tsx).
// Kept free of DOM / React so it is unit-tested (lib/__tests__/scroll-companion.test.ts).
//
// The companion is ONE 3D object, fixed to the viewport. As the visitor scrolls
// the home page it:
//  - stays hidden while the hero (which has its own 3D object) is on screen,
//    fades in as the hero scrolls away, and fades out again at the very bottom;
//  - sweeps left ↔ right (twice over the page) with a gentle vertical bob;
//  - reports the scroll progress so the object itself can turn with the scroll.

export interface CompanionInput {
  scrollY: number;
  /** document height − viewport height (how far the page can scroll). */
  maxScroll: number;
  /** Viewport width / height in CSS px. */
  vw: number;
  vh: number;
}

export interface CompanionPose {
  /** Centre of the companion, in viewport px. */
  x: number;
  y: number;
  /** Side of the square canvas, in px. */
  size: number;
  /** 0 = hidden (not rendered at all), 1 = fully visible. */
  opacity: number;
  /** Scroll progress in [0, 1]. */
  progress: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const smooth = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

export function companionPose({ scrollY, maxScroll, vw, vh }: CompanionInput): CompanionPose {
  const max = Math.max(maxScroll, 1);
  const progress = clamp(scrollY / max, 0, 1);
  const narrow = vw < 768;

  // Smaller and a little see-through on phones so it never fights the text.
  const size = narrow ? clamp(vw * 0.32, 110, 150) : clamp(vw * 0.2, 180, 300);
  const appear = smooth((scrollY - vh * 0.55) / (vh * 0.45));
  const tail = smooth((max - scrollY) / (vh * 0.5));
  const opacity = appear * tail * (narrow ? 0.75 : 1);

  const margin = size / 2 + 8;
  const swing = Math.max((vw - 2 * margin) / 2, 0);
  const x = clamp(vw / 2 + Math.sin(progress * Math.PI * 4 + 0.6) * swing, margin, Math.max(vw - margin, margin));
  const y = clamp(vh * 0.6 + Math.sin(progress * Math.PI * 6) * vh * 0.06, size / 2, Math.max(vh - size / 2, size / 2));

  return { x, y, size, opacity, progress };
}
