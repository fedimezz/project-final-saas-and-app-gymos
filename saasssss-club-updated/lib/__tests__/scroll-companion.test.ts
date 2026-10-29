import { describe, expect, it } from "vitest";
import { companionPose } from "@/lib/scroll-companion";

const desktop = { vw: 1440, vh: 900 };
const phone = { vw: 390, vh: 800 };
const maxScroll = 6000;

describe("companionPose", () => {
  it("is hidden while the hero is on screen", () => {
    expect(companionPose({ ...desktop, scrollY: 0, maxScroll }).opacity).toBe(0);
    expect(companionPose({ ...desktop, scrollY: desktop.vh * 0.5, maxScroll }).opacity).toBe(0);
  });

  it("is fully visible in the middle of the page", () => {
    expect(companionPose({ ...desktop, scrollY: 3000, maxScroll }).opacity).toBe(1);
  });

  it("fades out again at the very bottom of the page", () => {
    expect(companionPose({ ...desktop, scrollY: maxScroll, maxScroll }).opacity).toBe(0);
    const nearBottom = companionPose({ ...desktop, scrollY: maxScroll - 200, maxScroll }).opacity;
    expect(nearBottom).toBeGreaterThan(0);
    expect(nearBottom).toBeLessThan(1);
  });

  it("never leaves the viewport, wherever the visitor is on the page", () => {
    for (const vp of [desktop, phone]) {
      for (let y = 0; y <= maxScroll; y += 137) {
        const pose = companionPose({ ...vp, scrollY: y, maxScroll });
        expect(pose.x - pose.size / 2).toBeGreaterThanOrEqual(0);
        expect(pose.x + pose.size / 2).toBeLessThanOrEqual(vp.vw);
        expect(pose.y - pose.size / 2).toBeGreaterThanOrEqual(0);
        expect(pose.y + pose.size / 2).toBeLessThanOrEqual(vp.vh);
      }
    }
  });

  it("actually moves sideways as the page scrolls", () => {
    const xs = [2000, 2800, 3600, 4400].map((y) => companionPose({ ...desktop, scrollY: y, maxScroll }).x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(200);
  });

  it("is smaller and more transparent on a phone", () => {
    const d = companionPose({ ...desktop, scrollY: 3000, maxScroll });
    const p = companionPose({ ...phone, scrollY: 3000, maxScroll });
    expect(p.size).toBeLessThan(d.size);
    expect(p.opacity).toBeLessThan(d.opacity);
  });

  it("reports progress in [0, 1] and survives a page that cannot scroll", () => {
    expect(companionPose({ ...desktop, scrollY: 3000, maxScroll }).progress).toBeCloseTo(0.5);
    const flat = companionPose({ ...desktop, scrollY: 0, maxScroll: 0 });
    expect(flat.progress).toBe(0);
    expect(Number.isFinite(flat.x)).toBe(true);
  });
});
