"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

interface SystemHealth {
  db: { ok: boolean; latencyMs: number };
  counts: { clubCount: number; userCount: number; sessionCount: number; bookingCount: number; logCount: number };
  env: Record<string, boolean>;
  serverTime: string;
}

export default function PlatformSystemPage() {
  const [data, setData] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/platform/system");
      if (res.ok) setData(await res.json());
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (!data) return <p className="text-sm text-rose-500">Impossible de charger l&apos;état du système.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5">
        {data.db.ok ? <CheckCircle2 className="h-6 w-6 text-emerald-500" /> : <XCircle className="h-6 w-6 text-rose-500" />}
        <div>
          <p className="text-sm font-extrabold text-primary">Base de données {data.db.ok ? "opérationnelle" : "indisponible"}</p>
          <p className="text-xs text-muted">Latence : {data.db.latencyMs}ms</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {Object.entries(data.counts).map(([key, val]) => (
          <div key={key} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{key}</p>
            <p className="mt-1 text-xl font-black text-primary">{val}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-extrabold text-primary">Variables d&apos;environnement</h3>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {Object.entries(data.env).map(([key, ok]) => (
            <div key={key} className="flex items-center gap-2 text-xs">
              {ok ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 flex-shrink-0 text-rose-500" />}
              <span className={ok ? "font-semibold text-primary" : "font-semibold text-muted"}>{key}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-muted">Heure serveur : {new Date(data.serverTime).toLocaleString("fr-FR")}</p>
    </div>
  );
}
