"use client";

// RootShell — conditionally renders Navbar and Footer based on route.
//
// Routes that start with /dashboard or /admin have their own layout shells
// (DashboardSidebar, AdminSidebar) so we hide the public Navbar and Footer
// there. Every other route (landing page, auth pages, etc.) gets them normally.

import { usePathname } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const SHELL_FREE_PREFIXES = ["/dashboard", "/admin", "/platform"];

export default function RootShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isShellFree = SHELL_FREE_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (isShellFree) {
    // Dashboard and admin have their own full-screen layouts — render
    // children directly with no Navbar, no Footer, no wrapper.
    return <>{children}</>;
  }

  return (
    <>
      <Navbar />
      <main>{children}</main>
      <Footer />
    </>
  );
}