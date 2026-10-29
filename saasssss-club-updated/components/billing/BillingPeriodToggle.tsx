"use client";
// Monthly / yearly switch shared by onboarding, /admin/billing and /reactivate.
import { BILLING_PERIODS, BILLING_PERIOD_LABEL, type BillingPeriod } from "@/lib/billing-period";

interface Props {
  value: BillingPeriod;
  onChange: (period: BillingPeriod) => void;
  /** Best saving across the offered plans, shown as a badge on "Annuel". */
  savingsPercent?: number;
  disabled?: boolean;
  /** Hide "Annuel" when no plan offers a yearly price. */
  yearlyAvailable?: boolean;
}

export default function BillingPeriodToggle({ value, onChange, savingsPercent = 0, disabled, yearlyAvailable = true }: Props) {
  const periods = BILLING_PERIODS.filter((p) => p !== "YEARLY" || yearlyAvailable);
  if (periods.length < 2) return null;
  return (
    <div role="radiogroup" aria-label="Période de facturation" className="inline-flex rounded-full border border-border bg-card p-1">
      {periods.map((p) => {
        const selected = p === value;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(p)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
              selected ? "bg-[var(--primary)] text-white" : "text-secondary hover:text-primary"
            }`}
          >
            {BILLING_PERIOD_LABEL[p]}
            {p === "YEARLY" && savingsPercent > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${selected ? "bg-white/20" : "bg-emerald-500/15 text-emerald-600"}`}>
                -{savingsPercent}%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
