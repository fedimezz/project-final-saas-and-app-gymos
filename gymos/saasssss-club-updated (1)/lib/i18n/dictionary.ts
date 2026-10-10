export type Lang = "FR" | "EN" | "AR";

// Add a new row here to make a new string translatable anywhere in the
// app — then call t("yourKey") from any component via useLanguage().
export const DICTIONARY: Record<string, Record<Lang, string>> = {
  navHome:        { FR: "Le Club",     EN: "Home",         AR: "الرئيسية" },
  navActivities:  { FR: "Activités",   EN: "Activities",   AR: "الأنشطة" },
  navCoaching:    { FR: "Coaching",    EN: "Coaching",      AR: "التدريب" },
  navOffers:      { FR: "Offres",      EN: "Plans",         AR: "العروض" },
  navNews:        { FR: "Actualités",  EN: "News",          AR: "الأخبار" },
  navGallery:     { FR: "Galerie",     EN: "Gallery",       AR: "معرض الصور" },
  navLogin:       { FR: "Connexion",   EN: "Login",         AR: "تسجيل الدخول" },
  navJoin:        { FR: "Rejoindre",   EN: "Join Now",      AR: "انضم الآن" },
  navLogout:      { FR: "Déconnexion", EN: "Logout",        AR: "تسجيل الخروج" },
  navDashboard:   { FR: "Tableau de bord", EN: "Dashboard",  AR: "لوحة التحكم" },
  navAdmin:       { FR: "Admin",       EN: "Admin",         AR: "الإدارة" },
  navProfile:     { FR: "Mon profil",  EN: "My Profile",    AR: "ملفي الشخصي" },
};

export function translate(lang: Lang, key: string, fallback?: string): string {
  return DICTIONARY[key]?.[lang] ?? fallback ?? key;
}
