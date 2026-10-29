"use client";
// /platform/manual-payments — SUPER_ADMIN queue for subscription requests made without Stripe
// (bank transfer / D17 / Flouci / cash / agreed terms). Three explicit steps:
//   1. Approuver or Refuser the request            (approving activates NOTHING)
//   2. Verify the payment / agreed terms offline
//   3. Activer l'abonnement — needs a payment/agreement reference, only for an APPROVED request
import { useCallback, useEffect, useState } from "react";
import { Banknote, Loader2, CheckCircle2, XCircle, Phone, ShieldCheck } from "lucide-react";
import { BILLING_PERIOD_LABEL, type BillingPeriod } from "@/lib/billing-period";

type Status = "PENDING" | "APPROVED" | "CONFIRMED" | "REJECTED";
interface Row {
  id: string; planName: string; billingPeriod: BillingPeriod; method: string; contactPhone: string; note: string | null;
  amount: number; currency: string; status: string; reviewNote: string | null; paymentReference: string | null; createdAt: string;
  club: { id: string; name: string; slug: string; status: string };
}
const TABS: { label: string; value: Status | "ALL" }[] = [
  { label: "À examiner", value: "PENDING" },
  { label: "Approuvées (paiement à vérifier)", value: "APPROVED" },
  { label: "Activées", value: "CONFIRMED" },
  { label: "Refusées", value: "REJECTED" },
  { label: "Toutes", value: "ALL" },
];
const STATUS_LABEL: Record<string, string> = {
  PENDING: "En attente", APPROVED: "Approuvée — paiement à vérifier", CONFIRMED: "Activée", REJECTED: "Refusée", CANCELLED: "Annulée",
};

export default function PlatformManualPaymentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<Status | "ALL">("PENDING");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Activation form, one request at a time.
  const [activating, setActivating] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [activationNote, setActivationNote] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/platform/manual-payments?status=${status}`);
      if (res.ok) setRows((await res.json()).requests);
    } finally {
      setLoading(false);
    }
  }, [status]);
  useEffect(() => { void load(); }, [load]);

  const send = async (id: string, body: Record<string, unknown>) => {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/platform/manual-payments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? "Action impossible");
        return false;
      }
      return true;
    } finally {
      setBusy(null);
      await load();
    }
  };

  const approve = (id: string) => {
    if (!window.confirm("Approuver cette demande ? Rien n'est activé tant que vous n'avez pas vérifié le paiement et activé l'abonnement.")) return;
    void send(id, { action: "approve" });
  };
  const reject = (id: string) => {
    const note = window.prompt("Motif du refus (optionnel)") ?? "";
    void send(id, { action: "reject", note });
  };
  const activate = async (id: string) => {
    const ok = await send(id, { action: "activate", paymentReference: reference, note: activationNote });
    if (ok) { setActivating(null); setReference(""); setActivationNote(""); }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div>
        <h1 className="text-3xl font-bold text-primary flex items-center gap-2">
          <Banknote size={28} className="text-emerald-500" /> Demandes d&apos;abonnement hors Stripe
        </h1>
        <p className="text-muted mt-1">
          1) Approuvez ou refusez · 2) vérifiez le paiement ou l&apos;accord convenu · 3) activez l&apos;abonnement avec sa référence.
        </p>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.value} onClick={() => { setLoading(true); setStatus(t.value); }}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${status === t.value ? "bg-emerald-500 text-white" : "bg-surface-hover text-muted"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
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
                  <p className="text-sm text-muted">
                    {r.planName} — <b>{r.amount} {r.currency}</b> · {BILLING_PERIOD_LABEL[r.billingPeriod]} · {r.method} · club {r.club.status}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-surface-hover">{STATUS_LABEL[r.status] ?? r.status}</span>
              </div>
              <p className="text-sm flex items-center gap-1.5"><Phone size={14} /> <a className="underline" href={`tel:${r.contactPhone}`}>{r.contactPhone}</a></p>
              {r.note && <p className="text-sm text-muted">“{r.note}”</p>}
              {r.reviewNote && <p className="text-xs text-muted">Note : {r.reviewNote}</p>}
              {r.paymentReference && <p className="text-xs text-muted">Référence vérifiée : <b>{r.paymentReference}</b></p>}

              {r.status === "PENDING" && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button disabled={busy === r.id} onClick={() => approve(r.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 text-white text-sm disabled:opacity-50">
                    <CheckCircle2 size={16} /> Approuver
                  </button>
                  <button disabled={busy === r.id} onClick={() => reject(r.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 text-red-600 text-sm disabled:opacity-50">
                    <XCircle size={16} /> Refuser
                  </button>
                </div>
              )}

              {r.status === "APPROVED" && (
                activating === r.id ? (
                  <div className="space-y-2 rounded-xl border border-border p-3">
                    <p className="text-xs text-muted">
                      Confirmez que le paiement ({r.amount} {r.currency}, {BILLING_PERIOD_LABEL[r.billingPeriod].toLowerCase()}) est bien reçu, ou que les conditions convenues sont remplies. L&apos;abonnement démarre maintenant.
                    </p>
                    <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200}
                      placeholder="Référence du paiement / de l'accord (n° de virement, reçu…)"
                      className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm" />
                    <input value={activationNote} onChange={(e) => setActivationNote(e.target.value)} maxLength={500}
                      placeholder="Note interne (optionnel)"
                      className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm" />
                    <div className="flex flex-wrap gap-2">
                      <button disabled={busy === r.id || reference.trim().length < 3} onClick={() => void activate(r.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 text-white text-sm disabled:opacity-50">
                        {busy === r.id ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Paiement vérifié — activer
                      </button>
                      <button onClick={() => setActivating(null)} className="px-3 py-2 rounded-xl border border-border text-sm">Annuler</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button disabled={busy === r.id} onClick={() => { setActivating(r.id); setReference(""); setActivationNote(""); }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 text-white text-sm disabled:opacity-50">
                      <ShieldCheck size={16} /> Vérifier le paiement et activer
                    </button>
                    <button disabled={busy === r.id} onClick={() => reject(r.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 text-red-600 text-sm disabled:opacity-50">
                      <XCircle size={16} /> Refuser (paiement non reçu)
                    </button>
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
