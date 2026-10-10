"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useClubSettings } from "@/context/ClubSettingsContext";

export default function CTASection() {
  const { isLoggedIn, userRole } = useAuth();
  const { name } = useClubSettings();

  const isAdmin =
    userRole?.toUpperCase() === "ADMIN" ||
    userRole?.toUpperCase() === "OWNER";

  // Auth-aware CTA
  const cta = (() => {
    if (!isLoggedIn) {
      return {
        heading: "Ready To Transform Your Life ?",
        subtitle: `Rejoignez ${name} et profitez d'une expérience sportive premium.`,
        label: "Become a Member",
        href: "/user/register",
      };
    }
    if (isAdmin) {
      return {
        heading: "Gérez votre club",
        subtitle: "Accédez au tableau de bord pour gérer les membres, le planning et bien plus.",
        label: "Tableau de bord",
        href: "/admin",
      };
    }
    return {
      heading: "Votre espace vous attend",
      subtitle: "Consultez votre planning, réservez vos cours et suivez vos progrès.",
      label: "Mon espace",
      href: "/dashboard",
    };
  })();

  return (
    <section
      className="
        py-28
        bg-[var(--site-deep)]
        dark:bg-neutral-900
        text-white
        border-t
        border-transparent
        dark:border-neutral-800/50
        transition-colors
        duration-300
      "
    >
      <div className="container mx-auto px-4 text-center">
        <h2
          className="
            theme-heading
            text-4xl
            md:text-5xl
          "
        >
          {cta.heading}
        </h2>

        <p
          className="
            mt-6
            max-w-2xl
            mx-auto
            text-lg
            text-gray-200
            dark:text-gray-300
            transition-colors
            duration-300
          "
        >
          {cta.subtitle}
        </p>

        <div className="mt-10">
          <Link
            href={cta.href}
            className="
              inline-block
              theme-btn
              px-8
              py-4
              font-bold
            "
          >
            {cta.label}
          </Link>
        </div>
      </div>
    </section>
  );
}