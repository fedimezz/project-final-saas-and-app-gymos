"use client";
// /admin/services — OWNER: request a personalised domain and optional paid
// services. Amounts always come from the API (set by the platform team);
// nothing is charged here — requests are reviewed manually by the platform team.
import { useCallback, useEffect, useState } from "react";
import { Globe, Loader2, Send, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import OwnerOnly from "@/components/admin/OwnerOnly";
import { formatMembershipPrice } from "@/lib/payment-currencies";
import {
  DOMAIN_STATUS_META, ORDERABLE_SERVICE_TYPES, SERVICE_META, SERVICE_STATUS_META,
  type ServiceType,
} from "@/lib/service-catalog";

interface DomainReq {
  id: string; domain: string; status: keyof typeof DOMAIN_STATUS_META; reviewNote: string | null;
  dnsInstructions: { text?: string } | null; priceAtRequest: number; currency: string; createdAt: string;
}
interface ServiceReq {
  id: string; type: ServiceType; status: keyof typeof SERVICE_STATUS_META; description: string | null;
  reviewNote: string | null; priceAtRequest: number; currency: string; createdAt: string;
}
interface Price { serviceType: string; price: number; currency: string }

const STEPS = ["PENDING", "APPROVED", "CONFIGURING", "ACTIVE"] as const;

export default function ServicesPage() {
  const [domains, setDomains] = useState<DomainReq[]>([]);
  const [services, setServices] = useState<ServiceReq[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [desc, setDesc] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [d, s] = await Promise.all([
        fetch("/api/admin/domain-request", { credentials: "include" }),
        fetch("/api/admin/service-request", { credentials: "include" }),
      ]);
      if (!d.ok || !s.ok) throw new Error();
      setDomains((await d.json()).requests ?? []);
      const sj = await s.json();
      setServices(sj.requests ?? []);
      setPrices(sj.prices ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const priceOf = (t: string) => prices.find((p) => p.serviceType === t);
  const fmt = (p?: { price: number; currency: string }) =>
    p ? formatMembershipPrice(p.price, p.currency) : "Tarif non défini";

  const submit = async (key: string, url: string, body: object, reset: () => void) => {
    setBusy(key); setMsg(null);
    try {
      const res = await fetch(url, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, text: json.error ?? "Erreur, réessayez." }); return; }
      reset(); setMsg({ ok: true, text: "Demande envoyée. Notre équipe vous répondra." }); await load();
    } catch {
      setMsg({ ok: false, text: "Connexion impossible. Vérifiez votre réseau." });
    } finally { setBusy(null); }
  };

  const liveDomain = domains.find((d) => d.status !== "REJECTED");

  return (
    <OwnerOnly>
      <div className="space-y-6 pb-10 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2"><Sparkles size={22} /> Services & domaine</h1>
          <p className="text-sm text-muted mt-1">
            Services optionnels, facultatifs. Votre site est déjà disponible sur son adresse standard.
          </p>
        </div>

        {msg && (
          <div role="status" className={`flex items-center gap-2 text-sm rounded-xl px-3 py-2 ${msg.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>
            {msg.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {msg.text}
          </div>
        )}
        {loading ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[var(--primary)]" /></div>
        : loadError ? (
          <div className="text-sm text-muted py-10 text-center">
            Chargement impossible. <button onClick={() => { setLoading(true); load(); }} className="underline">Réessayer</button>
          </div>
        ) : (<>
          <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <h2 className="font-semibold text-primary flex items-center gap-2"><Globe size={16} /> Domaine personnalisé <span className="text-xs text-muted font-normal">· {fmt(priceOf("CUSTOM_DOMAIN"))}</span></h2>
            <p className="text-xs text-muted">Vous devez déjà posséder le domaine. La configuration DNS est effectuée manuellement par notre équipe après validation ; aucune activation automatique.</p>
            {liveDomain ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-primary">{liveDomain.domain} — {DOMAIN_STATUS_META[liveDomain.status]}</p>
                <ol className="flex gap-1 text-[11px]" aria-label="Progression">
                  {STEPS.map((s, i) => (
                    <li key={s} className={`flex-1 rounded-full px-2 py-1 text-center ${i <= STEPS.indexOf(liveDomain.status as (typeof STEPS)[number]) ? "bg-[var(--primary)] text-white" : "bg-muted/30 text-muted"}`}>
                      {DOMAIN_STATUS_META[s]}
                    </li>
                  ))}
                </ol>
                {liveDomain.dnsInstructions?.text && <pre className="text-xs bg-muted/30 rounded-lg p-3 whitespace-pre-wrap">{liveDomain.dnsInstructions.text}</pre>}
                {liveDomain.reviewNote && <p className="text-xs text-muted">Note : {liveDomain.reviewNote}</p>}
                <p className="text-xs text-muted">Tarif au moment de la demande : {formatMembershipPrice(liveDomain.priceAtRequest, liveDomain.currency)}</p>
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); submit("domain", "/api/admin/domain-request", { domain }, () => setDomain("")); }} className="flex gap-2">
                <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="www.monclub.tn" aria-label="Nom de domaine"
                  className="flex-1 min-w-0 bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" maxLength={300} />
                <button disabled={busy === "domain" || !domain.trim() || !priceOf("CUSTOM_DOMAIN")}
                  className="px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
                  {busy === "domain" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Demander
                </button>
              </form>
            )}
            {domains.some((d) => d.status === "REJECTED") && !liveDomain && (
              <p className="text-xs text-red-600">Dernière demande refusée{domains[0]?.reviewNote ? ` : ${domains[0].reviewNote}` : "."}</p>
            )}
          </section>

          <section className="space-y-3">
            {ORDERABLE_SERVICE_TYPES.map((t) => {
              const open = services.find((s) => s.type === t && ["PENDING", "APPROVED", "IN_PROGRESS"].includes(s.status));
              return (
                <div key={t} className="bg-card border border-border rounded-2xl p-4 space-y-2">
                  <div className="flex justify-between gap-3 flex-wrap">
                    <div><p className="font-semibold text-primary text-sm">{SERVICE_META[t].label}</p><p className="text-xs text-muted">{SERVICE_META[t].description}</p></div>
                    <span className="text-sm font-semibold text-primary whitespace-nowrap">{fmt(priceOf(t))}</span>
                  </div>
                  {open ? <p className="text-xs text-blue-600">Demande en cours — {SERVICE_STATUS_META[open.status]}</p> : (
                    <div className="flex gap-2">
                      <input value={desc[t] ?? ""} onChange={(e) => setDesc({ ...desc, [t]: e.target.value })} placeholder="Précisions (facultatif)" aria-label={`Précisions ${SERVICE_META[t].label}`}
                        className="flex-1 min-w-0 bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" maxLength={2000} />
                      <button disabled={busy === t || !priceOf(t)}
                        onClick={() => submit(t, "/api/admin/service-request", { type: t, description: desc[t] ?? "" }, () => setDesc({ ...desc, [t]: "" }))}
                        className="px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold disabled:opacity-50">
                        {busy === t ? <Loader2 size={14} className="animate-spin" /> : "Demander"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {services.length > 0 && (
            <section className="bg-card border border-border rounded-2xl p-4">
              <h2 className="font-semibold text-primary text-sm mb-2">Historique</h2>
              <ul className="divide-y divide-border text-sm">
                {services.map((s) => (
                  <li key={s.id} className="py-2 flex justify-between gap-3 flex-wrap">
                    <span className="text-primary">{SERVICE_META[s.type].label} · <span className="text-muted">{SERVICE_STATUS_META[s.status]}</span></span>
                    <span className="text-xs text-muted">{formatMembershipPrice(s.priceAtRequest, s.currency)} · {new Date(s.createdAt).toLocaleDateString("fr-FR")}</span>
                    {s.reviewNote && <span className="basis-full text-xs text-muted">Note : {s.reviewNote}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>)}
      </div>
    </OwnerOnly>
  );
}
