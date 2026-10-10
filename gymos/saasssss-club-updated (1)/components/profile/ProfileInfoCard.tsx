"use client";

import { useState } from "react";
import {
  User,
  Mail,
  Phone,
  Shield,
  Edit3,
  Save,
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

interface Props {
  name: string;
  email: string;
  phone: string | null;
  role: "MEMBER" | "ADMIN" | "OWNER";
  onSave: (name: string, phone: string) => Promise<boolean>;
}

const roleColors: Record<Props["role"], string> = {
  MEMBER: "text-blue-600 dark:text-blue-400",
  ADMIN: "text-purple-600 dark:text-purple-400",
  OWNER: "text-amber-600 dark:text-amber-400",
};

const roleLabels: Record<Props["role"], string> = {
  MEMBER: "Membre",
  ADMIN: "Administrateur",
  OWNER: "Propriétaire",
};

function InfoRow({
  icon: Icon,
  label,
  value,
  valueClassName = "",
  editable = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  valueClassName?: string;
  editable?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-border last:border-0 group">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon size={16} className="text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{label}</p>
        <p className={`text-sm font-medium text-primary truncate ${valueClassName}`}>
          {value}
        </p>
      </div>
      {editable && (
        <span className="text-xs text-muted opacity-0 group-hover:opacity-100 transition-opacity">
          Modifiable
        </span>
      )}
    </div>
  );
}

export default function ProfileInfoCard({ name, email, phone, role, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const [editPhone, setEditPhone] = useState(phone || "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!editName.trim()) {
      setError("Le nom est requis");
      return;
    }
    
    setError(null);
    setSaving(true);
    try {
      const result = await onSave(editName, editPhone);
      if (result) {
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          setEditing(false);
        }, 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditName(name);
    setEditPhone(phone || "");
    setError(null);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && editName.trim() && !saving) {
      handleSave();
    }
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6 transition-all hover:shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-primary flex items-center gap-2">
          <User size={18} className="text-primary" />
          Informations personnelles
        </h3>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-2 text-sm text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Edit3 size={15} />
            Modifier
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 text-sm text-muted hover:bg-muted px-3 py-1.5 rounded-lg transition-colors"
            >
              <X size={15} />
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !editName.trim()}
              className="flex items-center gap-1.5 text-sm bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {saving ? "..." : "Enregistrer"}
            </button>
          </div>
        )}
      </div>

      {/* Success/Error messages */}
      {success && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-xl text-success text-sm animate-fade-in">
          <CheckCircle size={16} className="flex-shrink-0" />
          Profil mis à jour avec succès
        </div>
      )}
      
      {error && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-sm animate-fade-in">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* View mode */}
      {!editing ? (
        <>
          <InfoRow icon={User} label="Nom complet" value={name} editable />
          <InfoRow icon={Mail} label="Adresse e-mail" value={email} />
          <InfoRow 
            icon={Phone} 
            label="Téléphone" 
            value={phone || "Non renseigné"} 
            valueClassName={!phone ? "text-muted italic" : ""}
            editable
          />
          <InfoRow 
            icon={Shield} 
            label="Rôle" 
            value={roleLabels[role]} 
            valueClassName={roleColors[role]}
          />
        </>
      ) : (
        /* Edit mode */
        <div className="space-y-4" onKeyDown={handleKeyDown}>
          <div>
            <label className="block text-sm font-medium text-primary mb-1.5">
              Nom complet <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => {
                setEditName(e.target.value);
                setError(null);
              }}
              className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              placeholder="Votre nom complet"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-primary mb-1.5">
              Téléphone
            </label>
            <input
              type="tel"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              placeholder="+216 12 345 678"
            />
            <p className="text-xs text-muted mt-1">
              Format: +216 12 345 678
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1.5">
              Adresse e-mail
            </label>
            <div className="w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-muted cursor-not-allowed flex items-center justify-between">
              <span>{email}</span>
              <span className="text-xs text-muted bg-muted px-2 py-0.5 rounded">
                Non modifiable
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}