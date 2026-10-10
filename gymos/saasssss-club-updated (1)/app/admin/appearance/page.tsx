"use client";

// /admin/appearance — OWNER-only. Pick one of the five website themes, choose
// the 3D hero object (with a live preview on the theme's own backdrop), and set
// the club's branding (logo + two colors). Everything is saved per club in
// GymSettings (themeId, heroModel, primaryColor, secondaryColor, logoUrl) and
// the public site renders it from there — nothing is stored in the browser.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, ImageIcon, Loader2, RotateCcw, Save, Upload } from "lucide-react";
import OwnerOnly from "@/components/admin/OwnerOnly";
import ThemePicker from "@/components/admin/ThemePicker";
import HeroModelPicker from "@/components/admin/HeroModelPicker";
import { getTheme, resolveThemeId, type HeroModelId, type ThemePreset } from "@/lib/website-themes";

const HEX = /^#[0-9a-fA-F]{6}$/;

interface Draft {
  name: string;
  logoUrl: string;
  themeId: string;
  heroModel: HeroModelId | null;
  primaryColor: string;
  secondaryColor: string;
}

function ColorField({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string | null }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} (sélecteur)`}
          value={HEX.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-transparent p-1"
        />
        <input
          type="text"
          aria-label={`${label} (hexadécimal)`}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          maxLength={7}
          spellCheck={false}
          className={`w-32 rounded-xl border bg-muted/20 px-3 py-2.5 font-mono text-sm text-primary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 ${error ? "border-red-500" : "border-border"}`}
        />
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

function AppearanceContent() {
  const [saved, setSaved] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.settings) throw new Error(json?.error || "Chargement impossible");
      const s = json.settings;
      const themeId = resolveThemeId(s.themeId);
      const preset = getTheme(themeId);
      const next: Draft = {
        name: s.name ?? "",
        logoUrl: s.logoUrl ?? "",
        themeId,
        heroModel: s.heroModel ?? null,
        primaryColor: s.primaryColor ?? preset.primaryColor,
        secondaryColor: s.secondaryColor ?? preset.secondaryColor,
      };
      setSaved(next);
      setDraft(next);
      setPublicUrl(json.club?.publicUrl ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-muted" /></div>;
  }
  if (!draft || !saved) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm">
        <p className="text-danger">{error ?? "Chargement impossible"}</p>
        <button onClick={() => void load()} className="mt-3 rounded-xl border border-border px-4 py-2 font-medium text-primary">Réessayer</button>
      </div>
    );
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const primaryError = HEX.test(draft.primaryColor) ? null : "Couleur invalide (ex. #ef4444)";
  const secondaryError = HEX.test(draft.secondaryColor) ? null : "Couleur invalide (ex. #f59e0b)";
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const pickTheme = (theme: ThemePreset) =>
    // A new theme brings its own default colors and 3D object; both stay editable below.
    setDraft((d) => (d ? { ...d, themeId: theme.id, primaryColor: theme.primaryColor, secondaryColor: theme.secondaryColor, heroModel: null } : d));

  const upload = async (file: File | undefined | null) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", credentials: "include", body });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.url) set("logoUrl", json.url);
      else setError(json?.error || "Échec du téléversement du logo");
    } catch {
      setError("Erreur réseau lors du téléversement");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (primaryError || secondaryError || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          themeId: draft.themeId,
          heroModel: draft.heroModel, // null = the theme's default object
          primaryColor: draft.primaryColor,
          secondaryColor: draft.secondaryColor,
          logoUrl: draft.logoUrl,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error || "Enregistrement impossible");
        return;
      }
      setSaved(draft);
      setNote("Apparence enregistrée — votre site est à jour.");
      window.setTimeout(() => setNote(null), 3500);
      window.dispatchEvent(new Event("club-settings-updated")); // navbar/footer/preview refresh right away
    } catch {
      setError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  const resetColors = () => {
    const preset = getTheme(draft.themeId);
    setDraft((d) => (d ? { ...d, primaryColor: preset.primaryColor, secondaryColor: preset.secondaryColor } : d));
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-28">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Apparence du site</h1>
          <p className="mt-1 text-sm text-muted">Thème, objet 3D de l&apos;accueil, logo et couleurs de votre club.</p>
        </div>
        {publicUrl && (
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-primary hover:bg-muted/20">
            Voir mon site <ExternalLink size={14} aria-hidden />
          </a>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-danger">
          {error}{" "}
          {/verrouill|demande/i.test(error) && <Link href="/admin/theme-requests" className="font-semibold underline">Faire une demande de changement</Link>}
        </div>
      )}

      <section aria-labelledby="theme-h" className="space-y-3">
        <h2 id="theme-h" className="text-lg font-semibold text-primary">1. Thème</h2>
        <p className="text-sm text-muted">Chaque thème change la mise en page, la typographie, les animations et le style des sections — pas seulement les couleurs.</p>
        <ThemePicker selectedId={draft.themeId} onSelect={pickTheme} clubName={draft.name} primaryColor={draft.primaryColor} secondaryColor={draft.secondaryColor} />
      </section>

      <section aria-labelledby="model-h" className="space-y-3">
        <h2 id="model-h" className="text-lg font-semibold text-primary">2. Objet 3D de l&apos;accueil</h2>
        <HeroModelPicker
          themeId={draft.themeId}
          heroModel={draft.heroModel}
          onChange={(m) => set("heroModel", m)}
          clubName={draft.name}
          primaryColor={HEX.test(draft.primaryColor) ? draft.primaryColor : getTheme(draft.themeId).primaryColor}
          secondaryColor={HEX.test(draft.secondaryColor) ? draft.secondaryColor : getTheme(draft.themeId).secondaryColor}
        />
      </section>

      <section aria-labelledby="brand-h" className="space-y-4">
        <h2 id="brand-h" className="text-lg font-semibold text-primary">3. Identité visuelle</h2>
        <div className="grid gap-6 rounded-2xl border border-border bg-card p-6 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">Logo</label>
            <div className="flex items-center gap-4">
              {draft.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.logoUrl} alt="Logo du club" className="keep-light h-16 w-16 rounded-lg border border-border bg-white object-contain" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border text-muted"><ImageIcon size={20} aria-hidden /></div>
              )}
              <div className="flex flex-col gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-primary hover:bg-muted/20">
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {uploading ? "Envoi…" : "Choisir un logo"}
                  <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
                {draft.logoUrl && <button type="button" onClick={() => set("logoUrl", "")} className="text-left text-xs text-muted underline">Retirer le logo</button>}
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <ColorField label="Couleur principale" value={draft.primaryColor} onChange={(v) => set("primaryColor", v)} error={primaryError} />
            <ColorField label="Couleur secondaire" value={draft.secondaryColor} onChange={(v) => set("secondaryColor", v)} error={secondaryError} />
            <button type="button" onClick={resetColors} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-primary">
              <RotateCcw size={12} aria-hidden /> Revenir aux couleurs du thème
            </button>
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 backdrop-blur md:left-64">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <p className="text-sm text-muted" aria-live="polite">{note ?? (dirty ? "Modifications non enregistrées" : "Tout est enregistré")}</p>
          <div className="flex gap-2">
            <button type="button" disabled={!dirty || saving} onClick={() => setDraft(saved)} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-primary disabled:opacity-50">Annuler</button>
            <button type="button" disabled={!dirty || saving || !!primaryError || !!secondaryError} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-[var(--brand-contrast)] disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppearancePage() {
  return (
    <OwnerOnly>
      <AppearanceContent />
    </OwnerOnly>
  );
}
