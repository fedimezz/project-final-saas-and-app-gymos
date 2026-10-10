"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/fetch-api";
import { Loader2, Flag, Send, CheckCircle2, Clock, RotateCcw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import GeneralPreferencesCard from "@/components/settings/GeneralPreferencesCard";
import NotificationPreferencesCard from "@/components/settings/NotificationPreferencesCard";
import DangerZoneCard from "@/components/settings/DangerZoneCard";

type Language = "FR" | "EN" | "AR";
interface Preferences { language: Language; darkMode: boolean; emailNotifications: boolean; pushNotifications: boolean; smsNotifications: boolean; }
interface MyReport { id: string; subject: string; message: string; status: "PENDING" | "IN_PROGRESS" | "RESOLVED"; adminNote: string | null; createdAt: string; }
const STATUS_META: Record<MyReport["status"], { label: string; className: string; Icon: typeof Clock }> = { PENDING: { label: "Envoyé", className: "bg-amber-500/10 text-amber-600", Icon: Clock }, IN_PROGRESS: { label: "En cours de traitement", className: "bg-blue-500/10 text-blue-600", Icon: RotateCcw }, RESOLVED: { label: "Résolu", className: "bg-emerald-500/10 text-emerald-600", Icon: CheckCircle2 } };
function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) { useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]); return <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg border text-sm font-medium animate-fade-in max-w-sm ${type === "success" ? "bg-card border-green-500/30 text-green-600" : "bg-card border-red-500/30 text-red-600"}`}><span className="flex-1">{message}</span><button onClick={onClose} className="ml-2 opacity-50 hover:opacity-100" aria-label="Fermer">✕</button></div>; }

export default function MemberSettingsPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { setLang } = useLanguage();
  const { isDark, toggleTheme } = useTheme();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingTheme, setSavingTheme] = useState(false);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [savingNotif, setSavingNotif] = useState<string | null>(null);
  const [reports, setReports] = useState<MyReport[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = useCallback((message: string, type: "success" | "error") => setToast({ message, type }), []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [prefRes, reportsRes] = await Promise.all([apiFetch("/api/dashboard/settings"), apiFetch("/api/dashboard/reports")]);
      const prefJson = await prefRes.json(); const reportsJson = await reportsRes.json();
      if (prefRes.ok) setPrefs(prefJson.preferences);
      if (reportsRes.ok) setReports(reportsJson.reports);
    } catch { showToast("Erreur lors du chargement des paramètres", "error"); }
    finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const updatePrefs = async (patch: Partial<Preferences>) => {
    try {
      const res = await apiFetch("/api/dashboard/settings", { method: "PUT", body: JSON.stringify(patch) });
      const json = await res.json();
      if (res.ok) setPrefs((p) => p ? { ...p, ...patch } : p);
      else showToast(json.error || "Erreur lors de l'enregistrement", "error");
      return res.ok;
    } catch { showToast("Erreur réseau", "error"); return false; }
  };

  const handleLanguageChange = async (language: Language) => { setSavingLanguage(true); await setLang(language, { persist: false }); await updatePrefs({ language }); setSavingLanguage(false); };

  const handleThemeToggle = async () => {
    const nextDark = !isDark;
    // Update the real ThemeContext immediately. The old implementation only
    // changed the database flag, so the switch appeared to do nothing until
    // another component happened to reload the theme.
    toggleTheme();
    setSavingTheme(true);
    const ok = await updatePrefs({ darkMode: nextDark });
    if (!ok) toggleTheme();
    setSavingTheme(false);
  };

  const handleNotifToggle = async (key: "emailNotifications" | "pushNotifications" | "smsNotifications", value: boolean) => { setSavingNotif(key); await updatePrefs({ [key]: value }); setSavingNotif(null); };
  const handleDeleteAccount = async (password: string): Promise<{ success: boolean; error?: string }> => { try { const res = await apiFetch("/api/dashboard/profile", { method: "DELETE", body: JSON.stringify({ password }) }); const json = await res.json(); if (res.ok) { logout(); router.push("/"); return { success: true }; } return { success: false, error: json.error || "Erreur lors de la suppression" }; } catch { return { success: false, error: "Erreur réseau" }; } };
  const submitReport = async () => { if (!subject.trim() || !message.trim()) { showToast("Sujet et message sont requis", "error"); return; } setSubmitting(true); try { const res = await apiFetch("/api/dashboard/reports", { method: "POST", body: JSON.stringify({ subject: subject.trim(), message: message.trim() }) }); const json = await res.json(); if (res.ok) { setReports((r) => [json.report, ...r]); setSubject(""); setMessage(""); showToast("Signalement envoyé — l'équipe va le traiter.", "success"); } else showToast(json.error || "Erreur lors de l'envoi", "error"); } catch { showToast("Erreur réseau", "error"); } finally { setSubmitting(false); } };

  if (loading || !prefs) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={40} className="animate-spin text-[var(--primary)]" /></div>;
  return <div className="space-y-6 animate-fade-in">
    <div><h1 className="text-3xl font-bold text-primary">Paramètres</h1><p className="text-muted mt-1">Préférences, notifications et compte.</p></div>
    <GeneralPreferencesCard language={prefs.language} darkMode={isDark} savingLanguage={savingLanguage} savingTheme={savingTheme} onLanguageChange={handleLanguageChange} onThemeToggle={handleThemeToggle} />
    <NotificationPreferencesCard emailNotifications={prefs.emailNotifications} pushNotifications={prefs.pushNotifications} smsNotifications={prefs.smsNotifications} saving={savingNotif} onToggle={handleNotifToggle} />
    <div className="bg-card border border-border rounded-2xl p-6"><div className="flex items-center gap-2 mb-1"><Flag size={16} className="text-[var(--primary)]" /><h3 className="font-semibold text-primary">Signaler un problème</h3></div><p className="text-sm text-muted mb-4">Un souci avec votre abonnement, une réservation, l&apos;équipement ou autre chose ? L&apos;équipe le verra ici.</p><div className="space-y-3"><input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Sujet" maxLength={150} className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm" /><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Décrivez le problème…" rows={3} maxLength={3000} className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm resize-none" /><button onClick={submitReport} disabled={submitting} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold disabled:opacity-60">{submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Envoyer</button></div>{reports.length > 0 && <div className="mt-5 pt-5 border-t border-border space-y-2.5"><p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">Vos signalements</p>{reports.map((r) => { const meta = STATUS_META[r.status]; return <div key={r.id} className="p-3 rounded-xl border border-border bg-muted/10"><div className="flex items-center justify-between gap-2 mb-1"><span className="text-sm font-medium text-primary">{r.subject}</span><span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${meta.className}`}><meta.Icon size={11} /> {meta.label}</span></div><p className="text-xs text-muted">{r.message}</p>{r.adminNote && <p className="text-xs text-[var(--primary)] mt-1.5 italic">Réponse de l&apos;équipe : {r.adminNote}</p>}</div>; })}</div>}</div>
    <DangerZoneCard onDelete={handleDeleteAccount} />
    {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
  </div>;
}
