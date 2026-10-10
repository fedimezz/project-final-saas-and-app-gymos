"use client";
// ConfigurationStatus — "how complete is my public website?" card shown at the
// top of /admin/settings. Reads the same live data as the dashboard checklist
// (/api/admin/setup-status → `checks`), so ticks can't drift from reality.

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, ExternalLink } from "lucide-react";

interface Check {
  id: string;
  label: string;
  done: boolean;
  href: string;
  guidance: string;
}

interface StatusResponse {
  checks?: Check[];
  percent?: number;
}

export default function ConfigurationStatus({ previewUrl }: { previewUrl?: string | null }) {
  const [data, setData] = useState<StatusResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/setup-status");
        if (!res.ok) return;
        const json: StatusResponse = await res.json();
        if (!cancelled) setData(json);
      } catch {
        /* helper card — never block the settings page */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data?.checks) return null;
  const percent = data.percent ?? 0;

  return (
    <section
      aria-label="État de la configuration"
      className="rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 p-5 mb-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold text-sm">État de la configuration</h2>
          <p className="text-xs opacity-70">Votre site public est configuré à {percent}%</p>
        </div>
        <a
          href={previewUrl || "/"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 dark:border-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <ExternalLink size={13} /> Prévisualiser le site
        </a>
      </div>

      <div className="h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden mb-4" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>

      <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {data.checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-sm">
            {c.done ? (
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" aria-label="Configuré" />
            ) : (
              <XCircle size={16} className="text-rose-500 shrink-0 mt-0.5" aria-label="À configurer" />
            )}
            <span className={c.done ? "opacity-70" : ""}>
              {c.done ? (
                c.label
              ) : (
                <Link href={c.href} className="hover:underline" title={c.guidance}>
                  {c.label}
                </Link>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
