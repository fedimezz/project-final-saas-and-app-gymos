"use client";

import { useState } from "react";
import { AlertTriangle, Trash2, Loader2, X, Eye, EyeOff } from "lucide-react";

interface Props {
  onDelete: (password: string) => Promise<{ success: boolean; error?: string }>;
}

export default function DangerZoneCard({ onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const canSubmit = password.length > 0 && confirmText === "SUPPRIMER";

  const handleDelete = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    const result = await onDelete(password);

    if (!result.success) {
      setError(result.error || "Une erreur est survenue");
      setLoading(false);
    }
    // On success, the parent handles redirect — no need to reset state.
  };

  const handleClose = () => {
    setOpen(false);
    setPassword("");
    setConfirmText("");
    setError(null);
  };

  return (
    <div className="bg-card border border-danger/30 rounded-2xl p-6">
      <h3 className="font-semibold text-danger mb-1 flex items-center gap-2">
        <AlertTriangle size={18} />
        Zone dangereuse
      </h3>
      <p className="text-sm text-muted mb-4">
        La suppression de votre compte est irréversible. Toutes vos données (réservations,
        abonnements, historique) seront définitivement effacées.
      </p>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-danger border border-danger/30 rounded-xl hover:bg-danger/10 transition-colors"
        >
          <Trash2 size={15} />
          Supprimer mon compte
        </button>
      ) : (
        <div className="space-y-4 p-4 bg-danger/5 border border-danger/20 rounded-xl">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-sm">
              <AlertTriangle size={15} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-primary mb-1.5">
              Confirmez votre mot de passe
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-card border border-border text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-danger/30 transition pr-10"
                placeholder="Votre mot de passe"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-primary mb-1.5">
              Tapez <span className="font-mono font-bold">SUPPRIMER</span> pour confirmer
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-card border border-border text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-danger/30 transition"
              placeholder="SUPPRIMER"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleClose}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-border rounded-xl text-muted hover:bg-muted transition-colors font-medium"
            >
              <X size={15} />
              Annuler
            </button>
            <button
              onClick={handleDelete}
              disabled={!canSubmit || loading}
              className="flex-1 flex items-center justify-center gap-2 bg-danger text-white py-2.5 rounded-xl font-medium hover:bg-danger/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Supprimer définitivement
            </button>
          </div>
        </div>
      )}
    </div>
  );
}