"use client";
// /platform/website-requests — SUPER_ADMIN review queue for change requests
// owners submit once their site is locked (see /admin/website-setup and
// WebsiteChangeRequestPanel). Approve/reject/apply are workflow states —
// there's no automation here, staff make the actual change through the
// normal admin tools (or by editing the club directly) and then mark it.
import { useCallback, useEffect, useState } from "react";
import {
  Palette, Loader2, ChevronLeft, ChevronRight, Clock, CheckCircle2,
  XCircle, Wrench, Building2, X,
} from "lucide-react";

type Status = "PENDING" | "APPROVED" | "REJECTED" | "APPLIED";

interface ChangeRequest {
  id: string;
  description: string;
  status: Status;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  club: { id: string; name: string; slug: string };
  requester: { name: string; email: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const STATUS_META: Record<Status, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  PENDING: { label: "En attente", icon: Clock, color: "text-amber-600", bg: "bg-amber-500/10" },
  APPROVED: { label: "Approuvée", icon: CheckCircle2, color: "text-blue-600", bg: "bg-blue-500/10" },
  REJECTED: { label: "Refusée", icon: XCircle, color: "text-red-600", bg: "bg-red-500/10" },
  APPLIED: { label: "Appliquée", icon: Wrench, color: "text-emerald-600", bg: "bg-emerald-500/10" },
};

const TABS: { label: string; value: Status | "" }[] = [
  { label: "En attente", value: "PENDING" },
  { label: "Approuvées", value: "APPROVED" },
  { label: "Refusées", value: "REJECTED" },
  { label: "Appliquées", value: "APPLIED" },
  { label: "Toutes", value: "" },
];

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return `il y a ${Math.floor(diff / 86400)} j`;
}

export default function PlatformWebsiteRequestsPage() {
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [countByStatus, setCountByStatus] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<Status | "">("PENDING");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<{ id: string; action: "approve" | "reject" | "apply" } | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (p = page, s = status) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (s) params.set("status", s);
      const res = await fetch(`/api/platform/website-requests?${params}`);
      if (res.ok) {
        const json = await res.json();
        setRequests(json.requests);
        setPagination(json.pagination);
        setCountByStatus(json.countByStatus ?? {});
      }
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => { setPage(1); }, [status]);
  useEffect(() => { load(page, status); }, [page, status, load]);

  const submitReview = async () => {
    if (!reviewing) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/platform/website-requests/${reviewing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: reviewing.action, note }),
      });
      if (res.ok) {
        setReviewing(null);
        setNote("");
        load(page, status);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div>
        <h1 className="text-3xl font-bold text-primary flex items-center gap-2">
          <Palette size={28} className="text-emerald-500" />
          Demandes de changement de site
        </h1>
        <p className="text-muted mt-1">Demandes soumises par les propriétaires dont le site est verrouillé.</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatus(tab.value)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              status === tab.value ? "bg-[var(--primary)] text-white" : "bg-muted/30 text-muted hover:bg-muted/50"
            }`}
          >
            {tab.label}
            {tab.value && countByStatus[tab.value] !== undefined && (
              <span className="text-[10px] opacity-80">({countByStatus[tab.value]})</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
        </div>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted py-10 text-center">Aucune demande dans cette catégorie.</p>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => {
            const meta = STATUS_META[r.status];
            const StatusIcon = meta.icon;
            return (
              <li key={r.id} className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <Building2 size={14} />
                    <span className="font-semibold text-primary">{r.club.name}</span>
                    <span className="text-xs">· {r.requester?.name ?? "propriétaire"}</span>
                    <span className="text-xs">· {timeAgo(r.createdAt)}</span>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${meta.bg} ${meta.color}`}>
                    <StatusIcon size={12} /> {meta.label}
                  </span>
                </div>
                <p className="text-sm text-primary whitespace-pre-wrap mb-3">{r.description}</p>
                {r.reviewNote && (
                  <p className="text-xs text-muted border-t border-border pt-2 mb-3">Note : {r.reviewNote}</p>
                )}
                {r.status === "PENDING" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setReviewing({ id: r.id, action: "approve" })}
                      className="px-3.5 py-1.5 rounded-lg bg-blue-500/10 text-blue-600 text-xs font-semibold hover:bg-blue-500/20"
                    >
                      Approuver
                    </button>
                    <button
                      onClick={() => setReviewing({ id: r.id, action: "reject" })}
                      className="px-3.5 py-1.5 rounded-lg bg-red-500/10 text-red-600 text-xs font-semibold hover:bg-red-500/20"
                    >
                      Refuser
                    </button>
                  </div>
                )}
                {r.status === "APPROVED" && (
                  <button
                    onClick={() => setReviewing({ id: r.id, action: "apply" })}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 text-xs font-semibold hover:bg-emerald-500/20"
                  >
                    Marquer comme appliquée
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-2 rounded-lg border border-border disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-muted">Page {pagination.page} / {pagination.totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={page >= pagination.totalPages}
            className="p-2 rounded-lg border border-border disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Review note modal */}
      {reviewing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-primary">
                {reviewing.action === "approve" && "Approuver la demande"}
                {reviewing.action === "reject" && "Refuser la demande"}
                {reviewing.action === "apply" && "Marquer comme appliquée"}
              </h3>
              <button onClick={() => setReviewing(null)} className="text-muted hover:text-primary">
                <X size={18} />
              </button>
            </div>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note pour le propriétaire (optionnel)"
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setReviewing(null)}
                className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted/20"
              >
                Annuler
              </button>
              <button
                onClick={submitReview}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
