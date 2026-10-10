"use client";

import { useRef, useState } from "react";
import { User, Shield, Calendar, Camera, Activity, Mail, Loader2 } from "lucide-react";
import Image from "next/image";

interface Props {
  name: string;
  email: string;
  avatar: string | null;
  role: "MEMBER" | "ADMIN" | "OWNER";
  createdAt: string;
  attendanceCount: number;
  bookingCount: number;
  onAvatarChange?: (avatarDataUrl: string) => Promise<boolean>;
}

const roleColors: Record<Props["role"], { bg: string; text: string; label: string }> = {
  MEMBER: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", label: "Membre" },
  ADMIN: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", label: "Administrateur" },
  OWNER: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", label: "Propriétaire" },
};

export default function ProfileAvatar({
                                        name,
                                        email,
                                        avatar,
                                        role,
                                        createdAt,
                                        attendanceCount,
                                        bookingCount,
                                        onAvatarChange,
                                      }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const roleInfo = roleColors[role];

  const handleImageError = () => setImageError(true);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !onAvatarChange) return;

    if (!file.type.startsWith("image/")) {
      setUploadError("Veuillez sélectionner une image.");
      event.target.value = "";
      return;
    }

    const MAX_MB = 10;
    if (file.size > MAX_MB * 1024 * 1024) {
      setUploadError(`L'image dépasse ${MAX_MB}MB.`);
      event.target.value = "";
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // Step 1 — try the Cloudinary upload endpoint
      let avatarValue: string | null = null;

      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        if (uploadData?.url) {
          avatarValue = uploadData.url; // Cloudinary URL
        }
      }

      // Step 2 — fallback: read as base64 data URL (stored directly in DB)
      // This path is used when Cloudinary isn't configured (CLOUDINARY_* env
      // vars missing). The profile API accepts data:image/... strings too.
      if (!avatarValue) {
        avatarValue = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Lecture du fichier échouée"));
          reader.readAsDataURL(file);
        });
      }

      const ok = await onAvatarChange(avatarValue);
      if (!ok) {
        setUploadError("Impossible de sauvegarder la photo.");
      }
    } catch {
      setUploadError("Erreur lors du téléversement.");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  return (
      <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center text-center transition-all hover:shadow-md">
        {/* Avatar */}
        <div className="relative group">
          <div className={`relative w-24 h-24 rounded-full ${!avatar || imageError ? "bg-primary/10" : ""} flex items-center justify-center overflow-hidden ring-4 ring-border transition-all group-hover:ring-primary/20`}>
            {isUploading ? (
                <Loader2 size={24} className="animate-spin text-primary" />
            ) : avatar && !imageError ? (
                // avatar is normally a Cloudinary URL (optimizable); the raw
                // data:image/... fallback (Cloudinary not configured, see
                // app/api/dashboard/profile/route.ts) can't go through Next's
                // image optimizer, so that case renders unoptimized instead.
                <Image
                    src={avatar}
                    alt={name}
                    fill
                    sizes="96px"
                    unoptimized={avatar.startsWith("data:")}
                    className="object-cover"
                    onError={handleImageError}
                />
            ) : (
                <User size={36} className="text-primary" />
            )}
          </div>
          <button
              onClick={() => { setUploadError(null); fileInputRef.current?.click(); }}
              className="absolute bottom-0 right-0 p-1.5 bg-primary text-white rounded-full shadow-lg hover:bg-primary-dark transition-colors"
              aria-label="Changer la photo de profil"
              disabled={isUploading}
          >
            <Camera size={14} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>

        {uploadError && (
            <p className="mt-2 text-xs text-red-500">{uploadError}</p>
        )}

        <h2 className="mt-4 text-xl font-bold text-primary">{name}</h2>
        <p className="text-sm text-muted flex items-center gap-1.5 mt-0.5">
          <Mail size={14} />
          {email}
        </p>

        <span className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${roleInfo.bg} ${roleInfo.text} text-xs font-semibold`}>
        <Shield size={12} />
          {roleInfo.label}
      </span>

        <p className="mt-3 text-xs text-muted flex items-center gap-1.5">
          <Calendar size={12} />
          Membre depuis{" "}
          {new Date(createdAt).toLocaleDateString("fr-FR", {
            month: "long",
            year: "numeric",
          })}
        </p>

        {/* Stats */}
        <div className="mt-5 w-full border-t border-border pt-5">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5 justify-center">
            <Activity size={12} />
            Statistiques
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted rounded-xl p-3 transition-all hover:bg-muted/70">
              <p className="text-2xl font-bold text-primary">{attendanceCount}</p>
              <p className="text-xs text-muted mt-0.5">Présences</p>
            </div>
            <div className="bg-muted rounded-xl p-3 transition-all hover:bg-muted/70">
              <p className="text-2xl font-bold text-primary">{bookingCount}</p>
              <p className="text-xs text-muted mt-0.5">Réservations</p>
            </div>
          </div>
        </div>
      </div>
  );
}