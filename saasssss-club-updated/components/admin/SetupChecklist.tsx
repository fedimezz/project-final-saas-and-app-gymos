"use client";
// SetupChecklist — shown at the top of /admin for a new club until the
// owner has done the essentials (branding, a plan, a coach, a schedule).
// Progress comes from /api/admin/setup-status, which derives each step from
// real data rather than a separate tracked flag — see that route for why.
// "Dismissed" is a per-browser UI preference (not business data), so it's
// kept in localStorage rather than the database.

import { useState, useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight, X, Rocket, Sparkles } from "lucide-react";

interface SetupStep {
  id: string;
  title: string;
  description: string;
  guidance?: string;
  done: boolean;
  href: string;
  optional?: boolean;
}

interface MissingItem {
  id: string;
  label: string;
  href: string;
  guidance: string;
}

interface SetupStatus {
  steps: SetupStep[];
  completedCount: number;
  totalCount: number;
  allDone: boolean;
  // Website configuration (added by the granular setup-status). Optional so
  // the component keeps working against an older API response.
  percent?: number;
  missing?: MissingItem[];
}

const DISMISS_KEY = "gymos:setup-checklist-dismissed";

export default function SetupChecklist() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [dismissed, setDismissed] = useState(true); // default hidden until we know it's not dismissed AND not done
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const wasDismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
        const res = await fetch("/api/admin/setup-status");
        if (!res.ok || cancelled) return;
        const data: SetupStatus = await res.json();
        if (cancelled) return;
        setStatus(data);
        setDismissed(wasDismissed || data.allDone);
      } catch {
        // Silent — the checklist is a helper, not critical path. The rest of
        // the admin dashboard must never fail to load because of this.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* localStorage unavailable (private browsing, etc.) — dismissal just won't persist */
    }
  };

  if (!loaded || dismissed || !status) return null;

  const pct = Math.round((status.completedCount / status.totalCount) * 100);
  const sitePercent = status.percent;
  const nextActions = status.steps.filter((s) => !s.done && !s.optional).slice(0, 2);

  return (
    <div className="relative rounded-2xl border border-emerald-500/25 bg-emerald-500/8 p-5 mb-6">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Masquer la liste de démarrage"
        className="absolute top-4 right-4 p-1.5 rounded-lg opacity-60 hover:opacity-100 transition-opacity"
      >
        <X size={15} />
      </button>

      <div className="flex items-center gap-3 mb-1">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
          <Rocket size={20} className="text-emerald-500" />
        </div>
        <div>
          <p className="font-semibold text-sm">Configurez votre club</p>
          <p className="text-xs opacity-70">
            {status.completedCount}/{status.totalCount} étapes complétées
            {typeof sitePercent === "number" && <> · votre site public est configuré à {sitePercent}%</>}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden my-4">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {nextActions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {nextActions.map((a) => (
            <Link
              key={a.id}
              href={a.href}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 text-white text-xs font-semibold px-3.5 py-1.5 hover:bg-emerald-600 transition-colors"
            >
              <Sparkles size={13} />
              {a.title}
            </Link>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-2">
        {status.steps.map((step) => (
          <Link
            key={step.id}
            href={step.href}
            className={`flex items-start gap-3 rounded-xl p-3 transition-colors ${
              step.done
                ? "opacity-60"
                : "bg-white/60 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10"
            }`}
          >
            {step.done ? (
              <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
            ) : (
              <Circle size={18} className="opacity-40 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                {step.title}
                {step.optional && (
                  <span className="text-[10px] font-normal opacity-50">(optionnel)</span>
                )}
              </p>
              <p className="text-xs opacity-70 mt-0.5">
                {!step.done && step.guidance ? step.guidance : step.description}
              </p>
            </div>
            {!step.done && <ArrowRight size={14} className="opacity-40 shrink-0 mt-1" />}
          </Link>
        ))}
      </div>
    </div>
  );
}
