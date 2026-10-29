import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

beforeEach(() => {
  process.env.LEGAL_ENTITY_NAME = "Fedi X — Entreprise individuelle";
  process.env.LEGAL_ADDRESS = "1 rue de Tunis, Tunis";
  process.env.NEXT_PUBLIC_CONTACT_EMAIL = "contact@clubx.test";
});

describe("legal pages (no more '#' placeholders)", () => {
  it("terms explain trial, monthly/yearly, payment verification, no auto-renewal, expiry and data retention", async () => {
    const { default: TermsPage } = await import("@/app/legal/terms/page");
    const html = renderToStaticMarkup(TermsPage());
    for (const text of ["14 jours", "mensuelle", "annuelle", "Stripe", "approuve", "reconduits automatiquement", "délai de grâce", "conservées", "modèle 3D"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("Fedi X");
    expect(html).toContain("mailto:contact@clubx.test");
  });

  it("privacy lists the data, the processors, the rights and the Tunisian authority", async () => {
    const { default: PrivacyPage } = await import("@/app/legal/privacy/page");
    const html = renderToStaticMarkup(PrivacyPage());
    for (const text of ["Stripe", "Resend", "Cloudinary", "Upstash", "INPDP", "suppression", "cookies"]) expect(html).toContain(text);
    expect(html).toContain("contact@clubx.test");
  });

  it("falls back to 'ClubX' when the publisher is not configured yet (no 'undefined' on the page)", async () => {
    delete process.env.LEGAL_ENTITY_NAME; delete process.env.LEGAL_ADDRESS; delete process.env.NEXT_PUBLIC_CONTACT_EMAIL;
    const { default: TermsPage } = await import("@/app/legal/terms/page");
    const html = renderToStaticMarkup(TermsPage());
    expect(html).not.toContain("undefined");
    expect(html).toContain("ClubX");
  });

  it("the landing footer links to them", async () => {
    const fs = await import("node:fs");
    const footer = fs.readFileSync("components/landing/LandingFooter.tsx", "utf8");
    expect(footer).toContain("/legal/terms");
    expect(footer).toContain("/legal/privacy");
    expect(footer).not.toMatch(/name: "Confidentialité", href: "#"/);
  });
});
