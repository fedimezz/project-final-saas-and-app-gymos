"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Loader2, Dumbbell, AlertCircle, Clock, MapPin, Plus, Pencil, Trash2, X, Lock, ImagePlus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const DAY_LABEL: Record<string, string> = {
  MONDAY: "Lun", TUESDAY: "Mar", WEDNESDAY: "Mer", THURSDAY: "Jeu",
  FRIDAY: "Ven", SATURDAY: "Sam", SUNDAY: "Dim",
};

interface CoachSession {
  id: string;
  activity: string;
  day: string;
  startTime: string;
  endTime: string;
  location: string;
}

interface Coach {
  id: string;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  specialties: string[];
  phone: string | null;
  isActive: boolean;
  user: { id: string; email: string; isActive: boolean } | null;
  sessions: CoachSession[];
}

const emptyForm = {
  name: "",
  bio: "",
  photoUrl: "",
  specialties: "",
  phone: "",
  isActive: true,
  createAccount: false,
  email: "",
  password: "",
  linkUserId: "",
};

export default function CoachesPage() {
  const { userRole } = useAuth();
  const isOwner = userRole?.toUpperCase() === "OWNER";

  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Coach | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [staff, setStaff] = useState<{ id: string; name: string; role: string }[]>([]);

  useEffect(() => {
    if (!isOwner) return;
    fetch("/api/admin/staff", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setStaff(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, [isOwner]);

  const fetchCoaches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/coaches", { credentials: "include" });
      const data = await res.json();
      if (res.ok) setCoaches(data.coaches ?? []);
      else setError(data.error || "Erreur de chargement");
    } catch {
      setError("Erreur serveur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCoaches(); }, [fetchCoaches]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (c: Coach) => {
    setEditing(c);
    setForm({
      name: c.name,
      bio: c.bio ?? "",
      photoUrl: c.photoUrl ?? "",
      specialties: c.specialties.join(", "),
      phone: c.phone ?? "",
      isActive: c.isActive,
      createAccount: false,
      email: "",
      password: "",
      linkUserId: "",
    });
    setFormError("");
    setFormOpen(true);
  };

  const handlePhotoSelect = async (file: File | undefined | null) => {
    if (!file) return;
    setUploading(true);
    setFormError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", credentials: "include", body });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Échec du téléversement");
        return;
      }
      setForm((f) => ({ ...f, photoUrl: data.url }));
    } catch {
      setFormError("Erreur réseau lors du téléversement");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setFormError("");
    if (!form.name.trim()) return setFormError("Le nom est requis");
    if (form.createAccount && !editing?.user) {
      if (!form.email.trim()) return setFormError("L'email est requis pour créer un accès");
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        bio: form.bio.trim() || null,
        photoUrl: form.photoUrl || null,
        specialties: form.specialties.split(",").map((s) => s.trim()).filter(Boolean),
        phone: form.phone.trim() || null,
        isActive: form.isActive,
        ...(!editing && form.linkUserId
          ? { linkUserId: form.linkUserId }
          : form.createAccount && !editing?.user
            ? { createAccount: true, email: form.email.trim() }
            : {}),
      };
      const res = await fetch(editing ? `/api/admin/coaches/${editing.id}` : "/api/admin/coaches", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error || "Erreur lors de l'enregistrement");
        return;
      }
      setFormOpen(false);
      if (json.invitationSent === true) setNotice("Invitation envoyée par email au coach.");
      else if (json.invitationSent === false) setNotice("Coach créé, mais l'email n'a pas pu être envoyé. Utilisez « Renvoyer l'invitation ».");
      fetchCoaches();
    } catch {
      setFormError("Erreur serveur");
    } finally {
      setSaving(false);
    }
  };

  const handleResend = async (c: Coach) => {
    if (!c.user) return;
    try {
      const res = await fetch(`/api/admin/invitations/${c.user.id}/resend`, { method: "POST", credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setNotice(json.error || "Impossible de renvoyer l'invitation.");
      else setNotice(json.invitationSent ? "Invitation renvoyée par email." : "L'email n'a pas pu être envoyé (vérifiez la configuration email).");
    } catch {
      setNotice("Erreur réseau.");
    }
  };

  const handleDelete = async (c: Coach) => {
    if (!confirm(`Retirer le coach "${c.name}" ? S'il a des séances en cours, il sera juste désactivé.`)) return;
    try {
      const res = await fetch(`/api/admin/coaches/${c.id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) fetchCoaches();
    } catch {
      // no-op
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {notice && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2 text-sm text-primary">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="Fermer" className="text-muted hover:text-primary">×</button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Coachs</h1>
          <p className="text-muted mt-1">
            Gérez les profils des coachs — affichés sur la page publique « Coaching » et assignables dans le planning.
          </p>
        </div>
        {isOwner && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-lg font-medium hover:opacity-90 transition"
          >
            <Plus size={18} />
            Nouveau coach
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg p-4">
          <AlertCircle size={18} />
          {error}
        </div>
      ) : coaches.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted">
          Aucun coach pour l&apos;instant.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {coaches.map((c) => (
            <div key={c.id} className={`bg-card border border-border rounded-2xl overflow-hidden ${!c.isActive ? "opacity-50" : ""}`}>
              <button
                onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
              >
                {c.photoUrl ? (
                  <Image src={c.photoUrl} alt={c.name} width={48} height={48} className="w-12 h-12 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                    <Dumbbell size={20} className="text-muted" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-primary truncate">{c.name}</p>
                  <p className="text-xs text-muted truncate">
                    {c.specialties.length > 0 ? c.specialties.join(" · ") : `${c.sessions.length} séance(s) cette semaine`}
                    {c.user && c.user.isActive && <span className="ml-1.5 text-[var(--primary)]">· accès activé</span>}
                    {c.user && !c.user.isActive && (
                      <>
                        <span className="ml-1.5 text-amber-500">· invitation en attente</span>
                        {isOwner && (
                          <button type="button" onClick={() => void handleResend(c)} className="ml-2 underline text-[var(--primary)]">
                            Renvoyer l&apos;invitation
                          </button>
                        )}
                      </>
                    )}
                    {!c.isActive && <span className="ml-1.5">· inactif</span>}
                  </p>
                </div>
              </button>

              {expanded === c.id && (
                <div className="border-t border-border p-4 space-y-3">
                  {c.bio && <p className="text-sm text-muted">{c.bio}</p>}
                  {c.sessions.length === 0 ? (
                    <p className="text-sm text-muted">Aucune séance cette semaine.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {c.sessions.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 text-sm text-muted">
                          <span className="font-medium text-primary w-9">{DAY_LABEL[s.day]}</span>
                          <Clock size={13} />
                          {s.startTime}–{s.endTime}
                          <MapPin size={13} className="ml-1" />
                          {s.location}
                        </div>
                      ))}
                    </div>
                  )}
                  {isOwner && (
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => openEdit(c)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
                      >
                        <Pencil size={14} />
                        Modifier
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!isOwner && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Lock size={14} />
          Créer, modifier ou retirer un coach est réservé au propriétaire.
        </p>
      )}

      {formOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-primary">{editing ? "Modifier le coach" : "Nouveau coach"}</h2>
              <button onClick={() => setFormOpen(false)} className="text-muted hover:text-primary">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              {!editing && staff.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Relier à un admin (optionnel)</label>
                  <select
                    value={form.linkUserId}
                    onChange={(e) => {
                      const id = e.target.value;
                      const picked = staff.find((m) => m.id === id);
                      setForm((f) => ({ ...f, linkUserId: id, name: picked && !f.name ? picked.name : f.name, createAccount: id ? false : f.createAccount }));
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-card border border-border text-primary text-sm"
                  >
                    <option value="">— Nouveau coach —</option>
                    {staff.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
                  </select>
                  <p className="mt-1 text-[11px] text-muted">Un admin ou le propriétaire qui donne aussi des cours apparaît alors dans le choix du coach du planning.</p>
                </div>
              )}
              <div className="flex items-center gap-3">
                {form.photoUrl ? (
                  <Image src={form.photoUrl} alt="" width={56} height={56} className="w-14 h-14 rounded-full object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                    <Dumbbell size={22} className="text-muted" />
                  </div>
                )}
                <label className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900 transition">
                  <ImagePlus size={14} />
                  {uploading ? "Envoi…" : "Photo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => handlePhotoSelect(e.target.files?.[0])}
                  />
                </label>
              </div>

              <input
                type="text"
                placeholder="Nom"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-transparent"
              />
              <textarea
                placeholder="Bio (optionnelle)"
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-transparent"
                rows={2}
              />
              <input
                type="text"
                placeholder="Spécialités, séparées par des virgules (ex: CrossFit, Boxe)"
                value={form.specialties}
                onChange={(e) => setForm({ ...form, specialties: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-transparent"
              />
              <input
                type="tel"
                placeholder="Téléphone (optionnel)"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-transparent"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Visible sur la page publique « Coaching »
              </label>

              {editing?.user ? (
                <p className="text-xs text-muted flex items-center gap-1.5 pt-1 border-t border-border">
                  <Lock size={12} />
                  Accès déjà activé ({editing.user.email})
                </p>
              ) : (
                <div className="pt-1 border-t border-border space-y-2">
                  <label className="flex items-center gap-2 text-sm pt-2">
                    <input
                      type="checkbox"
                      checked={form.createAccount}
                      onChange={(e) => setForm({ ...form, createAccount: e.target.checked })}
                    />
                    Donner un accès de connexion à ce coach
                  </label>
                  {form.createAccount && (
                    <>
                      <input
                        type="email"
                        placeholder="Email de connexion"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-transparent"
                      />
                      <p className="text-[11px] text-muted">
                        Le coach reçoit un email d&apos;invitation et choisit lui-même son mot de passe.
                      </p>
                    </>
                  )}
                </div>
              )}

              {formError && (
                <p className="text-sm text-red-500 flex items-center gap-1.5">
                  <AlertCircle size={14} />
                  {formError}
                </p>
              )}

              <button
                onClick={handleSave}
                disabled={saving || uploading}
                className="w-full py-2.5 rounded-lg bg-[var(--primary)] text-white font-medium hover:opacity-90 transition disabled:opacity-50"
              >
                {saving ? "Enregistrement..." : editing ? "Enregistrer" : "Créer le coach"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
