interface Props {
  status: "active" | "inactive" | "pending" | "cancelled" | "suspended" | "paid" | "unpaid";
  size?: "sm" | "md";
}

const CONFIG = {
  active:    { label: "Actif",     classes: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  inactive:  { label: "Inactif",   classes: "bg-red-500/10 text-red-600 dark:text-red-400" },
  pending:   { label: "En attente",classes: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  cancelled: { label: "Annulé",   classes: "bg-zinc-500/10 text-zinc-500" },
  suspended: { label: "Suspendu", classes: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  paid:      { label: "Payé",     classes: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  unpaid:    { label: "Impayé",   classes: "bg-red-500/10 text-red-600 dark:text-red-400" },
};

export default function StatusBadge({ status, size = "sm" }: Props) {
  const cfg = CONFIG[status] ?? CONFIG.inactive;
  const padding = size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span className={`inline-flex items-center font-semibold rounded-full ${padding} ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}