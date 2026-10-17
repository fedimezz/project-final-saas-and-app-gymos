"use client";
// /admin/website-setup — the guided setup wizard from the plan:
//   1) Club name, logo, basic info
//   2) Edit each public page's text/images (sidebar of pages), live preview
//   3) Final preview → Confirm & Publish
//
// Reuses the existing settings (/api/admin/settings) and page-content
// (/api/admin/page-content) endpoints for every save — this wizard is a
// guided front-end over them, not a new content store. Publishing just
// advances the phase (/api/admin/website-setup), which is what unlocks the
// "1 customization remaining" rule and, eventually, the permanent lock.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, ArrowLeft, ArrowRight, Check, Upload, Image as ImageIcon,
  Building2, FileText, Eye, AlertCircle, Sparkles, Plus, Trash2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import WebsiteChangeRequestPanel from "@/components/admin/WebsiteChangeRequestPanel";
import PhoneInput from "@/components/PhoneInput";
import { matchingThemeId } from "@/lib/website-themes";
import { WIZARD_PAGE_KEYS, type WebsiteSetupPhase } from "@/lib/website-setup-shared";
import { MAX_GALLERY_IMAGES } from "@/lib/page-content-schema";
import { extractSlugFromHost } from "@/lib/host";

interface SettingsState {
  name: string;
  logoUrl: string;
  themeId: string;
  primaryColor: string;
  secondaryColor: string;
  description: string;
  phone: string;
  email: string;
  address: string;
  facebookUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
  twitterUrl: string;
  youtubeUrl: string;
  websiteUrl: string;
}

interface ContentField {
  key: string;
  label: string;
  type: "text" | "textarea" | "image" | "gallery";
  defaultValue: string;
}

interface PageDef {
  pageKey: string;
  label: string;
  fields: ContentField[];
  previewPath: string;
  content: Record<string, string>;
}

const EMPTY_SETTINGS: SettingsState = {
  name: "", logoUrl: "", themeId: "classic", primaryColor: "#4f46e5", secondaryColor: "#3b82f6",
  description: "", phone: "", email: "", address: "",
  facebookUrl: "", instagramUrl: "", tiktokUrl: "", twitterUrl: "", youtubeUrl: "", websiteUrl: "",
};

const STEPS = [
  { id: "basics", label: "Informations", icon: Building2 },
  { id: "pages", label: "Pages & photos", icon: FileText },
  { id: "options", label: "Options & services", icon: Sparkles },
  { id: "publish", label: "Aperçu final", icon: Eye },
] as const;

// How much each step matters, shown to the owner so nothing optional feels mandatory.
type Tier = "required" | "recommended" | "optional" | "paid";
const TIER_META: Record<Tier, { label: string; cls: string }> = {
  required: { label: "Requis", cls: "bg-red-500/10 text-red-600" },
  recommended: { label: "Recommandé", cls: "bg-amber-500/10 text-amber-600" },
  optional: { label: "Facultatif", cls: "bg-slate-500/10 text-slate-500" },
  paid: { label: "Payant", cls: "bg-violet-500/10 text-violet-600" },
};
function TierBadge({ tier }: { tier: Tier }) {
  const m = TIER_META[tier];
  return <span className={`ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${m.cls}`}>{m.label}</span>;
}

export default function WebsiteSetupWizard() {
  const router = useRouter();
  const { userRole } = useAuth();
  const isOwner = userRole?.toUpperCase() === "OWNER";

  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<WebsiteSetupPhase | null>(null);
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<SettingsState>(EMPTY_SETTINGS);
  const [publicUrl, setPublicUrl] = useState("");
  const [pages, setPages] = useState<PageDef[]>([]);
  const [activePageKey, setActivePageKey] = useState<string>("home");
  const [uploading, setUploading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, settingsRes, contentRes] = await Promise.all([
        fetch("/api/admin/website-setup", { credentials: "include" }),
        fetch("/api/admin/settings", { credentials: "include" }),
        fetch("/api/admin/page-content", { credentials: "include" }),
      ]);
      const statusJson = await statusRes.json();
      const settingsJson = await settingsRes.json();
      const contentJson = await contentRes.json();

      if (statusRes.ok) setPhase(statusJson.phase);
      if (settingsRes.ok && settingsJson.settings) {
        const s = settingsJson.settings;
        const primary = s.primaryColor ?? "#4f46e5";
        const secondary = s.secondaryColor ?? "#3b82f6";
        setSettings({
          name: s.name ?? "",
          logoUrl: s.logoUrl ?? "",
          themeId: s.themeId ?? matchingThemeId(primary, secondary),
          primaryColor: primary,
          secondaryColor: secondary,
          description: s.description ?? "",
          phone: s.phone ?? "",
          email: s.email ?? "",
          address: s.address ?? "",
          facebookUrl: s.facebookUrl ?? "",
          instagramUrl: s.instagramUrl ?? "",
          tiktokUrl: s.tiktokUrl ?? "",
          twitterUrl: s.twitterUrl ?? "",
          youtubeUrl: s.youtubeUrl ?? "",
          websiteUrl: s.websiteUrl ?? "",
        });
        setPublicUrl(settingsJson.club?.publicUrl ?? "");
      }
      if (contentRes.ok && Array.isArray(contentJson.pages)) {
        const wanted = new Set<string>(WIZARD_PAGE_KEYS);
        const filtered = (contentJson.pages as PageDef[]).filter((p) => wanted.has(p.pageKey as typeof WIZARD_PAGE_KEYS[number]));
        const pageOrder = new Map<string, number>(WIZARD_PAGE_KEYS.map((key, index) => [key, index]));
        filtered.sort((a, b) => (pageOrder.get(a.pageKey) ?? Number.MAX_SAFE_INTEGER) - (pageOrder.get(b.pageKey) ?? Number.MAX_SAFE_INTEGER));
        setPages(filtered);
        if (filtered.length > 0) setActivePageKey(filtered[0].pageKey);
      }
    } catch {
      setError("Erreur réseau lors du chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const flash = (msg: string) => {
    setSavedNote(msg);
    setTimeout(() => setSavedNote(null), 2000);
  };

  // Saves the whole `settings` object (identity/brand/description/contact/socials
  // all live on GymSettings) — cheap enough to call after every step.
  const saveSettings = async (): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Erreur lors de l'enregistrement");
        return false;
      }
      // Apply the new theme/colors/name everywhere right away (navbar, footer, ...).
      window.dispatchEvent(new Event("club-settings-updated"));
      flash("Enregistré");
      return true;
    } catch {
      setError("Erreur réseau");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const savePage = async (pageKey: string, content: Record<string, string>): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/page-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pageKey, content }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Erreur lors de l'enregistrement");
        return false;
      }
      setPages((prev) => prev.map((p) => (p.pageKey === pageKey ? { ...p, content: json.content } : p)));
      // Tell any open public-page preview (useEditableContent) to reload right away.
      window.dispatchEvent(new Event("page-content-updated"));
      flash("Page enregistrée");
      return true;
    } catch {
      setError("Erreur réseau");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updatePageField = (pageKey: string, fieldKey: string, value: string) => {
    setPages((prev) =>
      prev.map((p) => (p.pageKey === pageKey ? { ...p, content: { ...p.content, [fieldKey]: value } } : p))
    );
  };

  const handleUpload = async (file: File | undefined | null, onDone: (url: string) => void, tag: string) => {
    if (!file) return;
    setUploading(tag);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", credentials: "include", body });
      const json = await res.json();
      if (res.ok) onDone(json.url);
      else setError(json.error || "Échec du téléversement");
    } catch {
      setError("Erreur réseau lors du téléversement");
    } finally {
      setUploading(null);
    }
  };

  const goNext = async () => {
    if (step === 0) {
      const ok = await saveSettings();
      if (!ok) return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const handlePublish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const settingsOk = await saveSettings();
      if (!settingsOk) return;
      const res = await fetch("/api/admin/website-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "complete" }),
      });
      const json = await res.json();
      if (res.ok) {
        router.push("/admin/settings?published=1");
      } else {
        setError(json.error || "Erreur lors de la publication");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setPublishing(false);
    }
  };

  const activePage = useMemo(() => pages.find((p) => p.pageKey === activePageKey) ?? null, [pages, activePageKey]);

  // The owner is normally already on the club's own host: preview THAT origin,
  // so the iframe can never point at the platform apex ("localhost"). The API
  // value is only the fallback (e.g. wizard opened from the apex).
  const previewUrl = useMemo(() => {
    if (typeof window !== "undefined" && extractSlugFromHost(window.location.host)) return window.location.origin;
    return publicUrl;
  }, [publicUrl]);

  // "About" and "Contact" aren't separate PageContent entries — they're
  // fields that already exist on GymSettings and are already used by the
  // public site (ClubIntro reads `description`, the footer reads the
  // contact/social fields) — see lib/website-setup-shared.ts for why the
  // wizard's page list stays to the PageContent-backed pages otherwise.
  const sidebarExtras = [
    { key: "__about", label: "À propos" },
    { key: "__contact", label: "Contact" },
  ];

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <p className="font-semibold text-primary">Réservé au propriétaire</p>
        <p className="text-sm text-muted">L&apos;assistant du site n&apos;est accessible qu&apos;au rôle OWNER.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={36} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (phase === "locked") {
    return (
      <div className="space-y-6 max-w-2xl animate-fade-in">
        <h1 className="text-3xl font-bold text-primary">Assistant du site</h1>
        <WebsiteChangeRequestPanel />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      <div>
        <h1 className="text-3xl font-bold text-primary flex items-center gap-2">
          <Sparkles size={26} className="text-[var(--primary)]" />
          {phase === "initial" ? "Configurons votre site" : "Dernière personnalisation"}
        </h1>
        <p className="text-muted mt-1">
          {phase === "initial"
            ? "Quelques étapes pour préparer votre site public. Vous pourrez le modifier une fois de plus par la suite."
            : "1 personnalisation restante — une fois publiée, le site sera verrouillé et les futurs changements passeront par une demande."}
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const StepIcon = s.icon;
          const active = i === step;
          const done = i < step;
          return (
            <button
              key={s.id}
              onClick={() => setStep(i)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                active
                  ? "bg-[var(--primary)] text-white"
                  : done
                    ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                    : "bg-muted/30 text-muted"
              }`}
            >
              {done ? <Check size={13} /> : <StepIcon size={13} />}
              {i + 1}. {s.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 text-red-600 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {savedNote && <p className="text-sm text-emerald-600">{savedNote}</p>}

      {/* ── Step 0: Basics ─────────────────────────────────────────────── */}
      {step === 0 && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-5 max-w-xl">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Nom du club<TierBadge tier="required" /></label>
            <input
              type="text"
              value={settings.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Mon Club Fitness"
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Logo<TierBadge tier="recommended" /></label>
            <div className="flex items-center gap-4">
              {settings.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.logoUrl} alt="" className="w-16 h-16 object-contain rounded-lg border border-border bg-white" />
              ) : (
                <div className="w-16 h-16 rounded-lg border border-dashed border-border flex items-center justify-center text-muted">
                  <ImageIcon size={20} />
                </div>
              )}
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted/20 cursor-pointer transition-colors">
                {uploading === "logo" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading === "logo" ? "Envoi…" : "Choisir un logo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading === "logo"}
                  onChange={(e) => {
                    handleUpload(e.target.files?.[0], (url) => set("logoUrl", url), "logo");
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Téléphone<TierBadge tier="recommended" /></label>
            <PhoneInput value={settings.phone} onChange={(phone) => set("phone", phone)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Adresse<TierBadge tier="recommended" /></label>
            <input
              type="text"
              value={settings.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="12 Avenue Habib Bourguiba, Tunis"
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
            />
          </div>
        </div>
      )}

      {/* ── Step 1: Pages ──────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-3">
        <p className="text-xs text-muted">
          <TierBadge tier="optional" /> Textes et photos de vos pages : vous pouvez passer cette étape et compléter plus tard.
          Les photos s&apos;affichent à côté du design du site ; l&apos;haltère 3D de l&apos;accueil reste en place.
        </p>
        <div className="grid md:grid-cols-[220px_1fr] gap-5">
          <div className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible">
            {pages.map((p) => (
              <button
                key={p.pageKey}
                onClick={() => setActivePageKey(p.pageKey)}
                className={`text-left px-3.5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                  activePageKey === p.pageKey ? "bg-[var(--primary)] text-white" : "hover:bg-muted/30 text-primary"
                }`}
              >
                {p.label}
              </button>
            ))}
            {sidebarExtras.map((x) => (
              <button
                key={x.key}
                onClick={() => setActivePageKey(x.key)}
                className={`text-left px-3.5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                  activePageKey === x.key ? "bg-[var(--primary)] text-white" : "hover:bg-muted/30 text-primary"
                }`}
              >
                {x.label}
              </button>
            ))}
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            {activePageKey === "__about" && (
              <div className="space-y-4">
                <h3 className="font-semibold text-primary">À propos de {settings.name || "votre club"}</h3>
                <textarea
                  rows={5}
                  value={settings.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Présentez votre club en quelques phrases : ambiance, équipements, ce qui vous distingue…"
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 resize-none"
                />
                <button
                  onClick={saveSettings}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Enregistrer
                </button>
              </div>
            )}

            {activePageKey === "__contact" && (
              <div className="space-y-4">
                <h3 className="font-semibold text-primary">Coordonnées & réseaux sociaux</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Email</label>
                    <input
                      type="email"
                      value={settings.email}
                      onChange={(e) => set("email", e.target.value)}
                      placeholder="contact@monclub.tn"
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Téléphone</label>
                    <PhoneInput value={settings.phone} onChange={(phone) => set("phone", phone)} />
                  </div>
                  {([
                    ["facebookUrl", "Facebook"], ["instagramUrl", "Instagram"], ["tiktokUrl", "TikTok"],
                    ["twitterUrl", "X / Twitter"], ["youtubeUrl", "YouTube"], ["websiteUrl", "Site web"],
                  ] as const).map(([key, label]) => (
                    <div key={key}>
                      <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{label}</label>
                      <input
                        type="url"
                        value={settings[key]}
                        onChange={(e) => set(key, e.target.value)}
                        placeholder={`https://…`}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={saveSettings}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Enregistrer
                </button>
              </div>
            )}

            {activePage && (
              <PageFieldsEditor
                page={activePage}
                onFieldChange={(key, value) => updatePageField(activePage.pageKey, key, value)}
                onSave={() => savePage(activePage.pageKey, activePage.content)}
                onUpload={handleUpload}
                saving={saving}
                uploading={uploading}
              />
            )}
          </div>
        </div>
        </div>
      )}

      {/* ── Step 2: Options & paid services (all skippable) ────────────── */}
      {step === 2 && (
        <div className="space-y-3 max-w-xl">
          <p className="text-sm text-muted">
            Rien n&apos;est obligatoire ici. Votre site est déjà accessible sur son adresse standard
            {publicUrl ? <> (<span className="font-medium text-primary">{publicUrl.replace(/^https?:\/\//, "")}</span>)</> : null}.
          </p>
          {[
            { t: "Domaine personnalisé (www.votreclub.com)", d: "Votre propre nom de domaine. Demande validée et configurée par notre équipe.", tier: "paid" as Tier },
            { t: "Installation professionnelle", d: "Nous configurons votre club à votre place.", tier: "paid" as Tier },
            { t: "Personnalisation du site", d: "Design, pages et contenus sur mesure.", tier: "paid" as Tier },
          ].map((o) => (
            <div key={o.t} className="bg-card border border-border rounded-2xl p-4">
              <p className="text-sm font-semibold text-primary">{o.t}<TierBadge tier={o.tier} /></p>
              <p className="text-xs text-muted mt-1">{o.d}</p>
            </div>
          ))}
          <a href="/admin/services" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)]">
            Voir les tarifs et faire une demande <ArrowRight size={14} />
          </a>
          <p className="text-xs text-muted">Vous pourrez le faire à tout moment depuis « Services & domaine ».</p>
        </div>
      )}

      {/* ── Step 3: Final preview + publish ────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          {previewUrl && (
            <div className="space-y-2">
              <div className="rounded-2xl border border-border overflow-hidden bg-white" style={{ height: 520 }}>
                <iframe src={previewUrl} title="Aperçu du site" className="w-full h-full border-0" />
              </div>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs text-muted hover:text-primary underline"
              >
                L&apos;aperçu ne s&apos;affiche pas ? Ouvrir le site dans un nouvel onglet
              </a>
            </div>
          )}
          <div className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-muted max-w-md">
              {phase === "initial"
                ? "En confirmant, votre site sera publié. Vous garderez une modification complète disponible par la suite."
                : "En confirmant, cette modification sera enregistrée et le site sera définitivement verrouillé pour l'édition directe."}
            </p>
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60"
            >
              {publishing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {phase === "initial" ? "Confirmer et publier" : "Publier et verrouiller"}
            </button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 max-w-3xl">
        <button
          onClick={goBack}
          disabled={step === 0}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted/20 disabled:opacity-40"
        >
          <ArrowLeft size={14} /> Précédent
        </button>
        {step < STEPS.length - 1 && (
          <button
            onClick={goNext}
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Suivant <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Per-field editor for the Pages step ───────────────────────────────────
function PageFieldsEditor({
  page, onFieldChange, onSave, onUpload, saving, uploading,
}: {
  page: PageDef;
  onFieldChange: (key: string, value: string) => void;
  onSave: () => void;
  onUpload: (file: File | undefined | null, onDone: (url: string) => void, tag: string) => void;
  saving: boolean;
  uploading: string | null;
}) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-primary">{page.label}</h3>
      {page.fields.map((field) => {
        const value = page.content[field.key] ?? "";
        const tag = `${page.pageKey}:${field.key}`;
        if (field.type === "text") {
          return (
            <div key={field.key}>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{field.label}</label>
              <input
                type="text"
                value={value}
                onChange={(e) => onFieldChange(field.key, e.target.value)}
                placeholder={field.defaultValue}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
              />
            </div>
          );
        }
        if (field.type === "textarea") {
          return (
            <div key={field.key}>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{field.label}</label>
              <textarea
                rows={4}
                value={value}
                onChange={(e) => onFieldChange(field.key, e.target.value)}
                placeholder={field.defaultValue}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 resize-none"
              />
            </div>
          );
        }
        if (field.type === "image") {
          const src = value || field.defaultValue;
          return (
            <div key={field.key}>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{field.label}</label>
              <div className="flex items-center gap-4">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt="" className="w-28 h-20 object-cover rounded-lg border border-border" />
                ) : (
                  <div className="w-28 h-20 rounded-lg border border-dashed border-border flex items-center justify-center text-muted">
                    <ImageIcon size={18} />
                  </div>
                )}
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted/20 cursor-pointer transition-colors">
                  {uploading === tag ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {uploading === tag ? "Envoi…" : "Changer"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading === tag}
                    onChange={(e) => {
                      onUpload(e.target.files?.[0], (url) => onFieldChange(field.key, url), tag);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
          );
        }
        // gallery: list of photo URLs the OWNER chose (never pre-filled with
        // stock photos), capped at MAX_GALLERY_IMAGES.
        let urls: string[] = [];
        try {
          const parsed = JSON.parse(value || "[]");
          urls = Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === "string") : [];
        } catch {
          urls = [];
        }
        const galleryFull = urls.length >= MAX_GALLERY_IMAGES;
        return (
          <div key={field.key}>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
              {field.label} <span className="normal-case font-normal">({urls.length}/{MAX_GALLERY_IMAGES})</span>
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
              {urls.map((url, i) => (
                <div key={i} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-20 object-cover rounded-lg border border-border" />
                  <button
                    type="button"
                    onClick={() => onFieldChange(field.key, JSON.stringify(urls.filter((_, j) => j !== i)))}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Supprimer"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              {!galleryFull && (
                <label className="h-20 rounded-lg border border-dashed border-border flex items-center justify-center text-muted hover:bg-muted/20 cursor-pointer transition-colors">
                  {uploading === tag ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading === tag}
                    onChange={(e) => {
                      onUpload(
                        e.target.files?.[0],
                        (url) => onFieldChange(field.key, JSON.stringify([...urls, url].slice(0, MAX_GALLERY_IMAGES))),
                        tag
                      );
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        );
      })}
      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60"
      >
        {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Enregistrer cette page
      </button>
    </div>
  );
}
