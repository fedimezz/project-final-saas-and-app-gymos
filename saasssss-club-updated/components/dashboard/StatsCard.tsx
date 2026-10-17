import { LucideIcon, ArrowUp, ArrowDown } from "lucide-react";

interface Props {
  title: string;
  value: string;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  subtitle?: string;
}

export default function StatsCard({
  title,
  value,
  icon: Icon,
  trend,
  trendUp,
  subtitle,
}: Props) {
  return (
    <div className="group relative overflow-hidden bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-6 shadow-md backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-slate-300 dark:hover:border-slate-700">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</p>
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 transition-transform duration-300 group-hover:scale-110">
          <Icon size={18} />
        </div>
      </div>

      <h3 className="mt-4 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">{value}</h3>

      {trend && (
        <p
          className={`mt-3 text-xs font-bold inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${
            trendUp ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
          }`}
        >
          {trendUp ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          {trend}
        </p>
      )}

      {subtitle && !trend && (
        <p className="mt-3 text-xs font-semibold text-slate-400">{subtitle}</p>
      )}
    </div>
  );
}