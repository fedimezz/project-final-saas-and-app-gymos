"use client";

// components/pricing/PlanRowCard.tsx
//
// ONE horizontal plan/offer card shared by every pricing surface (club home,
// /offres, member dashboard, SaaS landing, billing). On desktop (lg+) it is a
// row with three fixed columns so that, across a stack of plans, names,
// feature lists, prices and buttons line up vertically:
//
//   [ identity | features ...................... | price + button ]
//
// Below lg it stacks (identity → features → price/button) and the button
// becomes full width, so it stays comfortable on a phone. Colors come from the
// brand CSS variables (--primary / --brand-contrast) and shape from the theme
// tokens (--t-radius), so all ten website themes restyle it without changes.

import { memo, type ReactNode } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";

export interface PlanRowAction {
  label: ReactNode;
  /** Renders a link when set, otherwise a <button>. */
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export interface PlanRowCardProps {
  name: string;
  /** Small uppercase line above the name (tier, "Formule", ...). */
  eyebrow?: string;
  description?: string | null;
  features?: ReactNode[];
  /** Already formatted, e.g. "49 TND". */
  price: string;
  /** e.g. "/ mois". */
  period?: string;
  /** Secondary line under the price, e.g. "soit ~16 TND / mois". */
  priceNote?: ReactNode;
  highlighted?: boolean;
  /** Badge text on highlighted cards ("Meilleur prix"...). */
  badge?: string;
  /** Marks the plan the user already has. */
  current?: boolean;
  icon?: ReactNode;
  action: PlanRowAction;
  className?: string;
}

const BASE_BTN =
  "inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold " +
  "transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

function PlanRowCardInner({
  name,
  eyebrow,
  description,
  features = [],
  price,
  period,
  priceNote,
  highlighted = false,
  badge,
  current = false,
  icon,
  action,
  className = "",
}: PlanRowCardProps) {
  const disabled = Boolean(action.disabled);
  const btnClass = `${BASE_BTN} ${
    disabled
      ? "cursor-not-allowed bg-muted text-muted opacity-70"
      : highlighted
      ? "bg-[var(--primary)] text-[var(--brand-contrast,#fff)] shadow-lg shadow-[var(--primary)]/25 hover:brightness-110"
      : "border border-border bg-muted text-primary hover:border-[var(--primary)] hover:text-[var(--primary)]"
  }`;

  const headingId = `plan-${name.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <article
      aria-labelledby={headingId}
      aria-current={current ? "true" : undefined}
      className={`theme-card theme-panel relative grid gap-5 border bg-card p-5 text-primary sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_15rem] lg:items-center lg:gap-8 ${
        highlighted ? "border-[var(--primary)] ring-1 ring-[var(--primary)]/40" : "border-border"
      } ${className}`}
    >
      {highlighted && badge && (
        <span className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-[var(--primary)] px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-[var(--brand-contrast,#fff)] shadow">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {badge}
        </span>
      )}

      {/* Identity */}
      <div className="flex items-start gap-4">
        {icon && (
          <span
            aria-hidden="true"
            className="hidden h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--primary)]/12 text-[var(--primary)] sm:inline-flex"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--brand-text,var(--primary))]">{eyebrow}</p>
          )}
          <h3 id={headingId} className="theme-heading break-words text-xl sm:text-2xl">
            {name}
          </h3>
          {description && <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p>}
        </div>
      </div>

      {/* Features */}
      {features.length > 0 ? (
        <ul className="grid gap-x-6 gap-y-2 text-sm text-secondary sm:grid-cols-2 lg:border-l lg:border-border lg:pl-8">
          {features.map((feature, i) => (
            <li key={i} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--brand-text,var(--primary))]" aria-hidden="true" />
              <span className="min-w-0 break-words">{feature}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="hidden lg:block" aria-hidden="true" />
      )}

      {/* Price + action */}
      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-stretch lg:border-t-0 lg:pt-0">
        <div className="lg:text-center">
          <p className="flex flex-wrap items-baseline gap-x-1 lg:justify-center">
            <span className="theme-heading text-3xl sm:text-4xl">{price}</span>
            {period && <span className="text-sm font-semibold text-muted">{period}</span>}
          </p>
          {priceNote && <p className="mt-0.5 text-xs text-muted">{priceNote}</p>}
        </div>

        <div className="sm:w-56 lg:w-full">
          {action.href && !disabled ? (
            <Link href={action.href} className={btnClass}>
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              disabled={disabled}
              aria-disabled={disabled}
              className={btnClass}
            >
              {action.label}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

const PlanRowCard = memo(PlanRowCardInner);
export default PlanRowCard;

/** Vertical rhythm for a stack of plan rows (gap leaves room for the floating badge). */
export function PlanRowList({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto flex w-full max-w-6xl flex-col gap-7 ${className}`}>{children}</div>;
}
