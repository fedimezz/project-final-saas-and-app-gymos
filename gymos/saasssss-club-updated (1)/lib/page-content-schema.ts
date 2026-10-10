export interface ContentField {
  key: string; // unique within the page — referenced in the page component via t(key, fallback) or img(key, fallback)
  label: string; // shown to the Owner in the admin editor
  type: "text" | "textarea" | "image" | "gallery"; // "gallery" = an owner-managed list of photos (add/remove/reorder), read via list(key, fallbackArray)
  defaultValue: string; // shown as placeholder in the editor and used as the live fallback if the Owner hasn't set it. For "gallery" fields: JSON.stringify(string[]) of the current hardcoded photos.
}

export interface PageContentDef {
  pageKey: string;
  label: string;
  fields: ContentField[];
  previewPath: string; // public URL for this page, shown in the admin editor's live preview
}

// Max photos an owner can keep in one "gallery" field. Enforced in the editor UI
// AND server-side in PUT /api/admin/page-content.
export const MAX_GALLERY_IMAGES = 12;

// To make a new piece of text or a photo owner-editable on any page:
//   1. Add a field entry here.
//   2. In the page component, call useEditableContent("<pageKey>") and
//      replace the hardcoded text with t("<key>", "<current hardcoded text>")
//      (or <img> src with img("<key>", "<current hardcoded src>")).
// That's it — the admin editor at /admin/content picks it up automatically.
export const PAGE_CONTENT_SCHEMA: PageContentDef[] = [
  {
    pageKey: "home",
    label: "Accueil — présentation",
    previewPath: "/",
    fields: [
      { key: "introTitle", label: "Titre — présentation du club", type: "text", defaultValue: "" },
      {
        key: "introText",
        label: "Texte — présentation du club",
        type: "textarea",
        defaultValue: "",
      },
      // Photo areas that sit BESIDE/BELOW the hero. The hero's 3D dumbbell is a
      // fixed design element and is intentionally not configurable.
      { key: "introImage", label: "Photo — présentation du club", type: "image", defaultValue: "" },
      { key: "homeGallery", label: "Photos — accueil", type: "gallery", defaultValue: "[]" },
    ],
  },
  {
    pageKey: "actualites",
    label: "Actualités",
    previewPath: "/actualites",
    fields: [
      { key: "heroImage", label: "Photo d'en-tête", type: "image", defaultValue: "" },
      { key: "heroTitle", label: "Titre", type: "text", defaultValue: "Restez informés" },
      {
        key: "heroSubtitle",
        label: "Sous-titre",
        type: "text",
        defaultValue: "Retrouvez toutes les dernières nouvelles, événements et annonces du club",
      },
    ],
  },
  {
    pageKey: "gallery",
    label: "Galerie",
    previewPath: "/gallery",
    fields: [
      { key: "heroTitle", label: "Titre", type: "text", defaultValue: "Gallery" },
      { key: "heroImage", label: "Photo de couverture", type: "image", defaultValue: "" },
      {
        key: "galleryFitness",
        label: "Photos — Fitness",
        type: "gallery",
        defaultValue: "[]",
      },
      {
        key: "galleryPadel",
        label: "Photos — Padel",
        type: "gallery",
        defaultValue: "[]",
      },
      {
        key: "galleryPool",
        label: "Photos — Piscine",
        type: "gallery",
        defaultValue: "[]",
      },
    ],
  },
  {
    pageKey: "coaching",
    label: "Coaching",
    previewPath: "/coaching",
    fields: [
      { key: "heroImage", label: "Photo d'en-tête", type: "image", defaultValue: "" },
      { key: "heroTitle", label: "Titre", type: "text", defaultValue: "Un coaching sur-mesure" },
      {
        key: "heroSubtitle",
        label: "Sous-titre",
        type: "textarea",
        defaultValue: "Nos coachs certifiés vous accompagnent vers vos objectifs, à votre rythme, avec un suivi personnalisé.",
      },
      { key: "card1Image", label: "Photo — carte 1", type: "image", defaultValue: "" },
      { key: "card1Title", label: "Titre — carte 1", type: "text", defaultValue: "Coaching individuel" },
      {
        key: "card1Text",
        label: "Texte — carte 1",
        type: "textarea",
        defaultValue: "Un programme 100% personnalisé, un suivi hebdomadaire et un coach dédié à vos objectifs.",
      },
      { key: "card2Image", label: "Photo — carte 2", type: "image", defaultValue: "" },
      { key: "card2Title", label: "Titre — carte 2", type: "text", defaultValue: "Coaching en petit groupe" },
      {
        key: "card2Text",
        label: "Texte — carte 2",
        type: "textarea",
        defaultValue: "L'énergie du collectif, l'attention en plus — des séances en groupes de 4 à 6 personnes maximum.",
      },
      { key: "card3Image", label: "Photo — carte 3", type: "image", defaultValue: "" },
      { key: "card3Title", label: "Titre — carte 3", type: "text", defaultValue: "Préparation sportive" },
      {
        key: "card3Text",
        label: "Texte — carte 3",
        type: "textarea",
        defaultValue: "Une préparation physique ciblée pour la compétition, la remise en forme ou un objectif précis.",
      },
      { key: "ctaLabel", label: "Texte du bouton", type: "text", defaultValue: "Réserver une séance découverte" },
    ],
  },
  {
    pageKey: "offres",
    label: "Offres",
    previewPath: "/offres",
    fields: [
      { key: "heroImage", label: "Photo d'en-tête", type: "image", defaultValue: "" },
      { key: "heroTitle", label: "Titre", type: "text", defaultValue: "Nos offres d'adhésion" },
      {
        key: "heroSubtitle",
        label: "Sous-titre",
        type: "textarea",
        defaultValue: "Un abonnement pour chaque besoin, sans engagement caché.",
      },
      { key: "plan1Name", label: "Nom — offre 1", type: "text", defaultValue: "Essentiel" },
      { key: "plan1Price", label: "Prix — offre 1", type: "text", defaultValue: "49 DT / mois" },
      { key: "plan1Text", label: "Description — offre 1", type: "textarea", defaultValue: "Accès illimité à la salle et aux cours collectifs." },
      { key: "plan2Name", label: "Nom — offre 2", type: "text", defaultValue: "Premium" },
      { key: "plan2Price", label: "Prix — offre 2", type: "text", defaultValue: "89 DT / mois" },
      { key: "plan2Text", label: "Description — offre 2", type: "textarea", defaultValue: "Essentiel + piscine, sauna et 2 séances de coaching par mois." },
      { key: "plan3Name", label: "Nom — offre 3", type: "text", defaultValue: "Famille" },
      { key: "plan3Price", label: "Prix — offre 3", type: "text", defaultValue: "149 DT / mois" },
      { key: "plan3Text", label: "Description — offre 3", type: "textarea", defaultValue: "Premium pour 2 adultes + accès enfants inclus." },
      { key: "ctaLabel", label: "Texte du bouton", type: "text", defaultValue: "Choisir cette offre" },
    ],
  },
];
