import type { MetadataRoute } from "next";

// Lets iPhone/Android users "install" the ClubX website to their home screen
// (Safari → Partager → Sur l'écran d'accueil). Works without any app store.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClubX",
    short_name: "ClubX",
    description: "Votre salle de sport dans votre poche.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f14",
    theme_color: "#0b0f14",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
