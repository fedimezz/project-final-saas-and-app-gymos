"use client";

import { useState, useEffect, useCallback } from "react";
import PhoneInput from "@/components/PhoneInput";
import {
  Search, Filter, UserPlus, Loader2, Ban, UserX,
  UserCheck, ChevronLeft, ChevronRight, X, Save,
  Trash2, Edit, Eye, CreditCard, AlertCircle, Send,
} from "lucide-react";
import MemberStatusBadge from "@/components/admin/MemberStatusBadge";
import { useAuth } from "@/context/AuthContext";
import { formatMembershipPrice } from "@/lib/payment-currencies";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Member {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  invitationPending?: boolean;
  subscription: { status: string; planName: string; endDate: string } | null;
  createdAt: string;
}

interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  durationDays: number;
  description: string | null;
  features: string[];
  isActive: boolean;
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg border text-sm font-medium animate-fade-in
      ${type === "success" ? "bg-card border-green-500/30 text-green-600" : "bg-card border-red-500/30 text-red-600"}`}>
      <span>{message}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100">✕</button>
    </div>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in" onClick={onClose}>
      <div
        className={`bg-card border border-border rounded-2xl p-6 w-full shadow-xl max-h-[90vh] overflow-y-auto ${wide ? "max-w-lg" : "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-primary">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MembersPage() {
  const { userRole } = useAuth();
  const isOwner = userRole?.toUpperCase() === "OWNER";
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [viewMember, setViewMember] = useState<Member | null>(null);
  const [deleteMember, setDeleteMember] = useState<Member | null>(null);
  const [subscribeMember, setSubscribeMember] = useState<Member | null>(null);

  // Forms
  const [createForm, setCreateForm] = useState({ name: "", email: "", phone: "" });
  const [createPhoneValid, setCreatePhoneValid] = useState(true); // empty is valid (phone optional)
  const [editForm, setEditForm] = useState({ name: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Subscribe form
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [subForm, setSubForm] = useState({
    planId: "",
    paymentMethod: "CASH",
    transactionId: "",
    startDate: new Date().toISOString().split("T")[0],
  });
  const [subscribing, setSubscribing] = useState(false);

  const showToast = (m: string, t: "success" | "error") => setToast({ message: m, type: t });

  // ── Fetch members ──────────────────────────────────────────────────────────

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/members?search=${encodeURIComponent(search)}&page=${page}`,
        { credentials: "include" }
      );
      const json = await res.json();
      if (res.ok) {
        setMembers(json.members);
        setTotalPages(json.pagination.totalPages);
        setTotal(json.pagination.total);
      } else {
        showToast(json.error ?? "Erreur lors du chargement des membres", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Impossible de contacter le serveur", "error");
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);
  useEffect(() => { setPage(1); }, [search]);

  // ── Create ─────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!createForm.name || !createForm.email) {
      showToast("Nom et email requis", "error"); return;
    }
    if (createForm.phone && !createPhoneValid) {
      showToast("Numéro de téléphone invalide", "error"); return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(createForm),
      });
      const json = await res.json();
      if (res.ok) {
        showToast(
          json.invitationSent === false
            ? "Membre créé, mais l'email n'a pas pu être envoyé (vérifiez SMTP / Resend dans .env). Utilisez « Renvoyer »."
            : "Invitation envoyée par email",
          json.invitationSent === false ? "error" : "success"
        );
        setShowCreate(false);
        setCreateForm({ name: "", email: "", phone: "" });
        setCreatePhoneValid(true);
        fetchMembers();
      } else {
        showToast(json.error ?? "Erreur lors de la création", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Impossible de contacter le serveur", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleResendInvitation = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/invitations/${id}/resend`, { method: "POST", credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.invitationSent !== false) showToast("Invitation renvoyée", "success");
      else showToast(json.error ?? "L'email d'invitation n'a pas pu être envoyé", "error");
    } catch {
      showToast("Impossible de contacter le serveur", "error");
    }
  };

  // ── Edit ───────────────────────────────────────────────────────────────────

  const openEdit = (m: Member) => {
    setEditMember(m);
    setEditForm({ name: m.name, phone: m.phone || "" });
  };

  const handleEdit = async () => {
    if (!editMember) return;
    if (!editForm.name.trim()) {
      showToast("Le nom est requis", "error"); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/members/${editMember.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "edit", ...editForm }),
      });
      const json = await res.json();
      if (res.ok) {
        showToast("Membre modifié", "success");
        setEditMember(null);
        fetchMembers();
      } else {
        showToast(json.error ?? "Erreur lors de la modification", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Impossible de contacter le serveur", "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Block / suspend / reactivate ───────────────────────────────────────────

  const handleAction = async (memberId: string, action: "block" | "suspend" | "reactivate") => {
    try {
      const res = await fetch(`/api/admin/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(
          action === "reactivate" ? "Membre réactivé" :
          action === "suspend" ? "Membre suspendu" : "Membre bloqué",
          "success"
        );
        fetchMembers();
      } else {
        showToast(json.error ?? "Action impossible", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Impossible de contacter le serveur", "error");
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteMember) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/members/${deleteMember.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok) {
        showToast("Membre supprimé", "success");
        setDeleteMember(null);
        fetchMembers();
      } else {
        showToast(json.error ?? "Erreur lors de la suppression", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Impossible de contacter le serveur", "error");
    } finally {
      setDeleting(false);
    }
  };

  // ── Subscribe ──────────────────────────────────────────────────────────────

  const openSubscribe = async (m: Member) => {
    setSubscribeMember(m);
    setPlansError(null);
    setSubForm({
      planId: "",
      paymentMethod: "CASH",
      transactionId: "",
      startDate: new Date().toISOString().split("T")[0],
    });
    setLoadingPlans(true);
    try {
      const res = await fetch("/api/admin/plans", {
        credentials: "include",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setPlansError(json.error ?? `Impossible de charger les plans (${res.status})`);
        setPlans([]);
        return;
      }
      const json = await res.json();
      setPlans((json.plans ?? []).filter((p: Plan) => p.isActive));
    } catch (err) {
      console.error(err);
      setPlansError("Impossible de contacter le serveur");
      setPlans([]);
    } finally {
      setLoadingPlans(false);
    }
  };

  const handleSubscribe = async () => {
    if (!subscribeMember || !subForm.planId) {
      showToast("Sélectionnez un plan", "error"); return;
    }
    setSubscribing(true);
    try {
      const res = await fetch(`/api/admin/members/${subscribeMember.id}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(subForm),
      });
      const json = await res.json();
      if (res.ok) {
        showToast(`${subscribeMember.name} abonné avec succès`, "success");
        setSubscribeMember(null);
        fetchMembers();
      } else {
        // e.g. "X a déjà un abonnement actif..." (409) or validation errors
        showToast(json.error ?? "Erreur lors de l'abonnement", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Impossible de contacter le serveur", "error");
    } finally {
      setSubscribing(false);
    }
  };

  // ── Selected plan helper ───────────────────────────────────────────────────

  const selectedPlan = plans.find((p) => p.id === subForm.planId) ?? null;

  const formatDuration = (days: number) => {
    if (days >= 365) return `${Math.round(days / 365)} an${Math.round(days / 365) > 1 ? "s" : ""}`;
    if (days >= 30) return `${Math.round(days / 30)} mois`;
    return `${days} jours`;
  };

  const getEndDate = () => {
    if (!selectedPlan) return null;
    const d = new Date(subForm.startDate);
    d.setDate(d.getDate() + selectedPlan.durationDays);
    return d;
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">Membres</h1>
          <p className="text-muted mt-1">{total} membre{total !== 1 ? "s" : ""} inscrits</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary)] text-white rounded-xl hover:bg-[var(--primary-dark)] transition-colors text-sm font-medium"
        >
          <UserPlus size={18} />
          Ajouter un membre
        </button>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Rechercher par nom ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 text-primary placeholder:text-muted transition-all text-sm"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-muted border border-border rounded-xl text-sm text-muted hover:bg-muted/70">
          <Filter size={16} />
          Filtres
        </button>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={36} className="animate-spin text-[var(--primary)]" />
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-20 text-muted">Aucun membre trouvé.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {["Membre", "Téléphone", "Abonnement", "Statut", "Inscrit le", "Actions"].map((h) => (
                    <th key={h} className="text-left px-5 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/30 transition-colors">

                    {/* Membre */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] font-bold text-sm flex-shrink-0">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-primary text-sm">{m.name}</p>
                          <p className="text-xs text-muted">{m.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Téléphone */}
                    <td className="px-5 py-4 text-sm text-muted">{m.phone || "—"}</td>

                    {/* Abonnement */}
                    <td className="px-5 py-4">
                      {m.subscription ? (
                        <div>
                          <p className="text-sm text-primary">{m.subscription.planName}</p>
                          <p className="text-xs text-muted">
                            Expire le {new Date(m.subscription.endDate).toLocaleDateString("fr-FR")}
                          </p>
                        </div>
                      ) : (
                        <button
                          onClick={() => openSubscribe(m)}
                          className="flex items-center gap-1.5 text-xs text-[var(--primary)] hover:underline font-medium"
                        >
                          <CreditCard size={12} />
                          Abonner
                        </button>
                      )}
                    </td>

                    {/* Statut */}
                    <td className="px-5 py-4">
                      {m.invitationPending ? (
                        <span className="inline-flex items-center rounded-full bg-amber-500/10 text-amber-600 px-2.5 py-0.5 text-xs font-medium">
                          Invitation en attente
                        </span>
                      ) : (
                        <MemberStatusBadge isActive={m.isActive} subscriptionStatus={m.subscription?.status ?? null} />
                      )}
                    </td>

                    {/* Date */}
                    <td className="px-5 py-4 text-sm text-muted">
                      {new Date(m.createdAt).toLocaleDateString("fr-FR")}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setViewMember(m)} title="Voir" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                          <Eye size={15} className="text-muted" />
                        </button>
                        <button onClick={() => openEdit(m)} title="Modifier" className="p-1.5 rounded-lg hover:bg-[var(--primary)]/10 transition-colors">
                          <Edit size={15} className="text-[var(--primary)]" />
                        </button>
                        <button onClick={() => openSubscribe(m)} title="Abonner" className="p-1.5 rounded-lg hover:bg-green-500/10 transition-colors">
                          <CreditCard size={15} className="text-green-500" />
                        </button>
                        {m.invitationPending ? (
                          <button onClick={() => handleResendInvitation(m.id)} title="Renvoyer l'invitation" className="p-1.5 rounded-lg hover:bg-amber-500/10 transition-colors">
                            <Send size={15} className="text-amber-500" />
                          </button>
                        ) : m.isActive ? (
                          <>
                            <button onClick={() => handleAction(m.id, "suspend")} title="Suspendre" className="p-1.5 rounded-lg hover:bg-yellow-500/10 transition-colors">
                              <UserX size={15} className="text-yellow-500" />
                            </button>
                            <button onClick={() => handleAction(m.id, "block")} title="Bloquer" className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
                              <Ban size={15} className="text-red-500" />
                            </button>
                          </>
                        ) : (
                          <button onClick={() => handleAction(m.id, "reactivate")} title="Réactiver" className="p-1.5 rounded-lg hover:bg-green-500/10 transition-colors">
                            <UserCheck size={15} className="text-green-500" />
                          </button>
                        )}
                        {isOwner && (
                          <button onClick={() => setDeleteMember(m)} title="Supprimer" className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
                            <Trash2 size={15} className="text-red-500" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-border">
            <p className="text-sm text-muted">Page {page} sur {totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg hover:bg-muted disabled:opacity-40">
                <ChevronLeft size={16} className="text-primary" />
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg hover:bg-muted disabled:opacity-40">
                <ChevronRight size={16} className="text-primary" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── CREATE MODAL ── */}
      {showCreate && (
        <Modal title="Ajouter un membre" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            {[
              { label: "Nom complet", key: "name", type: "text", placeholder: "Ahmed Ben Ali", required: true },
              { label: "Email", key: "email", type: "email", placeholder: "ahmed@email.com", required: true },
            ].map(({ label, key, type, placeholder, required }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-primary mb-1.5">
                  {label} {required && <span className="text-red-500">*</span>}
                </label>
                <input
                  type={type}
                  value={createForm[key as "name" | "email"]}
                  onChange={(e) => setCreateForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 text-sm"
                />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-primary mb-1.5">Téléphone</label>
              <PhoneInput
                value={createForm.phone}
                onChange={(phone, meta) => {
                  setCreateForm((f) => ({ ...f, phone }));
                  setCreatePhoneValid(phone === "" || meta.valid);
                }}
              />
            </div>
            <p className="text-xs text-muted">
              Le membre recevra un email pour choisir lui-même son mot de passe et activer son compte.
            </p>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 border border-border rounded-xl text-muted hover:bg-muted text-sm font-medium">Annuler</button>
            <button onClick={handleCreate} disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-[var(--primary)] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[var(--primary-dark)] disabled:opacity-60">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
              {saving ? "Envoi..." : "Envoyer l'invitation"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── EDIT MODAL ── */}
      {editMember && (
        <Modal title="Modifier le membre" onClose={() => setEditMember(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-primary mb-1.5">Nom complet</label>
              <input type="text" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-primary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-primary mb-1.5">Téléphone</label>
              <input type="tel" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-primary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 text-sm" />
            </div>
            <p className="text-xs text-muted">Email non modifiable pour des raisons de sécurité.</p>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setEditMember(null)} className="flex-1 py-2.5 border border-border rounded-xl text-muted hover:bg-muted text-sm font-medium">Annuler</button>
            <button onClick={handleEdit} disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-[var(--primary)] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[var(--primary-dark)] disabled:opacity-60">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── VIEW MODAL ── */}
      {viewMember && (
        <Modal title="Détails du membre" onClose={() => setViewMember(null)}>
          <div className="space-y-4">
            <div className="flex items-center gap-4 pb-4 border-b border-border">
              <div className="w-14 h-14 rounded-full bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] font-bold text-xl">
                {viewMember.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-primary text-lg">{viewMember.name}</p>
                <p className="text-sm text-muted">{viewMember.email}</p>
              </div>
            </div>
            {[
              { label: "Téléphone", value: viewMember.phone || "—" },
              { label: "Statut", value: viewMember.isActive ? "Actif" : "Inactif" },
              { label: "Rôle", value: viewMember.role },
              { label: "Inscrit le", value: new Date(viewMember.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) },
              { label: "Abonnement", value: viewMember.subscription ? `${viewMember.subscription.planName} — ${viewMember.subscription.status}` : "Aucun" },
              { label: "Expire le", value: viewMember.subscription ? new Date(viewMember.subscription.endDate).toLocaleDateString("fr-FR") : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
                <span className="text-sm text-muted">{label}</span>
                <span className="text-sm font-medium text-primary">{value}</span>
              </div>
            ))}
            <div className="pt-2 text-xs text-muted font-mono select-all">ID: {viewMember.id}</div>
          </div>
          <button onClick={() => setViewMember(null)} className="w-full mt-5 py-2.5 border border-border rounded-xl text-muted hover:bg-muted text-sm font-medium">Fermer</button>
        </Modal>
      )}

      {/* ── DELETE MODAL ── */}
      {deleteMember && (
        <Modal title="Supprimer le membre" onClose={() => setDeleteMember(null)}>
          <p className="text-muted text-sm mb-2">
            Êtes-vous sûr de vouloir supprimer <span className="font-semibold text-primary">{deleteMember.name}</span> ?
          </p>
          <p className="text-xs text-red-500 mb-6">Cette action est irréversible. Toutes les données associées seront supprimées.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteMember(null)} className="flex-1 py-2.5 border border-border rounded-xl text-muted hover:bg-muted text-sm font-medium">Annuler</button>
            <button onClick={handleDelete} disabled={deleting} className="flex-1 flex items-center justify-center gap-2 bg-red-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-red-600 disabled:opacity-60">
              {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              {deleting ? "Suppression..." : "Supprimer"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── SUBSCRIBE MODAL ── */}
      {subscribeMember && (
        <Modal title="Nouvel abonnement" onClose={() => setSubscribeMember(null)} wide>
          {/* Member info */}
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl mb-5">
            <div className="w-9 h-9 rounded-full bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] font-bold text-sm flex-shrink-0">
              {subscribeMember.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-primary text-sm">{subscribeMember.name}</p>
              <p className="text-xs text-muted">{subscribeMember.email}</p>
            </div>
          </div>

          {/* Already has an active subscription warning */}
          {subscribeMember.subscription && subscribeMember.subscription.status === "ACTIVE" && (
            <div className="flex items-start gap-2 p-3 mb-5 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-700 text-sm">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>
                Ce membre a déjà un abonnement actif ({subscribeMember.subscription.planName}, expire le{" "}
                {new Date(subscribeMember.subscription.endDate).toLocaleDateString("fr-FR")}). Créer un nouvel
                abonnement maintenant sera refusé par le serveur tant que celui-ci est actif.
              </span>
            </div>
          )}

          <div className="space-y-5">

            {/* Plans */}
            <div>
              <label className="block text-sm font-medium text-primary mb-2">
                Choisir un plan <span className="text-red-500">*</span>
              </label>
              {loadingPlans ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
                </div>
              ) : plansError ? (
                <div className="flex items-start gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 text-sm">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{plansError}</span>
                </div>
              ) : plans.length === 0 ? (
                <p className="text-sm text-muted text-center py-6 bg-muted/30 rounded-xl">
                  Aucun plan actif disponible. Créez d&apos;abord un plan dans la section Plans.
                </p>
              ) : (
                <div className="grid gap-2">
                  {plans.map((plan) => (
                    <button
                      key={plan.id}
                      onClick={() => setSubForm((f) => ({ ...f, planId: plan.id }))}
                      className={`w-full flex items-center justify-between p-4 rounded-xl border-2 text-left transition-all ${
                        subForm.planId === plan.id
                          ? "border-[var(--primary)] bg-[var(--primary)]/5"
                          : "border-border hover:border-[var(--primary)]/40 hover:bg-muted/30"
                      }`}
                    >
                      <div>
                        <p className="font-semibold text-primary text-sm">{plan.name}</p>
                        <p className="text-xs text-muted mt-0.5">
                          {formatDuration(plan.durationDays)}
                          {plan.description && ` · ${plan.description}`}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <p className="font-bold text-[var(--primary)] text-lg">{formatMembershipPrice(plan.price, plan.currency)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Date de début */}
            <div>
              <label className="block text-sm font-medium text-primary mb-1.5">Date de début</label>
              <input
                type="date"
                value={subForm.startDate}
                onChange={(e) => setSubForm((f) => ({ ...f, startDate: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-primary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 text-sm"
              />
            </div>

            {/* Méthode de paiement */}
            <div>
              <label className="block text-sm font-medium text-primary mb-2">Méthode de paiement</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "CASH", label: "💵", desc: "Espèces" },
                  { value: "CARD", label: "💳", desc: "Carte" },
                  { value: "TRANSFER", label: "🏦", desc: "Virement" },
                ].map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setSubForm((f) => ({ ...f, paymentMethod: m.value }))}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      subForm.paymentMethod === m.value
                        ? "border-[var(--primary)] bg-[var(--primary)]/5 text-[var(--primary)]"
                        : "border-border bg-muted text-muted hover:text-primary hover:border-[var(--primary)]/40"
                    }`}
                  >
                    <span className="text-xl">{m.label}</span>
                    <span className="text-xs">{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Référence */}
            <div>
              <label className="block text-sm font-medium text-primary mb-1.5">
                Référence <span className="text-xs text-muted font-normal">(optionnel)</span>
              </label>
              <input
                type="text"
                value={subForm.transactionId}
                onChange={(e) => setSubForm((f) => ({ ...f, transactionId: e.target.value }))}
                placeholder="REF-2026-001"
                className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 text-sm"
              />
            </div>

            {/* Récapitulatif */}
            {selectedPlan && (
              <div className="bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-xl p-4 space-y-2">
                <p className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider mb-3">Récapitulatif</p>
                {[
                  { label: "Membre", value: subscribeMember.name },
                  { label: "Plan", value: selectedPlan.name },
                  { label: "Durée", value: formatDuration(selectedPlan.durationDays) },
                  {
                    label: "Période",
                    value: `${new Date(subForm.startDate).toLocaleDateString("fr-FR")} → ${getEndDate()?.toLocaleDateString("fr-FR")}`,
                  },
                  { label: "Paiement", value: { CASH: "Espèces", CARD: "Carte", TRANSFER: "Virement" }[subForm.paymentMethod] ?? subForm.paymentMethod },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-muted">{label}</span>
                    <span className="font-medium text-primary">{value}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm border-t border-[var(--primary)]/20 pt-2 mt-2">
                  <span className="font-bold text-primary">Total à payer</span>
                  <span className="font-bold text-[var(--primary)] text-base">{formatMembershipPrice(selectedPlan.price, selectedPlan.currency)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={() => setSubscribeMember(null)} className="flex-1 py-2.5 border border-border rounded-xl text-muted hover:bg-muted text-sm font-medium">
              Annuler
            </button>
            <button
              onClick={handleSubscribe}
              disabled={subscribing || !subForm.planId}
              className="flex-1 flex items-center justify-center gap-2 bg-[var(--primary)] text-white py-2.5 rounded-xl font-medium text-sm hover:bg-[var(--primary-dark)] disabled:opacity-60"
            >
              {subscribing ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
              {subscribing ? "Enregistrement..." : "Confirmer l'abonnement"}
            </button>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}