"use client";

import { useState } from "react";
import { BadgePercent, Check, Copy, Clock } from "lucide-react";
import { usePublicPromotions, type PublicPromotion } from "@/hooks/usePublicPromotions";

function discountLabel(p: PublicPromotion): string {
  return p.discountType === "PERCENT" ? `-${p.discountValue}%` : `-${p.discountValue} TND`;
}

function endLabel(p: PublicPromotion): string | null {
  if (!p.endDate) return null;
  const date = new Date(p.endDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  return `Jusqu'au ${date}`;
}

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        } catch {
          /* clipboard unavailable — the code stays visible and selectable */
        }
      }}
      aria-label={`Copier le code ${code}`}
      className="inline-flex items-center gap-2 rounded-lg border border-dashed border-[var(--border-medium)] bg-[var(--bg-muted)] px-3 py-1.5 font-mono text-sm font-semibold tracking-wider text-[var(--text-primary)] transition hover:border-[var(--brand)]"
    >
      {code}
      {copied ? <Check size={14} className="text-[var(--success-fg)]" aria-hidden /> : <Copy size={14} aria-hidden />}
      <span className="sr-only" aria-live="polite">{copied ? "Code copié" : ""}</span>
    </button>
  );
}

/**
 * Promotional offers the club published. Renders nothing when there are none,
 * so pages can drop it in without an empty block. All colors are semantic
 * tokens, so it is readable in light and dark mode and follows the club theme.
 */
export default function PromotionsSection({
  title = "Offres du moment",
  subtitle = "Profitez de nos offres promotionnelles en cours.",
  className = "",
}: {
  title?: string;
  subtitle?: string;
  className?: string;
}) {
  const { promotions, loading } = usePublicPromotions();
  if (loading || promotions.length === 0) return null;

  return (
    <section aria-labelledby="promotions-heading" className={className} data-testid="public-promotions">
      <div className="container mx-auto px-4">
        <div className="mb-8 text-center">
          <h2 id="promotions-heading" className="text-3xl font-bold text-[var(--text-primary)] theme-heading">{title}</h2>
          <p className="mt-2 text-[var(--text-muted)]">{subtitle}</p>
        </div>
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {promotions.map((p) => {
            const ends = endLabel(p);
            return (
              <li key={p.id} className="theme-card relative flex flex-col gap-3 rounded-2xl border border-[var(--border-light)] bg-[var(--bg-card)] p-6 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">{p.title}</h3>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--brand)] px-3 py-1 text-sm font-extrabold text-[var(--brand-contrast)]">
                    <BadgePercent size={14} aria-hidden />
                    {discountLabel(p)}
                  </span>
                </div>
                {p.description && <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{p.description}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
                  <CopyCode code={p.code} />
                  {ends && (
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
                      <Clock size={12} aria-hidden /> {ends}
                    </span>
                  )}
                  {p.usesLeft !== null && p.usesLeft <= 20 && (
                    <span className="text-xs font-semibold text-[var(--warning-fg)]">
                      Plus que {p.usesLeft} utilisation{p.usesLeft > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
