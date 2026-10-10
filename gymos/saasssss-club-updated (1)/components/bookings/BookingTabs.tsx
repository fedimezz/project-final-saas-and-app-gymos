"use client";

export type BookingTab = "upcoming" | "past" | "cancelled";

interface Props {
  active: BookingTab;
  onChange: (tab: BookingTab) => void;
  counts: Record<BookingTab, number>;
}

const TABS: { key: BookingTab; label: string }[] = [
  { key: "upcoming", label: "À venir" },
  { key: "past", label: "Historique" },
  { key: "cancelled", label: "Annulées" },
];

export default function BookingTabs({ active, onChange, counts }: Props) {
  return (
    <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            active === tab.key
              ? "bg-card text-primary shadow-sm"
              : "text-muted hover:text-primary"
          }`}
        >
          {tab.label}
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full ${
              active === tab.key
                ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                : "bg-card text-muted"
            }`}
          >
            {counts[tab.key]}
          </span>
        </button>
      ))}
    </div>
  );
}