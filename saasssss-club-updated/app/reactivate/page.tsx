"use client";
// /reactivate — public page (apex domain) for owners whose free trial ended.
// A suspended club cannot be signed into, so the owner proves identity with
// email + password and then pays by card (Stripe) or manually (Tunisia).
import { useEffect, useState } from "react";
import { Loader2, CreditCard, Banknote } from "lucide-react";
import CountrySelect from "@/components/payments/CountrySelect";
import ManualPaymentForm from "@/components/billing/ManualPaymentForm";

interface Plan { id: string; name: string; tier: string; priceMonthly: number; currency: string }

export default function ReactivatePage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState("");
  const [planId, setPlanId] = useState("");
  const [mode, setMode] = useState<"choose" | "manual">("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("payment");
    if (q) void Promise.resolve().then(() => setPaid(q));
    void fetch("/api/saas-plans").then((r) => r.json()).then((j) => {
      setPlans(j.plans ?? []);
      setPlanId((j.plans ?? [])[0]?.id ?? "");
    }).catch(() => undefined);
    void fetch("/api/payments/country", { cache: "no-store" }).then((r) => r.json()).then((j) => setCountry(j.countryCode ?? "")).catch(() => undefined);
  }, []);

  const isTn = country === "TN";
  const plan = plans.find((p) => p.id === planId);
  const credsOk = email.includes("@") && password.length > 0 && !!planId;

  const payByCard = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/reactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, planId, countryCode: country, payWith: "STRIPE" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || typeof json?.paymentUrl !== "string") {
        setError(json?.error ?? "Paiement impossible.");
        return;
      }
      window.location.assign(json.paymentUrl);
    } catch {
      setError("Connexion impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm";
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-5 py-10">
      <div>
        <h1 className="text-2xl font-black">Réactiver mon club</h1>
        <p className="mt-1 text-sm text-muted">Votre essai gratuit est terminé. Choisissez un plan pour retrouver votre club et vos données — rien n&apos;est supprimé.</p>
      </div>

      {paid === "success" && (
        <p className="rounded-xl bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-700">
          Paiement reçu. Votre club est réactivé en quelques instants — vous pouvez vous reconnecter.
        </p>
      )}
      {paid === "cancelled" && <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700">Paiement annulé. Vous pouvez réessayer.</p>}

      <div className="space-y-3">
        <input className={field} type="email" autoComplete="email" placeholder="Email du propriétaire" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={field} type="password" autoComplete="current-password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} />
        <CountrySelect value={country} onChange={setCountry} />
        <select className={field} value={planId} onChange={(e) => setPlanId(e.target.value)}>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.priceMonthly} {p.currency}/mois</option>)}
        </select>
      </div>

      {error && <p className="text-sm font-semibold text-rose-500">{error}</p>}

      {mode === "choose" ? (
        <div className="space-y-2">
          {!isTn && (
            <button onClick={payByCard} disabled={busy || !credsOk || !country}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 py-3 text-sm font-extrabold text-slate-950 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Payer par carte
            </button>
          )}
          <button onClick={() => setMode("manual")} disabled={!credsOk}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-border py-3 text-sm font-bold disabled:opacity-50">
            <Banknote className="h-4 w-4" /> Virement / D17 / Flouci / espèces
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-border p-4">
          <ManualPaymentForm
            endpoint="/api/billing/reactivate"
            extraBody={{ email, password, countryCode: country || "TN" }}
            planId={planId}
            planLabel={plan ? `${plan.name} — ${plan.priceMonthly} ${plan.currency}/mois` : ""}
          />
          <button onClick={() => setMode("choose")} className="text-xs text-muted underline">Retour</button>
        </div>
      )}
    </main>
  );
}
