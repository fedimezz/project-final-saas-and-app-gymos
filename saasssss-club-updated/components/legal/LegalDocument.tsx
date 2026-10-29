// Shared layout for the platform's legal pages (/legal/terms, /legal/privacy). Server component.
// The publisher's identity comes from env so it can be completed without a code change:
//   LEGAL_ENTITY_NAME, LEGAL_ADDRESS, LEGAL_REGISTRATION (RNE / matricule fiscal), NEXT_PUBLIC_CONTACT_EMAIL
import Link from "next/link";
import type { ReactNode } from "react";

export const LEGAL_UPDATED = "21 octobre 2026";

export function publisher() {
  const value = (v: string | undefined) => v?.trim() || "";
  return {
    name: value(process.env.LEGAL_ENTITY_NAME) || "ClubX",
    address: value(process.env.LEGAL_ADDRESS),
    registration: value(process.env.LEGAL_REGISTRATION),
    email: value(process.env.NEXT_PUBLIC_CONTACT_EMAIL),
  };
}

export interface LegalSection { title: string; body: ReactNode }

export default function LegalDocument({ title, intro, sections }: { title: string; intro: ReactNode; sections: LegalSection[] }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 text-slate-800 dark:text-slate-200">
      <Link href="/" className="text-sm font-semibold underline">← Retour à ClubX</Link>
      <h1 className="mt-6 text-3xl font-black">{title}</h1>
      <p className="mt-1 text-xs text-slate-500">Dernière mise à jour : {LEGAL_UPDATED}</p>
      <div className="mt-6 text-sm leading-relaxed">{intro}</div>
      <nav aria-label="Sommaire" className="mt-6 rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-700">
        <ol className="list-decimal space-y-1 pl-5">
          {sections.map((s, i) => (
            <li key={i}><a href={`#s${i + 1}`} className="underline">{s.title}</a></li>
          ))}
        </ol>
      </nav>
      <div className="mt-8 space-y-8">
        {sections.map((s, i) => (
          <section key={i} id={`s${i + 1}`} className="scroll-mt-20">
            <h2 className="text-lg font-bold">{i + 1}. {s.title}</h2>
            <div className="mt-2 space-y-2 text-sm leading-relaxed">{s.body}</div>
          </section>
        ))}
      </div>
    </main>
  );
}
