"use client";
// "Download the ClubX app" block used in the website onboarding and in the club owner's
// getting-started page. Shows only what really exists:
//   • Android APK button        — only for a complete, attested release (see lib/app-release.ts)
//   • Google Play button         — only when ANDROID_PLAY_URL is set
//   • Install the web app (PWA)  — when the browser offers installation (Chrome/Edge/Android)
//   • always: a link to the full /download page (iPhone steps, checksum, release notes)
// The download page link comes from the server (platform domain), never from the current host.
import { useEffect, useState } from "react";
import { Download, MonitorSmartphone, Smartphone } from "lucide-react";

interface DownloadInfo {
  downloadPageUrl: string;
  apk: { url: string; version: string; sha256: string } | null;
  playStoreUrl: string | null;
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const btn = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]";

export default function DownloadAppCard({ className = "" }: { className?: string }) {
  const [info, setInfo] = useState<DownloadInfo | null>(null);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/app-download", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j) setInfo(j as DownloadInfo); })
      .catch(() => undefined);
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvent(e as InstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => { cancelled = true; window.removeEventListener("beforeinstallprompt", onPrompt); };
  }, []);

  const pageUrl = info?.downloadPageUrl || "/download";
  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice.catch(() => undefined);
    setInstallEvent(null);
  };

  return (
    <section aria-labelledby="dl-app-h" className={`space-y-3 rounded-2xl border border-border bg-card p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <Smartphone size={20} className="mt-0.5 shrink-0 text-[var(--primary)]" aria-hidden />
        <div>
          <h3 id="dl-app-h" className="text-sm font-bold text-primary">Téléchargez l&apos;application ClubX</h3>
          <p className="text-xs text-muted">Pour vous et vos membres : réservations, planning et notifications sur téléphone.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {info?.playStoreUrl && (
          <a href={info.playStoreUrl} rel="noopener" className={`${btn} bg-emerald-500 text-slate-950`}>
            <Download size={16} aria-hidden /> Google Play
          </a>
        )}
        {info?.apk && (
          <a href={info.apk.url} rel="noopener" className={`${btn} bg-emerald-500 text-slate-950`}>
            <Download size={16} aria-hidden /> Télécharger l&apos;APK <span className="text-xs font-semibold">v{info.apk.version}</span>
          </a>
        )}
        {installEvent && (
          <button type="button" onClick={() => void install()} className={`${btn} border border-border text-primary`}>
            <MonitorSmartphone size={16} aria-hidden /> Installer l&apos;application web
          </button>
        )}
        <a href={pageUrl} className={`${btn} border border-border text-primary`}>
          Toutes les options (Android, iPhone, web)
        </a>
      </div>
      {info && !info.apk && !info.playStoreUrl && (
        <p className="text-xs text-muted">Le fichier Android sera disponible très bientôt ; en attendant, installez ClubX comme application web depuis la page de téléchargement.</p>
      )}
    </section>
  );
}
