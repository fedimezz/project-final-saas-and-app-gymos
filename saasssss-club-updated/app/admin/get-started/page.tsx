"use client";
// /admin/get-started — the first screen an owner sees right after paying for their club.
// Three ways to build the website:
//   1. PRO     — paid "Installation professionnelle": the platform team builds it for you
//                (price set by the platform in service_prices, shown here, never hardcoded).
//   2. WIZARD  — free guided setup (theme, colors, pages, publish).
//   3. MANUAL  — go straight to the dashboard and edit everything by hand.
// The choice is saved on the club (GymSettings.websiteSetupMode) by
// POST /api/admin/website-setup { action: "choose", mode }.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Loader2, Sparkles, SlidersHorizontal, CheckCircle2, AlertCircle } from "lucide-react";
import OwnerOnly from "@/components/admin/OwnerOnly";
import { formatMembershipPrice } from "@/lib/payment-currencies";
import { SERVICE_META } from "@/lib/service-catalog";

type Mode = "PRO" | "WIZARD" | "MANUAL";
interface Price { serviceType: string; price: number; currency: string }

export default function GetStartedPage() {
  const router = useRouter();
  const [price, setPrice] = useState<Price | null>(null);
  const [pricesLoaded, setPricesLoaded] = useState(false);
  const [busy, setBusy] = useState<Mode | null>(null);
  const [error, setError] = useState("");
  const [proOpen, setProOpen] = useState(false);
  const [proDone, setProDone] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetch("/api/admin/service-request", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const p = (j?.prices as Price[] | undefined)?.find((x) => x.serviceType === "PROFESSIONAL_SETUP");
        setPrice(p ?? null);
      })
      .catch(() => {})
      .finally(() => setPricesLoaded(true));
  }, []);

  const choose = async (mode: Mode) => {
    setBusy(mode);
    setError("");
    try {
      const res = await fetch("/api/admin/website-setup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "choose", mode, ...(mode === "PRO" && notes.trim() ? { description: notes.trim() } : {}) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Impossible d'enregistrer votre choix. Réessayez.");
        return;
      }
      if (mode === "WIZARD") router.replace("/admin/website-setup?welcome=1");
      else if (mode === "MANUAL") router.replace("/admin");
      else setProDone(true);
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setBusy(null);
    }
  };

  const proPrice = price ? formatMembershipPrice(price.price, price.currency) : null;

  return (
    <OwnerOnly>
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div className="text-center space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold text-primary">Paiement confirmé — bienvenue !</h1>
          <p className="text-sm text-muted">Comment voulez-vous créer le site de votre club ?</p>
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}

        {proDone ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-3">
            <CheckCircle2 className="mx-auto text-[var(--primary)]" size={36} />
            <h2 className="font-semibold text-primary">Demande envoyée à notre équipe</h2>
            <p className="text-sm text-muted">
              Nous configurons votre club à votre place. Vous pouvez suivre l&apos;avancement dans « Services » et
              commencer à utiliser le tableau de bord en attendant.
            </p>
            <button
              onClick={() => router.replace("/admin")}
              className="px-5 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold"
            >
              Accéder au tableau de bord
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {/* 1 — Professional setup (paid) */}
            <section className="flex flex-col rounded-2xl border border-border bg-card p-5 space-y-3">
              <Briefcase className="text-[var(--primary)]" size={26} />
              <div className="flex-1 space-y-1">
                <h2 className="font-semibold text-primary">{SERVICE_META.PROFESSIONAL_SETUP.label}</h2>
                <p className="text-xs text-muted">{SERVICE_META.PROFESSIONAL_SETUP.description}</p>
                <p className="text-sm font-semibold text-primary pt-1">
                  {!pricesLoaded ? "…" : proPrice ?? "Indisponible pour le moment"}
                </p>
                <p className="text-[11px] text-muted">Facturé séparément, validé par notre équipe.</p>
              </div>
              {proOpen && (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="Vos souhaits : couleurs, horaires, activités… (facultatif)"
                  aria-label="Précisions pour l'installation professionnelle"
                  className="w-full bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm"
                />
              )}
              {!proOpen ? (
                <button
                  disabled={!price || busy !== null}
                  onClick={() => setProOpen(true)}
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold disabled:opacity-50"
                >
                  Choisir
                </button>
              ) : (
                <button
                  disabled={busy !== null}
                  onClick={() => choose("PRO")}
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {busy === "PRO" && <Loader2 size={14} className="animate-spin" />} Confirmer la demande
                </button>
              )}
            </section>

            {/* 2 — Guided wizard (free) */}
            <section className="flex flex-col rounded-2xl border border-border bg-card p-5 space-y-3">
              <Sparkles className="text-[var(--primary)]" size={26} />
              <div className="flex-1 space-y-1">
                <h2 className="font-semibold text-primary">Configuration guidée</h2>
                <p className="text-xs text-muted">
                  Un assistant pas à pas : thème, couleurs, contenus des pages, puis publication.
                </p>
                <p className="text-sm font-semibold text-primary pt-1">Gratuit</p>
              </div>
              <button
                disabled={busy !== null}
                onClick={() => choose("WIZARD")}
                className="w-full px-4 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy === "WIZARD" && <Loader2 size={14} className="animate-spin" />} Choisir
              </button>
            </section>

            {/* 3 — Manual */}
            <section className="flex flex-col rounded-2xl border border-border bg-card p-5 space-y-3">
              <SlidersHorizontal className="text-[var(--primary)]" size={26} />
              <div className="flex-1 space-y-1">
                <h2 className="font-semibold text-primary">Manuel</h2>
                <p className="text-xs text-muted">
                  Accédez directement au tableau de bord et configurez tout vous-même : réglages, pages, coachs, planning.
                </p>
                <p className="text-sm font-semibold text-primary pt-1">Gratuit</p>
              </div>
              <button
                disabled={busy !== null}
                onClick={() => choose("MANUAL")}
                className="w-full px-4 py-2.5 rounded-xl border border-border text-primary text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-muted/30"
              >
                {busy === "MANUAL" && <Loader2 size={14} className="animate-spin" />} Choisir
              </button>
            </section>
          </div>
        )}
      </div>
    </OwnerOnly>
  );
}
