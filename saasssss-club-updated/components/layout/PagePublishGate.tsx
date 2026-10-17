"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useClubSettings, type PageKey } from "@/context/ClubSettingsContext";

interface Props {
  pageKey: PageKey;
  children: React.ReactNode;
}

// Wrap a public page's returned JSX with this so a page the Owner has
// switched off in "Paramètres du club" isn't reachable by direct URL,
// not just hidden from the navbar. Renders nothing while settings are
// still loading to avoid a flash of content that then disappears.
export default function PagePublishGate({ pageKey, children }: Props) {
  const { isPageEnabled, loading } = useClubSettings();
  const router = useRouter();
  const enabled = isPageEnabled(pageKey);

  useEffect(() => {
    if (!loading && !enabled) {
      router.replace("/");
    }
  }, [loading, enabled, router]);

  if (loading || !enabled) return null;
  // theme-scope: the club's theme typography/section styling applies to every public page.
  return <div className="theme-scope">{children}</div>;
}
