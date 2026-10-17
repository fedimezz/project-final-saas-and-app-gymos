"use client";

import { useState, useEffect, useCallback } from "react";
import { formatMembershipPrice } from "@/lib/payment-currencies";
import Image from "next/image";
import {
  Loader2, CheckCircle, XCircle, ChevronLeft, ChevronRight,
  RefreshCw, Trash2, Search,
} from "lucide-react";

interface Subscription {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  user: { id: string; name: string; email: string; avatar: string | null };
  plan: { name: string; price: number; currency: string };
  payments: { status: string; amount: number; currency: string; paymentMethod: string }[];
}

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

function Avatar({ name, avatar }: { name: string; avatar: string | null }) {
  if (avatar) return <Image src={avatar} alt={name} width={32} height={32} className="w-8 h-8 rounded-full object-cover" />;
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  return <div className="w-8 h-8 rounded-full bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] text-xs font-bold">{initials}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-green-500/10 text-green-600 border-green-500/20",
    PENDING: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    EXPIRED: "bg-muted text-muted border-border",
    CANCELLED: "bg-red-500/10 text-red-500 border-red-500/20",
    SUSPENDED: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  };
  const labels: Record<string, string> = {
    ACTIVE: "Actif", PENDING: "En attente", EXPIRED: "Expiré",
    CANCELLED: "Annulé", SUSPENDED: "Suspendu",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${map[status] ?? "bg-muted text-muted border-border"}`}>
      {labels[status] ?? status}
    </span>
  );
}

const STATUS_FILTERS = [
  { value: "PENDING", label: "En attente" },
  { value: "ACTIVE", label: "Actifs" },
  { value: "EXPIRED", label: "Expirés" },
  { value: "CANCELLED", label: "Annulés" },
  { value: "SUSPENDED", label: "Suspendus" },
  { value: "", label: "Tous" },
];

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (m: string, t: "success" | "error") => setToast({ message: m, type: t });

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/subscriptions?${params}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok) {
        setSubscriptions(json.subscriptions);
        setTotalPages(json.pagination.totalPages);
        setTotal(json.pagination.total);
      } else {
        showToast(json.error ?? "Erreur lors du chargement des abonnements", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Impossible de contacter le serveur", "error");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const handleAction = async (subscriptionId: string, action: "approve" | "cancel" | "suspend") => {
    setActionLoading(subscriptionId + action);
    try {
      const res = await fetch("/api/admin/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subscriptionId, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(
          action === "approve" ? "Abonnement activé" :
          action === "suspend" ? "Abonnement suspendu" : "Abonnement annulé",
          "success"
        );
        fetchSubs();
      } else {
        showToast(json.error ?? "Action impossible", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Impossible de contacter le serveur", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: deleteId }),
      });
      if (res.ok) {
        showToast("Abonnement supprimé", "success");
        setDeleteId(null);
        fetchSubs();
      } else {
        const json = await res.json().catch(() => ({}));
        showToast(json.error ?? "Erreur lors de la suppression", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Impossible de contacter le serveur", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">Abonnements</h1>
          <p className="text-muted mt-1">{total} abonnement{total !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={fetchSubs} className="p-2.5 rounded-xl bg-muted hover:bg-muted/70 transition-colors self-start sm:self-auto">
          <RefreshCw size={17} className="text-muted" />
        </button>
      </div>

      {/* Search + Status tabs */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Rechercher par membre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-muted border border-border rounded-xl text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          />
        </div>
        <div className="flex gap-1.5 p-1 bg-muted rounded-xl w-fit overflow-x-auto">
          {STATUS_FILTERS.map((f) => (
            <button key={f.value} onClick={() => setStatusFilter(f.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${statusFilter === f.value ? "bg-card text-primary shadow-sm" : "text-muted hover:text-primary"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="text-center py-16 text-muted">Aucun abonnement trouvé.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {["Membre", "Plan", "Période", "Paiement", "Statut", "Actions", ""].map((h) => (
                    <th key={h} className="text-left px-5 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {subscriptions.map((sub) => {
                  const payment = sub.payments[0];
                  const isExpired = new Date(sub.endDate) < new Date();
                  return (
                    <tr key={sub.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={sub.user.name} avatar={sub.user.avatar} />
                          <div>
                            <p className="font-medium text-primary text-sm">{sub.user.name}</p>
                            <p className="text-xs text-muted">{sub.user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-primary text-sm">{sub.plan.name}</p>
                        <p className="text-xs text-muted">{formatMembershipPrice(sub.plan.price, sub.plan.currency)}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-muted">
                        <p>{new Date(sub.startDate).toLocaleDateString("fr-FR")}</p>
                        <p className={`text-xs ${isExpired ? "text-red-500" : ""}`}>
                          → {new Date(sub.endDate).toLocaleDateString("fr-FR")}
                          {isExpired && " (expiré)"}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        {payment ? (
                          <div>
                            <p className="text-sm text-primary font-medium">{formatMembershipPrice(payment.amount, payment.currency)}</p>
                            <p className="text-xs text-muted">{payment.paymentMethod}</p>
                          </div>
                        ) : <span className="text-xs text-muted italic">—</span>}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={sub.status} />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-2">
                          {sub.status === "PENDING" && (
                            <>
                              <button onClick={() => handleAction(sub.id, "approve")} disabled={!!actionLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 text-green-600 rounded-lg text-xs font-medium hover:bg-green-500/20 transition-colors disabled:opacity-50">
                                {actionLoading === sub.id + "approve" ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                                Valider
                              </button>
                              <button onClick={() => handleAction(sub.id, "cancel")} disabled={!!actionLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-500 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50">
                                {actionLoading === sub.id + "cancel" ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                                Refuser
                              </button>
                            </>
                          )}
                          {sub.status === "ACTIVE" && (
                            <button onClick={() => handleAction(sub.id, "suspend")} disabled={!!actionLoading}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 text-orange-500 rounded-lg text-xs font-medium hover:bg-orange-500/20 transition-colors disabled:opacity-50">
                              {actionLoading === sub.id + "suspend" ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                              Suspendre
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <button onClick={() => setDeleteId(sub.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-all"
                          title="Supprimer">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
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

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in" onClick={() => setDeleteId(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-primary mb-2">Supprimer cet abonnement ?</h2>
            <p className="text-sm text-muted mb-6">Tous les paiements associés seront aussi supprimés. Action irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 border border-border rounded-xl text-muted hover:bg-muted text-sm font-medium">Annuler</button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 bg-red-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-red-600 disabled:opacity-60">
                {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                {deleting ? "Suppression..." : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}