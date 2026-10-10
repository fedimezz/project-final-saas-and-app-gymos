"use client";

import { useState, useEffect, useCallback } from "react";
import { formatMembershipPrice } from "@/lib/payment-currencies";
import {
    Loader2, Plus, ChevronLeft, ChevronRight, RefreshCw,
    X, Trash2, Search, CreditCard, AlertCircle,
} from "lucide-react";

interface Payment {
    id: string;
    amount: number;
    currency: string;
    status: string;
    paymentMethod: string;
    transactionId: string | null;
    paidAt: string | null;
    createdAt: string;
    subscription: {
        id: string;
        user: { name: string; email: string };
        plan: { name: string };
    };
}

interface PendingSub {
    id: string;
    user: { name: string; email: string };
    plan: { name: string; price: number; currency: string };
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

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        PAID: "bg-green-500/10 text-green-600 border-green-500/20",
        PENDING: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
        FAILED: "bg-red-500/10 text-red-500 border-red-500/20",
    };
    const labels: Record<string, string> = { PAID: "Payé", PENDING: "En attente", FAILED: "Échoué" };
    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${map[status] ?? "bg-muted text-muted border-border"}`}>
      {labels[status] ?? status}
    </span>
    );
}

const METHOD_LABELS: Record<string, string> = { CASH: "Espèces", CARD: "Carte", TRANSFER: "Virement" };
const STATUS_FILTERS = [
    { value: "", label: "Tous" },
    { value: "PAID", label: "Payés" },
    { value: "PENDING", label: "En attente" },
];

export default function AdminPaymentsPage() {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

    // Manual payment modal
    const [showManual, setShowManual] = useState(false);
    const [saving, setSaving] = useState(false);
    const [pendingSubs, setPendingSubs] = useState<PendingSub[]>([]);
    const [loadingPending, setLoadingPending] = useState(false);
    const [pendingError, setPendingError] = useState<string | null>(null);
    const [subSearch, setSubSearch] = useState("");
    const [selectedSub, setSelectedSub] = useState<PendingSub | null>(null);
    const [form, setForm] = useState({ paymentMethod: "CASH", transactionId: "", amount: "" });

    // Delete
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    const showToast = (m: string, t: "success" | "error") => setToast({ message: m, type: t });

    const fetchPayments = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page) });
            if (statusFilter) params.set("status", statusFilter);
            if (search) params.set("search", search);
            const res = await fetch(`/api/admin/payments?${params}`, {
                credentials: "include",
            });
            const json = await res.json();
            if (res.ok) {
                setPayments(json.payments);
                setTotalPages(json.pagination.totalPages);
                setTotal(json.pagination.total);
            } else {
                showToast(json.error ?? "Erreur lors du chargement des paiements", "error");
            }
        } catch (err) {
            console.error(err);
            showToast("Impossible de contacter le serveur", "error");
        } finally {
            setLoading(false);
        }
    }, [page, statusFilter, search]);

    useEffect(() => { fetchPayments(); }, [fetchPayments]);
    useEffect(() => { setPage(1); }, [search, statusFilter]);

    // Fetch pending subscriptions when modal opens
    const openManualModal = async () => {
        setShowManual(true);
        setSelectedSub(null);
        setSubSearch("");
        setPendingError(null);
        setForm({ paymentMethod: "CASH", transactionId: "", amount: "" });
        setLoadingPending(true);
        try {
            const res = await fetch("/api/admin/subscriptions?status=PENDING&page=1&limit=100", {
                credentials: "include",
            });
            const json = await res.json();
            if (res.ok) {
                setPendingSubs(json.subscriptions);
            } else {
                setPendingError(json.error ?? "Impossible de charger les abonnements en attente");
                setPendingSubs([]);
            }
        } catch (err) {
            console.error(err);
            setPendingError("Impossible de contacter le serveur");
            setPendingSubs([]);
        } finally {
            setLoadingPending(false);
        }
    };

    // Filter pending subs by search
    const filteredSubs = pendingSubs.filter((s) => {
        const q = subSearch.toLowerCase();
        return (
            s.user.name.toLowerCase().includes(q) ||
            s.user.email.toLowerCase().includes(q) ||
            s.plan.name.toLowerCase().includes(q)
        );
    });

    const handleSelectSub = (sub: PendingSub) => {
        setSelectedSub(sub);
        setForm((f) => ({ ...f, amount: String(sub.plan.price) }));
        setSubSearch("");
    };

    const handleManualPayment = async () => {
        if (!selectedSub) { showToast("Sélectionnez un abonnement", "error"); return; }
        if (!form.amount || Number(form.amount) <= 0) { showToast("Montant invalide", "error"); return; }
        setSaving(true);
        try {
            const res = await fetch("/api/admin/payments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
        credentials: "include",
                body: JSON.stringify({
                    subscriptionId: selectedSub.id,
                    amount: form.amount,
                    paymentMethod: form.paymentMethod,
                    transactionId: form.transactionId,
                }),
            });
            const json = await res.json();
            if (res.ok) {
                showToast("Paiement enregistré et abonnement activé", "success");
                setShowManual(false);
                fetchPayments();
            } else {
                showToast(json.error ?? "Erreur lors de l'enregistrement", "error");
            }
        } catch (err) {
            console.error(err);
            showToast("Impossible de contacter le serveur", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteId) return;
        setDeleting(true);
        try {
            const res = await fetch("/api/admin/payments", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
        credentials: "include",
                body: JSON.stringify({ id: deleteId }),
            });
            if (res.ok) {
                showToast("Paiement supprimé", "success");
                setDeleteId(null);
                fetchPayments();
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
                    <h1 className="text-3xl font-bold text-primary">Paiements</h1>
                    <p className="text-muted mt-1">{total} paiement{total !== 1 ? "s" : ""} enregistré{total !== 1 ? "s" : ""}</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={fetchPayments} className="p-2.5 rounded-xl bg-muted hover:bg-muted/70 transition-colors">
                        <RefreshCw size={17} className="text-muted" />
                    </button>
                    <button onClick={openManualModal}
                            className="flex items-center gap-2 px-5 py-2.5 bg-[var(--primary)] text-white rounded-xl hover:bg-[var(--primary-dark)] transition-colors font-medium text-sm">
                        <Plus size={17} />
                        Paiement manuel
                    </button>
                </div>
            </div>

            {/* Search + Filter */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input type="text" placeholder="Rechercher par membre..." value={search}
                           onChange={(e) => setSearch(e.target.value)}
                           className="w-full pl-9 pr-4 py-2.5 bg-muted border border-border rounded-xl text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20" />
                </div>
                <div className="flex gap-1.5 p-1 bg-muted rounded-xl">
                    {STATUS_FILTERS.map((f) => (
                        <button key={f.value} onClick={() => setStatusFilter(f.value)}
                                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${statusFilter === f.value ? "bg-card text-primary shadow-sm" : "text-muted hover:text-primary"}`}>
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
                ) : payments.length === 0 ? (
                    <div className="text-center py-16 text-muted">Aucun paiement trouvé.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                            <tr className="border-b border-border bg-muted/50">
                                {["Membre", "Plan", "Montant", "Méthode", "Référence", "Date", "Statut", ""].map((h) => (
                                    <th key={h} className="text-left px-5 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider">{h}</th>
                                ))}
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                            {payments.map((p) => (
                                <tr key={p.id} className="hover:bg-muted/30 transition-colors group">
                                    <td className="px-5 py-4">
                                        <p className="font-medium text-primary text-sm">{p.subscription.user.name}</p>
                                        <p className="text-xs text-muted">{p.subscription.user.email}</p>
                                    </td>
                                    <td className="px-5 py-4 text-sm text-primary">{p.subscription.plan.name}</td>
                                    <td className="px-5 py-4">
                                        <p className="font-semibold text-primary">{p.amount} {p.currency}</p>
                                    </td>
                                    <td className="px-5 py-4 text-sm text-muted">{METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}</td>
                                    <td className="px-5 py-4 text-xs text-muted font-mono">{p.transactionId || "—"}</td>
                                    <td className="px-5 py-4 text-sm text-muted">
                                        {new Date(p.paidAt ?? p.createdAt).toLocaleDateString("fr-FR")}
                                    </td>
                                    <td className="px-5 py-4"><StatusBadge status={p.status} /></td>
                                    <td className="px-5 py-4">
                                        <button onClick={() => setDeleteId(p.id)}
                                                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-all"
                                                title="Supprimer">
                                            <Trash2 size={15} />
                                        </button>
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

            {/* Manual payment modal */}
            {showManual && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in" onClick={() => setShowManual(false)}>
                    <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-xl font-bold text-primary">Paiement manuel</h2>
                            <button onClick={() => setShowManual(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted"><X size={18} /></button>
                        </div>

                        <div className="space-y-4">
                            {/* Step 1 — Select subscription */}
                            <div>
                                <label className="block text-sm font-medium text-primary mb-1.5">
                                    Abonnement <span className="text-red-500">*</span>
                                </label>

                                {/* Selected sub display */}
                                {selectedSub ? (
                                    <div className="flex items-center justify-between p-3 bg-[var(--primary)]/5 border border-[var(--primary)]/30 rounded-xl">
                                        <div>
                                            <p className="font-semibold text-primary text-sm">{selectedSub.user.name}</p>
                                            <p className="text-xs text-muted">{selectedSub.user.email} · {selectedSub.plan.name} · {formatMembershipPrice(selectedSub.plan.price, selectedSub.plan.currency)}</p>
                                        </div>
                                        <button onClick={() => { setSelectedSub(null); setForm((f) => ({ ...f, amount: "" })); }}
                                                className="p-1 rounded-lg hover:bg-muted text-muted">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {/* Search input */}
                                        <div className="relative">
                                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                                            <input
                                                type="text"
                                                placeholder="Rechercher par nom, email ou plan..."
                                                value={subSearch}
                                                onChange={(e) => setSubSearch(e.target.value)}
                                                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-muted border border-border text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 text-sm"
                                            />
                                        </div>

                                        {/* Dropdown list */}
                                        <div className="max-h-48 overflow-y-auto rounded-xl border border-border bg-card divide-y divide-border">
                                            {loadingPending ? (
                                                <div className="flex justify-center py-6">
                                                    <Loader2 size={20} className="animate-spin text-[var(--primary)]" />
                                                </div>
                                            ) : pendingError ? (
                                                <div className="flex items-start gap-2 px-4 py-4 text-red-600 text-sm">
                                                    <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                                                    <span>{pendingError}</span>
                                                </div>
                                            ) : filteredSubs.length === 0 ? (
                                                <p className="text-center text-sm text-muted py-6">
                                                    {pendingSubs.length === 0 ? "Aucun abonnement en attente" : "Aucun résultat"}
                                                </p>
                                            ) : (
                                                filteredSubs.map((sub) => (
                                                    <button
                                                        key={sub.id}
                                                        onClick={() => handleSelectSub(sub)}
                                                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                                                    >
                                                        <div>
                                                            <p className="font-medium text-primary text-sm">{sub.user.name}</p>
                                                            <p className="text-xs text-muted">{sub.user.email}</p>
                                                        </div>
                                                        <div className="text-right flex-shrink-0 ml-4">
                                                            <p className="text-sm font-semibold text-[var(--primary)]">{formatMembershipPrice(sub.plan.price, sub.plan.currency)}</p>
                                                            <p className="text-xs text-muted">{sub.plan.name}</p>
                                                        </div>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Step 2 — Payment details (shown after selecting sub) */}
                            {selectedSub && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-primary mb-1.5">Montant ({selectedSub.plan.currency}) <span className="text-red-500">*</span></label>
                                        <input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                                               className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-primary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 text-sm"
                                               placeholder="150" />
                                        <p className="text-xs text-muted mt-1">Prix du plan : {formatMembershipPrice(selectedSub.plan.price, selectedSub.plan.currency)} (pré-rempli)</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-primary mb-1.5">Méthode de paiement</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[{ value: "CASH", label: "💵 Espèces" }, { value: "CARD", label: "💳 Carte" }, { value: "TRANSFER", label: "🏦 Virement" }].map((m) => (
                                                <button
                                                    key={m.value}
                                                    onClick={() => setForm((f) => ({ ...f, paymentMethod: m.value }))}
                                                    className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${
                                                        form.paymentMethod === m.value
                                                            ? "border-[var(--primary)] bg-[var(--primary)]/5 text-[var(--primary)]"
                                                            : "border-border bg-muted text-muted hover:text-primary"
                                                    }`}
                                                >
                                                    {m.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-primary mb-1.5">
                                            Référence <span className="text-muted font-normal">(optionnel)</span>
                                        </label>
                                        <input type="text" value={form.transactionId} onChange={(e) => setForm((f) => ({ ...f, transactionId: e.target.value }))}
                                               className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 text-sm"
                                               placeholder="REF-2026-001" />
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setShowManual(false)} className="flex-1 py-2.5 border border-border rounded-xl text-muted hover:bg-muted text-sm font-medium">Annuler</button>
                            <button onClick={handleManualPayment} disabled={saving || !selectedSub}
                                    className="flex-1 flex items-center justify-center gap-2 bg-[var(--primary)] text-white py-2.5 rounded-xl font-medium text-sm hover:bg-[var(--primary-dark)] disabled:opacity-60">
                                {saving ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
                                {saving ? "Enregistrement..." : "Enregistrer le paiement"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete confirm */}
            {deleteId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in" onClick={() => setDeleteId(null)}>
                    <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <h2 className="text-lg font-bold text-primary mb-2">Supprimer ce paiement ?</h2>
                        <p className="text-sm text-muted mb-6">Cette action est irréversible.</p>
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