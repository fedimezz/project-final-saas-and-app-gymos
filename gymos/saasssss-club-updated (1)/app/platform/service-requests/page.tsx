"use client";
// /platform/service-requests — SUPER_ADMIN: review custom-domain and paid
// service requests, and manage the central price list. Status changes are
// manual workflow steps: nothing here configures DNS/SSL or takes payment.
import { useCallback, useEffect, useState } from "react";
import { Loader2, ChevronLeft, ChevronRight, Sparkles, Building2 } from "lucide-react";
import { MEMBERSHIP_CURRENCIES, formatMembershipPrice } from "@/lib/payment-currencies";
import {
  DOMAIN_STATUS_META, SERVICE_META, SERVICE_STATUS_META, SERVICE_TYPES, type ServiceType,
} from "@/lib/service-catalog";
import { DOMAIN_TRANSITIONS, SERVICE_TRANSITIONS } from "@/lib/domain-requests";

type Tab = "domains" | "services" | "prices";
interface Row {
  id: string; status: string; reviewNote: string | null; priceAtRequest: number; currency: string; createdAt: string;
  domain?: string; type?: ServiceType; description?: string | null; dnsInstructions?: { text?: string } | null;
  club: { id: string; name: string; slug: string }; requester: { name: string; email: string } | null;
}
interface PriceRow { serviceType: string; price: number; currency: string; isActive: boolean }

function Requests({ kind }: { kind: "domain" | "service" }) {
  const api = kind === "domain" ? "domain-requests" : "service-requests";
  const meta: Record<string, string> = kind === "domain" ? DOMAIN_STATUS_META : SERVICE_STATUS_META;
  const transitions = (kind === "domain" ? DOMAIN_TRANSITIONS : SERVICE_TRANSITIONS) as Record<string, readonly string[]>;
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [dns, setDns] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const q = new URLSearchParams({ page: String(page) });
      if (status) q.set("status", status);
      const res = await fetch(`/api/platform/${api}?${q}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setRows(json.requests); setPages(json.pagination.totalPages || 1);
    } catch { setError("Chargement impossible."); } finally { setLoading(false); }
  }, [api, page, status]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status]);

  const act = async (id: string, next?: string) => {
    setBusy(true); setError(null);
    try {
      const body: Record<string, unknown> = { reviewNote: note };
      if (next) body.status = next;
      if (kind === "domain" && dns.trim()) body.dnsInstructions = dns.trim();
      const res = await fetch(`/api/platform/${api}/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? "Erreur"); return; }
      setOpen(null); setNote(""); setDns(""); load();
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrer par statut"
        className="bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm">
        <option value="">Tous les statuts</option>
        {Object.entries(meta).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {loading ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[var(--primary)]" /></div>
      : rows.length === 0 ? <p className="text-sm text-muted text-center py-10">Aucune demande.</p> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="bg-card border border-border rounded-2xl p-4 space-y-2">
              <div className="flex justify-between gap-3 flex-wrap text-sm">
                <span className="flex items-center gap-1.5 text-muted"><Building2 size={14} /><b className="text-primary">{r.club.name}</b> · {r.requester?.email ?? "—"}</span>
                <span className="font-semibold text-primary">{meta[r.status]}</span>
              </div>
              <p className="text-sm text-primary">{r.domain ?? (r.type ? SERVICE_META[r.type].label : "")}
                <span className="text-xs text-muted"> · {formatMembershipPrice(r.priceAtRequest, r.currency)} (au {new Date(r.createdAt).toLocaleDateString("fr-FR")})</span></p>
              {r.description && <p className="text-xs text-muted whitespace-pre-wrap">{r.description}</p>}
              {r.reviewNote && <p className="text-xs text-muted">Note : {r.reviewNote}</p>}
              {open === r.id ? (
                  <div className="space-y-2 border-t border-border pt-3">
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} placeholder="Note (visible par le propriétaire)"
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" />
                    {kind === "domain" && <textarea value={dns} onChange={(e) => setDns(e.target.value)} maxLength={2000} rows={3} placeholder="Instructions DNS (optionnel)"
                      className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm font-mono" />}
                    <div className="flex gap-2 flex-wrap">
                      {transitions[r.status]?.map((n) => (
                        <button key={n} disabled={busy} onClick={() => act(r.id, n)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${n === "REJECTED" || n === "CANCELLED" ? "bg-red-500/10 text-red-600" : "bg-blue-500/10 text-blue-600"}`}>→ {meta[n]}</button>
                      ))}
                      <button disabled={busy} onClick={() => act(r.id)} className="px-3 py-1.5 rounded-lg text-xs bg-muted/30">Enregistrer la note</button>
                      <button onClick={() => setOpen(null)} className="px-3 py-1.5 rounded-lg text-xs text-muted">Fermer</button>
                    </div>
                    {kind === "domain" && <p className="text-[11px] text-muted">« Active » signifie que le domaine est déjà ajouté chez l’hébergeur et que DNS/SSL fonctionnent : cette action active le domaine pour le club.</p>}
                  </div>
              ) : <button onClick={() => { setOpen(r.id); setNote(r.reviewNote ?? ""); setDns(r.dnsInstructions?.text ?? ""); }} className="text-xs font-semibold text-[var(--primary)]">Traiter</button>}
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Page précédente" className="p-2 rounded-lg border border-border disabled:opacity-40"><ChevronLeft size={16} /></button>
          <span className="text-sm text-muted">Page {page} / {pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} aria-label="Page suivante" className="p-2 rounded-lg border border-border disabled:opacity-40"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}

function Prices() {
  const [prices, setPrices] = useState<Record<string, PriceRow>>({});
  const [draft, setDraft] = useState<Record<string, { price: string; currency: string; isActive: boolean }>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/platform/service-prices");
    if (!res.ok) { setMsg("Chargement impossible."); return; }
    const list: PriceRow[] = (await res.json()).prices;
    const map = Object.fromEntries(list.map((p) => [p.serviceType, p]));
    setPrices(map);
    setDraft(Object.fromEntries(SERVICE_TYPES.map((t) => [t, {
      price: map[t] ? String(map[t].price) : "", currency: map[t]?.currency ?? "TND", isActive: map[t]?.isActive ?? true,
    }])));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (t: string) => {
    setSaving(t); setMsg(null);
    try {
      const d = draft[t];
      const res = await fetch("/api/platform/service-prices", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceType: t, price: Number(d.price), currency: d.currency, isActive: d.isActive }),
      });
      const json = await res.json().catch(() => ({}));
      setMsg(res.ok ? "Tarif enregistré. Les demandes existantes gardent leur ancien tarif." : json.error ?? "Erreur");
      if (res.ok) load();
    } finally { setSaving(null); }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">Un service sans tarif actif ne peut pas être commandé. Les demandes déjà créées conservent leur tarif d’origine.</p>
      {msg && <p role="status" className="text-sm text-primary">{msg}</p>}
      {SERVICE_TYPES.map((t) => {
        const d = draft[t]; if (!d) return null;
        return (
          <div key={t} className="bg-card border border-border rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[180px]"><p className="text-sm font-semibold text-primary">{SERVICE_META[t].label}</p>
              {!prices[t] && <p className="text-xs text-amber-600">Tarif non défini</p>}</div>
            <input type="number" min={0} step="0.001" value={d.price} aria-label={`Prix ${SERVICE_META[t].label}`}
              onChange={(e) => setDraft({ ...draft, [t]: { ...d, price: e.target.value } })} className="w-28 bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm" />
            <select value={d.currency} aria-label="Devise" onChange={(e) => setDraft({ ...draft, [t]: { ...d, currency: e.target.value } })} className="bg-muted/20 border border-border rounded-xl px-2 py-2 text-sm">
              {MEMBERSHIP_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <label className="text-xs text-muted flex items-center gap-1"><input type="checkbox" checked={d.isActive} onChange={(e) => setDraft({ ...draft, [t]: { ...d, isActive: e.target.checked } })} /> Actif</label>
            <button onClick={() => save(t)} disabled={saving === t || d.price === ""} className="px-3 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold disabled:opacity-50">Enregistrer</button>
          </div>
        );
      })}
    </div>
  );
}

export default function PlatformServiceRequestsPage() {
  const [tab, setTab] = useState<Tab>("domains");
  const tabs: [Tab, string][] = [["domains", "Domaines"], ["services", "Services"], ["prices", "Tarifs"]];
  return (
    <div className="space-y-5 pb-10">
      <h1 className="text-2xl font-bold text-primary flex items-center gap-2"><Sparkles size={22} /> Services & domaines</h1>
      <div className="flex gap-1.5" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`px-3.5 py-2 rounded-xl text-sm font-medium ${tab === k ? "bg-[var(--primary)] text-white" : "bg-muted/30 text-muted"}`}>{l}</button>
        ))}
      </div>
      {tab === "domains" && <Requests kind="domain" />}
      {tab === "services" && <Requests kind="service" />}
      {tab === "prices" && <Prices />}
    </div>
  );
}
