// src/components/admin/MemberStatusBadge.tsx
interface MemberStatusBadgeProps {
  isActive: boolean;
  subscriptionStatus: string | null;
}

export default function MemberStatusBadge({
  isActive,
  subscriptionStatus,
}: MemberStatusBadgeProps) {
  if (!isActive) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-danger/10 text-danger">
        Inactif
      </span>
    );
  }

  if (subscriptionStatus === "EXPIRED") {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-600">
        Abonnement expiré
      </span>
    );
  }

  if (subscriptionStatus === "PENDING") {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500">
        En attente
      </span>
    );
  }

  if (subscriptionStatus === "ACTIVE") {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500">
        Actif
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-500/10 text-muted">
      {subscriptionStatus || "Aucun"}
    </span>
  );
}