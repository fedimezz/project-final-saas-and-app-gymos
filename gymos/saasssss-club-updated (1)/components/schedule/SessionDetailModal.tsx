"use client";

import { useState } from "react";
import {
  X,
  Clock,
  Users,
  MapPin,
  User,
  Loader2,
  CheckCircle,
  AlertCircle,
  CalendarDays,
} from "lucide-react";
import { ACTIVITY_LABELS } from "./ActivityFilter";
import type { ScheduleSession } from "./SessionCard";

const DAY_LABELS: Record<string, string> = {
  MONDAY: "Lundi",
  TUESDAY: "Mardi",
  WEDNESDAY: "Mercredi",
  THURSDAY: "Jeudi",
  FRIDAY: "Vendredi",
  SATURDAY: "Samedi",
  SUNDAY: "Dimanche",
};

interface Props {
  session: ScheduleSession;
  onClose: () => void;
  onBook: (sessionId: string) => Promise<boolean>;
  onCancel: (sessionId: string) => Promise<boolean>;
}

export default function SessionDetailModal({ session, onClose, onBook, onCancel }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const ok = session.isBookedByUser
        ? await onCancel(session.id)
        : await onBook(session.id);

      if (ok) {
        setSuccess(true);
        setTimeout(() => onClose(), 1200);
      } else {
        setError(
          session.isBookedByUser
            ? "Impossible d'annuler cette réservation"
            : "Impossible de réserver cette session"
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
              {ACTIVITY_LABELS[session.activity] ?? session.activity}
            </span>
            <h2 className="text-xl font-bold text-primary mt-2">{session.coach}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Success */}
        {success && (
          <div className="mb-4 flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-xl text-success text-sm animate-fade-in">
            <CheckCircle size={16} className="flex-shrink-0" />
            {session.isBookedByUser ? "Réservation annulée" : "Session réservée avec succès"}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 flex items-center gap-2 p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-sm animate-fade-in">
            <AlertCircle size={16} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Details */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-3 text-sm">
            <CalendarDays size={16} className="text-muted flex-shrink-0" />
            <span className="text-primary">{DAY_LABELS[session.day] ?? session.day}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Clock size={16} className="text-muted flex-shrink-0" />
            <span className="text-primary">
              {session.startTime} – {session.endTime}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <MapPin size={16} className="text-muted flex-shrink-0" />
            <span className="text-primary">{session.location}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <User size={16} className="text-muted flex-shrink-0" />
            <span className="text-primary">Coach {session.coach}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Users size={16} className={session.isFull ? "text-danger" : "text-muted"} />
            <span className={session.isFull ? "text-danger font-medium" : "text-primary"}>
              {session.isFull
                ? "Session complète"
                : `${session.spotsLeft} place${session.spotsLeft > 1 ? "s" : ""} disponible${
                    session.spotsLeft > 1 ? "s" : ""
                  } sur ${session.capacity}`}
            </span>
          </div>
          {session.description && (
            <p className="text-sm text-muted pt-2 border-t border-border">
              {session.description}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-border rounded-xl text-muted hover:bg-muted transition-colors font-medium"
          >
            Fermer
          </button>
          {!success && (session.isBookedByUser || !session.isFull) && (
            <button
              onClick={handleConfirm}
              disabled={loading}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-60 ${
                session.isBookedByUser
                  ? "bg-danger text-white hover:bg-danger/90"
                  : "bg-primary text-white hover:bg-primary-dark"
              }`}
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : session.isBookedByUser ? (
                "Annuler la réservation"
              ) : (
                "Confirmer la réservation"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}