"use client";

// SUPER_ADMIN → "Nouveau club": creates Club + OWNER + trial subscription.
// On success it shows the owner's credentials ONCE (the password is never
// retrievable afterwards — only resettable).
import { useEffect, useState } from "react";
import { Check, Copy, Eye, EyeOff, Loader2, RefreshCw, X } from "lucide-react";
import { apiRequest, clubHostSuffix, clubOrigin, formatPrice, generatePassword } from "@/lib/platform-client";
import { slugify } from "@/lib/slug";

interface PlanOption { id: string; tier: string; name: string; priceMonthly: number; currency: string; isActive: boolean }
interface CreatedClub { id: string; name: string; slug: string; ownerEmail: string; ownerPassword: string }

interface Props {
  onClose: () => void;
  onCreated: (club: CreatedClub) => void;
}

const EMPTY = {
  name: "", slug: "", planId: "", trialDays: "14", customDomain: "",
  ownerName: "", ownerEmail: "", ownerPhone: "", ownerPassword: "",
};

const inputCls = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const errCls = "border-rose-500/60";

export default function CreateClubModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [showPassword, setShowPassword] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedClub | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiRequest<{ plans: PlanOption[] }>("/api/platform/plans");
      if (cancelled || !res.ok) return;
      const active = res.data.plans.filter((p) => p.isActive);
      setPlans(active);
      setForm((f) => (f.planId ? f : { ...f, planId: active[0]?.id ?? "" }));
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  const set = (key: keyof typeof EMPTY, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errorField === key) { setErrorField(null); setError(null); }
  };

  const onNameChange = (value: string) => {
    setForm((f) => ({ ...f, name: value, slug: slugTouched ? f.slug : slugify(value) }));
  };

  const submit = async () => {
    setError(null);
    setErrorField(null);
    setSaving(true);
    const res = await apiRequest<{ club: { id: string; name: string; slug: string } }>("/api/platform/clubs", {
      method: "POST",
      json: {
        name: form.name,
        slug: form.slug,
        planId: form.planId,
        trialDays: Number(form.trialDays) || undefined,
        customDomain: form.customDomain.trim() || undefined,
        ownerName: form.ownerName,
        ownerEmail: form.ownerEmail,
        ownerPhone: form.ownerPhone.trim() || undefined,
        ownerPassword: form.ownerPassword,
      },
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.data.error ?? "Erreur lors de la création");
      setErrorField(res.data.field ?? null);
      return;
    }
    const info = { id: res.data.club.id, name: res.data.club.name, slug: res.data.club.slug, ownerEmail: form.ownerEmail, ownerPassword: form.ownerPassword };
    setCreated(info);
    onCreated(info);
  };

  const copyCredentials = async () => {
    if (!created) return;
    const text = `Club : ${created.name}\nURL : ${clubOrigin(created.slug)}\nEmail : ${created.ownerEmail}\nMot de passe : ${created.ownerPassword}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — the values are on screen */ }
  };

  const canSubmit = form.name.trim() && form.slug && form.planId && form.ownerName.trim() && form.ownerEmail.trim() && form.ownerPassword && !saving;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="Créer un club" className="my-auto w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-black text-primary">{created ? "Club créé ✓" : "Nouveau club"}</h2>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Fermer" className="text-muted hover:text-primary"><X className="h-4 w-4" /></button>
        </div>

        {created ? (
          <div className="space-y-4">
            <p className="text-xs text-secondary">
              <strong className="text-primary">{created.name}</strong> est prêt (essai de {form.trialDays || 14} jours).
              Transmettez ces accès au propriétaire — <strong className="text-primary">le mot de passe ne sera plus affiché</strong>.
            </p>
            <dl className="space-y-2 rounded-xl border border-border bg-background p-4 text-xs">
              <div className="flex justify-between gap-4"><dt className="text-muted">URL</dt><dd className="break-all font-mono text-primary">{clubOrigin(created.slug)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Email</dt><dd className="break-all font-mono text-primary">{created.ownerEmail}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Mot de passe</dt><dd className="break-all font-mono text-primary">{created.ownerPassword}</dd></div>
            </dl>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={copyCredentials} className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-bold text-primary">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copié" : "Copier les accès"}
              </button>
              <button type="button" onClick={onClose} className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-extrabold text-slate-950">Terminer</button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-[11px] font-bold text-secondary">Nom du club *</span>
                <input value={form.name} onChange={(e) => onNameChange(e.target.value)} placeholder="Le Club de Gammarth" className={`mt-1 ${inputCls}`} autoFocus />
              </label>

              <label className="block sm:col-span-2">
                <span className="text-[11px] font-bold text-secondary">Sous-domaine (slug) *</span>
                <div className="mt-1 flex items-center rounded-xl border border-border bg-background focus-within:ring-2 focus-within:ring-emerald-500/40">
                  <input
                    value={form.slug}
                    onChange={(e) => { setSlugTouched(true); set("slug", e.target.value.toLowerCase()); }}
                    placeholder="le-club-de-gammarth"
                    className={`min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-xs text-primary focus:outline-none ${errorField === "slug" ? errCls : ""}`}
                  />
                  <span className="pr-3 font-mono text-[11px] text-muted">{clubHostSuffix()}</span>
                </div>
              </label>

              <label className="block">
                <span className="text-[11px] font-bold text-secondary">Plan SaaS *</span>
                <select value={form.planId} onChange={(e) => set("planId", e.target.value)} className={`mt-1 ${inputCls}`}>
                  {plans.length === 0 && <option value="">Chargement…</option>}
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatPrice(p.priceMonthly, p.currency)}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] font-bold text-secondary">Durée de l&apos;essai (jours)</span>
                <input type="number" min={1} max={90} value={form.trialDays} onChange={(e) => set("trialDays", e.target.value)} className={`mt-1 ${inputCls}`} />
              </label>

              <label className="block sm:col-span-2">
                <span className="text-[11px] font-bold text-secondary">Domaine personnalisé (optionnel)</span>
                <input value={form.customDomain} onChange={(e) => set("customDomain", e.target.value)} placeholder="www.mongym.tn" className={`mt-1 ${inputCls} ${errorField === "customDomain" ? errCls : ""}`} />
              </label>

              <div className="border-t border-border pt-4 sm:col-span-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Propriétaire du club</p>
              </div>

              <label className="block">
                <span className="text-[11px] font-bold text-secondary">Nom complet *</span>
                <input value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} className={`mt-1 ${inputCls}`} />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-secondary">Téléphone</span>
                <input value={form.ownerPhone} onChange={(e) => set("ownerPhone", e.target.value)} placeholder="+216 …" className={`mt-1 ${inputCls}`} />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-[11px] font-bold text-secondary">Email *</span>
                <input type="email" value={form.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} className={`mt-1 ${inputCls} ${errorField === "ownerEmail" ? errCls : ""}`} />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-[11px] font-bold text-secondary">Mot de passe initial * (8 caractères min.)</span>
                <div className="mt-1 flex gap-2">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.ownerPassword}
                    onChange={(e) => set("ownerPassword", e.target.value)}
                    autoComplete="new-password"
                    className={`${inputCls} font-mono`}
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Masquer" : "Afficher"} className="rounded-xl border border-border px-3 text-secondary">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button type="button" onClick={() => { set("ownerPassword", generatePassword()); setShowPassword(true); }} className="flex items-center gap-1.5 rounded-xl border border-border px-3 text-[11px] font-bold text-primary">
                    <RefreshCw className="h-3.5 w-3.5 text-emerald-500" /> Générer
                  </button>
                </div>
              </label>
            </div>

            {error && <p className="mt-4 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500" role="alert">{error}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={onClose} disabled={saving} className="rounded-full border border-border px-4 py-2 text-xs font-bold text-secondary disabled:opacity-40">Annuler</button>
              <button type="button" onClick={submit} disabled={!canSubmit} className="flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2 text-xs font-extrabold text-slate-950 disabled:opacity-40">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Créer le club
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}