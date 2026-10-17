// Server-render the shared horizontal plan card and check the markup contract:
// price/features/button present, link vs button, disabled + current states, and
// the desktop row layout classes (3 aligned columns) with a stacked mobile base.
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PlanRowCard, { PlanRowList } from "../PlanRowCard";

const render = (props: Partial<Parameters<typeof PlanRowCard>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(PlanRowCard, {
      name: "Premium", price: "49 TND", period: "/ 30 jours", features: ["Accès illimité", "Coach"],
      action: { label: "Souscrire", href: "/user/register" }, ...props,
    })
  );

describe("PlanRowCard", () => {
  it("shows name, price, period, every feature and the action", () => {
    const html = render();
    for (const text of ["Premium", "49 TND", "/ 30 jours", "Accès illimité", "Coach", "Souscrire"]) expect(html).toContain(text);
  });

  it("is a horizontal 3-column row on desktop and stacks on mobile", () => {
    const html = render();
    expect(html).toMatch(/lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1\.4fr\)_15rem\]/);
    expect(html).toContain("<article");
    expect(html).toContain("aria-labelledby");
  });

  it("renders a real link when href is given, a button otherwise", () => {
    expect(render()).toMatch(/<a [^>]*href="\/user\/register"/);
    const btn = render({ action: { label: "Choisir", onClick: () => {} } });
    expect(btn).toMatch(/<button[^>]*type="button"/);
    expect(btn).not.toContain("<a ");
  });

  it("disables the action (no link) and marks the current plan", () => {
    const html = render({ current: true, action: { label: "Plan actuel", href: "/x", disabled: true } });
    expect(html).toContain("disabled");
    expect(html).not.toContain('href="/x"');
    expect(html).toContain('aria-current="true"');
  });

  it("shows the badge only on highlighted cards", () => {
    expect(render({ highlighted: true, badge: "Meilleur prix" })).toContain("Meilleur prix");
    expect(render({ highlighted: false, badge: "Meilleur prix" })).not.toContain("Meilleur prix");
  });

  it("PlanRowList stacks cards with room for the badge", () => {
    const html = renderToStaticMarkup(createElement(PlanRowList, null, createElement("i")));
    expect(html).toContain("flex-col");
  });
});
