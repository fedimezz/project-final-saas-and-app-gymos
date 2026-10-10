import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  title: string;
  value: string;
  icon: LucideIcon;
  color?: "blue" | "green" | "purple" | "amber" | "red";
  subtitle?: string;
  trend?: { value: string; up?: boolean };
}

const COLORS = {
  blue: "border-sky-500/20 bg-sky-500/10 text-sky-400 dark:text-sky-300",
  green: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 dark:text-emerald-300",
  purple: "border-violet-500/20 bg-violet-500/10 text-violet-400 dark:text-violet-300",
  amber: "border-amber-500/20 bg-amber-500/10 text-amber-400 dark:text-amber-300",
  red: "border-rose-500/20 bg-rose-500/10 text-rose-400 dark:text-rose-300",
} as const;

export default function StatCard({
  title,
  value,
  icon: Icon,
  color = "green",
  subtitle,
  trend,
}: Props) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 p-5 shadow-md backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-slate-300 dark:hover:border-slate-700">
      {/* Background ambient lighting on hover */}
      <div className="absolute -top-10 -right-10 h-24 w-24 rounded-full bg-emerald-500/10 blur-xl opacity-0 group-hover:opacity-100 transition duration-500 pointer-events-none" />

      <div className="flex items-start justify-between gap-3 relative z-10">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">{value}</p>
        </div>
        <div className={`rounded-xl border p-3 transition-transform duration-300 group-hover:scale-110 ${COLORS[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {(subtitle || trend) && (
        <div className="mt-4 flex items-center justify-between text-xs pt-3 border-t border-slate-100 dark:border-slate-800/60 relative z-10">
          {subtitle ? <span className="font-medium text-slate-400">{subtitle}</span> : <span />}
          {trend ? (
            <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md ${
              trend.up ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
            }`}>
              {trend.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {trend.value}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}