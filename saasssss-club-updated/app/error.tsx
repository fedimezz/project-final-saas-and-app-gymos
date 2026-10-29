"use client";

import { useEffect } from "react";
import Link from "next/link";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

// Route-level boundary: catches a crash in one page/section without
// blanking the whole app (that's what global-error.tsx is for — only
// triggers if the root layout itself throws).
export default function ErrorBoundary({ error, reset }: Props) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error("[ErrorBoundary]", error);
    }
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-bold">Une erreur est survenue</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Quelque chose s&apos;est mal passé lors du chargement de cette page.
        {error.digest ? (
          <span className="mt-1 block font-mono text-xs opacity-60">#{error.digest}</span>
        ) : null}
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white"
        >
          Réessayer
        </button>
        <Link href="/" className="rounded-full border px-5 py-2 text-sm font-semibold">
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
