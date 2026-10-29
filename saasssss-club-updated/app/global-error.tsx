"use client";

import { useEffect } from "react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    // Log to console in dev; wire up your error service here when ready
    if (process.env.NODE_ENV !== "production") {
      console.error("[GlobalError]", error);
    }
    // To add Sentry later:
    // 1. npm install @sentry/nextjs
    // 2. npx @sentry/wizard@latest -i nextjs
    // 3. Replace the console.error above with:
    //    import * as Sentry from "@sentry/nextjs";
    //    Sentry.captureException(error);
  }, [error]);

  return (
      <html>
      <body className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <div className="max-w-md space-y-4 px-6 text-center">
        <h1 className="text-2xl font-black">Une erreur est survenue</h1>
        <p className="text-sm text-slate-400">
          Notre équipe a été notifiée automatiquement.{" "}
          {error.digest ? (
              <span className="font-mono text-xs text-slate-500">
                #{error.digest}
              </span>
          ) : null}
        </p>
        <button
            onClick={reset}
            className="rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-extrabold text-slate-950"
        >
          Réessayer
        </button>
      </div>
      </body>
      </html>
  );
}