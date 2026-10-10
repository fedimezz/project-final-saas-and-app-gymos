"use client";

import { useState, useEffect, useCallback } from "react";
import { Lock, ShieldCheck, Loader2, AlertCircle, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

// Wires the page to the already-built backend (app/api/admin/roles/route.ts
// + lib/permissions.ts + the RolePermission table) — the page used to be a
// static "coming soon" placeholder even though the API behind it was fully
// functional. OWNER always has every permission (not stored, can't be
// revoked); the owner picks which role to configure: ADMIN or COACH.

interface Permission {
  key: string;
  label: string;
  group: string;
  description: string;
  allowed: boolean;
}

type ConfigRole = "ADMIN" | "COACH";

export default function RolesPage() {
  const { userRole } = useAuth();
  const isOwner = userRole?.toUpperCase() === "OWNER";

  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [adminCount, setAdminCount] = useState(0);
  const [ownerCount, setOwnerCount] = useState(0);
  const [coachCount, setCoachCount] = useState(0);
  const [role, setRole] = useState<ConfigRole>("ADMIN");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/roles?role=${role}`, { credentials: "include" });
      const json = await res.json();
      if (res.ok) {
        setPermissions(json.permissions);
        setAdminCount(json.adminCount);
        setOwnerCount(json.ownerCount);
        setCoachCount(json.coachCount ?? 0);
      } else {
        setError(json.error || "Erreur de chargement");
      }
    } catch {
      setError("Erreur serveur");
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => { if (isOwner) fetchPermissions(); else setLoading(false); }, [isOwner, fetchPermissions]);

  const toggle = async (perm: Permission) => {
    const nextAllowed = !perm.allowed;
    setSavingKey(perm.key);
    // Optimistic update
    setPermissions((prev) => prev.map((p) => (p.key === perm.key ? { ...p, allowed: nextAllowed } : p)));
    try {
      const res = await fetch("/api/admin/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ key: perm.key, allowed: nextAllowed, role }),
      });
      if (!res.ok) {
        // Roll back on failure
        setPermissions((prev) => prev.map((p) => (p.key === perm.key ? { ...p, allowed: perm.allowed } : p)));
      } else {
        setSavedKey(perm.key);
        setTimeout(() => setSavedKey((k) => (k === perm.key ? null : k)), 1500);
      }
    } catch {
      setPermissions((prev) => prev.map((p) => (p.key === perm.key ? { ...p, allowed: perm.allowed } : p)));
    } finally {
      setSavingKey(null);
    }
  };

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
          <Lock size={28} className="text-amber-500" />
        </div>
        <div>
          <p className="font-semibold text-primary">Réservé au propriétaire</p>
          <p className="text-sm text-muted mt-1">Les rôles et permissions ne sont gérés que par le rôle OWNER.</p>
        </div>
      </div>
    );
  }

  const grouped = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.group] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-primary">Rôles &amp; permissions</h1>
        <p className="text-muted mt-1">Gestion des rôles d&apos;accès au tableau de bord.</p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">
        <h2 className="font-semibold text-primary mb-4">Rôles actuels</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { role: "OWNER", desc: "Contrôle total : personnel, finances, paramètres du club.", count: ownerCount },
            { role: "ADMIN", desc: "Opérations quotidiennes : membres, planning, paiements.", count: adminCount },
            { role: "COACH", desc: "Espace coach : ses séances, inscrits et présences.", count: coachCount },
          ].map((r) => (
            <div key={r.role} className="p-4 rounded-xl border border-border bg-muted/20">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={14} className="text-[var(--primary)]" />
                  <span className="font-bold text-sm text-primary">{r.role}</span>
                </div>
                {r.count !== null && <span className="text-xs text-muted">{r.count} compte(s)</span>}
              </div>
              <p className="text-xs text-muted">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <h2 className="font-semibold text-primary">Permissions du rôle {role}</h2>
          <div role="tablist" aria-label="Rôle à configurer" className="inline-flex rounded-xl border border-border p-1 bg-muted/20">
            {(["ADMIN", "COACH"] as ConfigRole[]).map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={role === r}
                onClick={() => setRole(r)}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  role === r ? "bg-[var(--primary)] text-white" : "text-muted hover:text-primary"
                }`}
              >
                {r === "ADMIN" ? "Admin" : "Coach"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted mb-5">
          Désactive une permission pour la retirer à tous les comptes {role} (les OWNER gardent toujours tout).
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={28} className="animate-spin text-[var(--primary)]" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <AlertCircle size={22} className="text-danger" />
            <p className="text-sm text-muted">{error}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([group, perms]) => (
              <div key={group}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{group}</h3>
                <div className="space-y-1">
                  {perms.map((p) => (
                    <div
                      key={p.key}
                      className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-primary">{p.label}</p>
                        <p className="text-xs text-muted">{p.description}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {savedKey === p.key && <Check size={14} className="text-emerald-500" />}
                        <button
                          role="switch"
                          aria-checked={p.allowed}
                          disabled={savingKey === p.key}
                          onClick={() => toggle(p)}
                          className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-60 ${
                            p.allowed ? "bg-[var(--primary)]" : "bg-muted"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                              p.allowed ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
