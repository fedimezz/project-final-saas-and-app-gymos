"use client";

import { useState } from "react";
import { Lock, Save, AlertCircle, Loader2, Eye, EyeOff, Key, CheckCircle } from "lucide-react";

interface Props {
  onSave: (currentPassword: string, newPassword: string) => Promise<boolean>;
}

export default function ProfilePasswordCard({ onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mismatch = newPassword && confirmPassword && newPassword !== confirmPassword;
  const isWeak = newPassword.length > 0 && newPassword.length < 6;
  const isValid = newPassword.length >= 6;
  
  const canSubmit =
    !saving &&
    currentPassword.length >= 6 &&
    isValid &&
    confirmPassword &&
    newPassword === confirmPassword;

  const handleSave = async () => {
    if (!currentPassword) {
      setError("Veuillez entrer votre mot de passe actuel");
      return;
    }
    if (!newPassword) {
      setError("Veuillez entrer un nouveau mot de passe");
      return;
    }
    if (newPassword.length < 6) {
      setError("Le nouveau mot de passe doit faire au moins 6 caractères");
      return;
    }
    if (mismatch) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }
    
    setError(null);
    setSaving(true);
    try {
      const result = await onSave(currentPassword, newPassword);
      if (result) {
        setSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => {
          setSuccess(false);
          setOpen(false);
        }, 2000);
      }
    } catch {
      setError("Une erreur est survenue");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(false);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canSubmit) {
      handleSave();
    }
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const getPasswordStrength = (password: string) => {
    if (password.length === 0) return { label: "", color: "", width: "0%" };
    if (password.length < 6) return { label: "Faible", color: "bg-danger", width: "33%" };
    if (password.length < 10) return { label: "Moyen", color: "bg-warning", width: "66%" };
    return { label: "Fort", color: "bg-success", width: "100%" };
  };

  const strength = getPasswordStrength(newPassword);

  return (
    <div className="bg-card border border-border rounded-2xl p-6 transition-all hover:shadow-md">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-primary flex items-center gap-2">
          <Key size={18} className="text-primary" />
          Sécurité & Mot de passe
        </h3>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 text-sm text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Lock size={15} />
            Modifier
          </button>
        )}
      </div>

      {!open ? (
        <div className="flex items-center justify-between p-4 bg-muted rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
              <Lock size={18} className="text-success" />
            </div>
            <div>
              <p className="text-sm font-medium text-primary">Mot de passe sécurisé</p>
              <p className="text-xs text-muted">Dernière modification récente</p>
            </div>
          </div>
          <span className="text-xs px-3 py-1 bg-success/10 text-success rounded-full font-medium">
            ✅ Sécurisé
          </span>
        </div>
      ) : (
        <div className="space-y-4" onKeyDown={handleKeyDown}>
          {/* Success message */}
          {success && (
            <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-xl text-success text-sm animate-fade-in">
              <CheckCircle size={16} className="flex-shrink-0" />
              Mot de passe mis à jour avec succès
            </div>
          )}

          {/* Error message */}
          {error && !success && (
            <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-sm animate-fade-in">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Current password */}
          <div>
            <label className="block text-sm font-medium text-primary mb-1.5">
              Mot de passe actuel <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <input
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setError(null);
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 transition pr-10"
                placeholder="Entrez votre mot de passe actuel"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
                aria-label={showCurrentPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {!currentPassword && (
              <p className="text-xs text-muted mt-1">Requis pour modifier le mot de passe</p>
            )}
          </div>

          {/* New password */}
          <div>
            <label className="block text-sm font-medium text-primary mb-1.5">
              Nouveau mot de passe <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setError(null);
                }}
                className={`w-full px-4 py-2.5 rounded-xl bg-muted border text-primary placeholder:text-muted focus:outline-none focus:ring-2 transition pr-10 ${
                  isWeak && newPassword.length > 0
                    ? "border-danger focus:ring-danger/30"
                    : newPassword.length >= 6
                    ? "border-success focus:ring-success/30"
                    : "border-border focus:ring-primary/30"
                }`}
                placeholder="Entrez un nouveau mot de passe"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
                aria-label={showNewPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            
            {/* Password strength indicator */}
            {newPassword.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${strength.color} transition-all duration-300 rounded-full`}
                      style={{ width: strength.width }}
                    />
                  </div>
                  <span className={`text-xs font-medium min-w-[40px] text-right ${
                    strength.label === "Faible" ? "text-danger" :
                    strength.label === "Moyen" ? "text-warning" :
                    strength.label === "Fort" ? "text-success" :
                    "text-muted"
                  }`}>
                    {strength.label}
                  </span>
                </div>
                {isWeak && (
                  <p className="text-xs text-danger flex items-center gap-1 animate-fade-in">
                    <AlertCircle size={12} />
                    Minimum 6 caractères requis
                  </p>
                )}
                {newPassword.length >= 10 && (
                  <p className="text-xs text-success flex items-center gap-1 animate-fade-in">
                    <CheckCircle size={12} />
                    Mot de passe fort
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div>
            <label className="block text-sm font-medium text-primary mb-1.5">
              Confirmer le nouveau mot de passe <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError(null);
                }}
                className={`w-full px-4 py-2.5 rounded-xl bg-muted border text-primary placeholder:text-muted focus:outline-none focus:ring-2 transition pr-10 ${
                  mismatch
                    ? "border-danger focus:ring-danger/30"
                    : confirmPassword && !mismatch && confirmPassword.length > 0
                    ? "border-success focus:ring-success/30"
                    : "border-border focus:ring-primary/30"
                }`}
                placeholder="Confirmez le nouveau mot de passe"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
                aria-label={showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {mismatch && (
              <p className="text-xs text-danger mt-1 flex items-center gap-1 animate-fade-in">
                <AlertCircle size={12} />
                Les mots de passe ne correspondent pas
              </p>
            )}
            {confirmPassword && !mismatch && confirmPassword.length > 0 && newPassword.length > 0 && (
              <p className="text-xs text-success mt-1 flex items-center gap-1 animate-fade-in">
                <CheckCircle size={12} />
                Les mots de passe correspondent
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleCancel}
              className="flex-1 px-4 py-2.5 border border-border rounded-xl text-muted hover:bg-muted transition-colors font-medium"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={!canSubmit || saving}
              className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? "Enregistrement..." : "Mettre à jour"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}