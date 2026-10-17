"use client";
// Manual payment request form (bank transfer / D17 / Flouci / cash).
// Used by /admin/billing (logged-in owner) and /reactivate (expired trial).
import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { MANUAL_METHODS, MANUAL_METHOD_LABEL, type ManualMethod } from "@/lib/manual-payment-shared";

interface Props {
  /** Endpoint + extra body (the reactivate route also needs credentials). */
  endpoint: string;
  extraBody?: Record<string, unknown>;
  planId: string;
  planLabel: string;
  onDone?: () => void;
}

export default function ManualPaymentForm({ endpoint, extraBody, planId, planLabel, onDone }: Props) {
  const [method, setMethod] = useState<ManualMethod>("BANK_TRANSFER");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...extraBody, planId, method, contactPhone: phone, note, payWith: "MANUAL" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? "Demande impossible. Réessayez.");
        return;
      }
      setInstructions(json.instructions ?? "Nous vous contactons très vite.");
      onDone?.();
    } catch {
      setError("Connexion impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  if (instructions) {
    return (
      <div className="space-y-2 rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-700">
        <p className="flex items-center gap-2 font-bold"><CheckCircle2 size={16} /> Demande envoyée — {planLabel}</p>
        <p className="whitespace-pre-line">{instructions}</p>
        <p className="text-xs">Votre club est réactivé dès que le paiement est confirmé par notre équipe.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">Plan choisi : <b>{planLabel}</b></p>
      <select value={method} onChange={(e) => setMethod(e.target.value as ManualMethod)}
        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
        {MANUAL_METHODS.map((m) => <option key={m} value={m}>{MANUAL_METHOD_LABEL[m]}</option>)}
      </select>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Votre téléphone / WhatsApp"
        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm" />
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="Message (optionnel)"
        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm" />
      {error && <p className="text-xs font-semibold text-rose-500">{error}</p>}
      <button onClick={submit} disabled={busy || phone.trim().length < 7}
        className="flex w-full items-center justify-center gap-1.5 rounded-full bg-emerald-500 py-2.5 text-sm font-extrabold text-slate-950 disabled:opacity-50">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Envoyer ma demande
      </button>
    </div>
  );
}
