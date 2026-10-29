"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, ChevronDown, ChevronUp, Trash2, CheckCircle, Archive, RefreshCw, X, Save, CalendarDays, Edit, Users, AlertTriangle, BarChart2 } from "lucide-react";

const DAYS = ["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"];
const DAY_LABELS: Record<string,string> = {
  MONDAY:"Lundi", TUESDAY:"Mardi", WEDNESDAY:"Mercredi",
  THURSDAY:"Jeudi", FRIDAY:"Vendredi", SATURDAY:"Samedi", SUNDAY:"Dimanche",
};
const ACTIVITIES = [
  "BODYBUILDING","FITNESS","CARDIO","CROSSFIT","YOGA",
  "PILATES","BOXE","MMA","AQUAGYM","PADEL","ZUMBA","SPINNING",
];
const ACTIVITY_LABELS: Record<string,string> = {
  BODYBUILDING:"Musculation", FITNESS:"Fitness", CARDIO:"Cardio",
  CROSSFIT:"CrossFit", YOGA:"Yoga", PILATES:"Pilates",
  BOXE:"Boxe", MMA:"MMA", AQUAGYM:"Aquagym",
  PADEL:"Padel", ZUMBA:"Zumba", SPINNING:"Spinning",
};
const ACTIVITY_COLORS: Record<string,string> = {
  BODYBUILDING:"bg-orange-500/15 text-orange-700 dark:text-orange-400",
  FITNESS:"bg-blue-500/15 text-blue-700 dark:text-blue-400",
  CARDIO:"bg-red-500/15 text-red-700 dark:text-red-400",
  CROSSFIT:"bg-amber-500/15 text-amber-700 dark:text-amber-400",
  YOGA:"bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  PILATES:"bg-teal-500/15 text-teal-700 dark:text-teal-400",
  BOXE:"bg-rose-500/15 text-rose-700 dark:text-rose-400",
  MMA:"bg-rose-600/15 text-rose-800 dark:text-rose-400",
  AQUAGYM:"bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
  PADEL:"bg-lime-500/15 text-lime-700 dark:text-lime-400",
  ZUMBA:"bg-pink-500/15 text-pink-700 dark:text-pink-400",
  SPINNING:"bg-violet-500/15 text-violet-700 dark:text-violet-400",
};

interface Session {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  activity: string;
  coach: string;
  coachId: string | null;
  capacity: number;
  currentBookings: number;
  location: string;
  description: string | null;
}

interface WeeklyPlan {
  id: string;
  weekStart: string;
  weekEnd: string;
  isActive: boolean;
  isArchived: boolean;
  sessions: Session[];
  _count: { sessions: number };
}

const EMPTY_SESSION = {
  day: "MONDAY", startTime: "08:00", endTime: "09:00",
  activity: "FITNESS", coach: "", coachId: "", capacity: "20",
  location: "Salle principale", description: "",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fillRate(currentBookings: number, capacity: number) {
  return capacity > 0 ? Math.min(currentBookings / capacity, 1) : 0;
}

function fillColor(pct: number) {
  if (pct >= 1) return "bg-red-500";
  if (pct >= 0.8) return "bg-amber-500";
  if (pct >= 0.5) return "bg-emerald-500";
  return "bg-emerald-400";
}

function fillTextColor(pct: number) {
  if (pct >= 1) return "text-red-500";
  if (pct >= 0.8) return "text-amber-500";
  return "text-emerald-500";
}

function planFillRate(plan: WeeklyPlan) {
  const totalCap = plan.sessions.reduce((s, x) => s + x.capacity, 0);
  const totalBook = plan.sessions.reduce((s, x) => s + x.currentBookings, 0);
  return totalCap > 0 ? totalBook / totalCap : 0;
}

function planTotalBookings(plan: WeeklyPlan) {
  return plan.sessions.reduce((s, x) => s + x.currentBookings, 0);
}

function planTotalCapacity(plan: WeeklyPlan) {
  return plan.sessions.reduce((s, x) => s + x.capacity, 0);
}

// ─── MiniBar: compact capacity bar for session rows ─────────────────────────

function MiniBar({ currentBookings, capacity }: { currentBookings: number; capacity: number }) {
  const pct = fillRate(currentBookings, capacity);
  const spotsLeft = Math.max(0, capacity - currentBookings);
  return (
    <div className="flex items-center gap-2 min-w-[120px]" title={`${spotsLeft} place${spotsLeft === 1 ? "" : "s"} restante${spotsLeft === 1 ? "" : "s"}`}>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${fillColor(pct)}`} style={{ width: `${pct * 100}%` }} />
      </div>
      <span className={`text-[11px] font-semibold whitespace-nowrap ${fillTextColor(pct)}`}>
        {currentBookings}/{capacity}
      </span>
    </div>
  );
}

// ─── CapacityBlock: full capacity widget for the modal ───────────────────────

function CapacityBlock({ currentBookings, capacity }: { currentBookings: number; capacity: number }) {
  const pct = fillRate(currentBookings, capacity);
  const spotsLeft = Math.max(0, capacity - currentBookings);
  return (
    <div className="bg-muted/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-primary flex items-center gap-1.5">
          <Users size={14} />
          Remplissage
        </span>
        <span className={`font-bold ${fillTextColor(pct)}`}>
          {Math.round(pct * 100)}%
          {pct >= 1 && " — Complet"}
          {pct >= 0.8 && pct < 1 && " — Presque complet"}
        </span>
      </div>
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${fillColor(pct)}`} style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="flex justify-between text-xs text-muted">
        <span>{currentBookings} inscrit{currentBookings !== 1 ? "s" : ""}</span>
        <span>{spotsLeft} place{spotsLeft !== 1 ? "s" : ""} libre{spotsLeft !== 1 ? "s" : ""}</span>
        <span>{capacity} max</span>
      </div>
      {capacity <= 20 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {Array.from({ length: capacity }).map((_, i) => (
            <div
              key={i}
              className={`w-5 h-5 rounded-md ${i < currentBookings ? fillColor(pct) : "bg-muted"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PlanStats: summary row shown inside expanded plan ────────────────────────

function PlanStats({ plan }: { plan: WeeklyPlan }) {
  const rate = planFillRate(plan);
  const totalBook = planTotalBookings(plan);
  const totalCap = planTotalCapacity(plan);
  const fullSessions = plan.sessions.filter((s) => s.currentBookings >= s.capacity).length;

  return (
    <div className="grid grid-cols-3 gap-3 mt-4 mb-1">
      <div className="bg-muted/50 rounded-xl p-3 text-center">
        <p className="text-xs text-muted mb-0.5">Inscriptions</p>
        <p className="text-lg font-bold text-primary">{totalBook}<span className="text-sm font-normal text-muted">/{totalCap}</span></p>
      </div>
      <div className="bg-muted/50 rounded-xl p-3 text-center">
        <p className="text-xs text-muted mb-0.5">Taux moyen</p>
        <p className={`text-lg font-bold ${fillTextColor(rate)}`}>{Math.round(rate * 100)}%</p>
      </div>
      <div className="bg-muted/50 rounded-xl p-3 text-center">
        <p className="text-xs text-muted mb-0.5">Sessions pleines</p>
        <p className={`text-lg font-bold ${fullSessions > 0 ? "text-red-500" : "text-emerald-500"}`}>
          {fullSessions}/{plan.sessions.length}
        </p>
      </div>
    </div>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg border text-sm font-medium animate-fade-in max-w-sm
      ${type === "success" ? "bg-card border-green-500/30 text-green-600 dark:text-green-400" : "bg-card border-red-500/30 text-red-600 dark:text-red-400"}`}>
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100"><X size={14} /></button>
    </div>
  );
}

// ─── Session Form ─────────────────────────────────────────────────────────────

type SessionFormData = typeof EMPTY_SESSION;

function SessionForm({
  form, setForm, onSave, onCancel, saving, title, coaches,
}: {
  form: SessionFormData;
  setForm: React.Dispatch<React.SetStateAction<SessionFormData>>;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
  coaches: { id: string; name: string }[];
}) {
  const cap = Number(form.capacity) || 0;
  const capWarning = cap < 1 ? "La capacité doit être ≥ 1" : cap > 200 ? "Capacité très élevée, vérifiez la valeur" : null;

  return (
    <div className="mt-4 p-5 bg-muted/40 border border-border rounded-2xl space-y-4">
      <p className="font-bold text-primary">{title}</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Jour</label>
          <select value={form.day} onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-card border border-border text-primary text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30">
            {DAYS.map((d) => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Activité</label>
          <select value={form.activity} onChange={(e) => setForm((f) => ({ ...f, activity: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-card border border-border text-primary text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30">
            {ACTIVITIES.map((a) => <option key={a} value={a}>{ACTIVITY_LABELS[a]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Début</label>
          <input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-card border border-border text-primary text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Fin</label>
          <input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-card border border-border text-primary text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Coach <span className="text-red-500">*</span></label>
          <select
            value={
              form.coachId === "__other__" || (coaches.length === 0)
                ? "__other__"
                : form.coachId && coaches.some((c) => c.id === form.coachId) ? form.coachId : ""
            }
            onChange={(e) => {
              const val = e.target.value;
              if (val === "__other__") {
                setForm((f) => ({ ...f, coachId: "__other__", coach: "" }));
              } else if (val === "") {
                setForm((f) => ({ ...f, coachId: "", coach: "" }));
              } else {
                const picked = coaches.find((c) => c.id === val);
                setForm((f) => ({ ...f, coachId: val, coach: picked?.name ?? f.coach }));
              }
            }}
            className="w-full px-3 py-2 rounded-lg bg-card border border-border text-primary text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
          >
            <option value="">— Choisir un coach —</option>
            {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__other__">Autre (nom libre)…</option>
          </select>
          {(form.coachId === "__other__" || coaches.length === 0) && (
            <>
              <input
                type="text"
                placeholder="Nom du coach"
                value={form.coach}
                onChange={(e) => setForm((f) => ({ ...f, coach: e.target.value }))}
                className="w-full mt-2 px-3 py-2 rounded-lg bg-card border border-border text-primary placeholder:text-muted text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
              />
              <p className="mt-1 text-[11px] text-muted">
                Un nom identique à un coach du club est relié automatiquement à son profil et à son espace coach.
              </p>
            </>
          )}
        </div>

        {/* Capacity field — enhanced with live preview */}
        <div>
          <label className="block text-xs font-medium text-muted mb-1 flex items-center gap-1">
            <Users size={11} />
            Capacité max <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min={1}
            max={500}
            value={form.capacity}
            onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
            className={`w-full px-3 py-2 rounded-lg bg-card border text-primary text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30
              ${capWarning && cap > 0 ? "border-amber-400" : "border-border"}`}
          />
          {capWarning && <p className="text-[11px] text-amber-500 mt-1">{capWarning}</p>}
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-medium text-muted mb-1">Salle / Lieu</label>
          <input type="text" placeholder="Salle principale" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-card border border-border text-primary placeholder:text-muted text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-muted mb-1">Description (optionnel)</label>
          <textarea
            rows={2}
            placeholder="Ex: Circuit training intensif, niveau intermédiaire à avancé."
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-card border border-border text-primary placeholder:text-muted text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 resize-none"
          />
        </div>
      </div>

      {/* Live capacity preview */}
      {cap >= 1 && (
        <div className="bg-card rounded-xl border border-border p-3">
          <p className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">Aperçu capacité</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-muted" />
            <span className="text-xs text-muted">0/{cap} — Session vide</span>
          </div>
          {cap <= 30 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {Array.from({ length: Math.min(cap, 30) }).map((_, i) => (
                <div key={i} className="w-4 h-4 rounded bg-muted" />
              ))}
              {cap > 30 && <span className="text-xs text-muted">…</span>}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel}
          className="flex-1 py-2.5 border border-border rounded-xl text-muted hover:bg-muted transition-colors text-sm font-medium">
          Annuler
        </button>
        <button onClick={onSave} disabled={saving || cap < 1}
          className="flex-1 flex items-center justify-center gap-2 bg-[var(--primary)] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-60">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

// ─── Session Row ──────────────────────────────────────────────────────────────

function SessionRow({
  session,
  onEdit,
  onDelete,
  isEditing,
}: {
  session: Session;
  onEdit: () => void;
  onDelete: () => void;
  isEditing: boolean;
}) {
  const pct = fillRate(session.currentBookings, session.capacity);
  const isFull = session.currentBookings >= session.capacity;
  const isAlmostFull = pct >= 0.8 && !isFull;
  const activityClass = ACTIVITY_COLORS[session.activity] ?? "bg-[var(--primary)]/10 text-[var(--primary)]";

  return (
    <div className={`group flex items-center gap-3 px-3 py-3 rounded-xl transition-colors hover:bg-muted/50 ${isEditing ? "bg-[var(--primary)]/5 ring-1 ring-[var(--primary)]/20" : ""}`}>
      {/* Activity badge */}
      <span className={`flex-shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${activityClass}`}>
        {ACTIVITY_LABELS[session.activity] ?? session.activity}
      </span>

      {/* Main info */}
      <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-primary truncate max-w-[120px]">{session.coach}</span>
        <span className="text-xs text-muted whitespace-nowrap">{session.startTime}–{session.endTime}</span>
        <span className="text-xs text-muted hidden sm:block truncate max-w-[80px]">{session.location}</span>
      </div>

      {/* Capacity bar */}
      <div className="flex-shrink-0 flex items-center gap-2">
        {isFull && (
          <span className="text-[10px] font-bold text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded-full whitespace-nowrap">Complet</span>
        )}
        {isAlmostFull && (
          <span className="hidden sm:flex items-center gap-0.5 text-[10px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full whitespace-nowrap">
            <AlertTriangle size={9} />
            Presque plein
          </span>
        )}
        <MiniBar currentBookings={session.currentBookings} capacity={session.capacity} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
        <button onClick={onEdit}
          className={`p-1.5 rounded-lg transition-colors ${isEditing ? "bg-[var(--primary)]/20 text-[var(--primary)]" : "text-[var(--primary)] hover:bg-[var(--primary)]/10"}`}
          title="Modifier">
          <Edit size={13} />
        </button>
        <button onClick={onDelete}
          className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
          title="Supprimer">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────


// Returns the ISO monday and sunday for a given week offset from today.
// offset=0 → current week, offset=1 → next week, etc.
function getWeekDates(offset: number): { weekStart: string; weekEnd: string; label: string } {
  const today = new Date();
  const jsDay = today.getDay(); // 0=Sun..6=Sat, local calendar day
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;

  // Build Monday as a UTC-anchored Date from today's *local* calendar
  // components, then do all further math in UTC. The previous version
  // computed midnight in local time and called toISOString(), which
  // converts to UTC — for any timezone ahead of UTC (e.g. Tunis, UTC+1)
  // local midnight Monday becomes UTC Sunday 23:00, silently sending the
  // wrong day as weekStart while the label still read "Monday". Backend
  // session-date math (lib/session-date.ts) is UTC-based, so the frontend
  // needs to match it exactly.
  const monday = new Date(Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + diffToMonday + offset * 7
  ));
  const sunday = new Date(Date.UTC(
    monday.getUTCFullYear(),
    monday.getUTCMonth(),
    monday.getUTCDate() + 6
  ));

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const label = monday.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" })
    + " – "
    + sunday.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return { weekStart: fmt(monday), weekEnd: fmt(sunday), label };
}

export default function AdminSchedulePage() {
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [showNewSession, setShowNewSession] = useState<string | null>(null);
  const [editSession, setEditSession] = useState<Session | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deletePlanTarget, setDeletePlanTarget] = useState<WeeklyPlan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState(false);
  const [deleteSessionTarget, setDeleteSessionTarget] = useState<Session | null>(null);
  const [deletingSession, setDeletingSession] = useState(false);
  const [coaches, setCoaches] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/admin/coaches", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setCoaches((data.coaches ?? []).filter((c: { isActive: boolean }) => c.isActive)))
      .catch(() => {});
  }, []);

  // weekOffset: 0 = this week, 1 = next week, etc.
  const [planForm, setPlanForm] = useState({ weekOffset: 0, isActive: false });
  const [savingPlan, setSavingPlan] = useState(false);
  const [newSessionForm, setNewSessionForm] = useState<SessionFormData>({ ...EMPTY_SESSION });
  const [editSessionForm, setEditSessionForm] = useState<SessionFormData>({ ...EMPTY_SESSION });
  const [savingSession, setSavingSession] = useState(false);

  const showToast = (m: string, t: "success" | "error") => setToast({ message: m, type: t });

  // Safely parse a fetch Response as JSON. Handles empty bodies (e.g. 204s,
  // or a server that errors out before writing a JSON payload) without
  // throwing "Unexpected end of JSON input".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic parser for this page's various API response shapes; downstream call sites access fields directly (json?.plans, json?.error, etc.) without narrowing.
  const safeJson = async (res: Response): Promise<any> => {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/schedule", {
        credentials: "include",
      });
      const json = await safeJson(res);
      if (res.ok) {
        setPlans(json?.plans ?? []);
      } else {
        showToast(json?.error || `Erreur ${res.status} — réponse vide du serveur`, "error");
      }
    } catch {
      showToast("Erreur serveur lors du chargement", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const handlePlanAction = async (planId: string, action: "activate" | "archive") => {
    setActionLoading(planId + action);
    try {
      const res = await fetch(`/api/admin/schedule/plan/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      const json = await safeJson(res);
      if (res.ok) {
        showToast(action === "activate" ? "Plan activé ✓" : "Plan archivé", "success");
        fetchPlans();
      } else {
        showToast(json?.error || `Erreur ${res.status} — réponse vide du serveur`, "error");
      }
    } catch {
      showToast("Erreur serveur", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteSession = async () => {
    if (!deleteSessionTarget) return;
    setDeletingSession(true);
    try {
      const res = await fetch(`/api/admin/sessions/${deleteSessionTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await safeJson(res);
      if (res.ok) {
        const notifiedCount = json?.notifiedCount ?? 0;
        showToast(
          notifiedCount > 0
            ? `Session supprimée · ${notifiedCount} membre${notifiedCount > 1 ? "s" : ""} prévenu${notifiedCount > 1 ? "s" : ""}`
            : "Session supprimée",
          "success"
        );
        setDeleteSessionTarget(null);
        fetchPlans();
      } else {
        showToast(json?.error || `Erreur ${res.status} lors de la suppression`, "error");
      }
    } catch {
      showToast("Erreur serveur", "error");
    } finally {
      setDeletingSession(false);
    }
  };

  const handleDeletePlan = async () => {
    if (!deletePlanTarget) return;
    setDeletingPlan(true);
    try {
      const res = await fetch(`/api/admin/schedule/plan/${deletePlanTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await safeJson(res);
      if (res.ok) {
        const notifiedCount = json?.notifiedCount ?? 0;
        showToast(
          notifiedCount > 0
            ? `Planning supprimé · ${notifiedCount} membre${notifiedCount > 1 ? "s" : ""} prévenu${notifiedCount > 1 ? "s" : ""}`
            : "Planning supprimé",
          "success"
        );
        setDeletePlanTarget(null);
        fetchPlans();
      } else {
        showToast(json?.error || `Erreur ${res.status} lors de la suppression`, "error");
      }
    } catch {
      showToast("Erreur serveur", "error");
    } finally {
      setDeletingPlan(false);
    }
  };

  const handleCreatePlan = async () => {
    const { weekStart, weekEnd } = getWeekDates(planForm.weekOffset);
    setSavingPlan(true);
    try {
      const res = await fetch("/api/admin/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ weekStart, weekEnd, isActive: planForm.isActive }),
      });
      const json = await safeJson(res);
      if (res.ok) {
        showToast("Planning créé", "success");
        setShowNewPlan(false);
        setPlanForm({ weekOffset: 0, isActive: false });
        fetchPlans();
      } else {
        showToast(json?.error || `Erreur ${res.status} — réponse vide du serveur`, "error");
      }
    } catch {
      showToast("Erreur serveur lors de la création", "error");
    } finally {
      setSavingPlan(false);
    }
  };

  const handleCreateSession = async (planId: string) => {
    if (!newSessionForm.coachId.replace("__other__", "") && !newSessionForm.coach.trim()) { showToast("Choisissez un coach", "error"); return; }
    if (Number(newSessionForm.capacity) < 1) { showToast("La capacité doit être ≥ 1", "error"); return; }
    setSavingSession(true);
    try {
      const res = await fetch(`/api/admin/schedule/${planId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...newSessionForm, coachId: newSessionForm.coachId === "__other__" ? "" : newSessionForm.coachId, capacity: Number(newSessionForm.capacity) }),
      });
      const json = await safeJson(res);
      if (res.ok) {
        showToast("Session ajoutée", "success");
        setShowNewSession(null);
        setNewSessionForm({ ...EMPTY_SESSION });
        fetchPlans();
      } else {
        showToast(json?.error || `Erreur ${res.status} — réponse vide du serveur`, "error");
      }
    } catch {
      showToast("Erreur serveur", "error");
    } finally {
      setSavingSession(false);
    }
  };

  const openEditSession = (s: Session) => {
    setEditSession(s);
    setShowNewSession(null);
    setEditSessionForm({
      day: s.day, startTime: s.startTime, endTime: s.endTime,
      activity: s.activity, coach: s.coach, coachId: s.coachId || (s.coach ? "__other__" : ""), capacity: String(s.capacity),
      location: s.location, description: s.description || "",
    });
  };

  const handleEditSession = async () => {
    if (!editSession) return;
    if (!editSessionForm.coachId.replace("__other__", "") && !editSessionForm.coach.trim()) { showToast("Choisissez un coach", "error"); return; }
    if (Number(editSessionForm.capacity) < 1) { showToast("La capacité doit être ≥ 1", "error"); return; }

    // Warn if reducing capacity below current bookings
    if (Number(editSessionForm.capacity) < editSession.currentBookings) {
      showToast(`Capacité inférieure aux inscriptions actuelles (${editSession.currentBookings})`, "error");
      return;
    }

    setSavingSession(true);
    try {
      const res = await fetch(`/api/admin/sessions/${editSession.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...editSessionForm, coachId: editSessionForm.coachId === "__other__" ? "" : editSessionForm.coachId, capacity: Number(editSessionForm.capacity) }),
      });
      const json = await safeJson(res);
      if (res.ok) {
        showToast("Session modifiée", "success");
        setEditSession(null);
        fetchPlans();
      } else {
        showToast(json?.error || `Erreur ${res.status} — réponse vide du serveur`, "error");
      }
    } catch {
      showToast("Erreur serveur", "error");
    } finally {
      setSavingSession(false);
    }
  };

  const formatWeek = (plan: WeeklyPlan) => {
    // timeZone: "UTC" keeps this in sync with how weekStart/weekEnd are
    // stored and computed (see getWeekDates above) — without it, a
    // timezone ahead of UTC would display one day earlier than the real
    // week boundary.
    const s = new Date(plan.weekStart).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
    const e = new Date(plan.weekEnd).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    return `${s} – ${e}`;
  };

  // Global stats
  const activePlan = plans.find((p) => p.isActive);
  const globalRate = activePlan ? planFillRate(activePlan) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={44} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">Planning</h1>
          <p className="text-muted mt-1">{plans.length} semaine{plans.length !== 1 ? "s" : ""} configurée{plans.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchPlans} className="p-2.5 rounded-xl bg-muted hover:bg-muted/70 transition-colors">
            <RefreshCw size={17} className="text-muted" />
          </button>
          <button onClick={() => setShowNewPlan(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-[var(--primary)] text-white rounded-xl hover:bg-[var(--primary-dark)] transition-colors font-semibold text-sm">
            <Plus size={17} />
            Nouvelle semaine
          </button>
        </div>
      </div>

      {/* Active plan quick stats */}
      {activePlan && (
        <div className="bg-card border border-[var(--primary)]/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 size={16} className="text-[var(--primary)]" />
            <p className="text-sm font-bold text-primary">Semaine active — {formatWeek(activePlan)}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{activePlan._count.sessions}</p>
              <p className="text-xs text-muted">Sessions</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{planTotalBookings(activePlan)}</p>
              <p className="text-xs text-muted">Inscriptions</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${fillTextColor(globalRate ?? 0)}`}>{Math.round((globalRate ?? 0) * 100)}%</p>
              <p className="text-xs text-muted">Taux de remplissage</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${activePlan.sessions.filter(s => s.currentBookings >= s.capacity).length > 0 ? "text-red-500" : "text-emerald-500"}`}>
                {activePlan.sessions.filter(s => s.currentBookings >= s.capacity).length}
              </p>
              <p className="text-xs text-muted">Session{activePlan.sessions.filter(s => s.currentBookings >= s.capacity).length !== 1 ? "s" : ""} pleine{activePlan.sessions.filter(s => s.currentBookings >= s.capacity).length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          {/* Global fill bar */}
          <div className="mt-3">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${fillColor(globalRate ?? 0)}`}
                style={{ width: `${(globalRate ?? 0) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-muted mt-1">
              <span>{planTotalBookings(activePlan)} inscrits</span>
              <span>{planTotalCapacity(activePlan)} places</span>
            </div>
          </div>
        </div>
      )}

      {/* Plans list */}
      {plans.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <CalendarDays size={28} className="text-muted" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-primary">Aucun planning configuré</p>
            <p className="text-sm text-muted mt-1">Créez votre première semaine de planning.</p>
          </div>
          <button onClick={() => setShowNewPlan(true)}
            className="px-6 py-2.5 bg-[var(--primary)] text-white rounded-xl hover:bg-[var(--primary-dark)] transition-colors text-sm font-semibold">
            Créer le premier planning
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const rate = planFillRate(plan);
            const totalBook = planTotalBookings(plan);
            const totalCap = planTotalCapacity(plan);

            return (
              <div key={plan.id} className={`bg-card border rounded-2xl overflow-hidden transition-all ${plan.isActive ? "border-[var(--primary)]/40 ring-1 ring-[var(--primary)]/20" : "border-border"}`}>
                {/* Plan header */}
                <div className="flex items-center gap-3 p-4">
                  <button onClick={() => setExpanded(expanded === plan.id ? null : plan.id)}
                    className="flex-1 flex items-center gap-3 text-left min-w-0">
                    <CalendarDays size={18} className={plan.isActive ? "text-[var(--primary)] flex-shrink-0" : "text-muted flex-shrink-0"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-primary text-sm">{formatWeek(plan)}</p>
                        {plan.isActive && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">Actif</span>
                        )}
                        {plan.isArchived && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted">Archivé</span>
                        )}
                      </div>
                      {/* Inline capacity summary */}
                      {plan.sessions.length > 0 && (
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full ${fillColor(rate)}`} style={{ width: `${rate * 100}%` }} />
                          </div>
                          <span className={`text-[11px] font-medium ${fillTextColor(rate)}`}>
                            {totalBook}/{totalCap} — {Math.round(rate * 100)}%
                          </span>
                          <span className="text-[11px] text-muted">
                            · {plan._count.sessions} session{plan._count.sessions !== 1 ? "s" : ""}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!plan.isActive && !plan.isArchived && (
                      <button onClick={() => handlePlanAction(plan.id, "activate")} disabled={!!actionLoading}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-semibold hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                        {actionLoading === plan.id + "activate" ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                        Activer
                      </button>
                    )}
                    {!plan.isActive && (
                      <button onClick={() => handlePlanAction(plan.id, "archive")} disabled={!!actionLoading}
                        className="p-1.5 rounded-lg text-muted hover:bg-muted transition-colors disabled:opacity-50" title="Archiver">
                        {actionLoading === plan.id + "archive" ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
                      </button>
                    )}
                    {!plan.isActive && (
                      <button onClick={() => setDeletePlanTarget(plan)} disabled={!!actionLoading || deletingPlan}
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50" title="Supprimer">
                        <Trash2 size={14} />
                      </button>
                    )}
                    <button onClick={() => setExpanded(expanded === plan.id ? null : plan.id)}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted">
                      {expanded === plan.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                  </div>
                </div>

                {/* Expanded */}
                {expanded === plan.id && (
                  <div className="border-t border-border px-4 pb-4">
                    {plan.sessions.length > 0 && <PlanStats plan={plan} />}

                    {DAYS.map((day) => {
                      const daySessions = plan.sessions.filter((s) => s.day === day);
                      if (daySessions.length === 0) return null;
                      return (
                        <div key={day} className="mt-4">
                          <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-1 px-1">{DAY_LABELS[day]}</p>
                          <div>
                            {daySessions.map((s) => (
                              <div key={s.id}>
                                <SessionRow
                                  session={s}
                                  isEditing={editSession?.id === s.id}
                                  onEdit={() => editSession?.id === s.id ? setEditSession(null) : openEditSession(s)}
                                  onDelete={() => setDeleteSessionTarget(s)}
                                />
                                {editSession?.id === s.id && (
                                  <SessionForm
                                    title="Modifier la session"
                                    form={editSessionForm}
                                    setForm={setEditSessionForm}
                                    onSave={handleEditSession}
                                    onCancel={() => setEditSession(null)}
                                    saving={savingSession}
                                    coaches={coaches}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {plan.sessions.length === 0 && (
                      <p className="text-sm text-muted text-center py-8">Aucune session dans ce planning.</p>
                    )}

                    {/* Add session */}
                    {showNewSession === plan.id ? (
                      <SessionForm
                        title="Nouvelle session"
                        form={newSessionForm}
                        setForm={setNewSessionForm}
                        onSave={() => handleCreateSession(plan.id)}
                        onCancel={() => { setShowNewSession(null); setNewSessionForm({ ...EMPTY_SESSION }); }}
                        saving={savingSession}
                        coaches={coaches}
                      />
                    ) : (
                      <button
                        onClick={() => { setShowNewSession(plan.id); setEditSession(null); }}
                        className="mt-4 w-full flex items-center justify-center gap-2 py-3 border border-dashed border-border rounded-xl text-muted hover:text-primary hover:border-[var(--primary)]/50 transition-colors text-sm font-medium">
                        <Plus size={15} />
                        Ajouter une session
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New plan modal */}
      {showNewPlan && (() => {
        // Pre-generate 5 week options (this week + 4 next), filtering out
        // weeks that already have a plan so the admin can't create duplicates.
        const existingStarts = new Set(plans.map((p) => p.weekStart.slice(0, 10)));
        const weekOptions = Array.from({ length: 6 }, (_, i) => ({ offset: i, ...getWeekDates(i) }))
          .filter((w) => !existingStarts.has(w.weekStart));
        const selected = getWeekDates(planForm.weekOffset);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in" onClick={() => setShowNewPlan(false)}>
            <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-primary">Nouvelle semaine</h2>
                <button onClick={() => setShowNewPlan(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted"><X size={18} /></button>
              </div>

              {weekOptions.length === 0 ? (
                <p className="text-sm text-muted text-center py-6">Toutes les semaines à venir ont déjà un planning.</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                      Choisir la semaine
                    </label>
                    <div className="space-y-2">
                      {weekOptions.map((w) => {
                        const isSelected = planForm.weekOffset === w.offset;
                        const isThisWeek = w.offset === 0;
                        return (
                          <button
                            key={w.offset}
                            onClick={() => setPlanForm((f) => ({ ...f, weekOffset: w.offset }))}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all
                              ${isSelected
                                ? "border-[var(--primary)] bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]/30"
                                : "border-border hover:border-[var(--primary)]/40 hover:bg-muted/50"
                              }`}
                          >
                            <div>
                              <p className="text-sm font-semibold text-primary">{w.label}</p>
                              <p className="text-xs text-muted mt-0.5">Lun {w.weekStart} → Dim {w.weekEnd}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {isThisWeek && (
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                  Cette semaine
                                </span>
                              )}
                              {w.offset === 1 && (
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                  Semaine prochaine
                                </span>
                              )}
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors
                                ${isSelected ? "border-[var(--primary)] bg-[var(--primary)]" : "border-border"}`}>
                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Selected week summary */}
                  <div className="bg-muted/50 rounded-xl px-4 py-3 flex items-center gap-3">
                    <CalendarDays size={16} className="text-[var(--primary)] flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted">Semaine sélectionnée</p>
                      <p className="text-sm font-semibold text-primary">{selected.label}</p>
                    </div>
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <div onClick={() => setPlanForm((f) => ({ ...f, isActive: !f.isActive }))}
                      className={`w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 ${planForm.isActive ? "bg-[var(--primary)]" : "bg-muted"}`}>
                      <span className={`block w-4 h-4 bg-white rounded-full shadow mt-1 transition-transform ${planForm.isActive ? "translate-x-6" : "translate-x-1"}`} />
                    </div>
                    <span className="text-sm font-medium text-primary">Activer immédiatement</span>
                  </label>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowNewPlan(false)} className="flex-1 py-2.5 border border-border rounded-xl text-muted hover:bg-muted transition-colors font-medium text-sm">Annuler</button>
                {weekOptions.length > 0 && (
                  <button onClick={handleCreatePlan} disabled={savingPlan}
                    className="flex-1 flex items-center justify-center gap-2 bg-[var(--primary)] text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-60">
                    {savingPlan ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    {savingPlan ? "Création..." : "Créer"}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete session confirmation */}
      {deleteSessionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-fade-in" onClick={() => !deletingSession && setDeleteSessionTarget(null)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-primary mb-2">Supprimer cette session ?</h3>
            <p className="text-sm text-muted mb-3">
              <span className="font-semibold text-primary">{ACTIVITY_LABELS[deleteSessionTarget.activity]}</span> avec {deleteSessionTarget.coach} — {deleteSessionTarget.startTime}–{deleteSessionTarget.endTime}
            </p>
            {deleteSessionTarget.currentBookings > 0 && (
              <div className="mb-4">
                <CapacityBlock currentBookings={deleteSessionTarget.currentBookings} capacity={deleteSessionTarget.capacity} />
                <p className="text-sm text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 mt-3 flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  {deleteSessionTarget.currentBookings} membre{deleteSessionTarget.currentBookings !== 1 ? "s" : ""} inscrit{deleteSessionTarget.currentBookings !== 1 ? "s" : ""} — ils recevront une notification d&apos;annulation.
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setDeleteSessionTarget(null)} disabled={deletingSession}
                className="flex-1 py-2.5 rounded-xl border border-border text-primary hover:bg-muted transition-colors text-sm font-medium disabled:opacity-50">
                Annuler
              </button>
              <button onClick={handleDeleteSession} disabled={deletingSession}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors text-sm font-semibold disabled:opacity-60">
                {deletingSession ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete plan confirmation */}
      {deletePlanTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-fade-in" onClick={() => !deletingPlan && setDeletePlanTarget(null)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-primary mb-2">Supprimer ce planning ?</h3>
            <p className="text-sm text-muted mb-3">
              La semaine du <span className="font-medium text-primary">{formatWeek(deletePlanTarget)}</span> et ses {deletePlanTarget._count.sessions} session{deletePlanTarget._count.sessions !== 1 ? "s" : ""} seront supprimées définitivement.
            </p>
            {planTotalBookings(deletePlanTarget) > 0 && (
              <div className="mb-4 space-y-2">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full ${fillColor(planFillRate(deletePlanTarget))}`}
                    style={{ width: `${planFillRate(deletePlanTarget) * 100}%` }} />
                </div>
                <p className="text-sm text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  {planTotalBookings(deletePlanTarget)} réservation{planTotalBookings(deletePlanTarget) !== 1 ? "s" : ""} active{planTotalBookings(deletePlanTarget) !== 1 ? "s" : ""} — les membres seront notifiés.
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setDeletePlanTarget(null)} disabled={deletingPlan}
                className="flex-1 py-2.5 rounded-xl border border-border text-primary hover:bg-muted transition-colors text-sm font-medium disabled:opacity-50">
                Annuler
              </button>
              <button onClick={handleDeletePlan} disabled={deletingPlan}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors text-sm font-semibold disabled:opacity-60">
                {deletingPlan ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}