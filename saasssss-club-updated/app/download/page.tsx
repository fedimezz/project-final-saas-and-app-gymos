// /download — public landing page to install the ClubX mobile app.
//  • Android: direct APK download (hosted on GitHub Releases / any HTTPS URL).
//  • iPhone without the App Store: install the website as an app (PWA), or join
//    the TestFlight beta when a link is configured.
import type { Metadata } from "next";
import Link from "next/link";
import { Smartphone, Download, Share, PlusSquare, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Télécharger l'application ClubX",
  description: "Installez ClubX sur Android (APK) ou iPhone (sans App Store).",
};

const APK_URL = process.env.NEXT_PUBLIC_ANDROID_APK_URL || "";
const TESTFLIGHT_URL = process.env.NEXT_PUBLIC_IOS_TESTFLIGHT_URL || "";
const APK_VERSION = process.env.NEXT_PUBLIC_ANDROID_APK_VERSION || "";

const card = "rounded-3xl border border-border bg-card p-6 shadow-sm space-y-4";

export default function DownloadPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-black">Télécharger l&apos;application ClubX</h1>
        <p className="text-muted">Réservez vos séances, suivez votre abonnement et recevez les notifications de votre salle.</p>
      </div>

      <section className={card} aria-labelledby="android-h">
        <h2 id="android-h" className="flex items-center gap-2 text-xl font-bold"><Smartphone size={20} /> Android</h2>
        {APK_URL ? (
          <a href={APK_URL} className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-3 font-extrabold text-slate-950">
            <Download size={18} /> Télécharger l&apos;APK {APK_VERSION && <span className="text-xs font-semibold">v{APK_VERSION}</span>}
          </a>
        ) : (
          <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700">Le téléchargement Android sera disponible très bientôt.</p>
        )}
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Ouvrez le fichier téléchargé.</li>
          <li>Si Android le demande, autorisez l&apos;installation depuis votre navigateur (« Sources inconnues »).</li>
          <li>Ouvrez ClubX et choisissez votre salle.</li>
        </ol>
        <p className="flex items-center gap-1.5 text-xs text-muted"><ShieldCheck size={14} /> Téléchargez l&apos;APK uniquement depuis cette page officielle.</p>
      </section>

      <section className={card} aria-labelledby="ios-h">
        <h2 id="ios-h" className="flex items-center gap-2 text-xl font-bold"><Smartphone size={20} /> iPhone / iPad — sans App Store</h2>
        {TESTFLIGHT_URL && (
          <a href={TESTFLIGHT_URL} className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-3 font-extrabold text-slate-950">
            <Download size={18} /> Rejoindre la bêta (TestFlight)
          </a>
        )}
        <p className="text-sm text-muted">Installez ClubX directement depuis Safari, comme une application :</p>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>Ouvrez cette page (ou le site de votre salle) dans <b>Safari</b>.</li>
          <li className="flex items-center gap-1.5">Touchez <Share size={16} className="inline" /> <b>Partager</b>.</li>
          <li className="flex items-center gap-1.5">Choisissez <PlusSquare size={16} className="inline" /> <b>Sur l&apos;écran d&apos;accueil</b>, puis <b>Ajouter</b>.</li>
        </ol>
        <p className="text-xs text-muted">L&apos;icône ClubX apparaît sur votre écran d&apos;accueil et s&apos;ouvre en plein écran.</p>
      </section>

      <p className="text-center text-sm"><Link href="/" className="underline">Retour à l&apos;accueil</Link></p>
    </main>
  );
}
