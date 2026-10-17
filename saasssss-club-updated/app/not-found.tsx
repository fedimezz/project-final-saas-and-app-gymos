import Link from "next/link";

// Also what renders for unknown paths on any tenant subdomain, so it stays
// generic rather than naming the platform.
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-4xl font-black">404</h1>
      <p className="max-w-md text-sm text-muted-foreground">Cette page n&apos;existe pas.</p>
      <Link href="/" className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white">
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
