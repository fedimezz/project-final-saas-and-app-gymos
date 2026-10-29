"use client";
// Owner tools for their OWN 3D homepage model (.glb / .gltf): upload (click or
// drag & drop), replace, remove, select, and adjust scale / rotation / position.
// Files are validated twice with the same rules (lib/hero-model.ts): here for
// instant feedback, and on the server (authoritative). Upload, replace, remove
// and "save adjustments" persist immediately through /api/admin/hero-model;
// choosing the model for the live site is part of the page's normal Save.
import { useId, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Loader2, Lock, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import {
  DEFAULT_HERO_TRANSFORM,
  HERO_TRANSFORM_RANGES as R,
  validateHeroModelFile,
  type HeroModelTransform,
} from "@/lib/hero-model";

export interface AdminHeroModel {
  fileName: string;
  format: "glb" | "gltf";
  byteSize: number;
  url: string;
  transform: HeroModelTransform;
}

interface Props {
  model: AdminHeroModel | null;
  maxBytes: number;
  /** Working (unsaved) placement, shown live in the preview. */
  transform: HeroModelTransform;
  onTransformChange: (t: HeroModelTransform) => void;
  /** Called after upload / replace (model) or removal (null). */
  onModelChange: (model: AdminHeroModel | null) => void;
  selected: boolean;
  onSelect: () => void;
  /** Message from the 3D preview if the file could not be rendered. */
  previewError?: string | null;
  disabled?: boolean;
  /** True when the club's plan does not include "Add my own 3D model" (SaasPlan.limits.customHeroModel). */
  planLocked?: boolean;
}

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(bytes < 1048576 ? 2 : 1)} Mo`;

function Slider({ label, value, min, max, step, unit = "", onChange, disabled }: {
  label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void; disabled?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <label htmlFor={id} className="font-medium text-secondary">{label}</label>
        <output htmlFor={id} className="tabular-nums text-muted">{Number.isInteger(step) ? value : value.toFixed(2)}{unit}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-2 w-full cursor-pointer accent-[var(--primary)] disabled:opacity-50"
      />
    </div>
  );
}

export default function CustomHeroModelPanel({
  model, maxBytes, transform, onTransformChange, onModelChange, selected, onSelect, previewError, disabled, planLocked,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const uploading = progress !== null;

  const baseline = model?.transform ?? DEFAULT_HERO_TRANSFORM;
  const changed = JSON.stringify(transform) !== JSON.stringify(baseline);
  const set = (patch: Partial<HeroModelTransform>) => onTransformChange({ ...transform, ...patch });
  const setAxis = (group: "rotation" | "position", axis: "x" | "y" | "z", v: number) =>
    onTransformChange({ ...transform, [group]: { ...transform[group], [axis]: v } });

  const upload = async (file: File | undefined | null) => {
    if (!file || disabled) return;
    setError(null);
    // Instant client-side check with the very same rules the server applies.
    if (file.size > maxBytes) {
      setError(`Fichier trop volumineux (${mb(file.size)}). Maximum : ${mb(maxBytes)}.`);
      return;
    }
    const verdict = validateHeroModelFile(file.name, new Uint8Array(await file.arrayBuffer()), maxBytes);
    if (!verdict.ok) {
      setError(verdict.message);
      return;
    }

    setProgress(0);
    try {
      const body = new FormData();
      body.append("file", file);
      // XHR (not fetch) so the owner sees real upload progress.
      const result = await new Promise<{ status: number; json: { model?: AdminHeroModel; error?: string } | null }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/admin/hero-model");
        xhr.withCredentials = true;
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => {
          let json = null;
          try { json = JSON.parse(xhr.responseText); } catch { /* non-JSON error page */ }
          resolve({ status: xhr.status, json });
        };
        xhr.onerror = () => reject(new Error("network"));
        xhr.ontimeout = () => reject(new Error("timeout"));
        xhr.timeout = 120_000;
        xhr.send(body);
      });
      if (result.status === 201 && result.json?.model) {
        onModelChange(result.json.model);
        onTransformChange(result.json.model.transform);
        onSelect(); // they uploaded it to use it (still applied only on Save)
      } else {
        setError(result.json?.error || "Échec du téléversement du modèle.");
      }
    } catch {
      setError("Erreur réseau lors du téléversement. Réessayez.");
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const saveTransform = async () => {
    setBusy("save");
    setError(null);
    try {
      const res = await fetch("/api/admin/hero-model", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transform),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.model) onModelChange(json.model);
      else setError(json?.error || "Impossible d'enregistrer les réglages.");
    } catch {
      setError("Erreur réseau.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch("/api/admin/hero-model", { method: "DELETE", credentials: "include" });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        onModelChange(null);
        onTransformChange(DEFAULT_HERO_TRANSFORM);
        setConfirmDelete(false);
      } else {
        setError(json?.error || "Suppression impossible.");
      }
    } catch {
      setError("Erreur réseau.");
    } finally {
      setBusy(null);
    }
  };

  const locked = disabled || uploading || busy !== null;

  // Plan lock: no file yet → show the feature as locked with an upgrade path instead of a dead upload zone.
  // (The server refuses the upload anyway — 402 PLAN_UPGRADE_REQUIRED — this is only the explanation.)
  if (planLocked && !model) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Lock size={16} className="text-amber-600" aria-hidden />
          <h3 className="text-sm font-semibold text-primary">Ajouter mon propre modèle 3D</h3>
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600">Plan supérieur</span>
        </div>
        <p className="text-xs text-secondary">
          Téléverser votre propre fichier .glb / .gltf n&apos;est pas inclus dans votre plan actuel. Tous les thèmes et les modèles 3D standard ci-dessus restent disponibles gratuitement.
        </p>
        <Link href="/admin/billing" className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-xs font-bold text-white">
          Voir les plans et passer au niveau supérieur
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h3 className="text-sm font-semibold text-primary">Mon modèle 3D</h3>
        <p className="mt-0.5 text-xs text-muted">
          Fichier <strong>.glb</strong> (recommandé) ou <strong>.gltf</strong> tout-en-un, {mb(maxBytes)} maximum, glTF 2.0 sans compression Draco/meshopt/KTX2.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
        className="sr-only"
        aria-label="Choisir un fichier de modèle 3D"
        disabled={locked}
        onChange={(e) => void upload(e.target.files?.[0])}
      />

      {!model ? (
        <button
          type="button"
          disabled={locked}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); void upload(e.dataTransfer.files?.[0]); }}
          className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors disabled:opacity-60 ${
            dragOver ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-border hover:border-[var(--primary)]/50"
          }`}
        >
          {uploading ? <Loader2 className="animate-spin text-[var(--primary)]" aria-hidden /> : <Upload className="text-muted" aria-hidden />}
          <span className="text-sm font-medium text-primary">{uploading ? `Téléversement… ${progress}%` : "Glissez votre fichier ici ou cliquez pour choisir"}</span>
          <span className="text-xs text-muted">.glb · .gltf</span>
        </button>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-primary">{model.fileName}</p>
            <p className="text-xs text-muted">{model.format.toUpperCase()} · {mb(model.byteSize)}{selected ? " · sélectionné" : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!selected && (
              <button type="button" disabled={locked} onClick={onSelect} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-contrast,#fff)] disabled:opacity-60">
                <Check size={13} aria-hidden /> Utiliser ce modèle
              </button>
            )}
            <button type="button" disabled={locked} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary hover:bg-muted/30 disabled:opacity-60">
              {uploading ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Upload size={13} aria-hidden />}
              {uploading ? `${progress}%` : "Remplacer"}
            </button>
            {confirmDelete ? (
              <span className="inline-flex items-center gap-1.5">
                <button type="button" disabled={locked} onClick={() => void remove()} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                  {busy === "delete" ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Trash2 size={13} aria-hidden />} Confirmer
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary">Annuler</button>
              </span>
            ) : (
              <button type="button" disabled={locked} onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-500/10 disabled:opacity-60">
                <Trash2 size={13} aria-hidden /> Supprimer
              </button>
            )}
          </div>
        </div>
      )}

      {uploading && model && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Téléversement">
          <div className="h-full bg-[var(--primary)] transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}

      {(error || previewError) && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>{error ?? `Ce modèle ne peut pas être affiché : ${previewError}. L'objet par défaut du thème est utilisé à la place.`}</span>
        </div>
      )}

      {model && (
        <fieldset className="space-y-3" disabled={locked}>
          <legend className="sr-only">Réglages du modèle</legend>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Slider label="Taille" value={transform.scale} {...R.scale} unit="×" onChange={(v) => set({ scale: v })} />
            <div className="hidden sm:block" />
            <Slider label="Rotation X (incliner)" value={transform.rotation.x} {...R.rotation} unit="°" onChange={(v) => setAxis("rotation", "x", v)} />
            <Slider label="Rotation Y (tourner)" value={transform.rotation.y} {...R.rotation} unit="°" onChange={(v) => setAxis("rotation", "y", v)} />
            <Slider label="Rotation Z (pencher)" value={transform.rotation.z} {...R.rotation} unit="°" onChange={(v) => setAxis("rotation", "z", v)} />
            <div className="hidden sm:block" />
            <Slider label="Position horizontale" value={transform.position.x} {...R.position} onChange={(v) => setAxis("position", "x", v)} />
            <Slider label="Position verticale" value={transform.position.y} {...R.position} onChange={(v) => setAxis("position", "y", v)} />
            <Slider label="Profondeur" value={transform.position.z} {...R.position} onChange={(v) => setAxis("position", "z", v)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-secondary">
            <input type="checkbox" checked={transform.autoRotate} onChange={(e) => set({ autoRotate: e.target.checked })} className="h-4 w-4 accent-[var(--primary)]" />
            Rotation automatique lente
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void saveTransform()} disabled={!changed} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-xs font-semibold text-[var(--brand-contrast,#fff)] disabled:opacity-50">
              {busy === "save" ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Save size={13} aria-hidden />} Enregistrer les réglages
            </button>
            <button type="button" onClick={() => onTransformChange(DEFAULT_HERO_TRANSFORM)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-xs font-semibold text-primary hover:bg-muted/30">
              <RotateCcw size={13} aria-hidden /> Réinitialiser
            </button>
            {changed && <span className="self-center text-xs text-amber-500">Réglages non enregistrés</span>}
          </div>
        </fieldset>
      )}
    </div>
  );
}
