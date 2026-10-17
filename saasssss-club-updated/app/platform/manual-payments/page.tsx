"use client";
// /platform/manual-payments — SUPER_ADMIN queue for non-Stripe payments
// (bank transfer / D17 / Flouci / cash). "Confirmer" = money received:
// the club's subscription is activated for one month.
import { useCallback, useEffect, useState } from "react";
import { Banknote, Loader2, CheckCircle2, XCircle, Phone } from "lucide-react";

type Status = "PENDING" | "CONFIRMED" | "REJECTED";
interface Row {
  id: string; planName: string; method: string; contactPhone: string; note: string | null;
  amount: number; currency: string; status: string; reviewNote: string | null; createdAt: string;
  club: { id: string; name: string; slug: string; status: string };
}
const TABS: { label: string; value: Status | "ALL" }[] = [
  { label: "En attente", value: "PENDING" },
  { label: "Confirmés", value: "CONFIRMED" },
  { label: "Refusés", value: "REJECTED" },
  { label: "Tous", value: "ALL" },
];

export default function PlatformManualPaymentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<Status | "ALL">("PENDING");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/platform/manual-payments?status=${status}`);
      if (res.ok) setRows((await res.json()).requests);
    } finally {
      setLoading(false);
    }
  }, [status]);
  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, action: "confirm" | "reject") => {
    const note = action === "reject" ? window.prompt("Motif du refus (optionnel)") ?? "" : "";
    if (action === "confirm" && !window.confirm("Confirmer : l'argent est bien reçu ? Le club sera activé pour 1 mois.")) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/platform/manual-payments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      if (!res.ok) setError((await res.json().catch(() => null))?.error ?? "Action impossible");
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div>
        <h1 className="text-3xl font-bold text-primary flex items-center gap-2">
          <Banknote size={28} className="text-emerald-500" /> Paiements manuels
        </h1>
        <p className="text-muted mt-1">Virement, D17, Flouci, espèces — confirmez dès que l&apos;argent est reçu.</p>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.value} onClick={() => { setLoading(true); setStatus(t.value); }}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${status === t.value ? "bg-emerald-500 text-white" : "bg-surface-hover text-muted"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted" /></div>
      ) : rows.length === 0 ? (
        <p className="text-muted text-center py-16">Aucune demande.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-surface p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{r.club.name} <span className="text-muted font-normal">({r.club.slug})</span></p>
                  <p className="text-sm text-muted">{r.planName} — <b>{r.amount} {r.currency}</b>/mois · {r.method} · club {r.club.status}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-surface-hover">{r.status}</span>
              </div>
              <p className="text-sm flex items-center gap-1.5"><Phone size={14} /> <a className="underline" href={`tel:${r.contactPhone}`}>{r.contactPhone}</a></p>
              {r.note && <p className="text-sm text-muted">“{r.note}”</p>}
              {r.reviewNote && <p className="text-xs text-muted">Note : {r.reviewNote}</p>}
              {r.status === "PENDING" && (
                <div className="flex gap-2 pt-1">
                  <button disabled={busy === r.id} onClick={() => act(r.id, "confirm")}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 text-white text-sm disabled:opacity-50">
                    <CheckCircle2 size={16} /> Confirmer (argent reçu)
                  </button>
                  <button disabled={busy === r.id} onClick={() => act(r.id, "reject")}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 text-red-600 text-sm disabled:opacity-50">
                    <XCircle size={16} /> Refuser
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
