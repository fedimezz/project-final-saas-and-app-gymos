import { apiGet } from "@/api/client";

export interface PublicSettings {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  backgroundColorDark?: string | null;
  // Added later by the website (all optional: an older server simply omits them).
  themeId?: string | null;
  heroModel?: string | null;
  heroMode?: "builtin" | "custom" | "none" | null;
  heroCustomModel?: {
    url: string;
    format: "glb" | "gltf";
    byteSize: number;
    transform: unknown;
  } | null;
  hasTenant: boolean;
}

export const fetchPublicSettings = () => apiGet<PublicSettings>("/api/settings/public");
